import { expect, it } from 'vitest';
import { annotate } from '../../src/core/commands/operations';
import { documentSchema, emptyDocument, pointSchema } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';

it('rejects edits that would save a file larger than the supported UTF-8 import limit', () => {
  const session = new DocumentSession(emptyDocument());
  expect(() => session.edit('Oversized annotations', doc => {
    for (let i = 0; i < 800; i++) annotate(doc, 'text', '界'.repeat(4000), { x: i * 8, y: 0 });
  })).toThrow(/8 MiB/);
  expect(session.getSnapshot()).toMatchObject({ revision: 0, canUndo: false, canRedo: false });
  expect(session.getSnapshot().document.annotations).toHaveLength(0);
});

it('retains signed coordinate limits and rejects fractional or non-finite geometry', () => {
  expect(pointSchema.parse({ x: -1_000_000, y: 1_000_000 })).toEqual({ x: -1_000_000, y: 1_000_000 });
  for (const x of [-1_000_001, 1_000_001, 0.5, NaN, Infinity, -Infinity]) expect(pointSchema.safeParse({ x, y: 0 }).success).toBe(false);
});

it('rejects unknown nested fields without stripping them or changing the import', () => {
  const doc = { ...emptyDocument(), nodes: [{ id: 'node-1', position: { x: -16, y: 32 }, explicit: true, futureFlag: true }] };
  const before = JSON.stringify(doc);
  expect(documentSchema.safeParse(doc).success).toBe(false);
  expect(JSON.stringify(doc)).toBe(before);
});
