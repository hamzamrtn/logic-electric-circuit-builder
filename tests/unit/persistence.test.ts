import { describe, expect, it } from 'vitest';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { SaveCoordinator, type Persistence } from '../../src/core/session/SaveCoordinator';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const doc = emptyDocument(), session = new DocumentSession(doc); let disk = serializeDocument(doc); const recovery: string[] = []; const writes: string[] = [];
  const host: Persistence = { read: async () => disk, recover: async s => { recovery.push(s); }, compareAndWrite: async (expected, content) => { if (expected !== disk) return { written: false, external: disk }; disk = content; writes.push(content); return { written: true }; } };
  return { session, initial: disk, host, recovery, writes, disk: () => disk, external: (s: string) => { disk = s; } };
}
describe('single-writer persistence', () => {
  it('serializes slow writes and never acknowledges newer edits prematurely', async () => {
    const f = fixture(), gate = deferred(), original = f.host.compareAndWrite; let active = 0, peak = 0;
    f.host.compareAndWrite = async (a, b) => { active++; peak = Math.max(peak, active); await gate.promise; const r = await original(a, b); active--; return r; };
    const save = new SaveCoordinator(f.session, f.host, f.initial);
    f.session.edit('one', d => { d.title = 'one'; }); f.session.edit('two', d => { d.title = 'two'; });
    expect(save.getSnapshot().durableRevision).toBe(0); expect(save.getSnapshot().status).not.toBe('saved'); gate.resolve(); await save.flush();
    expect(peak).toBe(1); expect(JSON.parse(f.disk()).title).toBe('two'); expect(save.getSnapshot().durableRevision).toBe(2); await save.dispose();
  });
  it('reloads clean external content with no write and resets undo', async () => {
    const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.initial); const other = emptyDocument('external'); const raw = serializeDocument(other); f.external(raw); await save.externalChanged(raw);
    expect(f.session.getSnapshot().document.title).toBe('external'); expect(f.writes).toHaveLength(0); expect(f.session.getSnapshot().canUndo).toBe(false); await save.dispose();
  });
  it('preserves dirty and external versions on baseline mismatch', async () => {
    const f = fixture(), raw = serializeDocument(emptyDocument('remote')); f.external(raw); const save = new SaveCoordinator(f.session, f.host, f.initial);
    f.session.edit('local', d => { d.title = 'local'; }); await save.flush(); expect(save.getSnapshot().status).toBe('conflict'); expect(f.disk()).toBe(raw); expect(f.recovery).toHaveLength(1);
    await save.resolve('local'); expect(JSON.parse(f.disk()).title).toBe('local'); expect(f.recovery).toContain(raw); await save.dispose();
  });
  it('keeps write errors visible, supports retry and does not resurrect deleted files', async () => {
    const f = fixture(), original = f.host.compareAndWrite; f.host.compareAndWrite = async () => { throw new Error('Disk full'); }; const save = new SaveCoordinator(f.session, f.host, f.initial);
    f.session.edit('edit', d => { d.title = 'kept'; }); await save.flush(); expect(save.getSnapshot().status).toBe('error'); expect(f.session.getSnapshot().document.title).toBe('kept');
    f.host.compareAndWrite = original; await save.retry(); expect(save.getSnapshot().status).toBe('saved'); save.deleted(); f.session.edit('edit', d => { d.title = 'not resurrected'; }); await save.flush(); expect(JSON.parse(f.disk()).title).toBe('kept'); await save.dispose();
  });
  it('does not replace a clean document with malformed external JSON', async () => {
    const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.initial); f.external('{invalid'); await save.externalChanged('{invalid'); expect(save.getSnapshot().status).toBe('conflict'); expect(f.session.getSnapshot().document.title).toBe('Untitled circuit'); expect(f.writes).toHaveLength(0); await save.dispose();
  });
  it('restores the local document after a malformed external change even without a local edit', async () => {
    const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.initial);
    f.external('{invalid'); await save.externalChanged('{invalid');
    await save.resolve('local');
    expect(f.disk()).toBe(f.initial); expect(f.recovery).toContain('{invalid');
    expect(save.getSnapshot()).toMatchObject({ status: 'saved', durableRevision: 0 });
    await save.dispose();
  });
  it('retries restoring the local version if its first forced write fails', async () => {
    const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.initial), original = f.host.compareAndWrite;
    f.external('{invalid'); await save.externalChanged('{invalid');
    f.host.compareAndWrite = async () => { throw new Error('Disk full'); };
    await save.resolve('local'); expect(save.getSnapshot().status).toBe('error');
    f.host.compareAndWrite = original; await save.retry();
    expect(f.disk()).toBe(f.initial); expect(save.getSnapshot().status).toBe('saved');
    await save.dispose();
  });
  it('retains conflict resolution actions when writing a recovery copy fails', async () => {
    const f = fixture(), remote = serializeDocument(emptyDocument('remote'));
    f.external(remote); f.host.recover = async () => { throw new Error('Recovery folder is read-only'); };
    const save = new SaveCoordinator(f.session, f.host, f.initial);
    f.session.edit('local', d => { d.title = 'local'; }); await save.flush();
    expect(save.getSnapshot()).toMatchObject({ status: 'conflict', external: remote });
    expect(f.disk()).toBe(remote); expect(f.session.getSnapshot().document.title).toBe('local');
    await save.dispose();
  });
  it('does not discard a pending local restore when another external change arrives', async () => {
    const f = fixture(), save = new SaveCoordinator(f.session, f.host, f.initial);
    f.external('{invalid'); await save.externalChanged('{invalid');
    f.host.compareAndWrite = async () => { throw new Error('Disk full'); };
    await save.resolve('local');
    const remote = serializeDocument(emptyDocument('New remote version')); f.external(remote); await save.externalChanged(remote);
    expect(f.session.getSnapshot().document.title).toBe('Untitled circuit');
    expect(save.getSnapshot()).toMatchObject({ status: 'conflict', external: remote });
    await save.dispose();
  });
});
