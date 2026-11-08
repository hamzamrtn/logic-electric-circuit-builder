import { mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const folder = await mkdtemp(`${tmpdir()}/lec-clean-install-`);
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `${folder}/${name}`);
const registrations = { commands: [], extensions: [], views: [], fences: [] };
let settingsTab, savedSettings;
const recoveryFolders = new Set(); let excludedFilters = ['Templates/'];
class Plugin {
  app = { vault: { on: () => ({}), getFileByPath: () => null, getFolderByPath: path => recoveryFolders.has(path) ? { path } : null, getAbstractFileByPath: path => recoveryFolders.has(path) ? { path } : null, getFiles: () => [], createFolder: async path => { recoveryFolders.add(path); }, create: async () => ({}), getConfig: key => { assert.equal(key, 'userIgnoreFilters'); return excludedFilters; }, setConfig: (key, value) => { assert.equal(key, 'userIgnoreFilters'); excludedFilters = Array.from(value ?? []); } }, workspace: { on: () => ({}) } };
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
class HostClass { refreshDomState() {} }
const host = { Plugin, FuzzySuggestModal: HostClass, MarkdownView: HostClass, Notice: HostClass, TFile: HostClass, TFolder: HostClass, TextFileView: HostClass, MarkdownRenderChild: HostClass, PluginSettingTab: HostClass, Setting: HostClass, normalizePath: value => value };
const module = { exports: {} };
runInNewContext(await readFile(`${folder}/main.js`, 'utf8'), { module, exports: module.exports, require: name => { assert.equal(name, 'obsidian'); return host; }, console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, Blob, performance }, { filename: 'main.js', timeout: 10000 });
const instance = new module.exports.default(); instance.manifest = JSON.parse(await readFile(`${folder}/manifest.json`, 'utf8')); await instance.onload();
assert(registrations.extensions.includes('lecircuit')); assert(registrations.fences.includes('lecircuit')); assert(registrations.commands.includes('new-circuit')); assert(registrations.commands.includes('export-png'));
const definitions = settingsTab.getSettingDefinitions();
assert.deepEqual(Array.from(definitions.filter(d => d.control).map(d => d.control.key)), ['grid', 'snap', 'exportFolder', 'recoveryFolder', 'excludeRecovery']);
await settingsTab.setControlValue('grid', false); assert.equal(savedSettings.grid, false);
await settingsTab.setControlValue('exportFolder', ' Exports '); assert.equal(savedSettings.exportFolder, 'Exports');
await settingsTab.setControlValue('recoveryFolder', ' Backups/Circuits '); assert.equal(savedSettings.recoveryFolder, 'Circuit recovery');
await settingsTab.applyRecoveryFolder(); assert.equal(savedSettings.recoveryFolder, 'Backups/Circuits');
assert.deepEqual(excludedFilters, ['Templates/', 'Backups/Circuits/']); assert.equal(savedSettings.managedRecoveryExclusion, 'Backups/Circuits/');
await settingsTab.setControlValue('excludeRecovery', false); assert.deepEqual(excludedFilters, ['Templates/']);
await settingsTab.setControlValue('excludeRecovery', true); assert.deepEqual(excludedFilters, ['Templates/', 'Backups/Circuits/']);
const defaultKeys = { ...instance.shortcutPreferences.getSnapshot() }; let shortcutNotifications = 0;
const unsubscribeShortcuts = instance.shortcutPreferences.subscribe(() => shortcutNotifications++);
await instance.shortcutPreferences.save({ ...defaultKeys, wire: 'l' });
assert.equal(savedSettings.shortcuts.wire, 'l'); assert.equal(instance.shortcutPreferences.getSnapshot().wire, 'l'); assert.equal(shortcutNotifications, 1);
await assert.rejects(instance.shortcutPreferences.save({ ...defaultKeys, wire: 'v' }), /more than once/);
const saveData = instance.saveData; instance.saveData = async () => { throw new Error('Settings write failed'); };
await assert.rejects(instance.shortcutPreferences.save(defaultKeys), /Settings write failed/);
await settingsTab.setControlValue('recoveryFolder', 'Other backups');
await assert.rejects(settingsTab.applyRecoveryFolder(), /Settings write failed/);
assert.equal(instance.settings.recoveryFolder, 'Backups/Circuits');
assert.equal(instance.shortcutPreferences.getSnapshot().wire, 'l'); assert.equal(shortcutNotifications, 1);
instance.saveData = saveData; await instance.shortcutPreferences.save(defaultKeys); assert.equal(savedSettings.shortcuts.wire, 'w');
instance.saveData = async value => { if (value.shortcuts.wire === 'l') throw new Error('Concurrent shortcut save failed'); await saveData.call(instance, value); };
const failedShortcutWrite = instance.shortcutPreferences.save({ ...defaultKeys, wire: 'l' });
const laterGridWrite = settingsTab.setControlValue('grid', true);
await assert.rejects(failedShortcutWrite, /Concurrent shortcut save failed/); await laterGridWrite;
assert.equal(savedSettings.shortcuts.wire, 'w'); assert.equal(savedSettings.grid, true);
instance.saveData = saveData;
unsubscribeShortcuts();
const commandCount = registrations.commands.length, viewCount = registrations.views.length;
const reopened = new module.exports.default(); reopened.loadData = async () => structuredClone(savedSettings);
await reopened.onload(); assert.equal(reopened.settings.recoveryFolder, 'Backups/Circuits'); reopened.onunload();
instance.onunload();
console.log(`Three-asset clean package smoke passed with a public-host stub: ${commandCount} commands, ${viewCount} view. This is not an actual Obsidian qualification.`);
