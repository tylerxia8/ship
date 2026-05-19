/**
 * Playwright config for the shipshape detail axe scan.
 * Runs against the dev server at localhost:5173 / localhost:3000.
 *
 * Use:
 *   npx playwright test --config=shipshape/improvements/axe-detail-playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'axe-detail.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
