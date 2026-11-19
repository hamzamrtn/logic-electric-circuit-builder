import { expect, it, vi } from 'vitest';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { SaveCoordinator, type Persistence } from '../../src/core/session/SaveCoordinator';
import { DigitalSessions } from '../../src/core/session/DigitalSessions';
import { digitalCapabilities } from '../../src/components/definitions/digital';
import { runDigital } from '../../src/core/topology/digital';
import { clone, serializeDocument } from '../../src/core/model/document';
import { digitalFixture } from '../fixtures/digital';
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }
function fixture() {
  const session = new DocumentSession(digitalFixture()); let disk = serializeDocument(session.getSnapshot().document), writes = 0;
  const host: Persistence = { read: async () => disk, recover: async () => {}, compareAndWrite: async (expected, content) => { if (expected !== disk) return { written: false, external: disk }; disk = content; writes++; return { written: true }; } };
  return { session, host, raw: () => disk, external: (raw: string) => { disk = raw; }, writes: () => writes };
}

it('reloads a clean external circuit while only post-save recovery is pending', async () => {
  const f = fixture(), backup = deferred<void>(); let backingUp = false;
  f.host.recover = async (_content, reason) => { if (reason === 'autosave') { backingUp = true; await backup.promise; } };
  const save = new SaveCoordinator(f.session, f.host, f.raw()), sessions = new DigitalSessions(digitalCapabilities(), (r, c, s) => runDigital(r, c, s, async () => {})), consumer = sessions.acquire(f.session, async () => {});
  const offSave = save.subscribe(() => { if (['conflict', 'error', 'deleted'].includes(save.getSnapshot().status)) consumer.stop(); });
  try {
    f.session.edit('Rename', document => { document.title = 'Local'; }); await vi.waitFor(() => expect(backingUp).toBe(true));
    consumer.setInput('a', 1); consumer.setInput('b', 0); await consumer.run(); expect(consumer.getSnapshot().status).toBe('valid');
    const external = clone(f.session.getSnapshot().document); external.title = 'Remote'; const raw = serializeDocument(external); f.external(raw); await save.externalChanged(raw);
    expect(save.getSnapshot()).toMatchObject({ status: 'saved', durableRevision: f.session.getSnapshot().revision });
    expect(f.session.getSnapshot().document.title).toBe('Remote'); await vi.waitFor(() => expect(consumer.getSnapshot()).toMatchObject({ status: 'valid', active: true, result: { revision: f.session.getSnapshot().revision } }));
    backup.resolve(); await save.flush(); expect(f.raw()).toBe(raw); expect(f.writes()).toBe(1);
  } finally { backup.resolve(); offSave(); sessions.dispose(); await save.dispose(); }
});

it.each(['deleted', 'conflict'] as const)('a late backup failure cannot relabel a newer %s state as Saved', async kind => {
  const f = fixture(), backup = deferred<void>(); let backingUp = false;
  f.host.recover = async (_content, reason) => { if (reason === 'autosave') { backingUp = true; await backup.promise; } };
  const save = new SaveCoordinator(f.session, f.host, f.raw());
  try {
    f.session.edit('Rename', document => { document.title = 'Local'; }); await vi.waitFor(() => expect(backingUp).toBe(true));
    if (kind === 'deleted') save.deleted();
    else { f.session.edit('Another edit', document => { document.title = 'Unsaved'; }); const other = clone(f.session.getSnapshot().document); other.title = 'Remote'; const raw = serializeDocument(other); f.external(raw); await save.externalChanged(raw); }
    const terminal = save.getSnapshot(); expect(terminal.status).toBe(kind);
    backup.reject(new Error('Backup storage failed')); await save.flush(); expect(save.getSnapshot()).toEqual(terminal);
  } finally { backup.resolve(); await save.dispose(); }
});

it('an in-flight write rejection cannot hide an already detected external conflict', async () => {
  const f = fixture(), write = deferred<Awaited<ReturnType<Persistence['compareAndWrite']>>>(); let writing = false;
  f.host.compareAndWrite = async () => { writing = true; return write.promise; };
  const save = new SaveCoordinator(f.session, f.host, f.raw());
  try {
    f.session.edit('Rename', document => { document.title = 'Local'; }); await vi.waitFor(() => expect(writing).toBe(true));
    const other = clone(f.session.getSnapshot().document); other.title = 'Remote'; const raw = serializeDocument(other); f.external(raw); await save.externalChanged(raw);
    const conflict = save.getSnapshot(); expect(conflict).toMatchObject({ status: 'conflict', external: raw });
    write.reject(new Error('Write failed after conflict')); await save.flush(); expect(save.getSnapshot()).toEqual(conflict); expect(f.raw()).toBe(raw);
  } finally { write.resolve({ written: false, external: f.raw() }); await save.dispose(); }
});

it('serializes a reentrant flush requested by a Saving-state observer', async () => {
  const f = fixture(), gate = deferred<void>(), original = f.host.compareAndWrite; let active = 0, peak = 0, requested = false, followup: Promise<void> | undefined;
  f.host.compareAndWrite = async (expected, content) => { active++; peak = Math.max(peak, active); await gate.promise; try { return await original(expected, content); } finally { active--; } };
  const save = new SaveCoordinator(f.session, f.host, f.raw());
  const off = save.subscribe(() => { if (save.getSnapshot().status === 'saving' && !requested) { requested = true; followup = save.flush(); } });
  try {
    f.session.edit('Rename', document => { document.title = 'Saved once'; }); await vi.waitFor(() => expect(requested).toBe(true)); gate.resolve(); await save.flush(); await followup;
    expect(peak).toBe(1); expect(f.writes()).toBe(1); expect(save.getSnapshot().status).toBe('saved');
  } finally { gate.resolve(); off(); await save.dispose(); }
});

it('a late write mismatch cannot turn deletion back into a conflict', async () => {
  const f = fixture(), write = deferred<Awaited<ReturnType<Persistence['compareAndWrite']>>>(); let writing = false;
  f.host.compareAndWrite = async () => { writing = true; return write.promise; };
  const save = new SaveCoordinator(f.session, f.host, f.raw());
  f.session.edit('Rename', document => { document.title = 'Local'; }); await vi.waitFor(() => expect(writing).toBe(true));
  save.deleted(); const terminal = save.getSnapshot(); write.resolve({ written: false, external: f.raw() }); await save.flush();
  expect(save.getSnapshot()).toEqual(terminal); await save.dispose();
});

it.each(['local', 'external'] as const)('deletion during %s recovery prevents resolution and writes', async choice => {
  const f = fixture(), recovery = deferred<void>(); let held = false;
  const save = new SaveCoordinator(f.session, f.host, f.raw());
  await save.externalChanged('{invalid');
  const before = f.session.getSnapshot();
  f.host.recover = async (_content, reason) => { if (reason === (choice === 'external' ? 'before-external' : 'external-version')) { held = true; await recovery.promise; } };
  const resolving = save.resolve(choice); await vi.waitFor(() => expect(held).toBe(true));
  save.deleted(); const terminal = save.getSnapshot(); recovery.resolve(); await resolving;
  expect(save.getSnapshot()).toEqual(terminal); expect(f.session.getSnapshot()).toBe(before); expect(f.writes()).toBe(0); await save.dispose();
});

it('local edits made during external resolution are retained for a new explicit choice', async () => {
  const f = fixture(), recovery = deferred<void>(); let held = false;
  const save = new SaveCoordinator(f.session, f.host, f.raw()); await save.externalChanged('{invalid');
  f.host.recover = async (_content, reason) => { if (reason === 'before-external') { held = true; await recovery.promise; } };
  const resolving = save.resolve('external'); const failed = expect(resolving).rejects.toThrow('Circuit changed');
  await vi.waitFor(() => expect(held).toBe(true)); f.session.edit('New work', document => { document.title = 'Do not discard'; }); recovery.resolve(); await failed;
  expect(f.session.getSnapshot().document.title).toBe('Do not discard'); expect(save.getSnapshot().status).toBe('conflict'); expect(f.writes()).toBe(0); await save.dispose();
});

it('does not begin a write after a Saving observer reports deletion', async () => {
  const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.raw());
  const off = save.subscribe(() => { if (save.getSnapshot().status === 'saving') save.deleted(); });
  f.session.edit('Rename', document => { document.title = 'Do not write'; }); await save.flush();
  expect(f.writes()).toBe(0); expect(save.getSnapshot().status).toBe('deleted'); off(); await save.dispose();
});

it('clean external replacement cannot clear deletion reported by a document observer', async () => {
  const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.raw());
  const other = clone(f.session.getSnapshot().document); other.title = 'Remote'; const raw = serializeDocument(other); f.external(raw);
  const off = f.session.subscribe(() => save.deleted()); await save.externalChanged(raw);
  expect(save.getSnapshot().status).toBe('deleted'); expect(f.writes()).toBe(0); off(); await save.dispose();
});

it('does not acknowledge observer edits as already durable when loading an external file', async () => {
  const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.raw()), gate = deferred<void>(), original = f.host.compareAndWrite;
  f.host.compareAndWrite = async (expected, content) => { await gate.promise; return original(expected, content); };
  const other = clone(f.session.getSnapshot().document); other.title = 'Remote'; const raw = serializeDocument(other); f.external(raw);
  let edited = false;
  const off = f.session.subscribe(() => { if (!edited) { edited = true; f.session.edit('New local work', document => { document.title = 'Keep this edit'; }); } });
  try {
    await save.externalChanged(raw);
    expect(save.getSnapshot().durableRevision).toBe(1); expect(f.session.getSnapshot().revision).toBe(2); expect(save.getSnapshot().status).not.toBe('saved');
    gate.resolve(); await save.flush(); expect(JSON.parse(f.raw()).title).toBe('Keep this edit'); expect(save.getSnapshot().durableRevision).toBe(2);
  } finally { gate.resolve(); off(); await save.dispose(); }
});
