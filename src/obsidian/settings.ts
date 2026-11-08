import { AbstractInputSuggest, type App, PluginSettingTab, type Setting, type SettingDefinitionItem, type TextComponent, type ButtonComponent } from 'obsidian';
import type CircuitPlugin from '../main';
import { DEFAULT_SHORTCUTS, type ToolShortcuts } from '../editor/input/shortcuts';
import { DEFAULT_RECOVERY_FOLDER, recoveryFolder } from './RecoveryStore';
import { uid } from '../core/model/document';
import type { DockPosition } from '../editor/input/docking';
export interface CircuitSettings { grid: boolean; snap: boolean; exportFolder: string; recoveryFolder: string; excludeRecovery: boolean; managedRecoveryExclusion: string | null; dismissedRecoveryExclusion: string | null; shortcuts: ToolShortcuts; toolbarDock: DockPosition; }
export const DEFAULT_SETTINGS: CircuitSettings = { grid: true, snap: true, exportFolder: '', recoveryFolder: DEFAULT_RECOVERY_FOLDER, excludeRecovery: true, managedRecoveryExclusion: null, dismissedRecoveryExclusion: null, shortcuts: DEFAULT_SHORTCUTS, toolbarDock: 'auto' };
class RecoveryFolderSuggest extends AbstractInputSuggest<string> {
  constructor(app: App, input: HTMLInputElement, private folders: () => string[], private choose: (path: string) => void) { super(app, input); }
  protected getSuggestions(query: string) { const needle = query.trim().toLowerCase(); return this.folders().filter(path => path.toLowerCase().includes(needle)).sort((a, b) => a.localeCompare(b)); }
  renderSuggestion(path: string, el: HTMLElement) { el.textContent = path; }
  selectSuggestion(path: string) { this.choose(path); this.close(); }
}
export class CircuitSettingsTab extends PluginSettingTab {
  private recoveryDraft?: string;
  private applyingRecovery = false;
  private recoveryRefresh?: () => void;
  constructor(app: App, private plugin: CircuitPlugin) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem<keyof CircuitSettings>[] {
    return [
      { name: 'Show grid', desc: 'Default for newly opened circuit views.', control: { type: 'toggle', key: 'grid', defaultValue: true } },
      { name: 'Snap to grid', desc: 'Keep new geometry on the drafting grid.', control: { type: 'toggle', key: 'snap', defaultValue: true } },
      { name: 'Export folder', desc: 'Vault-relative folder for SVG, PNG and JSON exports. Empty uses the circuit’s folder. The folder must already exist.', control: { type: 'text', key: 'exportFolder', placeholder: 'Same folder as circuit', defaultValue: '' } },
      { name: 'Recovery folder', desc: 'Apply a vault folder to move existing backups and save new ones there. For example: 99_Archive/CircuitBackup. Leave empty for Circuit recovery.', aliases: ['Move backups'], render: setting => this.renderRecoveryFolder(setting) },
      { name: 'Exclude recovery backups', desc: 'Exclude the recovery folder from Search and Graph; deprioritize it in Quick Switcher. Applies to everything in that folder. Existing exclusions are preserved. Requires host support; hidden folders need no entry.', control: { type: 'toggle', key: 'excludeRecovery', defaultValue: true } },
      { name: 'Keyboard shortcuts', desc: 'Open a circuit, tap or click the three dots at the top right of its toolbar, then choose Keyboard shortcuts. Tool keys work only while the drawing has focus.' },
      { name: 'How to sync', desc: 'In Obsidian Sync settings, enable “Sync all other types” on each device to sync circuit files.' },
    ];
  }
  private renderRecoveryFolder(setting: Setting) {
    setting.setClass('lec-recovery-setting');
    let input!: TextComponent, button!: ButtonComponent;
    let suggest: RecoveryFolderSuggest | undefined;
    const refresh = () => {
      const value = this.recoveryDraft ?? this.plugin.settings.recoveryFolder;
      const error = this.plugin.recovery.validate(value);
      const changed = this.recoveryDraft !== undefined && !error && recoveryFolder(value) !== this.plugin.settings.recoveryFolder;
      if (this.recoveryDraft === undefined) input.setValue(value);
      input.setDisabled(this.applyingRecovery); input.inputEl.setAttribute('aria-invalid', error ? 'true' : 'false');
      setting.setErrorMessage(error ?? null);
      button.setButtonText(this.applyingRecovery ? 'Applying…' : 'Apply').setDisabled(this.applyingRecovery || !changed);
      if (this.applyingRecovery) suggest?.close();
    };
    setting.addText(text => {
      input = text; text.setPlaceholder(DEFAULT_RECOVERY_FOLDER).setValue(this.recoveryDraft ?? this.plugin.settings.recoveryFolder);
      if (!setting.nameEl.id) setting.nameEl.id = uid('lec-recovery-folder');
      text.inputEl.setAttribute('aria-labelledby', setting.nameEl.id);
      text.onChange(value => { this.recoveryDraft = value; refresh(); });
    }).addButton(control => {
      button = control; control.setButtonText('Apply').setCta().onClick(() => {
        void this.applyRecoveryFolder().catch(error => { setting.setErrorMessage(error instanceof Error ? error.message : String(error)); });
      });
    });
    suggest = new RecoveryFolderSuggest(this.app, input.inputEl, () => this.app.vault.getAllFolders().map(folder => folder.path), path => { input.setValue(path); this.recoveryDraft = path; refresh(); });
    this.recoveryRefresh = refresh; refresh();
    return () => { suggest?.close(); if (this.recoveryRefresh === refresh) this.recoveryRefresh = undefined; };
  }
  getControlValue(key: string): unknown {
    if (key === 'recoveryFolder') return this.recoveryDraft ?? this.plugin.settings.recoveryFolder;
    return this.plugin.settings[key as keyof CircuitSettings];
  }
  async applyRecoveryFolder() {
    if (this.recoveryDraft === undefined || this.applyingRecovery) return;
    this.applyingRecovery = true; this.recoveryRefresh?.();
    try { await this.plugin.recovery.changeFolder(this.recoveryDraft); this.recoveryDraft = undefined; }
    finally { this.applyingRecovery = false; this.recoveryRefresh?.(); }
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'excludeRecovery' && typeof value === 'boolean') { await this.plugin.setRecoveryExcluded(value); return; }
    if (key === 'recoveryFolder' && typeof value === 'string') { this.recoveryDraft = value; this.recoveryRefresh?.(); return; }
    if ((key === 'grid' || key === 'snap') && typeof value === 'boolean') this.plugin.settings[key] = value;
    else if (key === 'exportFolder' && typeof value === 'string') this.plugin.settings.exportFolder = value.trim();
    else return;
    await this.plugin.saveSettings();
  }
}
