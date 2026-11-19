import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { launchTestHost } from './lib/obsidian-test.mjs';

// Update notes in an isolated actual Obsidian desktop profile: who sees them, persistence,
// the opt-out setting and the command. Captures light and dark images of the modal.
const out = process.env.LEC_WHATS_NEW_OUTPUT || 'docs/evidence/whats-new';
const dataPath = '.obsidian/plugins/logic-electric-circuit-builder/data.json';
const legacy = JSON.stringify({ grid: true, snap: true, exportFolder: '', recoveryFolder: 'Circuit recovery' }); // a 0.1.x settings file
const title = 'Powerful, live simulations are finally here';
await mkdir(out, { recursive: true });
const results = [];
async function scenario(name, files, check) {
  const host = await launchTestHost(files);
  try {
    const errors = []; host.page.on('pageerror', error => errors.push(error.message));
    await host.page.waitForTimeout(1500);
    await check(host);
    assert.deepEqual(errors, [], `${name}: page errors`);
    results.push({ name, pass: true });
    console.log(`Pass: ${name}`);
  } finally {
    await host.close();
    // Obsidian may still flush its profile briefly after SIGTERM; cleanup is best-effort.
    await new Promise(resolve => setTimeout(resolve, 1000)); await rm(host.folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
}
const modal = page => page.locator('.modal.lec-whats-new');
const saved = async host => JSON.parse(await readFile(`${host.vault}/${dataPath}`, 'utf8'));

await scenario('update from 0.1.x shows the notes once and records 1.0.0', { [dataPath]: legacy }, async host => {
  const { page, cdp } = host;
  await modal(page).waitFor();
  assert.equal(await modal(page).locator('.lec-wn-title').textContent(), title);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => app.changeTheme(theme === 'dark' ? 'obsidian' : 'moonstone'), theme);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/whats-new-desktop-${theme}.png` });
  }
  await modal(page).getByRole('button', { name: 'Got it' }).click();
  await modal(page).waitFor({ state: 'detached' });
  const data = await saved(host);
  assert.equal(data.lastVersion, '1.0.0'); assert.equal(data.recoveryFolder, 'Circuit recovery');
});
await scenario('next launch after recording 1.0.0 stays quiet', { [dataPath]: JSON.stringify({ ...JSON.parse(legacy), lastVersion: '1.0.0' }) }, async host => {
  assert.equal(await modal(host.page).count(), 0);
});
await scenario('fresh install stays quiet and records the version', {}, async host => {
  assert.equal(await modal(host.page).count(), 0);
  await host.page.waitForTimeout(500); assert.equal((await saved(host)).lastVersion, '1.0.0');
});
// Headless desktop profiles ignore modals opened by scripts after startup (the existing circuit
// picker behaves the same), so the command's window is checked on the Android device instead.
await scenario('turned off in settings stays quiet; the command stays registered', { [dataPath]: JSON.stringify({ ...JSON.parse(legacy), showUpdateNotes: false }) }, async host => {
  const { page } = host;
  assert.equal(await modal(page).count(), 0);
  assert(await page.evaluate(() => !!app.commands.commands['logic-electric-circuit-builder:whats-new']));
  assert.equal((await saved(host)).showUpdateNotes, false);
});
await scenario('settings toggle is defined and persists', { [dataPath]: JSON.stringify({ ...JSON.parse(legacy), lastVersion: '1.0.0' }) }, async host => {
  const { page } = host;
  const result = await page.evaluate(async () => {
    const tab = app.setting.pluginTabs.find(t => t.plugin === app.plugins.plugins['logic-electric-circuit-builder']);
    const defined = tab.getSettingDefinitions().some(d => d.control?.key === 'showUpdateNotes');
    await tab.setControlValue('showUpdateNotes', false);
    return { defined, value: tab.getControlValue('showUpdateNotes') };
  });
  assert.deepEqual(result, { defined: true, value: false });
  await page.waitForTimeout(300); assert.equal((await saved(host)).showUpdateNotes, false);
});
await writeFile(`${out}/host.json`, `${JSON.stringify({ date: new Date().toISOString(), host: 'actual Obsidian desktop (isolated profile)', results }, null, 2)}\n`);
