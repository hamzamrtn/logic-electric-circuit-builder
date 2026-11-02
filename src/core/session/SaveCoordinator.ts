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
  private replacing = false;
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
  async flush(): Promise<void> {
    if (this.writing) { await this.writing; if (this.session.getSnapshot().revision > this.state.durableRevision && !['conflict', 'error', 'deleted'].includes(this.state.status)) return this.flush(); return; }
    if (this.disposed || ['conflict', 'error', 'deleted'].includes(this.state.status) || this.session.getSnapshot().revision === this.state.durableRevision) return;
    this.writing = this.drain();
    try { await this.writing; } finally { this.writing = undefined; }
  }
  private async drain() {
    while (!this.disposed && this.session.getSnapshot().revision > this.state.durableRevision && !['conflict', 'error', 'deleted'].includes(this.state.status)) {
      const { document, revision } = this.session.getSnapshot(); const content = serializeDocument(document);
      this.pendingContent = content; this.set({ ...this.state, status: 'saving', message: 'Saving…' });
      try {
        const result = await this.persistence.compareAndWrite(this.baseline, content);
        if (!result.written) { this.set({ ...this.state, status: 'conflict', message: 'File changed elsewhere. Both versions are retained.', external: result.external }); await this.persistence.recover(content, 'conflict'); break; }
        this.baseline = content;
        if (this.state.status === 'deleted' || this.state.status === 'conflict') break;
        this.set({ status: revision === this.session.getSnapshot().revision ? 'saved' : 'unsaved', message: revision === this.session.getSnapshot().revision ? 'Saved' : 'Unsaved changes', durableRevision: revision });
        try { await this.persistence.recover(content, 'autosave'); } catch { this.set({ ...this.state, message: 'Saved · recovery copy unavailable' }); }
      } catch (e) {
        if (this.state.status !== 'deleted') this.set({ ...this.state, status: 'error', message: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
        try { await this.persistence.recover(content, 'write-error'); } catch { /* Keep the failure visible and all revisions in memory. */ }
        break;
      } finally { this.pendingContent = undefined; }
    }
  }
  async externalChanged(raw: string) {
    if (raw === this.baseline || raw === this.pendingContent || this.disposed || this.state.status === 'deleted') return;
    if (this.session.getSnapshot().revision === this.state.durableRevision && !this.writing) {
      try { this.replacing = true; this.session.replaceRaw(raw); this.baseline = raw; this.set({ status: 'saved', message: 'Reloaded external version', durableRevision: this.session.getSnapshot().revision }); }
      catch (e) { this.set({ ...this.state, status: 'conflict', external: raw, message: `External file cannot be loaded: ${String(e)}` }); }
      finally { this.replacing = false; }
    } else {
      this.set({ ...this.state, status: 'conflict', external: raw, message: 'External changes conflict with your edits. Choose a version.' });
      try { await this.persistence.recover(serializeDocument(this.session.getSnapshot().document), 'conflict'); } catch { /* Versions remain in memory and original stays untouched. */ }
    }
  }
  async resolve(choice: 'local' | 'external') {
    if (this.writing) await this.writing;
    const raw = await this.persistence.read();
    if (choice === 'external') {
      await this.persistence.recover(serializeDocument(this.session.getSnapshot().document), 'before-external');
      // Parse first; an invalid external version must not unlock autosave.
      try { this.replacing = true; this.session.replaceRaw(raw); this.baseline = raw; } finally { this.replacing = false; }
      this.set({ status: 'saved', message: 'Using external version', durableRevision: this.session.getSnapshot().revision });
    } else {
      await this.persistence.recover(raw, 'external-version'); this.baseline = raw;
      this.set({ ...this.state, status: 'unsaved', message: 'Keeping local version', external: undefined }); await this.flush();
    }
  }
  async retry() { if (this.state.status === 'deleted' || this.state.status === 'conflict') return; this.set({ ...this.state, status: 'unsaved', message: 'Retrying save' }); await this.flush(); }
  deleted() { this.set({ ...this.state, status: 'deleted', message: 'File deleted. Save a recovery copy to keep these edits.' }); }
  getRecoverySnapshots() { return [...this.recovery]; }
  async dispose() { await this.flush(); this.disposed = true; this.unsubscribe(); this.listeners.clear(); }
}
