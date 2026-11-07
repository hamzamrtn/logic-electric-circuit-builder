import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'android-tablet', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true } },
    { name: 'android-phone', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-touch', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
});
