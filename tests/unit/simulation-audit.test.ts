import { expect, it, vi } from 'vitest';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { DigitalRuntime } from '../../src/core/session/DigitalRuntime';
import type { DigitalRequest, DigitalResult } from '../../src/core/topology/digital';
import { DigitalSessions } from '../../src/core/session/DigitalSessions';
import type { SharedDigitalState } from '../../src/core/session/DigitalSessions';
import { digitalCapabilities } from '../../src/components/definitions/digital';
import { runDigital } from '../../src/core/topology/digital';
import { digitalFixture } from '../fixtures/digital';
const quick = async () => {};
const pool = () => new DigitalSessions(digitalCapabilities(), (request, registry, signal) => runDigital(request, registry, signal, quick));

it('a live edit re-evaluates with pruned input identities and never publishes a stale state', async () => {
  const sessions = pool(), session = new DocumentSession(digitalFixture()), consumer = sessions.acquire(session, quick);
  consumer.setInput('a', 1); await consumer.run();
  const published: SharedDigitalState[] = [];
  const off = consumer.subscribe(() => published.push(consumer.getSnapshot()));
  session.edit('Remove devices', document => { document.components = []; document.wires = []; });
  await vi.waitFor(() => expect(consumer.getSnapshot().status).toBe('valid')); off();
  expect(published.length).toBeGreaterThan(0);
  for (const state of published) { expect(state.inputs).toEqual([]); expect(state.active).toBe(true); expect(['running', 'valid']).toContain(state.status); }
  expect(consumer.getSnapshot().result!.revision).toBe(session.getSnapshot().revision);
  sessions.dispose();
});

it('notifies all still-attached consumers when disposing their live owner', async () => {
  const sessions = pool(), session = new DocumentSession(digitalFixture()), a = sessions.acquire(session, quick), b = sessions.acquire(session, quick);
  a.setInput('a', 1); await a.run();
  const notifications: string[] = [];
  a.subscribe(() => notifications.push(`a:${a.getSnapshot().status}`));
  b.subscribe(() => notifications.push(`b:${b.getSnapshot().status}`));
  sessions.dispose();
  expect(notifications).toEqual(['a:stopped', 'b:stopped']);
  expect(a.getSnapshot()).toEqual({ status: 'stopped', active: false, inputs: [] });
  expect(b.getSnapshot()).toBe(a.getSnapshot()); expect(sessions.size).toBe(0);
});

it('an explicit rerun requested by a subscriber during a live update converges on the latest revision', async () => {
  const sessions = pool(), session = new DocumentSession(digitalFixture()), consumer = sessions.acquire(session, quick);
  consumer.setInput('a', 1); consumer.setInput('b', 0); await consumer.run();
  let requested = false, followup: Promise<void> | undefined;
  const off = consumer.subscribe(() => {
    if (consumer.getSnapshot().status === 'running' && !requested) { requested = true; followup = consumer.run(); }
  });
  session.edit('Rename', document => { document.title = 'Updated'; });
  expect(requested).toBe(true); await followup;
  await vi.waitFor(() => expect(consumer.getSnapshot().result?.revision).toBe(session.getSnapshot().revision));
  expect(consumer.getSnapshot()).toMatchObject({ status: 'valid', active: true });
  consumer.setInput('b', 1);
  await vi.waitFor(() => {
    const state = consumer.getSnapshot();
    expect(state.status).toBe('valid'); expect(state.result!.probes.find(p => p.componentId === 'sum')!.value).toBe(0);
  });
  off(); sessions.dispose();
});

it('invalid circuits stay live and recover after a correcting edit; engine failures end the run', async () => {
  const document = digitalFixture(); document.definitions.find(definition => definition.name === 'XOR')!.name = 'Unsupported gate';
  const sessions = pool(), session = new DocumentSession(document), consumer = sessions.acquire(session, quick);
  await consumer.run(); expect(consumer.getSnapshot()).toMatchObject({ status: 'invalid', active: true });
  session.edit('Restore gate', doc => { doc.definitions.find(definition => definition.name === 'Unsupported gate')!.name = 'XOR'; });
  await vi.waitFor(() => expect(consumer.getSnapshot()).toMatchObject({ status: 'valid', active: true }));
  sessions.dispose();
  const failing = new DigitalSessions(digitalCapabilities(), async () => { throw new Error('engine fault'); }), other = failing.acquire(new DocumentSession(digitalFixture()), quick);
  const published: SharedDigitalState[] = []; other.subscribe(() => published.push(other.getSnapshot()));
  await other.run();
  const failures = published.filter(state => state.status === 'failed'); expect(failures.length).toBeGreaterThan(0);
  for (const failure of failures) expect(failure.active).toBe(false);
  failing.dispose();
});

it('honors a rerun from a document observer registered before the runtime owner', async () => {
  const sessions = pool(), session = new DocumentSession(digitalFixture());
  let rerun = async () => {}, pending: Promise<void> | undefined;
  const offDocument = session.subscribe(() => { pending = rerun(); });
  const consumer = sessions.acquire(session, quick); rerun = consumer.run;
  consumer.setInput('a', 1); consumer.setInput('b', 0); await consumer.run();
  session.edit('Rename', document => { document.title = 'Latest revision'; }); await pending;
  expect(consumer.getSnapshot()).toMatchObject({ status: 'valid', active: true, result: { revision: session.getSnapshot().revision } });
  expect(consumer.getSnapshot().result!.probes.find(probe => probe.componentId === 'sum')!.value).toBe(1);
  offDocument(); sessions.dispose();
});

it('keeps Stop authoritative when requested while a fresh revision starts running', async () => {
  const sessions = pool(), session = new DocumentSession(digitalFixture());
  let rerun = async () => {}, pending: Promise<void> | undefined;
  const offDocument = session.subscribe(() => { pending = rerun(); });
  const consumer = sessions.acquire(session, quick); rerun = consumer.run; await consumer.run();
  const offConsumer = consumer.subscribe(() => { if (consumer.getSnapshot().status === 'running') consumer.stop(); });
  session.edit('Rename', document => { document.title = 'Stop during rerun'; }); await pending;
  expect(consumer.getSnapshot()).toMatchObject({ status: 'stopped', active: false });
  expect(consumer.getSnapshot().result).toBeUndefined(); offConsumer(); offDocument(); sessions.dispose();
});

it('an input changed by an early document observer is honored by the live update', async () => {
  const sessions = pool(), session = new DocumentSession(digitalFixture());
  let changeInput = () => {};
  const offDocument = session.subscribe(() => changeInput());
  const consumer = sessions.acquire(session, quick); consumer.setInput('a', 1); consumer.setInput('b', 0); await consumer.run();
  changeInput = () => consumer.setInput('a', 0);
  session.edit('Rename', document => { document.title = 'Changed input while invalidating'; });
  await vi.waitFor(() => expect(consumer.getSnapshot()).toMatchObject({ status: 'valid', active: true, result: { revision: session.getSnapshot().revision } }));
  expect(consumer.getSnapshot().inputs).toEqual([{ componentId: 'a', value: 0 }, { componentId: 'b', value: 0 }]);
  expect(consumer.getSnapshot().result!.probes.find(probe => probe.componentId === 'sum')!.value).toBe(0); offDocument(); sessions.dispose();
});

it('runtime disposal is terminal even when a stopped-state observer requests another run', async () => {
  const registry = digitalCapabilities(), session = new DocumentSession(digitalFixture());
  const pending: { request: DigitalRequest; signal: AbortSignal; resolve: (result: DigitalResult) => void }[] = [];
  const runtime = new DigitalRuntime(session, registry, (request, _registry, signal) => new Promise(resolve => pending.push({ request, signal, resolve })));
  const first = runtime.run([]); let requested = false, nested: Promise<void> | undefined;
  runtime.subscribe(() => { if (!requested && runtime.getSnapshot().status === 'stopped') { requested = true; nested = runtime.run([]); } });
  runtime.dispose(); const terminal = runtime.getSnapshot(), aborted = pending.map(run => run.signal.aborted);
  for (const run of pending) run.resolve(await runDigital(run.request, registry, run.signal, quick));
  await first; await nested;
  expect(terminal).toEqual({ status: 'stopped' }); expect(aborted).toEqual([true]); expect(runtime.getSnapshot()).toEqual({ status: 'stopped' });
});
