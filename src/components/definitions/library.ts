import { type Definition, type Primitive, uid } from '../../core/model/document';
type Pin = Definition['pins'][number];
const path = (d: string): Primitive => ({ kind: 'path', d });
const label = (text: string, x = 0, y = 5, size = 13): Primitive => ({ kind: 'text', x, y, text, size });
const circle = (x: number, y: number, radius: number): Primitive => ({ kind: 'circle', x, y, radius });
function pin(id: string, x: number, y: number, side: Pin['side'] = 'left', role: Pin['role'] = 'passive', width = 1, name = id): Pin { return { id: id.replace(/\+/g, '-positive'), name, x, y, side, role, width }; }
function definition(id: string, name: string, category: string, prefix: string, pins: Pin[], primitives: Primitive[], aliases: string[] = [], defaults: Definition['defaults'] = {}): Definition {
  return { id: `builtin.${id}.v1`, version: 1, name, category, prefix, pins, primitives, aliases, defaults, bounds: { x: -32, y: -32, width: 64, height: 64 } };
}
const twoPins = () => [pin('1', -48, 0), pin('2', 48, 0, 'right')];
const leads = 'M -48 0 H -24 M 24 0 H 48';
function two(id: string, name: string, category: string, prefix: string, d: string, value = '', aliases: string[] = []): Definition {
  return definition(id, name, category, prefix, twoPins(), [path(leads + ' ' + d)], aliases, { value });
}
export function makeBlock(name: string, inputs: string[], outputs: string[], category = 'Logic blocks', prefix = 'U', width = 1): Definition {
  const h = Math.max(64, (Math.max(inputs.length, outputs.length) + 1) * 16);
  const pins: Pin[] = [];
  inputs.forEach((s, i) => pins.push(pin(`in-${i}`, -64, Math.round((i - (inputs.length - 1) / 2) * 16), 'left', 'input', width, s)));
  outputs.forEach((s, i) => pins.push(pin(`out-${i}`, 64, Math.round((i - (outputs.length - 1) / 2) * 16), 'right', 'output', width, s)));
  const primitives: Primitive[] = [{ kind: 'rect', x: -48, y: -h / 2, width: 96, height: h }, label(name.length > 12 ? name.slice(0, 12) : name, 0, -h / 2 + 18, 11)];
  for (const p of pins) primitives.push(path(`M ${p.x} ${p.y} H ${p.side === 'left' ? -48 : 48}`), label(p.name, p.side === 'left' ? -28 : 28, p.y + 4, 9));
  return { ...definition(`block-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, category, prefix, pins, primitives), bounds: { x: -64, y: -h / 2, width: 128, height: h } };
}
export function makeGate(kind: string, count = 2): Definition {
  count = Math.max(kind === 'NOT' || kind === 'Buffer' ? 1 : 2, Math.min(8, count));
  if (kind === 'NOT' || kind === 'Buffer' || kind === 'Tri-state buffer') count = 1;
  const inverted = ['NOT', 'NAND', 'NOR', 'XNOR'].includes(kind);
  const h = Math.max(32, count * 12);
  const pins = Array.from({ length: count }, (_, i) => pin(`in-${i}`, -48, (i * 2 - count + 1) * 8, 'left', 'input', 1, count === 1 ? 'A' : String.fromCharCode(65 + i)));
  pins.push(pin('out', 48, 0, 'right', kind === 'Tri-state buffer' ? 'tristate' : 'output', 1, 'Y'));
  const primitives: Primitive[] = [];
  const body = kind.includes('Buffer') || kind === 'NOT' || kind === 'Tri-state buffer'
    ? `M -24 -24 L 24 0 L -24 24 Z`
    : ['AND', 'NAND'].includes(kind) ? `M -24 ${-h} H 0 C 38 ${-h} 38 ${h} 0 ${h} H -24 Z`
      : `M -28 ${-h} Q 4 0 -28 ${h} Q 12 ${h} 28 0 Q 12 ${-h} -28 ${-h} Z`;
  primitives.push(path(body));
  if (kind === 'XOR' || kind === 'XNOR') primitives.push(path(`M -34 ${-h} Q -2 0 -34 ${h}`));
  for (const p of pins.filter(p => p.side === 'left')) primitives.push(path(`M -48 ${p.y} H -24`));
  primitives.push(path(`M ${inverted ? 36 : 28} 0 H 48`));
  if (inverted) primitives.push(circle(32, 0, 4));
  if (kind === 'Tri-state buffer') { pins.push(pin('enable', 0, 48, 'bottom', 'input', 1, 'EN')); primitives.push(path('M 0 48 V 12')); }
  return { ...definition(`gate-${kind.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${count}`, kind, 'Logic gates', 'U', pins, primitives, [kind.toLowerCase(), 'gate']), bounds: { x: -48, y: -h, width: 96, height: Math.max(h * 2, kind === 'Tri-state buffer' ? h + 48 : 0) } };
}
export function makeBusSplitter(bits = 8): Definition {
  const d = makeBlock(`${bits}-bit splitter`, ['BUS'], Array.from({ length: bits }, (_, i) => String(i)), 'Buses', 'B');
  d.id = `builtin.splitter-${bits}.v1`; d.pins[0].width = bits; d.pins[0].role = 'bidirectional';
  for (const p of d.pins.slice(1)) p.role = 'bidirectional';
  d.laneLinks = Array.from({ length: bits }, (_, i) => ({ a: 'in-0', aLane: i, b: `out-${i}`, bLane: 0 }));
  return d;
}
export function makeCustomBlock(name: string, lines: string): Definition {
  const entries = lines.split('\n').map(s => s.trim()).filter(Boolean);
  if (!entries.length || entries.length > 64) throw new Error('Use 1–64 pin lines: ID, name, side, role, width');
  const pins: Pin[] = []; const primitives: Primitive[] = [];
  const parsed = entries.map(line => { const [id, name, side = 'left', role = 'passive', width = '1'] = line.split(',').map(s => s.trim()); return { id, name, side, role, width: Number(width) }; });
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const sidePins = parsed.filter(p => p.side === side);
    sidePins.forEach((p, i) => { const t = Math.round((i - (sidePins.length - 1) / 2) * 16); const x = side === 'left' ? -80 : side === 'right' ? 80 : t; const y = side === 'top' ? -80 : side === 'bottom' ? 80 : t;
      pins.push(pin(p.id, x, y, side, p.role as Pin['role'], p.width, p.name));
      primitives.push(path(`M ${x} ${y} L ${side === 'left' ? -64 : side === 'right' ? 64 : x} ${side === 'top' ? -64 : side === 'bottom' ? 64 : y}`));
      primitives.push(label(p.name, side === 'left' ? -42 : side === 'right' ? 42 : x, side === 'top' ? -48 : side === 'bottom' ? 52 : y + 4, 9));
    });
  }
  if (pins.length !== parsed.length) throw new Error('Pin sides must be left, right, top or bottom');
  primitives.unshift({ kind: 'rect', x: -64, y: -64, width: 128, height: 128 }, label(name, 0, 5, 12));
  return { ...definition('custom', name, 'Custom', 'U', pins, primitives), id: uid('custom'), bounds: { x: -80, y: -80, width: 160, height: 160 } };
}

const passive: Definition[] = [
  two('resistor', 'Resistor', 'Passive', 'R', 'M -24 -10 H 24 V 10 H -24 Z', '10k', ['resistance', 'ohm']),
  two('resistor-zigzag', 'Resistor (zigzag)', 'Passive', 'R', 'M -24 0 L -20 -10 L -12 10 L -4 -10 L 4 10 L 12 -10 L 20 10 L 24 0', '1k'),
  two('variable-resistor', 'Variable resistor', 'Passive', 'RV', 'M -24 -10 H 24 V 10 H -24 Z M -16 26 L 20 -26 M 8 -22 L 20 -26 L 18 -14', '10k'),
  definition('potentiometer', 'Potentiometer', 'Passive', 'RV', [...twoPins(), pin('wiper', 0, 48, 'bottom', 'passive', 1, 'Wiper')], [path(leads + ' M -24 -10 H 24 V 10 H -24 Z M 0 48 V 16 M -6 24 L 0 16 L 6 24')], ['pot'], { value: '10k' }),
  two('capacitor', 'Capacitor', 'Passive', 'C', 'M -24 0 H -6 M -6 -20 V 20 M 6 -20 V 20 M 6 0 H 24', '100nF'),
  two('polar-capacitor', 'Polarized capacitor', 'Passive', 'C', 'M -24 0 H -6 M -6 -20 V 20 M 12 -20 Q 0 0 12 20 M 8 0 H 24 M -20 -25 H -10 M -15 -30 V -20', '10µF'),
  two('inductor', 'Inductor', 'Passive', 'L', 'M -24 0 C -24 -24 -12 -24 -12 0 C -12 -24 0 -24 0 0 C 0 -24 12 -24 12 0 C 12 -24 24 -24 24 0', '1mH'),
  two('fuse', 'Fuse', 'Passive', 'F', 'M -24 -8 H 24 V 8 H -24 Z M -24 0 H 24', '1A'),
  definition('transformer', 'Transformer', 'Passive', 'T', [pin('p1', -48, -24), pin('p2', -48, 24), pin('s1', 48, -24, 'right'), pin('s2', 48, 24, 'right')], [path('M -48 -24 H -20 C 4 -24 4 -8 -20 -8 C 4 -8 4 8 -20 8 C 4 8 4 24 -20 24 H -48 M 48 -24 H 20 C -4 -24 -4 -8 20 -8 C -4 -8 -4 8 20 8 C -4 8 -4 24 20 24 H 48 M -4 -32 V 32 M 4 -32 V 32')]),
];
const sources: Definition[] = [
  two('battery', 'Battery', 'Sources', 'BT', 'M -24 0 H -14 M -14 -24 V 24 M -4 -12 V 12 M 6 -24 V 24 M 16 -12 V 12 M 16 0 H 24', '9V', ['cell']),
  definition('dc-voltage', 'DC voltage source', 'Sources', 'V', twoPins(), [path(leads), circle(0, 0, 24), path('M -15 -5 H -5 M -10 -10 V 0 M 5 5 H 15')], ['voltage', 'dc', 'source'], { value: '5V' }),
  definition('ac-voltage', 'AC voltage source', 'Sources', 'V', twoPins(), [path(leads), circle(0, 0, 24), path('M -16 0 C -16 -20 0 -20 0 0 C 0 20 16 20 16 0')], ['ac'], { value: '230V' }),
  definition('current-source', 'Current source', 'Sources', 'I', twoPins(), [path(leads), circle(0, 0, 24), path('M -14 0 H 14 M 5 -8 L 14 0 L 5 8')], [], { value: '1mA' }),
  ...['VCVS', 'VCCS', 'CCVS', 'CCCS'].map((name, i) => definition(name.toLowerCase(), name, 'Sources', ['E', 'G', 'H', 'F'][i], [...twoPins(), pin('control+', -16, 48, 'bottom'), pin('control-', 16, 48, 'bottom')], [path(leads + ' M -24 0 L 0 -24 L 24 0 L 0 24 Z M -16 48 V 32 M 16 48 V 32'), path(i % 2 === 0 ? 'M -15 -5 H -5 M -10 -10 V 0 M 5 5 H 15' : 'M -12 0 H 12 M 4 -6 L 12 0 L 4 6')], ['controlled source'], { value: '1' })),
];
const diodes = ['Diode', 'Zener diode', 'LED', 'Photodiode'].map((name, i) => {
  const d = two(`diode-${i}`, name, 'Semiconductors', 'D', 'M -24 0 H -14 M -14 -18 L 14 0 L -14 18 Z M 14 -18 V 18 M 14 0 H 24', '', [i === 2 ? 'light emitting diode' : name.toLowerCase()]);
  d.pins[0].name = 'Anode'; d.pins[1].name = 'Cathode';
  if (i === 1) d.primitives.push(path('M 8 -24 H 14 V -18 M 14 18 V 24 H 20'));
  if (i === 2) d.primitives.push(path('M 8 -28 L 24 -44 M 16 -44 H 24 V -36 M -4 -32 L 12 -48 M 4 -48 H 12 V -40'));
  if (i === 3) d.primitives.push(path('M 24 -44 L 8 -28 M 8 -36 V -28 H 16 M 12 -48 L -4 -32 M -4 -40 V -32 H 4'));
  return d;
});
const transistors = ['NPN', 'PNP', 'NMOS', 'PMOS'].map((name, i) => {
  const mos = i > 1;
  const d = definition(name.toLowerCase(), name, 'Semiconductors', 'Q', [pin(mos ? 'G' : 'B', -48, 0), pin(mos ? 'D' : 'C', 32, -48, 'top'), pin(mos ? 'S' : 'E', 32, 48, 'bottom'), ...(mos ? [pin('body', 48, 0, 'right', 'passive', 1, 'Body (explicit)')] : [])], [path('M -48 0 H -12 M -12 -24 V 24 M -12 -12 L 32 -32 V -48 M -12 12 L 32 32 V 48'), ...(mos ? [path('M -20 -24 V 24 M 48 0 H 0')] : [path(i === 0 ? 'M 12 29 L 27 29 L 20 17' : 'M 8 15 L 8 29 L 22 24')])], [name.toLowerCase(), mos ? 'mosfet' : 'bjt']);
  d.bounds = { x: -48, y: -48, width: 96, height: 96 }; return d;
});
transistors[3].primitives.push(circle(-24, 0, 4));
const switches = ['SPST switch', 'SPDT switch', 'Normally open button', 'Normally closed button'].map((name, i) => definition(`switch-${i}`, name, 'Switches', 'SW', [...twoPins(), ...(i === 1 ? [pin('3', 48, 32, 'right')] : [])], [path('M -48 0 H -20 M 20 0 H 48 M -20 0 L 16 -20'), circle(-20, 0, 3), circle(20, 0, 3), ...(i === 1 ? [path('M 20 32 H 48'), circle(20, 32, 3)] : []), ...(i > 1 ? [path('M -8 -26 H 8 M 0 -26 V -36')] : [])], ['switch', i > 1 ? 'momentary' : 'toggle']));
switches[3].primitives[0] = path('M -48 0 H 48 M -8 -26 H 8 M 0 -26 V -8');
const analog = ['Op-amp', 'Comparator'].map((name, i) => definition(`analog-${i}`, name, 'Analog', 'U', [pin('+', -48, 16, 'left', 'input'), pin('-', -48, -16, 'left', 'input'), pin('out', 48, 0, 'right', 'output'), pin('V+', 0, -48, 'top', 'power'), pin('V-', 0, 48, 'bottom', 'power')], [path('M -24 -32 L 32 0 L -24 32 Z M -48 -16 H -24 M -48 16 H -24 M 32 0 H 48 M 0 -48 V -18 M 0 48 V 18'), label('−', -15, -12, 12), label('+', -15, 20, 12)], [name.toLowerCase()]));
const loads = ['Lamp', 'Motor', 'Voltmeter', 'Ammeter', 'Scope probe'].map((name, i) => definition(`load-${i}`, name, 'Loads & instruments', ['LA', 'M', 'VM', 'AM', 'TP'][i], twoPins(), [path(leads), circle(0, 0, 24), ...(i === 0 ? [path('M -16 -16 L 16 16 M -16 16 L 16 -16')] : [label(['', 'M', 'V', 'A', '~'][i], 0, 6, 20)])], ['instrument', name.toLowerCase()]));
const connection: Definition[] = [
  definition('ground', 'Ground', 'Connectivity', 'GND', [pin('1', 0, -32, 'top', 'power', 1, 'Reference')], [path('M 0 -32 V 0 M -24 0 H 24 M -16 8 H 16 M -8 16 H 8')], ['gnd', 'reference']),
  definition('power', 'Power rail', 'Connectivity', 'PWR', [pin('1', 0, 32, 'bottom', 'power')], [path('M 0 32 V -8 M -16 -8 H 16 M 0 -8 L -8 4 M 0 -8 L 8 4')], ['vcc', 'vdd'], { value: 'VCC' }),
  definition('test-point', 'Test point', 'Connectivity', 'TP', [pin('1', 0, 32, 'bottom')], [path('M 0 32 V 6'), circle(0, 0, 6)]),
  makeBlock('Connector', ['1', '2', '3', '4'], [], 'Connectivity', 'J'),
];
const logicIO = ['Logic input', 'Logic constant', 'Clock', 'Output probe', 'Seven-segment display'].map((name, i) => {
  const d = makeBlock(name, i > 2 ? (i === 4 ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] : ['IN']) : [], i <= 2 ? ['OUT'] : [], 'Logic I/O', i > 2 ? 'DS' : 'IN');
  if (i === 2) d.primitives.push(path('M -24 12 H -12 V 0 H 0 V 12 H 12 V 0 H 24'));
  if (i === 4) d.primitives.push(path('M 4 -38 H 28 M 30 -34 V -10 M 30 -2 V 22 M 4 26 H 28 M 0 -2 V 22 M 0 -34 V -10 M 4 -6 H 28'), circle(38, 28, 2));
  return d;
});
const blocks = [
  makeBlock('Multiplexer', ['D0', 'D1', 'S'], ['Y']), makeBlock('Demultiplexer', ['D', 'S'], ['Y0', 'Y1']),
  makeBlock('Encoder', ['D0', 'D1', 'D2', 'D3'], ['A0', 'A1']), makeBlock('Decoder', ['A0', 'A1'], ['Y0', 'Y1', 'Y2', 'Y3']),
  makeBlock('Half adder', ['A', 'B'], ['SUM', 'CARRY']), makeBlock('Full adder', ['A', 'B', 'CIN'], ['SUM', 'COUT']),
  makeBlock('D latch', ['D', 'EN'], ['Q', '/Q']), makeBlock('SR latch', ['S', 'R'], ['Q', '/Q']),
  makeBlock('D flip-flop', ['D', 'CLK', 'RST'], ['Q', '/Q']), makeBlock('JK flip-flop', ['J', 'K', 'CLK', 'RST'], ['Q', '/Q']),
  makeBlock('T flip-flop', ['T', 'CLK', 'RST'], ['Q', '/Q']), makeBlock('Register', ['D', 'CLK', 'EN'], ['Q']),
  makeBlock('Counter', ['CLK', 'EN', 'RST'], ['Q0', 'Q1', 'Q2', 'Q3']), makeBlock('Logic IC', ['A', 'B'], ['Y']),
  makeBlock('Generic IC', ['1', '2', '3', '4'], ['8', '7', '6', '5'], 'Analog'),
  two('relay-coil', 'Relay coil', 'Switches', 'K', 'M -24 -16 H 24 V 16 H -24 Z M -12 -16 V 16 M 0 -16 V 16 M 12 -16 V 16', '5V'),
  { ...switches[0], id: 'builtin.relay-contact.v1', name: 'Relay contact', prefix: 'K', defaults: { association: '' } },
];
export const library: Definition[] = [...connection, ...logicIO, ...['Buffer', 'NOT', 'AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR', 'Tri-state buffer'].map(k => makeGate(k)), ...blocks, ...passive, ...sources, ...switches, ...diodes, ...transistors, ...analog, ...loads, makeBusSplitter()];
export function findPart(term: string): Definition { const d = library.find(d => d.name === term || d.id === term); if (!d) throw new Error(`Unknown part: ${term}`); return d; }
