import { DocumentSession } from '../src/core/session/DocumentSession';
import { DigitalSessions } from '../src/core/session/DigitalSessions';
import { digitalCapabilities } from '../src/components/definitions/digital';
import { runDigital } from '../src/core/topology/digital';
import { digitalFixture, digitalStressFixture } from '../tests/fixtures/digital';
import { simulationTurn } from '../src/editor/simulation/schedule';

const registry = digitalCapabilities();
async function cycles(count: number) {
  const pool = new DigitalSessions(registry);
  try {
    for (let i = 0; i < count; i++) {
      const session = new DocumentSession(digitalFixture()), consumer = pool.acquire(session, signal => simulationTurn(window, signal));
      try {
        consumer.setInput('a', i % 2 ? 1 : 0); consumer.setInput('b', 1); await consumer.run();
        if (consumer.getSnapshot().status !== 'valid') throw new Error('Memory cycle run failed');
      } finally { consumer.release(); }
      if (pool.size !== 0) throw new Error('Released runtime owner was retained');
    }
  } finally { pool.dispose(); }
}
async function stress(kind: 'dense' | 'lanes' | 'large-definition' | 'maximum-chain') {
  const document = kind === 'maximum-chain' ? digitalFixture('chain', 254) : digitalStressFixture(kind);
  const controller = new AbortController(), start = performance.now();
  const result = await runDigital({ document, inputs: kind === 'maximum-chain' ? [{ componentId: 'a', value: 1 }] : [], sessionId: 'memory', revision: 0, runId: 1 }, registry, controller.signal, () => simulationTurn(window, controller.signal));
  const expected = kind === 'dense' ? 'invalid' : kind === 'large-definition' ? 'invalid' : 'valid';
  if (result.status !== expected || kind === 'dense' && result.diagnostics[0]?.code !== 'work-limit' || kind === 'large-definition' && result.diagnostics[0]?.code !== 'unsupported' || kind === 'maximum-chain' && result.probes[0]?.value !== 1 || kind === 'lanes' && result.nets.length !== 3584) throw new Error(`Wrong resource-limit result: ${kind}`);
  return { kind, milliseconds: performance.now() - start, status: result.status, diagnostic: result.diagnostics[0]?.code, nets: result.nets.length, work: result.work };
}
Object.assign(window, { __digitalMemory: { cycles, stress } });
