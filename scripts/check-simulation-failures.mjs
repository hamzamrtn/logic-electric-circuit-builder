import { build } from 'esbuild';
import { expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { launchTestHost } from './lib/obsidian-test.mjs';
import { simulationSource } from './lib/simulation-source.mjs';
const folder = await mkdtemp(`${tmpdir()}/lec-simulation-failures-`);
await build({ entryPoints: ['tests/fixtures/digital.ts'], outfile: `${folder}/fixture.mjs`, bundle: true, platform: 'node', format: 'esm' });
const { digitalFixture, digitalStressFixture } = await import(pathToFileURL(`${folder}/fixture.mjs`).href);
const document = digitalFixture(), original = JSON.stringify(document), host = await launchTestHost({ 'Circuit.lecircuit': original });
const { page } = host, errors = []; page.on('pageerror', error => errors.push(error.message));
const panel = page.getByRole('region', { name: 'Analysis', exact: true }), strip = page.getByRole('toolbar', { name: 'Simulation controls', exact: true });
const run = strip.getByRole('button', { name: 'Run', exact: true }), pause = strip.getByRole('button', { name: 'Pause', exact: true }), status = strip.locator('.lec-simulation-state');
const sum = panel.getByRole('status', { name: 'SUM output', exact: true });
const file = `${host.vault}/Circuit.lecircuit`;
try {
  await page.evaluate(async () => { await app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('Circuit.lecircuit')); });
  await page.getByTestId('editor').waitFor(); await page.getByRole('button', { name: 'Simulate', exact: true }).click(); await expect(strip).toBeVisible();
  await page.evaluate(() => {
    const plugin = app.plugins.plugins['logic-electric-circuit-builder'], entry = plugin.sessions.get(app.vault.getFileByPath('Circuit.lecircuit')), runtime = plugin.simulation.entries.get(entry.session).runtime;
    window.__failureEvents = []; const log = kind => window.__failureEvents.push({ kind, time: performance.now(), save: entry.save.getSnapshot().status, message: entry.save.getSnapshot().message, revision: entry.session.getSnapshot().revision, title: entry.session.getSnapshot().document.title, runtime: runtime.getSnapshot().status });
    entry.save.subscribe(() => log('save')); entry.session.subscribe(() => log('document')); runtime.subscribe(() => log('runtime'));
  });
  await panel.getByRole('combobox', { name: 'A value', exact: true }).selectOption('1'); await panel.getByRole('combobox', { name: 'B value', exact: true }).selectOption('0'); await expect(sum).toHaveText('1 · High');
  assert.equal(await readFile(file, 'utf8'), original);
  document.title = 'External replacement'; await writeFile(file, JSON.stringify(document));
  // A live run follows the external replacement automatically.
  await expect(page.evaluate(() => app.plugins.plugins['logic-electric-circuit-builder'].sessions.get(app.vault.getFileByPath('Circuit.lecircuit')).session.getSnapshot().document.title)).resolves.toBeDefined();
  await expect.poll(() => page.evaluate(() => app.plugins.plugins['logic-electric-circuit-builder'].sessions.get(app.vault.getFileByPath('Circuit.lecircuit')).session.getSnapshot().document.title)).toBe('External replacement');
  await expect(status).toHaveText('Live'); await expect(sum).toHaveText('1 · High');
  const future = JSON.stringify({ ...document, schemaVersion: 999 }); await writeFile(file, future);
  await expect(page.getByRole('alert').filter({ hasText: 'External file cannot be loaded' })).toBeVisible(); await expect(run).toBeDisabled(); await expect(sum).toHaveText('–');
  await expect(panel.getByRole('combobox', { name: 'A value', exact: true })).toBeDisabled(); assert.equal(await readFile(file, 'utf8'), future, 'Simulation overwrote invalid external content');
  await page.getByRole('button', { name: 'Keep local', exact: true }).click(); await page.waitForFunction(() => app.plugins.plugins['logic-electric-circuit-builder'].sessions.get(app.vault.getFileByPath('Circuit.lecircuit')).save.getSnapshot().status === 'saved'); await expect(run).toBeEnabled(); await run.click(); await expect(sum).toHaveText('1 · High');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), document);
  // Stop before replacing the large stress fixture: an OS watcher can observe a partial non-atomic write.
  await pause.click();
  await writeFile(file, JSON.stringify(digitalStressFixture('dense')));
  await page.waitForFunction(() => app.plugins.plugins['logic-electric-circuit-builder'].sessions.get(app.vault.getFileByPath('Circuit.lecircuit')).session.getSnapshot().document.components.length === 252);
  await expect(run).toBeEnabled(); await expect(status).toHaveText('Paused');
  // Pause immediately: a dense run may still be computing or may already have hit its work budget.
  await run.click(); const start = performance.now(); await pause.click(); await expect(status).toHaveText('Paused'); const stopMs = performance.now() - start;
  await writeFile(file, JSON.stringify(document));
  await expect(panel.getByRole('combobox', { name: 'B value', exact: true })).toBeVisible(); await panel.getByRole('combobox', { name: 'B value', exact: true }).selectOption('0'); await run.click(); await expect(sum).toHaveText('1 · High');
  await page.evaluate(async () => { await app.vault.delete(app.vault.getFileByPath('Circuit.lecircuit')); });
  await expect.poll(() => page.evaluate(() => { const plugin = app.plugins.plugins['logic-electric-circuit-builder']; return plugin.simulation.size === 0 || [...plugin.sessions.entries.values()].every(entry => entry.save.getSnapshot().status === 'deleted'); })).toBe(true);
  if (await strip.isVisible()) { await expect(run).toBeDisabled(); await expect(sum).toHaveText('–'); await page.getByRole('button', { name: 'Build', exact: true }).click(); }
  await page.waitForFunction(() => app.plugins.plugins['logic-electric-circuit-builder'].simulation.size === 0);
  await assert.rejects(stat(file), { code: 'ENOENT' }); assert.deepEqual(errors, []);
  const report = { ...await simulationSource(), date: new Date().toISOString(), hostVersion: await page.evaluate(() => require('@electron/remote').app.getVersion()), externalReplacementInvalidates: true, invalidFutureFileBlocksRun: true, invalidContentsPreserved: true, explicitKeepLocalRecovery: true, stopDuringDenseExecution: true, stopInteractionMs: stopMs, restartAfterCancellation: true, deletionStopsWithoutRecreatingFile: true, lastConsumerReleased: true, pageErrors: errors };
  await writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output: `${folder}/results.json`, ...report }, null, 2));
} catch (error) {
  console.error('Failure diagnostics', JSON.stringify(await page.evaluate(() => { const plugin = app.plugins.plugins['logic-electric-circuit-builder'], file = app.vault.getFileByPath('Circuit.lecircuit'), entry = file && plugin.sessions.get(file); return { events: window.__failureEvents, save: entry?.save.getSnapshot(), revision: entry?.session.getSnapshot().revision, title: entry?.session.getSnapshot().document.title, components: entry?.session.getSnapshot().document.components.length, state: [...plugin.simulation.entries.values()].map(entry => entry.state) }; }), null, 2));
  throw error;
} finally { await host.close(); }
