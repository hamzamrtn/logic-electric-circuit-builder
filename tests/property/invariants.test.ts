import { expect, it } from 'vitest';
import fc from 'fast-check';
import { emptyDocument, serializeDocument, parseDocument } from '../../src/core/model/document';
import { place, moveSelection, transformSelection, addWire } from '../../src/core/commands/operations';
import { findPart } from '../../src/components/definitions/library';
import { deriveNets } from '../../src/core/topology/nets';
import { DocumentSession } from '../../src/core/session/DocumentSession';
it('generated moves and transforms preserve topology, and undo restores the original document', () => {
  fc.assert(fc.property(fc.array(fc.record({ x: fc.integer({ min: -100, max: 100 }), y: fc.integer({ min: -100, max: 100 }), rotate: fc.boolean() }), { minLength: 1, maxLength: 40 }), operations => {
    const d = emptyDocument(), a = place(d, findPart('Resistor'), { x: 0, y: 0 }), b = place(d, findPart('AND'), { x: 200, y: 0 });
    addWire(d, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: 'in-0' });
    const before = serializeDocument(d), topology = deriveNets(d).map(n => n.members), session = new DocumentSession(d);
    for (const op of operations) session.edit('Generated transform', doc => { moveSelection(doc, new Set([a.id]), { x: op.x, y: op.y }); if (op.rotate) transformSelection(doc, new Set([a.id]), 'rotate'); });
    const after = session.getSnapshot().document; expect(deriveNets(after).map(n => n.members)).toEqual(topology); expect(parseDocument(serializeDocument(after))).toEqual(after);
    while (session.getSnapshot().canUndo) session.undo(); expect(serializeDocument(session.getSnapshot().document)).toBe(before);
  }), { numRuns: 70, seed: 20261101 });
});
