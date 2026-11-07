import { expect, it, vi } from 'vitest';
import type CircuitPlugin from '../../src/main';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';
const roots = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: () => roots }));
vi.mock('obsidian', () => ({
  MarkdownRenderChild: class {
    constructor(public containerEl: unknown) {}
    registerEvent() {}
  },
  Notice: class {},
}));
import { processPreview } from '../../src/obsidian/PreviewProcessor';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture(immediate = false) {
  roots.render.mockReset(); roots.unmount.mockReset();
  const file = { path: 'Circuit.lecircuit', basename: 'Circuit' }; let exists = true;
  const callbacks = new Map<string, ((target: typeof file) => void)[]>();
  const gate = deferred<string>();
  const element = { addClass: vi.fn(), setCssProps: vi.fn(), setText: vi.fn(), previousElementSibling: null, parentElement: null };
  const entry = { file }, acquire = vi.fn((_file: typeof file, _raw: string) => entry), release = vi.fn(async () => {});
  const plugin = {
    resolvePreview: () => ({ file, ambiguous: false }), sessions: { acquire, release, acquireFile: async (_file: typeof file, signal?: AbortSignal) => { if (immediate) return acquire(_file, 'validated'); const raw = await gate.promise; if (signal?.aborted || !exists) throw new Error('Circuit file is missing or changed'); return acquire(_file, raw); } },
    app: { vault: { read: () => gate.promise, getFileByPath: () => exists ? file : null, on: (name: string, callback: (target: typeof file) => void) => { callbacks.set(name, [...callbacks.get(name) ?? [], callback]); return { name, callback }; } } },
  };
  let child!: { onload(): void; onunload(): void };
  const context = { sourcePath: 'note.md', addChild: (value: typeof child) => { child = value; } };
  processPreview(plugin as unknown as CircuitPlugin, '/Circuit.lecircuit', element as unknown as HTMLElement, context as unknown as MarkdownPostProcessorContext);
  child.onload();
  return { gate, element, acquire, release, child, file, remove() { exists = false; for (const callback of callbacks.get('delete') ?? []) callback(file); } };
}

it('does not mount or acquire a preview deleted while its initial read is pending', async () => {
  const f = fixture(); f.remove(); f.gate.resolve(serializeDocument(emptyDocument()));
  await vi.waitFor(() => expect(f.element.setText).toHaveBeenCalledWith(expect.stringMatching(/missing|changed/)));
  expect(f.acquire).not.toHaveBeenCalled(); expect(roots.render).not.toHaveBeenCalled(); f.child.onunload();
});

it('releases a deleted preview immediately and only once, even before the note unloads', async () => {
  const f = fixture(); f.gate.resolve(serializeDocument(emptyDocument())); await vi.waitFor(() => expect(roots.render).toHaveBeenCalled());
  f.remove(); await vi.waitFor(() => expect(f.release).toHaveBeenCalledTimes(1));
  f.child.onunload(); expect(f.release).toHaveBeenCalledTimes(1); expect(roots.unmount).toHaveBeenCalledTimes(1);
});

it('unloading a note before its read finishes never acquires an orphan preview', async () => {
  const f = fixture(); f.child.onunload(); f.gate.resolve(serializeDocument(emptyDocument()));
  await Promise.resolve(); await Promise.resolve();
  expect(f.acquire).not.toHaveBeenCalled(); expect(roots.render).not.toHaveBeenCalled(); expect(f.release).not.toHaveBeenCalled();
});

it('a renderer failure releases its acquired session before the note closes', async () => {
  const f = fixture(); roots.render.mockImplementationOnce(() => { throw new Error('Renderer failed'); });
  f.gate.resolve(serializeDocument(emptyDocument()));
  await vi.waitFor(() => expect(f.element.setText).toHaveBeenCalledWith(expect.stringContaining('Renderer failed')));
  expect(f.release).toHaveBeenCalledTimes(1); expect(roots.unmount).toHaveBeenCalledTimes(1);
  f.child.onunload(); expect(f.release).toHaveBeenCalledTimes(1); expect(roots.unmount).toHaveBeenCalledTimes(1);
});

it('an already-acquired shared entry is released if the note unloads before mounting', async () => {
  const f = fixture(true); expect(f.acquire).toHaveBeenCalledTimes(1); f.child.onunload();
  await vi.waitFor(() => expect(f.release).toHaveBeenCalledTimes(1));
  expect(roots.render).not.toHaveBeenCalled(); expect(roots.unmount).not.toHaveBeenCalled();
});
