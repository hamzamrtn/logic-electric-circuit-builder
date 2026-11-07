import { expect, it } from 'vitest';
import fc from 'fast-check';
import { addWire, annotate, deleteSelection, moveSelection, place, splitWire } from '../../src/core/commands/operations';
import { wirePoints } from '../../src/core/geometry/geometry';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { findPart } from '../../src/components/definitions/library';
import { deriveNets } from '../../src/core/topology/nets';

it('generated split sequences keep a grouped route connected, movable and exactly undoable', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: -7, max: 7 }), { maxLength: 12 }), fc.integer({ min: -10, max: 10 }), fc.boolean(), (cuts, step, free) => {
    const doc = emptyDocument(), wire = addWire(doc, { kind: 'free', point: { x: -512, y: 0 } }, { kind: 'free', point: { x: 512, y: 0 } }, [], { geometry: free ? 'free' : 'orthogonal' });
    doc.groups.push({ id: 'group', name: 'Route', members: [wire], locked: false });
    const session = new DocumentSession(doc), original = serializeDocument(doc);
    for (const cut of cuts) session.edit('Split route', current => {
      const x = cut * 64, target = current.wires.find(edge => { const points = wirePoints(current, edge); return x >= Math.min(points[0].x, points.at(-1)!.x) && x <= Math.max(points[0].x, points.at(-1)!.x); })!;
      splitWire(current, target.id, { x, y: 0 });
    });
    const split = session.getSnapshot().document, beforeMove = split.wires.map(edge => wirePoints(split, edge)), delta = { x: step * 8, y: 48 };
    session.edit('Move route', current => moveSelection(current, new Set(['group']), delta));
    const result = session.getSnapshot().document;
    expect(result.wires.map(edge => wirePoints(result, edge))).toEqual(beforeMove.map(points => points.map(p => ({ x: p.x + delta.x, y: p.y + delta.y }))));
    expect(deriveNets(result)).toHaveLength(1); expect(parseDocument(serializeDocument(result))).toEqual(result);
    while (session.getSnapshot().canUndo) session.undo();
    expect(serializeDocument(session.getSnapshot().document)).toBe(original);
  }), { numRuns: 100, seed: 20261108 });
});

it('arbitrary deletion requests preserve every explicitly locked or group-protected object', () => {
  fc.assert(fc.property(fc.array(fc.boolean(), { minLength: 24, maxLength: 24 }), flags => {
    const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 0, y: 0 });
    addWire(doc, { kind: 'pin', componentId: part.id, pinId: '2' }, { kind: 'free', point: { x: 160, y: 0 } });
    annotate(doc, 'label', 'OUT', { x: 160, y: -32 }, { kind: 'node', nodeId: doc.nodes[0].id });
    doc.nodes.push({ id: 'standalone', position: { x: 80, y: 80 }, explicit: false });
    [...doc.components, ...doc.wires, ...doc.annotations].forEach((object, i) => { object.locked = flags[i]; });
    doc.groups.push({ id: 'group', name: 'Protected subset', members: [doc.wires[0].id, 'standalone'], locked: flags[3] });
    const objects = [...doc.components, ...doc.wires, ...doc.nodes, ...doc.annotations, ...doc.groups];
    const protectedIds = new Set(objects.filter(object => 'locked' in object && object.locked).map(object => object.id));
    for (const group of doc.groups) if (group.locked) group.members.forEach(id => protectedIds.add(id));
    const selected = new Set(objects.filter((_, i) => flags[i + 4]).map(object => object.id)), session = new DocumentSession(doc), before = serializeDocument(doc);
    try { session.edit('Delete subset', current => deleteSelection(current, selected, flags[20])); }
    catch (error) { expect(String(error)).toContain('Unlock'); expect(serializeDocument(session.getSnapshot().document)).toBe(before); }
    const result = session.getSnapshot().document, surviving = new Set([...result.components, ...result.wires, ...result.nodes, ...result.annotations, ...result.groups].map(object => object.id));
    for (const id of protectedIds) expect(surviving.has(id)).toBe(true);
    expect(parseDocument(serializeDocument(result))).toEqual(result);
    while (session.getSnapshot().canUndo) session.undo();
    expect(serializeDocument(session.getSnapshot().document)).toBe(before);
  }), { numRuns: 150, seed: 20261109 });
});
