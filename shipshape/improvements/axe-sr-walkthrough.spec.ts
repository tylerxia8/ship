/**
 * Screen-reader-focused axe scan for the Cat 7 manual-NVDA brief clause.
 *
 * The default audit scan used the four WCAG tags (wcag2a/aa + wcag21a/aa) and
 * cleared every Critical/Serious violation. But the brief also asks "test
 * with a screen reader — can you understand the page structure and interact
 * with all controls?". axe can't drive NVDA, but it can verify the
 * structural prerequisites a screen reader depends on:
 *
 *   - landmark-one-main, landmark-unique  (landmarks are present and unique)
 *   - region                              (every content area lives inside a landmark)
 *   - heading-order, page-has-heading-one (heading hierarchy)
 *   - label, label-title-only             (form fields have labels)
 *   - button-name, link-name              (interactive elements have accessible names)
 *   - aria-*                              (ARIA attributes used correctly)
 *   - bypass                              (skip-link or main landmark to bypass nav)
 *
 * These are mostly in axe's "best-practice" tag, NOT WCAG. So the default
 * scan didn't include them. This spec adds best-practice + cat.semantics +
 * cat.aria to surface anything a screen-reader user would notice.
 *
 * Per-route JSON output at shipshape/improvements/raw/a11y-sr/<route>.json
 * — same format as the audit scan, but with the broader rule set.
 */
import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve(process.cwd(), 'shipshape/improvements/raw/a11y-sr');
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

async function login(page: any) {
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'dev@ship.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*\/login).*/, { timeout: 10_000 });
}

test.describe('axe sr-walkthrough — screen-reader structural prerequisites', () => {
  test.describe.configure({ mode: 'serial' });

  for (const route of ROUTES) {
    test(`sr scan: ${route.name}`, async ({ page }) => {
      if (route.requiresAuth) await login(page);
      await page.goto(`http://localhost:5173${route.path}`);
      // Let the SPA hydrate
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      const results = await new AxeBuilder({ page })
        .withTags([
          'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa',
          'best-practice',     // landmark-one-main, region, heading-order, etc.
          'cat.semantics',
          'cat.aria',
          'cat.language',
          'cat.name-role-value',
          'cat.structure',
        ])
        .analyze();

      // Filter for SR-relevant rules — narrows from ~90 axe rules to ~20 the
      // brief actually cares about for "can you understand and interact?"
      const SR_RULE_IDS = new Set([
        'landmark-one-main', 'landmark-unique', 'landmark-complementary-is-top-level',
        'landmark-main-is-top-level', 'landmark-no-duplicate-banner', 'landmark-no-duplicate-contentinfo',
        'region',
        'page-has-heading-one', 'heading-order', 'empty-heading',
        'label', 'label-title-only', 'form-field-multiple-labels',
        'button-name', 'link-name', 'input-button-name', 'input-image-alt',
        'image-alt', 'image-redundant-alt', 'role-img-alt',
        'aria-allowed-attr', 'aria-allowed-role', 'aria-command-name',
        'aria-hidden-body', 'aria-hidden-focus', 'aria-input-field-name',
        'aria-required-attr', 'aria-required-children', 'aria-required-parent',
        'aria-roles', 'aria-toggle-field-name', 'aria-tooltip-name',
        'aria-valid-attr', 'aria-valid-attr-value', 'aria-progressbar-name',
        'bypass',
        'document-title', 'html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch',
        'duplicate-id-aria',
        'list', 'listitem', 'definition-list', 'dlitem',
        'th-has-data-cells', 'td-headers-attr', 'scope-attr-valid', 'table-fake-caption',
        'select-name', 'select-no-empty', 'tabindex',
      ]);

      const srViolations = results.violations.filter(v => SR_RULE_IDS.has(v.id));

      const out = {
        route: route.path,
        url: page.url(),
        scannedAt: new Date().toISOString(),
        totals: {
          violations: srViolations.length,
          critical: srViolations.filter(v => v.impact === 'critical').length,
          serious:  srViolations.filter(v => v.impact === 'serious').length,
          moderate: srViolations.filter(v => v.impact === 'moderate').length,
          minor:    srViolations.filter(v => v.impact === 'minor').length,
        },
        srViolations: srViolations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          nodes: v.nodes.length,
          firstFailingSelector: v.nodes[0]?.target?.[0] ?? null,
        })),
      };

      writeFileSync(resolve(OUT_DIR, `${route.name}.json`), JSON.stringify(out, null, 2));
      console.log(
        `  [${route.name}] sr-viol=${out.totals.violations} ` +
        `crit=${out.totals.critical} ser=${out.totals.serious} ` +
        `mod=${out.totals.moderate} min=${out.totals.minor}`
      );
    });
  }
});
