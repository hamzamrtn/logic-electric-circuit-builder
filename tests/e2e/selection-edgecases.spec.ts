import { selectionAction } from './helpers/toolbar';
import { expect, test, type Page } from '@playwright/test';
import { nativeTouch } from './helpers/touch';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });

async function smallWire(page: Page) {
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 80, y: 180 } });
  await page.getByRole('application').click({ position: { x: 240, y: 180 } });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await selectionAction(page, 'Deselect all');
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  return page.locator('.lec-wire-hit').evaluate(element => {
    const path = element as SVGPathElement, midpoint = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
    const rect = path.closest('svg')!.getBoundingClientRect();
    return { x: midpoint.x - rect.x, y: midpoint.y - rect.y };
  });
}

test('a near miss still selects a thin wire when zoomed out', async ({ page }) => {
  const point = await smallWire(page), before = await page.evaluate(() => window.__lec.session.getSnapshot().revision);
  await page.getByRole('application').click({ position: { x: point.x, y: point.y + 6 } });
  await expect(page.locator('.lec-wire.is-selected')).toHaveCount(1);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(before);
});

test('native touch uses a finger-sized selection target for thin wires', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP supplies native finger input.');
  const point = await smallWire(page), touch = await nativeTouch(page, context);
  try {
    await touch.send('touchStart', [{ id: 1, x: point.x, y: point.y + 18 }]); await touch.send('touchEnd', []);
    await expect(page.locator('.lec-wire.is-selected')).toHaveCount(1);
  } finally { await touch.close(); }
});

test('coincident bus endpoints remain renderable and can be separated again', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => window.__lec.session.edit('Imported coincident bus ends', doc => {
    doc.nodes = [{ id: 'a', position: { x: 0, y: 0 }, explicit: false }, { id: 'b', position: { x: 0, y: 0 }, explicit: false }];
    doc.wires = [{ id: 'bus', a: { kind: 'node', nodeId: 'a' }, b: { kind: 'node', nodeId: 'b' }, width: 8, locked: false, route: { mode: 'manual', geometry: 'orthogonal', horizontalFirst: true, vertices: [] } }];
  }));
  await expect(page.getByTestId('editor')).toBeVisible(); await expect(page.locator('.lec-bus-width')).toHaveText('/8');
  await page.evaluate(() => window.__lec.session.edit('Separate bus ends', doc => { doc.nodes[1].position.x = 80; }));
  await expect(page.locator('.lec-wire > path').first()).toHaveAttribute('d', 'M 0 0 L 80 0');
  expect(errors).toEqual([]);
});

test('a 1000-pixel-wide view initializes its camera at the measured viewport center', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.reload();
  await expect.poll(() => page.locator('.lec-canvas').evaluate(element => {
    const rect = element.getBoundingClientRect(), transform = element.querySelector('g[transform]')!.getAttribute('transform')!;
    const match = transform.match(/translate\(([-\d.e+]+) ([-\d.e+]+)\)/)!;
    return Math.abs(Number(match[1]) - rect.width / 2) + Math.abs(Number(match[2]) - rect.height / 2);
  })).toBeLessThan(.01);
});
