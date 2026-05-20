/**
 * Cat 7 — full WCAG 2.1 AA axe-core scan with severity categorization.
 *
 * Differs from the SR-filtered scan in axe-sr-walkthrough.spec.ts in two ways:
 *   1. NO rule filtering — reports every WCAG 2.1 AA violation
 *   2. Categorizes by axe's impact field (critical/serious/moderate/minor)
 *
 * Output: shipshape/improvements/raw/cat7-measurement/axe-wcag.json
 *   { route → { totals, byImpact, violations[] } }
 */
import { test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve(process.cwd(), 'shipshape/improvements/raw/cat7-measurement');
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  { name: 'login',           path: '/login',           requiresAuth: false },
  { name: 'my-week',         path: '/my-week',         requiresAuth: true  },
  { name: 'dashboard',       path: '/dashboard',       requiresAuth: true  },
  { name: 'docs',            path: '/docs',            requiresAuth: true  },
  { name: 'issues',          path: '/issues',          requiresAuth: true  },
  { name: 'projects',        path: '/projects',        requiresAuth: true  },
  { name: 'programs',        path: '/programs',        requiresAuth: true  },
  { name: 'team-allocation', path: '/team/allocation', requiresAuth: true  },
  { name: 'team-directory',  path: '/team/directory',  requiresAuth: true  },
  { name: 'team-status',     path: '/team/status',     requiresAuth: true  },
  { name: 'team-org-chart',  path: '/team/org-chart',  requiresAuth: true  },
  { name: 'settings',        path: '/settings',        requiresAuth: true  },
];

async function ensureLoggedIn(page: Page): Promise<void> {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 3000 });
    await page.fill('input[type="email"]', 'dev@ship.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(?!.*\/login).*/, { timeout: 10_000 });
  } catch { /* already logged in */ }
}

test.describe('Cat 7 axe full WCAG 2.1 AA', () => {
  test.describe.configure({ mode: 'default' });

  const allRoutes: any[] = [];

  for (const route of ROUTES) {
    test(`wcag scan: ${route.name}`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => localStorage.setItem('ship:disableActionItemsModal', 'true'));
      const page = await ctx.newPage();
      if (route.requiresAuth) await ensureLoggedIn(page);
      await page.goto(`http://localhost:5173${route.path}`, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(1500);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const byImpact = {
        critical: results.violations.filter(v => v.impact === 'critical'),
        serious:  results.violations.filter(v => v.impact === 'serious'),
        moderate: results.violations.filter(v => v.impact === 'moderate'),
        minor:    results.violations.filter(v => v.impact === 'minor'),
      };

      const out = {
        route: route.path,
        scannedAt: new Date().toISOString(),
        totals: {
          violations: results.violations.length,
          critical: byImpact.critical.length,
          serious:  byImpact.serious.length,
          moderate: byImpact.moderate.length,
          minor:    byImpact.minor.length,
          nodes: results.violations.reduce((s, v) => s + v.nodes.length, 0),
        },
        violations: results.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length,
          firstFailingSelector: v.nodes[0]?.target?.[0] ?? null,
        })),
      };

      allRoutes.push({ name: route.name, ...out });
      console.log(`  [${route.name}] viol=${out.totals.violations} crit=${out.totals.critical} ser=${out.totals.serious} mod=${out.totals.moderate} min=${out.totals.minor} (nodes=${out.totals.nodes})`);

      await ctx.close();
    });
  }

  test.afterAll(() => {
    writeFileSync(resolve(OUT_DIR, 'axe-wcag.json'), JSON.stringify(allRoutes, null, 2));
    console.log(`\nWrote ${resolve(OUT_DIR, 'axe-wcag.json')} — ${allRoutes.length} routes`);
  });
});
