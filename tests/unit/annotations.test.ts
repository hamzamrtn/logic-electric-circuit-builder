import { expect, it } from 'vitest';
import { annotate, moveSelection, place, transformSelection } from '../../src/core/commands/operations';
import { annotationCenter, annotationCorners, annotationLocalBounds, annotationPoint, transformAnnotationFromHandle } from '../../src/core/geometry/annotations';
import { bounds } from '../../src/core/geometry/geometry';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { findPart } from '../../src/components/definitions/library';
import { deriveNets } from '../../src/core/topology/nets';
import { exportSVG } from '../../src/io/export';
function example() { const d = emptyDocument(); annotate(d, 'text', 'hello', { x: 80, y: 96 }); return d; }
it('resizes text from a corner while retaining the opposite corner', () => {
  const d = example(), a = d.annotations[0]; a.rotation = 30; a.scaleX = 1.2; a.scaleY = .8;
  const b = annotationLocalBounds(a), before = annotationCorners(a), target = annotationPoint(a, { x: b.x + b.width * 2, y: b.y + b.height * 2 });
  const result = transformAnnotationFromHandle(a, 'se', before[2], target), after = annotationCorners(result);
  expect(result.scaleX).toBeCloseTo(2.4); expect(result.scaleY).toBeCloseTo(1.6);
  expect(Math.hypot(after[0].x - before[0].x, after[0].y - before[0].y)).toBeLessThan(1);
});
it('rotates around the center and restores the complete annotation in one undo', () => {
  const d = example(), a = d.annotations[0], center = annotationCenter(a), s = new DocumentSession(d);
  const result = transformAnnotationFromHandle(a, 'rotate', { x: center.x, y: center.y - 40 }, { x: center.x + 40, y: center.y });
  expect(result.rotation).toBe(90); expect(Math.hypot(annotationCenter(result).x - center.x, annotationCenter(result).y - center.y)).toBeLessThan(1);
  s.edit('Rotate annotation', doc => { doc.annotations[0] = result; }); s.undo(); expect(s.getSnapshot().document).toEqual(d);
});
it('exports transformed text and includes all rotated corners in full-document bounds', () => {
  const d = example(); Object.assign(d.annotations[0], { rotation: 35, scaleX: 2, scaleY: 3, fontSize: 24 });
  const b = bounds(d); for (const p of annotationCorners(d.annotations[0])) { expect(p.x).toBeGreaterThanOrEqual(b.x); expect(p.x).toBeLessThanOrEqual(b.x + b.width); expect(p.y).toBeGreaterThanOrEqual(b.y); expect(p.y).toBeLessThanOrEqual(b.y + b.height); }
  expect(exportSVG(d)).toContain('rotate(35) scale(2 3)'); expect(parseDocument(serializeDocument(d))).toEqual(d);
});
it('opens earlier annotation records with identity transforms and a readable font', () => {
  const old = JSON.parse(serializeDocument(example())); delete old.annotations[0].rotation; delete old.annotations[0].scaleX; delete old.annotations[0].scaleY; delete old.annotations[0].fontSize;
  expect(parseDocument(JSON.stringify(old)).annotations[0]).toMatchObject({ rotation: 0, scaleX: 1, scaleY: 1, fontSize: 14 });
});
it('moving and transforming a named annotation preserves its electrical anchor', () => {
  const d = emptyDocument(), c = place(d, findPart('Resistor'), { x: 0, y: 0 }); annotate(d, 'label', 'OUT', { x: 80, y: 0 }, { kind: 'pin', componentId: c.id, pinId: '2' });
  const a = d.annotations[0], anchor = { ...a.anchor! }, nets = deriveNets(d); moveSelection(d, new Set([a.id]), { x: 32, y: 16 }); transformSelection(d, new Set([a.id]), 'rotate');
  expect(a.rotation).toBe(90); expect(a.anchor).toEqual(anchor); expect(deriveNets(d)).toEqual(nets);
});
it('clamps extreme resize gestures rather than producing negative or nonfinite scales', () => {
  const a = example().annotations[0], p = annotationCorners(a)[2];
  const result = transformAnnotationFromHandle(a, 'se', p, { x: -100000, y: -100000 });
  expect(result.scaleX).toBe(.1); expect(result.scaleY).toBe(.1); expect(Number.isFinite(result.position.x)).toBe(true);
});
it('keeps text proportional by default and permits explicit free resizing with Shift', () => {
  const a = example().annotations[0], b = annotationLocalBounds(a), start = annotationCorners(a)[2], target = annotationPoint(a, { x: b.width * 3, y: b.y + b.height * 2 });
  const proportional = transformAnnotationFromHandle(a, 'se', start, target);
  const free = transformAnnotationFromHandle(a, 'se', start, target, true);
  expect(proportional.scaleX).toBeCloseTo(3); expect(proportional.scaleY).toBeCloseTo(3);
  expect(free.scaleX).toBeCloseTo(3); expect(free.scaleY).toBeCloseTo(2);
});
it('does not jump when a resize handle is grabbed away from its center', () => {
  const a = example().annotations[0], b = annotationLocalBounds(a), corner = annotationCorners(a)[2], start = { x: corner.x + 7, y: corner.y + 4 };
  const result = transformAnnotationFromHandle(a, 'se', start, { x: start.x + b.width, y: start.y + b.height });
  expect(result.scaleX).toBeCloseTo(2); expect(result.scaleY).toBeCloseTo(2);
});
it('omits identity presentation fields so ordinary annotations keep the earlier file shape', () => {
  const d = example(), serialized = JSON.parse(serializeDocument(d));
  expect(serialized.annotations[0]).not.toHaveProperty('rotation'); expect(serialized.annotations[0]).not.toHaveProperty('scaleX'); expect(serialized.annotations[0]).not.toHaveProperty('fontSize');
  d.annotations[0].scaleX = 2; expect(JSON.parse(serializeDocument(d)).annotations[0].scaleX).toBe(2);
});
