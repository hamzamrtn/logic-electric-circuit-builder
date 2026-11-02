import { mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const folder = await mkdtemp(`${tmpdir()}/lec-clean-install-`);
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `${folder}/${name}`);
const registrations = { commands: [], extensions: [], views: [], fences: [] };
class Plugin {
  app = { vault: { on: () => ({}), getFileByPath: () => null }, workspace: { on: () => ({}) } };
  manifest = JSON.parse('' + '{}');
  async loadData() { return null; }
  async saveData() {}
  registerView(name) { registrations.views.push(name); }
  registerExtensions(ext) { registrations.extensions.push(...ext); }
  registerMarkdownCodeBlockProcessor(name) { registrations.fences.push(name); }
  addCommand(command) { registrations.commands.push(command.id); }
  addRibbonIcon() {}
  registerEvent() {}
  addSettingTab() {}
}
class HostClass {}
const host = { Plugin, FuzzySuggestModal: HostClass, MarkdownView: HostClass, Notice: HostClass, TFile: HostClass, TextFileView: HostClass, MarkdownRenderChild: HostClass, PluginSettingTab: HostClass, Setting: HostClass, normalizePath: value => value };
const module = { exports: {} };
runInNewContext(await readFile(`${folder}/main.js`, 'utf8'), { module, exports: module.exports, require: name => { assert.equal(name, 'obsidian'); return host; }, console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, Blob, performance }, { filename: 'main.js', timeout: 10000 });
const instance = new module.exports.default(); instance.manifest = JSON.parse(await readFile(`${folder}/manifest.json`, 'utf8')); await instance.onload();
assert(registrations.extensions.includes('lecircuit')); assert(registrations.fences.includes('lecircuit')); assert(registrations.commands.includes('new-circuit')); assert(registrations.commands.includes('export-png')); instance.onunload();
console.log(`Three-asset clean package smoke passed with a public-host stub: ${registrations.commands.length} commands, ${registrations.views.length} view. This is not an actual Obsidian qualification.`);
