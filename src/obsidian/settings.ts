import { type App, PluginSettingTab, Setting } from 'obsidian';
import type CircuitPlugin from '../main';
export interface CircuitSettings { grid: boolean; snap: boolean; exportFolder: string; }
export const DEFAULT_SETTINGS: CircuitSettings = { grid: true, snap: true, exportFolder: '' };
export class CircuitSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: CircuitPlugin) { super(app, plugin); }
  display() {
    this.containerEl.empty(); this.containerEl.createEl('h2', { text: 'Logic-Electric Circuit Builder' });
    new Setting(this.containerEl).setName('Show grid').setDesc('Default for newly opened circuit views.').addToggle(t => t.setValue(this.plugin.settings.grid).onChange(async v => { this.plugin.settings.grid = v; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName('Snap to grid').setDesc('Keep new geometry on the drafting grid.').addToggle(t => t.setValue(this.plugin.settings.snap).onChange(async v => { this.plugin.settings.snap = v; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName('Export folder').setDesc('Vault-relative folder for SVG, PNG and JSON exports. Empty uses the circuit’s folder. The folder must already exist.').addText(t => t.setPlaceholder('Same folder as circuit').setValue(this.plugin.settings.exportFolder).onChange(async v => { this.plugin.settings.exportFolder = v.trim(); await this.plugin.saveSettings(); }));
    this.containerEl.createEl('p', { text: 'Circuits work offline. Simulation is outside the editor’s current scope. Sync custom .lecircuit files using “Sync all other types” on each device.' });
  }
}
