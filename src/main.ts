import { FuzzySuggestModal, MarkdownView, Notice, Plugin, TFile, TFolder, normalizePath, type App } from 'obsidian';
import { CircuitFileView, VIEW_TYPE } from './obsidian/CircuitFileView';
import { VaultSessions, createCircuit, createUnique } from './obsidian/VaultPersistence';
import { processPreview } from './obsidian/PreviewProcessor';
import { CircuitSettingsTab, DEFAULT_SETTINGS, type CircuitSettings } from './obsidian/settings';
import { emptyDocument, serializeDocument, uid } from './core/model/document';
import { exportPNG, exportSVG } from './io/export';
import { type EditorHost } from './editor/ui/Editor';
import { previewBlock, resolvePreviewFile } from './io/preview-reference';
import { examples } from './components/definitions/examples';
import { loadShortcuts, validateShortcuts, type ShortcutPreferences } from './editor/input/shortcuts';
import { DEFAULT_RECOVERY_FOLDER, RecoveryStore, recoveryFolder } from './obsidian/RecoveryStore';
import { RecoveryExclusions } from './obsidian/RecoveryExclusions';
import { loadDockPosition, type DockPreferences } from './editor/input/docking';
class CircuitPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private choose: (file: TFile) => void) { super(app); this.setPlaceholder('Open a circuit…'); }
  getItems() { return this.app.vault.getFiles().filter(f => f.extension === 'lecircuit'); }
  getItemText(file: TFile) { return file.path; }
  onChooseItem(file: TFile) { this.choose(file); }
}
export default class CircuitPlugin extends Plugin {
  sessions!: VaultSessions;
  recovery!: RecoveryStore;
  private recoveryExclusions!: RecoveryExclusions;
  private exclusionWarning = false;
  settings: CircuitSettings = DEFAULT_SETTINGS;
  private settingsWrites: Promise<void> = Promise.resolve();
  private shortcutListeners = new Set<() => void>();
  private dockingListeners = new Set<() => void>();
  readonly dockingPreferences: DockPreferences = {
    getSnapshot: () => this.settings.toolbarDock,
    subscribe: listener => { this.dockingListeners.add(listener); return () => { this.dockingListeners.delete(listener); }; },
    save: async side => { if (loadDockPosition(side) !== side) throw new Error('Choose top, right, bottom, left or reset.'); await this.saveSettings({ toolbarDock: side }); },
  };
  readonly shortcutPreferences: ShortcutPreferences = {
    getSnapshot: () => this.settings.shortcuts,
    subscribe: listener => { this.shortcutListeners.add(listener); return () => { this.shortcutListeners.delete(listener); }; },
    save: async bindings => {
      await this.saveSettings({ shortcuts: validateShortcuts(bindings) });
    },
  };
  async onload() {
    const data = await this.loadData() as Partial<CircuitSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data && typeof data === 'object' ? { grid: typeof data.grid === 'boolean' ? data.grid : true, snap: typeof data.snap === 'boolean' ? data.snap : true, exportFolder: typeof data.exportFolder === 'string' ? data.exportFolder : '', shortcuts: loadShortcuts(data.shortcuts) } : {}) };
    try { this.settings.recoveryFolder = recoveryFolder(typeof data?.recoveryFolder === 'string' ? data.recoveryFolder : DEFAULT_RECOVERY_FOLDER); } catch { this.settings.recoveryFolder = DEFAULT_RECOVERY_FOLDER; }
    this.settings.toolbarDock = loadDockPosition(data?.toolbarDock);
    this.settings.excludeRecovery = typeof data?.excludeRecovery === 'boolean' ? data.excludeRecovery : true;
    this.settings.managedRecoveryExclusion = typeof data?.managedRecoveryExclusion === 'string' && data.managedRecoveryExclusion.length > 1 && data.managedRecoveryExclusion.endsWith('/') ? data.managedRecoveryExclusion : null;
    this.settings.dismissedRecoveryExclusion = typeof data?.dismissedRecoveryExclusion === 'string' ? data.dismissedRecoveryExclusion : null;
    this.recoveryExclusions = new RecoveryExclusions(this.app.vault, () => ({ folder: this.settings.recoveryFolder, enabled: this.settings.excludeRecovery, exists: !!this.app.vault.getFolderByPath(this.settings.recoveryFolder), managed: this.settings.managedRecoveryExclusion, dismissed: this.settings.dismissedRecoveryExclusion }), state => this.saveSettings({ managedRecoveryExclusion: state.managed, dismissedRecoveryExclusion: state.dismissed }));
    this.recovery = new RecoveryStore(this.app, this.settings.recoveryFolder, async folder => { await this.saveSettings({ recoveryFolder: folder }); await this.syncRecoveryExclusions(true); }, message => { new Notice(message); }, () => this.syncRecoveryExclusions());
    this.sessions = new VaultSessions(this.app, this.recovery);
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { if (file instanceof TFolder) void this.recovery.folderRenamed(file.path, oldPath).catch(e => new Notice(`Recovery folder update failed: ${String(e)}`)); }));
    await this.recovery.initialize().catch(e => new Notice(`Recovery instructions unavailable: ${String(e)}`));
    await this.syncRecoveryExclusions();
    this.registerView(VIEW_TYPE, leaf => new CircuitFileView(leaf, this));
    try { this.registerExtensions(['lecircuit'], VIEW_TYPE); } catch (error) { new Notice('Another plugin has registered .lecircuit. Disable the conflicting registration before enabling this editor.'); throw error; }
    this.registerMarkdownCodeBlockProcessor('lecircuit', (s, el, ctx) => processPreview(this, s, el, ctx));
    this.addRibbonIcon('circuit-board', 'New circuit', () => { void this.newCircuit(); });
    this.addCommand({ id: 'new-circuit', name: 'New circuit', callback: () => { void this.newCircuit(); } });
    this.addCommand({ id: 'open-circuit', name: 'Open circuit', callback: () => this.openCircuitPicker() });
    this.addCommand({ id: 'insert-preview', name: 'Insert circuit preview', editorCallback: editor => new CircuitPicker(this.app, file => { editor.replaceSelection(previewBlock(file.path)); }).open() });
    for (const kind of ['svg', 'png'] as const) this.addCommand({ id: `export-${kind}`, name: `Export ${kind.toUpperCase()}`, checkCallback: checking => { const view = this.activeCircuit(); if (!view?.entry || !view.file) return false; if (!checking) void this.editorHost(view.file).export(kind, view.entry.session.getSnapshot().document, view.contentEl.ownerDocument).catch(e => new Notice(String(e))); return true; } });
    this.addCommand({ id: 'fit-circuit', name: 'Fit circuit', checkCallback: checking => { const view = this.activeCircuit(); if (!view) return false; if (!checking) view.contentEl.querySelector<HTMLButtonElement>('button[aria-label="Fit circuit"]')?.click(); return true; } });
    this.addCommand({ id: 'show-diagnostics', name: 'Show diagnostics', checkCallback: checking => { const view = this.activeCircuit(); if (!view) return false; if (!checking) { const editor = view.contentEl.querySelector('.lec-editor'), win = editor?.ownerDocument.defaultView; if (editor && win) editor.dispatchEvent(new win.Event('lec:show-checks')); } return true; } });
    this.registerEvent(this.app.vault.on('modify', file => { if (file instanceof TFile && file.extension === 'lecircuit') void this.sessions.modified(file).catch(e => new Notice(`External circuit change could not be read: ${String(e)}`)); }));
    this.registerEvent(this.app.vault.on('delete', file => { if (file instanceof TFile) this.sessions.deleted(file); }));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => { menu.addItem(item => item.setTitle('New circuit here').setIcon('circuit-board').onClick(() => { const folder = file instanceof TFile ? file.parent?.path ?? '' : file.path; void this.newCircuit(folder); })); }));
    this.registerEvent(this.app.workspace.on('quit', tasks => { tasks.addPromise(this.sessions.flush()); }));
    this.addSettingTab(new CircuitSettingsTab(this.app, this));
  }
  onunload() { void this.sessions.dispose(); }
  async saveSettings(updates: Partial<Pick<CircuitSettings, 'shortcuts' | 'recoveryFolder' | 'excludeRecovery' | 'managedRecoveryExclusion' | 'dismissedRecoveryExclusion' | 'toolbarDock'>> = {}) {
    const write = this.settingsWrites.catch(() => {}).then(async () => {
      await this.saveData({ ...this.settings, ...updates, shortcuts: { ...(updates.shortcuts ?? this.settings.shortcuts) } });
      Object.assign(this.settings, updates);
      if (updates.shortcuts) this.shortcutListeners.forEach(listener => listener());
      if (updates.toolbarDock !== undefined) this.dockingListeners.forEach(listener => listener());
    });
    this.settingsWrites = write; await write;
  }
  private async syncRecoveryExclusions(force = false) {
    try { await this.recoveryExclusions.sync(force); this.exclusionWarning = false; }
    catch (error) { if (!this.exclusionWarning) new Notice(`Recovery backups remain available. ${String(error)}`); this.exclusionWarning = true; }
  }
  async setRecoveryExcluded(enabled: boolean) { await this.saveSettings({ excludeRecovery: enabled }); await this.syncRecoveryExclusions(enabled); }
  resolvePreview(reference: string, notePath: string) {
    return resolvePreviewFile({
      byPath: path => this.app.vault.getFileByPath(path) ?? undefined,
      byName: name => this.app.vault.getFiles().filter(file => file.extension === 'lecircuit' && file.name === name),
    }, reference, notePath);
  }
  private activeCircuit() { const view = this.app.workspace.getActiveViewOfType(CircuitFileView); return view ?? null; }
  async newCircuit(folder = '') { try { const file = await createCircuit(this.app, emptyDocument(), folder); await this.app.workspace.getLeaf('tab').openFile(file); } catch (e) { new Notice(`Unable to create circuit: ${String(e)}`); } }
  openCircuitPicker(choose?: (file: TFile) => void) { new CircuitPicker(this.app, choose ?? (file => { void this.app.workspace.getLeaf('tab').openFile(file); })).open(); }
  async saveRawCopy(_file: TFile | null, raw: string) { const name = `${uid('recovery')}-0.json`; await this.recovery.write(name, raw); new Notice(`Recovery copy saved in ${this.settings.recoveryFolder}`); }
  editorHost(file: TFile): EditorHost {
    return {
      defaultGrid: this.settings.grid, defaultSnap: this.settings.snap, shortcuts: this.shortcutPreferences, docking: this.dockingPreferences, examples,
      newDocument: () => this.newCircuit(file.parent?.path ?? ''), openDocument: () => this.openCircuitPicker(),
      duplicate: async document => { const copy = { ...document, title: `${document.title} copy` }; const next = await createCircuit(this.app, copy, file.parent?.path ?? ''); await this.app.workspace.getLeaf('tab').openFile(next); },
      export: async (kind, document, owner, scale = 2) => {
        const folder = normalizePath(this.settings.exportFolder || file.parent?.path || '');
        if (folder && (!this.app.vault.getAbstractFileByPath(folder) || folder.split('/').includes('..'))) throw new Error('Choose an existing vault export folder in settings');
        const data = kind === 'svg' ? exportSVG(document) : kind === 'png' ? await exportPNG(document, owner, scale) : serializeDocument(document);
        const output = await createUnique(this.app, folder, kind === 'snippet' ? `${document.title} snippet` : document.title, kind === 'json' || kind === 'snippet' ? 'lecircuit' : kind, data);
        if (kind === 'svg' || kind === 'png') { const note = this.app.workspace.getMostRecentLeaf()?.view; if (note instanceof MarkdownView) note.editor.replaceSelection(`![[${output.path}]]`); }
        new Notice(`Saved ${output.path}`);
      },
      insertPreview: () => { new CircuitPicker(this.app, target => { const markdown = this.app.workspace.getLeavesOfType('markdown').map(l => l.view).find(v => v instanceof MarkdownView); if (markdown instanceof MarkdownView) markdown.editor.replaceSelection(previewBlock(target.path)); else new Notice('Open a Markdown note, then insert the preview using the command palette.'); }).open(); },
    };
  }
}
