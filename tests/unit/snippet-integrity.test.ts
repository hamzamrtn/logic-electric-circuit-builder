import { expect, it } from 'vitest';
import { addWire, annotate, deleteSelection, fragment, paste, place } from '../../src/core/commands/operations';
import { anchorPosition } from '../../src/core/geometry/geometry';
import { assertGraph, emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { findPart } from '../../src/components/definitions/library';

it('copies an attached label alone as a valid snippet with an independent anchor', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 80, y: 80 });
  const anchor = { kind: 'pin' as const, componentId: part.id, pinId: '2' };
  const label = annotate(doc, 'label', 'OUT', { x: 128, y: 48 }, anchor);
  const snippet = fragment(doc, new Set([label]));
  expect(() => parseDocument(serializeDocument(snippet))).not.toThrow();
  expect(snippet.components).toHaveLength(0); expect(snippet.annotations).toHaveLength(1);
  expect(snippet.annotations[0].anchor?.kind).toBe('node');
  expect(anchorPosition(snippet, snippet.annotations[0].anchor!)).toEqual(anchorPosition(doc, anchor));
  const target = emptyDocument(); paste(target, snippet); expect(() => assertGraph(target)).not.toThrow();
  expect(target.annotations[0].text).not.toBe('OUT'); expect(target.annotations[0].anchor).not.toEqual(snippet.annotations[0].anchor);
});

it('keeps a copied wire and explicitly selected label on the same detached pin', () => {
  const doc = emptyDocument(), part = place(doc, findPart('Resistor'), { x: 80, y: 80 });
  const anchor = { kind: 'pin' as const, componentId: part.id, pinId: '2' };
  const wire = addWire(doc, anchor, { kind: 'free', point: { x: 240, y: 80 } });
  const label = annotate(doc, 'label', 'OUT', { x: 128, y: 48 }, anchor);
  const snippet = fragment(doc, new Set([wire, label]));
  expect(() => parseDocument(serializeDocument(snippet))).not.toThrow();
  expect(snippet.annotations[0].anchor).toEqual(snippet.wires[0].a);
});

it('copies grouped junctions even when the group has no wires', () => {
  const doc = emptyDocument(); doc.nodes.push({ id: 'junction', position: { x: 80, y: 80 }, explicit: true });
  doc.groups.push({ id: 'group', name: 'Junction', members: ['junction'], locked: false });
  const snippet = fragment(doc, new Set(['group']));
  expect(() => parseDocument(serializeDocument(snippet))).not.toThrow();
  expect(snippet.nodes).toHaveLength(1); expect(snippet.groups[0].members).toEqual(['junction']);
});

it('deleting a grouped wire removes cleaned-up endpoints from its group in one undo step', () => {
  const doc = emptyDocument();
  const wire = addWire(doc, { kind: 'free', point: { x: 0, y: 0 } }, { kind: 'free', point: { x: 80, y: 0 } });
  doc.groups.push({ id: 'group', name: 'Wire', members: [wire, ...doc.nodes.map(node => node.id)], locked: false });
  const session = new DocumentSession(doc), before = serializeDocument(doc);
  expect(() => session.edit('Delete wire', current => deleteSelection(current, new Set([wire])))).not.toThrow();
  expect(session.getSnapshot().document.nodes).toHaveLength(0); expect(session.getSnapshot().document.groups[0].members).toEqual([]);
  session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(before);
});
