import { expect, it } from 'vitest';
import fc from 'fast-check';
import { intersection } from '../../src/core/geometry/geometry';

it('finds exact integer crossings regardless of segment slopes and lengths', () => {
  const point = fc.record({ x: fc.integer({ min: -100000, max: 100000 }), y: fc.integer({ min: -100000, max: 100000 }) });
  const vector = fc.record({ x: fc.integer({ min: -10000, max: 10000 }), y: fc.integer({ min: -10000, max: 10000 }) });
  fc.assert(fc.property(point, vector, vector, fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }), (p, r, s, a, b) => {
    fc.pre(r.x * s.y !== r.y * s.x);
    const shift = (v: typeof r, factor: number) => ({ x: p.x + v.x * factor, y: p.y + v.y * factor });
    expect(intersection(shift(r, -a), shift(r, b), shift(s, -b), shift(s, a))).toEqual(p);
    expect(intersection(p, shift(r, b), shift(s, -b), shift(s, a), true)).toEqual(p);
    expect(intersection(p, shift(r, b), shift(s, -b), shift(s, a))).toBeUndefined();
  }), { numRuns: 200, seed: 20261110 });
});
