import { expect, it } from 'vitest';
import { annotate } from '../../src/core/commands/operations';
import { emptyDocument } from '../../src/core/model/document';
import { DocumentSession } from '../../src/core/session/DocumentSession';

it('rejects edits that would save a file larger than the supported UTF-8 import limit', () => {
  const session = new DocumentSession(emptyDocument());
  expect(() => session.edit('Oversized annotations', doc => {
    for (let i = 0; i < 800; i++) annotate(doc, 'text', '界'.repeat(4000), { x: i * 8, y: 0 });
  })).toThrow(/8 MiB/);
  expect(session.getSnapshot()).toMatchObject({ revision: 0, canUndo: false, canRedo: false });
  expect(session.getSnapshot().document.annotations).toHaveLength(0);
});
