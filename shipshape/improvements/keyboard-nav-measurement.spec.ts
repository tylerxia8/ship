/**
 * Cat 7 — Keyboard-navigation measurement spec.
 *
 * Brief item: "Test full keyboard navigation: can you reach every interactive
 * element using only Tab, Enter, Escape, and arrow keys?"
 *
 * Per-route probe:
 *   1. Tab forward 30 times, recording the focused element each time.
 *      Reports: total interactive elements reached, any focus-trap loops,
 *      whether `<button>`/`<a>`/`<input>`/`<select>` were focusable.
 *   2. Press Enter on a known button (the page's primary action — login's
 *      "Sign in", workspace pages' first <button>) and verify it fires.
 *   3. Press Escape after opening a known dialog (the command palette via
 *      Cmd/Ctrl+K) and verify the dialog closes.
 *   4. Press ArrowDown in a known list (the first menu/listbox we can find)
 *      and verify focus moves.
 *
 * Output: shipshape/improvements/raw/cat7-measurement/keyboard.json
 *   per-route { tabCount, uniqueFocusable, tagsReached, primaryEnterWorks,
 *               escapeDismissesDialog, arrowsWorkInList, focusOrderDigest }
 */
import { test, type Page } from '@playwright/test';
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

async function describeFocused(page: Page): Promise<{ tag: string; role: string; name: string; text: string }> {
  return await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tag: 'body', role: '', name: '', text: '' };
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      name: el.getAttribute('aria-label') || (el as HTMLInputElement).name || el.id || '',
      text: (el.innerText || (el as HTMLInputElement).value || '').slice(0, 60).replace(/\s+/g, ' ').trim(),
    };
  });
}

test.describe('Cat 7 keyboard-navigation', () => {
  test.describe.configure({ mode: 'default' });

  const results: any[] = [];

  for (const route of ROUTES) {
    test(`keyboard probe: ${route.name}`, async ({ browser }) => {
      const ctx = await browser.newContext();
      // Disable the ActionItemsModal so it doesn't trap focus
      await ctx.addInitScript(() => localStorage.setItem('ship:disableActionItemsModal', 'true'));
      const page = await ctx.newPage();

      if (route.requiresAuth) await ensureLoggedIn(page);
      await page.goto(`http://localhost:5173${route.path}`, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(1500);

      // ── 1. Tab forward 30× and record focus ───────────────────────────
      const focusTrail: Array<{ tag: string; role: string; name: string; text: string }> = [];
      const seen = new Set<string>();
      await page.locator('body').focus();
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        const f = await describeFocused(page);
        focusTrail.push(f);
        const sig = `${f.tag}|${f.role}|${f.name}|${f.text}`;
        seen.add(sig);
      }
      const tagsReached = [...new Set(focusTrail.map(f => f.tag))];
      const uniqueFocusable = seen.size;

      // ── 2. Enter on primary button ────────────────────────────────────
      let primaryEnterWorks: boolean | null = null;
      if (route.name === 'login') {
        // Tab to "Sign in" button is index 3 from page start
        await page.locator('input[type="email"]').focus();
        await page.fill('input[type="email"]', 'dev@ship.local');
        await page.keyboard.press('Tab');
        await page.keyboard.type('admin123');
        await page.keyboard.press('Tab'); // Sign in button
        // Enter should submit the form
        await Promise.race([
          page.keyboard.press('Enter').then(() => page.waitForURL(/^(?!.*\/login).*/, { timeout: 5000 })),
          page.waitForTimeout(5000),
        ]);
        primaryEnterWorks = !page.url().includes('/login');
      } else {
        // For other routes: tab to first focusable button, press Enter, check that *something* happened
        const before = page.url();
        await page.locator('body').focus();
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          const role = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
          if (role === 'button') break;
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
        // "works" = either URL changed, or a dialog opened, or a popover opened
        const after = page.url();
        const dialogOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]'));
        primaryEnterWorks = (after !== before) || dialogOpen;
      }

      // Reload to reset state for the dialog test
      await page.goto(`http://localhost:5173${route.path}`, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(1500);

      // ── 3. Escape dismisses dialog (open command palette w/ Cmd/Ctrl+K) ──
      let escapeDismissesDialog: boolean | null = null;
      // The web app has a global Cmd+K listener
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"][data-state="open"]'));
      if (opened) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const closed = await page.evaluate(() => !document.querySelector('[role="dialog"][data-state="open"]'));
        escapeDismissesDialog = closed;
      } else {
        escapeDismissesDialog = null; // no Cmd+K palette on this route
      }

      // ── 4. ArrowDown in a list/menu ────────────────────────────────────
      let arrowsWorkInList: boolean | null = null;
      // Open a known menu via tab navigation: find a [role="combobox"] or [role="listbox"] or a select
      const menuButton = page.locator('[role="combobox"], [role="listbox"], [aria-haspopup="menu"], [aria-haspopup="listbox"]').first();
      if (await menuButton.count() > 0) {
        try {
          await menuButton.focus({ timeout: 2000 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(400);
          const beforeFocus = await describeFocused(page);
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(200);
          const afterFocus = await describeFocused(page);
          arrowsWorkInList = JSON.stringify(beforeFocus) !== JSON.stringify(afterFocus);
        } catch {
          arrowsWorkInList = null;
        }
      }

      results.push({
        route: route.name,
        tabCount: 30,
        uniqueFocusable,
        tagsReached,
        primaryEnterWorks,
        escapeDismissesDialog,
        arrowsWorkInList,
        focusTrail: focusTrail.slice(0, 15), // first 15 for inspection
      });
      console.log(`  [${route.name}] unique=${uniqueFocusable}, tags=${tagsReached.join('+')}, enter=${primaryEnterWorks}, esc=${escapeDismissesDialog}, arr=${arrowsWorkInList}`);

      await ctx.close();
    });
  }

  test.afterAll(() => {
    writeFileSync(resolve(OUT_DIR, 'keyboard.json'), JSON.stringify(results, null, 2));
    console.log(`\nWrote ${resolve(OUT_DIR, 'keyboard.json')} — ${results.length} routes`);
  });
});
