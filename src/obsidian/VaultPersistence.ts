import { type App, type TFile, normalizePath } from 'obsidian';
import { type CircuitDocument, parseDocument, serializeDocument, uid } from '../core/model/document';
import { DocumentSession } from '../core/session/DocumentSession';
import { SaveCoordinator, type Persistence } from '../core/session/SaveCoordinator';
export interface Entry { session: DocumentSession; save: SaveCoordinator; file: TFile; references: number; }
export class VaultSessions {
  private entries = new Map<TFile, Entry>();
  private readVersions = new Map<TFile, number>();
  private opening = new Map<TFile, { read: Promise<string>; version: number; waiters: number }>();
  private disposed = false;
  constructor(private app: App) {}
  acquire(file: TFile, raw: string): Entry {
    if (this.disposed) throw new Error('Circuit sessions are closed');
    if (this.app.vault.getFileByPath(file.path) !== file) throw new Error('Circuit file is missing or changed');
    const existing = this.entries.get(file);
    if (existing) { existing.references++; return existing; }
    const document = parseDocument(raw), session = new DocumentSession(document);
    const recoveryId = uid('recovery'); let slot = 0;
    const persistence: Persistence = {
      read: async () => { if (this.app.vault.getFileByPath(file.path) !== file) throw new Error('The original file was deleted'); return this.app.vault.read(file); },
      compareAndWrite: async (expected, content) => {
        if (this.app.vault.getFileByPath(file.path) !== file) throw new Error('The file no longer exists. Save a recovery copy.');
        let external = '', written = false;
        await this.app.vault.process(file, current => {
          if (current !== expected) { external = current; return current; }
          written = true; return content;
        });
        return written ? { written: true } : { written: false, external };
      },
      recover: async (content, _reason) => {
        const folder = 'Circuit recovery';
        if (!this.app.vault.getAbstractFileByPath(folder)) { try { await this.app.vault.createFolder(folder); } catch { if (!this.app.vault.getAbstractFileByPath(folder)) throw new Error('Unable to create recovery folder'); } }
        const path = normalizePath(`${folder}/${recoveryId}-${slot++ % 3}.json`);
        const existing = this.app.vault.getFileByPath(path);
        if (existing) await this.app.vault.modify(existing, content); else await this.app.vault.create(path, content);
      },
    };
    const save = new SaveCoordinator(session, persistence, raw), entry = { session, save, file, references: 1 };
    this.entries.set(file, entry); return entry;
  }
  async acquireFile(file: TFile, signal?: AbortSignal): Promise<Entry> {
    const check = () => {
      if (this.disposed || signal?.aborted) throw new Error('Circuit view is closed');
      if (this.app.vault.getFileByPath(file.path) !== file) throw new Error('Circuit file is missing or changed');
    };
    check();
    const existing = this.entries.get(file); if (existing) { existing.references++; return existing; }
    let pending = this.opening.get(file);
    if (!pending) {
      const version = (this.readVersions.get(file) ?? 0) + 1; this.readVersions.set(file, version);
      pending = { read: Promise.resolve().then(() => this.app.vault.read(file)), version, waiters: 0 }; this.opening.set(file, pending);
    }
    pending.waiters++;
    const retry = () => { if (this.opening.get(file) === pending) this.opening.delete(file); return this.acquireFile(file, signal); };
    try {
      const raw = await pending.read; check();
      const active = this.entries.get(file); if (active) { active.references++; return active; }
      if (this.readVersions.get(file) !== pending.version) return retry();
      return this.acquire(file, raw);
    } catch (error) {
      check();
      const active = this.entries.get(file); if (active) { active.references++; return active; }
      if (this.readVersions.get(file) !== pending.version) return retry();
      throw error;
    } finally {
      pending.waiters--; if (!pending.waiters && this.opening.get(file) === pending) this.opening.delete(file);
      if (!this.entries.has(file) && !this.opening.has(file)) this.readVersions.delete(file);
    }
  }
  async release(entry: Entry) {
    entry.references = Math.max(0, entry.references - 1); await entry.save.flush();
    if (!entry.references && entry.save.getSnapshot().status === 'saved' && this.entries.get(entry.file) === entry) { this.entries.delete(entry.file); this.readVersions.delete(entry.file); await entry.save.dispose(); }
  }
  async modified(file: TFile): Promise<void> {
    if (this.disposed) return;
    const entry = this.entries.get(file); if (!entry) { if (this.opening.has(file)) this.readVersions.set(file, (this.readVersions.get(file) ?? 0) + 1); return; }
    const version = (this.readVersions.get(file) ?? 0) + 1; this.readVersions.set(file, version);
    const revision = entry.session.getSnapshot().revision;
    const current = () => this.entries.get(file) === entry && this.readVersions.get(file) === version;
    let raw: string;
    try { raw = await this.app.vault.read(file); } catch (error) { if (current()) throw error; return; }
    if (!current()) return;
    if (entry.session.getSnapshot().revision !== revision) return this.modified(file);
    await entry.save.externalChanged(raw);
  }
  deleted(file: TFile) { const entry = this.entries.get(file); if (!entry && !this.opening.has(file)) return; this.readVersions.set(file, (this.readVersions.get(file) ?? 0) + 1); entry?.save.deleted(); }
  get(file: TFile) { return this.entries.get(file); }
  async flush() { await Promise.all([...this.entries.values()].map(e => e.save.flush())); }
  async dispose() { this.disposed = true; this.readVersions.clear(); this.opening.clear(); await Promise.all([...this.entries.values()].map(async e => { await e.save.dispose(); })); this.entries.clear(); }
}
export async function createUnique(app: App, folder: string, basename: string, extension: string, content: string | ArrayBuffer): Promise<TFile> {
  const clean = basename.replace(/[\\/:*?"<>|\r\n]/g, '-').trim().slice(0, 100) || 'Circuit';
  const base = normalizePath(folder ? `${folder}/${clean}` : clean); let path = `${base}.${extension}`, i = 2;
  while (app.vault.getAbstractFileByPath(path)) path = `${base} ${i++}.${extension}`;
  return typeof content === 'string' ? app.vault.create(path, content) : app.vault.createBinary(path, content);
}
export async function createCircuit(app: App, document: CircuitDocument, folder = '') { return createUnique(app, folder, document.title, 'lecircuit', serializeDocument(document)); }
