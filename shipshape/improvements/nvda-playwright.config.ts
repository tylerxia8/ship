import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'nvda-walkthrough.spec.ts',
  fullyParallel: false,
  workers: 1,         // NVDA is a single-tenant binary; must run serially.
  retries: 0,
  reporter: [['line']],
  timeout: 120_000,   // NVDA spinning up + per-utterance settling adds time.
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    headless: false,  // NVDA reads what Chrome RENDERS — headless mode hides
                      // the accessibility tree from screen readers. The
                      // visible browser is required.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
