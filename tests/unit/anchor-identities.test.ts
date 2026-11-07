import { expect, it } from 'vitest';
import { addWire, place } from '../../src/core/commands/operations';
import { anchorKey, emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';
import { makeCustomBlock } from '../../src/components/definitions/library';
import { deriveNets } from '../../src/core/topology/nets';
import { terminalDescription } from '../../src/editor/render/drawing';

it('keeps independent nets separate when valid component and pin IDs contain colons', () => {
  const doc = emptyDocument(), a = place(doc, makeCustomBlock('A', 'c, A, left, passive, 1'), { x: 0, y: 0 }), b = place(doc, makeCustomBlock('B', 'b:c, B, left, passive, 1'), { x: 320, y: 0 });
  a.id = 'a:b'; b.id = 'a';
  const aa = { kind: 'pin' as const, componentId: a.id, pinId: 'c' }, ba = { kind: 'pin' as const, componentId: b.id, pinId: 'b:c' };
  addWire(doc, aa, { kind: 'free', point: { x: -160, y: 0 } });
  addWire(doc, ba, { kind: 'free', point: { x: 160, y: 0 } });
  expect(deriveNets(doc)).toHaveLength(2);
  expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  expect(terminalDescription(doc, `${anchorKey(aa)}[0]`)).toBe('U1 · A');
  expect(terminalDescription(doc, `${anchorKey(ba)}[0]`)).toBe('U2 · B');
});

it('allows a wire between two distinct pins whose unescaped IDs would look identical', () => {
  const doc = emptyDocument(), a = place(doc, makeCustomBlock('A', 'c, A, left, passive, 1'), { x: 0, y: 0 }), b = place(doc, makeCustomBlock('B', 'b:c, B, left, passive, 1'), { x: 320, y: 0 });
  a.id = 'a:b'; b.id = 'a';
  expect(() => addWire(doc, { kind: 'pin', componentId: a.id, pinId: 'c' }, { kind: 'pin', componentId: b.id, pinId: 'b:c' })).not.toThrow();
  expect(deriveNets(doc)).toHaveLength(1);
  expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});
