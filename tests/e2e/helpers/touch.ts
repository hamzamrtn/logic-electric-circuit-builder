import type { BrowserContext, Page } from '@playwright/test';

export async function nativeTouch(page: Page, context: BrowserContext) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return {
    async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { id: number; x: number; y: number }[]) {
      const rect = (await page.getByRole('application').boundingBox())!;
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, x: rect.x + p.x, y: rect.y + p.y })) });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    },
    close: () => cdp.detach(),
  };
}
