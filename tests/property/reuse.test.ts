import { expect, it } from 'vitest';
import fc from 'fast-check';
import { addWire, annotate, deleteSelection, fragment, paste, place } from '../../src/core/commands/operations';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { findPart } from '../../src/components/definitions/library';

it('arbitrary snippets remain portable and arbitrary deletions preserve group integrity and undo', () => {
  fc.assert(fc.property(fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }), flags => {
    const doc = emptyDocument(), a = place(doc, findPart('Resistor'), { x: 0, y: 0 }), b = place(doc, findPart('Resistor'), { x: 192, y: 0 });
    const from = { kind: 'pin' as const, componentId: a.id, pinId: '2' }, to = { kind: 'pin' as const, componentId: b.id, pinId: '1' };
    addWire(doc, from, to); addWire(doc, to, { kind: 'free', point: { x: 320, y: 80 } });
    annotate(doc, 'label', 'OUT', { x: 80, y: 32 }, from); annotate(doc, 'no-connect', '', { x: 160, y: 0 }, to);
    annotate(doc, 'text', 'note', { x: 0, y: 80 });
    doc.groups.push({ id: 'group', name: 'Circuit', members: [...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations].map(x => x.id), locked: false });
    const objects = [...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations, ...doc.groups], selected = new Set(objects.filter((_, i) => flags[i]).map(x => x.id));
    const snippet = parseDocument(serializeDocument(fragment(doc, selected))), target = emptyDocument();
    paste(target, snippet); expect(parseDocument(serializeDocument(target))).toEqual(target);
    const session = new DocumentSession(doc), before = serializeDocument(doc);
    session.edit('Delete subset', current => deleteSelection(current, selected));
    expect(parseDocument(serializeDocument(session.getSnapshot().document))).toEqual(session.getSnapshot().document);
    if (session.getSnapshot().canUndo) session.undo();
    expect(serializeDocument(session.getSnapshot().document)).toBe(before);
  }), { numRuns: 100, seed: 20261106 });
});
