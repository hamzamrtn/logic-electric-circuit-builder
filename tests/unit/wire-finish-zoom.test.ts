import { expect, it } from 'vitest';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';
import { finishDanglingWire, place } from '../../src/core/commands/operations';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { anchorPosition } from '../../src/core/geometry/geometry';
import { findPart } from '../../src/components/definitions/library';
import { screenToWorld, stepZoomAt } from '../../src/editor/input/types';
it('Finish ends at the last explicitly placed point, with one endpoint and one undo entry', () => {
  const d = emptyDocument(), c = place(d, findPart('Resistor'), { x: 0, y: 0 }), s = new DocumentSession(d), before = serializeDocument(d);
  s.edit('Finish wire', doc => { finishDanglingWire(doc, { kind: 'pin', componentId: c.id, pinId: '2' }, [{ x: 96, y: 0 }, { x: 96, y: 80 }]); });
  const result = s.getSnapshot().document;
  expect(result.wires).toHaveLength(1); expect(result.nodes).toHaveLength(1);
  expect(anchorPosition(result, result.wires[0].b)).toEqual({ x: 96, y: 80 });
  expect(result.wires[0].route.vertices.map(p => ({ x: p.x, y: p.y }))).toEqual([{ x: 96, y: 0 }]);
  s.undo(); expect(serializeDocument(s.getSnapshot().document)).toBe(before); expect(s.getSnapshot().canUndo).toBe(false);
});
it('Finish without a chosen endpoint preserves document and history', () => {
  const d = emptyDocument(), s = new DocumentSession(d);
  expect(() => s.edit('Finish wire', doc => { finishDanglingWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, []); })).toThrow(/endpoint/);
  expect(s.getSnapshot().document).toEqual(d); expect(s.getSnapshot().canUndo).toBe(false);
});
it('zoom buttons use predictable 25 percentage point stops and clamp at the minimum', () => {
  let camera = { x: 100, y: 50, zoom: 1.5 }; const center = { x: 400, y: 300 }, values: number[] = [];
  for (let i = 0; i < 7; i++) { camera = stepZoomAt(camera, center, -1); values.push(Math.round(camera.zoom * 1000) / 10); }
  expect(values).toEqual([125, 100, 75, 50, 25, 12.5, 12.5]);
  expect(stepZoomAt({ x: 0, y: 0, zoom: .77 }, center, 1).zoom).toBe(1);
  expect(stepZoomAt({ x: 0, y: 0, zoom: .77 }, center, -1).zoom).toBe(.75);
});
it('stepped zoom preserves the world point at the center of the viewport', () => {
  const camera = { x: 76, y: -40, zoom: 1.5 }, center = { x: 400, y: 300 };
  expect(screenToWorld(center, stepZoomAt(camera, center, -1))).toEqual(screenToWorld(center, camera));
});
