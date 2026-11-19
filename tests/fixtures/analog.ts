import { emptyDocument, type Anchor } from '../../src/core/model/document';
import { addWire, place } from '../../src/core/commands/operations';
import { findPart } from '../../src/components/definitions/library';

/** Switched RC charging circuit with a voltmeter across the capacitor. IDs are stable for tests. */
export function analogFixture() {
  const doc = emptyDocument('RC charge'); doc.id = 'rc-charge';
  const add = (id: string, part: string, x: number, y: number, value?: string, rotation: 0 | 90 = 0) => { const c = place(doc, findPart(part), { x, y }, rotation); c.id = id; c.reference = id.toUpperCase(); if (value) c.properties.value = value; return id; };
  const pin = (componentId: string, pinId: string): Anchor => ({ kind: 'pin', componentId, pinId });
  add('v1', 'DC voltage source', -320, 64, '5V', 90); add('sw1', 'SPST switch', -160, -64); add('r1', 'Resistor', 32, -64, '1k');
  add('c1', 'Capacitor', 224, 64, '1µF', 90); add('vm1', 'Voltmeter', 416, 64, undefined, 90); add('gnd', 'Ground', -320, 224);
  doc.annotations = doc.annotations.filter(a => a.kind !== 'label');
  addWire(doc, pin('v1', '1'), pin('sw1', '1'), [{ x: -320, y: -64 }]); addWire(doc, pin('sw1', '2'), pin('r1', '1'));
  addWire(doc, pin('r1', '2'), pin('c1', '1'), [{ x: 224, y: -64 }]); addWire(doc, pin('c1', '1'), pin('vm1', '1'), [{ x: 224, y: -64 }, { x: 416, y: -64 }]);
  addWire(doc, pin('v1', '2'), pin('gnd', '1')); addWire(doc, pin('c1', '2'), pin('gnd', '1'), [{ x: 224, y: 192 }, { x: -320, y: 192 }]);
  addWire(doc, pin('vm1', '2'), pin('c1', '2'), [{ x: 416, y: 192 }, { x: 224, y: 192 }]);
  doc.wires.forEach((w, i) => { w.id = `w${i}`; w.route.vertices.forEach((v, j) => { v.id = `w${i}-b${j}`; }); });
  return doc;
}
