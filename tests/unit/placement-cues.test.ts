import { expect, it } from 'vitest';
import { bodyBox, placementCues, type BodyBox } from '../../src/editor/input/placement-cues';
import { clone, emptyDocument } from '../../src/core/model/document';
import { place } from '../../src/core/commands/operations';
import { findPart } from '../../src/components/definitions/library';

const box = (id: string, x: number, y: number): BodyBox => ({ id, x, y, width: 64, height: 64 });
it('uses transformed body bounds for rotated and mirrored placement cues', () => {
  const doc = emptyDocument(), definition = clone(findPart('Resistor'));
  definition.bounds = { x: 0, y: 0, width: 80, height: 40 };
  const component = place(doc, definition, { x: 100, y: 100 }, 90); component.mirrorX = true;
  expect(bodyBox(component, definition)).toEqual({ id: component.id, x: 60, y: 20, width: 40, height: 80 });
});
it('shows actual center alignment without changing any placement coordinates', () => {
  const moving = box('ghost', 96, 0), target = box('target', 0, 0), before = JSON.stringify([moving, target]);
  const cues = placementCues(moving, [target], new Set(), 1);
  expect(cues.overlaps).toEqual([]); expect(cues.guides).toEqual([{ axis: 'y', x1: -12, x2: 172, y1: 32, y2: 32 }]);
  expect(JSON.stringify([moving, target])).toBe(before);
  expect(placementCues(moving, [box('near miss', 0, 1)], new Set(), 1).guides).toEqual([]);
});
it('treats touching edges as clear and excludes moving group members from overlap cues', () => {
  const moving = box('moving', 0, 0), touching = box('touching', 64, 0), overlapping = box('overlap', 63, 0);
  expect(placementCues(moving, [touching], new Set(), 1).overlaps).toEqual([]);
  expect(placementCues(moving, [overlapping], new Set(), 1).overlaps).toEqual([overlapping]);
  expect(placementCues(moving, [overlapping], new Set(['overlap']), 1).overlaps).toEqual([]);
});
it('keeps guides nearby in screen space and limits visual clutter', () => {
  const moving = box('ghost', 0, 0), far = box('far', 500, 0);
  expect(placementCues(moving, [far], new Set(), 1).guides).toEqual([]);
  expect(placementCues(moving, [far], new Set(), .25).guides).toHaveLength(1);
  const cues = placementCues(moving, Array.from({ length: 10 }, (_, i) => box(String(i), i, i)), new Set(), 1);
  expect(cues.overlaps).toHaveLength(4); expect(cues.guides.length).toBeLessThanOrEqual(2);
});
