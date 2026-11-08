import { expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';

vi.mock('obsidian', () => ({ normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '') }));
import { VaultSessions } from '../../src/obsidian/VaultPersistence';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const initial = serializeDocument(emptyDocument()), file = { path: 'Circuit.lecircuit' } as TFile;
  const files = new Map<string, { file: TFile; content: string }>([[file.path, { file, content: initial }]]), folders = new Set<string>();
  const vault = {
    getFileByPath: (path: string) => files.get(path)?.file ?? null,
    getFolderByPath: (path: string) => folders.has(path) ? { path } : null,
    getAbstractFileByPath: (path: string) => files.get(path)?.file ?? (folders.has(path) ? { path } : null),
    read: vi.fn(async (target: TFile) => { const stored = files.get(target.path); if (stored?.file !== target) throw new Error('File deleted'); return stored.content; }),
    process: vi.fn(async (target: TFile, transform: (raw: string) => string) => { const stored = files.get(target.path); if (stored?.file !== target) throw new Error('File deleted'); stored.content = transform(stored.content); return stored.content; }),
    createFolder: async (path: string) => { folders.add(path); },
    create: async (path: string, content: string) => { if (files.has(path)) throw new Error('File exists'); const created = { path } as TFile; files.set(path, { file: created, content }); return created; },
    modify: async (target: TFile, content: string) => { const stored = files.get(target.path); if (stored?.file !== target) throw new Error('File deleted'); stored.content = content; },
  };
  return { file, initial, files, vault, sessions: new VaultSessions({ vault } as unknown as App) };
}

it('shares one session across views and releases it only after the final saved view closes', async () => {
  const f = fixture(), first = f.sessions.acquire(f.file, f.initial), second = f.sessions.acquire(f.file, f.initial);
  expect(first).toBe(second); expect(first.references).toBe(2);
  first.session.edit('Rename title', doc => { doc.title = 'Shared edit'; }); await f.sessions.flush();
  expect(second.session.getSnapshot().document.title).toBe('Shared edit');
  expect(JSON.parse(f.files.get(f.file.path)!.content).title).toBe('Shared edit');
  await f.sessions.release(first); expect(f.sessions.get(f.file)).toBe(second);
  await f.sessions.release(second); expect(f.sessions.get(f.file)).toBeUndefined();
});

it('opening a second view with an older snapshot never rolls back the shared session', async () => {
  const f = fixture(), entry = f.sessions.acquire(f.file, f.initial);
  entry.session.edit('Latest edit', doc => { doc.title = 'Latest shared edit'; }); await f.sessions.flush();
  const second = f.sessions.acquire(f.file, f.initial);
  expect(second).toBe(entry); expect(second.session.getSnapshot().document.title).toBe('Latest shared edit');
  expect(JSON.parse(f.files.get(f.file.path)!.content).title).toBe('Latest shared edit');
  await f.sessions.release(second); await f.sessions.release(entry);
});

it('concurrent preview opens share a read and retain exactly one reference per caller', async () => {
  const f = fixture(), gate = deferred<string>(); f.vault.read.mockImplementationOnce(() => gate.promise);
  const first = f.sessions.acquireFile(f.file), second = f.sessions.acquireFile(f.file);
  gate.resolve(f.initial); const a = await first, b = await second;
  expect(a).toBe(b); expect(a.references).toBe(2); expect(f.vault.read).toHaveBeenCalledTimes(1);
  await f.sessions.release(a); await f.sessions.release(b); expect(f.sessions.get(f.file)).toBeUndefined();
});

it('refreshes the first preview snapshot if the vault changes before acquisition', async () => {
  const f = fixture(), gate = deferred<string>(); f.vault.read.mockImplementationOnce(() => gate.promise);
  const pending = f.sessions.acquireFile(f.file); await Promise.resolve();
  f.files.get(f.file.path)!.content = serializeDocument(emptyDocument('Latest preview'));
  await f.sessions.modified(f.file); gate.resolve(f.initial);
  const entry = await pending; expect(entry.session.getSnapshot().document.title).toBe('Latest preview');
  expect(f.vault.read).toHaveBeenCalledTimes(2); await f.sessions.release(entry);
});

it('an aborted preview does not consume a reference or cancel another pending preview', async () => {
  const f = fixture(), gate = deferred<string>(), controller = new AbortController(); f.vault.read.mockImplementationOnce(() => gate.promise);
  const first = f.sessions.acquireFile(f.file, controller.signal), second = f.sessions.acquireFile(f.file);
  controller.abort(); gate.resolve(f.initial);
  await expect(first).rejects.toThrow(/closed/); const entry = await second;
  expect(entry.references).toBe(1); expect(f.vault.read).toHaveBeenCalledTimes(1); await f.sessions.release(entry);
});

it.each(['delete', 'dispose'])('pending preview acquisition cannot revive a file after %s', async action => {
  const f = fixture(), gate = deferred<string>(); f.vault.read.mockImplementationOnce(() => gate.promise);
  const pending = f.sessions.acquireFile(f.file); await Promise.resolve();
  if (action === 'delete') { f.files.delete(f.file.path); f.sessions.deleted(f.file); }
  else await f.sessions.dispose();
  gate.resolve(f.initial); await expect(pending).rejects.toThrow(/missing|closed/);
  expect(f.sessions.get(f.file)).toBeUndefined();
});

it('a failed initial read does not leave a cached failure or orphan session', async () => {
  const f = fixture(); f.vault.read.mockRejectedValueOnce(new Error('Read failed'));
  await expect(f.sessions.acquireFile(f.file)).rejects.toThrow('Read failed'); expect(f.sessions.get(f.file)).toBeUndefined();
  const entry = await f.sessions.acquireFile(f.file); expect(entry.references).toBe(1); await f.sessions.release(entry);
});

it('does not apply an older vault read after a newer modify event has loaded', async () => {
  const f = fixture(), entry = f.sessions.acquire(f.file, f.initial), oldRead = deferred<string>();
  f.vault.read.mockImplementationOnce(() => oldRead.promise); const first = f.sessions.modified(f.file);
  const latest = serializeDocument(emptyDocument('Latest external edit')); f.files.get(f.file.path)!.content = latest;
  await f.sessions.modified(f.file); expect(entry.session.getSnapshot().document.title).toBe('Latest external edit');
  oldRead.resolve(f.initial); await first;
  expect(entry.session.getSnapshot().document.title).toBe('Latest external edit');
  expect(f.files.get(f.file.path)!.content).toBe(latest); await f.sessions.dispose();
});

it('refreshes a delayed vault read if a local save completed while it was pending', async () => {
  const f = fixture(), entry = f.sessions.acquire(f.file, f.initial), oldRead = deferred<string>();
  f.vault.read.mockImplementationOnce(() => oldRead.promise); const pending = f.sessions.modified(f.file);
  entry.session.edit('Local edit', doc => { doc.title = 'Latest local edit'; }); await f.sessions.flush();
  oldRead.resolve(f.initial); await pending;
  expect(entry.session.getSnapshot().document.title).toBe('Latest local edit');
  expect(JSON.parse(f.files.get(f.file.path)!.content).title).toBe('Latest local edit'); await f.sessions.dispose();
});

it('ignores an obsolete read failure while exposing failures of the latest read', async () => {
  const f = fixture(); f.sessions.acquire(f.file, f.initial);
  let reject!: (error: Error) => void;
  f.vault.read.mockImplementationOnce(() => new Promise<string>((_, fail) => { reject = fail; }));
  const pending = f.sessions.modified(f.file); await f.sessions.modified(f.file);
  reject(new Error('Obsolete read failed')); await expect(pending).resolves.toBeUndefined();
  f.vault.read.mockRejectedValueOnce(new Error('Latest read failed'));
  await expect(f.sessions.modified(f.file)).rejects.toThrow('Latest read failed'); await f.sessions.dispose();
});

it('a rename during a delayed write uses the current file identity and does not recreate the old path', async () => {
  const f = fixture(), entry = f.sessions.acquire(f.file, f.initial), gate = deferred<void>(), process = f.vault.process.getMockImplementation()!;
  f.vault.process.mockImplementation(async (file, transform) => { await gate.promise; return process(file, transform); });
  entry.session.edit('Delayed edit', doc => { doc.title = 'Preserved'; });
  const stored = f.files.get(f.file.path)!; f.files.delete(f.file.path); f.file.path = 'Renamed.lecircuit'; f.files.set(f.file.path, stored);
  gate.resolve(); await f.sessions.flush();
  expect(f.files.has('Circuit.lecircuit')).toBe(false); expect(JSON.parse(f.files.get(f.file.path)!.content).title).toBe('Preserved');
  expect(entry.save.getSnapshot().status).toBe('saved'); await f.sessions.dispose();
});

it('deletion during a delayed write preserves deleted status and does not recreate the file', async () => {
  const f = fixture(), entry = f.sessions.acquire(f.file, f.initial), gate = deferred<void>(), process = f.vault.process.getMockImplementation()!;
  f.vault.process.mockImplementation(async (file, transform) => { await gate.promise; return process(file, transform); });
  entry.session.edit('Delayed edit', doc => { doc.title = 'Recovery needed'; });
  f.files.delete(f.file.path); f.sessions.deleted(f.file); gate.resolve(); await f.sessions.flush();
  expect(f.files.has(f.file.path)).toBe(false); expect(entry.save.getSnapshot().status).toBe('deleted');
  expect(entry.session.getSnapshot().document.title).toBe('Recovery needed'); await f.sessions.dispose();
});
