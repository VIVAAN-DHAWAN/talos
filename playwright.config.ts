import { defineConfig } from '@playwright/test';

/**
 * Playwright config for OmniLoop smoke tests.
 *
 * The webServer block boots the built app (dist/server.js) in headless mode
 * before the tests run, and tears it down afterwards. In CI we never reuse an
 * existing server so each pipeline gets a clean boot.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node dist/server.js',
    url: 'http://127.0.0.1:3000/health',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
});
