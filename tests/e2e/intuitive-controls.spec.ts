import { expect, test, type Page } from '@playwright/test';
import { nativeTouch } from './helpers/touch';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });
async function parts(page: Page) {
  await page.evaluate(() => {
    const doc = structuredClone(window.__lec.examples.find(example => example.name === 'Complete symbol catalogue')!.document);
    const first = doc.components.find(c => doc.definitions.find(d => d.id === c.definitionId)?.name === 'Resistor')!;
    first.position = { x: 0, y: 0 }; first.reference = 'R1';
    const second = { ...structuredClone(first), id: `${first.id}-second`, position: { x: 160, y: 120 }, reference: 'R2' };
    doc.components = [first, second]; doc.wires = []; doc.nodes = []; doc.annotations = []; doc.groups = [];
    window.__lec.session.replaceRaw(JSON.stringify(doc));
  });
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
}
async function shortcuts(page: Page) {
  await page.getByRole('button', { name: 'Document menu' }).click();
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts…', exact: true }).click();
}

test('double-click inspects exactly the targeted component with Multi enabled', async ({ page }) => {
  await parts(page); await page.getByRole('button', { name: 'Multi', exact: true }).click();
  await page.locator('.lec-part-hit').first().click();
  const before = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.locator('.lec-part-hit').first().dblclick();
  await expect(page.locator('.lec-inspector')).toBeVisible();
  await expect(page.getByLabel('Reference', { exact: true })).toHaveValue('R1');
  await expect(page.locator('.lec-part.is-selected')).toHaveCount(1);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
});

test('right-clicking blank canvas leaves selection, tools and inspector unchanged', async ({ page }) => {
  await parts(page); await page.locator('.lec-part-hit').first().click();
  const before = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.getByRole('application').click({ button: 'right', position: { x: 12, y: 100 } });
  await expect(page.locator('.lec-inspector')).not.toBeVisible();
  await expect(page.locator('.lec-part.is-selected')).toHaveCount(1);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
});

test('right-click inspects a component without toggling off Multi selection', async ({ page }) => {
  await parts(page); await page.getByRole('button', { name: 'Multi', exact: true }).click();
  await page.locator('.lec-part-hit').last().click(); await page.locator('.lec-part-hit').last().click({ button: 'right' });
  await expect(page.getByLabel('Reference', { exact: true })).toHaveValue('R2');
});

test('toolbar and picker retain accessible names without redundant host or native hover labels', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: 'Circuit tools' })).not.toHaveAttribute('aria-label');
  await expect(page.getByRole('group', { name: 'Editing tools' })).not.toHaveAttribute('aria-label');
  await expect(page.getByRole('group', { name: 'Parts and selection' })).not.toHaveAttribute('aria-label');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('aria-label', 'Undo');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).not.toHaveAttribute('title');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).not.toHaveAttribute('aria-label');
  await page.getByRole('button', { name: 'Connections parts' }).click();
  await expect(page.getByRole('dialog', { name: 'Parts library' })).not.toHaveAttribute('aria-label');
  await expect(page.getByRole('tablist', { name: 'Connections categories' })).not.toHaveAttribute('aria-label');
  await expect(page.getByRole('textbox', { name: 'Search parts' })).not.toHaveAttribute('aria-label');
  await expect(page.getByRole('button', { name: 'Test point Connectivity' })).not.toHaveAttribute('aria-label');
  const names = page.locator('.lec-topbar [hidden], .lec-part-popover [hidden]');
  for (const name of await names.all()) await expect(name).not.toBeVisible();
});

test('custom tool keys apply only to the focused drawing and can be reset', async ({ page }) => {
  await shortcuts(page);
  await page.getByRole('textbox', { name: 'Wire', exact: true }).click();
  await page.getByRole('textbox', { name: 'Wire', exact: true }).evaluate((input: HTMLInputElement) => input.setSelectionRange(1, 1));
  await page.keyboard.press('l');
  await expect(page.getByRole('textbox', { name: 'Wire', exact: true })).toHaveValue('L');
  await page.getByRole('textbox', { name: 'Select', exact: true }).click(); await page.keyboard.press('s');
  await expect(page.getByRole('textbox', { name: 'Select', exact: true })).toHaveValue('S');
  await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toBeFocused(); await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('l'); await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s'); await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Electrical parts' }).click();
  await page.getByRole('textbox', { name: 'Search parts' }).fill('w');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close parts library' }).click();
  await page.getByRole('button', { name: 'Wire', exact: true }).focus(); await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shortcuts(page); await page.getByRole('button', { name: 'Reset defaults', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Wire', exact: true })).toHaveValue('W');
  await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
  await page.getByTestId('editor').focus(); await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('duplicate shortcut keys are rejected without changing the active mapping', async ({ page }) => {
  await shortcuts(page); await page.getByRole('textbox', { name: 'Select', exact: true }).fill('W');
  await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('assigned more than once');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-keyshortcuts', 'V');
});

test('native double-tap inspects a part without creating an edit', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch comes from Chromium CDP.');
  await parts(page); const part = (await page.locator('.lec-part-hit').first().boundingBox())!, canvas = (await page.getByRole('application').boundingBox())!;
  const point = { id: 1, x: part.x + part.width / 2 - canvas.x, y: part.y + part.height / 2 - canvas.y };
  const before = await page.evaluate(() => window.__lec.session.getSnapshot()), touch = await nativeTouch(page, context);
  try {
    for (let i = 0; i < 2; i++) { await touch.send('touchStart', [point]); await touch.send('touchEnd', []); }
    await expect(page.getByLabel('Reference', { exact: true })).toHaveValue('R1');
    expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
  } finally { await touch.close(); }
});

test('properties show common fields first and reveal related controls on request', async ({ page }) => {
  await parts(page); await page.locator('.lec-part-hit').first().dblclick();
  await expect(page.getByLabel('Value', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move by coordinates…', exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect named pins…', exact: true })).not.toBeVisible();
  await page.getByText('Position & orientation', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move by coordinates…', exact: true })).toBeVisible();
  await page.getByText('Pins & connections', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect named pins…', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Circuit inspector' })).not.toHaveAttribute('aria-label');
});

test('empty inspector gives selection guidance while wire preferences stay available in a disclosure', async ({ page }) => {
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Select an object', exact: true })).toBeVisible();
  await expect(page.locator('.lec-inspector-empty button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Horizontal first', exact: true })).not.toBeVisible();
  await page.getByText('Annotations & wire options', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Horizontal first', exact: true })).toBeVisible();
});

test('locked parts remain inspectable and shortcuts ignore composition and repeats', async ({ page }) => {
  await parts(page); await page.evaluate(() => window.__lec.session.edit('Lock part', doc => { doc.components[0].locked = true; }));
  await page.locator('.lec-part-hit').first().dblclick();
  await expect(page.getByLabel('Reference', { exact: true })).toHaveValue('R1');
  await expect(page.getByLabel('Value', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByTestId('editor').focus();
  await page.getByTestId('editor').dispatchEvent('keydown', { key: 'w', isComposing: true });
  await page.getByTestId('editor').dispatchEvent('keydown', { key: 'm', repeat: true });
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Multi', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('double-click while wiring does not open properties', async ({ page }) => {
  await parts(page); await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.locator('.lec-part-hit').first().dblclick();
  await expect(page.locator('.lec-inspector')).not.toBeVisible();
});

test('touch double-tap works through pointer events with compatibility mouse clicks suppressed', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch-enabled phone and tablet projects.');
  await parts(page); const part = (await page.locator('.lec-part-hit').first().boundingBox())!;
  for (let i = 0; i < 2; i++) await page.touchscreen.tap(part.x + part.width / 2, part.y + part.height / 2);
  await expect(page.getByLabel('Reference', { exact: true })).toHaveValue('R1');
});

test('panning between taps clears a pending double-tap without editing the circuit', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch comes from Chromium CDP.');
  await parts(page); const before = await page.evaluate(() => window.__lec.session.getSnapshot()), touch = await nativeTouch(page, context);
  async function point() {
    const part = (await page.locator('.lec-part-hit').first().boundingBox())!, canvas = (await page.getByRole('application').boundingBox())!;
    return { id: 1, x: part.x + part.width / 2 - canvas.x, y: part.y + part.height / 2 - canvas.y };
  }
  try {
    await touch.send('touchStart', [await point()]); await touch.send('touchEnd', []);
    await touch.send('touchStart', [{ id: 1, x: 20, y: 100 }]); await touch.send('touchMove', [{ id: 1, x: 60, y: 100 }]); await touch.send('touchEnd', []);
    await touch.send('touchStart', [await point()]); await touch.send('touchEnd', []);
    await expect(page.locator('.lec-inspector')).not.toBeVisible();
    expect(await page.evaluate(() => window.__lec.session.getSnapshot())).toEqual(before);
  } finally { await touch.close(); }
});


test('closing properties and clicking tool or zoom controls returns focus for canvas keys', async ({ page }) => {
  await parts(page); await page.locator('.lec-part-hit').first().dblclick();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.getByTestId('editor')).toBeFocused();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByTestId('editor')).toBeFocused(); await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByTestId('editor')).toBeFocused(); await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: 'Box select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByTestId('editor')).toBeFocused(); await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
