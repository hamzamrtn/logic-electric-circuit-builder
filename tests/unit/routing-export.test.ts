import { expect, it } from 'vitest';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { addWire, annotate, place, moveSelection } from '../../src/core/commands/operations';
import { routeThroughPoints, routeWire } from '../../src/core/geometry/router';
import { findPart } from '../../src/components/definitions/library';
import { exportSVG } from '../../src/io/export';
import { examples } from '../../src/components/definitions/examples';
import { screenToWorld, zoomAt } from '../../src/editor/input/types';
it('all shipped examples validate and export without losing their definitions', () => {
  for (const example of examples) { const doc = parseDocument(serializeDocument(example.document)); expect(doc).toEqual(example.document); expect(exportSVG(doc)).toContain('<svg'); }
});
it('SVG is self contained, escapes markup and includes offscreen objects', () => {
  const d = emptyDocument('<script>bad</script>'); place(d, findPart('Resistor'), { x: 10000, y: 10000 }); annotate(d, 'text', '<img onerror="bad">', { x: -10000, y: -10000 });
  const svg = exportSVG(d); expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;'); expect(svg).toContain('&lt;img'); expect(svg).toContain('10000'); expect(svg).not.toContain('foreignObject'); expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toContain('http://');
});
it('a bounded route search terminates and retains an explicit fallback', () => {
  const d = emptyDocument(); addWire(d, { kind: 'free', point: { x: -128, y: 0 } }, { kind: 'free', point: { x: 128, y: 0 } }); place(d, findPart('Generic IC'), { x: 0, y: 0 });
  const result = routeWire(d, d.wires[0], 1); expect(result.exhausted).toBe(true); expect(result.points).toHaveLength(3);
});
it('zoom stays anchored to the selected screen point', () => {
  const c = { x: 120, y: -32, zoom: .75 }, screen = { x: 300, y: 200 }, world = screenToWorld(screen, c); const next = zoomAt(c, screen, 1.5); expect(screenToWorld(screen, next)).toEqual(world);
});
it('moving a selected fragment keeps internal manual bends and stretches boundaries', () => {
  const d = emptyDocument(), a = place(d, findPart('Resistor'), { x: 0, y: 0 }), b = place(d, findPart('Resistor'), { x: 160, y: 0 });
  addWire(d, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: '1' }, [{ x: 80, y: 32 }]);
  moveSelection(d, new Set([a.id, b.id]), { x: 32, y: 48 }); expect(d.wires[0].route.vertices.find(p => p.locked)).toMatchObject({ x: 112, y: 80 });
});
it('routes a placement preview around component bodies while ignoring other wires', () => {
  const d = emptyDocument(); place(d, findPart('Resistor'), { x: 0, y: 0 });
  const points = routeThroughPoints(d, [{ x: -160, y: 0 }, { x: 160, y: 0 }]);
  expect(points.some(p => Math.abs(p.y) >= 40)).toBe(true);
  expect(points[0]).toEqual({ x: -160, y: 0 }); expect(points.at(-1)).toEqual({ x: 160, y: 0 });
  const empty = emptyDocument(); addWire(empty, { kind: 'free', point: { x: 0, y: -96 } }, { kind: 'free', point: { x: 0, y: 96 } });
  expect(routeThroughPoints(empty, [{ x: -160, y: 0 }, { x: 160, y: 0 }]).every(p => p.y === 0)).toBe(true);
});
it('moves internal branch nodes with a selected circuit fragment', () => {
  const d = emptyDocument(), a = place(d, findPart('Resistor'), { x: 0, y: 0 }), b = place(d, findPart('Resistor'), { x: 192, y: 0 });
  const main = addWire(d, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: '1' });
  addWire(d, { kind: 'wire', wireId: main, point: { x: 96, y: 0 } }, { kind: 'free', point: { x: 96, y: 96 } });
  const before = d.nodes.map(n => ({ ...n.position })); moveSelection(d, new Set([a.id, b.id]), { x: 32, y: 48 });
  expect(d.nodes.map(n => n.position)).toEqual(before.map(p => ({ x: p.x + 32, y: p.y + 48 })));
});
