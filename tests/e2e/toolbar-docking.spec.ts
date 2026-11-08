import { expect, test } from '@playwright/test';
import { openParts } from './helpers/toolbar';
const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(preview); await expect(page.getByRole('application')).toBeVisible(); });

test('four dock positions adapt the tools, canvas and zoom controls without editing the circuit', async ({ page }) => {
  const snapshot = await page.evaluate(() => window.__lec.session.getSnapshot());
  for (const side of ['left', 'right', 'top', 'bottom']) {
    await page.getByRole('button', { name: 'Move drawing toolbar' }).click();
    await page.getByRole('button', { name: `Dock ${side}`, exact: true }).click();
    await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', side);
    const dock = page.locator('.lec-drawing-toolbar'), zoom = page.locator('.lec-zoom-controls');
    await expect(dock).toBeInViewport(); await expect(zoom).toBeInViewport();
    const d = (await dock.boundingBox())!, z = (await zoom.boundingBox())!, canvas = (await page.getByRole('application').boundingBox())!;
    expect(d.x + d.width <= z.x || z.x + z.width <= d.x || d.y + d.height <= z.y || z.y + z.height <= d.y).toBe(true);
    const workspace = (await page.locator('.lec-workspace').boundingBox())!;
    expect(canvas.x).toBeCloseTo(workspace.x, 0); expect(canvas.width).toBeCloseTo(workspace.width, 0);
    if (side === 'left' || side === 'right') expect(d.height).toBeLessThan(canvas.height / 2);
    for (const name of ['Select', 'Box select', 'Multi', 'Wire', 'Add parts']) {
      const button = page.getByRole('button', { name, exact: true }); await expect(button).toBeInViewport();
      expect(await button.evaluate(el => { const b = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === el; })).toBe(true);
    }
    await openParts(page); await expect(page.getByRole('dialog', { name: 'Parts library' })).toBeInViewport();
    await page.getByRole('button', { name: 'Close parts library' }).click();
    await page.getByRole('button', { name: 'Inspect', exact: true }).click(); await expect(page.locator('.lec-inspector')).toBeVisible();
    expect(await page.getByRole('button', { name: 'Wire', exact: true }).evaluate(el => { const box = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === el; })).toBe(true);
    await page.getByRole('button', { name: 'Wire', exact: true }).click(); await expect(page.locator('.lec-inspector')).not.toBeVisible();
    await page.getByRole('application').click({ position: { x: canvas.width / 2, y: canvas.height / 2 } });
    await page.getByRole('application').click({ position: { x: canvas.width / 2 + 60, y: canvas.height / 2 + 64 } });
    const finish = page.getByRole('button', { name: 'Finish', exact: true });
    expect(await finish.evaluate(el => { const box = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === el; })).toBe(true);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(snapshot);
});

test('Move exposes all destinations on click and during drag, without a host-tooltip label', async ({ page }) => {
  const handle = page.getByRole('button', { name: 'Move drawing toolbar' });
  await expect(handle).toHaveAccessibleName('Move drawing toolbar');
  expect(await handle.getAttribute('aria-label')).toBeNull(); expect(await handle.getAttribute('title')).toBeNull();
  await handle.click(); await expect(page.locator('.lec-dock-target')).toHaveCount(4);
  for (const side of ['top', 'right', 'bottom', 'left']) await expect(page.getByRole('button', { name: `Dock ${side}`, exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Dock right', exact: true }).hover(); await expect(page.locator('.lec-dock-target.is-right')).toHaveClass(/is-candidate/);
  await page.keyboard.press('Escape'); await expect(page.locator('.lec-dock-target')).toHaveCount(0);
  const box = (await handle.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await expect(page.locator('.lec-dock-target')).toHaveCount(4);
  await page.mouse.move(195, 400, { steps: 4 }); await expect(page.locator('.lec-dock-target')).toHaveCount(4); await expect(page.locator('.lec-dock-target.is-candidate')).toHaveCount(0);
  await page.mouse.up(); await expect(page.locator('.lec-dock-target')).toHaveCount(0);
  await page.evaluate(() => {
    const button = document.createElement('button'); button.textContent = 'Host action'; button.dataset.clicks = '0';
    Object.assign(button.style, { position: 'fixed', bottom: '2px', right: '2px', zIndex: '1000' });
    button.addEventListener('click', () => { button.dataset.clicks = String(Number(button.dataset.clicks) + 1); }); document.body.append(button);
  });
  await handle.click(); await page.getByRole('button', { name: 'Host action' }).click();
  await expect(page.getByRole('button', { name: 'Host action' })).toHaveAttribute('data-clicks', '1'); await expect(page.locator('.lec-dock-target')).toHaveCount(0);
});

test('desktop docks stay content-sized over the canvas and drag back to the original inline row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'inline');
  const handle = page.getByRole('button', { name: 'Move drawing toolbar' }), origin = (await handle.boundingBox())!, before = await page.evaluate(() => window.__lec.session.getSnapshot());
  await handle.click(); await page.getByRole('button', { name: 'Dock left', exact: true }).click();
  let box = (await page.locator('.lec-drawing-toolbar').boundingBox())!;
  expect(box.width).toBeLessThan(140); expect(box.height).toBeLessThan(310);
  expect((await page.getByRole('application').boundingBox())!.width).toBe(1440);
  const moved = (await handle.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2); await page.mouse.down(); await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'inline');
  await handle.click(); await page.getByRole('button', { name: 'Dock bottom', exact: true }).click();
  box = (await page.locator('.lec-drawing-toolbar').boundingBox())!; expect(box.width).toBeLessThan(650); expect(box.height).toBeLessThan(75);
  await handle.click(); await page.getByRole('button', { name: 'Dock top', exact: true }).click(); await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'inline');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
});

test('edge dragging docks, center drops cancel, and the handle has a keyboard alternative', async ({ page }) => {
  const handle = page.getByRole('button', { name: 'Move drawing toolbar' });
  const start = (await handle.boundingBox())!; const snapshot = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down(); await page.mouse.move(6, 400, { steps: 6 });
  await expect(page.locator('.lec-dock-target.is-left.is-candidate')).toBeVisible(); await page.mouse.up();
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'left'); await expect(page.getByRole('menu', { name: 'Toolbar position' })).toHaveCount(0);
  const moved = (await handle.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2); await page.mouse.down(); await page.mouse.move(195, 400, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'left'); await expect(page.locator('.lec-dock-target')).toHaveCount(0);
  await handle.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('group', { name: 'Toolbar docking positions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dock top', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(handle).toBeFocused();
  await handle.click(); await page.getByRole('button', { name: 'Dock top', exact: true }).click(); await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'top');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(snapshot);
});

test('a side dock remains usable on short screens and returns to the inline desktop row through Top', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 320 });
  await page.getByRole('button', { name: 'Move drawing toolbar' }).click(); await page.getByRole('button', { name: 'Dock right' }).click();
  await page.getByRole('button', { name: 'Add parts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close parts library' })).toBeInViewport(); await expect(page.getByRole('button', { name: 'Custom block', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Close parts library' }).click();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: 'Move drawing toolbar' }).click();
  await page.getByRole('button', { name: 'Dock top', exact: true }).click(); await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'inline');
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
  await page.getByRole('button', { name: 'Move drawing toolbar' }).click(); await page.getByRole('button', { name: 'Dock top' }).click();
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  const top = (await page.locator('#host-nav').boundingBox())!.y;
  for (const part of await page.locator('.lec-part').all()) { const bounds = (await part.boundingBox())!; expect(bounds.y + bounds.height).toBeLessThanOrEqual(top + 1); }
});

test('wire actions clear a bottom dock and floating phone navigation', async ({ page }) => {
  await page.evaluate(() => {
    document.body.classList.add('is-mobile', 'is-phone', 'is-floating-nav'); document.body.style.setProperty('--view-bottom-spacing', '86px');
    const nav = document.createElement('div'); nav.id = 'host-nav'; Object.assign(nav.style, { position: 'fixed', bottom: '34px', height: '52px', width: '300px', left: '45px', zIndex: '1000' }); document.body.append(nav);
  });
  await page.getByRole('button', { name: 'Move drawing toolbar' }).click(); await page.getByRole('button', { name: 'Dock bottom', exact: true }).click();
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 80, y: 200 } }); await page.getByRole('application').click({ position: { x: 280, y: 200 } });
  const navTop = (await page.locator('#host-nav').boundingBox())!.y;
  for (const name of ['Finish', 'Cancel', 'Undo corner']) {
    const button = page.getByRole('button', { name, exact: true }), box = (await button.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(navTop);
    expect(await button.evaluate(el => { const bounds = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest('button') === el; })).toBe(true);
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});
