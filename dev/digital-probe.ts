import { serializeDocument } from '../src/core/model/document';
import { DocumentSession } from '../src/core/session/DocumentSession';
import { DigitalRuntime } from '../src/core/session/DigitalRuntime';
import { digitalCapabilities } from '../src/components/definitions/digital';
import { runDigital } from '../src/core/topology/digital';
import { digitalFixture } from '../tests/fixtures/digital';

const requireCheck = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const yieldTask = (): Promise<void> => new Promise(resolve => window.setTimeout(resolve, 0));
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
/** Development-only probe, also injected into an isolated actual Obsidian test vault. */
export async function probeDigital(session = new DocumentSession(digitalFixture())) {
  const before = session.getSnapshot(), raw = serializeDocument(before.document);
  const runtime = new DigitalRuntime(session, digitalCapabilities(), (request, registry, signal) => runDigital(request, registry, signal, yieldTask));
  const timings: number[] = [];
  try {
    for (let repeat = 0; repeat < 5; repeat++) for (const a of [0, 1] as const) for (const b of [0, 1] as const) {
      const start = performance.now(); await runtime.run([{ componentId: 'a', value: a }, { componentId: 'b', value: b }]); timings.push(performance.now() - start);
      const state = runtime.getSnapshot(), result = state.result;
      requireCheck(state.status === 'valid', 'Half-adder run must be valid');
      requireCheck(result?.probes.find(p => p.componentId === 'sum')?.value === (a + b) % 2, 'Independent sum oracle');
      requireCheck(result?.probes.find(p => p.componentId === 'carry')?.value === Math.floor((a + b) / 2), 'Independent carry oracle');
    }
    runtime.stop();
    requireCheck(session.getSnapshot() === before && serializeDocument(session.getSnapshot().document) === raw, 'Simulation changed document or history');
    const registry = digitalCapabilities(), chain = digitalFixture('chain', 128), chainTimings: number[] = [];
    // Timer heartbeat measures the longest event-loop gap, including compilation.
    let lastBeat = performance.now(), maxGap = 0;
    const heartbeat = window.setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - lastBeat); lastBeat = now; }, 0);
    try {
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const result = await runDigital({ sessionId: 'benchmark', revision: 0, runId: i, document: chain, inputs: [{ componentId: 'a', value: 1 }] }, registry, new AbortController().signal, yieldTask);
        chainTimings.push(performance.now() - start);
        requireCheck(result.status === 'valid' && result.probes[0].value === 1, 'Even inversion chain oracle');
      }
    } finally { maxGap = Math.max(maxGap, performance.now() - lastBeat); window.clearInterval(heartbeat); }
    const controller = new AbortController(); let abortAt = 0;
    const pending = runDigital({ sessionId: 'cancel', revision: 0, runId: 0, document: digitalFixture('chain', 250), inputs: [] }, registry, controller.signal, yieldTask);
    const cancelTimer = window.setTimeout(() => { abortAt = performance.now(); controller.abort(); }, 12);
    let cancelMs: number;
    try { const cancelled = await pending; cancelMs = performance.now() - abortAt; requireCheck(abortAt > 0 && cancelled.status === 'cancelled' && cancelled.nets.length === 0, 'Cancellation under load'); }
    finally { window.clearTimeout(cancelTimer); }
    // Edit while running: current results disappear immediately and late delivery cannot restore them.
    const pendingEdit = runtime.run([]);
    session.edit('D0 temporary probe edit', doc => { doc.title += ' Probe'; });
    await pendingEdit; requireCheck(runtime.getSnapshot().status === 'stale' && !runtime.getSnapshot().result, 'Edit must invalidate the run');
    session.undo();
    await runtime.run([{ componentId: 'a', value: 1 }, { componentId: 'b', value: 0 }]);
    requireCheck(runtime.getSnapshot().status === 'valid', 'Retry after cancellation/edit');
    runtime.stop();
    requireCheck(serializeDocument(session.getSnapshot().document) === raw, 'Probe failed to restore the fixture');
    return { truthTableRuns: timings.length, halfAdderP95Ms: p95(timings), chainGates: 128, chainRuns: chainTimings.length, chainP95Ms: p95(chainTimings), maxHeartbeatGapMs: maxGap, cancellationMs: cancelMs, unchangedRunHistory: true, editInvalidation: true, retry: true };
  } finally { runtime.dispose(); }
}
Object.assign(window, { __digitalD0: { digitalFixture, probeDigital, serializeDocument } });
