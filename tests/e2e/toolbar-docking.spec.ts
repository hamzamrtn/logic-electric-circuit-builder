import { expect, test } from '@playwright/test';
import { openParts } from './helpers/toolbar';
const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(preview); await expect(page.getByRole('application')).toBeVisible(); });

test('four dock positions adapt the tools, canvas and zoom controls without editing the circuit', async ({ page }) => {
  const snapshot = await page.evaluate(() => window.__lec.session.getSnapshot());
  for (const side of ['left', 'right', 'top', 'bottom']) {
    await page.getByRole('button', { name: 'Move drawing toolbar' }).click();
    await page.getByRole('menuitemradio', { name: `Dock ${side}`, exact: true }).click();
    await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', side);
    const dock = page.locator('.lec-drawing-toolbar'), zoom = page.locator('.lec-zoom-controls');
    await expect(dock).toBeInViewport(); await expect(zoom).toBeInViewport();
    const d = (await dock.boundingBox())!, z = (await zoom.boundingBox())!, canvas = (await page.getByRole('application').boundingBox())!;
    expect(d.x + d.width <= z.x || z.x + z.width <= d.x || d.y + d.height <= z.y || z.y + z.height <= d.y).toBe(true);
    if (side === 'left') expect(d.x + d.width).toBeLessThanOrEqual(canvas.x);
    if (side === 'right') expect(d.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
    for (const name of ['Select', 'Box select', 'Multi', 'Wire', 'Add parts']) {
      const button = page.getByRole('button', { name, exact: true }); await expect(button).toBeInViewport();
      expect(await button.evaluate(el => { const b = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === el; })).toBe(true);
    }
    await openParts(page); await expect(page.getByRole('dialog', { name: 'Parts library' })).toBeInViewport();
    await page.getByRole('button', { name: 'Close parts library' }).click();
    await page.getByRole('button', { name: 'Inspect', exact: true }).click(); await expect(page.locator('.lec-inspector')).toBeVisible();
    expect(await page.getByRole('button', { name: 'Wire', exact: true }).evaluate(el => { const box = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === el; })).toBe(true);
    await page.getByRole('button', { name: 'Wire', exact: true }).click(); await expect(page.locator('.lec-inspector')).not.toBeVisible();
  }
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(snapshot);
});

test('edge dragging docks, center drops cancel, and the handle has a keyboard alternative', async ({ page }) => {
  const handle = page.getByRole('button', { name: 'Move drawing toolbar' });
  const start = (await handle.boundingBox())!; const snapshot = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down(); await page.mouse.move(6, 400, { steps: 6 });
  await expect(page.locator('.lec-dock-target.is-left')).toBeVisible(); await page.mouse.up();
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'left'); await expect(page.getByRole('menu', { name: 'Toolbar position' })).toHaveCount(0);
  const moved = (await handle.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2); await page.mouse.down(); await page.mouse.move(195, 400, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'left'); await expect(page.locator('.lec-dock-target')).toHaveCount(0);
  await handle.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('menu', { name: 'Toolbar position' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(handle).toBeFocused();
  await handle.click(); await page.getByRole('menuitem', { name: 'Reset toolbar position' }).click(); await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'top');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(snapshot);
});

test('a side dock remains usable on short screens and returns to the inline desktop default on reset', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 320 });
  await page.getByRole('button', { name: 'Move drawing toolbar' }).click(); await page.getByRole('menuitemradio', { name: 'Dock right' }).click();
  await page.getByRole('button', { name: 'Add parts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close parts library' })).toBeInViewport(); await expect(page.getByRole('button', { name: 'Custom block', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Close parts library' }).click();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: 'Move drawing toolbar' }).click();
  await page.getByRole('menuitem', { name: 'Reset toolbar position' }).click(); await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'inline');
});

test('native touch drag and cancellation affect only toolbar placement', async ({ page, context, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'Native Chromium touch input.');
  const client = await context.newCDPSession(page), handle = page.getByRole('button', { name: 'Move drawing toolbar' });
  const snapshot = await page.evaluate(() => window.__lec.session.getSnapshot()), start = (await handle.boundingBox())!;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { x: number; y: number; id: number }[]) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await send('touchStart', [{ id: 1, x: start.x + 22, y: start.y + 22 }]); await send('touchMove', [{ id: 1, x: 195, y: 838 }]); await send('touchEnd', []);
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'bottom');
  const top = (await handle.boundingBox())!; await send('touchStart', [{ id: 1, x: top.x + 22, y: top.y + 22 }]); await send('touchMove', [{ id: 1, x: 384, y: 400 }]); await send('touchCancel', []);
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'bottom'); await expect(page.locator('.lec-dock-target')).toHaveCount(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(snapshot); await client.detach();
});

test('Fit clears floating host navigation when the toolbar and zoom card are docked at the top', async ({ page }) => {
  await page.evaluate(() => {
    document.body.classList.add('is-mobile', 'is-phone', 'is-floating-nav'); document.body.style.setProperty('--view-bottom-spacing', '86px');
    const nav = document.createElement('div'); nav.id = 'host-nav'; Object.assign(nav.style, { position: 'fixed', bottom: '34px', height: '52px', width: '300px', left: '45px', zIndex: '1000' }); document.body.append(nav);
  });
  await page.evaluate(() => { const drawing = structuredClone(window.__lec.examples[0].document); drawing.components.forEach((part, index) => { part.position = { x: 0, y: index * 160 }; }); window.__lec.session.replaceRaw(JSON.stringify(drawing)); });
  await page.getByRole('button', { name: 'Move drawing toolbar' }).click(); await page.getByRole('menuitemradio', { name: 'Dock top' }).click();
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  const top = (await page.locator('#host-nav').boundingBox())!.y;
  for (const part of await page.locator('.lec-part').all()) { const bounds = (await part.boundingBox())!; expect(bounds.y + bounds.height).toBeLessThanOrEqual(top + 1); }
});
