import { describe, expect, it } from 'vitest';
import { emptyDocument, type Anchor, type CircuitDocument } from '../../src/core/model/document';
import { addWire, place } from '../../src/core/commands/operations';
import { findPart } from '../../src/components/definitions/library';
import { analogCapabilities } from '../../src/components/definitions/analog';
import { digitalCapabilities } from '../../src/components/definitions/digital';
import { identifyDigitalModels } from '../../src/core/topology/digital';
import { analyzeOperatingPoint, analyzeTransient, suggestDuration } from '../../src/core/analog/engine';
import { formatQuantity, parseQuantities, parseQuantity } from '../../src/core/analog/units';

const registry = analogCapabilities(), digitalRegistry = digitalCapabilities();
const digital = (doc: CircuitDocument) => { const models = identifyDigitalModels(doc.definitions, digitalRegistry); return (id: string) => !!models.get(id); };
const quick = async () => {};
const op = (doc: CircuitDocument, switches?: Map<string, boolean>) => analyzeOperatingPoint({ document: doc, switches }, registry, digital(doc), new AbortController().signal, quick);
const tran = (doc: CircuitDocument, duration: number) => analyzeTransient({ document: doc, duration }, registry, digital(doc), new AbortController().signal, quick);
function circuit() {
  const doc = emptyDocument('test'); let x = 0;
  const add = (name: string, value?: string, reference?: string) => { const c = place(doc, findPart(name), { x: (x += 240), y: 0 }); if (value !== undefined) c.properties.value = value; if (reference) c.reference = reference; return c.id; };
  const pin = (componentId: string, pinId: string): Anchor => ({ kind: 'pin', componentId, pinId });
  const wire = (a: [string, string], b: [string, string]) => addWire(doc, pin(...a), pin(...b));
  return { doc, add, wire };
}
const reading = (r: Awaited<ReturnType<typeof op>>, id: string) => r.parts.get(id)!;

describe('engineering quantities', () => {
  it('parses SI prefixes, R-notation, units and paired values', () => {
    expect(parseQuantity('10k')?.value).toBe(1e4); expect(parseQuantity('4k7')?.value).toBeCloseTo(4700); expect(parseQuantity('2R2')?.value).toBeCloseTo(2.2);
    expect(parseQuantity('100nF')?.value).toBeCloseTo(100e-9, 15); expect(parseQuantity('100nF')?.unit).toBe('F'); expect(parseQuantity('10µF')?.value).toBeCloseTo(10e-6); expect(parseQuantity('10uF')?.value).toBeCloseTo(10e-6);
    expect(parseQuantity('1meg')?.value).toBe(1e6); expect(parseQuantity('1M')?.value).toBe(1e6); expect(parseQuantity('1m')?.value).toBe(1e-3);
    expect(parseQuantity('4.7 kΩ')).toEqual({ value: 4700, unit: 'Ω' }); expect(parseQuantity('-5V')).toEqual({ value: -5, unit: 'V' }); expect(parseQuantity('abc')).toBeUndefined();
    expect(parseQuantities('12V 5W')).toEqual([{ value: 12, unit: 'V' }, { value: 5, unit: 'W' }]); expect(parseQuantities('5V 1kHz')![1]).toEqual({ value: 1000, unit: 'Hz' });
  });
  it('formats in engineering notation with three significant digits', () => {
    expect(formatQuantity(4.7, 'V')).toBe('4.70 V'); expect(formatQuantity(-0.00125, 'A')).toBe('−1.25 mA'); expect(formatQuantity(0, 'A')).toBe('0 A');
    expect(formatQuantity(0.0009996, 'A')).toBe('1.00 mA'); expect(formatQuantity(47000, 'Ω')).toBe('47.0 kΩ'); expect(formatQuantity(2.2e-6, 'F')).toBe('2.20 µF');
  });
});

describe('DC operating point', () => {
  it('voltage divider and Ohm’s law, with source power delivered', async () => {
    const { doc, add, wire } = circuit();
    const v = add('DC voltage source', '10V'), r1 = add('Resistor', '1k'), r2 = add('Resistor', '3k'), g = add('Ground');
    wire([v, '1'], [r1, '1']); wire([r1, '2'], [r2, '1']); wire([r2, '2'], [v, '2']); wire([v, '2'], [g, '1']);
    const r = await op(doc); expect(r.status).toBe('valid');
    expect(reading(r, r2).voltage).toBeCloseTo(7.5, 6); expect(reading(r, r1).current).toBeCloseTo(2.5e-3, 9);
    expect(reading(r, v).power).toBeCloseTo(-0.025, 6); expect(reading(r, r1).power + reading(r, r2).power).toBeCloseTo(0.025, 6);
  });
  it('current source, ammeter and voltmeter readings', async () => {
    const { doc, add, wire } = circuit();
    const i = add('Current source', '2mA'), am = add('Ammeter'), r = add('Resistor', '4.7k'), vm = add('Voltmeter'), g = add('Ground');
    wire([i, '2'], [am, '1']); wire([am, '2'], [r, '1']); wire([r, '2'], [i, '1']); wire([i, '1'], [g, '1']); wire([vm, '1'], [r, '1']); wire([vm, '2'], [r, '2']);
    const out = await op(doc); expect(out.status).toBe('valid');
    expect(reading(out, am).current).toBeCloseTo(2e-3, 9); expect(reading(out, vm).voltage).toBeCloseTo(9.4, 6);
  });
  it('silicon diode and LED forward drops are physically plausible', async () => {
    for (const [part, low, high] of [['Diode', 0.55, 0.8], ['LED', 1.7, 2.3]] as const) {
      const { doc, add, wire } = circuit();
      const v = add('DC voltage source', '5V'), r = add('Resistor', '330'), d = add(part), g = add('Ground');
      wire([v, '1'], [r, '1']); wire([r, '2'], [d, '1']); wire([d, '2'], [v, '2']); wire([v, '2'], [g, '1']);
      const out = await op(doc); expect(out.status).toBe('valid');
      const vd = reading(out, d).voltage; expect(vd).toBeGreaterThan(low); expect(vd).toBeLessThan(high);
      expect(reading(out, d).current).toBeCloseTo((5 - vd) / 330, 6); expect(reading(out, d).state).toBe('forward');
    }
  });
  it('Zener regulates near its breakdown voltage', async () => {
    const { doc, add, wire } = circuit();
    const v = add('DC voltage source', '12V'), r = add('Resistor', '1k'), z = add('Zener diode', '5.1V'), g = add('Ground');
    wire([v, '1'], [r, '1']); wire([r, '2'], [z, '2']); wire([z, '1'], [v, '2']); wire([v, '2'], [g, '1']);
    const out = await op(doc); expect(out.status).toBe('valid');
    const vz = -reading(out, z).voltage; expect(vz).toBeGreaterThan(5.1); expect(vz).toBeLessThan(5.9); expect(reading(out, z).state).toBe('breakdown');
  });
  it('NPN common-emitter stage sits in the active region with I_C ≈ β·I_B', async () => {
    const { doc, add, wire } = circuit();
    const vcc = add('DC voltage source', '10V'), vb = add('DC voltage source', '5V'), rb = add('Resistor', '100k'), rc = add('Resistor', '1k'), q = add('NPN', '100'), g = add('Ground');
    wire([vcc, '1'], [rc, '1']); wire([rc, '2'], [q, 'C']); wire([vb, '1'], [rb, '1']); wire([rb, '2'], [q, 'B']); wire([q, 'E'], [g, '1']); wire([vcc, '2'], [g, '1']); wire([vb, '2'], [g, '1']);
    const out = await op(doc); expect(out.status).toBe('valid'); const t = reading(out, q);
    expect(t.state).toBe('active'); const ib = t.detail.find(d => d.label === 'I_B')!.value;
    expect(ib).toBeGreaterThan(40e-6); expect(ib).toBeLessThan(45e-6); expect(t.current / ib).toBeCloseTo(100, 0); expect(t.voltage).toBeCloseTo(10 - t.current * 1000, 4);
  });
  it('op-amp inverting amplifier: linear gain without rails, clipping at its rails', async () => {
    for (const [vin, rails, expected] of [[1, false, -4.7], [3, true, -5]] as const) {
      const { doc, add, wire } = circuit();
      const v = add('DC voltage source', `${vin}V`), rin = add('Resistor', '10k'), rf = add('Resistor', '47k'), amp = add('Op-amp'), g = add('Ground');
      wire([v, '1'], [rin, '1']); wire([rin, '2'], [amp, '-']); wire([rf, '1'], [amp, '-']); wire([rf, '2'], [amp, 'out']); wire([amp, '-positive'], [g, '1']); wire([v, '2'], [g, '1']);
      if (rails) { const hi = add('DC voltage source', '5V'), lo = add('DC voltage source', '5V'); wire([hi, '1'], [amp, 'V-positive']); wire([hi, '2'], [g, '1']); wire([lo, '1'], [g, '1']); wire([lo, '2'], [amp, 'V-']); }
      const out = await op(doc); expect(out.status).toBe('valid');
      expect(reading(out, amp).voltage).toBeCloseTo(expected, 2); expect(reading(out, amp).state).toBe(rails ? 'saturated' : 'linear');
    }
  });
  it('switches are temporary runtime state and change the solution', async () => {
    const { doc, add, wire } = circuit();
    const v = add('DC voltage source', '9V'), s = add('SPST switch'), r = add('Resistor', '1k'), g = add('Ground');
    wire([v, '1'], [s, '1']); wire([s, '2'], [r, '1']); wire([r, '2'], [v, '2']); wire([v, '2'], [g, '1']);
    expect(reading(await op(doc), r).current).toBeCloseTo(0, 9);
    const closed = await op(doc, new Map([[s, true]])); expect(reading(closed, r).current).toBeCloseTo(9e-3, 6); expect(reading(closed, s).state).toBe('closed');
  });
  it('rejects mixed logic/electrical circuits, missing ground and unmodeled parts with actionable messages', async () => {
    const mixed = circuit(); mixed.add('DC voltage source', '5V'); const gate = mixed.add('AND'); mixed.add('Ground');
    const m = await op(mixed.doc); expect(m.status).toBe('invalid'); expect(m.diagnostics[0]).toMatchObject({ code: 'mixed', objectIds: [gate] });
    const floating = circuit(); floating.add('DC voltage source', '5V'); floating.add('Resistor', '1k');
    expect((await op(floating.doc)).diagnostics[0].code).toBe('ground');
    const custom = circuit(); custom.add('Transformer'); custom.add('Ground');
    expect((await op(custom.doc)).diagnostics[0].code).toBe('unsupported');
    const blank = circuit(); const r = blank.add('Resistor', ''); blank.add('Ground');
    expect((await op(blank.doc)).diagnostics[0]).toMatchObject({ code: 'value', objectIds: [r] });
  });
});

describe('transient', () => {
  it('RC charging follows 1 − e^(−t/τ) from a power-on start', async () => {
    const { doc, add, wire } = circuit();
    const v = add('DC voltage source', '5V'), r = add('Resistor', '1k'), c = add('Capacitor', '1µF'), g = add('Ground');
    wire([v, '1'], [r, '1']); wire([r, '2'], [c, '1']); wire([c, '2'], [v, '2']); wire([v, '2'], [g, '1']);
    expect(suggestDuration({ document: doc }, registry)).toBeCloseTo(5e-3, 9);
    const w = await tran(doc, 5e-3); expect(w.status).toBe('valid');
    const vc = w.partVoltage.get(c)!, at = (t: number) => vc[Math.round(t / 5e-3 * (w.time.length - 1))];
    expect(vc[0]).toBeCloseTo(0, 3); expect(at(1e-3)).toBeCloseTo(5 * (1 - Math.exp(-1)), 1); expect(at(5e-3)).toBeCloseTo(5 * (1 - Math.exp(-5)), 1);
    expect(w.partCurrent.get(r)![1]).toBeLessThanOrEqual(5e-3);
  });
  it('RL current rises toward V/R and an AC source reaches its peak amplitude', async () => {
    const rl = circuit();
    const v = rl.add('DC voltage source', '10V'), r = rl.add('Resistor', '100'), l = rl.add('Inductor', '10mH'), g = rl.add('Ground');
    rl.wire([v, '1'], [r, '1']); rl.wire([r, '2'], [l, '1']); rl.wire([l, '2'], [v, '2']); rl.wire([v, '2'], [g, '1']);
    const w = await tran(rl.doc, 5e-4); const il = w.partCurrent.get(l)!;
    expect(il[0]).toBeCloseTo(0, 4); expect(il[il.length - 1]).toBeCloseTo(0.1 * (1 - Math.exp(-5)), 2);
    const ac = circuit();
    const s = ac.add('AC voltage source', '5V 1kHz'), load = ac.add('Resistor', '1k'), g2 = ac.add('Ground');
    ac.wire([s, '1'], [load, '1']); ac.wire([load, '2'], [s, '2']); ac.wire([s, '2'], [g2, '1']);
    const wave = await tran(ac.doc, suggestDuration({ document: ac.doc }, registry)), vr = wave.partVoltage.get(load)!;
    expect(Math.max(...vr)).toBeCloseTo(5, 1); expect(Math.min(...vr)).toBeCloseTo(-5, 1);
  });
});
