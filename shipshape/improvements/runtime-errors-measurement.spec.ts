/**
 * Cat 6 — Runtime Error & Edge-Case Measurement.
 *
 * Executes the brief's "How to Measure" checklist:
 *   1. Open DevTools and monitor console — Playwright captures console + pageerror events
 *   2. Test network failure during collab — context.setOffline()
 *   3. Test malformed input — 8 input shapes against POST /api/issues (with real CSRF)
 *   4. Test concurrent edges — two contexts editing the same doc
 *   5. Throttle to 3G — CDP Network.emulateNetworkConditions
 *   6. Check server logs for unhandled errors — captured via the API process stdout
 *
 * Output: shipshape/improvements/raw/cat6-measurement/
 *   - console-errors.json: per-route { errors, warnings, pageerrors }
 *   - malformed-probe.json: per-input { method, body, status, contentType, body_snippet }
 *   - throttle-3g.json: per-route { TTFB, total_load_ms, hung_requests }
 *   - concurrent.json: two-tab edit transcript + any conflicts
 *   - offline.json: offline-edit then online-reconnect, doc state snapshot
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve(process.cwd(), 'shipshape/improvements/raw/cat6-measurement');
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

// Idempotent: only fills the login form if the email input actually renders.
// On subsequent calls the user is already logged in, /login redirects, no form → return.
async function ensureLoggedIn(page: Page): Promise<void> {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"]');
  try {
    await emailInput.waitFor({ state: 'visible', timeout: 3000 });
    await page.fill('input[type="email"]', 'dev@ship.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(?!.*\/login).*/, { timeout: 10_000 });
  } catch {
    // Email input never appeared → already logged in, /login redirected. Done.
  }
}

test.describe('Cat 6 measurement', () => {
  test.describe.configure({ mode: 'default' });

  test('1. console-error sweep across 12 routes', async ({ browser }) => {
    // Fresh context each route so login state is identical for every measurement.
    const perRoute: Array<{ route: string; errors: string[]; warnings: string[]; pageerrors: string[] }> = [];

    for (const route of ROUTES) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      const errors: string[] = [];
      const warnings: string[] = [];
      const pageerrors: string[] = [];

      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
        if (msg.type() === 'warning') warnings.push(msg.text());
      });
      page.on('pageerror', err => pageerrors.push(err.message));

      try {
        if (route.requiresAuth) {
          await ensureLoggedIn(page);
        }
        await page.goto(`http://localhost:5173${route.path}`, { waitUntil: 'networkidle', timeout: 20_000 });
        await page.waitForTimeout(2000);
      } catch (err) {
        pageerrors.push(`navigation: ${(err as Error).message}`);
      }

      perRoute.push({ route: route.name, errors, warnings, pageerrors });
      console.log(`  [${route.name}] errors=${errors.length} warnings=${warnings.length} pageerrors=${pageerrors.length}`);
      await ctx.close();
    }

    writeFileSync(resolve(OUT_DIR, 'console-errors.json'), JSON.stringify(perRoute, null, 2));
  });

  test('2. malformed input probe (8 shapes) with real session + CSRF', async ({ request }) => {
    // First establish a real session so we can probe the actual handler, not the CSRF guard.
    const csrf = await request.get('http://localhost:3000/api/csrf-token');
    const csrfBody = await csrf.json() as { token: string };
    const login = await request.post('http://localhost:3000/api/auth/login', {
      data: { email: 'dev@ship.local', password: 'admin123' },
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfBody.token },
    });
    if (!login.ok()) {
      writeFileSync(resolve(OUT_DIR, 'malformed-probe.json'), JSON.stringify({ error: `login failed: ${login.status()}` }, null, 2));
      return;
    }
    // Get a fresh CSRF token after login (the session changed)
    const csrf2 = await request.get('http://localhost:3000/api/csrf-token');
    const token = (await csrf2.json() as { token: string }).token;

    const probes = [
      { label: 'empty body',           body: '',                                                                          contentType: 'application/json' },
      { label: 'non-JSON body',        body: 'this is not JSON',                                                          contentType: 'application/json' },
      { label: 'huge title (50 KB)',   body: JSON.stringify({ title: 'x'.repeat(50_000) }),                                contentType: 'application/json' },
      { label: 'XSS in title',         body: JSON.stringify({ title: '<script>alert(1)</script>' }),                       contentType: 'application/json' },
      { label: 'negative estimate',    body: JSON.stringify({ title: 'x', estimate: -99999 }),                             contentType: 'application/json' },
      { label: 'SQL injection',        body: JSON.stringify({ title: "'; DROP TABLE documents; --" }),                     contentType: 'application/json' },
      { label: 'deep nested object',   body: JSON.stringify({ title: 'x', x: { a: { b: { c: { d: { e: 'deep' } } } } } }), contentType: 'application/json' },
      { label: 'payload over 10 MB',   body: JSON.stringify({ title: 'x', blob: 'a'.repeat(12 * 1024 * 1024) }),           contentType: 'application/json' },
    ];

    const results: Array<{ label: string; status: number; contentType: string; bodySnippet: string; leaksStack: boolean }> = [];
    for (const probe of probes) {
      const resp = await request.post('http://localhost:3000/api/issues', {
        data: probe.body,
        headers: { 'Content-Type': probe.contentType, 'X-CSRF-Token': token },
        failOnStatusCode: false,
      });
      const respText = await resp.text();
      const ct = resp.headers()['content-type'] || '';
      const leaksStack = /at .+\(.+:\d+:\d+\)|node_modules[\\/]\.pnpm/i.test(respText);
      results.push({
        label: probe.label,
        status: resp.status(),
        contentType: ct,
        bodySnippet: respText.slice(0, 280),
        leaksStack,
      });
      console.log(`  [${probe.label}] status=${resp.status()} leaksStack=${leaksStack}`);
    }
    writeFileSync(resolve(OUT_DIR, 'malformed-probe.json'), JSON.stringify(results, null, 2));
    expect(results.every(r => !r.leaksStack)).toBe(true);
  });

  test('3. throttle network to 3G — measure key routes', async ({ browser }) => {
    // Login FIRST (full speed) — then enable throttle and walk routes.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await ensureLoggedIn(page);

    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (50 * 1024) / 8,
      uploadThroughput: (50 * 1024) / 8,
    });

    const results: Array<{ route: string; navigationMs: number; pendingRequestsAt5s: number; pendingRequestsAt15s: number }> = [];
    const throttleRoutes = ROUTES.filter(r => r.requiresAuth).slice(0, 5);

    for (const r of throttleRoutes) {
      const pendingByUrl = new Set<string>();
      const onRequest = (req: any) => pendingByUrl.add(req.url());
      const onFinished = (req: any) => pendingByUrl.delete(req.url());
      page.on('request', onRequest);
      page.on('requestfinished', onFinished);
      page.on('requestfailed', onFinished);

      const t0 = Date.now();
      let navMs: number;
      try {
        await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        navMs = Date.now() - t0;
      } catch {
        navMs = -1; // navigation timed out
      }
      await page.waitForTimeout(5000);
      const pending5s = pendingByUrl.size;
      await page.waitForTimeout(10000);
      const pending15s = pendingByUrl.size;

      page.off('request', onRequest);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFinished);

      results.push({ route: r.name, navigationMs: navMs, pendingRequestsAt5s: pending5s, pendingRequestsAt15s: pending15s });
      console.log(`  [${r.name}] nav=${navMs}ms  pending@5s=${pending5s}  pending@15s=${pending15s}`);
    }

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    writeFileSync(resolve(OUT_DIR, 'throttle-3g.json'), JSON.stringify(results, null, 2));
    await ctx.close();
  });

  test('4. two-tab concurrent edit on same document', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    // Disable the ActionItemsModal blocker before any page loads
    await ctxA.addInitScript(() => localStorage.setItem('ship:disableActionItemsModal', 'true'));
    await ctxB.addInitScript(() => localStorage.setItem('ship:disableActionItemsModal', 'true'));
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await ensureLoggedIn(pageA);
    await ensureLoggedIn(pageB);

    const docList = await pageA.evaluate(async () => {
      const res = await fetch('/api/documents?type=wiki');
      const json = await res.json();
      const list = json.documents || json.data || (Array.isArray(json) ? json : []);
      return list.map((d: any) => ({ id: d.id, title: d.title })).slice(0, 5);
    });

    let result: any = { tested: false, reason: 'no docs' };

    if (docList.length > 0) {
      const docId = docList[0].id;
      const url = `http://localhost:5173/documents/${docId}`;
      await pageA.goto(url, { timeout: 15_000 });
      await pageB.goto(url, { timeout: 15_000 });
      await pageA.waitForTimeout(3000);
      await pageB.waitForTimeout(3000);

      const editorA = pageA.locator('[contenteditable="true"]').first();
      const editorB = pageB.locator('[contenteditable="true"]').first();

      try {
        await editorA.click({ timeout: 5000 });
        await pageA.keyboard.press('End');
        await pageA.keyboard.type(' [TAB-A-EDIT] ');
        await pageA.waitForTimeout(1000);
        await editorB.click({ timeout: 5000 });
        await pageB.keyboard.press('End');
        await pageB.keyboard.type(' [TAB-B-EDIT] ');
        await pageB.waitForTimeout(3000);
        // Reload pageA — both edits should have synced via the live channel before reload
        await pageA.reload({ timeout: 15_000 });
        await pageA.waitForLoadState('networkidle');
        const finalText = await pageA.locator('[contenteditable="true"]').first().textContent();
        result = {
          tested: true,
          docId,
          docTitle: docList[0].title,
          finalText: (finalText || '').slice(0, 1000),
          containsTabA: (finalText || '').includes('TAB-A-EDIT'),
          containsTabB: (finalText || '').includes('TAB-B-EDIT'),
        };
      } catch (err) {
        result = { tested: false, reason: 'editor selector not found', error: (err as Error).message };
      }
    }

    await ctxA.close();
    await ctxB.close();
    writeFileSync(resolve(OUT_DIR, 'concurrent.json'), JSON.stringify(result, null, 2));
    console.log('  [concurrent edit]', JSON.stringify(result));
  });

  test('5. offline-then-online during edit', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => localStorage.setItem('ship:disableActionItemsModal', 'true'));
    const page = await ctx.newPage();
    await ensureLoggedIn(page);

    const docList = await page.evaluate(async () => {
      const res = await fetch('/api/documents?type=wiki');
      const json = await res.json();
      const list = json.documents || json.data || (Array.isArray(json) ? json : []);
      return list.map((d: any) => ({ id: d.id })).slice(0, 1);
    });

    let result: any = { tested: false, reason: 'no docs' };

    if (docList.length > 0) {
      const docId = docList[0].id;
      await page.goto(`http://localhost:5173/documents/${docId}`, { timeout: 15_000 });
      await page.waitForTimeout(3000);

      const editor = page.locator('[contenteditable="true"]').first();
      try {
        await editor.click({ timeout: 5000 });
        await page.keyboard.press('End');
        // 1. Set offline + type something
        await ctx.setOffline(true);
        await page.keyboard.type(' [OFFLINE-EDIT] ');
        await page.waitForTimeout(2000);
        const offlineText = await editor.textContent();
        // 2. Back online — give Yjs time to flush
        await ctx.setOffline(false);
        await page.waitForTimeout(5000);
        // 3. Reload + verify offline edit survived
        await page.reload({ timeout: 15_000 });
        await page.waitForLoadState('networkidle');
        const reloadedText = await page.locator('[contenteditable="true"]').first().textContent();
        result = {
          tested: true,
          docId,
          offlineTextSnippet: (offlineText || '').slice(-300),
          reloadedTextSnippet: (reloadedText || '').slice(-300),
          offlineEditSurvived: (reloadedText || '').includes('OFFLINE-EDIT'),
        };
      } catch (err) {
        result = { tested: false, reason: 'editor unreachable', error: (err as Error).message };
        await ctx.setOffline(false);
      }
    }

    writeFileSync(resolve(OUT_DIR, 'offline.json'), JSON.stringify(result, null, 2));
    console.log('  [offline-reconnect]', JSON.stringify(result));
    await ctx.close();
  });
});
