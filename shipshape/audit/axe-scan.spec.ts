/**
 * ShipShape audit — axe-core scan across every major route.
 *
 * NOT part of the regular e2e suite. Run against an already-running dev server
 * (web on :5173, API on :3000) with a real session, NOT the isolated-env
 * fixture. Writes per-route JSON to shipshape/audit/raw/a11y/.
 *
 * Run:
 *   npx playwright test --config=shipshape/audit/axe-playwright.config.ts
 *
 * If you'd rather skip the config file, you can run directly with:
 *   npx playwright test shipshape/audit/axe-scan.spec.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve(process.cwd(), 'shipshape/audit/raw/a11y');
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  { name: 'login',          path: '/login',           requiresAuth: false },
  { name: 'my-week',        path: '/my-week',         requiresAuth: true  },
  { name: 'dashboard',      path: '/dashboard',       requiresAuth: true  },
  { name: 'docs',           path: '/docs',            requiresAuth: true  },
  { name: 'issues',         path: '/issues',          requiresAuth: true  },
  { name: 'projects',       path: '/projects',        requiresAuth: true  },
  { name: 'programs',       path: '/programs',        requiresAuth: true  },
  { name: 'team-allocation',path: '/team/allocation', requiresAuth: true  },
  { name: 'team-directory', path: '/team/directory',  requiresAuth: true  },
  { name: 'team-status',    path: '/team/status',     requiresAuth: true  },
  { name: 'team-org-chart', path: '/team/org-chart',  requiresAuth: true  },
  { name: 'settings',       path: '/settings',        requiresAuth: true  },
];

async function login(page: Page): Promise<void> {
  await page.goto('http://localhost:5173/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

interface ViolationSummary {
  id: string;
  impact: string | null | undefined;
  description: string;
  helpUrl: string;
  nodes: number;
  tags: string[];
}

test.describe('shipshape audit — a11y baseline', () => {
  test.describe.configure({ mode: 'serial' });

  for (const route of ROUTES) {
    test(`axe scan: ${route.name}`, async ({ page }) => {
      if (route.requiresAuth) await login(page);

      // Capture console errors during the page visit too — feeds Category 6.
      const consoleMessages: { type: string; text: string }[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleMessages.push({ type: msg.type(), text: msg.text() });
        }
      });

      await page.goto(`http://localhost:5173${route.path}`);
      await page.waitForLoadState('networkidle').catch(() => {
        // some routes have always-on WebSocket connections; networkidle never resolves.
      });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      const summary: ViolationSummary[] = [];
      for (const v of results.violations) {
        if (v.impact && v.impact in byImpact) {
          byImpact[v.impact as keyof typeof byImpact]++;
        }
        summary.push({
          id: v.id,
          impact: v.impact,
          description: v.description,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length,
          tags: v.tags,
        });
      }

      const payload = {
        route: route.path,
        url: page.url(),
        scannedAt: new Date().toISOString(),
        totals: { violations: results.violations.length, ...byImpact },
        violations: summary,
        consoleErrors: consoleMessages,
      };

      writeFileSync(resolve(OUT_DIR, `${route.name}.json`), JSON.stringify(payload, null, 2));
      console.log(
        `  [${route.name}] viol=${results.violations.length} ` +
        `crit=${byImpact.critical} ser=${byImpact.serious} ` +
        `mod=${byImpact.moderate} min=${byImpact.minor} console=${consoleMessages.length}`
      );
    });
  }
});
