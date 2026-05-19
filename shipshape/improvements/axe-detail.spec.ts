/**
 * Detailed axe scan — emits per-node selector + actual/expected color contrast
 * for routes that failed the audit baseline. Use to locate the specific
 * elements that need to change.
 *
 * Run:
 *   npx playwright test --config=shipshape/audit/axe-playwright.config.ts shipshape/improvements/axe-detail.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve(process.cwd(), 'shipshape/improvements/raw');
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  { name: 'dashboard',       path: '/dashboard' },
  { name: 'my-week',         path: '/my-week' },
  { name: 'projects',        path: '/projects' },
  { name: 'team-allocation', path: '/team/allocation' },
  { name: 'team-status',     path: '/team/status' },
];

async function login(page: Page): Promise<void> {
  await page.goto('http://localhost:5173/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

test.describe.configure({ mode: 'serial' });
test.describe('axe detail — color-contrast', () => {
  for (const route of ROUTES) {
    test(`detail: ${route.name}`, async ({ page }) => {
      await login(page);
      await page.goto(`http://localhost:5173${route.path}`);
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const cc = results.violations.find(v => v.id === 'color-contrast');
      if (!cc) {
        writeFileSync(resolve(OUT_DIR, `${route.name}-detail.json`), JSON.stringify({ route: route.path, contrastNodes: 0 }, null, 2));
        return;
      }

      const detail = cc.nodes.map(n => ({
        target: n.target,
        html: n.html.slice(0, 200),
        failureSummary: n.failureSummary,
        any: n.any.map(a => ({
          id: a.id,
          message: a.message,
          data: a.data,
        })),
      }));

      writeFileSync(
        resolve(OUT_DIR, `${route.name}-detail.json`),
        JSON.stringify({ route: route.path, contrastNodes: detail.length, nodes: detail }, null, 2)
      );
      console.log(`  [${route.name}] ${detail.length} contrast failures`);
    });
  }
});
