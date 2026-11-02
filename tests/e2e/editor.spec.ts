import { expect, test } from '@playwright/test';
const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });
async function add(page: import('@playwright/test').Page, name: string, x: number, y: number) {
  await page.getByRole('button', { name: 'Electrical parts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill(name.replace(/ Passive$/, ''));
  await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('application').click({ position: { x, y } });
}
test('visible placement, rotation and undo', async ({ page }) => {
  await add(page, 'Resistor Passive', 180, 220);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].rotation)).toBe(90);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].rotation)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('Finish leaves exactly one wire at the placed endpoint and ignores a trailing canvas pointer-up', async ({ page }) => {
  const canvas = page.getByRole('application'); const rect = (await canvas.boundingBox())!;
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await canvas.click({ position: { x: 80, y: 160 } }); await canvas.click({ position: { x: 220, y: 220 } });
  const end = await page.evaluate(() => { const p = document.querySelector('.lec-canvas g[transform]')!.getAttribute('transform')!; const m = p.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/)!; const step = Number(document.querySelector('pattern')!.getAttribute('width')); return { x: Math.round((220 - Number(m[1])) / Number(m[3]) / step) * step, y: Math.round((220 - Number(m[2])) / Number(m[3]) / step) * step }; });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await canvas.dispatchEvent('pointerup', { pointerId: 1, clientX: rect.x + 100, clientY: rect.y + 100 });
  const result = await page.evaluate(() => { const d = window.__lec.session.getSnapshot().document; const b = d.wires[0].b; return { count: d.wires.length, nodes: d.nodes.length, end: b.kind === 'node' ? d.nodes.find(n => n.id === b.nodeId)?.position : null }; });
  expect(result.count).toBe(1); expect(result.nodes).toBe(2); expect(result.end).toEqual(end);
  await expect(page.locator('.lec-gesture-bar')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('toolbar selection and linear zoom are available without opening the inspector', async ({ page }) => {
  await add(page, 'Resistor Passive', 180, 220);
  await page.getByRole('button', { name: 'Select all', exact: true }).click(); await expect(page.getByRole('button', { name: 'Deselect all', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click(); await expect(page.getByRole('button', { name: 'Deselect all', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset zoom' }).click(); await page.getByRole('button', { name: 'Zoom in' }).click(); await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('125%');
  await page.getByRole('button', { name: 'Zoom in' }).click(); await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('150%');
  await page.getByRole('button', { name: 'Zoom out' }).click(); await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('125%');
});
test('selection marquee stays transparent while selecting', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse box selection path'); await add(page, 'Resistor Passive', 180, 220); await page.getByRole('button', { name: 'Box', exact: true }).click();
  const b = (await page.getByRole('application').boundingBox())!; await page.mouse.move(b.x + 50, b.y + 80); await page.mouse.down(); await page.mouse.move(b.x + 300, b.y + 300);
  expect(await page.locator('.lec-box-selection').evaluate(el => Number(getComputedStyle(el).fillOpacity))).toBeLessThan(.2); await page.mouse.up();
});
test('File opens below its trigger, keeps Clear visible and closes on an outside click', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Document menu' }); await trigger.click();
  const buttonBox = (await trigger.boundingBox())!, menuBox = (await page.getByRole('menu', { name: 'File', exact: true }).boundingBox())!;
  expect(Math.abs(buttonBox.x - menuBox.x)).toBeLessThan(8); expect(menuBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
  await expect(page.getByRole('menuitem', { name: 'Clear circuit…', exact: true })).toBeInViewport();
  await expect(page.getByRole('menuitem', { name: 'Examples…', exact: true })).toHaveCount(1);
  await page.getByRole('application').click({ position: { x: 500, y: 140 } });
  await expect(page.getByRole('menu', { name: 'File', exact: true })).toHaveCount(0); await expect(page.locator('.lec-gesture-bar')).toHaveCount(0);
  await trigger.click(); await page.getByRole('menuitem', { name: 'Clear circuit…', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
});
test('wire-draft undo removes corners without undoing document history', async ({ page }) => {
  await add(page, 'Resistor Passive', 180, 260); const original = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document));
  const canvas = page.getByRole('application'); await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await canvas.click({ position: { x: 80, y: 100 } }); await canvas.click({ position: { x: 280, y: 100 } }); await canvas.click({ position: { x: 320, y: 180 } });
  await page.keyboard.press('Control+z'); await expect(page.locator('.lec-gesture-bar')).toContainText('1 point placed');
  await page.keyboard.press('Control+z'); await expect(page.locator('.lec-gesture-bar')).toContainText('0 points placed');
  await page.keyboard.press('Control+z'); expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(original);
  await page.keyboard.press('Control+Shift+z'); await expect(page.locator('.lec-gesture-bar')).toContainText('1 point placed');
  await page.keyboard.press('Control+y'); await expect(page.locator('.lec-gesture-bar')).toContainText('2 points placed');
  await page.keyboard.press('Enter'); expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1);
  await page.keyboard.press('Control+z'); expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(original);
});
test('annotation handles resize and rotate with one undo step per gesture', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop drag path; numeric annotation controls are tested on both layouts.');
  await page.getByRole('button', { name: 'Text', exact: true }).click(); await page.getByRole('textbox', { name: 'Text', exact: true }).fill('hello'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const before = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document));
  const corner = (await page.locator('[data-annotation-handle="se"]').boundingBox())!; const revision = await page.evaluate(() => window.__lec.session.getSnapshot().revision);
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down(); await page.mouse.move(corner.x + corner.width / 2 + 80, corner.y + corner.height / 2 + 50, { steps: 20 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(revision + 1);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.annotations[0].scaleX)).toBeGreaterThan(1);
  const rotate = (await page.locator('[data-annotation-handle="rotate"]').boundingBox())!;
  await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2); await page.mouse.down(); await page.mouse.move(rotate.x + rotate.width / 2 + 80, rotate.y + rotate.height / 2 + 60, { steps: 20 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.annotations[0].rotation)).not.toBe(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(before);
});
test('annotation transforms can be set without dragging', async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click(); await page.getByRole('textbox', { name: 'Text', exact: true }).fill('label'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('[data-annotation-handle]')).toHaveCount(5); await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Move / resize / rotate…', exact: true }).click();
  await page.getByLabel('Rotation (degrees)', { exact: true }).fill('30'); await page.getByLabel('Width (%)', { exact: true }).fill('200'); await page.getByLabel('Height (%)', { exact: true }).fill('150'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await page.evaluate(() => { const a = window.__lec.session.getSnapshot().document.annotations[0]; return [a.rotation, a.scaleX, a.scaleY]; })).toEqual([30, 2, 1.5]);
});
test('Multi selects a previously unselected buffer together with its wires', async ({ page }) => {
  await page.evaluate(() => {
    const catalogue = window.__lec.examples.find(e => e.name === 'Complete symbol catalogue')!.document;
    const c = structuredClone(catalogue.components.find(c => catalogue.definitions.find(d => d.id === c.definitionId)?.name === 'Buffer')!);
    c.position = { x: -96, y: 0 }; c.reference = 'U1';
    const d = { ...structuredClone(catalogue), id: 'multi-test', components: [c], annotations: [], groups: [], nodes: [{ id: 'test-end-a', position: { x: 96, y: 0 }, explicit: true }, { id: 'test-end-b', position: { x: 96, y: 128 }, explicit: false }], wires: [
      { id: 'test-wire-a', a: { kind: 'pin', componentId: c.id, pinId: 'out' }, b: { kind: 'node', nodeId: 'test-end-a' }, width: 1, locked: false, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] } },
      { id: 'test-wire-b', a: { kind: 'node', nodeId: 'test-end-a' }, b: { kind: 'node', nodeId: 'test-end-b' }, width: 1, locked: false, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] } },
    ] }; window.__lec.session.replaceRaw(JSON.stringify(d));
  });
  await expect(page.getByRole('button', { name: 'Deselect all', exact: true })).toBeDisabled();
  const revision = await page.evaluate(() => window.__lec.session.getSnapshot().revision);
  await page.getByRole('button', { name: 'Multi', exact: true }).click();
  await page.locator('.lec-part-hit').click(); await expect(page.locator('.lec-part.is-selected')).toHaveCount(1);
  for (const id of ['test-wire-a', 'test-wire-b']) {
    // Straight SVG paths have a zero-width or zero-height bounding box, so
    // Playwright rejects locator.click() even though their strokes are hittable.
    const position = await page.locator(`[data-object="${id}"] .lec-wire-hit`).evaluate(element => {
      const path = element as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
      const canvas = path.closest('svg')!.getBoundingClientRect();
      return { x: point.x - canvas.left, y: point.y - canvas.top };
    });
    await page.getByRole('application').click({ position });
    await expect(page.locator(`[data-object="${id}"]`)).toHaveClass(/is-selected/);
  }
  await expect(page.locator('.lec-part.is-selected')).toHaveCount(1); await expect(page.locator('.lec-wire.is-selected')).toHaveCount(2);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(revision);
  await page.locator('.lec-part-hit').click(); await expect(page.locator('.lec-part.is-selected')).toHaveCount(0); await expect(page.locator('.lec-wire.is-selected')).toHaveCount(2);
});
test('Enter finishes a wire but preserves native Enter behavior in text fields', async ({ page }) => {
  const canvas = page.getByRole('application'); await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await canvas.click({ position: { x: 80, y: 100 } }); await canvas.click({ position: { x: 240, y: 200 } });
  await page.getByRole('button', { name: 'Document menu' }).click(); await page.getByRole('menuitem', { name: 'Circuit title…', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Named with Enter'); await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(0);
  await page.getByTestId('editor').focus(); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1); await expect(page.locator('.lec-gesture-bar')).toHaveCount(0);
  await page.keyboard.press('Enter'); expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1);
});
test('invalid and future JSON cannot replace the drawing', async ({ page }) => {
  await add(page, 'Resistor Passive', 180, 220); const before = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document));
  await page.getByRole('button', { name: 'Document menu' }).click(); await page.getByRole('menuitem', { name: 'Import circuit JSON…' }).click();
  await page.getByRole('textbox', { name: 'Circuit JSON' }).fill('{bad'); await page.getByRole('button', { name: 'Import', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot().document))).toBe(before);
  await page.getByRole('textbox', { name: 'Circuit JSON' }).fill('{"schemaVersion":99}'); await page.getByRole('button', { name: 'Import', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Unsupported schema');
});
test('one long drag is one undo step; pointer cancellation commits nothing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse drag variant; touch uses the coordinate-move workflow.');
  await add(page, 'Resistor Passive', 200, 250); const original = await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].position);
  const target = page.locator('.lec-canvas .lec-part-hit'); const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const revision = await page.evaluate(() => window.__lec.session.getSnapshot().revision);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 100, y + 60, { steps: 200 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(revision + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].position)).toEqual(original);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 40); await page.getByRole('application').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components[0].position)).toEqual(original);
});
test('SVG and PNG exports contain valid image output', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const d = window.__lec.examples[0].document; const svg = window.__lec.exportSVG(d); const bytes = new Uint8Array(await window.__lec.exportPNG(d, document, 1));
    return { svg: svg.startsWith('<svg') && !svg.includes('foreignObject'), signature: [...bytes.slice(0, 8)], length: bytes.length };
  });
  expect(result.svg).toBe(true); expect(result.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(result.length).toBeGreaterThan(1000);
});
test('editing text does not delete a selected circuit component', async ({ page }) => {
  await add(page, 'Resistor Passive', 180, 220); const inspect = page.getByRole('button', { name: 'Inspect', exact: true });
  if (!(await page.getByLabel('Reference', { exact: true }).isVisible())) await inspect.click();
  await page.getByLabel('Reference', { exact: true }).fill('custom reference'); await page.getByLabel('Reference', { exact: true }).press('Backspace');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
});
