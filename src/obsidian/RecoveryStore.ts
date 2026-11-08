import { type App, type TFile, normalizePath } from 'obsidian';

export const DEFAULT_RECOVERY_FOLDER = 'Circuit recovery';
const README = '00_README.md';
const MARKER = '<!-- logic-electric-circuit-builder:recovery -->';
const BACKUP = /^recovery-[a-z0-9]+-[a-z0-9]+-[a-z0-9]*-[012](?: \d+)*\.json$/;

export function recoveryFolder(value: string): string {
  const path = value.trim().replace(/\\/g, '/');
  if (!path) return DEFAULT_RECOVERY_FOLDER;
  if (path.startsWith('/') || /[:*?"<>|]/.test(path) || Array.from(path).some(character => character.charCodeAt(0) < 32) || path.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Choose a folder inside the vault, without . or .. path segments.');
  }
  return normalizePath(path).replace(/\/$/, '');
}

/** Serializes backup writes and folder changes so a save cannot land in the old location during a move. */
export class RecoveryStore {
  private queue: Promise<unknown> = Promise.resolve();
  private slots = new Map<string, TFile>();
  private instructionWarning = false;
  private folder: string;
  constructor(private app: App, folder = DEFAULT_RECOVERY_FOLDER, private persist: (folder: string) => Promise<void> = async () => {}, private warn: (message: string) => void = () => {}, private onFolderReady: () => Promise<void> = async () => {}) {
    this.folder = recoveryFolder(folder);
  }
  private run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(action); this.queue = result; return result;
  }
  validate(value: string): string | undefined {
    try {
      const folder = recoveryFolder(value), parts = folder.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const path = parts.slice(0, i).join('/');
        if (this.app.vault.getAbstractFileByPath(path) && !this.app.vault.getFolderByPath(path)) return `A file already exists at ${path}. Choose a folder.`;
      }
    } catch (error) { return error instanceof Error ? error.message : String(error); }
  }
  private async ensureFolder(folder: string) {
    const error = this.validate(folder); if (error) throw new Error(error);
    const parts = folder.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('/');
      if (!this.app.vault.getFolderByPath(path)) {
        try { await this.app.vault.createFolder(path); }
        catch (error) { if (!this.app.vault.getFolderByPath(path)) throw error; }
      }
    }
  }
  private async readme(folder: string) {
    const path = `${folder}/${README}`, existing = this.app.vault.getFileByPath(path);
    const content = `${MARKER}\nThis folder comes from **Logic-Electric Circuit Builder**.\n\n## Change this folder's location only in plugin settings\n\nOpen **Settings → Community plugins → Logic-Electric Circuit Builder → Recovery folder**, choose a location, then select **Move backups**. The optional **Exclude recovery backups** setting manages the plugin’s own entry under **Files and links → Excluded files**, keeping backups out of Search and Graph and deprioritized in Quick Switcher.\n\n## Do not remove\n\nKeep these backups until your circuit contains your latest edits; they can recover work after failed saves or file conflicts. To recover, copy a snapshot to a new \`.lecircuit\` file and open it in Obsidian.\n\nCurrent folder: ${JSON.stringify(folder)}\n`;
    if (existing) {
      const previous = await this.app.vault.read(existing);
      if (!previous.startsWith(MARKER)) throw new Error(`${path} already contains your own README. Choose another recovery folder or rename that file.`);
      if (previous !== content) await this.app.vault.modify(existing, content);
    } else {
      if (this.app.vault.getAbstractFileByPath(path)) throw new Error(`${path} is a folder. Choose another recovery folder.`);
      await this.app.vault.create(path, content);
    }
  }
  private available(folder: string, name: string) {
    const dot = name.lastIndexOf('.'), base = name.slice(0, dot), extension = name.slice(dot);
    let path = `${folder}/${name}`, index = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${base} ${index++}${extension}`;
    return path;
  }
  initialize() {
    return this.run(async () => { if (this.app.vault.getFolderByPath(this.folder)) await this.readme(this.folder); });
  }
  write(name: string, content: string) {
    return this.run(async () => {
      await this.ensureFolder(this.folder);
      const known = this.slots.get(name);
      if (known && known.path.slice(0, known.path.lastIndexOf('/')) === this.folder && this.app.vault.getFileByPath(known.path) === known) await this.app.vault.modify(known, content);
      else this.slots.set(name, await this.app.vault.create(this.available(this.folder, name), content));
      // Optional host integration must not block recovery or prevent instruction updates.
      try { await this.onFolderReady(); } catch (error) { this.warn(`Backup saved, but its exclusion could not be updated: ${String(error)}`); }
      // Instructions must never prevent a recovery snapshot from being saved.
      try { await this.readme(this.folder); this.instructionWarning = false; }
      catch (error) { if (!this.instructionWarning) this.warn(`Backup saved, but recovery instructions could not be updated: ${String(error)}`); this.instructionWarning = true; }
    });
  }
  changeFolder(value: string) {
    const destination = recoveryFolder(value);
    return this.run(async () => {
      const source = this.folder;
      await this.ensureFolder(destination); await this.readme(destination);
      if (source === destination) return;
      const files = this.app.vault.getFiles().filter(file => file.path.slice(0, file.path.lastIndexOf('/')) === source && BACKUP.test(file.name));
      const moved: { file: TFile; path: string }[] = [];
      try {
        for (const file of files) {
          const path = file.path; await this.app.vault.rename(file, this.available(destination, file.name)); moved.push({ file, path });
        }
        await this.persist(destination); this.folder = destination;
      } catch (error) {
        let rollbackFailed = false;
        for (const entry of moved.reverse()) {
          try { await this.app.vault.rename(entry.file, entry.path); } catch { rollbackFailed = true; }
        }
        if (rollbackFailed) throw new Error(`Recovery folder change failed. Backups are preserved across ${source} and ${destination}; check both folders before retrying.`);
        throw error;
      }
      // Keep unrelated files and the old folder. Its README remains useful for anyone finding older copies.
    });
  }
  folderRenamed(path: string, oldPath: string) {
    if (this.folder !== oldPath && !this.folder.startsWith(`${oldPath}/`)) return Promise.resolve();
    // Follow the physical move immediately, including a backup write already awaiting vault I/O.
    this.folder = recoveryFolder(path + this.folder.slice(oldPath.length));
    return this.run(async () => {
      // The physical move has already happened: keep using it even if persisting settings fails.
      await this.persist(this.folder); await this.readme(this.folder);
    });
  }
}
