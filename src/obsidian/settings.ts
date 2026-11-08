import { type App, Notice, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type CircuitPlugin from '../main';
import { DEFAULT_SHORTCUTS, type ToolShortcuts } from '../editor/input/shortcuts';
import { DEFAULT_RECOVERY_FOLDER } from './RecoveryStore';
export interface CircuitSettings { grid: boolean; snap: boolean; exportFolder: string; recoveryFolder: string; excludeRecovery: boolean; managedRecoveryExclusion: string | null; dismissedRecoveryExclusion: string | null; shortcuts: ToolShortcuts; }
export const DEFAULT_SETTINGS: CircuitSettings = { grid: true, snap: true, exportFolder: '', recoveryFolder: DEFAULT_RECOVERY_FOLDER, excludeRecovery: true, managedRecoveryExclusion: null, dismissedRecoveryExclusion: null, shortcuts: DEFAULT_SHORTCUTS };
export class CircuitSettingsTab extends PluginSettingTab {
  private recoveryDraft?: string;
  private applyingRecovery = false;
  constructor(app: App, private plugin: CircuitPlugin) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem<keyof CircuitSettings>[] {
    return [
      { name: 'Show grid', desc: 'Default for newly opened circuit views.', control: { type: 'toggle', key: 'grid', defaultValue: true } },
      { name: 'Snap to grid', desc: 'Keep new geometry on the drafting grid.', control: { type: 'toggle', key: 'snap', defaultValue: true } },
      { name: 'Export folder', desc: 'Vault-relative folder for SVG, PNG and JSON exports. Empty uses the circuit’s folder. The folder must already exist.', control: { type: 'text', key: 'exportFolder', placeholder: 'Same folder as circuit', defaultValue: '' } },
      { name: 'Recovery folder', desc: 'Choose a folder inside this vault, then select Move backups below. Missing folders are created. Empty restores Circuit recovery.', control: { type: 'folder', key: 'recoveryFolder', placeholder: DEFAULT_RECOVERY_FOLDER, defaultValue: DEFAULT_RECOVERY_FOLDER, validate: value => this.plugin.recovery.validate(value), disabled: () => this.applyingRecovery } },
      { name: 'Move backups', desc: 'Apply the recovery folder and move existing plugin backups. Other files stay untouched.', disabled: () => this.applyingRecovery || this.recoveryDraft === undefined, action: () => { void this.applyRecoveryFolder().catch(e => new Notice(`Unable to move recovery backups: ${String(e)}`)); } },
      { name: 'Exclude recovery backups', desc: 'Exclude the recovery folder from Search and Graph; deprioritize it in Quick Switcher. Applies to everything in that folder. Existing exclusions are preserved. Requires host support; hidden folders need no entry.', control: { type: 'toggle', key: 'excludeRecovery', defaultValue: true } },
      { name: 'Keyboard shortcuts', desc: 'Open More → Keyboard shortcuts in a circuit to change tool keys. Keys apply only while the drawing has focus.' },
      { name: 'Offline circuits', desc: 'Circuits work offline. Simulation is outside the editor’s current scope. Sync custom .lecircuit files using “Sync all other types” on each device.' },
    ];
  }
  getControlValue(key: string): unknown {
    if (key === 'recoveryFolder') return this.recoveryDraft ?? this.plugin.settings.recoveryFolder;
    return this.plugin.settings[key as keyof CircuitSettings];
  }
  async applyRecoveryFolder() {
    if (this.recoveryDraft === undefined || this.applyingRecovery) return;
    this.applyingRecovery = true; this.refreshDomState();
    try { await this.plugin.recovery.changeFolder(this.recoveryDraft); this.recoveryDraft = undefined; }
    finally { this.applyingRecovery = false; this.refreshDomState(); }
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'excludeRecovery' && typeof value === 'boolean') { await this.plugin.setRecoveryExcluded(value); return; }
    if (key === 'recoveryFolder' && typeof value === 'string') { this.recoveryDraft = value; this.refreshDomState(); return; }
    if ((key === 'grid' || key === 'snap') && typeof value === 'boolean') this.plugin.settings[key] = value;
    else if (key === 'exportFolder' && typeof value === 'string') this.plugin.settings.exportFolder = value.trim();
    else return;
    await this.plugin.saveSettings();
  }
}
