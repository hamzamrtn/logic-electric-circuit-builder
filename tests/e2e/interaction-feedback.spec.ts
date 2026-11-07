import { expect, test, type Page } from '@playwright/test';
import { nativeTouch } from './helpers/touch';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); });
async function chooseResistor(page: Page) {
  await page.getByRole('button', { name: 'Electrical parts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('Resistor');
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
}
async function camera(page: Page) {
  return page.locator('.lec-canvas > g[transform]').evaluate(element => {
    const match = element.getAttribute('transform')!.match(/translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)/)!;
    return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
  });
}
test('Fit keeps a tall drawing above the floating zoom controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    const doc = structuredClone(window.__lec.examples.find(example => example.name === 'Complete symbol catalogue')!.document);
    doc.components = doc.components.filter(c => doc.definitions.find(d => d.id === c.definitionId)?.name === 'Resistor');
    const second = structuredClone(doc.components[0]); second.id += '-second'; second.reference = 'R2'; second.position.y += 1400;
    doc.components.push(second); doc.wires = []; doc.nodes = []; doc.annotations = []; doc.groups = [];
    window.__lec.session.replaceRaw(JSON.stringify(doc));
  });
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  const controls = (await page.locator('.lec-zoom-controls').boundingBox())!;
  for (const part of await page.locator('.lec-part').all()) {
    const box = (await part.boundingBox())!;
    expect(box.y).toBeGreaterThan(30); expect(box.y + box.height).toBeLessThan(controls.y - 8);
  }
});
test('placement feedback leaves committed geometry and its hit area fixed', async ({ page }) => {
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 160, y: 240 } });
  const part = page.locator('.lec-part'), hit = page.locator('.lec-part-hit');
  await expect(part.locator('.lec-placement-ink')).toHaveClass(/is-settling/);
  const before = await hit.boundingBox(), original = await page.evaluate(() => window.__lec.session.getSnapshot());
  await expect(part.locator('.lec-placement-ink')).not.toHaveClass(/is-settling/);
  expect(await hit.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document)).toEqual(original.document);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(original.revision);
});
test('wire completion briefly highlights the exact committed path and endpoints', async ({ page }) => {
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 80, y: 180 } }); await page.getByRole('application').click({ position: { x: 240, y: 260 } });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.lec-wire-feedback')).toHaveCount(1);
  expect(await page.locator('.lec-wire-feedback').getAttribute('d')).toBe(await page.locator('.lec-wire > path').first().getAttribute('d'));
  await expect(page.locator('.lec-connection-feedback')).toHaveCount(2);
  await expect(page.locator('.lec-wire-feedback')).toHaveCount(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(1);
});
test('alignment and overlap cues assist placement without nudging or blocking it', async ({ page }) => {
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 160, y: 240 } });
  await chooseResistor(page); const original = await page.evaluate(() => window.__lec.session.getSnapshot());
  await page.getByRole('application').hover({ position: { x: 300, y: 240 } });
  await expect(page.locator('.lec-alignment-guide[data-axis="y"]')).toHaveCount(1);
  await expect(page.locator('.lec-snap-feedback')).toHaveCount(1);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document)).toEqual(original.document);
  await page.getByRole('application').hover({ position: { x: 160, y: 240 } });
  await expect(page.locator('.lec-overlap-cue')).toHaveCount(1); await expect(page.locator('.lec-placement-preview')).toHaveClass(/is-overlapping/);
  await page.getByRole('application').click({ position: { x: 160, y: 240 } });
  const positions = await page.evaluate(() => window.__lec.session.getSnapshot().document.components.map(component => component.position));
  expect(positions).toHaveLength(2); expect(positions[0]).toEqual(positions[1]);
  await expect(page.locator('.lec-alignment-guide')).toHaveCount(0); await expect(page.locator('.lec-overlap-cue')).toHaveCount(0);
});
test('deselected annotation handles stop intercepting input during their fade', async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Label'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const revision = await page.evaluate(() => window.__lec.session.getSnapshot().revision);
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  expect(await page.locator('.lec-annotation-handles').evaluateAll(elements => elements.every(element => element.getAttribute('pointer-events') === 'none'))).toBe(true);
  await expect(page.locator('.lec-annotation-handles')).toHaveCount(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(revision);
});
test('Reduce Motion disables placement transforms and makes Reset immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 160, y: 240 } });
  const style = await page.locator('.lec-placement-ink').evaluate(element => ({ animation: getComputedStyle(element).animationName, transform: getComputedStyle(element).transform }));
  expect(style).toEqual({ animation: 'none', transform: 'none' });
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expect(page.getByTestId('editor')).not.toHaveAttribute('data-camera-animating', 'true');
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).toHaveText('100%');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(1);
});
test('a touch pan interrupts Reset without any delayed camera jump', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch interruption uses CDP.');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expect(page.getByTestId('editor')).toHaveAttribute('data-camera-animating', 'true');
  const touch = await nativeTouch(page, context);
  try {
    await touch.send('touchStart', [{ id: 1, x: 80, y: 180 }]); const start = await camera(page);
    await expect(page.getByTestId('editor')).not.toHaveAttribute('data-camera-animating', 'true');
    await touch.send('touchMove', [{ id: 1, x: 120, y: 200 }]); await touch.send('touchEnd', []);
    const panned = await camera(page); expect(panned.x).toBeCloseTo(start.x + 40, 5); expect(panned.y).toBeCloseTo(start.y + 20, 5); expect(panned.zoom).toBe(start.zoom);
    await page.waitForTimeout(200); expect(await camera(page)).toEqual(panned);
    expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(0);
  } finally { await touch.close(); }
});

test('pin halos stay screen-sized and identify incompatible connection widths', async ({ page }) => {
  const ids = await page.evaluate(() => {
    const catalogue = window.__lec.examples.find(example => example.name === 'Complete symbol catalogue')!.document;
    const bus = structuredClone(catalogue.components.find(component => { const definition = catalogue.definitions.find(d => d.id === component.definitionId)!; return definition.category === 'Buses' && definition.pins[0].width === 8; })!);
    const resistor = structuredClone(catalogue.components.find(component => catalogue.definitions.find(d => d.id === component.definitionId)?.name === 'Resistor')!);
    bus.position = { x: -96, y: 0 }; resistor.position = { x: 96, y: 0 };
    const doc = { ...structuredClone(catalogue), components: [bus, resistor], wires: [], nodes: [], annotations: [], groups: [] };
    window.__lec.session.replaceRaw(JSON.stringify(doc)); return { bus: bus.id, resistor: resistor.id };
  });
  await page.locator(`[data-object="${ids.bus}"] .lec-pin[data-pin="in-0"]`).click();
  const target = page.locator(`[data-object="${ids.resistor}"] .lec-pin[data-pin="2"]`);
  await target.hover(); await expect(page.locator('.lec-target')).toHaveClass(/is-unavailable/);
  await expect(page.locator('.lec-gesture-bar')).toContainText('incompatible width');
  expect(Number(await page.locator('.lec-target').getAttribute('r')) * (await camera(page)).zoom).toBeCloseTo(9, 5);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await target.hover();
  expect(Number(await page.locator('.lec-target').getAttribute('r')) * (await camera(page)).zoom).toBeCloseTo(9, 5);
  await target.click();
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(1);
  await expect(page.locator('.lec-wire-feedback')).toHaveCount(0);
});

test('toolbar press feedback moves only the icon and keeps the button hit area fixed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop press inspection; phone target sizing is covered by layout checks.');
  const button = page.getByRole('button', { name: 'Box select', exact: true }), before = (await button.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down();
  await page.waitForTimeout(100);
  expect(await button.boundingBox()).toEqual(before);
  const transform = await button.locator('svg').evaluate(element => getComputedStyle(element).transform);
  expect(transform).toMatch(/^matrix\(0\.96/);
  await page.mouse.up(); expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(0);
});

test('changing Reduce Motion during Fit finishes immediately without touching history', async ({ page }) => {
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 160, y: 240 } });
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  await expect(page.getByTestId('editor')).toHaveAttribute('data-camera-animating', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('editor')).not.toHaveAttribute('data-camera-animating', 'true');
  const final = await camera(page); await page.waitForTimeout(200); expect(await camera(page)).toEqual(final);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(1);
});

test('repeat placement feedback expires while later snap cues keep arriving', async ({ page }) => {
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByText('Annotations & wire options', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Repeat placement', exact: true }).first().check();
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await chooseResistor(page); await page.getByRole('application').click({ position: { x: 160, y: 240 } });
  await expect(page.locator('.lec-placement-preview')).toHaveCount(0);
  for (let i = 0; i < 6; i++) { await page.getByRole('application').hover({ position: { x: 240 + i * 8, y: 240 } }); await page.waitForTimeout(35); }
  await expect(page.locator('.lec-placement-ink')).not.toHaveClass(/is-settling/);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.lec-snap-feedback')).toHaveCount(0);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(1);
});
