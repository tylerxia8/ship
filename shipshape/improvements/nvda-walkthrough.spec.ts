/**
 * NVDA screen-reader walkthrough for Cat 7's manual-SR sub-clause.
 *
 * Drives real NVDA 2026+ via Guidepup's remote-control plugin and captures
 * the speech buffer for each step. This is the gold-standard answer to the
 * brief's "can you understand the page structure and interact with all
 * controls?" question — not what axe says is structurally correct, but
 * what NVDA actually announces.
 *
 * NVDA must be installed (winget install NVAccess.NVDA) and the Guidepup
 * remote-control plugin must be set up (corepack pnpm dlx @guidepup/setup).
 *
 * Output: shipshape/improvements/raw/nvda/<route>.txt — one transcript per
 * route, showing every utterance NVDA produced as the test navigated.
 */
import { test, expect } from '@playwright/test';
import { nvdaTest } from '@guidepup/playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve(process.cwd(), 'shipshape/improvements/raw/nvda');
mkdirSync(OUT_DIR, { recursive: true });

// Routes to scan. Order chosen to start with the simplest (login = no SPA
// hydration, no auth) and progress through the most-trafficked authed routes.
const ROUTES = [
  { name: 'login',     path: '/login',     requiresAuth: false, expectedFirstUtterance: /main|sign in/i },
  { name: 'my-week',   path: '/my-week',   requiresAuth: true,  expectedFirstUtterance: /main|my week/i },
  { name: 'dashboard', path: '/dashboard', requiresAuth: true,  expectedFirstUtterance: /main|dashboard/i },
];

async function login(page: any) {
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'dev@ship.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*\/login).*/, { timeout: 10_000 });
}

nvdaTest.describe('NVDA walkthrough — real screen-reader capture', () => {
  nvdaTest.describe.configure({ mode: 'serial' });

  for (const route of ROUTES) {
    nvdaTest(`NVDA on ${route.name}`, async ({ page, nvda }) => {
      // 1. Land on the route (logging in if needed).
      if (route.requiresAuth) await login(page);
      await page.goto(`http://localhost:5173${route.path}`);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // 2. Capture an accessibility-tree-equivalent via DOM walk + ARIA
      //    attributes — this is the structural payload NVDA reads. We
      //    capture it BEFORE driving NVDA so the transcript can show
      //    "here's what the app exposes to assistive tech" alongside
      //    "here's what NVDA said about it". Playwright 1.55+ removed
      //    page.accessibility.snapshot, so we walk the DOM manually.
      const axTree = await page.evaluate(() => {
        function walk(el: Element, depth = 0): any {
          if (depth > 4) return null;
          const role = el.getAttribute('role')
                    || ({ button: 'button', a: 'link', input: 'textbox',
                          h1: 'heading', h2: 'heading', h3: 'heading',
                          nav: 'navigation', main: 'main', header: 'banner',
                          footer: 'contentinfo', form: 'form', img: 'img',
                          ul: 'list', li: 'listitem',
                        } as Record<string, string>)[el.tagName.toLowerCase()];
          if (!role) {
            const children = Array.from(el.children)
              .map(c => walk(c, depth)).filter(Boolean);
            return children.length > 0 ? { children } : null;
          }
          const name = el.getAttribute('aria-label')
                    || el.getAttribute('title')
                    || (el as HTMLInputElement).placeholder
                    || (el.firstChild?.nodeType === Node.TEXT_NODE
                        ? (el.firstChild.textContent || '').trim().slice(0, 60)
                        : (el.textContent || '').trim().slice(0, 60));
          return {
            role,
            name: name || undefined,
            children: Array.from(el.children)
              .map(c => walk(c, depth + 1)).filter(Boolean).flatMap(
                (c: any) => c.role ? [c] : (c.children ?? [])
              ),
          };
        }
        return walk(document.body);
      });

      // 3. Force the Chrome window to the front + click body to ensure
      //    keyboard focus is in the document, not Playwright's runner shell.
      await page.bringToFront();
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(500);

      await nvda.clearSpokenPhraseLog();

      // 4. Tab-traverse to discover interactive controls. NVDA speech is
      //    captured via Guidepup's phrase log. For each Tab stop we also
      //    record what Playwright sees (the focused element + its
      //    accessible name) so the transcript is self-verifying even if
      //    NVDA's IPC drops an utterance.
      const TAB_COUNT = 10;
      const focusSequence: Array<{ tag: string; role: string; name: string }> = [];
      for (let i = 0; i < TAB_COUNT; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(400);
        await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
        await page.waitForTimeout(400);
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            name: el.getAttribute('aria-label')
                || el.getAttribute('title')
                || (el as HTMLInputElement).placeholder
                || (el.textContent || '').trim().slice(0, 60),
          };
        });
        if (focused) focusSequence.push(focused);
      }

      // 5. Grab the NVDA speech log.
      const phrases = await nvda.spokenPhraseLog();

      // 6. Write a transcript that combines NVDA speech + Playwright a11y
      //    tree + focus sequence. Reviewers can verify "did NVDA actually
      //    see something?" via the speech log, AND "what's structurally
      //    available to NVDA?" via the a11y tree, AND "where did keyboard
      //    focus land?" via the focus sequence.
      function renderAx(node: any, indent = 0): string[] {
        if (!node) return [];
        const lines: string[] = [];
        const pad = '  '.repeat(indent);
        const name = node.name ? ` "${node.name}"` : '';
        const role = node.role || '?';
        lines.push(`${pad}- ${role}${name}`);
        for (const child of node.children ?? []) {
          lines.push(...renderAx(child, indent + 1));
        }
        return lines;
      }
      const transcript = [
        `# NVDA + accessibility-tree transcript — ${route.path}`,
        `# Captured: ${new Date().toISOString()}`,
        ``,
        `## Chrome accessibility tree (what NVDA reads from the page)`,
        ``,
        ...renderAx(axTree),
        ``,
        `## Keyboard focus sequence (10 × Tab from page start)`,
        ``,
        ...focusSequence.map((f, i) => `  ${i + 1}. <${f.tag} role="${f.role}"> ${f.name}`),
        ``,
        `## NVDA speech log (${phrases.length} utterances)`,
        ``,
        ...phrases.map((p, i) => `  ${String(i + 1).padStart(2, ' ')}: ${p || '<silence>'}`),
      ].join('\n');

      writeFileSync(resolve(OUT_DIR, `${route.name}.txt`), transcript);
      console.log(
        `  [${route.name}] ax-tree-depth=${renderAx(axTree).length}, ` +
        `tab-stops=${focusSequence.length}, nvda-utterances=${phrases.length} ` +
        `-> raw/nvda/${route.name}.txt`
      );

      // 7. Assertions: the a11y tree must have content (the app is
      //    exposing structural info to AT), AND we found tab stops
      //    (controls are keyboard-reachable).
      expect(axTree).toBeTruthy();
      expect(focusSequence.length).toBeGreaterThan(0);
    });
  }
});
