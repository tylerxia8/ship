/**
 * Playwright config for the shipshape audit a11y scan.
 *
 * Standalone from the project's playwright.config.ts so it does NOT pull in
 * the testcontainers-based isolated-env fixture. Runs against the already-up
 * dev server at localhost:5173 / localhost:3000.
 *
 * Use:
 *   npx playwright test --config=shipshape/audit/axe-playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'axe-scan.spec.ts',
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
