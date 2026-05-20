import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'axe-wcag-measurement.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
