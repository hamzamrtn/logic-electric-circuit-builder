import { _android, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { simulationSource } from './lib/simulation-source.mjs';
const serial = process.env.LEC_ANDROID_SERIAL; if (!serial) throw Error('Set LEC_ANDROID_SERIAL to the authorized test device');
const folder = await mkdtemp(`${tmpdir()}/lec-android-simulation-`);
await build({ entryPoints: ['tests/fixtures/digital.ts'], outfile: `${folder}/fixtures.mjs`, bundle: true, platform: 'node', format: 'esm' });
await build({ entryPoints: ['tests/fixtures/analog.ts'], outfile: `${folder}/analog.mjs`, bundle: true, platform: 'node', format: 'esm' });
const { digitalFixture } = await import(pathToFileURL(`${folder}/fixtures.mjs`).href);
const { analogFixture } = await import(pathToFileURL(`${folder}/analog.mjs`).href);
const devices = await _android.devices({ host: '127.0.0.1', port: Number(process.env.LEC_ADB_PORT || 5039), omitDriverInstall: true });
const device = devices.find(device => device.serial() === serial); if (!device) throw Error('Authorized device is not visible');
const errors = [], checks = []; let activityToResume;
try {
  const page = await (await device.webView({ pkg: 'md.obsidian' }, { timeout: 15000 })).page(); page.on('pageerror', error => errors.push(error.message));
  const guard = async () => assert(await page.evaluate(() => app.vault.getName() === 'LEC Simulation Test' && !!app.plugins.plugins['logic-electric-circuit-builder']), 'Expected isolated test vault and loaded plugin');
  await guard();
  const remoteAssets = await page.evaluate(async () => Object.fromEntries(await Promise.all(['main.js','manifest.json','styles.css'].map(async name => [name, await app.vault.adapter.read(`.obsidian/plugins/logic-electric-circuit-builder/${name}`)]))));
  for (const [name, contents] of Object.entries(remoteAssets)) assert.equal(createHash('sha256').update(contents).digest('hex'), createHash('sha256').update(await readFile(name)).digest('hex'), `Installed ${name} differs from candidate`);
  const fileName = `Simulation-${Date.now()}.lecircuit`, raw = JSON.stringify(digitalFixture());
  await page.evaluate(async ({ fileName, raw }) => { const vault = app.vault; if (vault.getName() !== 'LEC Simulation Test') throw Error('Wrong vault'); const file = await vault.create(fileName, raw); if (app.vault !== vault) throw Error('Vault changed'); await app.workspace.getLeaf(false).openFile(file); }, { fileName, raw });
  const editor = page.getByTestId('editor'); await editor.waitFor();
  await editor.getByRole('button', { name: 'More actions', exact: true }).click(); await editor.getByRole('menuitem', { name: 'Simulate circuit', exact: true }).click();
  const panel = editor.getByRole('region', { name: 'Analysis', exact: true }), strip = editor.getByRole('toolbar', { name: 'Simulation controls', exact: true });
  const input = name => panel.getByRole('combobox', { name: `${name} value`, exact: true });
  const output = name => panel.getByRole('status', { name: `${name} output`, exact: true });
  for (const a of [0,1]) for (const b of [0,1]) {
    await input('A').selectOption(String(a)); await input('B').selectOption(String(b));
    await expect(output('SUM')).toHaveText(`${(a+b)%2} · ${(a+b)%2 ? 'High' : 'Low'}`); await expect(output('CARRY')).toHaveText(`${Math.floor((a+b)/2)} · ${a&&b ? 'High' : 'Low'}`);
  }
  checks.push('exhaustive-half-adder');
  await input('B').selectOption('0'); await expect(output('SUM')).toHaveText('1 · High'); checks.push('live-input-update');
  await strip.getByRole('button', { name: 'Pause', exact: true }).click(); await expect(output('SUM')).toHaveText('–');
  await strip.getByRole('button', { name: 'Run', exact: true }).click(); await strip.getByRole('button', { name: 'Reset', exact: true }).click(); await expect(input('A')).toHaveValue('0');
  await input('A').selectOption('X'); await expect(output('SUM')).toHaveText('X · Unknown'); checks.push('pause-reset-unknown');
  await input('A').selectOption('1'); await input('B').selectOption('0'); await expect(output('SUM')).toHaveText('1 · High');
  assert.equal(await page.evaluate(fileName => app.vault.read(app.vault.getFileByPath(fileName)), fileName), raw, 'Runtime changed saved circuit'); checks.push('unchanged-file');
  const activity = (await device.shell('dumpsys activity activities')).toString().match(/(?:topResumedActivity|mResumedActivity).*?(md\.obsidian\/[\w.$]+)/)?.[1];
  if (!activity) throw Error('Cannot identify Obsidian activity for background/resume test'); activityToResume = activity;
  await device.shell('input keyevent KEYCODE_HOME');
  await expect.poll(() => page.evaluate(() => [...app.plugins.plugins['logic-electric-circuit-builder'].simulation.entries.values()][0]?.state.status)).toBe('paused');
  await device.shell(`am start -n ${activity}`); await expect(output('SUM')).toHaveText('1 · High'); checks.push('android-home-pause-resume');
  await guard();
  const build = editor.getByRole('button', { name: 'Build', exact: true });
  if (await build.isVisible()) await build.click(); else await editor.getByRole('button', { name: 'Simulate', exact: true }).click();
  await expect(strip).toHaveCount(0);
  assert.equal(await page.evaluate(() => app.plugins.plugins['logic-electric-circuit-builder'].simulation.size), 0); checks.push('last-consumer-release');
  await editor.getByRole('button', { name: 'More actions', exact: true }).click(); await editor.getByRole('menuitem', { name: 'Simulate circuit', exact: true }).click(); await expect(input('A')).toHaveValue('0'); checks.push('reopen-fresh-inputs');
  await input('A').selectOption('1'); await input('B').selectOption('0'); await expect(output('SUM')).toHaveText('1 · High');
  await editor.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  const capture = process.env.LEC_ANDROID_OUTPUT; if (capture) {
    await mkdir(capture, { recursive: true });
    const bounds = await editor.boundingBox(), viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (!bounds) throw Error('Editor is not visible for capture');
    const x = Math.max(0, Math.floor(bounds.x)), y = Math.max(0, Math.floor(bounds.y));
    // Android can round full-height editor bounds past the viewport by a fraction of a CSS pixel.
    await page.screenshot({ path: `${capture}/${device.model().toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-simulation.png`, clip: { x, y, width: Math.min(Math.floor(bounds.width), viewport.width - x), height: Math.min(Math.floor(bounds.height), viewport.height - y) } });
  }
  assert.equal(await page.evaluate(fileName => app.vault.read(app.vault.getFileByPath(fileName)), fileName), raw, 'Lifecycle or camera controls changed the circuit');
  // Electrical analysis on the device: switch tap, scope trace and operating point; the file stays unchanged.
  const electricalName = `Electrical-${Date.now()}.lecircuit`, electricalRaw = JSON.stringify(analogFixture());
  await page.evaluate(async ({ electricalName, electricalRaw }) => { if (app.vault.getName() !== 'LEC Simulation Test') throw Error('Wrong vault'); const file = await app.vault.create(electricalName, electricalRaw); await app.workspace.getLeaf(false).openFile(file); }, { electricalName, electricalRaw });
  const electrical = page.getByTestId('editor').filter({ visible: true }); await electrical.waitFor();
  await electrical.getByRole('button', { name: 'More actions', exact: true }).click(); await electrical.getByRole('menuitem', { name: 'Simulate circuit', exact: true }).click();
  const electricalStrip = electrical.getByRole('toolbar', { name: 'Simulation controls', exact: true }), electricalPanel = electrical.getByRole('region', { name: 'Analysis', exact: true });
  await expect(electricalStrip.locator('.lec-sim-kind')).toHaveText('Electrical'); await electrical.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  await page.waitForTimeout(800); // Fit animates the camera on devices without reduced motion.
  const sw = await electrical.locator('[data-object="sw1"] .lec-part-hit').boundingBox(); await page.mouse.click(sw.x + sw.width / 2, sw.y + sw.height / 2);
  await expect(electricalPanel.locator('.lec-scope-measures').getByRole('row', { name: /V\(VM1\)/ }).getByRole('cell').nth(1)).toHaveText('4.97 V', { timeout: 20000 }); checks.push('electrical-switch-scope');
  if (capture) { const b = await electrical.boundingBox(), vp = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })); await page.screenshot({ path: `${capture}/${device.model().toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-electrical.png`, clip: { x: Math.max(0, Math.floor(b.x)), y: Math.max(0, Math.floor(b.y)), width: Math.min(Math.floor(b.width), vp.width - Math.max(0, Math.floor(b.x))), height: Math.min(Math.floor(b.height), vp.height - Math.max(0, Math.floor(b.y))) } }); }
  await electricalPanel.getByRole('tab', { name: 'Operating point' }).click(); await expect(electricalPanel.getByRole('row', { name: /VM1/ })).toContainText('5.00 V'); checks.push('electrical-operating-point');
  assert.equal(await page.evaluate(name => app.vault.read(app.vault.getFileByPath(name)), electricalName), electricalRaw, 'Electrical simulation changed the circuit'); checks.push('electrical-unchanged-file');
  assert.deepEqual(errors, []);
  const report = { ...await simulationSource(), date: new Date().toISOString(), model: device.model(), androidVersion: (await device.shell('getprop ro.build.version.release')).toString().trim(), userAgent: await page.evaluate(() => navigator.userAgent), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), actualObsidianAndroid: true, vault: 'LEC Simulation Test', checks, pageErrors: errors, inputMethod: 'WebView CDP controls; native Android Home/activity resume', note: 'No Playwright helper APK installed; only this test vault was modified. Physical-finger and iOS qualification are separate.' };
  await writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2)+'\n'); console.log(JSON.stringify({ output: `${folder}/results.json`, ...report }, null, 2));
} finally { if (activityToResume) await device.shell(`am start -n ${activityToResume}`); await device.close(); }
