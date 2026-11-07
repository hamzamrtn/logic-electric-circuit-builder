import { mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const folder = await mkdtemp(`${tmpdir()}/lec-clean-install-`);
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `${folder}/${name}`);
const registrations = { commands: [], extensions: [], views: [], fences: [] };
let settingsTab, savedSettings;
class Plugin {
  app = { vault: { on: () => ({}), getFileByPath: () => null }, workspace: { on: () => ({}) } };
  manifest = JSON.parse('' + '{}');
  async loadData() { return null; }
  async saveData(value) { savedSettings = structuredClone(value); }
  registerView(name) { registrations.views.push(name); }
  registerExtensions(ext) { registrations.extensions.push(...ext); }
  registerMarkdownCodeBlockProcessor(name) { registrations.fences.push(name); }
  addCommand(command) { registrations.commands.push(command.id); }
  addRibbonIcon() {}
  registerEvent() {}
  addSettingTab(tab) { settingsTab = tab; }
}
class HostClass {}
const host = { Plugin, FuzzySuggestModal: HostClass, MarkdownView: HostClass, Notice: HostClass, TFile: HostClass, TextFileView: HostClass, MarkdownRenderChild: HostClass, PluginSettingTab: HostClass, Setting: HostClass, normalizePath: value => value };
const module = { exports: {} };
runInNewContext(await readFile(`${folder}/main.js`, 'utf8'), { module, exports: module.exports, require: name => { assert.equal(name, 'obsidian'); return host; }, console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, Blob, performance }, { filename: 'main.js', timeout: 10000 });
const instance = new module.exports.default(); instance.manifest = JSON.parse(await readFile(`${folder}/manifest.json`, 'utf8')); await instance.onload();
assert(registrations.extensions.includes('lecircuit')); assert(registrations.fences.includes('lecircuit')); assert(registrations.commands.includes('new-circuit')); assert(registrations.commands.includes('export-png'));
const definitions = settingsTab.getSettingDefinitions();
assert.deepEqual(Array.from(definitions.filter(d => d.control).map(d => d.control.key)), ['grid', 'snap', 'exportFolder']);
await settingsTab.setControlValue('grid', false); assert.equal(savedSettings.grid, false);
await settingsTab.setControlValue('exportFolder', ' Exports '); assert.equal(savedSettings.exportFolder, 'Exports');
const defaultKeys = { ...instance.shortcutPreferences.getSnapshot() }; let shortcutNotifications = 0;
const unsubscribeShortcuts = instance.shortcutPreferences.subscribe(() => shortcutNotifications++);
await instance.shortcutPreferences.save({ ...defaultKeys, wire: 'l' });
assert.equal(savedSettings.shortcuts.wire, 'l'); assert.equal(instance.shortcutPreferences.getSnapshot().wire, 'l'); assert.equal(shortcutNotifications, 1);
await assert.rejects(instance.shortcutPreferences.save({ ...defaultKeys, wire: 'v' }), /more than once/);
const saveData = instance.saveData; instance.saveData = async () => { throw new Error('Settings write failed'); };
await assert.rejects(instance.shortcutPreferences.save(defaultKeys), /Settings write failed/);
assert.equal(instance.shortcutPreferences.getSnapshot().wire, 'l'); assert.equal(shortcutNotifications, 1);
instance.saveData = saveData; await instance.shortcutPreferences.save(defaultKeys); assert.equal(savedSettings.shortcuts.wire, 'w');
instance.saveData = async value => { if (value.shortcuts.wire === 'l') throw new Error('Concurrent shortcut save failed'); await saveData.call(instance, value); };
const failedShortcutWrite = instance.shortcutPreferences.save({ ...defaultKeys, wire: 'l' });
const laterGridWrite = settingsTab.setControlValue('grid', true);
await assert.rejects(failedShortcutWrite, /Concurrent shortcut save failed/); await laterGridWrite;
assert.equal(savedSettings.shortcuts.wire, 'w'); assert.equal(savedSettings.grid, true);
instance.saveData = saveData;
unsubscribeShortcuts();
instance.onunload();
console.log(`Three-asset clean package smoke passed with a public-host stub: ${registrations.commands.length} commands, ${registrations.views.length} view. This is not an actual Obsidian qualification.`);
