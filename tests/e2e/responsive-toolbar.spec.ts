import { expect, test, type Page } from '@playwright/test';
import { openParts, selectionAction } from './helpers/toolbar';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });
async function settle(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function compact(page: Page, width = 390, height = 844) { await page.setViewportSize({ width, height }); await expect(page.locator('.lec-workspace')).toHaveClass(/is-compact/); await settle(page); }

test('phone drawing tools and picker clear floating host navigation without reserving a blank canvas strip', async ({ page }) => {
  await compact(page);
  await page.getByRole('button', { name: 'Move drawing toolbar' }).click();
  await page.getByRole('button', { name: 'Dock bottom' }).click();
  const before = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.evaluate(() => {
    const host = document.createElement('div'); host.className = 'workspace-leaf-content'; host.style.height = '100%';
    const root = document.getElementById('root')!; root.before(host); host.append(root); root.classList.add('view-content', 'lec-host-view');
    document.body.classList.add('is-mobile', 'is-phone', 'is-floating-nav');
    document.body.style.setProperty('--view-bottom-spacing', '86px');
    const navbar = document.createElement('div'); navbar.id = 'host-floating-nav'; navbar.textContent = 'Obsidian navigation';
    Object.assign(navbar.style, { position: 'fixed', height: '52px', bottom: '34px', width: '300px', left: '45px', zIndex: '1000', background: '#555', borderRadius: '28px' });
    document.body.append(navbar);
  });
  await settle(page);
  const nav = (await page.locator('#host-floating-nav').boundingBox())!;
  for (const name of ['Select', 'Box select', 'Multi', 'Wire', 'Add parts']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    expect(await page.getByRole('button', { name, exact: true }).evaluate(el => { const b = el.getBoundingClientRect(); return el.ownerDocument.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === el; })).toBe(true);
  }
  await openParts(page); const panel = (await page.getByRole('dialog', { name: 'Parts library' }).boundingBox())!;
  expect(panel.y + panel.height).toBeLessThanOrEqual(nav.y);
  await page.getByRole('button', { name: 'Close parts library' }).click();
  const visibleDockTop = (await page.locator('.lec-drawing-toolbar').boundingBox())!.y;
  const visibleHeight = (await page.getByRole('application').boundingBox())!.height;
  await page.evaluate(() => { document.body.style.removeProperty('--view-bottom-spacing'); document.body.style.setProperty('--navbar-height', '52px'); document.body.style.setProperty('--navbar-bottom-offset', '34px'); });
  await settle(page); expect((await page.getByRole('application').boundingBox())!.height).toBeCloseTo(visibleHeight, 0);
  await page.evaluate(() => document.body.style.setProperty('--view-bottom-spacing', '-200px'));
  await settle(page); expect((await page.getByRole('application').boundingBox())!.height).toBeCloseTo(visibleHeight, 0);
  expect((await page.locator('.lec-drawing-toolbar').boundingBox())!.y).toBeGreaterThan(visibleDockTop + 80);
  await page.evaluate(() => document.body.style.setProperty('--view-bottom-spacing', '86px'));
  await page.evaluate(() => { document.body.classList.add('is-hidden-nav'); document.getElementById('host-floating-nav')!.style.display = 'none'; });
  await settle(page); expect((await page.getByRole('application').boundingBox())!.height).toBeCloseTo(visibleHeight, 0);
  expect((await page.locator('.lec-drawing-toolbar').boundingBox())!.y).toBeGreaterThan(visibleDockTop + 80);
  // Tablets and ordinary docked navigation already reserve their own space.
  await page.evaluate(() => { document.body.classList.remove('is-hidden-nav', 'is-phone'); document.body.classList.add('is-tablet'); });
  await settle(page); expect((await page.getByRole('application').boundingBox())!.height).toBeCloseTo(visibleHeight, 0);
  expect((await page.locator('.lec-drawing-toolbar').boundingBox())!.y).toBeGreaterThan(visibleDockTop + 80);
  await page.evaluate(() => { document.body.classList.remove('is-tablet', 'is-floating-nav'); document.body.classList.add('is-phone'); });
  await settle(page); expect((await page.getByRole('application').boundingBox())!.height).toBeCloseTo(visibleHeight, 0);
  expect((await page.locator('.lec-drawing-toolbar').boundingBox())!.y).toBeGreaterThan(visibleDockTop + 80);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
});

test('compact controls fit without horizontal scrolling and retain practical touch targets', async ({ page }) => {
  for (const width of [320, 390, 600, 900]) {
    await compact(page, width);
    const viewport = (await page.getByRole('application').boundingBox())!, dock = (await page.locator('.lec-drawing-toolbar').boundingBox())!;
    await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'top');
    expect(dock.y).toBeGreaterThanOrEqual(viewport.y); expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.y + viewport.height);
    for (const name of ['Select', 'Box select', 'Multi', 'Wire', 'Add parts', 'Undo', 'Redo', 'Inspect', 'More actions']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const selector of ['.lec-topbar', '.lec-drawing-toolbar']) expect(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
});

test('wide panes keep one top toolbar and narrow split panes adapt without editing the document', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 }); await expect(page.locator('.lec-workspace')).not.toHaveClass(/is-compact/);
  const before = await page.evaluate(() => window.__lec.session.getSnapshot());
  let tool = (await page.getByRole('button', { name: 'Select', exact: true }).boundingBox())!, canvas = (await page.getByRole('application').boundingBox())!;
  expect(tool.y + tool.height).toBeLessThanOrEqual(canvas.y);
  await page.getByTestId('editor').evaluate(el => { el.style.width = '600px'; });
  await expect(page.locator('.lec-workspace')).toHaveClass(/is-compact/); await settle(page);
  tool = (await page.getByRole('button', { name: 'Select', exact: true }).boundingBox())!; canvas = (await page.getByRole('application').boundingBox())!;
  expect(tool.y).toBeGreaterThanOrEqual(canvas.y);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
  await page.getByTestId('editor').evaluate(el => { el.style.width = '100%'; });
  await expect(page.locator('.lec-workspace')).not.toHaveClass(/is-compact/);
});

test('short-screen picker keeps search, closing and insertion actions reachable', async ({ page }) => {
  await compact(page, 320, 480); await openParts(page);
  const panel = (await page.getByRole('dialog', { name: 'Parts library' }).boundingBox())!, dock = (await page.locator('.lec-drawing-toolbar').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(8); expect(panel.y + panel.height).toBeLessThanOrEqual(480 - 8);
  expect(dock.x).toBeGreaterThanOrEqual(0);
  for (const name of ['Close parts library', 'Text', 'Custom block']) await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeInViewport();
  expect(await page.locator('.lec-picker-content').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('touch opens the picker without focusing the soft-keyboard field and placement remains one explicit edit', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch-enabled device layout.');
  await compact(page); await page.getByRole('button', { name: 'Add parts', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Parts library' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Search parts' })).not.toBeFocused();
  await page.getByRole('textbox', { name: 'Search parts' }).fill('Resistor');
  const before = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Parts library' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
  await page.getByRole('application').tap({ position: { x: 160, y: 180 } });
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.map(c => c.rotation))).toEqual([90]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
});

test('picker state and focus survive resizing and Escape restores its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 }); await openParts(page, 'Logic');
  await page.getByRole('textbox', { name: 'Search parts' }).fill('XOR');
  await page.setViewportSize({ width: 700, height: 800 }); await expect(page.locator('.lec-workspace')).toHaveClass(/is-compact/);
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toHaveValue('XOR');
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Add parts', exact: true })).toBeFocused();
});

test('More exposes selection, grid, snapping and checks with keyboard navigation', async ({ page }) => {
  await compact(page); await page.getByRole('button', { name: 'Add parts' }).click();
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click(); await page.getByRole('application').click({ position: { x: 160, y: 180 } });
  await selectionAction(page, 'Select all'); await expect(page.getByTestId('editor')).toBeFocused();
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemcheckbox', { name: 'Snap to grid' }).click();
  await page.getByRole('button', { name: 'More actions' }).click(); await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('End'); await expect(page.getByRole('menuitem', { name: 'Send feedback', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts…' })).toBeFocused();
  await page.keyboard.press('Home'); await expect(page.getByRole('menuitem', { name: 'Select all', exact: true })).toBeFocused();
  await page.getByRole('menuitem', { name: 'Checks', exact: true }).click(); await expect(page.getByRole('tab', { name: 'Checks', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); await expect(page.locator('.lec-inspector')).not.toBeVisible();
});

test('host diagnostics action stays available after moving the status-bar controls', async ({ page }) => {
  await openParts(page);
  await page.getByTestId('editor').dispatchEvent('lec:show-checks');
  await expect(page.getByRole('dialog', { name: 'Parts library' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Circuit inspector' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Checks', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('search stays in place and usable when the screen height shrinks for a keyboard', async ({ page }) => {
  await compact(page, 390, 844); await openParts(page);
  const input = page.getByRole('textbox', { name: 'Search parts' }), before = (await input.boundingBox())!;
  await input.fill('Resistor'); await expect(page.getByRole('button', { name: 'Resistor Passive', exact: true })).toBeVisible();
  expect((await input.boundingBox())!.y).toBeCloseTo(before.y, 0);
  await page.setViewportSize({ width: 390, height: 320 }); await settle(page);
  await expect(input).toBeFocused(); await expect(input).toHaveValue('Resistor'); await expect(input).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Close parts library' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Custom block', exact: true })).toBeInViewport();
  const dialog = (await page.getByRole('dialog', { name: 'Parts library' }).boundingBox())!;
  expect(dialog.y).toBeGreaterThanOrEqual(0); expect(dialog.y + dialog.height).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Clear part search' }).click();
  await expect(page.getByRole('tab', { name: 'Electrical parts' })).toBeVisible();
});

test('opening an inline inspector adapts the remaining workspace without remounting tools', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 }); await expect(page.locator('.lec-workspace')).not.toHaveClass(/is-compact/);
  const handle = await page.getByRole('button', { name: 'Select', exact: true }).elementHandle();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.locator('.lec-workspace')).toHaveClass(/is-compact/);
  expect(await handle!.evaluate(el => el.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Close inspector' }).click(); await expect(page.locator('.lec-workspace')).not.toHaveClass(/is-compact/);
  expect(await handle!.evaluate(el => el.isConnected)).toBe(true);
});

test('picker traps keyboard focus and preserves all insertion options', async ({ page }) => {
  await compact(page); await openParts(page, 'Connections');
  const dialog = page.getByRole('dialog', { name: 'Parts library' });
  await page.getByRole('button', { name: 'Custom block', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close parts library' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Custom block', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Text', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Text', exact: true })).toBeFocused();
});

test('selecting a part keeps the compact canvas stable and rotation stays accessible', async ({ page }) => {
  await compact(page); await openParts(page); await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 160, y: 180 } });
  await selectionAction(page, 'Deselect all'); await settle(page);
  const before = await page.getByRole('application').boundingBox();
  await page.locator('.lec-part-hit').click(); await settle(page);
  expect(await page.getByRole('application').boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'More actions' }).click(); await page.getByRole('menuitem', { name: 'Rotate selected' }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].rotation)).toBe(90);
});

test('initial circuit fit already uses the settled compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${preview}?example=voltage`); await expect(page.locator('.lec-part')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).not.toHaveText('100%');
  await expect(page.locator('.lec-workspace')).toHaveClass(/is-compact/); await settle(page);
  const camera = page.locator('.lec-canvas > g[transform]'), initial = await camera.getAttribute('transform');
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  await expect(camera).toHaveAttribute('transform', initial!);
});
