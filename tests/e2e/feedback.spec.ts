import { expect, test } from '@playwright/test';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(preview);
  await expect(page.getByRole('application')).toBeVisible();
});

test('feedback routes contain keyboard focus, preserve the drawing and restore canvas shortcuts', async ({ page }) => {
  const snapshot = await page.evaluate(() => window.__lec.session.getSnapshot());
  const requests: string[] = []; page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const action = page.getByRole('menuitem', { name: 'Send feedback', exact: true });
  await expect(action.locator('svg')).toBeVisible(); await action.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Help shape the next update', exact: true });
  await expect(dialog).toBeVisible();
  const idea = dialog.getByRole('link', { name: /Suggest an idea/ }), bug = dialog.getByRole('link', { name: /Report a problem/ });
  await expect(idea).toHaveAttribute('href', 'https://github.com/hamzamrtn/logic-electric-circuit-builder/issues/new?template=idea.yml');
  await expect(bug).toHaveAttribute('href', 'https://github.com/hamzamrtn/logic-electric-circuit-builder/issues/new?template=bug-report.yml');
  for (const link of [idea, bug]) { await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener noreferrer'); }
  await expect(idea).toBeFocused();
  await page.keyboard.press('Tab'); await expect(bug).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(idea).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  // Even if focus is moved to the canvas, an open modal blocks editing shortcuts.
  await page.getByTestId('editor').focus(); await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await idea.focus(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('editor')).toBeFocused(); await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(snapshot);
  expect(requests).toEqual([]);
});

test('feedback closes without consuming a wire draft or its undo corners', async ({ page }) => {
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  const canvas = page.getByRole('application');
  await canvas.click({ position: { x: 100, y: 160 } }); await canvas.click({ position: { x: 160, y: 220 } });
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Send feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo corner', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(0);
});

test('feedback opens the chosen template separately and keeps the circuit available', async ({ page, context }) => {
  await context.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Feedback destination</title>' }));
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Send feedback', exact: true }).click();
  for (const [name, template] of [[/Suggest an idea/, 'idea.yml'], [/Report a problem/, 'bug-report.yml']] as const) {
    const opened = page.waitForEvent('popup');
    await page.getByRole('link', { name }).click();
    const destination = await opened;
    await expect(destination).toHaveURL(`https://github.com/hamzamrtn/logic-electric-circuit-builder/issues/new?template=${template}`);
    await destination.close();
    await expect(page.getByRole('dialog', { name: 'Help shape the next update', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('editor')).toBeFocused();
});

test('feedback fits narrow and short panes with floating host navigation and returns to the desktop row', async ({ page }) => {
  await page.evaluate(() => {
    document.body.classList.add('is-phone', 'is-floating-nav'); document.body.style.setProperty('--view-bottom-spacing', '86px');
    const nav = document.createElement('div'); nav.id = 'host-nav';
    Object.assign(nav.style, { position: 'fixed', bottom: '34px', height: '52px', width: '280px', left: '20px', zIndex: '1000' }); document.body.append(nav);
  });
  for (const [width, height] of [[320, 720], [390, 844], [640, 360]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Send feedback', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Help shape the next update', exact: true });
    await expect(dialog).toBeInViewport();
    const box = (await dialog.boundingBox())!, nav = (await page.locator('#host-nav').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    for (const name of [/Suggest an idea/, /Report a problem/]) {
      const link = dialog.getByRole('link', { name }); await link.scrollIntoViewIfNeeded(); await expect(link).toBeInViewport();
      expect(await link.evaluate(element => { const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
    }
    const close = dialog.getByRole('button', { name: 'Close', exact: true }); await close.scrollIntoViewIfNeeded(); await close.click();
    await expect(dialog).toHaveCount(0);
  }
  await page.evaluate(() => { document.body.classList.remove('is-phone', 'is-floating-nav'); document.getElementById('host-nav')?.remove(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.lec-workspace')).toHaveAttribute('data-dock', 'inline');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeInViewport();
});
