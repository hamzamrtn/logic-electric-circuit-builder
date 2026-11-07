import { expect, it } from 'vitest';
import { addWire, commonJoinPoint, joinAndConnect, place } from '../../src/core/commands/operations';
import { anchorPosition, snapToSegment } from '../../src/core/geometry/geometry';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { makeBusSplitter } from '../../src/components/definitions/library';
import { deriveNets } from '../../src/core/topology/nets';
import { targetExists } from '../../src/editor/input/types';

function crossing() {
  const doc = emptyDocument();
  const horizontal = addWire(doc, { kind: 'free', point: { x: -80, y: 0 } }, { kind: 'free', point: { x: 80, y: 0 } });
  const vertical = addWire(doc, { kind: 'free', point: { x: 0, y: -80 } }, { kind: 'free', point: { x: 0, y: 80 } });
  return { doc, ids: [horizontal, vertical] };
}

it('joins all branches and a draft in one undo/redo transaction', () => {
  const f = crossing(), session = new DocumentSession(f.doc), before = serializeDocument(f.doc);
  session.edit('Join and draw', doc => { joinAndConnect(doc, f.ids, { x: 0, y: 0 }, { start: { kind: 'free', point: { x: -160, y: -160 } } }); });
  const result = session.getSnapshot().document, after = serializeDocument(result);
  expect(result.wires).toHaveLength(5); expect(deriveNets(result)).toHaveLength(1); expect(session.getSnapshot().revision).toBe(1);
  session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(before); expect(session.getSnapshot().canUndo).toBe(false);
  session.redo(); expect(serializeDocument(session.getSnapshot().document)).toBe(after);
});

it('keeps the actual draft start when splitting it changes the candidate wire piece', () => {
  const f = crossing(), session = new DocumentSession(f.doc);
  let wireId = '';
  session.edit('Join from a wire', doc => { wireId = joinAndConnect(doc, f.ids, { x: 0, y: 0 }, { start: { kind: 'wire', wireId: f.ids[0], point: { x: -40, y: 0 } }, bends: [{ x: -40, y: -48 }, { x: 0, y: -48 }] }).wireId!; });
  const doc = session.getSnapshot().document, wire = doc.wires.find(wire => wire.id === wireId)!;
  expect(anchorPosition(doc, wire.a)).toEqual({ x: -40, y: 0 }); expect(anchorPosition(doc, wire.b)).toEqual({ x: 0, y: 0 });
  expect(deriveNets(doc)).toHaveLength(1); expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});

it('a normal wire can connect two distinct points on the same existing wire', () => {
  const f = crossing(), session = new DocumentSession(f.doc); let created = '';
  expect(() => session.edit('Branch between wire points', doc => { created = addWire(doc, { kind: 'wire', wireId: f.ids[0], point: { x: -40, y: 0 } }, { kind: 'wire', wireId: f.ids[0], point: { x: 40, y: 0 } }, [{ x: -40, y: -48 }, { x: 40, y: -48 }]); })).not.toThrow();
  const doc = session.getSnapshot().document, wire = doc.wires.find(wire => wire.id === created)!;
  expect(anchorPosition(doc, wire.a)).toEqual({ x: -40, y: 0 }); expect(anchorPosition(doc, wire.b)).toEqual({ x: 40, y: 0 });
  expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});

it('joining at the draft start creates the junction without a zero-length extra wire', () => {
  const f = crossing(), session = new DocumentSession(f.doc);
  session.edit('Join at start', doc => { const result = joinAndConnect(doc, f.ids, { x: 0, y: 0 }, { start: { kind: 'wire', wireId: f.ids[0], point: { x: 0, y: 0 } } }); expect(result.wireId).toBeUndefined(); });
  expect(session.getSnapshot().document.wires).toHaveLength(4); expect(deriveNets(session.getSnapshot().document)).toHaveLength(1);
});

it('reconnects to joined wires without an intermediate saved join transaction', () => {
  const f = crossing(), reconnecting = addWire(f.doc, { kind: 'free', point: { x: -160, y: -160 } }, { kind: 'free', point: { x: -80, y: -160 } });
  const session = new DocumentSession(f.doc), before = serializeDocument(f.doc);
  session.edit('Join and reconnect', doc => { joinAndConnect(doc, f.ids, { x: 0, y: 0 }, { reconnect: { wireId: reconnecting, end: 'b' } }); });
  const result = session.getSnapshot().document;
  expect(anchorPosition(result, result.wires.find(wire => wire.id === reconnecting)!.b)).toEqual({ x: 0, y: 0 });
  expect(deriveNets(result)).toHaveLength(1); session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(before);
});

it('a width mismatch or stale join point leaves every original wire intact', () => {
  const f = crossing(), bus = place(f.doc, makeBusSplitter(8), { x: -320, y: -160 }), session = new DocumentSession(f.doc), before = serializeDocument(f.doc);
  expect(() => session.edit('Incompatible join', doc => { joinAndConnect(doc, f.ids, { x: 0, y: 0 }, { start: { kind: 'pin', componentId: bus.id, pinId: 'in-0' } }); })).toThrow(/width/);
  expect(serializeDocument(session.getSnapshot().document)).toBe(before); expect(session.getSnapshot().canUndo).toBe(false);
  expect(() => session.edit('Stale join', doc => { joinAndConnect(doc, f.ids, { x: 32, y: 0 }); })).toThrow(/shared/);
  expect(serializeDocument(session.getSnapshot().document)).toBe(before);
});

it('suggests an actual nearby crossing but never an unrelated parallel join', () => {
  const f = crossing(); expect(commonJoinPoint(f.doc, f.ids, { x: 6, y: 6 }, 23)).toEqual({ x: 0, y: 0 });
  expect(commonJoinPoint(f.doc, f.ids, { x: 64, y: 64 }, 23)).toBeUndefined();
  f.doc.nodes[2].position = { x: -80, y: 8 }; f.doc.nodes[3].position = { x: 80, y: 8 };
  expect(commonJoinPoint(f.doc, f.ids, { x: 0, y: 4 }, 23)).toBeUndefined();
});

it('invalidates moved wire targets while retaining quantized free-angle hit points', () => {
  const f = crossing(), target = { kind: 'wire' as const, wireId: f.ids[0], point: { x: 0, y: 0 } };
  expect(targetExists(f.doc, target)).toBe(true); f.doc.nodes[0].position.y = 80; f.doc.nodes[1].position.y = 80;
  expect(targetExists(f.doc, target)).toBe(false);
  const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 97, y: 101 } }, [], { geometry: 'free' });
  const point = snapToSegment({ x: 45, y: 47 }, { x: 0, y: 0 }, { x: 97, y: 101 }).point;
  expect(targetExists(doc, { kind: 'wire', wireId: wire, point })).toBe(true);
});
