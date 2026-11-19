import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { clone, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { DigitalRuntime } from '../../src/core/session/DigitalRuntime';
import { DIGITAL_LIMITS, logicGate, resolveDrivers, runDigital, type DigitalRequest, type DigitalResult, type LogicValue } from '../../src/core/topology/digital';
import { digitalCapabilities } from '../../src/components/definitions/digital';
import { digitalFixture, reverseLayout } from '../fixtures/digital';
const registry = digitalCapabilities();
const quick = async () => {};
function request(document = digitalFixture(), inputs: DigitalRequest['inputs'] = []): DigitalRequest { return { document, inputs, sessionId: 'test', revision: 7, runId: 3 }; }
const run = (r: DigitalRequest, signal = new AbortController().signal) => runDigital(r, registry, signal, quick);
const probes = (r: DigitalResult) => Object.fromEntries(r.probes.map(p => [p.componentId, p.value]));

describe('independent four-state truth tables', () => {
  const states: LogicValue[] = [0, 1, 'X', 'Z'];
  // Rows/columns follow 0,1,X,Z. Literal tables are independent of evaluator code.
  const tables = {
    'and-v1': ['0000', '01XX', '0XXX', '0XXX'],
    'or-v1': ['01XX', '1111', 'X1XX', 'X1XX'],
    'xor-v1': ['01XX', '10XX', 'XXXX', 'XXXX'],
  } as const;
  for (const [model, table] of Object.entries(tables)) it(`${model}: every binary/unknown/high-impedance pair`, () => {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) expect(String(logicGate(model as keyof typeof tables, [states[a], states[b]]))).toBe(table[a][b]);
  });
  it('NOT and floating/high-impedance resolution', () => {
    expect(states.map(x => logicGate('not-v1', [x]))).toEqual([1, 0, 'X', 'X']);
    expect(resolveDrivers([])).toEqual({ value: 'Z', conflict: false });
    const resolution = ['0XX0', 'X1X1', 'XXXX', '01XZ'];
    for (let a = 0; a < states.length; a++) for (let b = 0; b < states.length; b++) {
      const result = resolveDrivers([states[a], states[b]]);
      expect(String(result.value)).toBe(resolution[a][b]);
      expect(result.conflict).toBe(a + b === 1 && a < 2 && b < 2);
    }
    for (const [drivers, value, conflict] of [
      [[0, 'Z'], 0, false], [[1, 'Z'], 1, false], [['Z', 'Z'], 'Z', false],
      [[0, 0], 0, false], [[1, 1], 1, false], [[0, 1], 'X', true], [[0, 'X'], 'X', false], [['X', 'Z'], 'X', false],
    ] as [LogicValue[], LogicValue, boolean][]) expect(resolveDrivers(drivers)).toEqual({ value, conflict });
  });
});
it('half adder: exhaustive arithmetic oracle, unchanged document and matching identities', async () => {
  const doc = digitalFixture(), before = serializeDocument(doc);
  for (const a of [0, 1] as const) for (const b of [0, 1] as const) {
    const result = await run(request(doc, [{ componentId: 'a', value: a }, { componentId: 'b', value: b }]));
    expect(result).toMatchObject({ status: 'valid', sessionId: 'test', revision: 7, runId: 3, engine: 'digital-d0-v1', diagnostics: [] });
    expect(probes(result)).toEqual({ carry: Math.floor((a + b) / 2), sum: (a + b) % 2 });
  }
  expect(serializeDocument(doc)).toBe(before);
});
it('gate-built multiplexer: exhaustive selection oracle and geometry/order independence', async () => {
  for (const a of [0, 1] as const) for (const b of [0, 1] as const) for (const s of [0, 1] as const) {
    const inputs = [{ componentId: 'a', value: a }, { componentId: 'b', value: b }, { componentId: 'select', value: s }];
    const doc = digitalFixture('mux');
    const result = await run(request(doc, inputs)), reversed = await run(request(reverseLayout(doc), inputs));
    expect(result.status).toBe('valid'); expect(probes(result)).toEqual({ sum: s ? b : a });
    expect(probes(reversed)).toEqual(probes(result));
    expect(new Map(reversed.nets.map(n => [n.id, n.value]))).toEqual(new Map(result.nets.map(n => [n.id, n.value])));
  }
});
it('unknown defaults, floating pins and driver conflicts are visible', async () => {
  const doc = digitalFixture();
  expect(probes(await run(request(doc)))).toEqual({ carry: 'X', sum: 'X' });
  doc.wires = doc.wires.filter(w => !(w.b.kind === 'pin' && w.b.componentId === 'sum'));
  expect(probes(await run(request(doc)))).toMatchObject({ sum: 'Z' });
  doc.wires.push({ ...clone(doc.wires[0]), id: 'conflict', b: { kind: 'pin', componentId: 'b', pinId: 'out-0' } });
  const result = await run(request(doc, [{ componentId: 'a', value: 0 }, { componentId: 'b', value: 1 }]));
  expect(result.status).toBe('valid'); expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'driver-conflict', objectIds: ['a', 'b'] }));
  expect(probes(result).carry).toBe('X');
});
it('named nets connect explicitly; overlapping geometry never connects', async () => {
  const doc = digitalFixture();
  doc.wires = doc.wires.filter(w => !(w.b.kind === 'pin' && w.b.componentId === 'sum'));
  const label = { kind: 'label' as const, position: { x: 0, y: 0 }, text: 'result', global: false, size: { x: 0, y: 0 }, locked: false, zIndex: 0, rotation: 0, scaleX: 1, scaleY: 1, fontSize: 14 };
  doc.annotations.push({ ...label, id: 'label1', anchor: { kind: 'pin', componentId: 'xor', pinId: 'out' } }, { ...label, id: 'label2', anchor: { kind: 'pin', componentId: 'sum', pinId: 'in-0' } });
  expect(probes(await run(request(doc, [{ componentId: 'a', value: 1 }, { componentId: 'b', value: 0 }]))).sum).toBe(1);
  doc.annotations[1].text = 'Result';
  doc.components.find(c => c.id === 'sum')!.position = { ...doc.components.find(c => c.id === 'xor')!.position };
  expect(probes(await run(request(doc))).sum).toBe('Z');
});
it('fails closed for changed/unsupported definitions, pin widths and feedback', async () => {
  const changed = digitalFixture(); changed.definitions.find(d => d.name === 'AND')!.name = 'OR';
  expect((await run(request(changed))).diagnostics[0].code).toBe('unsupported');
  const bus = digitalFixture(); bus.wires[0].width = 2;
  expect(await run(request(bus))).toMatchObject({ status: 'invalid', nets: [], probes: [], diagnostics: [expect.objectContaining({ code: 'invalid-graph' })] });
  const loop = digitalFixture(); loop.wires.push({ ...clone(loop.wires[0]), id: 'loop', a: { kind: 'pin', componentId: 'xor', pinId: 'out' }, b: { kind: 'pin', componentId: 'xor', pinId: 'in-0' } });
  expect(await run(request(loop))).toMatchObject({ status: 'invalid', nets: [], diagnostics: [expect.objectContaining({ code: 'feedback' })] });
});
it('checks runtime input identity, duplicates, value and model pin contracts', async () => {
  for (const inputs of [[{ componentId: 'xor', value: 0 }], [{ componentId: 'a', value: 0 }, { componentId: 'a', value: 1 }], [{ componentId: 'a', value: 2 }]]) {
    expect((await run(request(digitalFixture(), inputs as DigitalRequest['inputs']))).diagnostics[0].code).toBe('inputs');
  }
  const invalidRegistry = registry.map(c => ({ ...c, model: 'not-v1' as const }));
  expect((await runDigital(request(), invalidRegistry, new AbortController().signal, quick)).diagnostics[0].code).toBe('model-pins');
});
it('bounds large input before yielding; cancellation returns no partial output and retry works', async () => {
  const tooLarge = digitalFixture('chain', DIGITAL_LIMITS.components);
  expect((await run(request(tooLarge))).diagnostics[0].code).toBe('size-limit');
  const controller = new AbortController(); let slices = 0;
  const r = request(digitalFixture('chain', 200));
  const cancelled = await runDigital(r, registry, controller.signal, async () => { if (++slices === 3) controller.abort(); });
  expect(cancelled).toMatchObject({ status: 'cancelled', nets: [], probes: [] }); expect(slices).toBe(3);
  expect(probes(await run({ ...r, inputs: [{ componentId: 'a', value: 1 }] })).sum).toBe(1);
  controller.abort(); expect((await run(r, controller.signal)).status).toBe('cancelled');
});
it('an injected execution error cannot leak partial results', async () => {
  expect(await runDigital(request(), registry, new AbortController().signal, async () => { throw new Error('fixture failure'); })).toMatchObject({ status: 'failed', nets: [], probes: [] });
});
it('session run/toggle/stop/edit/rerun preserves content/history and marks old results stale', async () => {
  const session = new DocumentSession(digitalFixture()), runtime = new DigitalRuntime(session, registry, (r, c, s) => runDigital(r, c, s, quick));
  const before = session.getSnapshot();
  await runtime.run([{ componentId: 'a', value: 1 }, { componentId: 'b', value: 1 }]);
  expect(probes(runtime.getSnapshot().result!)).toEqual({ carry: 1, sum: 0 });
  await runtime.run([{ componentId: 'a', value: 0 }, { componentId: 'b', value: 1 }]);
  expect(probes(runtime.getSnapshot().result!)).toEqual({ carry: 0, sum: 1 });
  runtime.stop(); expect(runtime.getSnapshot()).toEqual({ status: 'stopped' }); expect(session.getSnapshot()).toBe(before);
  await runtime.run([]); session.edit('Rename', d => { d.title = 'Changed'; });
  expect(runtime.getSnapshot()).toEqual({ status: 'stale' });
  await runtime.run([]); expect(runtime.getSnapshot().result!.revision).toBe(1);
  session.undo(); expect(runtime.getSnapshot()).toEqual({ status: 'stale' });
  session.replaceRaw(serializeDocument(digitalFixture('mux'))); expect(runtime.getSnapshot()).toEqual({ status: 'stale' });
  runtime.dispose(); await runtime.run([]); expect(runtime.getSnapshot()).toEqual({ status: 'stopped' });
});
it('rejects late completions after newer runs, edits, stop and disposal even if engine ignores abort', async () => {
  const session = new DocumentSession(digitalFixture()), pending: { request: DigitalRequest; resolve: (result: DigitalResult) => void }[] = [];
  const runtime = new DigitalRuntime(session, registry, r => new Promise(resolve => pending.push({ request: r, resolve })));
  const finish = async (i: number) => pending[i].resolve(await run(pending[i].request));
  const old = runtime.run([]), newer = runtime.run([]); await finish(1); await newer;
  const valid = runtime.getSnapshot(); await finish(0); await old; expect(runtime.getSnapshot()).toBe(valid);
  const edited = runtime.run([]); session.edit('Rename', d => { d.title = 'New'; }); await finish(2); await edited;
  expect(runtime.getSnapshot()).toEqual({ status: 'stale' });
  const stopped = runtime.run([]); runtime.stop(); await finish(3); await stopped; expect(runtime.getSnapshot()).toEqual({ status: 'stopped' });
  const closed = runtime.run([]); runtime.dispose(); await finish(4); await closed; expect(runtime.getSnapshot()).toEqual({ status: 'stopped' });
});
it('wrong run identity or rejected executor fails safely and can retry', async () => {
  const session = new DocumentSession(digitalFixture()); let mismatch = true;
  const runtime = new DigitalRuntime(session, registry, async r => { if (!mismatch) throw new Error('executor'); return { ...await run(r), revision: r.revision + 1 }; });
  await runtime.run([]); expect(runtime.getSnapshot()).toEqual({ status: 'failed' });
  mismatch = false; await runtime.run([]); expect(runtime.getSnapshot()).toMatchObject({ status: 'failed', result: { nets: [], probes: [] } }); runtime.dispose();
});
it('dense driver dependencies exhaust the work budget without returning partial results', async () => {
  const doc = digitalFixture('chain', 250);
  doc.wires = []; doc.nodes.push({ id: 'shared', position: { x: 0, y: 0 }, explicit: true });
  for (const component of doc.components.filter(c => c.id.startsWith('g'))) for (const pinId of ['in-0', 'out']) {
    doc.wires.push({ id: `dense-${doc.wires.length}`, a: { kind: 'pin', componentId: component.id, pinId }, b: { kind: 'node', nodeId: 'shared' }, width: 1, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] }, locked: false });
  }
  // One-input NOT gates produce 250² dependencies, below the work budget; use two-input gates.
  const and = digitalCapabilities().find(c => c.model === 'and-v1')!.definition;
  doc.definitions.push(clone(and));
  for (const component of doc.components.filter(c => c.id.startsWith('g'))) {
    component.definitionId = and.id;
    doc.wires.push({ ...clone(doc.wires[0]), id: `dense-${doc.wires.length}`, a: { kind: 'pin', componentId: component.id, pinId: 'in-1' } });
  }
  const result = await run(request(doc));
  expect(result).toMatchObject({ status: 'invalid', nets: [], probes: [], diagnostics: [expect.objectContaining({ code: 'work-limit' })] });
  expect(result.work).toBe(DIGITAL_LIMITS.work + 1);
});
it('named width mismatch fails preflight, while explicit junctions join scalar branches', async () => {
  const doc = digitalFixture();
  const template = { kind: 'label' as const, position: { x: 0, y: 0 }, text: 'shared', global: false, size: { x: 0, y: 0 }, locked: false, zIndex: 0, rotation: 0, scaleX: 1, scaleY: 1, fontSize: 14 };
  doc.nodes.push({ id: 'wideA', position: { x: 0, y: 0 }, explicit: true }, { id: 'wideB', position: { x: 80, y: 0 }, explicit: true });
  doc.wires.push({ ...clone(doc.wires[0]), id: 'wide', a: { kind: 'node', nodeId: 'wideA' }, b: { kind: 'node', nodeId: 'wideB' }, width: 2 });
  doc.annotations.push({ ...template, id: 'scalar-label', anchor: { kind: 'pin', componentId: 'a', pinId: 'out-0' } }, { ...template, id: 'bus-label', anchor: { kind: 'node', nodeId: 'wideA' } });
  expect((await run(request(doc))).diagnostics[0].code).toBe('named-width');
  const joined = digitalFixture();
  joined.nodes.push({ id: 'junction', position: { x: 0, y: 0 }, explicit: true });
  const wire = joined.wires[0], endpoint = clone(wire.b); wire.b = { kind: 'node', nodeId: 'junction' };
  joined.wires.push({ ...clone(wire), id: 'branch', a: clone(wire.b), b: endpoint });
  expect(probes(await run(request(joined, [{ componentId: 'a', value: 1 }, { componentId: 'b', value: 0 }])))).toEqual({ carry: 0, sum: 1 });
});
it('generated gate networks match an independent Boolean oracle after layout/order changes', async () => {
  await fc.assert(fc.asyncProperty(fc.boolean(), fc.boolean(), fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.nat(100), fc.nat(100)), { minLength: 1, maxLength: 32 }), async (a, b, instructions) => {
    const doc = digitalFixture();
    doc.components = doc.components.filter(c => ['a', 'b', 'sum'].includes(c.id)); doc.wires = [];
    const ids = ['a', 'b'], expected = [a, b], parts = ['AND', 'OR', 'XOR', 'NOT'];
    const connect = (source: string, target: string, targetPin: string) => doc.wires.push({ id: `random-${doc.wires.length}`, a: { kind: 'pin', componentId: source, pinId: ['a', 'b'].includes(source) ? 'out-0' : 'out' }, b: { kind: 'pin', componentId: target, pinId: targetPin }, width: 1, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] }, locked: false });
    for (const [kind, sourceA, sourceB] of instructions) {
      const left = sourceA % ids.length, right = sourceB % ids.length, id = `g${ids.length}`, capability = registry.find(c => c.definition.name === parts[kind])!;
      if (!doc.definitions.some(d => d.id === capability.definition.id)) doc.definitions.push(clone(capability.definition));
      doc.components.push({ ...clone(doc.components[0]), id, definitionId: capability.definition.id });
      connect(ids[left], id, 'in-0'); if (kind !== 3) connect(ids[right], id, 'in-1');
      expected.push(kind === 0 ? expected[left] && expected[right] : kind === 1 ? expected[left] || expected[right] : kind === 2 ? expected[left] !== expected[right] : !expected[left]); ids.push(id);
    }
    connect(ids[ids.length - 1], 'sum', 'in-0');
    const result = await run(request(reverseLayout(doc), [{ componentId: 'a', value: a ? 1 : 0 }, { componentId: 'b', value: b ? 1 : 0 }]));
    expect(result.status).toBe('valid'); expect(probes(result)).toEqual({ sum: expected.at(-1) ? 1 : 0 });
    expect(result.models).toHaveLength(doc.components.length);
  }), { numRuns: 100, seed: 20261113 });
});

describe('expanded gate set, multi-input gates and seven-segment displays', () => {
  const bits = (mask: number, count: number) => Array.from({ length: count }, (_, i): LogicValue => (mask >> i) & 1 ? 1 : 0);
  it('NAND, NOR, XNOR and Buffer invert or pass their base functions, including unknowns', () => {
    expect([0, 1, 'X', 'Z'].map(x => logicGate('buffer-v1', [x as LogicValue]))).toEqual([0, 1, 'X', 'X']);
    for (let n = 2; n <= 8; n++) for (let mask = 0; mask < 1 << n; mask++) {
      const inputs = bits(mask, n), ones = inputs.filter(x => x === 1).length;
      expect(logicGate('and-v1', inputs)).toBe(ones === n ? 1 : 0); expect(logicGate('nand-v1', inputs)).toBe(ones === n ? 0 : 1);
      expect(logicGate('or-v1', inputs)).toBe(ones ? 1 : 0); expect(logicGate('nor-v1', inputs)).toBe(ones ? 0 : 1);
      // Multi-input XOR is odd parity; XNOR is even parity.
      expect(logicGate('xor-v1', inputs)).toBe(ones % 2); expect(logicGate('xnor-v1', inputs)).toBe(1 - ones % 2);
    }
    expect(logicGate('nand-v1', [0, 'X', 'Z'])).toBe(1); expect(logicGate('nor-v1', [1, 'Z'])).toBe(0); expect(logicGate('xnor-v1', [1, 'Z'])).toBe('X');
  });
  it('registers the canonical inspector gate definitions for every input count', async () => {
    const { makeGate } = await import('../../src/components/definitions/library');
    for (const name of ['AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR']) for (let n = 2; n <= 8; n++) expect(registry.some(c => c.definition.id === makeGate(name, n).id)).toBe(true);
    for (const name of ['Buffer', 'NOT', 'Logic input', 'Output probe', 'Seven-segment display']) expect(registry.some(c => c.definition.name === name)).toBe(true);
    expect(registry.some(c => c.definition.name === 'Tri-state buffer' || c.definition.name === 'Clock')).toBe(false);
  });
  it('a three-input NAND drives a probe and lights the matching display segments', async () => {
    const { findPart, makeGate } = await import('../../src/components/definitions/library');
    const doc = digitalFixture(); doc.components = []; doc.wires = []; doc.definitions = [];
    const add = (id: string, definition: ReturnType<typeof findPart>) => { if (!doc.definitions.some(d => d.id === definition.id)) doc.definitions.push(clone(definition)); doc.components.push({ id, definitionId: definition.id, position: { x: doc.components.length * 160, y: 0 }, rotation: 0, mirrorX: false, mirrorY: false, reference: id, properties: {}, locked: false }); };
    const wire = (a: string, ap: string, b: string, bp: string) => doc.wires.push({ id: `w${doc.wires.length}`, a: { kind: 'pin', componentId: a, pinId: ap }, b: { kind: 'pin', componentId: b, pinId: bp }, width: 1, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] }, locked: false });
    for (const id of ['a', 'b', 'c']) add(id, findPart('Logic input'));
    add('nand', makeGate('NAND', 3)); add('y', findPart('Output probe')); add('seg', findPart('Seven-segment display'));
    ['a', 'b', 'c'].forEach((id, i) => wire(id, 'out-0', 'nand', `in-${i}`)); wire('nand', 'out', 'y', 'in-0'); wire('nand', 'out', 'seg', 'in-1'); wire('a', 'out-0', 'seg', 'in-2');
    for (let mask = 0; mask < 8; mask++) {
      const values = bits(mask, 3), result = await run(request(doc, ['a', 'b', 'c'].map((componentId, i) => ({ componentId, value: values[i] }))));
      const nand: LogicValue = values.every(v => v === 1) ? 0 : 1;
      expect(result.status).toBe('valid'); expect(probes(result)).toEqual({ y: nand });
      expect(result.displays).toEqual([{ componentId: 'seg', segments: ['Z', nand, values[0], 'Z', 'Z', 'Z', 'Z', 'Z'] }]);
    }
  });
});
it('changing gate inputs keeps the canonical definition so the gate stays simulatable', async () => {
  const { place, reconfigure } = await import('../../src/core/commands/operations');
  const { makeGate } = await import('../../src/components/definitions/library');
  const { identifyDigitalModels } = await import('../../src/core/topology/digital');
  const doc = digitalFixture(), gate = place(doc, makeGate('NAND', 2), { x: 0, y: 400 }), other = place(doc, makeGate('NAND', 2), { x: 160, y: 400 });
  reconfigure(doc, gate.id, makeGate('NAND', 4)); reconfigure(doc, other.id, makeGate('NAND', 4));
  expect(gate.definitionId).toBe('builtin.gate-nand-4.v1'); expect(other.definitionId).toBe(gate.definitionId);
  expect(doc.definitions.filter(d => d.id === gate.definitionId)).toHaveLength(1);
  expect(identifyDigitalModels(doc.definitions, registry).get(gate.definitionId)).toBe('nand-v1');
  // A different definition already using a canonical ID is never silently replaced.
  const altered = digitalFixture(), changed = makeGate('OR', 3); changed.name = 'Edited'; altered.definitions.push(changed);
  const part = place(altered, makeGate('OR', 2), { x: 0, y: 400 }); reconfigure(altered, part.id, makeGate('OR', 3));
  expect(part.definitionId).not.toBe('builtin.gate-or-3.v1');
});
