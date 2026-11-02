import { type Anchor, type CircuitDocument, emptyDocument } from '../../core/model/document';
import { addWire, annotate, place } from '../../core/commands/operations';
import { findPart, library, makeBusSplitter, makeCustomBlock } from './library';
function stable(d: CircuitDocument, name: string): CircuitDocument {
  const map = new Map<string, string>(); [...d.components, ...d.nodes, ...d.wires, ...d.annotations, ...d.groups].forEach((x, i) => map.set(x.id, `example-${i}`));
  const anchor = (a: Anchor): Anchor => a.kind === 'pin' ? { ...a, componentId: map.get(a.componentId)! } : { ...a, nodeId: map.get(a.nodeId)! };
  d.id = `example-${name}`;
  for (const c of d.components) c.id = map.get(c.id)!;
  for (const n of d.nodes) n.id = map.get(n.id)!;
  for (const w of d.wires) { w.id = map.get(w.id)!; w.a = anchor(w.a); w.b = anchor(w.b); w.route.vertices.forEach((v, i) => { v.id = `${w.id}-bend-${i}`; }); }
  for (const a of d.annotations) { a.id = map.get(a.id)!; if (a.anchor) a.anchor = anchor(a.anchor); }
  for (const g of d.groups) { g.id = map.get(g.id)!; g.members = g.members.map(id => map.get(id)!); }
  return d;
}
const pin = (componentId: string, pinId: string): Anchor => ({ kind: 'pin', componentId, pinId });
function divider() {
  const d = emptyDocument('Voltage divider');
  const v = place(d, findPart('DC voltage source'), { x: -112, y: 64 }, 90), r1 = place(d, findPart('Resistor'), { x: 144, y: 0 }, 90), r2 = place(d, findPart('Resistor'), { x: 144, y: 160 }, 90), ground = place(d, findPart('Ground'), { x: 144, y: 288 });
  v.properties.value = '5V'; r1.properties.value = '10k'; r2.properties.value = '10k';
  addWire(d, pin(v.id, '1'), pin(r1.id, '1'), [{ x: -112, y: -80 }, { x: 144, y: -80 }]);
  const mid = addWire(d, pin(r1.id, '2'), pin(r2.id, '1'));
  addWire(d, pin(r2.id, '2'), pin(ground.id, '1'));
  addWire(d, pin(v.id, '2'), pin(ground.id, '1'), [{ x: -112, y: 256 }]);
  const output = { kind: 'free' as const, point: { x: 320, y: 80 } };
  addWire(d, { kind: 'wire', wireId: mid, point: { x: 144, y: 80 } }, output);
  annotate(d, 'label', 'VOUT', { x: 320, y: 64 }, d.wires.at(-1)!.b);
  annotate(d, 'text', 'A simple voltage divider', { x: -144, y: -144 });
  return stable(d, 'voltage-divider');
}
function logic() {
  const d = emptyDocument('Two-input logic'); const a = place(d, findPart('Logic input'), { x: -224, y: -80 }), b = place(d, findPart('Logic input'), { x: -224, y: 80 }), gate = place(d, findPart('AND'), { x: 0, y: 0 }), probe = place(d, findPart('Output probe'), { x: 224, y: 0 });
  addWire(d, pin(a.id, 'out-0'), pin(gate.id, 'in-0'), [{ x: -96, y: -80 }]); addWire(d, pin(b.id, 'out-0'), pin(gate.id, 'in-1'), [{ x: -80, y: 80 }]); addWire(d, pin(gate.id, 'out'), pin(probe.id, 'in-0'));
  annotate(d, 'text', 'A · B → Y', { x: -80, y: -144 }); return stable(d, 'logic');
}
function pair(title: string, first: string, second: string) {
  const d = emptyDocument(title), a = place(d, findPart(first), { x: -112, y: 0 }), b = place(d, findPart(second), { x: 144, y: 0 });
  addWire(d, pin(a.id, findPart(first).pins.at(-1)!.id), pin(b.id, findPart(second).pins[0].id)); return stable(d, title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
}
function crossing() {
  const d = emptyDocument('Junctions and crossings');
  addWire(d, { kind: 'free', point: { x: -192, y: 0 } }, { kind: 'free', point: { x: 192, y: 0 } });
  addWire(d, { kind: 'free', point: { x: 0, y: -128 } }, { kind: 'free', point: { x: 0, y: 128 } });
  addWire(d, { kind: 'free', point: { x: -96, y: 128 } }, { kind: 'wire', wireId: d.wires[0].id, point: { x: -96, y: 0 } });
  annotate(d, 'text', 'Dot = connected. Bridge = separate nets.', { x: -208, y: -176 }); return stable(d, 'crossings');
}
function buses() {
  const d = emptyDocument('Bus lane mapping'), a = place(d, makeBusSplitter(4), { x: -128, y: 0 }), b = place(d, makeBusSplitter(4), { x: 128, y: 0 });
  addWire(d, pin(a.id, 'in-0'), pin(b.id, 'in-0'), [{ x: -224, y: -160 }, { x: 32, y: -160 }, { x: 32, y: 0 }]); return stable(d, 'buses');
}
function custom() { const d = emptyDocument('Custom IC'); const def = makeCustomBlock('Sensor', 'supply, VCC, top, power, 1\nground, GND, bottom, power, 1\ndata, DATA, right, output, 1\nenable, EN, left, input, 1'); def.id = 'example.sensor.v1'; place(d, def, { x: 0, y: 0 }); return stable(d, 'custom'); }
function catalogue() { const d = emptyDocument('Symbol catalogue'); library.forEach((p, i) => place(d, p, { x: (i % 8) * 240, y: Math.floor(i / 8) * 256 })); return stable(d, 'catalogue'); }
export const examples = [
  { name: 'Voltage divider', document: divider() }, { name: 'Two-input logic', document: logic() },
  { name: 'RC schematic', document: pair('RC schematic', 'Resistor', 'Capacitor') },
  { name: 'Transistor and LED', document: pair('Transistor and LED', 'NPN', 'LED') },
  { name: 'Op-amp schematic', document: pair('Op-amp schematic', 'DC voltage source', 'Op-amp') },
  { name: 'Flip-flop and counter', document: pair('Flip-flop and counter', 'D flip-flop', 'Counter') },
  { name: 'Bus and splitter', document: buses() }, { name: 'Junctions and crossings', document: crossing() },
  { name: 'Custom IC', document: custom() }, { name: 'Complete symbol catalogue', document: catalogue() },
];
