import { anchorKey, assertGraph, serializeDocument, type CircuitDocument, type Definition } from '../model/document';
import { deriveNets, type Net } from './nets';

/** Experimental D0 contract. Runtime configuration is never written to a circuit. */
export type LogicValue = 0 | 1 | 'X' | 'Z';
export type GateModel = 'buffer-v1' | 'not-v1' | 'and-v1' | 'nand-v1' | 'or-v1' | 'nor-v1' | 'xor-v1' | 'xnor-v1';
export type DigitalModel = 'input-v1' | 'probe-v1' | 'display7-v1' | GateModel;
/** Sinks read nets without driving them. */
export const isGateModel = (model: DigitalModel): model is GateModel => model !== 'input-v1' && model !== 'probe-v1' && model !== 'display7-v1';
export interface DigitalCapability { definition: Definition; model: DigitalModel; }
export interface RunIdentity { sessionId: string; revision: number; runId: number; }
export interface DigitalRequest extends RunIdentity {
  document: CircuitDocument;
  inputs: readonly { componentId: string; value: LogicValue }[];
}
export interface DigitalDiagnostic { code: string; message: string; objectIds: string[]; }
export interface DigitalResult extends RunIdentity {
  engine: 'digital-d0-v1';
  status: 'valid' | 'invalid' | 'cancelled' | 'failed';
  models: { componentId: string; model: DigitalModel }[];
  nets: { id: string; members: string[]; value: LogicValue }[];
  probes: { componentId: string; value: LogicValue }[];
  /** Seven-segment displays: segment values in a, b, c, d, e, f, g, dp order. */
  displays: { componentId: string; segments: LogicValue[] }[];
  diagnostics: DigitalDiagnostic[];
  work: number;
}
// Deliberately small feasibility envelope; these are not advertised product limits.
export const DIGITAL_LIMITS = Object.freeze({ components: 256, wires: 1024, nodes: 1024, annotations: 512, definitions: 64, lanes: 4096, work: 100_000, slice: 128 });
export type DigitalYield = () => Promise<void>;
const values: readonly LogicValue[] = [0, 1, 'X', 'Z'];
const signatures = new WeakMap<Definition, string>();
const serializeDefinition = (definition: Definition) => serializeDocument({ format: 'logic-electric-circuit', schemaVersion: 1, id: 'signature', title: '', components: [], nodes: [], wires: [], annotations: [], groups: [], metadata: {}, definitions: [definition] });
const signature = (definition: Definition) => { let value = signatures.get(definition); if (value === undefined) { value = serializeDefinition(definition); signatures.set(definition, value); } return value; };
/** Complete-definition matching is shared by preflight and the runtime controls. */
export function identifyDigitalModels(definitions: readonly Definition[], registry: readonly DigitalCapability[]): Map<string, DigitalModel | undefined> {
  // Registry definitions are immutable clones, so their signatures can be cached.
  const capabilities = new Map(registry.map(c => [c.definition.id, { ...c, signature: signature(c.definition) }]));
  return new Map(definitions.map(definition => {
    const candidate = capabilities.get(definition.id), original = candidate?.definition;
    // Reject unrelated/oversized symbol payloads before allocating a serialized copy.
    if (!original || definition.version !== original.version || definition.pins.length !== original.pins.length || definition.primitives.length !== original.primitives.length || definition.aliases.length !== original.aliases.length || Object.keys(definition.defaults).length !== Object.keys(original.defaults).length || (definition.laneLinks?.length ?? 0) !== (original.laneLinks?.length ?? 0)) return [definition.id, undefined];
    return [definition.id, serializeDefinition(definition) === candidate.signature ? candidate.model : undefined];
  }));
}
const invert = (value: LogicValue): LogicValue => value === 0 ? 1 : value === 1 ? 0 : 'X';
/** Multi-input XOR is odd parity; XNOR is even parity. Z inputs are consumed as unknown. */
export function logicGate(model: GateModel, inputs: readonly LogicValue[]): LogicValue {
  switch (model) {
    case 'buffer-v1': return inputs[0] === 0 || inputs[0] === 1 ? inputs[0] : 'X';
    case 'not-v1': return invert(inputs[0]);
    case 'and-v1': return inputs.includes(0) ? 0 : inputs.every(x => x === 1) ? 1 : 'X';
    case 'nand-v1': return invert(logicGate('and-v1', inputs));
    case 'or-v1': return inputs.includes(1) ? 1 : inputs.every(x => x === 0) ? 0 : 'X';
    case 'nor-v1': return invert(logicGate('or-v1', inputs));
    case 'xor-v1': return inputs.every(x => x === 0 || x === 1) ? (inputs.filter(x => x === 1).length % 2 ? 1 : 0) : 'X';
    case 'xnor-v1': return invert(logicGate('xor-v1', inputs));
  }
}
export function resolveDrivers(drivers: readonly LogicValue[]): { value: LogicValue; conflict: boolean } {
  const low = drivers.includes(0), high = drivers.includes(1), conflict = low && high;
  return { value: conflict || drivers.includes('X') ? 'X' : high ? 1 : low ? 0 : 'Z', conflict };
}
interface Device { id: string; model: DigitalModel; inputs: string[]; output?: string; }
class RunFault extends Error { constructor(readonly diagnostic: DigitalDiagnostic) { super(diagnostic.message); } }
function fault(code: string, message: string, objectIds: string[] = []): never { throw new RunFault({ code, message, objectIds }); }

/** Consumes a validated, immutable session snapshot. Compilation and results are bounded. */
export async function runDigital(request: DigitalRequest, registry: readonly DigitalCapability[], signal: AbortSignal, pause: DigitalYield): Promise<DigitalResult> {
  const identity: RunIdentity = { sessionId: request.sessionId, revision: request.revision, runId: request.runId };
  const base = { ...identity, engine: 'digital-d0-v1' as const };
  let work = 0;
  const check = () => { if (signal.aborted) throw new DOMException('Simulation cancelled', 'AbortError'); };
  async function checkpoint() {
    check();
    if (++work > DIGITAL_LIMITS.work) fault('work-limit', 'Simulation exceeded its work budget. Reduce the circuit size.');
    if (work % DIGITAL_LIMITS.slice === 0) { await pause(); check(); }
  }
  try {
    check();
    const doc = request.document;
    if (doc.components.length > DIGITAL_LIMITS.components || doc.wires.length > DIGITAL_LIMITS.wires || doc.nodes.length > DIGITAL_LIMITS.nodes || doc.annotations.length > DIGITAL_LIMITS.annotations || doc.definitions.length > DIGITAL_LIMITS.definitions || doc.groups.length > 256 || doc.groups.some(g => g.members.length > 1024) || doc.definitions.some(d => d.pins.length > 64 || (d.laneLinks?.length ?? 0) > 256)) fault('size-limit', 'Circuit exceeds the experimental simulation limits. Reduce its size.');
    let lanes = doc.wires.reduce((n, w) => n + w.width, 0);
    const definitions = new Map(doc.definitions.map(d => [d.id, d]));
    for (const component of doc.components) lanes += definitions.get(component.definitionId)?.pins.reduce((n, p) => n + p.width, 0) ?? 0;
    if (lanes > DIGITAL_LIMITS.lanes) fault('size-limit', 'Circuit exceeds the experimental signal-lane limit.');
    // Yield before bounded synchronous graph validation/topology, so Stop can run.
    await pause(); check();
    try { assertGraph(doc); } catch (error) { fault('invalid-graph', error instanceof Error ? error.message : 'Invalid circuit graph. Correct the connections before running.'); }
    const models = identifyDigitalModels(doc.definitions, registry);
    const devices: Device[] = [], unsupported: string[] = [];
    for (const c of doc.components) {
      await checkpoint();
      const def = definitions.get(c.definitionId)!;
      const model = models.get(def.id);
      if (!model) { unsupported.push(c.id); continue; }
      const inputCount = model === 'input-v1' ? 0 : model === 'probe-v1' || model === 'buffer-v1' || model === 'not-v1' ? 1 : model === 'display7-v1' ? 8 : def.pins.length - 1;
      const inputIds = Array.from({ length: inputCount }, (_, i) => `in-${i}`);
      const outputId = model === 'input-v1' ? 'out-0' : isGateModel(model) ? 'out' : undefined;
      const expected = [...inputIds, ...(outputId ? [outputId] : [])];
      if (def.laneLinks?.length || (isGateModel(model) && !['buffer-v1', 'not-v1'].includes(model) && (inputCount < 2 || inputCount > 8)) || def.pins.length !== expected.length || def.pins.some(p => p.width !== 1 || !expected.includes(p.id) || p.role !== (p.id === outputId ? 'output' : 'input'))) fault('model-pins', 'Model requires its exact supported scalar pin contract.', [c.id]);
      const terminal = (pinId: string) => `${anchorKey({ kind: 'pin', componentId: c.id, pinId })}[0]`;
      devices.push({ id: c.id, model, inputs: inputIds.map(terminal), output: outputId ? terminal(outputId) : undefined });
    }
    if (unsupported.length) fault('unsupported', 'Unsupported devices: replace them with supported digital models before running.', unsupported);
    // Mismatched named buses must not silently become unrelated partial simulations.
    const labelWidths = new Map<string, number>();
    const wireWidths = new Map<string, number>();
    for (const wire of doc.wires) { wireWidths.set(anchorKey(wire.a), wire.width); wireWidths.set(anchorKey(wire.b), wire.width); }
    for (const label of doc.annotations) if (label.kind === 'label' && label.anchor) {
      await checkpoint();
      const a = label.anchor, width = a.kind === 'pin' ? definitions.get(doc.components.find(c => c.id === a.componentId)!.definitionId)!.pins.find(p => p.id === a.pinId)!.width : wireWidths.get(anchorKey(a)) ?? 1;
      const name = label.text.trim();
      if (labelWidths.has(name) && labelWidths.get(name) !== width) fault('named-width', 'Named nets have incompatible widths. Correct their widths before running.', [label.id]);
      labelWidths.set(name, width);
    }
    const nets = deriveNets(doc), byTerminal = new Map<string, Net>();
    for (const net of nets) { await checkpoint(); for (const member of net.members) byTerminal.set(member, net); }
    const netId = (terminal: string) => byTerminal.get(terminal)!.id;
    devices.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const sourceIds = new Set(devices.filter(d => d.model === 'input-v1').map(d => d.id));
    const inputValues = new Map<string, LogicValue>();
    if (request.inputs.length > DIGITAL_LIMITS.components) fault('inputs', 'Too many runtime inputs.');
    for (const input of request.inputs) {
      if (!sourceIds.has(input.componentId) || inputValues.has(input.componentId) || !values.includes(input.value)) fault('inputs', 'Runtime inputs must name each supported input at most once and use 0, 1, X or Z.', [input.componentId]);
      inputValues.set(input.componentId, input.value);
    }
    const gates = devices.filter(d => isGateModel(d.model));
    const producers = new Map<string, Device[]>();
    for (const d of gates) { const key = netId(d.output!); producers.set(key, [...(producers.get(key) ?? []), d]); }
    const dependencies = new Map<string, Set<string>>(), consumers = new Map<string, Set<string>>();
    for (const gate of gates) {
      const deps = new Set<string>();
      for (const input of gate.inputs) for (const producer of producers.get(netId(input)) ?? []) {
        await checkpoint(); deps.add(producer.id);
        const targets = consumers.get(producer.id) ?? new Set<string>(); targets.add(gate.id); consumers.set(producer.id, targets);
      }
      dependencies.set(gate.id, deps);
    }
    const queue = gates.filter(g => !dependencies.get(g.id)!.size), ordered: Device[] = [], byId = new Map(gates.map(g => [g.id, g]));
    for (let i = 0; i < queue.length; i++) {
      await checkpoint(); const gate = queue[i]; ordered.push(gate);
      for (const id of consumers.get(gate.id) ?? []) { const deps = dependencies.get(id)!; deps.delete(gate.id); if (!deps.size) queue.push(byId.get(id)!); }
    }
    if (ordered.length !== gates.length) fault('feedback', 'Combinational feedback is unsupported. Remove the loop before running.', gates.filter(g => dependencies.get(g.id)!.size).map(g => g.id));
    const drivers = new Map<string, LogicValue[]>();
    const drive = (terminal: string, value: LogicValue) => { const key = netId(terminal), existing = drivers.get(key) ?? []; existing.push(value); drivers.set(key, existing); };
    const read = (terminal: string) => resolveDrivers(drivers.get(netId(terminal)) ?? []).value;
    for (const device of devices) if (device.model === 'input-v1') drive(device.output!, inputValues.get(device.id) ?? 'X');
    for (const gate of ordered) { await checkpoint(); drive(gate.output!, logicGate(gate.model as GateModel, gate.inputs.map(read))); }
    const diagnostics: DigitalDiagnostic[] = [];
    const results: DigitalResult['nets'] = [];
    for (const net of nets) {
      await checkpoint(); const resolved = resolveDrivers(drivers.get(net.id) ?? []);
      if (resolved.conflict) diagnostics.push({ code: 'driver-conflict', message: 'Conflicting 0 and 1 drivers produce X.', objectIds: devices.filter(d => d.output && netId(d.output) === net.id).map(d => d.id) });
      results.push({ id: net.id, members: [...net.members], value: resolved.value });
    }
    check();
    return { ...base, status: 'valid', models: devices.map(d => ({ componentId: d.id, model: d.model })), nets: results, probes: devices.filter(d => d.model === 'probe-v1').map(d => ({ componentId: d.id, value: read(d.inputs[0]) })), displays: devices.filter(d => d.model === 'display7-v1').map(d => ({ componentId: d.id, segments: d.inputs.map(read) })), diagnostics, work };
  } catch (error) {
    return { ...base, status: signal.aborted ? 'cancelled' : error instanceof RunFault ? 'invalid' : 'failed', models: [], nets: [], probes: [], displays: [], diagnostics: signal.aborted ? [] : [error instanceof RunFault ? error.diagnostic : { code: 'execution', message: 'Simulation failed. Editing remains available; stop and retry.', objectIds: [] }], work };
  }
}
