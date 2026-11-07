import { expect, test, type Page } from '@playwright/test';

const preview = new URL('../../dev/preview.html', import.meta.url).href;
type Sample = { type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture'; id: number; x: number; y: number };
type Camera = { x: number; y: number; zoom: number };
test.beforeEach(async ({ page }) => { await page.goto(preview); await expect(page.getByTestId('editor')).toBeVisible(); await page.getByRole('button', { name: 'Reset zoom' }).click(); });

async function camera(page: Page): Promise<Camera> {
  return page.locator('.lec-canvas > g[transform]').evaluate(element => {
    const values = element.getAttribute('transform')!.match(/translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)/)!;
    return { x: Number(values[1]), y: Number(values[2]), zoom: Number(values[3]) };
  });
}
function expectCamera(actual: Camera, expected: Camera) {
  expect(actual.x).toBeCloseTo(expected.x, 6); expect(actual.y).toBeCloseTo(expected.y, 6); expect(actual.zoom).toBeCloseTo(expected.zoom, 6);
}
async function samples(page: Page, events: Sample[]) {
  await page.locator('.lec-canvas').evaluate(async (element, events) => {
    // Deterministic same-frame playback; native pointer capture is covered by CDP below.
    element.setPointerCapture = () => {};
    const rect = element.getBoundingClientRect();
    for (const event of events) element.dispatchEvent(new PointerEvent(event.type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: event.id, button: 0, clientX: rect.x + event.x, clientY: rect.y + event.y }));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, events);
}
const sample = (type: Sample['type'], id: number, x: number, y = 200): Sample => ({ type, id, x, y });

test('both fingers update within a frame; pinch reverses and follows its midpoint without editing', async ({ page }) => {
  const initial = await camera(page);
  await samples(page, [sample('pointerdown', 1, 80), sample('pointerdown', 2, 280), sample('pointermove', 1, 130), sample('pointermove', 2, 230)]);
  expectCamera(await camera(page), { x: 180 + (initial.x - 180) / 2, y: 200 + (initial.y - 200) / 2, zoom: .5 });
  await samples(page, [sample('pointermove', 1, 80), sample('pointermove', 2, 280)]);
  expectCamera(await camera(page), initial);
  await samples(page, [sample('pointermove', 1, 100, 240), sample('pointermove', 2, 300, 240)]);
  expectCamera(await camera(page), { ...initial, x: initial.x + 20, y: initial.y + 40 });
  await samples(page, [sample('pointerup', 1, 100, 240), sample('pointerup', 2, 300, 240)]);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(0);
});

test('lifting either finger continues panning and permits another pinch', async ({ page }) => {
  for (const lifted of [1, 2]) {
    const remaining = lifted === 1 ? 2 : 1;
    await samples(page, [sample('pointerdown', 1, 80), sample('pointerdown', 2, 280), sample('pointermove', 1, 130), sample('pointermove', 2, 230)]);
    const pinched = await camera(page), liftedX = lifted === 1 ? 130 : 230, remainingX = remaining === 1 ? 130 : 230;
    await samples(page, [sample('pointerup', lifted, liftedX), sample('lostpointercapture', lifted, liftedX), sample('pointermove', remaining, remainingX + 30, 240)]);
    const panned = { ...pinched, x: pinched.x + 30, y: pinched.y + 40 };
    expectCamera(await camera(page), panned);
    await samples(page, [sample('pointerdown', 3, remainingX + 130, 240), sample('pointermove', 3, remainingX + 230, 240)]);
    expect((await camera(page)).zoom).toBeCloseTo(panned.zoom * 2, 6);
    await samples(page, [sample('pointerup', remaining, remainingX + 30, 240), sample('lostpointercapture', remaining, remainingX + 30, 240), sample('pointerup', 3, remainingX + 230, 240)]);
  }
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(0);
});

test('pending pan and pinch samples are flushed before another finger lands or lifts', async ({ page }) => {
  const initial = await camera(page);
  await samples(page, [sample('pointerdown', 1, 60), sample('pointermove', 1, 100, 220), sample('pointerdown', 2, 300, 220), sample('pointermove', 1, 150, 220), sample('pointermove', 2, 250, 220), sample('pointerup', 2, 250, 220), sample('lostpointercapture', 2, 250, 220), sample('pointermove', 1, 170, 240)]);
  expectCamera(await camera(page), { x: 200 + (initial.x + 40 - 200) / 2 + 20, y: 220 + (initial.y + 20 - 220) / 2 + 20, zoom: .5 });
  await samples(page, [sample('pointerup', 1, 170, 240)]);
});

test('canceling a pinch clears pending movement and the next drag starts normally', async ({ page }) => {
  await samples(page, [sample('pointerdown', 1, 80), sample('pointerdown', 2, 280)]);
  const before = await camera(page);
  await samples(page, [sample('pointermove', 1, 130), sample('pointermove', 2, 230), sample('pointercancel', 1, 130), sample('pointercancel', 2, 230)]);
  expectCamera(await camera(page), before);
  await samples(page, [sample('pointerdown', 4, 100), sample('pointermove', 4, 140, 250), sample('pointerup', 4, 140, 250)]);
  expectCamera(await camera(page), { ...before, x: before.x + 40, y: before.y + 50 });
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().revision)).toBe(0);
});

test('pinching while placing a part does not place it on release', async ({ page }) => {
  await page.getByRole('button', { name: 'Electrical parts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('Resistor');
  await page.getByRole('button', { name: 'Resistor Passive', exact: true }).click();
  await samples(page, [sample('pointerdown', 1, 80), sample('pointerdown', 2, 280), sample('pointermove', 1, 130), sample('pointermove', 2, 230)]);
  await samples(page, [sample('pointerup', 1, 130), sample('lostpointercapture', 1, 130), sample('pointermove', 2, 260, 230), sample('pointerup', 2, 260, 230)]);
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(0);
  await page.getByRole('application').click({ position: { x: 180, y: 240 } });
  expect(await page.evaluate(() => window.__lec.session.getSnapshot().document.components.length)).toBe(1);
});

test('canvas consumes host touch, gesture and wheel events while toolbar touches remain available', async ({ page }) => {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('.lec-canvas')!, editor = document.querySelector('.lec-editor')!, viewport = canvas.parentElement!;
    const received: string[] = [], receive = (event: Event) => received.push(event.type);
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend', 'wheel'];
    for (const type of types) editor.parentElement!.addEventListener(type, receive);
    const canceled = types.map(type => !canvas.dispatchEvent(type === 'wheel' ? new WheelEvent(type, { bubbles: true, cancelable: true, deltaY: -100, clientX: 100, clientY: 200 }) : new Event(type, { bubbles: true, cancelable: true })));
    const leaked = [...received];
    document.querySelector('.lec-topbar button')!.dispatchEvent(new Event('touchstart', { bubbles: true }));
    for (const type of types) editor.parentElement!.removeEventListener(type, receive);
    return { canceled, leaked, toolbar: received, touchAction: viewport.style.touchAction, ignoreSwipe: viewport.dataset.ignoreSwipe };
  });
  expect(result.canceled.every(Boolean)).toBe(true); expect(result.leaked).toEqual([]); expect(result.toolbar).toEqual(['touchstart']);
  // Obsidian's swipe recognizer checks inline touchAction / data-ignore-swipe on ancestors.
  expect(result.touchAction).toBe('none'); expect(result.ignoreSwipe).toBe('true');
});

test('native touch swipe and pinch retain capture through finger lift', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP supplies native Android-style multi-touch input.');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const rect = (await page.getByRole('application').boundingBox())!;
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { id: number; x: number; y: number }[]) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, x: rect.x + p.x, y: rect.y + p.y })) });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  const initial = await camera(page);
  await touch('touchStart', [{ id: 1, x: 80, y: 200 }]);
  await touch('touchMove', [{ id: 1, x: 120, y: 240 }]);
  await touch('touchEnd', []);
  expectCamera(await camera(page), { ...initial, x: initial.x + 40, y: initial.y + 40 });
  const panned = await camera(page);
  await touch('touchStart', [{ id: 1, x: 80, y: 200 }, { id: 2, x: 280, y: 200 }]);
  await touch('touchMove', [{ id: 1, x: 130, y: 200 }, { id: 2, x: 230, y: 200 }]);
  expectCamera(await camera(page), { x: 180 + (panned.x - 180) / 2, y: 200 + (panned.y - 200) / 2, zoom: .5 });
  const pinched = await camera(page);
  // Chromium accepts the released point here to end one finger while retaining the other.
  await touch('touchEnd', [{ id: 1, x: 130, y: 200 }]);
  await touch('touchMove', [{ id: 2, x: 260, y: 240 }]);
  expectCamera(await camera(page), { ...pinched, x: pinched.x + 30, y: pinched.y + 40 });
  await touch('touchEnd', []);
  expect(await page.evaluate(() => ({ scale: window.visualViewport!.scale, revision: window.__lec.session.getSnapshot().revision }))).toEqual({ scale: 1, revision: 0 });
  await cdp.detach();
});
