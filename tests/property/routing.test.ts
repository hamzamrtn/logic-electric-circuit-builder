import { expect, it } from 'vitest';
import fc from 'fast-check';
import { place } from '../../src/core/commands/operations';
import { routeWire } from '../../src/core/geometry/router';
import { clone, emptyDocument, serializeDocument, type Wire } from '../../src/core/model/document';
import { findPart } from '../../src/components/definitions/library';

it('generated obstacle routes are orthogonal, clear every body, preserve endpoints and never edit topology', () => {
  const obstacle = fc.record({ x: fc.integer({ min: -30, max: 30 }), y: fc.integer({ min: -8, max: 8 }), width: fc.integer({ min: 2, max: 24 }), height: fc.integer({ min: 2, max: 24 }), rotate: fc.boolean() });
  fc.assert(fc.property(fc.array(obstacle, { maxLength: 8 }), fc.boolean(), (shapes, horizontalFirst) => {
    const doc = emptyDocument(), rectangles: { left: number; right: number; top: number; bottom: number }[] = [];
    shapes.forEach((shape, index) => {
      const definition = clone(findPart('Resistor')), width = shape.width * 8, height = shape.height * 8;
      definition.id = `obstacle-${index}`; definition.bounds = { x: -width / 2, y: -height / 2, width, height };
      place(doc, definition, { x: shape.x * 8, y: shape.y * 8 }, shape.rotate ? 90 : 0);
      const rx = (shape.rotate ? height : width) / 2 + 8, ry = (shape.rotate ? width : height) / 2 + 8;
      rectangles.push({ left: shape.x * 8 - rx, right: shape.x * 8 + rx, top: shape.y * 8 - ry, bottom: shape.y * 8 + ry });
    });
    const start = { x: -512, y: -3 }, end = { x: 512, y: 5 };
    doc.nodes.push({ id: 'start', position: start, explicit: false }, { id: 'end', position: end, explicit: false });
    const wire: Wire = { id: 'wire', a: { kind: 'node', nodeId: 'start' }, b: { kind: 'node', nodeId: 'end' }, width: 1, locked: false, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst, vertices: [] } };
    doc.wires.push(wire); const before = serializeDocument(doc), result = routeWire(doc, wire);
    expect(result.exhausted).toBe(false); expect(result.points[0]).toEqual(start); expect(result.points.at(-1)).toEqual(end);
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1], b = result.points[i]; expect(a.x === b.x || a.y === b.y).toBe(true);
      for (const rectangle of rectangles) {
        const blocked = a.x === b.x
          ? a.x > rectangle.left && a.x < rectangle.right && Math.max(a.y, b.y) > rectangle.top && Math.min(a.y, b.y) < rectangle.bottom
          : a.y > rectangle.top && a.y < rectangle.bottom && Math.max(a.x, b.x) > rectangle.left && Math.min(a.x, b.x) < rectangle.right;
        expect(blocked).toBe(false);
      }
    }
    expect(serializeDocument(doc)).toBe(before);
  }), { numRuns: 150, seed: 20261107 });
});
