import { describe, expect, it } from 'vitest';
import { emptyDocument, parseDocument, serializeDocument, clone, anchorKey, documentSchema } from '../../src/core/model/document';
import { addWire, place, moveSelection, transformSelection, joinWires, deleteSelection, insertComponent, fragment, paste, disconnectNode } from '../../src/core/commands/operations';
import { deriveNets } from '../../src/core/topology/nets';
import { anchorPosition, wirePoints } from '../../src/core/geometry/geometry';
import { findPart, library, makeBusSplitter } from '../../src/components/definitions/library';
import { DocumentSession } from '../../src/core/session/DocumentSession';

describe('explicit circuit topology', () => {
  it('does not connect crossed wire interiors, then explicitly joins and undoes exactly', () => {
    const d = emptyDocument();
    addWire(d, { kind: 'free', point: { x: -64, y: 0 } }, { kind: 'free', point: { x: 64, y: 0 } });
    addWire(d, { kind: 'free', point: { x: 0, y: -64 } }, { kind: 'free', point: { x: 0, y: 64 } });
    expect(deriveNets(d)).toHaveLength(2);
    const s = new DocumentSession(d), before = serializeDocument(d);
    s.edit('Join', doc => joinWires(doc, doc.wires.map(w => w.id), { x: 0, y: 0 }));
    expect(deriveNets(s.getSnapshot().document)).toHaveLength(1);
    const node = s.getSnapshot().document.nodes.find(n => n.explicit)!;
    expect(s.getSnapshot().document.wires.filter(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === node.id))).toHaveLength(4);
    s.undo(); expect(serializeDocument(s.getSnapshot().document)).toBe(before);
    s.redo(); expect(deriveNets(s.getSnapshot().document)).toHaveLength(1);
  });
  it('moving and rotating wired parts preserve pin references and keep resistor ends separate', () => {
    const d = emptyDocument(), a = place(d, findPart('Resistor'), { x: 0, y: 0 }), b = place(d, findPart('DC voltage source'), { x: 160, y: 0 });
    addWire(d, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: '1' });
    const before = deriveNets(d).map(n => n.members), refs = clone(d.wires[0]);
    moveSelection(d, new Set([a.id]), { x: 0, y: 160 }); transformSelection(d, new Set([a.id]), 'rotate');
    expect(d.wires[0].a).toEqual(refs.a); expect(d.wires[0].b).toEqual(refs.b); expect(deriveNets(d).map(n => n.members)).toEqual(before);
    expect(deriveNets(d)).toHaveLength(3);
  });
  it('splits a selected segment without changing its manual geometry', () => {
    const d = emptyDocument();
    const id = addWire(d, { kind: 'free', point: { x: -64, y: 0 } }, { kind: 'free', point: { x: 64, y: 64 } }, [{ x: 0, y: 0 }, { x: 0, y: 64 }]);
    addWire(d, { kind: 'free', point: { x: -64, y: 32 } }, { kind: 'wire', wireId: id, point: { x: 0, y: 32 } });
    expect(deriveNets(d)).toHaveLength(1); expect(d.wires).toHaveLength(3);
    expect(d.wires.flatMap(w => wirePoints(d, w))).toContainEqual({ x: 0, y: 64 });
    expect(() => parseDocument(serializeDocument(d))).not.toThrow();
  });
  it('deletes a part into dangling ends and restores exact identities on undo', () => {
    const d = emptyDocument(), c = place(d, findPart('Resistor'), { x: 0, y: 0 });
    addWire(d, { kind: 'pin', componentId: c.id, pinId: '1' }, { kind: 'free', point: { x: -128, y: 0 } });
    const session = new DocumentSession(d); session.edit('Delete', doc => deleteSelection(doc, new Set([c.id])));
    expect(session.getSnapshot().document.wires[0].a.kind).toBe('node'); session.undo(); expect(session.getSnapshot().document).toEqual(d);
  });
  it('inserts a resistor into a wire without leaving a hidden bypass', () => {
    const d = emptyDocument(); const w = addWire(d, { kind: 'free', point: { x: -128, y: 0 } }, { kind: 'free', point: { x: 128, y: 0 } });
    const c = place(d, findPart('Resistor'), { x: 0, y: 0 }); insertComponent(d, c.id, w);
    expect(d.wires).toHaveLength(2); expect(deriveNets(d)).toHaveLength(2); expect(d.wires.some(edge => edge.id === w)).toBe(false);
  });
  it('copies a fragment with new IDs, dangling boundary wires, embedded definitions and isolated signal names', () => {
    const d = emptyDocument(); const a = place(d, findPart('Resistor'), { x: 0, y: 0 }), b = place(d, findPart('Resistor'), { x: 160, y: 0 });
    addWire(d, { kind: 'pin', componentId: a.id, pinId: '2' }, { kind: 'pin', componentId: b.id, pinId: '1' });
    const f = fragment(d, new Set([a.id])); expect(f.components).toHaveLength(1); expect(f.wires[0].b.kind).toBe('node');
    const old = new Set(d.components.map(c => c.id)); paste(d, f); expect(d.components).toHaveLength(3); expect(old.has(d.components[2].id)).toBe(false);
    expect(new Set(d.components.map(c => c.reference)).size).toBe(3); expect(() => parseDocument(serializeDocument(d))).not.toThrow();
  });
  it('disconnects a four-way junction using explicit arm pairing', () => {
    const d = emptyDocument(); addWire(d, { kind: 'free', point: { x: -64, y: 0 } }, { kind: 'free', point: { x: 64, y: 0 } }); addWire(d, { kind: 'free', point: { x: 0, y: -64 } }, { kind: 'free', point: { x: 0, y: 64 } });
    const oldIds = d.wires.map(w => w.id); joinWires(d, oldIds, { x: 0, y: 0 });
    const n = d.nodes.find(n => n.explicit)!;
    const horizontal = d.wires.filter(w => wirePoints(d, w).every(p => p.y === 0)).map(w => w.id), vertical = d.wires.filter(w => !horizontal.includes(w.id)).map(w => w.id);
    disconnectNode(d, n.id, [horizontal, vertical]); expect(deriveNets(d)).toHaveLength(2);
  });
  it('keeps bus lanes separate and rejects width mismatches atomically', () => {
    const d = emptyDocument(), a = place(d, makeBusSplitter(4), { x: 0, y: 0 }), b = place(d, makeBusSplitter(4), { x: 240, y: 0 });
    addWire(d, { kind: 'pin', componentId: a.id, pinId: 'in-0' }, { kind: 'pin', componentId: b.id, pinId: 'in-0' });
    expect(deriveNets(d)).toHaveLength(4);
    const session = new DocumentSession(d), before = serializeDocument(d);
    expect(() => session.edit('Bad bus', doc => addWire(doc, { kind: 'pin', componentId: a.id, pinId: 'out-0' }, { kind: 'pin', componentId: b.id, pinId: 'in-0' }))).toThrow(/width/i);
    expect(serializeDocument(session.getSnapshot().document)).toBe(before);
  });
  it('validates every built-in definition and round trips a complete library sheet', () => {
    const d = emptyDocument(); library.forEach((p, i) => place(d, p, { x: (i % 8) * 240, y: Math.floor(i / 8) * 240 }));
    documentSchema.parse(d); expect(parseDocument(serializeDocument(d))).toEqual(d); expect(library.length).toBeGreaterThan(60);
  });
  it('rejects duplicate IDs, missing pins, extra executable fields, deep input and future schemas', () => {
    const d = emptyDocument(); const c = place(d, findPart('Resistor'), { x: 0, y: 0 }); d.components.push(clone(c));
    expect(() => parseDocument(JSON.stringify(d))).toThrow();
    expect(() => parseDocument(JSON.stringify({ ...emptyDocument(), schemaVersion: 22 }))).toThrow(/Unsupported/);
    expect(() => parseDocument(JSON.stringify({ ...emptyDocument(), script: '<script>alert(1)</script>' }))).toThrow();
    expect(() => parseDocument('['.repeat(40) + '0' + ']'.repeat(40))).toThrow(/nesting/);
  });
  it('four rotations and two mirrors restore original pin positions', () => {
    const d = emptyDocument(), c = place(d, findPart('AND'), { x: 32, y: 64 }); const a = { kind: 'pin' as const, componentId: c.id, pinId: 'in-0' };
    const before = anchorPosition(d, a); for (let i = 0; i < 4; i++) transformSelection(d, new Set([c.id]), 'rotate');
    expect(anchorPosition(d, a)).toEqual(before); transformSelection(d, new Set([c.id]), 'mirrorX'); transformSelection(d, new Set([c.id]), 'mirrorX'); expect(anchorPosition(d, a)).toEqual(before);
    expect(anchorKey(a)).toContain(c.id);
  });
});
