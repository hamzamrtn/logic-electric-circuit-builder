import { expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
vi.mock('obsidian', () => ({ normalizePath: (path: string) => path.replace(/\/+/g, '/').replace(/\/$/, '') }));
import { DEFAULT_RECOVERY_FOLDER, RecoveryStore, recoveryFolder } from '../../src/obsidian/RecoveryStore';

function fixture() {
  const files = new Map<string, { file: TFile; content: string }>(), folders = new Set<string>();
  function add(path: string, content: string) {
    const file = { path, get name() { return this.path.slice(this.path.lastIndexOf('/') + 1); } } as TFile;
    files.set(path, { file, content }); return file;
  }
  const vault = {
    getFileByPath: (path: string) => files.get(path)?.file ?? null,
    getFolderByPath: (path: string) => folders.has(path) ? { path } : null,
    getAbstractFileByPath: (path: string) => files.get(path)?.file ?? (folders.has(path) ? { path } : null),
    getFiles: () => [...files.values()].map(value => value.file),
    read: async (file: TFile) => { const entry = files.get(file.path); if (!entry) throw new Error('Missing file'); return entry.content; },
    modify: async (file: TFile, content: string) => { const entry = files.get(file.path); if (!entry) throw new Error('Missing file'); entry.content = content; },
    create: async (path: string, content: string) => {
      if (files.has(path) || folders.has(path)) throw new Error('Already exists');
      if (!folders.has(path.slice(0, path.lastIndexOf('/')))) throw new Error('Missing parent');
      return add(path, content);
    },
    createFolder: async (path: string) => {
      if (files.has(path) || folders.has(path)) throw new Error('Already exists');
      const parent = path.slice(0, path.lastIndexOf('/')); if (path.includes('/') && !folders.has(parent)) throw new Error('Missing parent');
      folders.add(path);
    },
    rename: vi.fn(async (file: TFile, path: string) => {
      if (files.has(path) || folders.has(path)) throw new Error('Already exists');
      const entry = files.get(file.path)!; files.delete(file.path); file.path = path; files.set(path, entry);
    }),
  };
  const persist = vi.fn(async (_folder: string) => {}), app = { vault } as unknown as App;
  const store = new RecoveryStore(app, DEFAULT_RECOVERY_FOLDER, persist);
  function moveFolder(oldPath: string, newPath: string) {
    for (const path of [...folders]) if (path === oldPath || path.startsWith(`${oldPath}/`)) { folders.delete(path); folders.add(newPath + path.slice(oldPath.length)); }
    for (const [path, entry] of [...files]) if (path.startsWith(`${oldPath}/`)) { files.delete(path); entry.file.path = newPath + path.slice(oldPath.length); files.set(entry.file.path, entry); }
  }
  return { files, folders, add, vault, store, app, persist, moveFolder };
}
const name = (slot = 0) => `recovery-abc-12-xyz-${slot}.json`;

it('validates vault paths without allowing absolute paths or traversal', () => {
  expect(recoveryFolder('')).toBe(DEFAULT_RECOVERY_FOLDER);
  expect(recoveryFolder(' Backups\\Circuits/ ')).toBe('Backups/Circuits');
  for (const value of ['/tmp/backups', 'C:\\Backups', '../Other', 'Backups/../Other', './Other', 'Bad\nPath']) expect(() => recoveryFolder(value)).toThrow(/inside the vault/);
});

it('creates nested folders and one explanatory README while reusing the three session slots', async () => {
  const f = fixture(); await f.store.changeFolder('Backups/Circuits');
  for (let index = 0; index < 5; index++) await f.store.write(name(index % 3), `snapshot ${index}`);
  expect(f.files.size).toBe(4); expect(f.files.get(`Backups/Circuits/${name()}`)?.content).toBe('snapshot 3');
  const readme = f.files.get('Backups/Circuits/00_README.md')!.content;
  expect(readme).toContain('Logic-Electric Circuit Builder'); expect(readme).toContain('Settings → Community plugins'); expect(readme).toContain('Backups/Circuits');
  expect(readme).toContain("## Change this folder's location only in plugin settings"); expect(readme).toContain('## Do not remove');
  expect(f.persist).toHaveBeenCalledWith('Backups/Circuits');
});

it('moves existing backups and redirects an open session without moving unrelated files', async () => {
  const f = fixture(); await f.store.write(name(), 'original');
  f.add('Circuit recovery/Notes.md', 'keep'); f.add('Circuit recovery/personal.json', 'keep too');
  await f.store.changeFolder('Backups'); await f.store.write(name(), 'latest');
  expect(f.files.has(`Circuit recovery/${name()}`)).toBe(false);
  expect(f.files.get(`Backups/${name()}`)?.content).toBe('latest');
  expect(f.files.get('Circuit recovery/Notes.md')?.content).toBe('keep'); expect(f.files.get('Circuit recovery/personal.json')?.content).toBe('keep too');
});

it('reuses backups manually moved before the path setting, including while the plugin was disabled', async () => {
  const f = fixture(); await f.store.write(name(), 'preserve'); f.moveFolder('Circuit recovery', 'Already moved');
  const reopened = new RecoveryStore(f.app, 'Circuit recovery', f.persist);
  await reopened.changeFolder('Already moved');
  expect(f.files.get(`Already moved/${name()}`)?.content).toBe('preserve');
  expect(f.files.get('Already moved/00_README.md')?.content).toContain('Current folder: "Already moved"');
  expect(f.folders.has('Circuit recovery')).toBe(false);
});

it('follows manual folder and ancestor moves after a settings change and refreshes the README', async () => {
  const f = fixture(); await f.store.write(name(), 'first'); await f.store.changeFolder('Backups/Circuits');
  f.moveFolder('Backups', 'Archive'); await f.store.folderRenamed('Archive', 'Backups');
  await f.store.write(name(), 'second');
  expect(f.persist).toHaveBeenLastCalledWith('Archive/Circuits'); expect(f.folders.has('Backups/Circuits')).toBe(false);
  expect(f.files.get(`Archive/Circuits/${name()}`)?.content).toBe('second');
  expect(f.files.get('Archive/Circuits/00_README.md')?.content).toContain('Current folder: "Archive/Circuits"');
  f.moveFolder('Archive/Circuits', 'Elsewhere'); await f.store.folderRenamed('Elsewhere', 'Archive/Circuits');
  await f.store.changeFolder('Elsewhere'); expect(f.files.get(`Elsewhere/${name()}`)?.content).toBe('second');
});

it('never overwrites a destination collision and keeps updating its own renamed slot', async () => {
  const f = fixture(); await f.store.write(name(), 'source'); f.folders.add('Backups'); f.add(`Backups/${name()}`, 'destination');
  await f.store.changeFolder('Backups'); await f.store.write(name(), 'latest');
  expect(f.files.get(`Backups/${name()}`)?.content).toBe('destination');
  expect(f.files.get('Backups/recovery-abc-12-xyz-0 2.json')?.content).toBe('latest');
  f.folders.add('Archive'); f.add('Archive/recovery-abc-12-xyz-0 2.json', 'archive collision');
  await f.store.changeFolder('Archive'); await f.store.changeFolder('Final');
  expect([...f.files.entries()].some(([path, entry]) => path.startsWith('Final/') && entry.content === 'latest')).toBe(true);
});

it('serializes a backup written during migration into the new folder', async () => {
  const f = fixture(); await f.store.write(name(), 'first');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const rename = f.vault.rename.getMockImplementation()!;
  f.vault.rename.mockImplementation(async (file, path) => { await gate; await rename(file, path); });
  const move = f.store.changeFolder('Backups'), write = f.store.write(name(1), 'queued');
  release(); await move; await write;
  expect(f.files.get(`Backups/${name(1)}`)?.content).toBe('queued'); expect(f.files.has(`Circuit recovery/${name(1)}`)).toBe(false);
});

it.each(['rename', 'settings'])('rolls back a failed %s change without losing backups or changing future writes', async failure => {
  const f = fixture(); await f.store.write(name(), 'zero'); await f.store.write(name(1), 'one');
  if (failure === 'settings') f.persist.mockRejectedValueOnce(new Error('Disk full'));
  else {
    const rename = f.vault.rename.getMockImplementation()!; let calls = 0;
    f.vault.rename.mockImplementation(async (file, path) => { if (++calls === 2) throw new Error('Disk full'); await rename(file, path); });
  }
  await expect(f.store.changeFolder('Backups')).rejects.toThrow('Disk full');
  expect(f.files.get(`Circuit recovery/${name()}`)?.content).toBe('zero'); expect(f.files.get(`Circuit recovery/${name(1)}`)?.content).toBe('one');
  await f.store.write(name(), 'still works'); expect(f.files.get(`Circuit recovery/${name()}`)?.content).toBe('still works');
});

it('rejects an unrelated README or a file in the folder path before moving backups', async () => {
  const f = fixture(); await f.store.write(name(), 'preserve'); f.folders.add('Backups'); f.add('Backups/00_README.md', 'My notes');
  await expect(f.store.changeFolder('Backups')).rejects.toThrow('your own README');
  expect(f.files.get('Backups/00_README.md')?.content).toBe('My notes'); expect(f.persist).not.toHaveBeenCalled(); expect(f.vault.rename).not.toHaveBeenCalled();
  f.add('Occupied', 'not a folder'); expect(f.store.validate('Occupied/Child')).toContain('file already exists');
  await expect(f.store.changeFolder('Occupied/Child')).rejects.toThrow('file already exists');
  expect(f.files.get(`Circuit recovery/${name()}`)?.content).toBe('preserve');
});

it('adds instructions to an existing legacy folder on load without creating an empty folder on a fresh install', async () => {
  const f = fixture(); await f.store.initialize(); expect(f.folders.size).toBe(0);
  f.folders.add('Circuit recovery'); f.add(`Circuit recovery/${name()}`, 'legacy');
  await f.store.initialize(); expect(f.files.has('Circuit recovery/00_README.md')).toBe(true);
  expect(f.files.get(`Circuit recovery/${name()}`)?.content).toBe('legacy');
});

it('keeps using a physically moved folder when saving its new setting fails', async () => {
  const f = fixture(); await f.store.write(name(), 'first'); f.moveFolder('Circuit recovery', 'Moved');
  f.persist.mockRejectedValueOnce(new Error('Settings unavailable'));
  await expect(f.store.folderRenamed('Moved', 'Circuit recovery')).rejects.toThrow('Settings unavailable');
  await f.store.write(name(), 'latest');
  expect(f.folders.has('Circuit recovery')).toBe(false); expect(f.files.get(`Moved/${name()}`)?.content).toBe('latest');
});

it('reports partial rollback locations while retaining every snapshot if an external change blocks rollback', async () => {
  const f = fixture(); await f.store.write(name(), 'zero'); await f.store.write(name(1), 'one');
  const rename = f.vault.rename.getMockImplementation()!; let calls = 0;
  f.vault.rename.mockImplementation(async (file, path) => { if (++calls > 1) throw new Error('External obstruction'); await rename(file, path); });
  await expect(f.store.changeFolder('Backups')).rejects.toThrow('check both folders');
  expect(f.files.get(`Backups/${name()}`)?.content).toBe('zero'); expect(f.files.get(`Circuit recovery/${name(1)}`)?.content).toBe('one');
});

it('preserves an edited README without allowing an instructions failure to block backups', async () => {
  const f = fixture(), warn = vi.fn(), store = new RecoveryStore(f.app, 'Circuit recovery', f.persist, warn);
  f.folders.add('Circuit recovery'); f.add('Circuit recovery/00_README.md', 'My edited README');
  await store.write(name(), 'preserved'); await store.write(name(1), 'also preserved');
  expect(f.files.get(`Circuit recovery/${name()}`)?.content).toBe('preserved');
  expect(f.files.get(`Circuit recovery/${name(1)}`)?.content).toBe('also preserved');
  expect(f.files.get('Circuit recovery/00_README.md')?.content).toBe('My edited README'); expect(warn).toHaveBeenCalledTimes(1);
});

it('keeps a durable backup and its README when optional exclusion integration fails', async () => {
  const f = fixture(), warn = vi.fn(), sync = vi.fn(async () => { throw new Error('Host API unavailable'); });
  const store = new RecoveryStore(f.app, 'Circuit recovery', f.persist, warn, sync);
  await store.write(name(), 'durable');
  expect(f.files.get(`Circuit recovery/${name()}`)?.content).toBe('durable');
  expect(f.files.get('Circuit recovery/00_README.md')?.content).toContain('Exclude recovery backups'); expect(warn).toHaveBeenCalledOnce();
});
