import { expect, test } from '@playwright/test';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });

for (const grouped of [false, true]) test(`annotation controls respect ${grouped ? 'group' : 'object'} locking and offer an unlock action`, async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Protected label');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.evaluate(grouped => window.__lec.session.edit('Protect annotation', doc => {
    if (grouped) doc.groups.push({ id: 'protected', name: 'Protected group', members: [doc.annotations[0].id], locked: true });
    else doc.annotations[0].locked = true;
  }), grouped);
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move / resize / rotate…', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Annotation text', { exact: true })).toBeDisabled();
  await page.getByText('Arrange and selection actions', { exact: true }).click();
  await page.getByRole('button', { name: grouped ? 'Unlock group' : 'Unlock selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move / resize / rotate…', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Annotation text', { exact: true })).toBeEnabled();
});

test('locked wire geometry cannot be edited through the inspector', async ({ page }) => {
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 80, y: 180 } });
  await page.getByRole('application').click({ position: { x: 240, y: 180 } });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.evaluate(() => window.__lec.session.edit('Protect wire', doc => { doc.wires[0].locked = true; }));
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByText('Wire connections', { exact: true }).click();
  for (const name of ['Drag segments & bends', 'Add / remove bends…', 'Use free-angle routing', 'Reconnect start', 'Reconnect end']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
});

test('a transform dialog opened before a lock change cannot bypass the new lock', async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Label');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Move / resize / rotate…', exact: true }).click();
  const before = await page.evaluate(() => { window.__lec.session.edit('Lock from another view', doc => { doc.annotations[0].locked = true; }); return window.__lec.session.getSnapshot().document.annotations[0]; });
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill(String(before.position.x + 80));
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Unlock');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.annotations[0])).toEqual(before);
});

test('coordinate dialogs use absolute positions after an external move', async ({ page }) => {
  await page.getByRole('button', { name: 'Electrical parts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('Resistor');
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 180, y: 240 } });
  const original = await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].position);
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByText('Position & orientation', { exact: true }).click();
  await page.getByRole('button', { name: 'Move by coordinates…', exact: true }).click();
  await page.evaluate(() => window.__lec.session.edit('Move in another view', doc => { doc.components[0].position.x += 80; doc.components[0].position.y -= 40; }));
  await page.getByRole('spinbutton', { name: 'Selected object X', exact: true }).fill(String(original.x + 160));
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].position)).toEqual({ x: original.x + 160, y: original.y });
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].position)).toEqual({ x: original.x + 80, y: original.y - 40 });
});
