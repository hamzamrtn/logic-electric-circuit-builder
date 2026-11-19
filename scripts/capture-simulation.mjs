import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const output = process.env.LEC_SIM_OUTPUT || 'docs/evidence/digital-simulation';
const nativeCss = process.env.LEC_SIM_HOST_CSS; if (!nativeCss) throw new Error('Set LEC_SIM_HOST_CSS to the CSS path printed by check-simulation-host.mjs');
await mkdir(output, { recursive: true }); const browser = await chromium.launch(); const reports = [];
try {
  for (const [device, width, height, theme] of [['desktop', 1440, 900, 'light'], ['tablet', 1024, 768, 'dark'], ['phone', 390, 844, 'dark']]) {
    const touch = device !== 'desktop';
    const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(resolve('dev/preview.html')).href + `?theme=${theme}&example=Two-input%20logic`); await page.getByTestId('editor').waitFor();
    await page.evaluate(async ({ url, theme, phone }) => {
      await new Promise((resolve, reject) => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = url; link.onload = resolve; link.onerror = reject; document.head.prepend(link); });
      document.body.classList.add(`theme-${theme}`);
      const host = document.createElement('div'); host.className = 'workspace-leaf-content'; host.style.height = '100%';
      const root = document.getElementById('root'); root.before(host); host.append(root); root.classList.add('view-content', 'lec-host-view');
      if (phone) {
        document.body.classList.add('is-mobile', 'is-phone', 'is-floating-nav'); document.body.style.setProperty('--view-bottom-spacing', '86px');
        const nav = document.createElement('div'); nav.textContent = 'Host navigation (emulated)';
        Object.assign(nav.style, { position: 'fixed', bottom: '34px', height: '52px', width: '300px', left: '45px', zIndex: '1000', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '16px', display: 'grid', placeItems: 'center', fontSize: '12px' }); document.body.append(nav);
      }
    }, { url: pathToFileURL(resolve(nativeCss)).href, theme, phone: device === 'phone' });
    await page.getByRole('button', { name: 'Simulate', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Analysis', exact: true });
    await panel.getByRole('switch', { name: 'IN1 input', exact: true }).click(); await panel.getByRole('switch', { name: 'IN2 input', exact: true }).click();
    await panel.getByRole('status', { name: 'DS1 output', exact: true }).filter({ hasText: '1 · High' }).waitFor();
    await page.getByRole('button', { name: 'Fit circuit', exact: true }).click(); await page.mouse.move(0, 0); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/simulation-${device}-${theme}.png` });
    assert.deepEqual(errors, []); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    reports.push({ device, width, height, theme, nativeHostCss: true, hostNavigation: device === 'phone' ? 'simulated' : 'none', touch, pageErrors: errors }); await page.close();
  }
  await writeFile(`${output}/captures.json`, JSON.stringify({ date: new Date().toISOString(), reports, note: 'Browser emulation with native Obsidian CSS; tablet/phone images are not actual mobile-host captures.' }, null, 2) + '\n');
  console.log(`Captured ${reports.length} simulation views in ${output}`);
} finally { await browser.close(); }
