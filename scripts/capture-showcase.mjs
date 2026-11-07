import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const mobile of [false, true]) {
    for (const [index, name] of ['power', 'analog', 'logic', 'bus', 'timer'].entries()) {
      const key = `${mobile ? 'mobile' : 'desktop'}-${name}`;
      const context = await browser.newContext({ viewport: mobile ? { width: 430, height: 932 } : { width: 1600, height: 1050 }, deviceScaleFactor: mobile ? 3 : 2, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const theme = index % 2 === 0 ? 'light' : 'dark';
      await page.goto(`${pathToFileURL(resolve('dev/preview.html')).href}?theme=${theme}`);
      await page.getByTestId('editor').waitFor();
      const document = JSON.parse(await readFile(`examples/showcase/${key}.lecircuit`, 'utf8'));
      await page.evaluate(doc => window.__lec.session.replaceRaw(JSON.stringify(doc)), document);
      await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
      await page.locator('.lec-editor:not([data-camera-animating])').waitFor();
      await page.waitForTimeout(200);
      await page.mouse.move(0, 0);
      const obscured = await page.evaluate(() => {
        const zoom = document.querySelector('.lec-zoom-controls').getBoundingClientRect();
        const canvas = document.querySelector('.lec-canvas').getBoundingClientRect();
        return [...document.querySelectorAll('.lec-part, .lec-annotation')].some(element => {
          const r = element.getBoundingClientRect();
          return r.left < canvas.left || r.right > canvas.right || r.top < canvas.top || r.bottom > zoom.top;
        });
      });
      if (obscured) throw new Error(`${key}: drawing clipped or behind zoom controls`);
      await page.screenshot({ path: `docs/screenshots/${key}.png` });
      if (errors.length) throw new Error(`${key}: ${errors.join('; ')}`);
      captures.push({ file: `${key}.png`, fixture: `examples/showcase/${key}.lecircuit`, theme, viewport: mobile ? '430 × 932' : '1600 × 1050', pixels: mobile ? '1290 × 2796' : '3200 × 2100', parts: document.components.length, wires: document.wires.length });
      await context.close();
      console.log(`Captured ${key}`);
    }
  }
  await writeFile('docs/screenshots/captures.json', `${JSON.stringify(captures, null, 2)}\n`);
} finally { await browser.close(); }
