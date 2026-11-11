import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const output = 'docs/evidence/feedback-scorecard';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, width, height, theme] of [['desktop', 1440, 900, 'light'], ['phone', 390, 844, 'dark']]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: name === 'phone', hasTouch: name === 'phone', reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(resolve('dev/preview.html')).href + `?theme=${theme}`);
    await page.getByTestId('editor').waitFor();
    if (process.env.LEC_HOST_CSS) {
      const css = await readFile(process.env.LEC_HOST_CSS, 'utf8');
      await page.evaluate(css => {
        const style = document.createElement('style'); style.textContent = css; document.head.prepend(style);
      }, css);
    }
    if (name === 'phone') await page.evaluate(() => {
      document.body.classList.add('is-phone', 'is-floating-nav', 'theme-dark');
      document.body.style.setProperty('--view-bottom-spacing', '86px');
      const nav = document.createElement('div'); nav.textContent = 'Host navigation (emulated)';
      Object.assign(nav.style, { position: 'fixed', bottom: '34px', height: '52px', width: '300px', left: '45px', zIndex: '1000', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '16px', display: 'grid', placeItems: 'center', fontSize: '12px' });
      document.body.append(nav);
    });
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Send feedback', exact: true }).click();
    await page.screenshot({ path: `${output}/feedback-${name}.png` });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.keyboard.press('Escape');
    console.log(name, 'feedback opens and closes; desktop toolbar restored');
    await page.close();
  }
} finally { await browser.close(); }
