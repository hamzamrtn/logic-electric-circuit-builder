import { expect, it } from 'vitest';
import { addWire, place, transformSelection } from '../../src/core/commands/operations';
import { anchorPosition, GRID, snap, transform, wirePoints } from '../../src/core/geometry/geometry';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';
import { findPart, library, makeGate } from '../../src/components/definitions/library';
it('places all built-in pin coordinates on the visible grid under right-angle transforms', () => {
  for (const definition of [...library, ...[2, 3, 4, 5, 6, 7, 8].map(n => makeGate('XOR', n))]) {
    for (const rotation of [0, 90, 180, 270] as const) {
      const d = emptyDocument(), c = place(d, definition, { x: 40, y: 56 }, rotation);
      for (const pin of definition.pins) { const p = transform(pin, c); expect(p.x / GRID).toBe(Math.round(p.x / GRID)); expect(p.y / GRID).toBe(Math.round(p.y / GRID)); }
    }
  }
});
it('allows a manually placed wire point to align with an XOR input without a detour', () => {
  const d = emptyDocument(), c = place(d, findPart('XOR'), { x: 0, y: 0 }), target = { kind: 'pin' as const, componentId: c.id, pinId: 'in-0' };
  const pin = anchorPosition(d, target), corner = snap({ x: -73, y: pin.y });
  addWire(d, { kind: 'free', point: { x: -160, y: pin.y } }, target, [corner]);
  expect(corner.y).toBe(pin.y); expect(wirePoints(d, d.wires[0]).every(p => p.y === pin.y)).toBe(true);
});
it('routes directly to an off-16-unit gate pin on the shared finer grid', () => {
  const d = emptyDocument(), c = place(d, findPart('XOR'), { x: 0, y: 0 }), target = { kind: 'pin' as const, componentId: c.id, pinId: 'in-0' }, pin = anchorPosition(d, target);
  addWire(d, { kind: 'free', point: { x: -160, y: pin.y } }, target);
  expect(wirePoints(d, d.wires[0]).every(p => p.y === pin.y)).toBe(true);
});
it('rotates every rendered wire elbow rigidly with a fully selected circuit', () => {
  const d = emptyDocument(), buffer = place(d, findPart('Buffer'), { x: -96, y: -96 }, 180), gate = place(d, findPart('XOR'), { x: 96, y: 0 });
  addWire(d, { kind: 'pin', componentId: buffer.id, pinId: 'out' }, { kind: 'pin', componentId: gate.id, pinId: 'in-0' }, [{ x: -192, y: -96 }]);
  addWire(d, { kind: 'pin', componentId: gate.id, pinId: 'out' }, { kind: 'pin', componentId: buffer.id, pinId: 'in-0' }, [{ x: 224, y: 0 }, { x: 224, y: -160 }]);
  const ids = new Set([...d.components, ...d.nodes, ...d.wires].map(x => x.id)), before = d.wires.map(w => wirePoints(d, w)), original = serializeDocument(d);
  const pivot = snap({ x: (buffer.position.x + gate.position.x) / 2, y: (buffer.position.y + gate.position.y) / 2 });
  transformSelection(d, ids, 'rotate');
  expect(d.wires.map(w => wirePoints(d, w))).toEqual(before.map(points => points.map(p => ({ x: pivot.x - (p.y - pivot.y), y: pivot.y + (p.x - pivot.x) }))));
  for (let i = 0; i < 3; i++) transformSelection(d, ids, 'rotate');
  expect(serializeDocument(d)).toBe(original);
});
