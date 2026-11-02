import { expect, it } from 'vitest';
import { emptyDocument, type Point } from '../../src/core/model/document';
import { addWire, annotate, fragment, paste, place } from '../../src/core/commands/operations';
import { findPart } from '../../src/components/definitions/library';
import { overlapWarnings } from '../../src/editor/render/drawing';
import { deriveNets } from '../../src/core/topology/nets';
it('diagnoses overlapping parts across spatial bucket boundaries', () => {
  const d = emptyDocument(); place(d, findPart('Resistor'), { x: 48, y: 0 }); place(d, findPart('Resistor'), { x: 80, y: 0 });
  expect(overlapWarnings(d).some(x => x.message.includes('bodies overlap'))).toBe(true);
});
it('diagnoses partially overlapping collinear wires without joining them', () => {
  const d = emptyDocument(); addWire(d, { kind: 'free', point: { x: -64, y: 0 } }, { kind: 'free', point: { x: 64, y: 0 } }); addWire(d, { kind: 'free', point: { x: -32, y: 0 } }, { kind: 'free', point: { x: 96, y: 0 } });
  expect(overlapWarnings(d).some(x => x.message.includes('Wire paths overlap'))).toBe(true); expect(deriveNets(d)).toHaveLength(2);
});
it('rejects a dangling wire whose repeated bends all occupy the same position', () => {
  const d = emptyDocument(), p: Point = { x: 0, y: 0 };
  expect(() => addWire(d, { kind: 'free', point: p }, { kind: 'free', point: p }, [p, p])).toThrow(/visible route/);
});
it('isolates copied signal labels but retains their internal equivalences', () => {
  const d = emptyDocument(), c = place(d, findPart('Resistor'), { x: 0, y: 0 }); annotate(d, 'label', 'SIGNAL', { x: 0, y: -64 }, { kind: 'pin', componentId: c.id, pinId: '1' });
  const f = fragment(d, new Set([c.id])); paste(d, f); expect(d.annotations).toHaveLength(2); expect(d.annotations[1].text).not.toBe('SIGNAL'); expect(deriveNets(d)).toHaveLength(4);
});
it('bounds spatial work for an imported symbol with extreme dimensions', () => {
  const d = emptyDocument(), part = JSON.parse(JSON.stringify(findPart('Resistor'))); part.bounds.width = 1000000; part.bounds.height = 1000000;
  place(d, part, { x: 0, y: 0 }); expect(overlapWarnings(d)[0].message).toContain('bounded');
});
