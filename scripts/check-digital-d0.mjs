import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Source/probe lives outside the production bundle. Every host mutation is in /tmp.
const host = process.argv.includes('--host');
const folder = await mkdtemp(`${tmpdir()}/lec-digital-d0-`);
const bundle = await build({ entryPoints: ['dev/digital-probe.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' });
const probe = bundle.outputFiles[0].text;
let browser, child;
const reports = [], errors = [];
const watch = page => page.on('pageerror', error => errors.push(error.message));
const sourceFiles = ['src/core/topology/digital.ts', 'src/core/session/DigitalRuntime.ts', 'src/components/definitions/digital.ts', 'tests/fixtures/digital.ts', 'tests/unit/digital.test.ts', 'dev/digital-probe.ts', 'scripts/check-digital-d0.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
try {
  let page;
  if (host) {
    const vault = `${folder}/vault`, profile = `${folder}/profile`, plugin = `${vault}/.obsidian/plugins/logic-electric-circuit-builder`;
    await mkdir(plugin, { recursive: true }); await mkdir(profile);
    for (const asset of ['main.js', 'manifest.json', 'styles.css']) await cp(asset, `${plugin}/${asset}`);
    await writeFile(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { digitald0: { path: vault, ts: Date.now(), open: true } } }));
    await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(['logic-electric-circuit-builder']));
    await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ isRestrictedMode: false }));
    child = spawn(process.env.LEC_OBSIDIAN_BIN || '/opt/Obsidian/obsidian', [`--user-data-dir=${profile}`, '--no-sandbox', '--ozone-platform=headless', '--remote-debugging-port=0', '--disable-gpu', '--no-first-run'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const endpoint = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('Host startup timed out')), 30000); let output = '';
      const inspect = chunk => { output += chunk.toString(); const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); accept(match[1]); } };
      child.stdout.on('data', inspect); child.stderr.on('data', inspect);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited: ${code}`)); });
    });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    page = context.pages().find(p => p.url().startsWith('app:')) ?? await context.waitForEvent('page', { predicate: p => p.url().startsWith('app:') });
    watch(page);
    await page.getByRole('button', { name: 'Trust author and enable plugins', exact: true }).click();
    await page.waitForFunction(() => globalThis.app?.plugins?.plugins?.['logic-electric-circuit-builder']);
    await page.setViewportSize({ width: 1440, height: 900 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });
    await page.evaluate(probe);
    const fixture = await page.evaluate(() => __digitalD0.digitalFixture());
    await writeFile(`${vault}/D0.lecircuit`, JSON.stringify(fixture));
    await page.waitForFunction(() => app.vault.getFileByPath('D0.lecircuit'));
    await page.evaluate(async () => { await app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('D0.lecircuit')); });
    await page.getByTestId('editor').waitFor();
    reports.push(await page.evaluate(async () => {
      const plugin = app.plugins.plugins['logic-electric-circuit-builder'], file = app.vault.getFileByPath('D0.lecircuit');
      const entry = plugin.sessions.get(file); if (!entry) throw new Error('Actual host session was not mounted');
      const second = app.workspace.getLeaf('split'); await second.openFile(file);
      const shared = plugin.sessions.get(file); if (shared !== entry || entry.references < 2) throw new Error('Views did not share their document session');
      const result = await __digitalD0.probeDigital(entry.session);
      await entry.save.flush();
      const raw = await app.vault.read(file); if (__digitalD0.serializeDocument(JSON.parse(raw)) !== __digitalD0.serializeDocument(entry.session.getSnapshot().document)) throw new Error('Saved fixture changed unexpectedly');
      second.detach();
      return { environment: 'actual Obsidian desktop, isolated headless profile', hostVersion: require('@electron/remote').app.getVersion(), sharedViews: true, ...result };
    }));
  } else {
    browser = await chromium.launch({ headless: true });
    for (const [environment, viewport, isMobile, hasTouch] of [['desktop browser', { width: 1440, height: 900 }, false, false], ['phone browser emulation', { width: 390, height: 844 }, true, true]]) {
      const context = await browser.newContext({ viewport, isMobile, hasTouch }); page = await context.newPage(); watch(page);
      await page.goto(`file://${resolve('dev/preview.html')}`); await page.getByTestId('editor').waitFor();
      await page.evaluate(probe);
      reports.push({ environment, browserVersion: browser.version(), ...await page.evaluate(() => __digitalD0.probeDigital()) });
      await context.close();
    }
  }
  const evidence = { date: new Date().toISOString(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: totalmem() / 2 ** 30, sourceBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes, pageErrors: errors, productionManifest: JSON.parse(await readFile('manifest.json', 'utf8')), reports, note: 'Desktop hardware only. Browser phone emulation is not actual Android/iOS qualification. Probe injected through DevTools; no production simulation UI.' };
  const output = `${folder}/results.json`; await writeFile(output, JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify({ output, ...evidence }, null, 2));
  assert.deepEqual(errors, [], 'No browser/host page errors');
  for (const report of reports) { assert(report.halfAdderP95Ms < 100, 'Half-adder response budget'); assert(report.chainP95Ms < 100, '128-gate response budget'); assert(report.cancellationMs < 250, 'Cancellation budget'); assert(report.maxHeartbeatGapMs < 100, 'Event-loop responsiveness budget'); }
} finally { if (browser) await browser.close(); if (child && !child.killed) child.kill('SIGTERM'); }
