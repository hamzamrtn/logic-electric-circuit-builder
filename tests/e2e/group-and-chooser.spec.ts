import { insertAction, openParts } from './helpers/toolbar';
import { expect, test, type Page } from '@playwright/test';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });
async function addResistor(page: Page, x: number) {
  await openParts(page, 'Electrical');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('Resistor');
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
  await page.getByRole('application').click({ position: { x, y: 240 } });
}
async function crossing(page: Page) {
  await page.evaluate(() => window.__lec.session.edit('Independent crossing wires', doc => {
    doc.nodes.push(...[{ id: 'left', x: -80, y: 0 }, { id: 'right', x: 80, y: 0 }, { id: 'top', x: 0, y: -80 }, { id: 'bottom', x: 0, y: 80 }].map(({ id, x, y }) => ({ id, position: { x, y }, explicit: false })));
    for (const [id, a, b] of [['cross-a', 'left', 'right'], ['cross-b', 'top', 'bottom']]) doc.wires.push({ id, a: { kind: 'node', nodeId: a }, b: { kind: 'node', nodeId: b }, width: 1, locked: false, route: { mode: 'manual', geometry: 'orthogonal', horizontalFirst: true, vertices: [] } });
  }));
  return page.locator('[data-object="cross-a"] .lec-wire-hit').evaluate(element => {
    const path = element as SVGPathElement, point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!), rect = path.closest('svg')!.getBoundingClientRect();
    return { x: point.x - rect.x, y: point.y - rect.y };
  });
}

test('selecting a group in Objects highlights and drags the group while Delete removes only its container', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse group drag; group core operations are checked independently.');
  await addResistor(page, 160); await addResistor(page, 320);
  await page.evaluate(() => window.__lec.session.edit('Group parts', doc => { doc.groups.push({ id: 'group', name: 'Test group', members: doc.components.map(c => c.id), locked: false }); }));
  await page.getByRole('button', { name: 'Inspect', exact: true }).click(); await page.getByRole('tab', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Test group', exact: true }).click(); await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await expect(page.locator('.lec-part.is-selected')).toHaveCount(2);
  const original = await page.evaluate(() => window.__lec.session.getSnapshot().document.components), part = (await page.locator('.lec-part-hit').first().boundingBox())!;
  await page.mouse.move(part.x + part.width / 2, part.y + part.height / 2); await page.mouse.down();
  await page.mouse.move(part.x + part.width / 2 + 64, part.y + part.height / 2 + 48, { steps: 20 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.map(c => c.position))).toEqual(original.map(c => ({ x: c.position.x + 64, y: c.position.y + 48 })));
  await page.getByTestId('editor').focus(); await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.groups.length)).toBe(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(2);
});

for (const additive of ['Multi', 'Shift'] as const) test(`choosing an overlapping wire with ${additive} preserves selection and stays on the canvas`, async ({ page }) => {
  await addResistor(page, 160); const point = await crossing(page);
  if (additive === 'Multi') await page.getByRole('button', { name: 'Multi', exact: true }).click();
  await page.getByRole('application').click({ position: point, modifiers: additive === 'Shift' ? ['Shift'] : [] });
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button').first()).toBeFocused();
  const before = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document));
  await page.keyboard.press('r'); await page.keyboard.press('Delete');
  expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(before);
  await page.keyboard.press('Enter');
  await expect(page.locator('.lec-part.is-selected')).toHaveCount(1); await expect(page.locator('.lec-wire.is-selected')).toHaveCount(1);
  await expect(page.locator('.lec-inspector')).not.toHaveClass(/is-open/);
});

test('wire chooser owns keyboard focus and Escape cancels only the choice, keeping the draft', async ({ page }) => {
  const point = await crossing(page);
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); await page.getByRole('application').click({ position: { x: 80, y: 140 } });
  await page.getByRole('application').click({ position: point });
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.locator('.lec-gesture-bar')).toContainText('0 points placed');
  await expect(page.getByRole('button', { name: 'Wire', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('editor')).toBeFocused();
});

test('a failed form keeps keyboard correction and Escape available', async ({ page }) => {
  await page.getByRole('button', { name: 'Document menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import circuit JSON…', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Circuit JSON', exact: true });
  await input.fill('{bad'); await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Cut on a group removes its contents in one undoable operation', async ({ page }) => {
  await addResistor(page, 160); await addResistor(page, 300);
  await page.evaluate(() => window.__lec.session.edit('Group parts', doc => { doc.groups.push({ id: 'group', name: 'Cut group', members: doc.components.map(c => c.id), locked: false }); }));
  const original = await page.evaluate(() => window.__lec.session.getSnapshot().document);
  await page.getByRole('button', { name: 'Inspect', exact: true }).click(); await page.getByRole('tab', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Cut group', exact: true }).click();
  await page.getByText('Arrange and selection actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.groups.length)).toBe(0);
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document)).toEqual(original);
});

test('joining crossing wires and the current draft is one undo step', async ({ page }) => {
  const point = await crossing(page), original = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); await page.getByRole('application').click({ position: { x: 80, y: 140 } });
  await page.getByRole('application').click({ position: point });
  await page.getByRole('button', { name: 'Join both wires explicitly', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(original.revision + 1);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document)).toEqual(original.document);
});

test('nearby parallel wires do not offer an impossible common join', async ({ page }) => {
  const point = await crossing(page);
  await page.evaluate(() => window.__lec.session.edit('Parallel wires', doc => {
    doc.nodes.find(node => node.id === 'top')!.position = { x: -80, y: 8 };
    doc.nodes.find(node => node.id === 'bottom')!.position = { x: 80, y: 8 };
  }));
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); await page.getByRole('application').click({ position: { x: 80, y: 140 } });
  await page.getByRole('application').click({ position: { x: point.x, y: point.y + 4 } });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join both wires explicitly', exact: true })).toHaveCount(0);
});

test('removed connection choices close safely while preserving a free-start draft', async ({ page }) => {
  const point = await crossing(page);
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); await page.getByRole('application').click({ position: { x: 80, y: 140 } });
  await page.getByRole('application').click({ position: point }); await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => window.__lec.session.edit('Remove targets in another view', doc => { doc.wires = []; doc.nodes = []; }));
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.lec-gesture-bar')).toContainText('0 points placed');
  await expect(page.getByTestId('editor')).toBeFocused();
});

test('creating a custom block keeps the placement focus chosen by the action', async ({ page }) => {
  await insertAction(page, 'Custom block');
  await page.getByRole('button', { name: 'Place block', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByTestId('editor')).toBeFocused();
  await page.getByRole('application').click({ position: { x: 180, y: 240 } });
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
});

test('moving the focused connection choice keeps focus on a remaining valid choice', async ({ page }) => {
  const point = await crossing(page);
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); await page.getByRole('application').click({ position: { x: 80, y: 140 } });
  await page.getByRole('application').click({ position: point });
  const dialog = page.getByRole('dialog'); await page.keyboard.press('Tab');
  await expect(dialog.locator('.lec-object-row').nth(1)).toBeFocused();
  await page.evaluate(() => window.__lec.session.edit('Move target in another view', doc => { doc.nodes.find(node => node.id === 'top')!.position.x = 80; doc.nodes.find(node => node.id === 'bottom')!.position.x = 80; }));
  await expect(dialog.locator('.lec-object-row')).toHaveCount(1);
  await expect(dialog.locator('.lec-object-row').first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.locator('.lec-gesture-bar')).toContainText('0 points placed');
});
