import { expect, it } from 'vitest';
import { addWire, annotate, deleteSelection, insertComponent, joinWires, moveSelection, place, splitWire } from '../../src/core/commands/operations';
import { wirePoints } from '../../src/core/geometry/geometry';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { findPart } from '../../src/components/definitions/library';
import { deriveNets } from '../../src/core/topology/nets';

it('keeps both halves and the junction in a wire group after splitting', () => {
  const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: -128, y: 0 } }, { kind: 'free', point: { x: 128, y: 0 } });
  doc.groups.push({ id: 'group', name: 'Route', members: [wire], locked: false });
  const junction = splitWire(doc, wire, { x: 0, y: 0 });
  expect(doc.groups[0].members).toEqual(expect.arrayContaining(doc.wires.map(edge => edge.id)));
  expect(junction.kind).toBe('node'); if (junction.kind === 'node') expect(doc.groups[0].members).toContain(junction.nodeId);
  const before = doc.wires.map(edge => wirePoints(doc, edge)); moveSelection(doc, new Set(['group']), { x: 32, y: 48 });
  expect(doc.wires.map(edge => wirePoints(doc, edge))).toEqual(before.map(points => points.map(p => ({ x: p.x + 32, y: p.y + 48 }))));
  expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});

it('inserting a part preserves group ownership, free-angle routing, and exact undo', () => {
  const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: -128, y: 0 } }, { kind: 'free', point: { x: 128, y: 0 } }, [], { geometry: 'free', horizontalFirst: false });
  const part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  doc.groups.push({ id: 'group', name: 'Route', members: [wire], locked: false });
  const session = new DocumentSession(doc), original = serializeDocument(doc);
  expect(() => session.edit('Insert part', current => insertComponent(current, part.id, wire))).not.toThrow();
  const inserted = session.getSnapshot().document;
  expect(inserted.groups[0].members).toEqual(expect.arrayContaining([...inserted.wires.map(edge => edge.id), part.id]));
  expect(inserted.groups[0].members).not.toContain(wire);
  expect(inserted.wires.every(edge => edge.route.geometry === 'free' && !edge.route.horizontalFirst)).toBe(true);
  const before = inserted.wires.map(edge => wirePoints(inserted, edge));
  session.edit('Move group', current => moveSelection(current, new Set(['group']), { x: 32, y: 48 }));
  expect(session.getSnapshot().document.wires.map(edge => wirePoints(session.getSnapshot().document, edge))).toEqual(before.map(points => points.map(p => ({ x: p.x + 32, y: p.y + 48 }))));
  session.undo(); session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(original);
});

it('merging coincident wire ends updates group node references', () => {
  const doc = emptyDocument();
  addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 80, y: 0 } });
  const second = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 0, y: 80 } });
  const firstAnchor = doc.wires[0].a, former = doc.wires[1].a;
  if (firstAnchor.kind !== 'node' || former.kind !== 'node') throw new Error('Expected free endpoints');
  doc.groups.push({ id: 'group', name: 'Branch', members: [second, former.nodeId], locked: false });
  splitWire(doc, second, { x: 0, y: 0 }, firstAnchor);
  expect(doc.groups[0].members).toContain(firstAnchor.nodeId); expect(doc.groups[0].members).not.toContain(former.nodeId);
  expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});

it('joining several coincident endpoints retains the component pin in the joined net', () => {
  const doc = emptyDocument(), first = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: -80, y: 0 } });
  const part = place(doc, findPart('Resistor'), { x: 48, y: 0 });
  const second = addWire(doc, { kind: 'pin', componentId: part.id, pinId: '1' }, { kind: 'free', point: { x: 0, y: -80 } });
  const third = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 0, y: 80 } });
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  session.edit('Join endpoints', current => joinWires(current, [first, second, third], { x: 0, y: 0 }));
  const joined = session.getSnapshot().document;
  expect(joined.wires.every(wire => wire.a.kind === 'pin' && wire.a.componentId === part.id && wire.a.pinId === '1')).toBe(true);
  expect(deriveNets(joined).find(net => net.wireIds.includes(first))!.wireIds).toHaveLength(3);
  expect(parseDocument(serializeDocument(joined))).toEqual(joined);
  session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(before);
});

it('joining distinct overlapping pins refuses to detach either intrinsic pin identity', () => {
  const doc = emptyDocument(), a = place(doc, findPart('Resistor'), { x: -48, y: 0 }), b = place(doc, findPart('Resistor'), { x: 48, y: 0 });
  const first = addWire(doc, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'free', point: { x: -160, y: 80 } });
  const second = addWire(doc, { kind: 'pin', componentId: b.id, pinId: '1' }, { kind: 'free', point: { x: 160, y: 80 } });
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  expect(() => session.edit('Join overlapping pins', current => joinWires(current, [first, second], { x: 0, y: 0 }))).toThrow(/visible wire/);
  expect(serializeDocument(session.getSnapshot().document)).toBe(before); expect(session.getSnapshot().canUndo).toBe(false);
});

it('Delete with attached wires preserves protected wires as visible dangling ends', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  const wire = addWire(doc, { kind: 'pin', componentId: part.id, pinId: '2' }, { kind: 'free', point: { x: 160, y: 0 } });
  doc.groups.push({ id: 'protected', name: 'Fixed wire', members: [wire], locked: true });
  const before = wirePoints(doc, doc.wires[0]); deleteSelection(doc, new Set([part.id]), true);
  expect(doc.components).toHaveLength(0); expect(doc.wires).toHaveLength(1); expect(doc.wires[0].id).toBe(wire);
  expect(doc.wires[0].a.kind).toBe('node'); expect(wirePoints(doc, doc.wires[0])).toEqual(before);
  expect(doc.groups[0].members).toEqual([wire]); expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});

it.each(['wire', 'annotation'])('deleting a junction with a protected %s dependency is refused atomically', kind => {
  const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 80, y: 0 } });
  const node = doc.nodes[0];
  if (kind === 'wire') doc.wires[0].locked = true;
  else { annotate(doc, 'label', 'KEEP', { x: 0, y: -32 }, { kind: 'node', nodeId: node.id }); doc.annotations[0].locked = true; }
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  expect(() => session.edit('Delete junction', current => deleteSelection(current, new Set([node.id])))).toThrow(/Unlock/);
  expect(serializeDocument(session.getSnapshot().document)).toBe(before); expect(session.getSnapshot().canUndo).toBe(false);
  expect(doc.wires[0].id).toBe(wire);
});

it('deleting an unrelated object or an empty selection preserves existing unreferenced nodes', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  doc.nodes.push({ id: 'standalone', position: { x: 80, y: 80 }, explicit: false });
  doc.groups.push({ id: 'protected', name: 'Fixed node', members: ['standalone'], locked: true });
  const session = new DocumentSession(doc), original = serializeDocument(doc);
  session.edit('Empty delete', current => deleteSelection(current, new Set()));
  expect(serializeDocument(session.getSnapshot().document)).toBe(original); expect(session.getSnapshot().canUndo).toBe(false);
  session.edit('Delete part', current => deleteSelection(current, new Set([part.id])));
  expect(session.getSnapshot().document.nodes).toEqual(doc.nodes); expect(session.getSnapshot().document.groups).toEqual(doc.groups);
});
