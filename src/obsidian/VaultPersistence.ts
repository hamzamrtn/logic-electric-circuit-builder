import { type App, type TFile, normalizePath } from 'obsidian';
import { type CircuitDocument, parseDocument, serializeDocument, uid } from '../core/model/document';
import { DocumentSession } from '../core/session/DocumentSession';
import { SaveCoordinator, type Persistence } from '../core/session/SaveCoordinator';
export interface Entry { session: DocumentSession; save: SaveCoordinator; file: TFile; references: number; }
export class VaultSessions {
  private entries = new Map<TFile, Entry>();
  constructor(private app: App) {}
  acquire(file: TFile, raw: string): Entry {
    const existing = this.entries.get(file);
    if (existing) { existing.references++; void existing.save.externalChanged(raw); return existing; }
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
  async release(entry: Entry) {
    entry.references = Math.max(0, entry.references - 1); await entry.save.flush();
    if (!entry.references && entry.save.getSnapshot().status === 'saved') { this.entries.delete(entry.file); await entry.save.dispose(); }
  }
  async modified(file: TFile) { const entry = this.entries.get(file); if (entry) await entry.save.externalChanged(await this.app.vault.read(file)); }
  deleted(file: TFile) { this.entries.get(file)?.save.deleted(); }
  get(file: TFile) { return this.entries.get(file); }
  async flush() { await Promise.all([...this.entries.values()].map(e => e.save.flush())); }
  async dispose() { await Promise.all([...this.entries.values()].map(async e => { await e.save.dispose(); })); this.entries.clear(); }
}
export async function createUnique(app: App, folder: string, basename: string, extension: string, content: string | ArrayBuffer): Promise<TFile> {
  const clean = basename.replace(/[\\/:*?"<>|\r\n]/g, '-').trim().slice(0, 100) || 'Circuit';
  const base = normalizePath(folder ? `${folder}/${clean}` : clean); let path = `${base}.${extension}`, i = 2;
  while (app.vault.getAbstractFileByPath(path)) path = `${base} ${i++}.${extension}`;
  return typeof content === 'string' ? app.vault.create(path, content) : app.vault.createBinary(path, content);
}
export async function createCircuit(app: App, document: CircuitDocument, folder = '') { return createUnique(app, folder, document.title, 'lecircuit', serializeDocument(document)); }
