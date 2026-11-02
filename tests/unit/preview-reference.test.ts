import { expect, it } from 'vitest';
import { parsePreviewOptions, previewBlock, repairPreviewReference, resolvePreviewFile } from '../../src/io/preview-reference';
it('supports legacy path-only previews and bounded width options', () => {
  expect(parsePreviewOptions('MyCircuit.lecircuit')).toEqual({ path: 'MyCircuit.lecircuit', width: '400px' });
  expect(parsePreviewOptions('/Circuits/MyCircuit.lecircuit\nwidth: 50%').width).toBe('50%');
  expect(() => parsePreviewOptions('MyCircuit.lecircuit\nwidth: url(evil)')).toThrow();
  expect(() => parsePreviewOptions('MyCircuit.lecircuit\nwidth: 120%')).toThrow();
});
it('resolves identical circuit names by full vault path and refuses an ambiguous basename', () => {
  const files = [{ path: 'A/Example.lecircuit', name: 'Example.lecircuit' }, { path: 'B/Example.lecircuit', name: 'Example.lecircuit' }];
  expect(resolvePreviewFile(files, '/A/Example.lecircuit', 'Notes/note.md').file).toBe(files[0]);
  expect(resolvePreviewFile(files, 'B/Example.lecircuit', 'Notes/note.md').file).toBe(files[1]);
  expect(resolvePreviewFile(files, 'Example.lecircuit', 'Notes/note.md')).toEqual({ file: undefined, ambiguous: true });
  expect(resolvePreviewFile(files, '../A/Example.lecircuit', 'Notes/note.md').file).toBe(files[0]);
});
it('repairs the selected preview while preserving width and unrelated code/text', () => {
  const original = 'before\n```lecircuit\nOld.lecircuit\nwidth: 320px\n```\n\n```js\nconst text = "Old.lecircuit";\n```\n';
  const result = repairPreviewReference(original, 'Old.lecircuit', 'Circuits/New.lecircuit', 1);
  expect(result).toContain('/Circuits/New.lecircuit\nwidth: 320px'); expect(result).toContain('const text = "Old.lecircuit";'); expect(result).toContain('before\n');
});
it('distinguishes repeated preview blocks and ignores fenced examples', () => {
  const markdown = '````markdown\n```lecircuit\nOld.lecircuit\n```\n````\n\n```lecircuit\nOld.lecircuit\n```\n\n```lecircuit\nOld.lecircuit\n```';
  expect(() => repairPreviewReference(markdown, 'Old.lecircuit', 'New.lecircuit')).toThrow(/More than one/);
  const result = repairPreviewReference(markdown, 'Old.lecircuit', 'New.lecircuit', 11);
  expect(result.match(/\/New.lecircuit/g)).toHaveLength(1); expect(result.match(/Old.lecircuit/g)).toHaveLength(2);
});
it('inserts no duplicate wiki-link heading and removes an old adjacent generated link on repair', () => {
  expect(previewBlock('Circuits/New.lecircuit')).toBe('```lecircuit\n/Circuits/New.lecircuit\nwidth: 400px\n```\n');
  const markdown = '[[New.lecircuit]]\n\n```lecircuit\nOld.lecircuit\n```\n';
  const result = repairPreviewReference(markdown, 'Old.lecircuit', 'New.lecircuit');
  expect(result).not.toContain('[['); expect(result).toContain('/New.lecircuit');
});
