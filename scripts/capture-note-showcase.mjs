import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// Capture the installed desktop app, including its Markdown processor and theme.
// All app settings, plugin installation and notes belong to this temporary vault.
const folder = await mkdtemp(`${tmpdir()}/lec-note-capture-`);
const vault = `${folder}/Circuit notebook`;
const profile = `${folder}/profile`;
const plugin = `${vault}/.obsidian/plugins/logic-electric-circuit-builder`;
let child, browser;
const captures = [];
try {
  await mkdir(plugin, { recursive: true });
  await mkdir(profile);
  for (const asset of ['main.js', 'manifest.json', 'styles.css']) await cp(asset, `${plugin}/${asset}`);
  await cp('examples/notes', `${vault}/examples/notes`, { recursive: true });
  await mkdir(`${vault}/.obsidian/snippets`, { recursive: true });
  await cp('examples/notes/study-notes.css', `${vault}/.obsidian/snippets/study-notes.css`);
  await writeFile(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { lecdemo: { path: vault, ts: Date.now(), open: true } } }));
  await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(['logic-electric-circuit-builder']));
  await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ isRestrictedMode: false, readableLineLength: false, propertiesInDocument: 'hidden' }));
  await writeFile(`${vault}/.obsidian/appearance.json`, JSON.stringify({ theme: 'moonstone', enabledCssSnippets: ['study-notes'] }));

  child = spawn(process.env.LEC_OBSIDIAN_BIN || '/opt/Obsidian/obsidian', [
    `--user-data-dir=${profile}`, '--no-sandbox', '--ozone-platform=headless', '--remote-debugging-port=0', '--disable-gpu', '--no-first-run',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Obsidian did not expose its capture endpoint within 30 seconds')), 30000);
    let output = '';
    const inspect = chunk => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); accept(match[1]); }
    };
    child.stdout.on('data', inspect); child.stderr.on('data', inspect);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Obsidian exited before capture (${code})`)); });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().startsWith('app:'));
  if (!page) page = await context.waitForEvent('page', { predicate: p => p.url().startsWith('app:') });
  await page.getByRole('button', { name: 'Trust author and enable plugins', exact: true }).click();
  await page.waitForFunction(() => globalThis.app?.plugins?.plugins?.['logic-electric-circuit-builder']);
  for (const other of context.pages()) if (other !== page) await other.close();
  await page.setViewportSize({ width: 1320, height: 1320 });
  // Electron CDP uses the default scale unless explicitly overridden after sizing.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 1320, deviceScaleFactor: 2, mobile: false });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const hostVersion = await page.evaluate(() => require('@electron/remote').app.getVersion());
  await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });
  for (const [key, theme, note, drawing] of [
    ['note-logic-light', 'light', 'Logic - Ripple-carry addition', 'Ripple-carry adder'],
    ['note-electrical-dark', 'dark', 'Electrical - Filtering a sensor signal', 'Filter and amplifier'],
  ]) {
    const sourceNote = `examples/notes/${note}.md`;
    const fixture = `examples/notes/${drawing}.lecircuit`;
    await page.evaluate(async ({ sourceNote, theme }) => {
      app.changeTheme(theme === 'dark' ? 'obsidian' : 'moonstone');
      const file = app.vault.getFileByPath(sourceNote);
      if (!file) throw new Error(`Missing note: ${sourceNote}`);
      await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'preview' } });
    }, { sourceNote, theme });
    const reading = page.locator('.markdown-reading-view:visible');
    const preview = reading.locator('.lec-preview');
    await preview.locator('svg').waitFor();
    await page.waitForFunction(theme => document.body.classList.contains(`theme-${theme}`), theme);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    // Check the whole note and the actual rendered circuit, not an exported image.
    const visible = await reading.evaluate(element => {
      const content = element.querySelector('.markdown-preview-sizer');
      const svg = element.querySelector('.lec-preview svg');
      const box = svg.getBoundingClientRect();
      const end = content.lastElementChild.getBoundingClientRect();
      return { complete: box.top >= 0 && box.bottom < innerHeight && end.bottom < innerHeight, parts: svg.querySelectorAll('.lec-part').length, width: content.clientWidth, previewWidth: element.querySelector('.lec-preview').getBoundingClientRect().width, bottom: end.bottom };
    });
    const document = JSON.parse(await readFile(fixture, 'utf8'));
    if (!visible.complete || visible.parts !== document.components.length || visible.width !== 920 || Math.abs(visible.previewWidth / visible.width - 0.9) > 0.01) {
      await page.screenshot({ path: `${tmpdir()}/${key}-layout.png` });
      throw new Error(`${key}: note clipped or incomplete circuit: ${JSON.stringify(visible)}`);
    }
    const imagePath = `docs/screenshots/${key}.png`;
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { x: 0, y: 0, width: 1320, height: 1320, scale: 1 } });
    await writeFile(imagePath, Buffer.from(screenshot.data, 'base64'));
    if (errors.length) throw new Error(`${key}: ${errors.join('; ')}`);
    const png = await readFile(imagePath);
    captures.push({ file: `${key}.png`, fixture, sourceNote, style: 'examples/notes/study-notes.css', previewWidth: '90%', theme, viewport: '1320 × 1320', pixels: `${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`, parts: document.components.length, wires: document.wires.length, host: `Obsidian ${hostVersion}`, method: 'Installed desktop app, headless Electron, native Reading view and default theme with the included study-note CSS snippet', pluginVersion: JSON.parse(await readFile(resolve('manifest.json'), 'utf8')).version });
    console.log(`Captured ${key}: ${visible.parts} parts in native Obsidian ${hostVersion}`);
  }
  await writeFile('docs/screenshots/note-captures.json', `${JSON.stringify(captures, null, 2)}\n`);
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    const exited = new Promise(accept => child.once('exit', accept));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(folder, { recursive: true, force: true });
}
