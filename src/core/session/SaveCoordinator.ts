import { DocumentSession } from './DocumentSession';
import { serializeDocument } from '../model/document';
export type SaveState = { status: 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error' | 'deleted'; message: string; durableRevision: number; external?: string; };
export interface Persistence {
  read(): Promise<string>;
  compareAndWrite(expected: string, content: string): Promise<{ written: true } | { written: false; external: string }>;
  recover(content: string, reason: string): Promise<void>;
}
export class SaveCoordinator {
  private state: SaveState = { status: 'saved', message: 'Saved', durableRevision: 0 };
  private listeners = new Set<() => void>();
  private baseline: string;
  private writing?: Promise<void>;
  private pendingContent?: string;
  private disposed = false;
  private disposing = false;
  private resolutionEpoch = 0;
  private replacing = false;
  private restorePending = false;
  private unsubscribe: () => void;
  private recovery: string[] = [];
  constructor(readonly session: DocumentSession, private persistence: Persistence, initial: string) {
    this.baseline = initial;
    this.unsubscribe = session.subscribe(() => {
      if (this.disposed || this.replacing || ['conflict', 'deleted', 'error'].includes(this.state.status)) return;
      this.recovery.push(serializeDocument(session.getSnapshot().document)); this.recovery = this.recovery.slice(-3);
      this.set({ ...this.state, status: 'unsaved', message: 'Unsaved changes' }); void this.flush();
    });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: SaveState) { this.state = state; this.listeners.forEach(l => l()); }
  private needsWrite() { return this.restorePending || this.session.getSnapshot().revision > this.state.durableRevision; }
  async flush(): Promise<void> {
    if (this.writing) { await this.writing; if (this.needsWrite() && !['conflict', 'error', 'deleted'].includes(this.state.status)) return this.flush(); return; }
    if (this.disposed || ['conflict', 'error', 'deleted'].includes(this.state.status) || !this.needsWrite()) return;
    // Reserve the writer before publishing Saving to observers that may request another flush.
    this.writing = Promise.resolve().then(() => this.drain());
    try { await this.writing; } finally { this.writing = undefined; }
  }
  private async drain() {
    while (!this.disposed && this.needsWrite() && !['conflict', 'error', 'deleted'].includes(this.state.status)) {
      const { document, revision } = this.session.getSnapshot(); const content = serializeDocument(document);
      this.pendingContent = content; this.set({ ...this.state, status: 'saving', message: 'Saving…' });
      if (this.disposed || ['conflict', 'error', 'deleted'].includes(this.getSnapshot().status)) { this.pendingContent = undefined; break; }
      try {
        const result = await this.persistence.compareAndWrite(this.baseline, content);
        // Recovery is serialized after this point, but the original-file write is finished.
        this.pendingContent = undefined;
        if (this.disposed || this.state.status === 'deleted') break;
        if (!result.written) {
          if (this.state.status === 'conflict') break;
          this.resolutionEpoch++;
          this.set({ ...this.state, status: 'conflict', message: 'File changed elsewhere. Both versions are retained.', external: result.external });
          try { await this.persistence.recover(content, 'conflict'); }
          catch { if (this.getSnapshot().status === 'conflict') this.set({ ...this.state, message: 'File changed elsewhere. Both versions are retained in memory; recovery copy unavailable.' }); }
          break;
        }
        this.baseline = content;
        if (this.state.status === 'conflict') break;
        this.restorePending = false;
        this.set({ status: revision === this.session.getSnapshot().revision ? 'saved' : 'unsaved', message: revision === this.session.getSnapshot().revision ? 'Saved' : 'Unsaved changes', durableRevision: revision });
        try { await this.persistence.recover(content, 'autosave'); } catch {
          if (this.state.status === 'saved' && this.state.durableRevision === revision && !this.needsWrite()) this.set({ ...this.state, message: 'Saved · recovery copy unavailable' });
        }
      } catch (e) {
        if (!['deleted', 'conflict'].includes(this.state.status)) this.set({ ...this.state, status: 'error', message: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
        try { await this.persistence.recover(content, 'write-error'); } catch { /* Keep the failure visible and all revisions in memory. */ }
        break;
      } finally { this.pendingContent = undefined; }
    }
  }
  async externalChanged(raw: string) {
    if (raw === this.baseline || raw === this.pendingContent || this.disposed || this.state.status === 'deleted') return;
    if (this.state.status === 'conflict' && this.state.external === raw) return;
    const epoch = ++this.resolutionEpoch;
    if (!this.needsWrite() && this.pendingContent === undefined) {
      const durableRevision = this.session.getSnapshot().revision + 1;
      try {
        this.replacing = true; this.session.replaceRaw(raw); this.baseline = raw;
        if (this.disposed || epoch !== this.resolutionEpoch) return;
        const clean = this.session.getSnapshot().revision === durableRevision;
        this.set({ status: clean ? 'saved' : 'unsaved', message: clean ? 'Reloaded external version' : 'Unsaved changes', durableRevision });
        if (!clean) void this.flush();
      } catch (e) {
        if (!this.disposed && epoch === this.resolutionEpoch) this.set({ ...this.state, status: 'conflict', external: raw, message: `External file cannot be loaded: ${String(e)}` });
      } finally { this.replacing = false; }
    } else {
      this.set({ ...this.state, status: 'conflict', external: raw, message: 'External changes conflict with your edits. Choose a version.' });
      try { await this.persistence.recover(serializeDocument(this.session.getSnapshot().document), 'conflict'); } catch { /* Versions remain in memory and original stays untouched. */ }
    }
  }
  async resolve(choice: 'local' | 'external') {
    if (this.disposed || this.disposing || this.state.status === 'deleted') return;
    const epoch = ++this.resolutionEpoch, revision = this.session.getSnapshot().revision;
    const live = () => !this.disposed && !this.disposing && this.state.status !== 'deleted' && epoch === this.resolutionEpoch;
    const ready = () => {
      if (!live()) return false;
      if (choice === 'external' && revision !== this.session.getSnapshot().revision) throw new Error('Circuit changed while resolving the conflict. Review the versions and choose again.');
      return true;
    };
    if (this.writing) await this.writing;
    if (!ready()) return;
    if (choice === 'external') {
      await this.persistence.recover(serializeDocument(this.session.getSnapshot().document), 'before-external');
      if (!ready()) return;
      // Read after the potentially slow backup, then recheck deletion/ownership before applying.
      const raw = await this.persistence.read();
      if (!ready()) return;
      const durableRevision = this.session.getSnapshot().revision + 1;
      try { this.replacing = true; this.session.replaceRaw(raw); this.baseline = raw; this.restorePending = false; } finally { this.replacing = false; }
      if (!live()) return;
      const clean = this.session.getSnapshot().revision === durableRevision;
      this.set({ status: clean ? 'saved' : 'unsaved', message: clean ? 'Using external version' : 'Unsaved changes', durableRevision });
      if (!clean) await this.flush();
    } else {
      const raw = await this.persistence.read();
      if (!ready()) return;
      await this.persistence.recover(raw, 'external-version');
      if (!ready()) return;
      this.baseline = raw; this.restorePending = true;
      this.set({ ...this.state, status: 'unsaved', message: 'Keeping local version', external: undefined }); await this.flush();
    }
  }
  async retry() { if (this.state.status === 'deleted' || this.state.status === 'conflict') return; this.set({ ...this.state, status: 'unsaved', message: 'Retrying save' }); await this.flush(); }
  deleted() { this.resolutionEpoch++; this.set({ ...this.state, status: 'deleted', message: 'File deleted. Save a recovery copy to keep these edits.' }); }
  getRecoverySnapshots() { return [...this.recovery]; }
  async dispose() { this.disposing = true; this.resolutionEpoch++; try { await this.flush(); } finally { this.disposed = true; this.unsubscribe(); this.listeners.clear(); } }
}
