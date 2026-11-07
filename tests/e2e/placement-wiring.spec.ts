import { openParts } from './helpers/toolbar';
import { expect, test, type Page } from '@playwright/test';
import { nativeTouch } from './helpers/touch';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });

async function chooseResistor(page: Page) {
  await openParts(page, 'Electrical');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('Resistor');
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
}
async function camera(page: Page) {
  return page.locator('.lec-canvas > g[transform]').evaluate(element => {
    const match = element.getAttribute('transform')!.match(/translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)/)!;
    return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
  });
}

test('swiping while a part is ready pans; a later tap places exactly one part', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium native touch input.');
  await chooseResistor(page); const before = await camera(page), touch = await nativeTouch(page, context);
  try {
    await touch.send('touchStart', [{ id: 1, x: 80, y: 180 }]);
    await touch.send('touchMove', [{ id: 1, x: 140, y: 220 }]); await touch.send('touchEnd', []);
    expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(0);
    expect(await camera(page)).toEqual({ ...before, x: before.x + 60, y: before.y + 40 });
    await touch.send('touchStart', [{ id: 2, x: 180, y: 240 }]); await touch.send('touchEnd', []);
    expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(0);
  } finally { await touch.close(); }
});

test('swiping in Wire mode never starts a draft or adds a bend', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium native touch input.');
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); const touch = await nativeTouch(page, context);
  try {
    await touch.send('touchStart', [{ id: 1, x: 80, y: 180 }]);
    await touch.send('touchMove', [{ id: 1, x: 140, y: 220 }]); await touch.send('touchEnd', []);
    await expect(page.locator('.lec-gesture-bar')).toHaveCount(0);
    await touch.send('touchStart', [{ id: 2, x: 80, y: 180 }]); await touch.send('touchEnd', []);
    await expect(page.locator('.lec-gesture-bar')).toContainText('0 points placed');
    await touch.send('touchStart', [{ id: 3, x: 100, y: 200 }]);
    await touch.send('touchMove', [{ id: 3, x: 160, y: 240 }]); await touch.send('touchEnd', []);
    await expect(page.locator('.lec-gesture-bar')).toContainText('0 points placed');
    expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(0);
    await touch.send('touchStart', [{ id: 4, x: 240, y: 240 }]); await touch.send('touchEnd', []);
    await expect(page.locator('.lec-gesture-bar')).toContainText('1 point placed');
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1);
  } finally { await touch.close(); }
});

test('middle dragging over a part pans without moving the part', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop middle-button input.');
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 180, y: 240 } });
  const original = await page.evaluate(() => window.__lec.session.getSnapshot().document), before = await camera(page);
  const part = (await page.locator('.lec-part-hit').boundingBox())!;
  await page.mouse.move(part.x + part.width / 2, part.y + part.height / 2); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(part.x + part.width / 2 + 60, part.y + part.height / 2 + 40, { steps: 10 }); await page.mouse.up({ button: 'middle' });
  expect(await camera(page)).toEqual({ ...before, x: before.x + 60, y: before.y + 40 });
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document)).toEqual(original);
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.getByRole('application').click({ button: 'middle', position: { x: 80, y: 180 } });
  await expect(page.locator('.lec-gesture-bar')).toHaveCount(0);
});

test('the vertical-first control changes the committed wire path', async ({ page }) => {
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByText('Annotations & wire options', { exact: true }).click();
  await page.getByRole('button', { name: 'Horizontal first', exact: true }).click();
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 80, y: 180 } });
  await page.getByRole('application').click({ position: { x: 240, y: 280 } });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const wire = await page.evaluate(() => window.__lec.session.getSnapshot().document.wires[0]);
  expect(wire.route.horizontalFirst).toBe(false);
  const d = await page.locator('.lec-wire > path').first().getAttribute('d'), values = d!.match(/[-\d.]+/g)!.map(Number);
  expect(values[0]).toBe(values[2]); expect(values[1]).not.toBe(values[3]);
});

test('a wire behind its source part previews the same clear path that it commits', async ({ page }) => {
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 180, y: 240 } });
  await page.locator('.lec-pin[data-pin="2"]').click();
  await page.getByRole('application').hover({ position: { x: 80, y: 240 } });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const previewPath = await page.locator('.lec-canvas > g > path[stroke-dasharray="6 4"]').getAttribute('d');
  expect(previewPath).toContain(' L ');
  await page.getByRole('application').click({ position: { x: 80, y: 240 } });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.lec-wire > path').first()).toHaveAttribute('d', previewPath!);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1);
});

test('rerouting explains fixed waypoints and retains the manual route', async ({ page }) => {
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  for (const position of [{ x: 80, y: 180 }, { x: 160, y: 180 }, { x: 240, y: 260 }]) await page.getByRole('application').click({ position });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const before = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document));
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Reroute automatically', exact: true }).click();
  await expect(page.locator('.lec-notice')).toContainText('fixed waypoints');
  expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(before);
});
