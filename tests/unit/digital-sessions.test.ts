import { expect, it, vi } from 'vitest';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { DigitalSessions } from '../../src/core/session/DigitalSessions';
import { digitalCapabilities } from '../../src/components/definitions/digital';
import { runDigital, type DigitalRequest, type DigitalResult } from '../../src/core/topology/digital';
import { digitalFixture } from '../fixtures/digital';
const quick = async () => {};
const immediate: typeof runDigital = (r, c, s) => runDigital(r, c, s, quick);
it('shares inputs/results across consumers, isolates sessions and releases the last owner', async () => {
  const pool = new DigitalSessions(digitalCapabilities(), immediate), session = new DocumentSession(digitalFixture());
  const before = session.getSnapshot(), a = pool.acquire(session, quick), b = pool.acquire(session, quick), c = pool.acquire(new DocumentSession(digitalFixture()), quick);
  let notifications = 0; a.subscribe(() => { notifications++; });
  a.setInput('a', 1); b.setInput('b', 1); await b.run();
  expect(a.getSnapshot()).toBe(b.getSnapshot()); expect(a.getSnapshot().result!.probes.map(p => p.value)).toEqual([1, 0]);
  expect(c.getSnapshot().status).toBe('stopped'); expect(pool.size).toBe(2);
  a.release(); const oldCount = notifications; b.setInput('a', 0); await b.run();
  expect(notifications).toBe(oldCount); expect(b.getSnapshot().result!.probes.map(p => p.value)).toEqual([0, 1]);
  // Reset returns every switch to 0 and keeps a live run live.
  b.reset(); expect(b.getSnapshot()).toMatchObject({ inputs: [{ componentId: 'a', value: 0 }, { componentId: 'b', value: 0 }], active: true });
  await vi.waitFor(() => expect(b.getSnapshot().result!.probes.map(p => p.value)).toEqual([0, 0]));
  b.stop(); b.reset(); expect(b.getSnapshot()).toMatchObject({ status: 'stopped', active: false });
  expect(session.getSnapshot()).toBe(before); b.release(); c.release(); expect(pool.size).toBe(0);
  const fresh = pool.acquire(session, quick); expect(fresh.getSnapshot()).toEqual({ status: 'stopped', inputs: [{ componentId: 'a', value: 0 }, { componentId: 'b', value: 0 }], active: false }); fresh.release(); pool.dispose();
});
it('pauses when all consumers are hidden and recomputes once without a time backlog', async () => {
  let executions = 0;
  const pool = new DigitalSessions(digitalCapabilities(), (...args) => { executions++; return immediate(...args); }), session = new DocumentSession(digitalFixture());
  const a = pool.acquire(session, quick), b = pool.acquire(session, quick);
  a.setInput('a', 0); a.setInput('b', 1); await a.run();
  a.setVisible(false); expect(b.getSnapshot().status).toBe('valid');
  b.setVisible(false); expect(b.getSnapshot()).toMatchObject({ status: 'paused', active: true });
  await a.run(); expect(b.getSnapshot().status).toBe('paused');
  b.setVisible(true); await vi.waitFor(() => expect(b.getSnapshot().status).toBe('valid')); expect(executions).toBe(2);
  b.stop(); b.setVisible(false); b.setVisible(true); expect(b.getSnapshot().status).toBe('stopped');
  pool.dispose(); expect(pool.size).toBe(0); expect(a.getSnapshot().status).toBe('stopped');
});
it('late results cannot survive hidden/closed windows, edits or pool disposal', async () => {
  const pending: { request: DigitalRequest; signal: AbortSignal; done: (result: DigitalResult) => void }[] = [];
  const registry = digitalCapabilities(), pool = new DigitalSessions(registry, (r, _c, s) => new Promise(done => pending.push({ request: r, signal: s, done })));
  const session = new DocumentSession(digitalFixture()), a = pool.acquire(session, quick), b = pool.acquire(session, quick);
  const first = a.run(); a.release(); expect(pending[0].signal.aborted).toBe(true); expect(pending).toHaveLength(2);
  pending[0].done(await runDigital(pending[0].request, registry, new AbortController().signal, quick)); await first;
  expect(b.getSnapshot().status).toBe('running');
  // A live run follows the edit: the obsolete run is cancelled and its late result discarded.
  session.edit('Delete input', doc => { doc.components = []; doc.wires = []; });
  expect(pending[1].signal.aborted).toBe(true); expect(pending).toHaveLength(3); expect(pending[2].request.revision).toBe(1);
  pending[1].done(await runDigital(pending[1].request, registry, new AbortController().signal, quick)); await Promise.resolve();
  expect(b.getSnapshot()).toMatchObject({ status: 'running', inputs: [], active: true });
  const third = b.run(); pool.dispose(); expect(pending[3].signal.aborted).toBe(true);
  pending[3].done(await runDigital(pending[3].request, registry, new AbortController().signal, quick)); await third;
  expect(b.getSnapshot()).toEqual({ status: 'stopped', inputs: [], active: false }); b.release(); expect(pool.size).toBe(0);
});
it('invalid inputs and released consumers cannot control the shared runtime', async () => {
  const pool = new DigitalSessions(digitalCapabilities(), immediate), session = new DocumentSession(digitalFixture());
  const a = pool.acquire(session, quick), b = pool.acquire(session, quick); a.release();
  a.setInput('a', 1); await a.run(); a.stop(); a.reset(); a.setVisible(true);
  b.setInput('xor', 1); expect(b.getSnapshot().inputs.map(input => input.componentId)).toEqual(['a', 'b']);
  await b.run(); pool.stop(session); expect(b.getSnapshot().status).toBe('stopped'); pool.dispose();
  expect(() => pool.acquire(session, quick)).toThrow('closed');
});
it('a hidden handoff consumer preserves inputs through a view remount', async () => {
  const pool = new DigitalSessions(digitalCapabilities(), immediate), session = new DocumentSession(digitalFixture());
  const old = pool.acquire(session, quick); old.setInput('a', 1); old.setInput('b', 0); await old.run();
  const handoff = pool.acquire(session, quick, false); old.release();
  expect(handoff.getSnapshot().status).toBe('paused');
  const replacement = pool.acquire(session, quick, false); handoff.release();
  expect(replacement.getSnapshot().inputs).toEqual([{ componentId: 'a', value: 1 }, { componentId: 'b', value: 0 }]);
  replacement.setVisible(true); await vi.waitFor(() => expect(replacement.getSnapshot().status).toBe('valid'));
  expect(replacement.getSnapshot().result!.probes.map(p => p.value)).toEqual([0, 1]);
  replacement.release(); expect(pool.size).toBe(0); pool.dispose();
});
it('an edit while hidden waits paused, then resumes once on the latest circuit with pruned inputs', async () => {
  let executions = 0;
  const pool = new DigitalSessions(digitalCapabilities(), (...args) => { executions++; return immediate(...args); }), session = new DocumentSession(digitalFixture());
  const a = pool.acquire(session, quick); a.setInput('a', 1); await a.run(); a.setVisible(false);
  const changed = digitalFixture('mux'); changed.components = changed.components.filter(c => c.id !== 'a'); changed.wires = changed.wires.filter(w => w.a.kind !== 'pin' || w.a.componentId !== 'a');
  session.replaceRaw(JSON.stringify(changed));
  expect(a.getSnapshot()).toMatchObject({ status: 'paused', active: true }); expect(executions).toBe(1);
  expect(a.getSnapshot().inputs.map(input => input.componentId)).not.toContain('a');
  a.setVisible(true); await vi.waitFor(() => expect(a.getSnapshot().status).toBe('valid'));
  expect(a.getSnapshot().result?.revision).toBe(1); expect(executions).toBe(2); a.release(); pool.dispose();
});
