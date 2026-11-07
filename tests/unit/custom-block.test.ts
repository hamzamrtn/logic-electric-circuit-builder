import { expect, it } from 'vitest';
import { makeCustomBlock } from '../../src/components/definitions/library';
import { place } from '../../src/core/commands/operations';
import { bounds, GRID } from '../../src/core/geometry/geometry';
import { emptyDocument, parseDocument, serializeDocument } from '../../src/core/model/document';

it.each(['left', 'right', 'top', 'bottom'])('sizes custom blocks to contain all 64 pins on the %s side', side => {
  const definition = makeCustomBlock('Wide IC', Array.from({ length: 64 }, (_, i) => `pin-${i}, P${i}, ${side}, passive, 1`).join('\n'));
  const body = definition.primitives.find(p => p.kind === 'rect')!;
  if (body.kind !== 'rect') throw new Error('Expected a rectangular body');
  const doc = emptyDocument(); place(doc, definition, { x: 0, y: 0 }); const extent = bounds(doc);
  for (const pin of definition.pins) {
    expect(Number.isInteger(pin.x / GRID)).toBe(true); expect(Number.isInteger(pin.y / GRID)).toBe(true);
    expect(pin.x).toBeGreaterThanOrEqual(extent.x); expect(pin.x).toBeLessThanOrEqual(extent.x + extent.width);
    expect(pin.y).toBeGreaterThanOrEqual(extent.y); expect(pin.y).toBeLessThanOrEqual(extent.y + extent.height);
    if (side === 'left' || side === 'right') { expect(pin.y).toBeGreaterThanOrEqual(body.y + 16); expect(pin.y).toBeLessThanOrEqual(body.y + body.height - 16); }
    else { expect(pin.x).toBeGreaterThanOrEqual(body.x + 16); expect(pin.x).toBeLessThanOrEqual(body.x + body.width - 16); }
  }
  expect(parseDocument(serializeDocument(doc))).toEqual(doc);
});

it('rejects duplicate custom pin IDs before entering placement', () => {
  expect(() => makeCustomBlock('IC', 'same, A, left, input, 1\nsame, B, right, output, 1')).toThrow(/unique/);
});
