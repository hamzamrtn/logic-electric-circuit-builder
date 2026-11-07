import { openParts } from './helpers/toolbar';
import { expect, test, type Page } from '@playwright/test';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });

async function placeResistor(page: Page) {
  await openParts(page, 'Electrical');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('Resistor');
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 180, y: 240 } });
}

test('unhandled command and alt shortcuts do not rotate parts or change canvas tools', async ({ page }) => {
  await placeResistor(page);
  const before = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document));
  const canceled = await page.getByTestId('editor').evaluate(element => {
    const results: boolean[] = [];
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) for (const key of ['r', 'w', 'f', 'ArrowRight', 'Backspace']) {
      results.push(!element.dispatchEvent(new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true })));
    }
    return results;
  });
  expect(canceled).toEqual(canceled.map(() => false));
  expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(before);
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('an external edit removing the start pin cancels the wire draft without crashing the editor', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await placeResistor(page);
  await page.locator('.lec-pin[data-pin="2"]').click();
  await expect(page.locator('.lec-gesture-bar')).toBeVisible();
  await page.evaluate(() => window.__lec.session.edit('Removed in another view', doc => { doc.components = []; doc.wires = []; doc.annotations = []; }));
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.locator('.lec-gesture-bar')).toHaveCount(0);
  expect(errors).toEqual([]);
  await placeResistor(page);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
});

test('cut applies immediately even when the system clipboard is slow', async ({ page }) => {
  await placeResistor(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: () => new Promise<void>(resolve => window.addEventListener('release-test-clipboard', () => resolve(), { once: true })),
    } });
  });
  await page.getByTestId('editor').focus(); await page.keyboard.press('Control+x');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('release-test-clipboard')));
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
});

test('a large symbol remains visible while its origin is outside the viewport', async ({ page }) => {
  await placeResistor(page);
  await page.evaluate(() => {
    const canvas = document.querySelector('.lec-canvas')!, transform = canvas.querySelector('g[transform]')!.getAttribute('transform')!;
    const match = transform.match(/translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)/)!;
    const right = (canvas.getBoundingClientRect().width - Number(match[1])) / Number(match[3]);
    window.__lec.session.edit('Large custom symbol', doc => {
      const component = doc.components[0], definition = doc.definitions.find(d => d.id === component.definitionId)!;
      component.position.x = Math.ceil(right + 400);
      definition.bounds = { x: -600, y: -64, width: 1200, height: 128 };
      definition.primitives = [{ kind: 'rect', x: -600, y: -64, width: 1200, height: 128 }];
    });
  });
  await expect(page.locator('.lec-part')).toHaveCount(1);
  await expect(page.locator('.lec-part')).toBeVisible();
});

test('drag preview and commit agree for attached labels, including a protected label', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Native mouse preview; phone and tablet coordinate editing are covered separately.');
  await placeResistor(page);
  const original = await page.evaluate(() => {
    window.__lec.session.edit('Attached labels', doc => {
      const part = doc.components[0];
      for (const [id, dy] of [['moving-label', -32], ['fixed-label', 32]] as const) doc.annotations.push({ id, kind: 'label', text: id, position: { x: part.position.x + 80, y: part.position.y + dy }, anchor: { kind: 'pin', componentId: part.id, pinId: '2' }, global: false, locked: false, size: { x: 160, y: 96 }, zIndex: 0, rotation: 0, scaleX: 1, scaleY: 1, fontSize: 14 });
      doc.groups.push({ id: 'fixed-label-group', name: 'Fixed label', members: ['fixed-label'], locked: true });
    });
    return window.__lec.session.getSnapshot();
  });
  const part = (await page.locator('.lec-part-hit').boundingBox())!;
  await page.mouse.move(part.x + part.width / 2, part.y + part.height / 2); await page.mouse.down();
  await page.mouse.move(part.x + part.width / 2 + 80, part.y + part.height / 2 + 48, { steps: 20 });
  for (const annotation of original.document.annotations) {
    const position = annotation.id === 'moving-label' ? { x: annotation.position.x + 80, y: annotation.position.y + 48 } : annotation.position;
    await expect(page.locator(`.lec-annotation[data-object="${annotation.id}"]`)).toHaveAttribute('transform', `translate(${position.x} ${position.y}) rotate(0) scale(1 1)`);
  }
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(original.revision);
  await page.mouse.up();
  const committed = await page.evaluate(() => window.__lec.session.getSnapshot());
  expect(committed.revision).toBe(original.revision + 1);
  expect(committed.document.annotations[0].position).toEqual({ x: original.document.annotations[0].position.x + 80, y: original.document.annotations[0].position.y + 48 });
  expect(committed.document.annotations[1]).toEqual(original.document.annotations[1]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document)).toEqual(original.document);
});
