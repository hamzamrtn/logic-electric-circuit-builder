import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

/** Start only an isolated temporary vault/profile; never attach to a user's running app. */
export async function launchTestHost(files = {}) {
  const folder = await mkdtemp(`${tmpdir()}/lec-simulation-host-`), vault = `${folder}/vault`, profile = `${folder}/profile`;
  const plugin = `${vault}/.obsidian/plugins/logic-electric-circuit-builder`;
  await mkdir(plugin, { recursive: true }); await mkdir(profile);
  for (const asset of ['main.js', 'manifest.json', 'styles.css']) await cp(asset, `${plugin}/${asset}`);
  for (const [path, content] of Object.entries(files)) await writeFile(`${vault}/${path}`, content);
  await writeFile(`${profile}/obsidian.json`, JSON.stringify({ updateDisabled: true, vaults: { simulation: { path: vault, ts: Date.now(), open: true } } }));
  await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(['logic-electric-circuit-builder']));
  await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ isRestrictedMode: false }));
  const child = spawn(process.env.LEC_OBSIDIAN_BIN || '/opt/Obsidian/obsidian', [`--user-data-dir=${profile}`, '--no-sandbox', '--ozone-platform=headless', '--remote-debugging-port=0', '--disable-gpu', '--no-first-run'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  const close = async () => { if (browser) await browser.close(); if (!child.killed) child.kill('SIGTERM'); };
  try {
    const endpoint = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('Host startup timed out')), 30000); let output = '';
      const inspect = chunk => { output += chunk.toString(); const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); accept(match[1]); } };
      child.stdout.on('data', inspect); child.stderr.on('data', inspect);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited: ${code}`)); });
    });
    browser = await chromium.connectOverCDP(endpoint); const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().startsWith('app:')) ?? await context.waitForEvent('page', { predicate: p => p.url().startsWith('app:') });
    await page.getByRole('button', { name: 'Trust author and enable plugins', exact: true }).click();
    await page.waitForFunction(() => globalThis.app?.plugins?.plugins?.['logic-electric-circuit-builder']);
    await page.setViewportSize({ width: 1440, height: 900 }); const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });
    return { folder, vault, browser, context, page, cdp, close };
  } catch (error) { await close(); throw error; }
}
