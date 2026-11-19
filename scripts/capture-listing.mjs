import { _android, chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Listing and README screenshots in actual Obsidian: the installed desktop app
// (isolated temporary vault) and, with LEC_ANDROID_SERIAL, a physical Android
// phone whose Obsidian is open on the dedicated "LEC Simulation Test" vault.
// Usage: node scripts/capture-listing.mjs desktop|android
const mode = process.argv[2];
if (!['desktop', 'android'].includes(mode)) throw new Error('Usage: capture-listing.mjs desktop|android');
const out = 'docs/screenshots';
const TEST_VAULT = 'LEC Simulation Test';
const notes = { logic: 'Digital design - BCD decoder', electrical: 'Analog electronics - Sensor signal chain' };
const circuits = { logic: 'BCD to seven-segment decoder', electrical: 'Sensor signal chain', phoneLogic: '2-bit multiplier', phoneElectrical: 'Sensor chain (compact)' };
// Desktop drawings live with the lab notes; the phone compositions are in examples/showcase.
const source = key => key.startsWith('phone') ? `examples/showcase/${circuits[key]}.lecircuit` : `examples/notes/${circuits[key]}.lecircuit`;
const docs = Object.fromEntries(await Promise.all(Object.keys(circuits).map(async key => [key, JSON.parse(await readFile(source(key), 'utf8'))])));
// Vault layout used in captures: notes in "Lab notes", drawings in "Circuits".
async function vaultFiles() {
  const files = {};
  for (const [key, note] of Object.entries(notes)) files[`Lab notes/${note}.md`] = (await readFile(`examples/notes/${note}.md`, 'utf8')).replace(`/examples/notes/${circuits[key]}.lecircuit`, `/Circuits/${circuits[key]}.lecircuit`);
  for (const key of Object.keys(circuits)) files[`Circuits/${circuits[key]}.lecircuit`] = await readFile(source(key), 'utf8');
  return files;
}
const reference = (key, ref) => docs[key].components.find(c => c.reference === ref).id;
/** A wire attached to a named net's label anchor, for probing by click. */
function netWire(key, name) {
  const doc = docs[key], label = doc.annotations.find(a => a.kind === 'label' && a.text === name);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  return doc.wires.find(w => same(w.a, label.anchor) || same(w.b, label.anchor)).id;
}

async function theme(page, value) {
  await page.evaluate(value => app.changeTheme(value === 'dark' ? 'obsidian' : 'moonstone'), value);
  await page.waitForFunction(value => document.body.classList.contains(`theme-${value}`), value);
}
async function open(page, path, state) {
  await page.evaluate(async ({ path, state }) => {
    const file = app.vault.getFileByPath(path); if (!file) throw new Error(`Missing ${path}`);
    // A fresh tab per scene: no inspector, mode or camera state carries over.
    const old = []; app.workspace.iterateRootLeaves(leaf => old.push(leaf));
    const leaf = app.workspace.getLeaf('tab'); await leaf.openFile(file, { active: true, ...(state ? { state } : {}) });
    for (const l of old) if (l !== leaf) l.detach();
    app.workspace.setActiveLeaf(leaf, { focus: true });
  }, { path, state });
}
const editor = page => page.locator('.workspace-leaf.mod-active [data-testid="editor"]');
async function settle(page, ms = 700) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); }
async function fit(page) { await editor(page).getByRole('button', { name: 'Fit circuit', exact: true }).click(); await settle(page, 900); }
async function center(page, selector) {
  const box = await editor(page).locator(selector).first().boundingBox(); if (!box) throw new Error(`Not visible: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
/** Screen point halfway along a wire's path, so a click lands on the wire itself. */
async function wirePoint(page, id) {
  return page.evaluate(id => {
    const path = [...document.querySelectorAll(`.workspace-leaf.mod-active [data-object="${CSS.escape(id)}"] .lec-wire-hit`)][0];
    const p = path.getPointAtLength(path.getTotalLength() / 2), m = path.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, id);
}
async function simulate(page) {
  const e = editor(page), button = e.getByRole('button', { name: 'Simulate', exact: true });
  if (await button.isVisible()) await button.click();
  else { await e.getByRole('button', { name: 'More actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Simulate circuit', exact: true }).click(); }
  await e.getByRole('toolbar', { name: 'Simulation controls', exact: true }).waitFor();
}

/** Phone framing: centre and zoom the canvas on the given parts (wheel zooms at the pointer; shift+wheel pans). */
async function frame(page, refs, key, fill = 0.92, area) {
  const ids = refs.map(ref => docs[key].components.find(c => c.reference === ref || c.id === ref).id);
  const boxes = await Promise.all(ids.map(id => editor(page).locator(`[data-object="${id}"] .lec-part-hit`).first().boundingBox()));
  const canvas = area ?? await editor(page).locator('.lec-canvas').boundingBox();
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y)), right = Math.max(...boxes.map(b => b.x + b.width)), bottom = Math.max(...boxes.map(b => b.y + b.height));
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx, cy); await page.keyboard.down('Shift');
  await page.mouse.wheel(-(cy - (top + bottom) / 2), -(cx - (left + right) / 2)); await page.keyboard.up('Shift'); await page.waitForTimeout(200);
  const factor = Math.min(canvas.width * fill / (right - left), canvas.height * fill / (bottom - top));
  await page.mouse.wheel(0, -Math.log(factor) / 0.0015); await settle(page, 600);
  // Second pass: re-measure and correct any residual offset.
  const after = await Promise.all(ids.map(id => editor(page).locator(`[data-object="${id}"] .lec-part-hit`).first().boundingBox()));
  const mx = (Math.min(...after.map(b => b.x)) + Math.max(...after.map(b => b.x + b.width))) / 2, my = (Math.min(...after.map(b => b.y)) + Math.max(...after.map(b => b.y + b.height))) / 2;
  await page.keyboard.down('Shift'); await page.mouse.wheel(-(cy - my), -(cx - mx)); await page.keyboard.up('Shift'); await settle(page, 400);
}

const all = key => docs[key].components.map(c => c.id);
/** Canvas area left visible above a bottom sheet (parts library) or the analysis dock. */
async function visibleArea(page, cover) {
  const canvas = await editor(page).locator('.lec-canvas').boundingBox(), sheet = cover ? await cover.boundingBox() : undefined;
  const top = canvas.y + 70, bottom = Math.min(canvas.y + canvas.height, sheet ? sheet.y : Infinity) - 8; // clear the floating drawing dock/zoom card
  return { x: canvas.x, y: top, width: canvas.width, height: bottom - top };
}
const phoneScenes = {
  async build(page, key, select) {
    // Phone build view: the whole circuit framed under the drawing dock, with one part selected.
    await open(page, `Circuits/${circuits[key]}.lecircuit`); await editor(page).waitFor(); await fit(page);
    await frame(page, all(key), key, 0.94, await visibleArea(page));
    const p = await center(page, `[data-object="${reference(key, select)}"] .lec-part-hit`); await page.mouse.click(p.x, p.y); await settle(page, 400);
  },
  async simulate(page, key, shrink = 0) {
    await open(page, `Circuits/${circuits[key]}.lecircuit`); await editor(page).waitFor(); await simulate(page);
    if (shrink) { const handle = editor(page).getByRole('separator', { name: 'Resize analysis panel' }); await handle.focus(); for (let i = 0; i < shrink; i++) await handle.press('ArrowDown'); }
    await fit(page);
    await frame(page, all(key), key, 0.95, await visibleArea(page));
  },
};

const scenes = {
  async phoneLogicBuild(page) { await phoneScenes.build(page, 'phoneLogic', 'U7'); },
  async phoneLogicSim(page) {
    await phoneScenes.simulate(page, 'phoneLogic');
    const panel = editor(page).getByRole('region', { name: 'Analysis', exact: true });
    for (const name of ['A1', 'A0', 'B1']) await panel.getByRole('switch', { name: `${name} input`, exact: true }).click(); // 3 × 2 = 6
    await panel.getByRole('tab', { name: 'Truth table' }).click(); await settle(page, 400);
    await panel.locator('tr.is-current').evaluate(row => row.scrollIntoView({ block: 'center' }));
  },
  async phoneElectricalBuild(page) { await phoneScenes.build(page, 'phoneElectrical', 'U1'); },
  async phoneElectricalSim(page) {
    await phoneScenes.simulate(page, 'phoneElectrical', 2);
    const strip = editor(page).getByRole('toolbar', { name: 'Simulation controls', exact: true }), panel = editor(page).getByRole('region', { name: 'Analysis', exact: true });
    await strip.getByRole('button', { name: 'Probe', exact: true }).click();
    for (const net of ['VIN', 'AMP', 'FILT', 'CMP']) { const p = await wirePoint(page, netWire('phoneElectrical', net)); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); }
    const led = await center(page, `[data-object="${reference('phoneElectrical', 'LED1')}"] .lec-part-hit`); await page.mouse.click(led.x, led.y);
    await strip.getByRole('button', { name: 'Probe', exact: true }).click();
    await panel.locator('.lec-scope-chip').nth(4).waitFor(); await settle(page, 1200);
    const plot = await panel.locator('.lec-scope-plot svg').boundingBox();
    for (const f of [0.52, 0.72]) await page.mouse.click(plot.x + 64 + (plot.width - 80) * f, plot.y + plot.height * 0.3);
    await page.mouse.move(plot.x + plot.width / 2, plot.y - 40); // leave the plot so its hover readout hides
    await panel.locator('.lec-scope-plot').evaluate(element => element.scrollIntoView({ block: 'end' }));
    if (await editor(page).locator('.lec-readout').isVisible()) { const c = await editor(page).locator('.lec-canvas').boundingBox(); await page.mouse.click(c.x + 12, c.y + c.height - 12); }
    await settle(page, 500);
  },
  async note(page, key, phone) {
    await open(page, `Lab notes/${notes[key]}.md`, { mode: 'preview' });
    const preview = page.locator('.workspace-leaf.mod-active .markdown-reading-view .lec-preview svg');
    await preview.waitFor(); await settle(page, 900);
    if (phone) await page.evaluate(() => document.querySelector('.workspace-leaf.mod-active .markdown-preview-view').scrollTo(0, 0));
  },
  async logicBuild(page, _key, phone) {
    await open(page, `Circuits/${circuits.logic}.lecircuit`); await editor(page).waitFor(); await fit(page);
    // Select the five-input OR for segment d and open its properties (phone: frame the OR plane instead).
    const gate = docs.logic.components.find(c => c.definitionId.includes('gate-or-5')).id;
    if (phone) await frame(page, [...docs.logic.components.filter(c => c.definitionId.includes('gate-or')).map(c => c.id), 'HEX'], 'logic', 0.9);
    const p = await center(page, `[data-object="${gate}"] .lec-part-hit`); await page.mouse.click(p.x, p.y);
    if (phone) { await settle(page, 400); return; }
    await editor(page).getByRole('button', { name: 'Inspect', exact: true }).click(); await settle(page);
    await editor(page).locator('.lec-inspector summary', { hasText: 'Pins & connections' }).click(); await settle(page, 400);
    await page.mouse.move(2, 400);
  },
  async logicSim(page, _key, phone) {
    await open(page, `Circuits/${circuits.logic}.lecircuit`); await editor(page).waitFor(); await simulate(page);
    const panel = editor(page).getByRole('region', { name: 'Analysis', exact: true });
    for (const name of ['B', 'D']) await panel.getByRole('switch', { name: `${name} input`, exact: true }).click();
    await panel.getByRole('status', { name: 'HEX output', exact: true }).or(panel.locator('.lec-sim-lamp').first()).first().waitFor().catch(() => {});
    await panel.getByRole('tab', { name: 'Truth table' }).click();
    if (!phone) {
      // A taller dock shows the highlighted 0101 row and most of the table.
      const handle = editor(page).getByRole('separator', { name: 'Resize analysis panel' }); await handle.focus();
      for (let i = 0; i < 3; i++) await handle.press('ArrowUp');
    }
    await fit(page);
    if (phone) await frame(page, [...docs.logic.components.filter(c => c.definitionId.includes('gate-or')).map(c => c.id), 'HEX', 'a', 'g'], 'logic', 0.98);
    if (phone) await panel.locator('tr.is-current').evaluate(row => row.scrollIntoView({ block: 'end' }));
    else await page.mouse.move(2, 400);
  },
  async electricalBuild(page, _key, phone) {
    await open(page, `Circuits/${circuits.electrical}.lecircuit`); await editor(page).waitFor(); await fit(page);
    if (phone) {
      // Phone: the first two stages, readable, with the gain stage selected.
      await frame(page, ['V1', 'RF', 'U1', 'RIN', 'CF', 'U2'], 'electrical');
      const u1 = await center(page, `[data-object="${reference('electrical', 'U1')}"] .lec-part-hit`); await page.mouse.click(u1.x, u1.y); await settle(page, 400); return;
    }
    await editor(page).getByRole('button', { name: 'Add parts', exact: true }).click();
    await page.getByRole('tab', { name: 'Semiconductors' }).click().catch(() => {});
    await settle(page, 500); if (!phone) await page.mouse.move(2, 600);
  },
  async electricalSim(page, _key, phone) {
    await open(page, `Circuits/${circuits.electrical}.lecircuit`); await editor(page).waitFor(); await simulate(page); await fit(page);
    const strip = editor(page).getByRole('toolbar', { name: 'Simulation controls', exact: true }), panel = editor(page).getByRole('region', { name: 'Analysis', exact: true });
    await strip.getByRole('button', { name: 'Probe', exact: true }).click();
    for (const net of ['VIN', 'AMP', 'FILT', 'CMP']) { const p = await wirePoint(page, netWire('electrical', net)); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); }
    const meter = await center(page, `[data-object="${reference('electrical', 'AM1')}"] .lec-part-hit`); await page.mouse.click(meter.x, meter.y);
    await strip.getByRole('button', { name: 'Probe', exact: true }).click();
    await panel.locator('.lec-scope-chip').nth(4).waitFor(); await settle(page, 1200);
    const plot = await panel.locator('.lec-scope-plot svg').boundingBox();
    // Cursors A and B one period apart on rising comparator edges, then a transistor readout.
    for (const f of [0.527, 0.727]) await page.mouse.click(plot.x + 64 + (plot.width - 80) * f, plot.y + plot.height * 0.3);
    if (!phone) { const q = await center(page, `[data-object="${reference('electrical', 'Q1')}"] .lec-part-hit`); await page.mouse.move(q.x, q.y); await editor(page).locator('.lec-readout').waitFor(); }
    else {
      // Phone: frame the threshold and driver stages with their voltage tags; no pinned readout.
      await frame(page, ['R1', 'R2', 'U3', 'RB', 'Q1', 'LED1', 'RL'], 'electrical', 0.9);
      if (await editor(page).locator('.lec-readout').isVisible()) { const c = await editor(page).locator('.lec-canvas').boundingBox(); await page.mouse.click(c.x + 12, c.y + c.height - 12); }
    }
    await settle(page, 500);
  },
};

const plan = mode === 'desktop'
  ? [['desktop-1-note', 'light', 'note', 'logic'], ['desktop-2-logic-build', 'dark', 'logicBuild'], ['desktop-3-logic-simulation', 'light', 'logicSim'], ['desktop-4-electrical-build', 'dark', 'electricalBuild'], ['desktop-5-electrical-simulation', 'light', 'electricalSim'],
     ['note-logic-light', 'light', 'note', 'logic', 'square'], ['note-electrical-dark', 'dark', 'note', 'electrical', 'square']]
  : [['phone-1-note', 'dark', 'note', 'electrical'], ['phone-2-logic-build', 'light', 'phoneLogicBuild'], ['phone-3-logic-simulation', 'dark', 'phoneLogicSim'], ['phone-4-electrical-build', 'light', 'phoneElectricalBuild'], ['phone-5-electrical-simulation', 'dark', 'phoneElectricalSim']];
const captures = [];
await mkdir(out, { recursive: true });

if (mode === 'desktop') {
  const folder = await mkdtemp(`${tmpdir()}/lec-listing-`), vault = `${folder}/Lab notebook`, profile = `${folder}/profile`;
  const plugin = `${vault}/.obsidian/plugins/logic-electric-circuit-builder`;
  let child, browser;
  try {
    await mkdir(plugin, { recursive: true }); await mkdir(profile); await mkdir(`${vault}/.obsidian/snippets`);
    for (const asset of ['main.js', 'manifest.json', 'styles.css']) await cp(asset, `${plugin}/${asset}`);
    for (const [path, content] of Object.entries(await vaultFiles())) { await mkdir(`${vault}/${path.split('/')[0]}`, { recursive: true }); await writeFile(`${vault}/${path}`, content); }
    await cp('examples/notes/study-notes.css', `${vault}/.obsidian/snippets/study-notes.css`);
    await writeFile(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { lecdemo: { path: vault, ts: Date.now(), open: true } } }));
    await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(['logic-electric-circuit-builder']));
    await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ isRestrictedMode: false, readableLineLength: false, propertiesInDocument: 'hidden' }));
    await writeFile(`${vault}/.obsidian/core-plugins.json`, JSON.stringify({ 'file-explorer': true, 'global-search': true, switcher: true, graph: true, backlink: false, 'outgoing-link': false, 'tag-pane': true, 'page-preview': true, 'command-palette': true, 'editor-status': false, 'word-count': false, outline: true, sync: false }));
    await writeFile(`${vault}/.obsidian/appearance.json`, JSON.stringify({ theme: 'moonstone', enabledCssSnippets: ['study-notes'] }));
    child = spawn(process.env.LEC_OBSIDIAN_BIN || '/opt/Obsidian/obsidian', [`--user-data-dir=${profile}`, '--no-sandbox', '--ozone-platform=headless', '--remote-debugging-port=0', '--disable-gpu', '--no-first-run'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const endpoint = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('Obsidian did not start within 30 seconds')), 30000); let log = '';
      const inspect = chunk => { log += chunk.toString(); const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); accept(match[1]); } };
      child.stdout.on('data', inspect); child.stderr.on('data', inspect);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Obsidian exited (${code})`)); });
    });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().startsWith('app:')) ?? await context.waitForEvent('page', { predicate: p => p.url().startsWith('app:') });
    await page.getByRole('button', { name: 'Trust author and enable plugins', exact: true }).click();
    await page.waitForFunction(() => globalThis.app?.plugins?.plugins?.['logic-electric-circuit-builder']);
    for (const other of context.pages()) if (other !== page) await other.close();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page), host = await page.evaluate(() => require('@electron/remote').app.getVersion());
    for (const [file, value, scene, key, shape] of plan) {
      const [width, height] = shape === 'square' ? [1320, 1320] : [1600, 1000];
      await page.setViewportSize({ width, height });
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
      await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });
      await theme(page, value);
      try { await scenes[scene](page, key, false); } catch (error) { await page.screenshot({ path: `${tmpdir()}/lec-listing-failure.png` }); console.log(await page.evaluate(() => document.querySelector('.workspace-leaf.mod-active')?.innerText.slice(0, 600))); throw error; }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      await writeFile(`${out}/${file}.png`, Buffer.from(shot.data, 'base64'));
      if (errors.length) throw new Error(`${file}: ${errors.join('; ')}`);
      captures.push({ file: `${file}.png`, theme: value, scene, source: key ? `examples/notes/${notes[key]}.md` : undefined, viewport: `${width} × ${height}`, pixels: `${width * 2} × ${height * 2}`, host: `Obsidian ${host} desktop (headless Electron, isolated vault)` });
      console.log(`Captured ${file}`);
    }
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) { const exited = new Promise(accept => child.once('exit', accept)); child.kill('SIGTERM'); await exited; }
    await rm(folder, { recursive: true, force: true });
  }
} else {
  const serial = process.env.LEC_ANDROID_SERIAL; if (!serial) throw new Error('Set LEC_ANDROID_SERIAL');
  const adb = process.env.LEC_ADB || 'adb', shell = (...args) => execFileSync(adb, ['-s', serial, 'shell', ...args], { encoding: 'utf8' });
  const device = (await _android.devices({ host: '127.0.0.1', port: Number(process.env.LEC_ADB_PORT || 5037), omitDriverInstall: true })).find(d => d.serial() === serial);
  if (!device) throw new Error('Authorized device is not visible');
  // A clean, fixed status bar (System UI demo mode); the previous setting is restored afterwards.
  const demoAllowed = shell('settings', 'get', 'global', 'sysui_demo_allowed').trim();
  const demo = (command, extras = []) => shell('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', command, ...extras);
  try {
    shell('settings', 'put', 'global', 'sysui_demo_allowed', '1');
    demo('enter'); demo('clock', ['-e', 'hhmm', '0941']); demo('battery', ['-e', 'level', '100', '-e', 'plugged', 'false']);
    demo('network', ['-e', 'wifi', 'show', '-e', 'level', '4', '-e', 'mobile', 'hide']); demo('notifications', ['-e', 'visible', 'false']);
    const page = await (await device.webView({ pkg: 'md.obsidian' }, { timeout: 15000 })).page();
    // Fail on plugin errors; log intermittent Obsidian Android internals separately.
    const errors = [], hostErrors = []; page.on('pageerror', error => (/logic-electric-circuit-builder/.test(error.stack ?? '') ? errors : hostErrors).push(error.message));
    if (await page.evaluate(() => app.vault.getName()) !== TEST_VAULT) throw new Error(`Open the ${TEST_VAULT} vault on the device first`);
    // Only the dedicated test vault is written: candidate assets are verified, then notes/drawings copied.
    const { createHash } = await import('node:crypto');
    for (const name of ['main.js', 'manifest.json', 'styles.css']) {
      const remote = await page.evaluate(name => app.vault.adapter.read(`.obsidian/plugins/logic-electric-circuit-builder/${name}`), name);
      if (createHash('sha256').update(remote).digest('hex') !== createHash('sha256').update(await readFile(name, 'utf8')).digest('hex')) throw new Error(`Installed ${name} differs from the candidate build`);
    }
    await page.evaluate(async ({ files, css, vault }) => {
      if (app.vault.getName() !== vault) throw new Error('Wrong vault');
      for (const folder of ['Lab notes', 'Circuits', '.obsidian/snippets']) if (!(await app.vault.adapter.exists(folder))) await app.vault.adapter.mkdir(folder);
      for (const [path, content] of Object.entries(files)) await app.vault.adapter.write(path, content);
      await app.vault.adapter.write('.obsidian/snippets/study-notes.css', css);
      app.customCss.setCssEnabledStatus('study-notes', true);
      app.vault.setConfig('propertiesInDocument', 'hidden');
      app.workspace.leftSplit.collapse(); app.workspace.rightSplit?.collapse();
    }, { files: await vaultFiles(), css: await readFile('examples/notes/study-notes.css', 'utf8'), vault: TEST_VAULT });
    await page.waitForTimeout(1500);
    const model = device.model();
    for (const [file, value, scene, key] of plan) {
      await theme(page, value); await scenes[scene](page, key, true);
      const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
      await writeFile(`${out}/${file}.png`, png);
      if (errors.length) throw new Error(`${file}: ${errors.join('; ')}`);
      if (hostErrors.length) console.log(`${file}: host error(s) outside the plugin: ${hostErrors.splice(0).join('; ')}`);
      captures.push({ file: `${file}.png`, theme: value, scene, source: key ? `examples/notes/${notes[key]}.md` : undefined, pixels: `${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`, host: `Obsidian ${await page.evaluate(() => navigator.userAgent.match(/obsidian\/([\d.]+)/)?.[1])} on a physical ${model}`, statusBar: 'Android System UI demo mode' });
      console.log(`Captured ${file}`);
    }
  } finally {
    try { demo('exit'); shell('settings', 'put', 'global', 'sysui_demo_allowed', demoAllowed === 'null' ? '0' : demoAllowed); } catch { /* restore best effort */ }
    await device.close();
  }
}
const index = `${out}/listing-captures.json`;
const previous = await readFile(index, 'utf8').then(JSON.parse).catch(() => []);
await writeFile(index, `${JSON.stringify([...previous.filter(c => !captures.some(n => n.file === c.file)), ...captures].sort((a, b) => a.file.localeCompare(b.file)), null, 2)}\n`);
