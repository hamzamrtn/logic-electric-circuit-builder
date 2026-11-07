import { expect, it } from 'vitest';
import { addWire, annotate, deleteSelection, detachComponent, disconnectNode, insertComponent, moveSelection, place, reconfigure, splitWire, transformSelection } from '../../src/core/commands/operations';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';
import { findPart } from '../../src/components/definitions/library';
import { DocumentSession } from '../../src/core/session/DocumentSession';

it('protects a locked group and its contents from deletion', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  doc.groups.push({ id: 'group', name: 'Locked circuit', locked: true, members: [part.id] });
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  session.edit('Delete selection', current => deleteSelection(current, new Set(['group', part.id])));
  expect(serializeDocument(session.getSnapshot().document)).toBe(before); expect(session.getSnapshot().canUndo).toBe(false);
});

it('deleting only a group container preserves its members', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  doc.groups.push({ id: 'group', name: 'Circuit', locked: false, members: [part.id] });
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  session.edit('Delete group', current => deleteSelection(current, new Set(['group'])));
  expect(session.getSnapshot().document.groups).toHaveLength(0);
  expect(session.getSnapshot().document.components).toEqual(doc.components);
  session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(before);
});

it('rotating components preserves the deliberate waypoints of a locked wire', () => {
  const doc = emptyDocument(), a = place(doc, findPart('Resistor'), { x: 0, y: 0 }), b = place(doc, findPart('Resistor'), { x: 192, y: 0 });
  addWire(doc, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: '1' }, [{ x: 80, y: 80 }]);
  doc.wires[0].locked = true; const route = structuredClone(doc.wires[0].route);
  transformSelection(doc, new Set([a.id, b.id, doc.wires[0].id]), 'rotate');
  expect(doc.wires[0].route).toEqual(route);
});

it('preserves a locked annotation position when its attached component moves or rotates', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  annotate(doc, 'label', 'OUT', { x: 80, y: -32 }, { kind: 'pin', componentId: part.id, pinId: '2' });
  doc.annotations[0].locked = true; const before = structuredClone(doc.annotations[0]);
  moveSelection(doc, new Set([part.id]), { x: 32, y: 48 }); transformSelection(doc, new Set([part.id]), 'rotate');
  expect(doc.annotations[0]).toEqual(before);
});

it('preserves wire geometry protected by a locked group when its components move', () => {
  const doc = emptyDocument(), a = place(doc, findPart('Resistor'), { x: 0, y: 0 }), b = place(doc, findPart('Resistor'), { x: 192, y: 0 });
  const wire = addWire(doc, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: '1' }, [{ x: 80, y: 80 }]);
  doc.groups.push({ id: 'group', name: 'Locked route', locked: true, members: [wire] });
  const route = structuredClone(doc.wires[0].route), ids = new Set([a.id, b.id]);
  moveSelection(doc, ids, { x: 32, y: 48 }); transformSelection(doc, ids, 'rotate');
  expect(doc.wires[0].route).toEqual(route);
});

it('does not move a protected junction through a selected wire', () => {
  const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 80, y: 0 } });
  const node = doc.nodes[0]; doc.groups.push({ id: 'group', name: 'Fixed junction', locked: true, members: [node.id] });
  moveSelection(doc, new Set([wire]), { x: 32, y: 48 });
  expect(node.position).toEqual({ x: 0, y: 0 }); expect(doc.nodes[1].position).toEqual({ x: 112, y: 48 });
});

it.each([false, true])('direct graph commands reject protected objects before mutation (group lock: %s)', grouped => {
  const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: -128, y: 0 } }, { kind: 'free', point: { x: 128, y: 0 } });
  const part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
  addWire(doc, { kind: 'pin', componentId: part.id, pinId: '2' }, { kind: 'free', point: { x: 240, y: 0 } });
  if (grouped) doc.groups.push({ id: 'protected', name: 'Protected circuit', members: [...doc.components, ...doc.wires, ...doc.nodes].map(object => object.id), locked: true });
  else { part.locked = true; doc.wires.forEach(edge => { edge.locked = true; }); }
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  const operations = [
    (current: typeof doc) => splitWire(current, wire, { x: 0, y: 0 }),
    (current: typeof doc) => detachComponent(current, part.id),
    (current: typeof doc) => reconfigure(current, part.id, findPart('Resistor')),
    (current: typeof doc) => insertComponent(current, part.id, wire),
    (current: typeof doc) => disconnectNode(current, current.nodes[0].id, [[wire]]),
  ];
  for (const operation of operations) {
    expect(() => session.edit('Protected operation', operation)).toThrow(/Unlock/);
    expect(serializeDocument(session.getSnapshot().document)).toBe(before);
  }
  expect(session.getSnapshot().canUndo).toBe(false);
});
