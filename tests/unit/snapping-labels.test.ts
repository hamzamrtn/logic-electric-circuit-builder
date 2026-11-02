import { expect, it } from 'vitest';
import { snapToSegment } from '../../src/core/geometry/geometry';
import { addWire, place } from '../../src/core/commands/operations';
import { anchorKey, emptyDocument, serializeDocument } from '../../src/core/model/document';
import { findPart } from '../../src/components/definitions/library';
import { anchorDescription, objectDescription, terminalDescription } from '../../src/editor/render/drawing';
it('snaps along horizontal and vertical wires while remaining on the segment', () => {
  expect(snapToSegment({ x: 39, y: 10 }, { x: 0, y: 8 }, { x: 128, y: 8 }).point).toEqual({ x: 40, y: 8 });
  expect(snapToSegment({ x: 66, y: 56 }, { x: 64, y: -32 }, { x: 64, y: 128 }).point).toEqual({ x: 64, y: 56 });
});
it('uses wire proximity for hit testing even between snapped target positions', () => {
  const result = snapToSegment({ x: 28, y: 1 }, { x: 0, y: 0 }, { x: 96, y: 0 });
  expect(result.distance).toBe(1); expect(result.point).toEqual({ x: 32, y: 0 });
});
it('retains precise projection when snapping is disabled and clamps to real endpoints', () => {
  expect(snapToSegment({ x: 39, y: 10 }, { x: 0, y: 8 }, { x: 128, y: 8 }, false).point).toEqual({ x: 39, y: 8 });
  expect(snapToSegment({ x: 0, y: 8 }, { x: 3, y: 8 }, { x: 11, y: 8 }).point).toEqual({ x: 3, y: 8 });
});
it('keeps free-angle grid targets on the line without jumping to distant endpoints', () => {
  expect(snapToSegment({ x: 37, y: 37 }, { x: 0, y: 0 }, { x: 96, y: 96 }).point).toEqual({ x: 40, y: 40 });
  const result = snapToSegment({ x: 45, y: 47 }, { x: 0, y: 0 }, { x: 97, y: 101 });
  expect(Math.hypot(result.point.x - 45, result.point.y - 47)).toBeLessThan(2);
});
it('presents part and pin names instead of internal identifiers in wire hints', () => {
  const d = emptyDocument(), c = place(d, findPart('Buffer'), { x: 0, y: 0 });
  addWire(d, { kind: 'pin', componentId: c.id, pinId: 'out' }, { kind: 'free', point: { x: 160, y: 0 } });
  const before = serializeDocument(d), w = d.wires[0], label = objectDescription(d, w.id);
  expect(label).toContain('U1 · Y'); expect(label).toContain('Wire end');
  for (const id of [c.id, w.id, ...d.nodes.map(n => n.id)]) expect(label).not.toContain(id);
  expect(terminalDescription(d, `${anchorKey(w.a)}[0]`)).toBe('U1 · Y');
  expect(terminalDescription(d, `${anchorKey(w.b)}[0]`)).toContain('Wire end');
  expect(anchorDescription(d, w.b)).not.toContain(d.nodes[0].id);
  expect(serializeDocument(d)).toBe(before);
});
