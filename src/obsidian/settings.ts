import { type App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type CircuitPlugin from '../main';
import { DEFAULT_SHORTCUTS, type ToolShortcuts } from '../editor/input/shortcuts';
export interface CircuitSettings { grid: boolean; snap: boolean; exportFolder: string; shortcuts: ToolShortcuts; }
export const DEFAULT_SETTINGS: CircuitSettings = { grid: true, snap: true, exportFolder: '', shortcuts: DEFAULT_SHORTCUTS };
export class CircuitSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: CircuitPlugin) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem<keyof CircuitSettings>[] {
    return [
      { name: 'Show grid', desc: 'Default for newly opened circuit views.', control: { type: 'toggle', key: 'grid', defaultValue: true } },
      { name: 'Snap to grid', desc: 'Keep new geometry on the drafting grid.', control: { type: 'toggle', key: 'snap', defaultValue: true } },
      { name: 'Export folder', desc: 'Vault-relative folder for SVG, PNG and JSON exports. Empty uses the circuit’s folder. The folder must already exist.', control: { type: 'text', key: 'exportFolder', placeholder: 'Same folder as circuit', defaultValue: '' } },
      { name: 'Keyboard shortcuts', desc: 'Open More → Keyboard shortcuts in a circuit to change tool keys. Keys apply only while the drawing has focus.' },
      { name: 'Offline circuits', desc: 'Circuits work offline. Simulation is outside the editor’s current scope. Sync custom .lecircuit files using “Sync all other types” on each device.' },
    ];
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    if ((key === 'grid' || key === 'snap') && typeof value === 'boolean') this.plugin.settings[key] = value;
    else if (key === 'exportFolder' && typeof value === 'string') this.plugin.settings.exportFolder = value.trim();
    else return;
    await this.plugin.saveSettings();
  }
}
