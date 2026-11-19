import { expect, test, type Page } from '@playwright/test';
import { digitalFixture } from '../fixtures/digital';
import { analogFixture } from '../fixtures/analog';
import { openParts } from './helpers/toolbar';
const pageErrors = new WeakMap<Page, string[]>();
const preview = new URL('../../dev/preview.html', import.meta.url).href;
const strip = (page: Page) => page.getByRole('toolbar', { name: 'Simulation controls', exact: true });
const panel = (page: Page) => page.getByRole('region', { name: 'Analysis', exact: true });
/** Enter Simulate mode from the top bar (or More on the narrowest panes). */
async function open(page: Page, via: 'toolbar' | 'menu' = 'toolbar') {
  const button = page.getByRole('button', { name: 'Simulate', exact: true });
  if (via === 'menu' || !await button.isVisible()) { await page.getByRole('button', { name: 'More actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Simulate circuit', exact: true }).click(); }
  else await button.click();
  await expect(strip(page)).toBeVisible();
}
async function exit(page: Page) {
  const build = page.getByRole('button', { name: 'Build', exact: true });
  if (await build.isVisible()) await build.click(); else if (await page.getByRole('button', { name: 'Simulate', exact: true }).isVisible()) await page.getByRole('button', { name: 'Simulate', exact: true }).click();
  else { await page.getByRole('button', { name: 'More actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Return to Build', exact: true }).click(); }
  await expect(strip(page)).toHaveCount(0);
}
async function load(page: Page, doc: unknown = digitalFixture()) { await page.evaluate(raw => window.__lec.session.replaceRaw(JSON.stringify(raw)), doc); }
async function signal(page: Page, name: string, value: string) { await panel(page).getByRole('combobox', { name: `${name} value`, exact: true }).selectOption(value); }
async function output(page: Page, name: string, value: string) { await expect(panel(page).getByRole('status', { name: `${name} output`, exact: true })).toContainText(value); }
const toggle = (page: Page, name: string) => panel(page).getByRole('switch', { name: `${name} input`, exact: true });
const state = (page: Page) => strip(page).locator('.lec-simulation-state');
const snapshot = (page: Page) => page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot()));
test.beforeEach(async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible();
  const nativeCssUrl = testInfo.config.metadata.nativeCssUrl;
  if (typeof nativeCssUrl === 'string') {
    await page.evaluate(async ({ nativeCssUrl, mobile }) => {
      await new Promise<void>((resolve, reject) => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = nativeCssUrl; link.onload = () => resolve(); link.onerror = () => reject(new Error('Native host CSS could not load')); document.head.prepend(link); });
      const wrapper = document.createElement('div'); wrapper.className = 'workspace-leaf-content'; wrapper.style.height = '100%';
      const root = document.getElementById('root')!; root.before(wrapper); wrapper.append(root); root.classList.add('view-content', 'lec-host-view');
      document.body.classList.add('theme-light');
      const nav = document.createElement('div'); nav.id = 'simulation-host-nav'; nav.textContent = 'Host navigation (emulated)';
      Object.assign(nav.style, { position: 'fixed', bottom: '34px', height: '52px', width: '300px', left: 'calc((100% - 300px) / 2)', zIndex: '1000', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '16px', fontSize: '12px', placeItems: 'center' }); document.body.append(nav);
      const update = () => { const phone = mobile && innerWidth <= 600; document.body.classList.toggle('is-mobile', mobile); document.body.classList.toggle('is-phone', phone); document.body.classList.toggle('is-floating-nav', phone); document.body.style.setProperty('--view-bottom-spacing', phone ? '86px' : '0px'); nav.style.display = phone ? 'grid' : 'none'; };
      update(); window.addEventListener('resize', update);
    }, { nativeCssUrl, mobile: isMobile });
  }
});

test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test('Simulate mode starts a live logic run; switches, edits, pause, reset and Build preserve content/history', async ({ page }) => {
  await load(page); const before = await snapshot(page);
  await open(page); await expect(page.getByRole('button', { name: 'Simulate', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lec-drawing-toolbar')).toBeHidden();
  await expect(state(page)).toHaveText('Live'); await output(page, 'SUM', '0 · Low'); await output(page, 'CARRY', '0 · Low');
  await toggle(page, 'A').click(); await expect(toggle(page, 'A')).toHaveAttribute('aria-checked', 'true'); await output(page, 'SUM', '1 · High');
  await signal(page, 'B', '1'); await output(page, 'SUM', '0 · Low'); await output(page, 'CARRY', '1 · High');
  await expect(page.locator('.lec-wire[data-signal="1"]')).not.toHaveCount(0);
  expect(await snapshot(page)).toBe(before);
  // A tap on the drawing's switch flips the same shared input; dragging in Simulate never moves parts.
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click(); await page.locator('[data-sim-input="b"] .lec-sim-switch-track').click();
  await expect(toggle(page, 'B')).toHaveAttribute('aria-checked', 'false'); await output(page, 'SUM', '1 · High');
  const part = (await page.locator('[data-object="xor"] .lec-part-hit').boundingBox())!; await page.mouse.move(part.x + part.width / 2, part.y + part.height / 2); await page.mouse.down(); await page.mouse.move(part.x + part.width / 2 + 80, part.y + part.height / 2 + 40, { steps: 5 }); await page.mouse.up();
  expect(await snapshot(page)).toBe(before);
  await strip(page).getByRole('button', { name: 'Pause', exact: true }).click(); await expect(state(page)).toHaveText('Paused'); await output(page, 'SUM', '–');
  await expect(page.locator('.lec-wire[data-signal="1"]')).toHaveCount(0);
  await strip(page).getByRole('button', { name: 'Run', exact: true }).click(); await output(page, 'SUM', '1 · High');
  await page.getByRole('button', { name: 'Document menu' }).click(); await page.getByRole('menuitem', { name: 'Circuit title…' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed while simulating'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(state(page)).toHaveText('Live'); await output(page, 'SUM', '1 · High');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(state(page)).toHaveText('Live'); await output(page, 'SUM', '1 · High');
  await strip(page).getByRole('button', { name: 'Reset', exact: true }).click(); await expect(toggle(page, 'A')).toHaveAttribute('aria-checked', 'false');
  await expect(panel(page).getByRole('combobox', { name: 'A value', exact: true })).toHaveValue('0'); await output(page, 'SUM', '0 · Low');
  await signal(page, 'A', 'X'); await output(page, 'SUM', 'X · Unknown'); await expect(page.locator('.lec-wire[data-signal="X"]')).not.toHaveCount(0);
  await exit(page); expect(await page.evaluate(() => window.__lec.simulation.size)).toBe(0);
  await expect(page.locator('.lec-drawing-toolbar')).toBeVisible();
  await expect(page.locator('.lec-wire[data-signal]')).toHaveCount(0); await expect(page.locator('[data-sim-input]')).toHaveCount(0);
  await open(page, 'menu'); await expect(panel(page).getByRole('combobox', { name: 'A value', exact: true })).toHaveValue('0'); await output(page, 'SUM', '0 · Low');
});
test('the analysis panel hides and returns while the drawing keeps live switches', async ({ page }) => {
  await load(page); await open(page); await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  await strip(page).getByRole('button', { name: 'Hide analysis panel' }).click(); await expect(panel(page)).toHaveCount(0);
  await page.locator('[data-sim-input="a"] .lec-sim-switch-track').click(); await expect(page.locator('.lec-sim-lamp[data-signal="1"]')).toHaveCount(1);
  await strip(page).getByRole('button', { name: 'Show analysis panel' }).click(); await output(page, 'SUM', '1 · High'); await expect(toggle(page, 'A')).toHaveAttribute('aria-checked', 'true');
});
test('truth table lists every combination and applies a chosen row', async ({ page }) => {
  await load(page); await open(page); await panel(page).getByRole('tab', { name: 'Truth table' }).click();
  const table = panel(page).getByRole('table'); await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table.getByRole('columnheader')).toHaveText(['A', 'B', 'SUM', 'CARRY']);
  await expect(table.getByRole('row').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(table.getByRole('row').nth(4).getByRole('cell')).toHaveText(['1', '1', '0', '1']);
  await panel(page).getByRole('button', { name: 'Apply A 1, B 1', exact: true }).click(); await expect(table.getByRole('row').nth(4)).toHaveAttribute('aria-current', 'true');
  await panel(page).getByRole('tab', { name: 'Signals' }).click(); await output(page, 'SUM', '0 · Low'); await output(page, 'CARRY', '1 · High');
});
test('electrical circuits: live operating point, switches, readouts, probes and scope measurements', async ({ page, isMobile }) => {
  await load(page, analogFixture()); const before = await snapshot(page);
  await open(page); await expect(strip(page).locator('.lec-sim-kind')).toHaveText('Electrical'); await expect(state(page)).toHaveText('Live');
  await expect(panel(page).getByRole('tab', { name: 'Scope' })).toHaveAttribute('aria-selected', 'true');
  // The switch starts open: the voltmeter trace stays at 0 V. Tapping the switch on the drawing closes it.
  const scope = panel(page).locator('.lec-scope-measures');
  await expect(scope.getByRole('row', { name: /V\(VM1\)/ })).toContainText('0 V');
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  const sw = (await page.locator('[data-object="sw1"] .lec-part-hit').boundingBox())!; await page.mouse.click(sw.x + sw.width / 2, sw.y + sw.height / 2);
  await expect(page.locator('[data-el-switch="sw1"]')).toHaveClass(/is-closed/);
  await expect(scope.getByRole('row', { name: /V\(VM1\)/ }).getByRole('cell').nth(1)).toHaveText('4.97 V');
  await expect(page.locator('.lec-el-tag').filter({ hasText: '5.00 V' })).not.toHaveCount(0);
  if (!isMobile) {
    const r = (await page.locator('[data-object="r1"] .lec-part-hit').boundingBox())!; await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await expect(page.locator('.lec-readout')).toContainText('R1 · Resistor 1k');
  }
  // Probe mode: clicking the capacitor plots its voltage; the trace can be removed again.
  await strip(page).getByRole('button', { name: 'Probe', exact: true }).click();
  const c = (await page.locator('[data-object="c1"] .lec-part-hit').boundingBox())!; await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  await expect(panel(page).locator('.lec-scope-chip').filter({ hasText: 'V(C1)' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Remove V(C1)' }).click(); await expect(panel(page).locator('.lec-scope-chip').filter({ hasText: 'V(C1)' })).toHaveCount(0);
  await strip(page).getByRole('button', { name: 'Probe', exact: true }).click();
  await panel(page).getByRole('tab', { name: 'Operating point' }).click();
  await expect(panel(page).getByRole('row', { name: /VM1/ })).toContainText('5.00 V');
  await panel(page).getByRole('tab', { name: 'Messages' }).click(); await expect(panel(page)).toContainText('No messages');
  await strip(page).getByRole('button', { name: 'Reset', exact: true }).click(); await expect(page.locator('[data-el-switch="sw1"]')).not.toHaveClass(/is-closed/);
  expect(await snapshot(page)).toBe(before);
  await exit(page); await expect(page.locator('.lec-el-tag')).toHaveCount(0);
});
test('the voltage divider example solves; mixed logic/electrical circuits and feedback report clear errors', async ({ page }) => {
  await page.getByRole('button', { name: 'Document menu' }).click(); await page.getByRole('menuitem', { name: 'Examples…' }).click();
  await page.getByRole('combobox', { name: 'Example', exact: true }).selectOption({ label: 'Voltage divider' }); await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await open(page); await panel(page).getByRole('tab', { name: 'Operating point' }).click();
  await expect(panel(page).getByRole('row', { name: /VOUT/ })).toContainText('2.50 V');
  await page.evaluate(doc => { doc.definitions.push(...window.__lec.examples[0].document.definitions.filter(d => d.name === 'Resistor' || d.name === 'Ground')); const r = window.__lec.examples[0].document.components.find(c => doc.definitions.some(d => d.id === c.definitionId && d.name === 'Resistor'))!; doc.components.push({ ...r, id: 'extra-r', position: { x: 600, y: 600 } }); window.__lec.session.replaceRaw(JSON.stringify(doc)); }, digitalFixture());
  await expect(state(page)).toHaveText('Needs attention'); await panel(page).getByRole('tab', { name: /Messages/ }).click();
  await expect(panel(page)).toContainText('mixes logic parts with electrical parts');
  await page.evaluate(doc => { doc.wires.push({ ...doc.wires[0], id: 'feedback', a: { kind: 'pin', componentId: 'xor', pinId: 'out' }, b: { kind: 'pin', componentId: 'xor', pinId: 'in-0' } }); window.__lec.session.replaceRaw(JSON.stringify(doc)); }, digitalFixture());
  await expect(panel(page).getByText(/Combinational feedback/)).toBeVisible();
  await load(page); await expect(state(page)).toHaveText('Live'); await signal(page, 'A', '0'); await signal(page, 'B', '1'); await output(page, 'SUM', '1 · High');
});
test('entering and leaving Simulate preserves an unfinished wire draft', async ({ page }) => {
  await page.getByRole('button', { name: 'Wire', exact: true }).click(); const canvas = page.getByRole('application');
  await canvas.click({ position: { x: 100, y: 180 } }); await canvas.click({ position: { x: 250, y: 180 } });
  const before = await snapshot(page);
  await open(page, 'menu'); await expect(page.locator('.lec-gesture-bar')).toContainText('1 point placed');
  await exit(page); await expect(page.locator('.lec-gesture-bar')).toContainText('1 point placed');
  expect(await snapshot(page)).toBe(before);
  await page.getByRole('button', { name: 'Finish', exact: true }).click(); expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(1);
});
test('build a supported circuit through the picker and named-pin dialog, then simulate and edit it live', async ({ page }) => {
  const canvas = page.getByRole('application');
  for (const [part, family, x, y] of [['Logic input', 'Logic I/O', .2, .3], ['Logic input', 'Logic I/O', .2, .7], ['AND', 'Logic gates', .5, .5], ['Output probe', 'Logic I/O', .8, .5]] as const) {
    await openParts(page, 'Logic'); await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill(part);
    await page.getByRole('button', { name: `${part} ${family}`, exact: true }).click(); const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: Math.round(box.width * x), y: Math.round(box.height * y) } });
  }
  await page.getByRole('button', { name: 'Inspect', exact: true }).click(); await page.getByText('Pins & connections', { exact: true }).click();
  for (const [from, to] of [['IN1 · OUT (1 bit)', 'U1 · A (1 bit)'], ['IN2 · OUT (1 bit)', 'U1 · B (1 bit)'], ['U1 · Y (1 bit)', 'DS1 · IN (1 bit)']]) {
    await page.getByRole('button', { name: 'Connect named pins…', exact: true }).click(); await page.getByRole('combobox', { name: 'From pin', exact: true }).selectOption({ label: from }); await page.getByRole('combobox', { name: 'To pin', exact: true }).selectOption({ label: to }); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Close inspector' }).click(); await open(page);
  await output(page, 'DS1', '0 · Low'); await toggle(page, 'IN1').click(); await toggle(page, 'IN2').click(); await output(page, 'DS1', '1 · High');
  await toggle(page, 'IN1').click(); await output(page, 'DS1', '0 · Low');
  // Gate inputs from the inspector stay simulatable: a third, unconnected input floats and makes AND unknown.
  await page.locator('.lec-part').filter({ hasText: 'U1' }).locator('.lec-part-hit').dblclick();
  const inputs = page.getByRole('combobox', { name: 'Gate inputs', exact: true }); if (!await inputs.isVisible()) await page.getByText('Pins & connections', { exact: true }).click();
  await inputs.selectOption('3');
  await page.getByRole('button', { name: 'Close inspector' }).click(); await toggle(page, 'IN1').click(); await output(page, 'DS1', 'X · Unknown');
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.wires.length)).toBe(3);
});
test('Simulate controls fit narrow, short and desktop panes and Build restores the drawing toolbar', async ({ page }) => {
  for (const [width, height] of [[390, 844], [320, 480], [800, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height }); await load(page); await open(page);
    await expect(strip(page).getByRole('button', { name: 'Pause', exact: true })).toBeInViewport();
    const control = toggle(page, 'B'); await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport(); await control.click(); await output(page, 'SUM', '1 · High');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await exit(page); await expect(page.locator('.lec-drawing-toolbar')).toBeVisible();
  }
  await expect(page.locator('.lec-workspace')).not.toHaveClass(/is-compact/);
});

test('native Android pause/resume suspends a document-visible WebView without changing the circuit', async ({ page }) => {
  await load(page); const before = await page.evaluate(() => JSON.stringify(window.__lec.session.getSnapshot()));
  await open(page); await signal(page, 'A', '1'); await signal(page, 'B', '0'); await output(page, 'SUM', '1 · High');
  await page.evaluate(() => document.dispatchEvent(new Event('pause')));
  expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
  await expect(state(page)).toHaveText('Paused while hidden'); await output(page, 'SUM', '–');
  await page.evaluate(() => document.dispatchEvent(new Event('resume'))); await output(page, 'SUM', '1 · High');
  expect(await snapshot(page)).toBe(before);
  await exit(page);
  await page.evaluate(() => { document.dispatchEvent(new Event('pause')); document.dispatchEvent(new Event('resume')); });
  expect(await page.evaluate(() => window.__lec.simulation.size)).toBe(0);
});

test('visible controls accept input and Run before the first intersection notification', async ({ page }) => {
  await page.addInitScript(() => {
    const Observer = window.IntersectionObserver;
    window.IntersectionObserver = class extends Observer {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { super((entries, observer) => window.setTimeout(() => callback(entries, observer), 1000), options); }
    };
  });
  await page.goto(preview); await load(page); await open(page);
  await signal(page, 'A', '1'); await signal(page, 'B', '0'); await output(page, 'SUM', '1 · High');
  await strip(page).getByRole('button', { name: 'Pause', exact: true }).click(); await strip(page).getByRole('button', { name: 'Run', exact: true }).click(); await output(page, 'SUM', '1 · High');
});
