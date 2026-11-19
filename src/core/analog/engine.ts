import { anchorKey, type CircuitDocument, type Component, type Definition } from '../model/document';
import { deriveNets, type Net } from '../topology/nets';
import { identifyAnalogModels, SWITCH_MODELS, switchDefault, type AnalogCapability, type AnalogModel } from './models';
import { formatQuantity, parseQuantities, type Quantity, type Unit } from './units';

/**
 * Electrical analysis by modified nodal analysis (MNA).
 * - Operating point: Newton–Raphson with junction limiting, then gmin and source stepping.
 * - Transient: backward Euler from a power-on state (capacitors discharged, inductors at 0 A).
 * Results are ephemeral; nothing is written to the document.
 */
export interface AnalogDiagnostic { code: string; severity: 'error' | 'warning' | 'info'; message: string; objectIds: string[]; }
export interface PartReading {
  componentId: string; model: AnalogModel;
  /** Voltage between the part's first two pins (pin 1 minus pin 2), or its main controlled pair. */
  voltage: number;
  /** Main current: into pin 1 for two-terminal parts; collector/drain/output for active parts. */
  current: number;
  /** Power absorbed (negative when the part delivers power). */
  power: number;
  pins: Record<string, number>;
  detail: { label: string; value: number; unit: Unit | '' }[];
  state?: string;
}
export interface OperatingPoint {
  status: 'valid' | 'invalid' | 'failed' | 'cancelled';
  netVoltages: Map<string, number>;
  parts: Map<string, PartReading>;
  diagnostics: AnalogDiagnostic[];
  iterations: number;
  nodes: number;
}
export interface Waveforms {
  status: 'valid' | 'invalid' | 'failed' | 'cancelled';
  time: Float64Array;
  net: Map<string, Float64Array>;
  partVoltage: Map<string, Float64Array>;
  partCurrent: Map<string, Float64Array>;
  duration: number;
  diagnostics: AnalogDiagnostic[];
}
export interface AnalogRequest { document: CircuitDocument; switches?: ReadonlyMap<string, boolean>; }
export type AnalogYield = () => Promise<void>;
export const ANALOG_LIMITS = Object.freeze({ components: 256, unknowns: 200, transientUnknowns: 120, steps: 2000, minSteps: 200, flops: 6e8, newton: 150 });

const VT = 0.025852; // thermal voltage at 300 K
const GMIN = 1e-12, SWITCH_ON = 1e-3, EXP_LIMIT = 40;
class Fault extends Error { constructor(readonly diagnostic: AnalogDiagnostic) { super(diagnostic.message); } }
const fault = (code: string, message: string, objectIds: string[] = []): never => { throw new Fault({ code, severity: 'error', message, objectIds }); };
/** exp() with a linear continuation, so a junction across an ideal source stays finite. */
const limexp = (x: number) => x < EXP_LIMIT ? Math.exp(x) : Math.exp(EXP_LIMIT) * (1 + x - EXP_LIMIT);
const dlimexp = (x: number) => x < EXP_LIMIT ? Math.exp(x) : Math.exp(EXP_LIMIT);
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) { const arg = 1 + (vnew - vold) / vt; return arg > 0 ? vold + vt * Math.log(arg) : vcrit; }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}

type Part = {
  component: Component; definition: Definition; model: AnalogModel;
  n: Record<string, number>; // pin id → node index (0 = ground)
  value: number; value2: number; closed: boolean; railed: boolean;
  branch: number; branch2: number; // branch indexes, -1 when unused
  state: number[]; // junction voltages for limiting
  name: string;
};
interface Circuit { nodes: number; branches: number; parts: Part[]; netNode: Map<string, number>; nets: Net[]; diagnostics: AnalogDiagnostic[]; }

const twoPin = (d: Definition) => [d.pins[0].id, d.pins[1].id];
const need = (part: { component: Component; name: string }, text: string, unit: Unit, example: string, fallback?: number): number => {
  const quantities = parseQuantities(text);
  const match = quantities?.find(q => q.unit === unit || q.unit === undefined);
  if (match && Number.isFinite(match.value)) return match.value;
  if (fallback !== undefined && !text.trim()) return fallback;
  return fault('value', `${part.name} needs a value such as ${example}.`, [part.component.id]);
};
const quantity = (list: Quantity[] | undefined, unit: Unit) => list?.find(q => q.unit === unit)?.value;

/** Builds the MNA netlist; throws Fault for anything the analysis cannot represent truthfully. */
function compile(request: AnalogRequest, registry: readonly AnalogCapability[], digital: (definitionId: string) => boolean): Circuit {
  const doc = request.document;
  if (doc.components.length > ANALOG_LIMITS.components) fault('size-limit', 'Circuit exceeds the electrical simulation size limit.');
  const models = identifyAnalogModels(doc.definitions, registry), definitions = new Map(doc.definitions.map(d => [d.id, d]));
  const diagnostics: AnalogDiagnostic[] = [];
  const logic = doc.components.filter(c => digital(c.definitionId)).map(c => c.id);
  const unsupported = doc.components.filter(c => !models.get(c.definitionId) && !digital(c.definitionId)).map(c => c.id);
  if (logic.length && doc.components.some(c => models.get(c.definitionId))) fault('mixed', 'This circuit mixes logic parts with electrical parts. Mixed-signal simulation is not available yet; simulate the logic and electrical sections as separate circuits.', logic);
  if (unsupported.length) fault('unsupported', 'Some parts have no electrical model (for example custom blocks, transformers, ICs or edited symbols). Replace or remove them to simulate.', unsupported);
  const nets = deriveNets(doc), byTerminal = new Map<string, Net>();
  for (const net of nets) for (const member of net.members) byTerminal.set(member, net);
  const terminal = (componentId: string, pinId: string) => byTerminal.get(`${anchorKey({ kind: 'pin', componentId, pinId })}[0]`)!;
  const groundNets = new Set<string>();
  for (const c of doc.components) if (models.get(c.definitionId) === 'ground') groundNets.add(terminal(c.id, definitions.get(c.definitionId)!.pins[0].id).id);
  const netNode = new Map<string, number>(); let nodes = 1;
  for (const net of nets) netNode.set(net.id, groundNets.has(net.id) ? 0 : nodes++);
  const sources = doc.components.some(c => ['dc-voltage', 'ac-voltage', 'current-source', 'power-rail'].includes(models.get(c.definitionId) ?? ''));
  if (sources && !groundNets.size) fault('ground', 'Add a Ground symbol to set the 0 V reference.');
  let branches = 0;
  const parts: Part[] = [];
  // One source per power-rail net; disagreeing rails on one net cannot both hold.
  const rails = new Map<string, { value: number; part: Part }>();
  for (const component of doc.components) {
    const definition = definitions.get(component.definitionId)!, model = models.get(component.definitionId)!;
    const name = component.reference || definition.name, text = String(component.properties.value ?? '');
    const n: Record<string, number> = {};
    for (const pin of definition.pins) n[pin.id] = netNode.get(terminal(component.id, pin.id).id)!;
    const part: Part = { component, definition, model, n, value: 0, value2: 0, closed: false, railed: false, branch: -1, branch2: -1, state: [0, 0], name };
    const parsed = parseQuantities(text);
    switch (model) {
      case 'resistor': case 'potentiometer': part.value = need(part, text, 'Ω', '10k'); if (part.value <= 0) fault('value', `${name} needs a positive resistance.`, [component.id]); break;
      case 'capacitor': part.value = need(part, text, 'F', '100nF'); break;
      case 'inductor': part.value = need(part, text, 'H', '1mH'); part.branch = branches++; break;
      case 'fuse': part.value = need(part, text, 'A', '1A', Infinity); break;
      case 'dc-voltage': part.value = need(part, text, 'V', '5V'); part.branch = branches++; break;
      case 'ac-voltage': {
        const amplitude = quantity(parsed, 'V') ?? parsed?.find(q => !q.unit)?.value;
        if (amplitude === undefined) fault('value', `${name} needs an amplitude such as 5V 1kHz.`, [component.id]);
        part.value = amplitude!; part.value2 = quantity(parsed, 'Hz') ?? 50; part.branch = branches++; break;
      }
      case 'current-source': part.value = need(part, text, 'A', '1mA'); break;
      case 'vcvs': case 'vccs': case 'ccvs': case 'cccs': part.value = need(part, text, 'V', '10', 1); if (model === 'vcvs' || model === 'ccvs') part.branch = branches++; if (model === 'ccvs' || model === 'cccs') part.branch2 = branches++; break;
      case 'zener': part.value = need(part, text, 'V', '5.1V', 5.1); break;
      case 'npn': case 'pnp': part.value = text.trim() ? Number(text.replace(/^(β|beta|hfe)\s*=?\s*/i, '')) : 100; if (!(part.value > 0)) fault('value', `${name} needs a current gain such as 100 (or leave it empty for 100).`, [component.id]); break;
      case 'nmos': case 'pmos': part.value = text.trim() ? need(part, text.replace(/^(vth|vt)\s*=?\s*/i, ''), 'V', '1V') : 1; break;
      case 'spst': case 'spdt': case 'push-no': case 'push-nc': part.closed = request.switches?.get(component.id) ?? switchDefault(model); break;
      case 'op-amp': case 'comparator': {
        const rail = (pin: string) => { const net = terminal(component.id, pin); return net.members.length > 1; };
        part.railed = rail('V-positive') && rail('V-');
        if (rail('V-positive') !== rail('V-')) diagnostics.push({ code: 'rails', severity: 'warning', message: `${name} has only one supply pin connected; its output is not limited.`, objectIds: [component.id] });
        part.branch = branches++; break;
      }
      case 'lamp': {
        const v = quantity(parsed, 'V'), w = quantity(parsed, 'W'), r = quantity(parsed, 'Ω') ?? parsed?.find(q => !q.unit)?.value;
        part.value = v !== undefined && w ? v * v / w : r ?? 100;
        if (!text.trim()) diagnostics.push({ code: 'default-value', severity: 'info', message: `${name} has no rating; it is modeled as 100 Ω. Set a value such as 12V 5W.`, objectIds: [component.id] });
        break;
      }
      case 'motor': part.value = need(part, text, 'Ω', '10', 10); break;
      case 'ammeter': part.branch = branches++; break;
      case 'power-rail': {
        const node = n[definition.pins[0].id], v = quantity(parsed, 'V') ?? parsed?.find(q => !q.unit)?.value;
        const value = v ?? 5;
        if (v === undefined) diagnostics.push({ code: 'default-value', severity: 'info', message: `${name} (${text || 'unnamed'}) has no voltage; it is modeled as 5 V. Set a value such as 3.3V.`, objectIds: [component.id] });
        if (node === 0) fault('short', `${name} is connected to ground, which shorts the supply.`, [component.id]);
        const existing = rails.get(String(node));
        if (existing && existing.value !== value) fault('rails', `Power rails on one net disagree (${existing.part.name} and ${name}).`, [existing.part.component.id, component.id]);
        part.value = value;
        if (!existing) { part.branch = branches++; rails.set(String(node), { value, part }); }
        break;
      }
      default: break;
    }
    parts.push(part);
  }
  for (const part of parts) if (part.model === 'voltmeter' || part.model === 'scope-probe' || part.model === 'ammeter') {
    const [a, b] = twoPin(part.definition);
    if (part.n[a] === part.n[b] && part.model !== 'ammeter') diagnostics.push({ code: 'meter-shorted', severity: 'warning', message: `${part.name} has both leads on the same net, so it always reads 0 V.`, objectIds: [part.component.id] });
  }
  return { nodes, branches, parts, netNode, nets, diagnostics };
}

/** Dense LU solve with partial pivoting; returns undefined for a singular system. */
function solve(A: Float64Array, b: Float64Array, n: number): Float64Array | undefined {
  const x = b.slice();
  for (let k = 0; k < n; k++) {
    let pivot = k, best = Math.abs(A[k * n + k]);
    for (let r = k + 1; r < n; r++) { const v = Math.abs(A[r * n + k]); if (v > best) { best = v; pivot = r; } }
    if (best < 1e-18) return undefined;
    if (pivot !== k) { for (let c = 0; c < n; c++) { const t = A[k * n + c]; A[k * n + c] = A[pivot * n + c]; A[pivot * n + c] = t; } const t = x[k]; x[k] = x[pivot]; x[pivot] = t; }
    const d = A[k * n + k];
    for (let r = k + 1; r < n; r++) {
      const f = A[r * n + k] / d; if (!f) continue;
      for (let c = k; c < n; c++) A[r * n + c] -= f * A[k * n + c];
      x[r] -= f * x[k];
    }
  }
  for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c]; x[r] = s / A[r * n + r]; }
  for (let i = 0; i < n; i++) if (!Number.isFinite(x[i])) return undefined;
  return x;
}

interface Mode { transient: boolean; h: number; t: number; scale: number; gmin: number; prev?: Float64Array; }
/** Assembles the linearized system at x. Returns whether any junction voltage was limited. */
function assemble(c: Circuit, x: Float64Array, mode: Mode, A: Float64Array, b: Float64Array): boolean {
  const N = c.nodes - 1, size = N + c.branches;
  A.fill(0); b.fill(0);
  const vi = (node: number) => node - 1, bi = (branch: number) => N + branch;
  const v = (node: number) => node ? x[node - 1] : 0, prevV = (node: number) => node && mode.prev ? mode.prev[node - 1] : 0;
  const add = (r: number, col: number, value: number) => { if (r >= 0 && col >= 0) A[r * size + col] += value; };
  const rhs = (r: number, value: number) => { if (r >= 0) b[r] += value; };
  const conductance = (p: number, q: number, g: number) => { add(vi(p), vi(p), g); add(vi(q), vi(q), g); add(vi(p), vi(q), -g); add(vi(q), vi(p), -g); };
  const current = (from: number, to: number, i: number) => { rhs(vi(from), -i); rhs(vi(to), i); };
  const voltage = (p: number, q: number, branch: number, value: number) => { const k = bi(branch); add(vi(p), k, 1); add(vi(q), k, -1); add(k, vi(p), 1); add(k, vi(q), -1); rhs(k, value); };
  /** Generic nonlinear terminal stamp: f[t] is current into the part at node t; J[t][j] = ∂f[t]/∂v[j]. */
  const nonlinear = (nodes: number[], f: number[], J: number[][], v0: number[]) => {
    for (let t = 0; t < nodes.length; t++) {
      let lin = f[t];
      for (let j = 0; j < nodes.length; j++) { add(vi(nodes[t]), vi(nodes[j]), J[t][j]); lin -= J[t][j] * v0[j]; }
      rhs(vi(nodes[t]), -lin);
    }
  };
  let limited = false;
  for (let i = 0; i < N; i++) A[i * size + i] += mode.gmin;
  for (const p of c.parts) {
    const pins = p.definition.pins.map(pin => p.n[pin.id]), [a, k] = pins;
    switch (p.model) {
      case 'resistor': case 'motor': case 'lamp': conductance(a, k, 1 / p.value); break;
      case 'fuse': conductance(a, k, 1e2); break;
      case 'potentiometer': { const w = p.n.wiper; conductance(a, w, 2 / p.value); conductance(w, k, 2 / p.value); break; }
      case 'capacitor': if (mode.transient) { const g = p.value / mode.h; conductance(a, k, g); current(k, a, g * (prevV(a) - prevV(k))); } break;
      case 'inductor': { const kk = bi(p.branch); add(vi(a), kk, 1); add(vi(k), kk, -1); add(kk, vi(a), 1); add(kk, vi(k), -1); if (mode.transient) { const z = p.value / mode.h; add(kk, kk, -z); rhs(kk, -z * (mode.prev ? mode.prev[kk] : 0)); } break; }
      case 'dc-voltage': voltage(a, k, p.branch, p.value * mode.scale); break;
      case 'ac-voltage': voltage(a, k, p.branch, mode.transient ? p.value * mode.scale * Math.sin(2 * Math.PI * p.value2 * mode.t) : 0); break;
      case 'current-source': current(a, k, p.value * mode.scale); break;
      case 'ammeter': voltage(a, k, p.branch, 0); break;
      case 'power-rail': if (p.branch >= 0) voltage(a, 0, p.branch, p.value * mode.scale); break;
      case 'spst': case 'push-no': case 'push-nc': if (p.closed) conductance(a, k, 1 / SWITCH_ON); break;
      case 'spdt': conductance(p.n['1'], p.closed ? p.n['2'] : p.n['3'], 1 / SWITCH_ON); break;
      case 'vcvs': case 'vccs': case 'ccvs': case 'cccs': {
        const cp = p.n['control-positive'], cn = p.n['control-'];
        if (p.model === 'vcvs') { const kk = bi(p.branch); add(vi(a), kk, 1); add(vi(k), kk, -1); add(kk, vi(a), 1); add(kk, vi(k), -1); add(kk, vi(cp), -p.value); add(kk, vi(cn), p.value); }
        if (p.model === 'vccs') { add(vi(a), vi(cp), p.value); add(vi(a), vi(cn), -p.value); add(vi(k), vi(cp), -p.value); add(vi(k), vi(cn), p.value); }
        if (p.model === 'ccvs' || p.model === 'cccs') {
          voltage(cp, cn, p.branch2, 0); const s = bi(p.branch2);
          if (p.model === 'cccs') { add(vi(a), s, p.value); add(vi(k), s, -p.value); }
          else { const kk = bi(p.branch); add(vi(a), kk, 1); add(vi(k), kk, -1); add(kk, vi(a), 1); add(kk, vi(k), -1); add(kk, s, -p.value); }
        }
        break;
      }
      case 'diode': case 'led': case 'zener': {
        const is = p.model === 'led' ? 1e-19 : 1e-14, nvt = (p.model === 'led' ? 2 : 1) * VT, vcrit = nvt * Math.log(nvt / (Math.SQRT2 * is));
        let vd = v(a) - v(k); const limitedVd = pnjlim(vd, p.state[0], nvt, vcrit); if (limitedVd !== vd) limited = true; vd = limitedVd;
        if (p.model === 'zener') { const rev = -(vd + p.value), lim = pnjlim(rev, p.state[1], nvt, vcrit); if (lim !== rev) { vd = -(lim + p.value); limited = true; } p.state[1] = -(vd + p.value); }
        p.state[0] = vd;
        let id = is * (limexp(vd / nvt) - 1), gd = is / nvt * dlimexp(vd / nvt);
        if (p.model === 'zener') { const u = -(vd + p.value) / nvt; id -= is * limexp(u); gd += is / nvt * dlimexp(u); }
        gd += GMIN;
        nonlinear([a, k], [id, -id], [[gd, -gd], [-gd, gd]], [vd, 0]);
        break;
      }
      case 'npn': case 'pnp': {
        const s = p.model === 'npn' ? 1 : -1, B = p.n.B, C = p.n.C, E = p.n.E, is = 1e-14, bf = p.value, br = 1;
        const vcrit = VT * Math.log(VT / (Math.SQRT2 * is));
        let vbe = s * (v(B) - v(E)), vbc = s * (v(B) - v(C));
        const lbe = pnjlim(vbe, p.state[0], VT, vcrit), lbc = pnjlim(vbc, p.state[1], VT, vcrit);
        if (lbe !== vbe || lbc !== vbc) limited = true; vbe = lbe; vbc = lbc; p.state[0] = vbe; p.state[1] = vbc;
        const ef = limexp(vbe / VT), er = limexp(vbc / VT), gf = is / VT * dlimexp(vbe / VT) + GMIN, gr = is / VT * dlimexp(vbc / VT) + GMIN;
        const iF = is * (ef - 1), iR = is * (er - 1);
        const ic = iF - iR - iR / br, ib = iF / bf + iR / br;
        // Currents into C, B, E as functions of (vbe, vbc); map to node voltages B, C, E.
        const dic = [gf, -gr - gr / br], dib = [gf / bf, gr / br];
        const row = (d: number[]) => { const dB = d[0] + d[1], dC = -d[1], dE = -d[0]; return [dB, dC, dE]; };
        const jc = row(dic), jb = row(dib), je = jc.map((value, i) => -value - jb[i]);
        // Polarity s flips both voltages and currents, so the Jacobian is unchanged.
        const nodesBCE = [B, C, E], fB = s * ib, fC = s * ic, fE = -s * (ib + ic);
        const vB0 = v(E) + s * vbe, vC0 = vB0 - s * vbc;
        nonlinear(nodesBCE, [fB, fC, fE], [jb, jc, je], [vB0, vC0, v(E)]);
        break;
      }
      case 'nmos': case 'pmos': {
        const s = p.model === 'nmos' ? 1 : -1, G = p.n.G, D0 = p.n.D, S0 = p.n.S, kp = 0.02, lambda = 0.01;
        const swap = s * (v(D0) - v(S0)) < 0, D = swap ? S0 : D0, S = swap ? D0 : S0;
        let vgs = s * (v(G) - v(S)); const vds = s * (v(D) - v(S));
        if (Math.abs(vgs - p.state[0]) > 0.5) { vgs = p.state[0] + Math.sign(vgs - p.state[0]) * 0.5; limited = true; } p.state[0] = vgs;
        const vov = vgs - p.value;
        let id = 0, gm = 0, gds = GMIN;
        if (vov > 0) {
          if (vds < vov) { id = kp * (vov * vds - vds * vds / 2) * (1 + lambda * vds); gm = kp * vds * (1 + lambda * vds); gds += kp * (vov - vds) * (1 + lambda * vds) + kp * (vov * vds - vds * vds / 2) * lambda; }
          else { id = kp / 2 * vov * vov * (1 + lambda * vds); gm = kp * vov * (1 + lambda * vds); gds += kp / 2 * vov * vov * lambda; }
        }
        // Current into the drain is s·id; derivatives w.r.t. vG, vD, vS.
        const jd = [gm, gds, -gm - gds], js = jd.map(value => -value);
        const vG0 = v(S) + s * vgs;
        nonlinear([G, D, S], [0, s * id, -s * id], [[0, 0, 0], jd, js], [vG0, v(D), v(S)]);
        break;
      }
      case 'op-amp': case 'comparator': {
        const P = p.n['-positive'], Nn = p.n['-'], out = p.n.out, kk = bi(p.branch), gain = p.model === 'op-amp' ? 1e5 : 1e6;
        const e = gain * (v(P) - v(Nn));
        let y = e, dy = gain;
        if (p.railed) {
          const hi = v(p.n['V-positive']), lo = v(p.n['V-']), half = (hi - lo) / 2, mid = (hi + lo) / 2;
          if (half > 1e-9) { const t = Math.tanh(e / half); y = mid + half * t; dy = gain * (1 - t * t); } else { y = mid; dy = 0; }
        }
        add(vi(out), kk, 1); add(kk, vi(out), 1); add(kk, vi(P), -dy); add(kk, vi(Nn), dy);
        rhs(kk, y - dy * (v(P) - v(Nn)));
        break;
      }
      default: break;
    }
  }
  return limited;
}

async function newton(c: Circuit, mode: Mode, start: Float64Array, signal: AbortSignal): Promise<{ x: Float64Array; iterations: number } | undefined> {
  const size = c.nodes - 1 + c.branches, A = new Float64Array(size * size), b = new Float64Array(size);
  let x: Float64Array = start.slice();
  for (let iteration = 1; iteration <= ANALOG_LIMITS.newton; iteration++) {
    if (signal.aborted) return undefined;
    const limited = assemble(c, x, mode, A, b);
    const next = solve(A, b, size); if (!next) return undefined;
    let converged = !limited;
    for (let i = 0; i < size && converged; i++) if (Math.abs(next[i] - x[i]) > 1e-6 + 1e-4 * Math.abs(next[i])) converged = false;
    x = next;
    if (converged && iteration > 1) return { x, iterations: iteration };
  }
  return undefined;
}
const resetStates = (c: Circuit) => { for (const p of c.parts) p.state = [0, 0]; };
/** Operating point with gmin stepping and source stepping as fallbacks. */
async function operatingPoint(c: Circuit, signal: AbortSignal, pause: AnalogYield) {
  const size = c.nodes - 1 + c.branches, zero = new Float64Array(size);
  resetStates(c);
  const direct = await newton(c, { transient: false, h: 0, t: 0, scale: 1, gmin: GMIN }, zero, signal);
  if (direct) return direct;
  let x: Float64Array = zero, total = 0;
  resetStates(c);
  for (const gmin of [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, GMIN]) {
    await pause(); const step = await newton(c, { transient: false, h: 0, t: 0, scale: 1, gmin }, x, signal);
    if (!step) { x = zero; total = -1; break; } x = step.x; total += step.iterations;
  }
  if (total > 0) return { x, iterations: total };
  resetStates(c); x = zero; total = 0;
  for (let i = 1; i <= 10; i++) {
    await pause(); const step = await newton(c, { transient: false, h: 0, t: 0, scale: i / 10, gmin: GMIN }, x, signal);
    if (!step) return undefined; x = step.x; total += step.iterations;
  }
  return { x, iterations: total };
}

function readings(c: Circuit, x: Float64Array, mode: Mode): Map<string, PartReading> {
  const N = c.nodes - 1, v = (node: number) => node ? x[node - 1] : 0, pv = (node: number) => node && mode.prev ? mode.prev[node - 1] : 0;
  const branch = (k: number) => x[N + k];
  const out = new Map<string, PartReading>();
  for (const p of c.parts) {
    const pinIds = p.definition.pins.map(pin => pin.id), pins: Record<string, number> = {};
    for (const id of pinIds) pins[id] = v(p.n[id]);
    const [a, k] = [p.n[pinIds[0]], p.n[pinIds[1] ?? pinIds[0]]], vab = v(a) - v(k);
    let current = 0, voltage = vab, state: string | undefined;
    const detail: PartReading['detail'] = [];
    switch (p.model) {
      case 'resistor': case 'motor': case 'lamp': current = vab / p.value; break;
      case 'fuse': current = vab * 1e2; if (Math.abs(current) > p.value) state = 'over rating'; break;
      case 'potentiometer': current = (v(a) - v(p.n.wiper)) * 2 / p.value; detail.push({ label: 'Wiper', value: v(p.n.wiper), unit: 'V' }); break;
      case 'capacitor': current = mode.transient ? p.value / mode.h * (vab - (pv(a) - pv(k))) : 0; break;
      case 'inductor': case 'dc-voltage': case 'ac-voltage': case 'ammeter': current = branch(p.branch); break;
      case 'power-rail': current = p.branch >= 0 ? branch(p.branch) : 0; voltage = v(a); break;
      case 'current-source': current = p.value * mode.scale; break;
      case 'spst': case 'push-no': case 'push-nc': current = p.closed ? vab / SWITCH_ON : 0; state = p.closed ? 'closed' : 'open'; break;
      case 'spdt': { const other = p.closed ? p.n['2'] : p.n['3']; current = (v(p.n['1']) - v(other)) / SWITCH_ON; state = p.closed ? '1–2' : '1–3'; break; }
      case 'vcvs': case 'ccvs': current = branch(p.branch); break;
      case 'vccs': current = p.value * (v(p.n['control-positive']) - v(p.n['control-'])); break;
      case 'cccs': current = p.value * branch(p.branch2); break;
      case 'diode': case 'led': case 'zener': {
        const is = p.model === 'led' ? 1e-19 : 1e-14, nvt = (p.model === 'led' ? 2 : 1) * VT;
        current = is * (limexp(vab / nvt) - 1) + GMIN * vab; if (p.model === 'zener') current -= is * limexp(-(vab + p.value) / nvt);
        state = current > 1e-6 ? 'forward' : p.model === 'zener' && current < -1e-6 ? 'breakdown' : 'off';
        break;
      }
      case 'npn': case 'pnp': {
        const s = p.model === 'npn' ? 1 : -1, vbe = s * (v(p.n.B) - v(p.n.E)), vbc = s * (v(p.n.B) - v(p.n.C)), is = 1e-14;
        const iF = is * (limexp(vbe / VT) - 1), iR = is * (limexp(vbc / VT) - 1), ic = s * (iF - 2 * iR), ib = s * (iF / p.value + iR);
        current = ic; voltage = v(p.n.C) - v(p.n.E);
        state = vbe < 0.5 ? 'cut-off' : vbc > 0.4 ? 'saturation' : 'active';
        detail.push({ label: 'V_BE', value: v(p.n.B) - v(p.n.E), unit: 'V' }, { label: 'V_CE', value: voltage, unit: 'V' }, { label: 'I_B', value: ib, unit: 'A' }, { label: 'I_C', value: ic, unit: 'A' });
        break;
      }
      case 'nmos': case 'pmos': {
        const s = p.model === 'nmos' ? 1 : -1, kp = 0.02, lambda = 0.01;
        let vd = v(p.n.D), vs = v(p.n.S); const swap = s * (vd - vs) < 0; if (swap) [vd, vs] = [vs, vd];
        const vgs = s * (v(p.n.G) - vs), vds = s * (vd - vs), vov = vgs - p.value;
        const id = vov <= 0 ? 0 : vds < vov ? kp * (vov * vds - vds * vds / 2) * (1 + lambda * vds) : kp / 2 * vov * vov * (1 + lambda * vds);
        current = s * id * (swap ? -1 : 1); voltage = v(p.n.D) - v(p.n.S);
        state = vov <= 0 ? 'cut-off' : vds < vov ? 'triode' : 'saturation';
        detail.push({ label: 'V_GS', value: v(p.n.G) - v(p.n.S), unit: 'V' }, { label: 'V_DS', value: voltage, unit: 'V' }, { label: 'I_D', value: current, unit: 'A' });
        break;
      }
      case 'op-amp': case 'comparator': {
        current = -branch(p.branch); voltage = v(p.n.out);
        const hi = v(p.n['V-positive']), lo = v(p.n['V-']);
        state = p.railed && (voltage > hi - 0.01 * (hi - lo) || voltage < lo + 0.01 * (hi - lo)) ? 'saturated' : 'linear';
        detail.push({ label: 'V_out', value: voltage, unit: 'V' }, { label: 'V+ − V−', value: v(p.n['-positive']) - v(p.n['-']), unit: 'V' }, { label: 'I_out', value: current, unit: 'A' });
        break;
      }
      default: break;
    }
    // Sources report absorbed power, so a supplying source shows negative power.
    const power = ['npn', 'pnp'].includes(p.model) ? voltage * current + (v(p.n.B) - v(p.n.E)) * (detail.find(d => d.label === 'I_B')?.value ?? 0) : ['op-amp', 'comparator', 'nmos', 'pmos'].includes(p.model) ? voltage * current : p.model === 'power-rail' ? voltage * current : vab * current;
    out.set(p.component.id, { componentId: p.component.id, model: p.model, voltage, current, power, pins, detail, state });
  }
  return out;
}
function netVoltages(c: Circuit, x: Float64Array) {
  const out = new Map<string, number>();
  for (const net of c.nets) { const node = c.netNode.get(net.id)!; out.set(net.id, node ? x[node - 1] : 0); }
  return out;
}
const failure = (error: unknown): AnalogDiagnostic => error instanceof Fault ? error.diagnostic : { code: 'execution', severity: 'error', message: 'Electrical simulation failed unexpectedly. Editing remains available.', objectIds: [] };
function warnings(c: Circuit, parts: Map<string, PartReading>): AnalogDiagnostic[] {
  const out: AnalogDiagnostic[] = [];
  for (const p of c.parts) {
    const r = parts.get(p.component.id)!;
    if (p.model === 'fuse' && r.state === 'over rating') out.push({ code: 'fuse', severity: 'warning', message: `${p.name} carries ${formatQuantity(Math.abs(r.current), 'A')}, above its ${formatQuantity(p.value, 'A')} rating.`, objectIds: [p.component.id] });
    if (p.model === 'led' && r.current > 0.03) out.push({ code: 'led-current', severity: 'warning', message: `${p.name} carries ${formatQuantity(r.current, 'A')}; typical LEDs are rated about 20 mA. Add a series resistor.`, objectIds: [p.component.id] });
    if ((p.model === 'diode' || p.model === 'led') && Math.abs(r.current) > 10) out.push({ code: 'short', severity: 'warning', message: `${p.name} conducts ${formatQuantity(r.current, 'A')}, which suggests it sits directly across a source.`, objectIds: [p.component.id] });
  }
  return out;
}

export async function analyzeOperatingPoint(request: AnalogRequest, registry: readonly AnalogCapability[], digital: (definitionId: string) => boolean, signal: AbortSignal, pause: AnalogYield): Promise<OperatingPoint> {
  const empty = { netVoltages: new Map<string, number>(), parts: new Map<string, PartReading>(), iterations: 0, nodes: 0 };
  try {
    const c = compile(request, registry, digital);
    if (c.nodes - 1 + c.branches > ANALOG_LIMITS.unknowns) fault('size-limit', 'Circuit has too many nodes for electrical simulation.');
    await pause(); if (signal.aborted) return { ...empty, status: 'cancelled', diagnostics: [] };
    const result = await operatingPoint(c, signal, pause);
    if (signal.aborted) return { ...empty, status: 'cancelled', diagnostics: [] };
    if (!result) fault('convergence', 'The operating point could not be solved. Check for a floating part, a loop of ideal voltage sources, or a current source with no path.');
    const mode: Mode = { transient: false, h: 0, t: 0, scale: 1, gmin: GMIN }, parts = readings(c, result!.x, mode);
    return { status: 'valid', netVoltages: netVoltages(c, result!.x), parts, diagnostics: [...c.diagnostics, ...warnings(c, parts)], iterations: result!.iterations, nodes: c.nodes };
  } catch (error) {
    return { ...empty, status: signal.aborted ? 'cancelled' : error instanceof Fault ? 'invalid' : 'failed', diagnostics: signal.aborted ? [] : [failure(error)] };
  }
}

/** Suggests a window that shows the circuit's dynamics: 5 periods of the slowest AC source, else 5 time constants. */
export function suggestDuration(request: AnalogRequest, registry: readonly AnalogCapability[]): number {
  const models = identifyAnalogModels(request.document.definitions, registry);
  let frequency = Infinity, maxC = 0, maxL = 0, maxR = 0, minR = Infinity;
  for (const c of request.document.components) {
    const model = models.get(c.definitionId), q = parseQuantities(String(c.properties.value ?? '')) ?? [];
    if (model === 'ac-voltage') frequency = Math.min(frequency, quantity(q, 'Hz') ?? 50);
    if (model === 'capacitor') maxC = Math.max(maxC, quantity(q, 'F') ?? q[0]?.value ?? 0);
    if (model === 'inductor') maxL = Math.max(maxL, quantity(q, 'H') ?? q[0]?.value ?? 0);
    if (model === 'resistor' || model === 'potentiometer') { const r = quantity(q, 'Ω') ?? q[0]?.value; if (r) { maxR = Math.max(maxR, r); minR = Math.min(minR, r); } }
  }
  const candidates: number[] = [];
  // AC circuits show five periods; otherwise five of the slowest time constants.
  if (Number.isFinite(frequency)) candidates.push(5 / frequency);
  else {
    if (maxC && maxR) candidates.push(5 * maxC * maxR);
    if (maxL && Number.isFinite(minR)) candidates.push(5 * maxL / minR);
  }
  const raw = candidates.length ? Math.max(...candidates) : 1e-3;
  // Round up to a 1–2–5 step so axis ticks stay readable.
  const decade = 10 ** Math.floor(Math.log10(raw)), steps = [1, 2, 5, 10].map(m => m * decade);
  return Math.min(10, Math.max(1e-6, steps.find(s => s >= raw * 0.999) ?? raw));
}

export async function analyzeTransient(request: AnalogRequest & { duration: number }, registry: readonly AnalogCapability[], digital: (definitionId: string) => boolean, signal: AbortSignal, pause: AnalogYield): Promise<Waveforms> {
  const blank = { time: new Float64Array(0), net: new Map<string, Float64Array>(), partVoltage: new Map<string, Float64Array>(), partCurrent: new Map<string, Float64Array>(), duration: request.duration };
  try {
    const c = compile(request, registry, digital), size = c.nodes - 1 + c.branches;
    if (size > ANALOG_LIMITS.transientUnknowns) fault('size-limit', 'Circuit is too large for a transient run; the operating point is still available.');
    if (!(request.duration > 0)) fault('duration', 'Choose a positive duration.');
    const steps = Math.max(ANALOG_LIMITS.minSteps, Math.min(ANALOG_LIMITS.steps, Math.floor(ANALOG_LIMITS.flops / Math.max(1, size ** 3 * 3))));
    const h = request.duration / steps;
    const time = new Float64Array(steps + 1), net = new Map<string, Float64Array>(), partVoltage = new Map<string, Float64Array>(), partCurrent = new Map<string, Float64Array>();
    for (const n of c.nets) net.set(n.id, new Float64Array(steps + 1));
    for (const p of c.parts) { partVoltage.set(p.component.id, new Float64Array(steps + 1)); partCurrent.set(p.component.id, new Float64Array(steps + 1)); }
    const record = (i: number, t: number, x: Float64Array, mode: Mode) => {
      time[i] = t;
      for (const n of c.nets) { const node = c.netNode.get(n.id)!; net.get(n.id)![i] = node ? x[node - 1] : 0; }
      for (const [id, r] of readings(c, x, mode)) { partVoltage.get(id)![i] = r.voltage; partCurrent.get(id)![i] = r.current; }
    };
    resetStates(c);
    // Power-on: a tiny first step makes capacitors act as 0 V and inductors as 0 A at t = 0.
    let prev: Float64Array = new Float64Array(size);
    const tiny: Mode = { transient: true, h: h * 1e-6, t: 0, scale: 1, gmin: GMIN, prev };
    const first = await newton(c, tiny, prev, signal);
    if (!first) fault('convergence', 'The circuit could not be solved at power-on.');
    record(0, 0, first!.x, tiny); prev = first!.x;
    for (let i = 1; i <= steps; i++) {
      if (i % 25 === 0) { await pause(); if (signal.aborted) return { ...blank, status: 'cancelled', diagnostics: [] }; }
      let x: Float64Array | undefined, mode: Mode = { transient: true, h, t: i * h, scale: 1, gmin: GMIN, prev };
      const step = await newton(c, mode, prev, signal);
      if (step) x = step.x;
      else {
        // Retry with smaller sub-steps before giving up.
        let sub: Float64Array = prev; const parts = 8;
        for (let j = 1; j <= parts; j++) { const m: Mode = { transient: true, h: h / parts, t: (i - 1) * h + j * h / parts, scale: 1, gmin: GMIN, prev: sub }; const r = await newton(c, m, sub, signal); if (!r) { sub = new Float64Array(0); break; } sub = r.x; mode = m; }
        if (sub.length) x = sub;
      }
      if (signal.aborted) return { ...blank, status: 'cancelled', diagnostics: [] };
      if (!x) fault('convergence', `The transient run could not converge at t = ${formatQuantity(i * h, 's')}.`);
      record(i, i * h, x!, mode); prev = x!;
    }
    return { status: 'valid', time, net, partVoltage, partCurrent, duration: request.duration, diagnostics: c.diagnostics };
  } catch (error) {
    return { ...blank, status: signal.aborted ? 'cancelled' : error instanceof Fault ? 'invalid' : 'failed', diagnostics: signal.aborted ? [] : [failure(error)] };
  }
}
export { SWITCH_MODELS };
