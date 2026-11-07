import { expect, it } from 'vitest';
import { addWire, place } from '../../src/core/commands/operations';
import { anchorPosition, transform } from '../../src/core/geometry/geometry';
import { routeWire } from '../../src/core/geometry/router';
import { emptyDocument, type Point, type Wire } from '../../src/core/model/document';
import { findPart } from '../../src/components/definitions/library';

function freeWire(start: Point, end: Point, horizontalFirst = true) {
  const doc = emptyDocument();
  doc.nodes = [{ id: 'start', position: start, explicit: false }, { id: 'end', position: end, explicit: false }];
  const wire: Wire = { id: 'wire', a: { kind: 'node', nodeId: 'start' }, b: { kind: 'node', nodeId: 'end' }, width: 1, locked: false, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst, vertices: [] } };
  doc.wires.push(wire); return { doc, wire };
}
function orthogonal(points: Point[]) {
  for (let i = 1; i < points.length; i++) expect(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y).toBe(true);
}

it.each([true, false])('honors the preferred first direction (%s) without unnecessary bends', horizontalFirst => {
  const { doc, wire } = freeWire({ x: 0, y: 0 }, { x: 80, y: 80 }, horizontalFirst);
  const result = routeWire(doc, wire);
  expect(result.exhausted).toBe(false);
  expect(result.points).toEqual([{ x: 0, y: 0 }, horizontalFirst ? { x: 80, y: 0 } : { x: 0, y: 80 }, { x: 80, y: 80 }]);
});

it.each([0, 90, 180, 270] as const)('leaves and approaches pins in their outward directions after rotation %s', rotation => {
  for (const mirrored of [false, true]) {
    const doc = emptyDocument(), a = place(doc, findPart('Resistor'), { x: 0, y: 0 }, rotation), b = place(doc, findPart('Resistor'), { x: 320, y: 160 }, rotation);
    a.mirrorX = mirrored; b.mirrorX = mirrored;
    const from = { kind: 'pin' as const, componentId: a.id, pinId: '2' }, to = { kind: 'pin' as const, componentId: b.id, pinId: '2' };
    addWire(doc, from, to);
    const result = routeWire(doc, doc.wires[0]); expect(result.exhausted).toBe(false); orthogonal(result.points);
    const first = result.points[0], second = result.points[1], last = result.points.at(-1)!, penultimate = result.points.at(-2)!;
    const direction = transform({ x: 1, y: 0 }, a), endDirection = transform({ x: 1, y: 0 }, b);
    const outward = { x: direction.x - a.position.x, y: direction.y - a.position.y }, endOutward = { x: endDirection.x - b.position.x, y: endDirection.y - b.position.y };
    expect(first).toEqual(anchorPosition(doc, from)); expect(last).toEqual(anchorPosition(doc, to));
    expect((second.x - first.x) * outward.x + (second.y - first.y) * outward.y).toBeGreaterThan(0);
    expect((last.x - penultimate.x) * endOutward.x + (last.y - penultimate.y) * endOutward.y).toBeLessThan(0);
    expect(Math.abs((second.x - first.x) * outward.y - (second.y - first.y) * outward.x)).toBe(0);
    expect(Math.abs((last.x - penultimate.x) * endOutward.y - (last.y - penultimate.y) * endOutward.x)).toBe(0);
  }
});

it('routes long circuits around an obstacle without spending the budget on empty grid cells', () => {
  const { doc, wire } = freeWire({ x: -100000, y: 0 }, { x: 100000, y: 0 });
  place(doc, findPart('Resistor'), { x: 0, y: 0 });
  const result = routeWire(doc, wire, 2500);
  expect(result.exhausted).toBe(false); expect(result.points.length).toBeLessThanOrEqual(6); orthogonal(result.points);
  expect(result.points.some(p => Math.abs(p.y) >= 40)).toBe(true);
});

it('keeps exact off-grid endpoints on an explicitly orthogonal route', () => {
  const { doc, wire } = freeWire({ x: -155, y: 3 }, { x: 157, y: 97 }); place(doc, findPart('Resistor'), { x: 0, y: 32 });
  const result = routeWire(doc, wire); expect(result.exhausted).toBe(false); orthogonal(result.points);
  expect(result.points[0]).toEqual({ x: -155, y: 3 }); expect(result.points.at(-1)).toEqual({ x: 157, y: 97 });
});

it('routes behind a source component by going around its body rather than back through it', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  addWire(doc, { kind: 'pin', componentId: part.id, pinId: '2' }, { kind: 'free', point: { x: -160, y: 0 } });
  const result = routeWire(doc, doc.wires[0]); expect(result.exhausted).toBe(false); orthogonal(result.points);
  expect(result.points[1].x).toBeGreaterThan(48);
  expect(result.points.some(p => Math.abs(p.y) >= 40)).toBe(true);
});
