import { expect, it } from 'vitest';
import { findPart, makeBusSplitter } from '../../src/components/definitions/library';
import { place } from '../../src/core/commands/operations';
import { labelLayout, transform } from '../../src/core/geometry/geometry';
import { emptyDocument } from '../../src/core/model/document';

it('reserves a title row above every bus lane without moving the pins', () => {
  const d = makeBusSplitter(8), title = d.primitives.find(p => p.kind === 'text' && p.text.startsWith('8-bit'))!;
  if (title.kind !== 'text') throw new Error('Expected title');
  const topLane = d.pins.find(p => p.id === 'out-0')!;
  expect(topLane).toMatchObject({ x: 64, y: -56 });
  expect(topLane.y - title.y).toBeGreaterThanOrEqual(20);
  expect(d.bounds.y).toBeLessThan(title.y - title.size);
});

it.each([90, 270] as const)('keeps rotated LED labels outside the light arrows at %i degrees, including mirrored parts', rotation => {
  const d = findPart('LED'), c = place(emptyDocument(), d, { x: 100, y: 100 }, rotation);
  for (const mirrorY of [false, true]) {
    c.mirrorY = mirrorY;
    const arrowX = transform({ x: 12, y: -48 }, c).x;
    expect(labelLayout(c, d).x).toBeGreaterThanOrEqual(arrowX + 8);
  }
});
