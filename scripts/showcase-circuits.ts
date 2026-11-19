// Editable demonstration drawings. These illustrate documentation workflows;
// they are not simulated, electrically qualified reference designs.
import { emptyDocument, getDefinition, parseDocument, serializeDocument, uid, type Anchor, type CircuitDocument, type Component, type Definition, type Point } from '../src/core/model/document';
import { annotate, freeNode, place, splitWire } from '../src/core/commands/operations';
import { anchorPosition, wireContainsPoint } from '../src/core/geometry/geometry';
import { findPart, makeBusSplitter, makeCustomBlock, makeGate } from '../src/components/definitions/library';
import { diagnostics } from '../src/core/topology/nets';
import { overlapWarnings } from '../src/editor/render/drawing';

class Sheet {
  doc: CircuitDocument;
  x = 0; y = 0;
  constructor(title: string) { this.doc = emptyDocument(title); }
  at(x: number, y: number) { this.x = x; this.y = y; }
  point(x: number, y: number): Point { return { x: this.x + x, y: this.y + y }; }
  text(text: string, x: number, y: number, size = 14) {
    const id = annotate(this.doc, 'text', text, this.point(x, y));
    this.doc.annotations.find(a => a.id === id)!.fontSize = size;
  }
  part(name: string | Definition, x: number, y: number, value = '', rotation: Component['rotation'] = 0, reference?: string) {
    const c = place(this.doc, typeof name === 'string' ? findPart(name) : name, this.point(x, y), rotation);
    c.properties.value = value;
    if (reference) c.reference = reference;
    return c;
  }
  pin(c: Component, id = '1'): Anchor { return { kind: 'pin', componentId: c.id, pinId: id }; }
  node(x: number, y: number): Anchor { return freeNode(this.doc, this.point(x, y)); }
  /** Joins an existing wire (or its end node) at an explicit point, creating a junction. */
  tap(x: number, y: number): Anchor {
    const p = this.point(x, y), node = this.doc.nodes.find(n => n.position.x === p.x && n.position.y === p.y);
    if (node) return { kind: 'node', nodeId: node.id };
    const wire = this.doc.wires.find(w => wireContainsPoint(this.doc, w, p));
    if (!wire) throw new Error(`No wire at ${p.x}, ${p.y}`);
    return splitWire(this.doc, wire.id, p);
  }
  /** Renames the automatic net label that place() adds to grounds and supply rails. */
  rename(c: Component, name: string) { const label = this.doc.annotations.find(a => a.kind === 'label' && a.anchor?.kind === 'pin' && a.anchor.componentId === c.id); if (label) label.text = name; }
  wire(a: Anchor, b: Anchor, bends: number[][] = [], width = 1) {
    // Explicit, editable drafting routes keep this gallery deterministic.
    this.doc.wires.push({ id: uid('w'), a, b, width, locked: false,
      route: { mode: 'manual', geometry: 'orthogonal', horizontalFirst: true,
        vertices: bends.map(([x, y]) => ({ ...this.point(x, y), id: uid('bend'), locked: true })) } });
  }
  net(name: string, a: Anchor, dx = 8, dy = -8) {
    const p = anchorPosition(this.doc, a);
    annotate(this.doc, 'label', name, { x: p.x + dx, y: p.y + dy }, a, true);
  }
  terminal(name: string, x: number, y: number, role: 'source' | 'sink' = 'source') {
    const c = this.part('Test point', x, y, '', role === 'source' ? 270 : 90);
    c.reference = '';
    this.net(name, this.pin(c), role === 'source' ? -24 : 8, -16);
    return this.pin(c);
  }
  section(n: string, title: string, subtitle: string) {
    this.text(`${n}  ${title}`, 0, 0, 19);
    this.text(subtitle, 0, 24, 12);
    this.y += 32;
  }
}
type Stage = (s: Sheet) => void;

const inputFilter: Stage = s => {
  s.section('01', 'Protected input', 'Fuse, reverse-polarity diode and reservoir');
  const v = s.part('DC voltage source', 32, 160, '9 V', 90);
  const f = s.part('Fuse', 144, 80, '250 mA');
  const d = s.part('Diode', 288, 80, '1N5819');
  const c = s.part('Polarized capacitor', 384, 160, '100 uF', 90);
  const top = s.node(384, 80), ground = s.node(384, 256);
  s.wire(s.pin(v), s.pin(f), [[32, 80]]); s.wire(s.pin(f, '2'), s.pin(d));
  s.wire(s.pin(d, '2'), top); s.wire(top, s.pin(c)); s.wire(s.pin(c, '2'), ground);
  s.wire(s.pin(v, '2'), ground, [[32, 256]]); s.net('VIN', top); s.net('GND', ground);
};
const regulator = (volts: string, num: string): Stage => s => {
  s.section(num, `${volts} supply`, 'Custom regulator block with local decoupling');
  const def = makeCustomBlock(`LDO ${volts}`, 'in,IN,left,power,1\nout,OUT,right,power,1\ngnd,GND,bottom,power,1');
  const u = s.part(def, 224, 128);
  const ci = s.part('Capacitor', 48, 192, '1 uF', 90), co = s.part('Capacitor', 368, 192, '10 uF', 90);
  const ni = s.node(48, 128), no = s.node(368, 128), ng = s.node(224, 264);
  s.wire(ni, s.pin(u, 'in')); s.wire(s.pin(u, 'out'), no);
  s.wire(ni, s.pin(ci)); s.wire(no, s.pin(co)); s.wire(s.pin(ci, '2'), ng, [[48, 264]]);
  s.wire(s.pin(co, '2'), ng, [[368, 264]]); s.wire(s.pin(u, 'gnd'), ng);
  s.net('VIN', ni, 0, -16); s.net(volts, no); s.net('GND', ng);
  const tp = s.part('Test point', 416, 128, '', 90); s.wire(no, s.pin(tp));
};
const railLoads = (number = '04'): Stage => s => {
  s.section(number, 'Rail monitor', 'Power indicator, output load and voltage probe');
  const r = s.part('Resistor', 64, 112, '1k', 90), led = s.part('LED', 64, 240, 'Green', 90);
  const load = s.part('Resistor', 240, 176, '1k load', 90), meter = s.part('Voltmeter', 384, 176, '', 90);
  const a = s.node(64, 48), b = s.node(240, 48), c = s.node(384, 48), g = s.node(240, 304);
  s.wire(a, b); s.wire(b, c); s.wire(a, s.pin(r)); s.wire(s.pin(r, '2'), s.pin(led));
  s.wire(b, s.pin(load)); s.wire(c, s.pin(meter)); s.wire(s.pin(led, '2'), g, [[64, 304]]);
  s.wire(s.pin(load, '2'), g); s.wire(s.pin(meter, '2'), g, [[384, 304]]);
  s.net('3V3', a, 0, -12); s.net('GND', g);
};

const sensor: Stage = s => {
  s.section('01', 'Sensor & bias', 'Photodiode front end with a quiet reference');
  const pd = s.part('Photodiode', 48, 160, '', 90), rb = s.part('Resistor', 224, 160, '100k', 90);
  const cb = s.part('Capacitor', 368, 160, '100 nF', 90);
  const a = s.node(48, 64), b = s.node(224, 64), cp = s.node(368, 64), g = s.node(224, 264);
  s.wire(a, b); s.wire(a, s.pin(pd)); s.wire(b, s.pin(rb)); s.wire(b, cp); s.wire(cp, s.pin(cb));
  s.wire(s.pin(pd, '2'), g, [[48, 264]]); s.wire(s.pin(rb, '2'), g); s.wire(s.pin(cb, '2'), g, [[368, 264]]);
  s.net('SENSOR', b); s.net('GND', g);
  const p = s.part('Test point', 416, 64, '', 90); s.wire(cp, s.pin(p));
};
const lowPass: Stage = s => {
  s.section('02', 'Two-pole filter', 'Cascaded RC stages suppress high-frequency noise');
  const r1 = s.part('Resistor', 128, 96, '10k'), r2 = s.part('Resistor', 320, 96, '10k');
  const c1 = s.part('Capacitor', 224, 192, '10 nF', 90), c2 = s.part('Capacitor', 416, 192, '10 nF', 90);
  const a = s.terminal('SENSOR', 16, 96), n1 = s.node(224, 96), n2 = s.node(416, 96), g = s.node(224, 272);
  s.wire(a, s.pin(r1)); s.wire(s.pin(r1, '2'), n1); s.wire(n1, s.pin(r2)); s.wire(s.pin(r2, '2'), n2);
  s.wire(n1, s.pin(c1)); s.wire(n2, s.pin(c2)); s.wire(s.pin(c1, '2'), g); s.wire(s.pin(c2, '2'), g, [[416, 272]]);
  s.net('FILTERED', n2, -72, -16); s.net('GND', g);
};
const amplifier: Stage = s => {
  s.section('03', 'Gain stage', 'Non-inverting amplifier with explicit feedback');
  const u = s.part('Op-amp', 224, 208);
  const rf = s.part('Resistor', 224, 80, '90k'), rg = s.part('Resistor', 80, 272, '10k', 90);
  const a = s.terminal('FILTERED', 16, 144), n = s.node(112, 192), out = s.node(352, 208);
  s.wire(a, s.pin(u, '-positive'), [[160, 144], [160, 224]]); s.wire(n, s.pin(u, '-'));
  s.wire(n, s.pin(rg), [[80, 192]]); s.wire(n, s.pin(rf), [[112, 80]]);
  s.wire(s.pin(rf, '2'), out, [[352, 80]]); s.wire(s.pin(u, 'out'), out);
  s.net('GND', s.pin(rg, '2')); s.net('3V3', s.pin(u, 'V-positive'), 40, -12); s.net('GND', s.pin(u, 'V-'), 8, 16);
  const tp = s.part('Test point', 416, 208, '', 90); s.wire(out, s.pin(tp)); s.net('ADC_IN', out, 8, -12);
};
const threshold: Stage = s => {
  s.section('04', 'Threshold output', 'Comparator, reference divider and pull-up');
  const u = s.part('Comparator', 256, 160), r1 = s.part('Resistor', 64, 96, '47k', 90);
  const r2 = s.part('Resistor', 64, 224, '47k', 90), pull = s.part('Resistor', 384, 96, '10k', 90);
  const ref = s.node(64, 160), output = s.node(384, 160);
  s.wire(s.pin(r1, '2'), ref); s.wire(ref, s.pin(r2)); s.wire(ref, s.pin(u, '-'), [[160, 160], [160, 144]]);
  const a = s.terminal('ADC_IN', 16, 312); s.wire(a, s.pin(u, '-positive'), [[192, 312], [192, 176]]);
  s.wire(s.pin(u, 'out'), output); s.wire(s.pin(pull, '2'), output);
  s.net('3V3', s.pin(r1)); s.net('GND', s.pin(r2, '2')); s.net('3V3', s.pin(pull));
  s.net('3V3', s.pin(u, 'V-positive'), 40, -12); s.net('GND', s.pin(u, 'V-'), 8, 16); s.net('ALERT', output);
};

const adder = (bit: number): Stage => s => {
  s.section(`0${bit + 1}`, `Adder / bit ${bit}`, 'SUM = A xor B xor C; carry uses explicit gates');
  const xor1 = s.part('XOR', 144, 96), xor2 = s.part('XOR', 336, 96);
  const and1 = s.part('AND', 144, 240), and2 = s.part('AND', 336, 240), or = s.part('OR', 432, 312);
  const ia = s.node(48, 88), ib = s.node(32, 104), cin = s.node(240, 104), split = s.node(224, 96);
  s.net(`A${bit}`, ia, -24, -12); s.net(`B${bit}`, ib, -24, 24); s.net(`C${bit}`, cin, 0, 32);
  s.wire(ia, s.pin(xor1, 'in-0')); s.wire(ib, s.pin(xor1, 'in-1'));
  s.wire(s.pin(xor1, 'out'), split); s.wire(split, s.pin(xor2, 'in-0'), [[256, 96], [256, 88]]);
  s.wire(cin, s.pin(xor2, 'in-1'));
  s.wire(ia, s.pin(and1, 'in-0'), [[48, 232]]); s.wire(ib, s.pin(and1, 'in-1'), [[32, 248]]);
  s.wire(split, s.pin(and2, 'in-0'), [[224, 176], [256, 176], [256, 232]]);
  s.wire(cin, s.pin(and2, 'in-1'), [[240, 248]]);
  s.wire(s.pin(and1, 'out'), s.pin(or, 'in-0'), [[208, 240], [208, 304]]);
  s.wire(s.pin(and2, 'out'), s.pin(or, 'in-1'), [[400, 240], [400, 320]]);
  s.net(`S${bit}`, s.pin(xor2, 'out'), 16, -8); s.net(`C${bit + 1}`, s.pin(or, 'out'), 8, -8);
};
const logicControl: Stage = s => {
  s.section('03', 'Output control', 'Enable, overflow detection and status outputs');
  const x = s.part('XOR', 112, 96), a = s.part('AND', 304, 96), n = s.part('NOT', 112, 240);
  const o = s.part('OR', 304, 240), p1 = s.part('Output probe', 448, 96), p2 = s.part('Output probe', 448, 240);
  s.net('C1', s.pin(x, 'in-0'), -32, -12); s.net('C2', s.pin(x, 'in-1'), -32, 24);
  s.net('ENABLE', s.pin(a, 'in-1'), -24, 28); s.net('RESET', s.pin(n, 'in-0'), -48, -12);
  s.net('ENABLE', s.pin(o, 'in-1'), -24, 28);
  s.wire(s.pin(x, 'out'), s.pin(a, 'in-0'), [[208, 96], [208, 88]]);
  s.wire(s.pin(n, 'out'), s.pin(o, 'in-0'), [[208, 240], [208, 232]]);
  s.wire(s.pin(a, 'out'), s.pin(p1, 'in-0')); s.wire(s.pin(o, 'out'), s.pin(p2, 'in-0'));
};
const counter: Stage = s => {
  s.section('04', 'Clock & state', 'Counter and decoder with named control nets');
  const clk = s.part('Clock', 64, 112), ctr = s.part('Counter', 256, 128), dec = s.part('Decoder', 256, 272);
  s.wire(s.pin(clk, 'out-0'), s.pin(ctr, 'in-0'), [[160, 112]]);
  s.net('ENABLE', s.pin(ctr, 'in-1'), -48, 12); s.net('RESET', s.pin(ctr, 'in-2'), -48, 24);
  for (let i = 0; i < 4; i++) s.net(`Q${i}`, s.pin(ctr, `out-${i}`), 16, i * 12 - 48);
  s.net('Q0', s.pin(dec, 'in-0'), -32, -12); s.net('Q1', s.pin(dec, 'in-1'), -32, 24);
  for (let i = 0; i < 4; i++) { const tp = s.part('Test point', 416 + (i % 2) * 80, 216 + i * 48, '', 90); s.wire(s.pin(dec, `out-${i}`), s.pin(tp), [[352 + i * 16, 248 + i * 16], [352 + i * 16, 216 + i * 48]]); }
};

const timer: Stage = s => {
  s.section('01', 'Astable timing core', 'An editable 555 block with named timing nets');
  const def = makeCustomBlock('NE555', 'trig,TRIG,left,input,1\nthres,THR,left,input,1\ndis,DIS,left,passive,1\nout,OUT,right,output,1\nreset,RST,right,input,1\nctrl,CV,right,passive,1\nvcc,VCC,top,power,1\ngnd,GND,bottom,power,1');
  const u = s.part(def, 224, 160);
  const ra = s.part('Resistor', 32, 96, '10k', 90), rb = s.part('Resistor', 32, 240, '100k', 90);
  const cv = s.part('Capacitor', 400, 240, '10 nF', 90);
  s.net('5V', s.pin(ra)); s.net('5V', s.pin(u, 'vcc'), 40, -12); s.net('5V', s.pin(u, 'reset'));
  const dis = s.node(32, 168); s.wire(s.pin(ra, '2'), dis); s.wire(dis, s.pin(rb));
  s.wire(dis, s.pin(u, 'dis'), [[112, 168], [112, 176]]);
  s.net('TIMING', s.pin(rb, '2')); s.net('TIMING', s.pin(u, 'trig'), -72, -12); s.net('TIMING', s.pin(u, 'thres'), -72, 24);
  s.wire(s.pin(u, 'ctrl'), s.pin(cv), [[400, 176]]); s.net('GND', s.pin(cv, '2')); s.net('GND', s.pin(u, 'gnd'), 8, 16);
  s.net('PULSE', s.pin(u, 'out'), 16, -12);
};
const timingCap: Stage = s => {
  s.section('02', 'Timing & decoupling', 'Timing capacitor, supply bypass and pulse probe');
  const c1 = s.part('Polarized capacitor', 64, 176, '1 uF', 90), c2 = s.part('Capacitor', 224, 176, '100 nF', 90);
  const c3 = s.part('Polarized capacitor', 384, 176, '10 uF', 90);
  const g = s.node(224, 280); s.net('TIMING', s.pin(c1)); s.net('5V', s.pin(c2)); s.net('5V', s.pin(c3));
  s.wire(s.pin(c1, '2'), g, [[64, 280]]); s.wire(s.pin(c2, '2'), g); s.wire(s.pin(c3, '2'), g, [[384, 280]]); s.net('GND', g);
  const tp = s.part('Test point', 416, 64, '', 90); s.net('PULSE', s.pin(tp), -64, -12);
};
const driver: Stage = s => {
  s.section('03', 'Transistor driver', 'Base resistor, pull-down and protected relay coil');
  const q = s.part('NPN', 224, 224, '2N2222'), rb = s.part('Resistor', 64, 224, '2.2k');
  const coil = s.part('Relay coil', 256, 96, '5 V', 90), d = s.part('Diode', 400, 96, '1N4148', 270);
  const down = s.part('Resistor', 144, 312, '100k', 90), top = s.node(256, 32), drain = s.node(256, 160);
  const base = s.node(144, 224);
  s.net('PULSE', s.pin(rb), -16, -12); s.wire(s.pin(rb, '2'), base); s.wire(base, s.pin(q, 'B'));
  s.wire(base, s.pin(down));
  s.wire(top, s.pin(coil)); s.wire(top, s.pin(d, '2'), [[400, 32]]); s.wire(s.pin(coil, '2'), drain);
  s.wire(s.pin(d), drain, [[400, 160]]); s.wire(drain, s.pin(q, 'C'));
  s.net('5V', top, 8, -8); s.net('GND', s.pin(q, 'E'), 8, 16); s.net('GND', s.pin(down, '2'), 8, 16);
};
const status: Stage = s => {
  s.section('04', 'Indicator outputs', 'Pulse and supply indicators with series resistance');
  for (let i = 0; i < 3; i++) {
    const x = 48 + i * 160, r = s.part('Resistor', x, 112, '1k', 90), led = s.part('LED', x, 256, ['Green', 'Amber', 'Blue'][i], 90);
    s.wire(s.pin(r, '2'), s.pin(led)); s.net(['PULSE', '5V', '3V3'][i], s.pin(r)); s.net('GND', s.pin(led, '2'), 8, 16);
  }
};

function compose(key: string, mobile: boolean, title: string, subtitle: string, stages: Stage[]) {
  const s = new Sheet(title); s.text(title, 0, 0, mobile ? 26 : 30); s.text(subtitle, 0, 28, 13);
  stages.slice(0, mobile ? 3 : 4).forEach((stage, i) => { s.at(mobile ? 0 : (i % 2) * 576, 88 + (mobile ? i : Math.floor(i / 2)) * 400); stage(s); });
  return finish(s.doc, `${mobile ? 'mobile' : 'desktop'}-${key}`);
}
function busSheet(mobile: boolean) {
  const s = new Sheet('8-bit control bus'); s.text('8-bit control bus', 0, 0, mobile ? 26 : 30); s.text('Custom pin layouts, explicit lane mapping and output stages', 0, 28, 13);
  const u = s.part(makeCustomBlock('MCU', 'data,DATA,right,bidirectional,8\nclk,CLK,left,input,1\nrst,RST,left,input,1\nvcc,VCC,top,power,1\ngnd,GND,bottom,power,1'), mobile ? 96 : 208, 192);
  const splitter = s.part(makeBusSplitter(8), mobile ? 304 : 512, 192);
  s.wire(s.pin(u, 'data'), s.pin(splitter, 'in-0'), [], 8); s.net('3V3', s.pin(u, 'vcc'), 40, -12); s.net('GND', s.pin(u, 'gnd'), 8, 20);
  s.net('CLK', s.pin(u, 'clk'), -24, -12); s.net('RESET', s.pin(u, 'rst'), -24, 24);
  // Fan out in pin order. Each trace has its own vertical channel.
  for (let i = 0; i < 8; i++) {
    const y = 336 + i * 64, tp = s.part('Test point', mobile ? 496 : 848, y, '', 90);
    s.wire(s.pin(splitter, `out-${i}`), s.pin(tp), [[(mobile ? 384 : 624) + (7 - i) * 8, 136 + i * 16], [(mobile ? 384 : 624) + (7 - i) * 8, y]]);
    s.net(`D${i}`, s.pin(tp), 8, -8);
  }
  s.text('DATA[7:0]', mobile ? 16 : 160, 320, 18); s.text('Eight explicit scalar lanes', mobile ? 16 : 160, 348, 12);
  if (mobile) {
    s.at(0, 416); s.section('02', 'Local support', 'Clock, reset pull-up and decoupling');
    const clk = s.part('Clock', 96, 88), c = s.part('Capacitor', 48, 256, '100 nF', 90), r = s.part('Resistor', 224, 256, '10k', 90);
    s.net('CLK', s.pin(clk, 'out-0')); s.net('3V3', s.pin(c)); s.net('GND', s.pin(c, '2')); s.net('3V3', s.pin(r)); s.net('RESET', s.pin(r, '2'));
  } else {
    s.at(0, 416); inputFilter(s); s.at(976, 88); logicControl(s); s.at(976, 504); status(s);
  }
  return finish(s.doc, `${mobile ? 'mobile' : 'desktop'}-bus`);
}

function finish(doc: CircuitDocument, key: string, purpose = 'Editable gallery drawing; not simulated or electrically qualified.') {
  // Stable IDs make source-controlled fixtures reproducible on every run.
  const ids = new Map<string, string>();
  const register = (id: string, prefix: string, i: number) => ids.set(id, `showcase.${key}.${prefix}${i + 1}`);
  register(doc.id, 'doc', 0);
  for (const [prefix, list] of Object.entries({ c: doc.components, n: doc.nodes, w: doc.wires, a: doc.annotations, g: doc.groups })) list.forEach((o, i) => register(o.id, prefix, i));
  doc.definitions.filter(d => !d.id.startsWith('builtin.')).forEach((d, i) => register(d.id, 'def', i));
  doc.wires.flatMap(w => w.route.vertices).forEach((v, i) => register(v.id, 'bend', i));
  const raw = serializeDocument(doc).replace(/"(?:[^"\\]|\\.)*"/g, token => {
    const value: unknown = JSON.parse(token); return typeof value === 'string' && ids.has(value) ? JSON.stringify(ids.get(value)) : token;
  });
  const result = parseDocument(raw);
  result.metadata = { purpose, layout: key.startsWith('mobile') ? 'Portrait' : 'Desktop' };
  // Every used symbol and connected pin is resolved before writing a fixture.
  result.components.forEach(c => getDefinition(result, c));
  const warnings = [...diagnostics(result), ...overlapWarnings(result)];
  if (warnings.length) throw new Error(`${key}: ${warnings.map(w => w.message).join('; ')}`);
  return { key, document: result };
}

export const showcase = [false, true].flatMap(mobile => [
  compose('power', mobile, 'A quieter power supply', 'Protected input / regulated rails / local decoupling', [inputFilter, regulator('3V3', '02'), mobile ? railLoads('03') : regulator('5V', '03'), railLoads()]),
  compose('analog', mobile, 'From light to a clean signal', 'Photodiode sensing / two-pole filtering / closed-loop gain', [sensor, lowPass, amplifier, threshold]),
  compose('logic', mobile, 'Inside a ripple-carry adder', 'Gate-level arithmetic / explicit carry nets / output control', [adder(0), adder(1), logicControl, counter]),
  busSheet(mobile),
  compose('timer', mobile, 'Pulse, protect, drive', '555 timing / local bypass / transistor output stage', [timer, timingCap, driver, status]),
]);

// A compact full-adder layout leaves room for four connected bit stages in a note.
const noteAdder = (bit: number): Stage => s => {
  s.section(`0${bit + 1}`, `Full adder / bit ${bit}`, 'XOR sum path / AND-OR carry network');
  const x1 = s.part('XOR', 144, 72), x2 = s.part('XOR', 336, 72);
  const a1 = s.part('AND', 144, 184), a2 = s.part('AND', 336, 184), o = s.part('OR', 432, 248);
  const a = s.node(48, 64), b = s.node(32, 80), carry = s.node(240, 80), p = s.node(224, 72);
  s.net(`A${bit}`, a, -24, -12); s.net(`B${bit}`, b, -24, 24); s.net(`C${bit}`, carry, 0, 32);
  s.wire(a, s.pin(x1, 'in-0')); s.wire(b, s.pin(x1, 'in-1')); s.wire(s.pin(x1, 'out'), p);
  s.wire(p, s.pin(x2, 'in-0'), [[256, 72], [256, 64]]); s.wire(carry, s.pin(x2, 'in-1'));
  s.wire(a, s.pin(a1, 'in-0'), [[48, 176]]); s.wire(b, s.pin(a1, 'in-1'), [[32, 192]]);
  s.wire(p, s.pin(a2, 'in-0'), [[224, 144], [256, 144], [256, 176]]);
  s.wire(carry, s.pin(a2, 'in-1'), [[240, 192]]);
  s.wire(s.pin(a1, 'out'), s.pin(o, 'in-0'), [[208, 184], [208, 240]]);
  s.wire(s.pin(a2, 'out'), s.pin(o, 'in-1'), [[400, 184], [400, 256]]);
  s.net(`S${bit}`, s.pin(x2, 'out'), 16, -8); s.net(`C${bit + 1}`, s.pin(o, 'out'), 8, -8);
};

// Complete study systems, with readable stage groupings at note width.
export const noteShowcase = [
  { key: 'Ripple-carry adder', title: 'Four-bit ripple-carry adder', stages: [noteAdder(0), noteAdder(1), noteAdder(2), noteAdder(3)], rowHeight: 328 },
  { key: 'Filter and amplifier', title: 'Photodiode signal conditioning and threshold detection', stages: [sensor, lowPass, amplifier, threshold], rowHeight: 360 },
].map(({ key, title, stages, rowHeight }) => {
  const sheet = new Sheet(title);
  stages.forEach((stage, i) => { sheet.at((i % 2) * 576, Math.floor(i / 2) * rowHeight); stage(sheet); });
  return { key, document: finish(sheet.doc, `note-${key.toLowerCase().replaceAll(' ', '-')}`).document };
});

// Listing showcase: complete circuits that build cleanly and simulate in the studio.
// Their behavior is verified by scripts/generate-showcase.mjs with both engines.
const simulated = 'Editable showcase drawing; verified with the built-in simulator. Not an electrically qualified design.';

/** BCD to seven-segment decoder drawn as a PLA: literal rails, an AND plane and an OR plane. */
function decoder() {
  const s = new Sheet('BCD to seven-segment decoder');
  s.text('BCD to seven-segment decoder', -320, -608, 30);
  s.text('Gate-level PLA: 4 inputs / 3 inverters / 9 product terms / 7 segment sums', -320, -576, 13);
  const rail: Record<string, number> = { D: 0, "D'": 64, C: 128, "C'": 192, B: 256, "B'": 320, A: 384 };
  // Gate-row offsets mirror makeGate's pin spacing; every rail ends at its lowest tap.
  const termRows = [176, 264, 344, 424, 504, 592, 672, 752, 832];
  const literalsUsed: [string, string[]][] = [['BD', ['B', 'D']], ["B'D'", ["B'", "D'"]], ["C'D'", ["C'", "D'"]], ['CD', ['C', 'D']], ["B'C", ["B'", 'C']], ["CD'", ['C', "D'"]], ["BC'D", ['B', "C'", 'D']], ["BC'", ['B', "C'"]], ["BD'", ['B', "D'"]]];
  const end = (name: string) => Math.max(...literalsUsed.flatMap(([, literals], k) => literals.map((l, i) => l === name ? termRows[k] + (i * 2 - literals.length + 1) * 8 : -Infinity)));
  s.text('BCD input (A = MSB)', -320, -528, 15);
  ([['A', -432], ['B', -320], ['C', -208], ['D', -96]] as const).forEach(([name, y]) => {
    const input = s.part('Logic input', -256, y, '', 0, name);
    // A only feeds OR gates directly, so it travels by its net label instead of a rail.
    if (name === 'A') s.net('A', s.pin(input, 'out-0'), 8, -8);
    else s.wire(s.pin(input, 'out-0'), s.node(rail[name], end(name)), [[rail[name], y]]);
  });
  for (const name of ['D', 'C', 'B']) {
    const x = rail[name], inverter = s.part('NOT', x + 64, 16, '', 90);
    s.wire(s.tap(x, -32), s.pin(inverter, 'in-0'));
    s.wire(s.pin(inverter, 'out'), s.node(x + 64, end(`${name}'`)));
  }
  const terms = literalsUsed, termY = (k: number) => termRows[k], track = (k: number) => 672 + k * 32;
  s.text('AND plane', 448, 72, 15); s.text('9 product terms', 448, 92, 12);
  const sums: { segment: string; y: number; inputs: string[] }[] = [
    { segment: 'a', y: 160, inputs: ['A', 'C', 'BD', "B'D'"] }, { segment: 'b', y: 272, inputs: ["B'", "C'D'", 'CD'] },
    { segment: 'c', y: 368, inputs: ['B', "C'", 'D'] }, { segment: 'd', y: 480, inputs: ['A', "B'D'", "B'C", "CD'", "BC'D"] },
    { segment: 'e', y: 592, inputs: ["B'D'", "CD'"] }, { segment: 'f', y: 688, inputs: ['A', "C'D'", "BC'", "BD'"] },
    { segment: 'g', y: 800, inputs: ['A', "BC'", "B'C", "CD'"] },
  ];
  const ors = sums.map(sum => ({ ...sum, gate: s.part(makeGate('OR', sum.inputs.length), 1120, sum.y) }));
  const pinY = (count: number, i: number) => (i * 2 - count + 1) * 8;
  terms.forEach(([term, literals], k) => {
    const y = termY(k), gate = s.part(makeGate('AND', literals.length), 544, y);
    literals.forEach((literal, i) => s.wire(s.tap(rail[literal], y + pinY(literals.length, i)), s.pin(gate, `in-${i}`)));
    const uses = ors.flatMap(o => o.inputs.map((input, i) => input === term ? o.y + pinY(o.inputs.length, i) : undefined)).filter((v): v is number => v !== undefined);
    const top = Math.min(y, ...uses), end = Math.max(y, ...uses), x = track(k);
    s.wire(s.node(x, top), s.node(x, end));
    s.wire(s.pin(gate, 'out'), s.tap(x, y));
    s.text(term, 600, y - 12, 11);
  });
  s.text('OR plane', 1040, 48, 15); s.text('one sum per segment', 1040, 68, 12);
  for (const o of ors) o.inputs.forEach((input, i) => {
    const target = s.pin(o.gate, `in-${i}`), k = terms.findIndex(([term]) => term === input);
    if (k >= 0) s.wire(s.tap(track(k), o.y + pinY(o.inputs.length, i)), target);
    else s.net(input, target, -28, -4);
  });
  // Name the literal rails once at their sources so the OR plane can reuse them by label.
  for (const [name, y] of [['B', -320], ['C', -208], ['D', -96]] as const) s.net(name, s.tap(rail[name], y), 8, -8);
  for (const name of ["B'", "C'", "D'"]) s.net(name, s.tap(rail[name], 96), 8, 0);
  const display = s.part('Seven-segment display', 1408, 488, '', 0, 'HEX');
  const fanX = [1280, 1264, 1248, 1232, 1248, 1264, 1280];
  ors.forEach((o, i) => {
    const y = 488 + Math.round((i - 3.5) * 16), out = s.pin(o.gate, 'out');
    if (o.y === y) s.wire(out, s.pin(display, `in-${i}`));
    else s.wire(out, s.pin(display, `in-${i}`), [[fanX[i], o.y], [fanX[i], y]]);
    s.net(o.segment, out, 8, -10);
  });
  // Segment probes join the OR outputs by name, so the truth table lists every segment.
  s.text('Segment probes', 1680, 72, 15);
  ors.forEach((o, i) => { const probe = s.part('Output probe', 1744, 160 + i * 96, '', 0, o.segment); s.net(o.segment, s.pin(probe, 'in-0'), -28, -8); });
  const lines = ['a = A + C + BD + B\u2032D\u2032', 'b = B\u2032 + C\u2032D\u2032 + CD', 'c = B + C\u2032 + D', 'd = A + B\u2032D\u2032 + B\u2032C + CD\u2032 + BC\u2032D', 'e = B\u2032D\u2032 + CD\u2032', 'f = A + C\u2032D\u2032 + BC\u2032 + BD\u2032', 'g = A + BC\u2032 + B\u2032C + CD\u2032'];
  s.text('Minimized segment equations', 1328, 616, 15);
  lines.forEach((line, i) => s.text(line, 1328, 648 + i * 24, 13));
  return finish(s.doc, 'listing-logic', simulated);
}

/** Sensor chain: gain, active low-pass filter, threshold comparator and an LED driver. */
function sensorChain() {
  const s = new Sheet('Sensor signal chain');
  s.text('Sensor signal chain', 0, -480, 30);
  s.text('AC sensor / non-inverting gain / active low-pass / comparator / transistor LED driver', 0, -448, 13);
  const plus = (x: number, y: number) => { const r = s.part('Power rail', x, y, '12V'); s.rename(r, '+12V'); return r; };
  const minus = (x: number, y: number) => { const r = s.part('Power rail', x, y, '-12V', 180); s.rename(r, '-12V'); return r; };
  // Ground symbols already mark the reference, so their automatic GND labels are omitted.
  const ground = (x: number, y: number) => { const g = s.part('Ground', x, y); s.doc.annotations = s.doc.annotations.filter(a => !(a.kind === 'label' && a.anchor?.kind === 'pin' && a.anchor.componentId === g.id)); return g; };
  const supplies = (u: Component) => { s.net('+12V', s.pin(u, 'V-positive'), 14, 0); s.net('-12V', s.pin(u, 'V-'), 14, 8); };
  // 00 Supplies: the op-amp supply pins join these rails by name.
  s.text('Supplies', 1808, -208, 19); s.text('Split \u00b112 V rails', 1808, -184, 12);
  plus(1840, -96); minus(1840, 32); ground(1936, 32);
  // 01 Sensor and gain
  s.at(0, -208); s.section('01', 'Sensor & gain', 'G = 1 + Rf / Rg = 11'); s.at(0, 0);
  const v1 = s.part('AC voltage source', 0, 176, '200mV 1kHz', 90, 'V1'), g1 = ground(0, 288);
  s.wire(s.pin(v1, '2'), s.pin(g1));
  const u1 = s.part('Op-amp', 288, 80, '', 0, 'U1');
  s.wire(s.pin(v1, '1'), s.pin(u1, '-positive'), [[0, 96]]);
  s.net('VIN', s.pin(v1, '1'), 12, -16);
  const rg = s.part('Resistor', 176, 176, '10k', 90, 'RG'), g2 = ground(176, 288);
  const n1 = s.node(176, 64); s.wire(n1, s.pin(u1, '-')); s.wire(n1, s.pin(rg)); s.wire(s.pin(rg, '2'), s.pin(g2));
  const rf = s.part('Resistor', 288, -80, '100k', 0, 'RF'), o1 = s.node(400, 80);
  s.wire(n1, s.pin(rf), [[176, -80]]); s.wire(s.pin(rf, '2'), o1, [[400, -80]]); s.wire(s.pin(u1, 'out'), o1); supplies(u1);
  s.net('AMP', o1, 8, -12);
  // 02 Active low-pass
  s.at(480, -208); s.section('02', 'Active low-pass', 'fc = 1 / (2\u03c0 Rf Cf) \u2248 3.4 kHz'); s.at(0, 0);
  const rin = s.part('Resistor', 560, 80, '10k', 0, 'RIN'), u2 = s.part('Op-amp', 736, 96, '', 0, 'U2');
  s.wire(o1, s.pin(rin)); const n2 = s.node(640, 80); s.wire(s.pin(rin, '2'), n2); s.wire(n2, s.pin(u2, '-'));
  const rf2 = s.part('Resistor', 736, -48, '10k', 0, 'RF2'), cf = s.part('Capacitor', 736, -176, '4.7nF', 0, 'CF');
  const j1 = s.node(640, -48), j2 = s.node(832, -48), o2 = s.node(832, 96);
  s.wire(n2, j1); s.wire(j1, s.pin(rf2)); s.wire(j1, s.pin(cf), [[640, -176]]);
  s.wire(s.pin(rf2, '2'), j2); s.wire(s.pin(cf, '2'), j2, [[832, -176]]); s.wire(j2, o2); s.wire(s.pin(u2, 'out'), o2);
  const g3 = ground(672, 192); s.wire(s.pin(u2, '-positive'), s.pin(g3), [[672, 112]]);
  supplies(u2);
  s.net('FILT', o2, 8, -12);
  // 03 Threshold comparator
  s.at(960, -208); s.section('03', 'Threshold', 'Vref = 12 V \u00b7 10k / 110k \u2248 1.09 V'); s.at(0, 0);
  const r1 = s.part('Resistor', 1088, 0, '100k', 90, 'R1'), r2 = s.part('Resistor', 1088, 192, '10k', 90, 'R2'), g4 = ground(1088, 304);
  s.wire(s.pin(plus(1088, -80), '1'), s.pin(r1));
  const ref = s.node(1088, 96), u3 = s.part('Comparator', 1248, 112, '', 0, 'U3');
  s.wire(s.pin(r1, '2'), ref); s.wire(ref, s.pin(r2)); s.wire(s.pin(r2, '2'), s.pin(g4)); s.wire(ref, s.pin(u3, '-'));
  s.wire(o2, s.pin(u3, '-positive'), [[960, 96], [960, 128]]);
  supplies(u3);
  s.net('REF', ref, -48, -12);
  const o3 = s.node(1344, 112); s.wire(s.pin(u3, 'out'), o3); s.net('CMP', o3, 4, -12);
  // 04 LED driver
  s.at(1376, -208); s.section('04', 'LED driver', 'Saturated NPN switch, \u2248 10 mA'); s.at(0, 0);
  const rb = s.part('Resistor', 1424, 112, '10k', 0, 'RB'), q1 = s.part('NPN', 1616, 112, '100', 0, 'Q1');
  s.wire(o3, s.pin(rb)); const base = s.node(1504, 112); s.wire(s.pin(rb, '2'), base); s.wire(base, s.pin(q1, 'B'));
  const d1 = s.part('Diode', 1504, 192, '1N4148', 270, 'D1'); s.wire(base, s.pin(d1, '2')); s.wire(s.pin(d1), s.pin(ground(1504, 304)));
  s.wire(s.pin(q1, 'E'), s.pin(ground(1648, 288)));
  const led = s.part('LED', 1648, -16, 'Red', 90, 'LED1'), am = s.part('Ammeter', 1648, -144, '', 90, 'AM1'), rl = s.part('Resistor', 1648, -272, '1k', 90, 'RL');
  s.wire(s.pin(led, '2'), s.pin(q1, 'C')); s.wire(s.pin(am, '2'), s.pin(led)); s.wire(s.pin(rl, '2'), s.pin(am)); s.wire(s.pin(plus(1648, -352), '1'), s.pin(rl));
  return finish(s.doc, 'listing-electrical', simulated);
}

/** Phone composition: a gate-level 2×2-bit multiplier sized for a portrait canvas. */
function multiplier() {
  const s = new Sheet('2-bit multiplier');
  s.text('2 \u00d7 2-bit multiplier', -64, -336, 24);
  s.text('4 partial products / 2 half adders / P = A \u00d7 B', -64, -306, 12);
  ([['A1', 0], ['A0', 160], ['B1', 320], ['B0', 480]] as const).forEach(([name, x]) => { const input = s.part('Logic input', x, -208, '', 0, name); s.net(name, s.pin(input, 'out-0'), 8, -8); });
  const products = ([['A0', 'B0', 0], ['A1', 'B0', 96], ['A0', 'B1', 192], ['A1', 'B1', 288]] as const).map(([a, b, y]) => {
    const gate = s.part('AND', 64, y); s.net(a, s.pin(gate, 'in-0'), -30, -4); s.net(b, s.pin(gate, 'in-1'), -30, 10); s.text(`${a}\u00b7${b}`, 120, y - 10, 11); return gate;
  });
  s.text('Half adder 1', 232, 52, 12); s.text('Half adder 2', 456, 196, 12);
  const x1 = s.part('XOR', 288, 104), c1 = s.part('AND', 288, 200), x2 = s.part('XOR', 512, 248), c2 = s.part('AND', 512, 352);
  s.wire(s.pin(products[1], 'out'), s.pin(x1, 'in-0')); s.wire(s.tap(176, 96), s.pin(c1, 'in-1'), [[176, 208]]);
  s.wire(s.pin(products[2], 'out'), s.pin(c1, 'in-0')); s.wire(s.tap(160, 192), s.pin(x1, 'in-1'), [[160, 112]]);
  s.wire(s.pin(c1, 'out'), s.pin(x2, 'in-0'), [[400, 200], [400, 240]]); s.wire(s.tap(400, 240), s.pin(c2, 'in-0'), [[400, 344]]);
  s.wire(s.pin(products[3], 'out'), s.pin(x2, 'in-1'), [[432, 288], [432, 256]]); s.wire(s.tap(432, 288), s.pin(c2, 'in-1'), [[432, 360]]);
  const outputs = [[products[0], 0], [x1, 104], [x2, 248], [c2, 352]] as const;
  outputs.forEach(([gate, y], i) => { const probe = s.part('Output probe', 704, y, '', 0, `P${i}`); s.wire(s.pin(gate, 'out'), s.pin(probe, 'in-0')); });
  return finish(s.doc, 'mobile-logic', simulated);
}

/** Phone composition: the sensor chain in two rows, with a passive RC filter. */
function compactChain() {
  const s = new Sheet('Sensor chain (compact)');
  s.text('Sensor chain', 0, -144, 24);
  s.text('Gain \u00d711 / RC low-pass / comparator / LED driver', 0, -114, 12);
  const ground = (x: number, y: number) => { const g = s.part('Ground', x, y); s.doc.annotations = s.doc.annotations.filter(a => !(a.kind === 'label' && a.anchor?.kind === 'pin' && a.anchor.componentId === g.id)); return g; };
  const rail = (x: number, y: number, volts: string, rotation: Component['rotation'] = 0) => { const r = s.part('Power rail', x, y, volts.replace('+', '') , rotation); s.rename(r, volts); return r; };
  // Row 1: source, non-inverting gain, RC low-pass.
  const v1 = s.part('AC voltage source', 0, 128, '200mV 1kHz', 90, 'V1'); s.wire(s.pin(v1, '2'), s.pin(ground(0, 240)));
  const u1 = s.part('Op-amp', 224, 64, '', 0, 'U1'); s.wire(s.pin(v1, '1'), s.pin(u1, '-positive')); s.net('VIN', s.pin(v1, '1'), 12, -16);
  const rg = s.part('Resistor', 128, 144, '10k', 90, 'RG'), n1 = s.node(128, 48);
  s.wire(n1, s.pin(u1, '-')); s.wire(n1, s.pin(rg)); s.wire(s.pin(rg, '2'), s.pin(ground(128, 256)));
  const rf = s.part('Resistor', 224, -48, '100k', 0, 'RF'), o1 = s.node(320, 64);
  s.wire(n1, s.pin(rf), [[128, -48]]); s.wire(s.pin(rf, '2'), o1, [[320, -48]]); s.wire(s.pin(u1, 'out'), o1);
  s.net('+12V', s.pin(u1, 'V-positive'), 14, 0); s.net('-12V', s.pin(u1, 'V-'), 14, 8); s.net('AMP', o1, 4, -12);
  const r2 = s.part('Resistor', 400, 64, '10k', 0, 'R2'), f = s.node(496, 64), c1 = s.part('Capacitor', 496, 144, '10nF', 90, 'C1');
  s.wire(o1, s.pin(r2)); s.wire(s.pin(r2, '2'), f); s.wire(f, s.pin(c1)); s.wire(s.pin(c1, '2'), s.pin(ground(496, 256))); s.net('FILT', f, 8, -12);
  // Row 2: reference divider, comparator, NPN LED driver.
  const r3 = s.part('Resistor', 64, 400, '100k', 90, 'R3'), r4 = s.part('Resistor', 64, 544, '10k', 90, 'R4'), ref = s.node(64, 464);
  s.wire(s.pin(rail(64, 320, '+12V'), '1'), s.pin(r3)); s.wire(s.pin(r3, '2'), ref); s.wire(ref, s.pin(r4)); s.wire(s.pin(r4, '2'), s.pin(ground(64, 656)));
  const u3 = s.part('Comparator', 224, 480, '', 0, 'U3'); s.wire(ref, s.pin(u3, '-')); s.net('REF', ref, -48, -12);
  s.net('FILT', s.pin(u3, '-positive'), -40, 16); s.net('+12V', s.pin(u3, 'V-positive'), 14, 0);
  s.wire(s.pin(rail(224, 560, '-12V', 180), '1'), s.pin(u3, 'V-'));
  const o3 = s.node(320, 480); s.wire(s.pin(u3, 'out'), o3); s.net('CMP', o3, 4, -12);
  const rb = s.part('Resistor', 448, 480, '10k', 0, 'RB'), q1 = s.part('NPN', 608, 480, '100', 0, 'Q1');
  s.wire(o3, s.pin(rb)); s.wire(s.pin(rb, '2'), s.pin(q1, 'B')); s.wire(s.pin(q1, 'E'), s.pin(ground(640, 592)));
  const led = s.part('LED', 640, 368, 'Red', 90, 'LED1'), rl = s.part('Resistor', 640, 256, '1k', 90, 'RL');
  s.wire(s.pin(led, '2'), s.pin(q1, 'C')); s.wire(s.pin(rl, '2'), s.pin(led)); s.wire(s.pin(rail(640, 176, '+12V'), '1'), s.pin(rl));
  return finish(s.doc, 'mobile-electrical', simulated);
}

export const listing = [decoder(), sensorChain()];
export const phoneListing = [multiplier(), compactChain()];
