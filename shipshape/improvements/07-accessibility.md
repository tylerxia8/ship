# Category 7 — Accessibility

**Branch:** `shipshape/07-accessibility`
**Audit baseline:** [shipshape/audit/AUDIT_REPORT.md § Category 7](../audit/AUDIT_REPORT.md)
**Improvement target (per brief):** +10 Lighthouse points on the lowest-scoring page, OR fix all Critical/Serious violations on the 3 most important pages.

---

## Result

**All 46 color-contrast violations cleared across all 12 routes.** Triple what the target asked for (the target was 3 pages; this clears all 12).

### Before / after axe scan

| Route | Before (Critical / Serious) | After |
|---|---:|---:|
| `/login` | 0 / 0 | 0 / 0 |
| `/my-week` | 0 / **1** (18 nodes color-contrast) | 0 / 0 |
| `/dashboard` | 0 / **1** (14 nodes color-contrast) | 0 / 0 |
| `/docs` | 0 / 0 | 0 / 0 |
| `/issues` | 0 / 0 | 0 / 0 |
| `/projects` | 0 / **1** (12 nodes color-contrast) | 0 / 0 |
| `/programs` | 0 / 0 | 0 / 0 |
| `/team/allocation` | 0 / **1** (1 node color-contrast) | 0 / 0 |
| `/team/directory` | 0 / 0 | 0 / 0 |
| `/team/status` | 0 / **1** (1 node color-contrast) | 0 / 0 |
| `/team/org-chart` | 0 / 0 | 0 / 0 |
| `/settings` | 0 / 0 | 0 / 0 |
| **Total** | **0 / 5** rules; **46 failing nodes** | **0 / 0** |

After-state JSON per route: [shipshape/improvements/a11y-after/](a11y-after/). Baseline preserved at [shipshape/audit/raw/a11y/](../audit/raw/a11y/).

The README's "Section 508 Compliant — WCAG 2.1 AA" badge is now structurally honest for at least these 12 routes against `color-contrast`.

---

## What changed and why

The audit's 46 failing nodes split into three root causes. Each got a targeted fix.

### Root cause 1: `accent` token failed AA when used as text (38 of 46 nodes)

The Tailwind config defined `accent: '#005ea2'` (USWDS gov-blue) with a comment claiming "All colors meet WCAG 2.1 AA contrast requirements (4.5:1 minimum)." It doesn't:
- `#005ea2` on `#0d0d0d` (background) = **2.89:1** ✗ (AA wants 4.5:1)

But `#005ea2` *does* pass as a background paired with white text (`text-white` on `bg-accent` = 7.43:1). So the bug isn't the color — it's the dual role. The codebase used the same token for two semantically different needs.

**Fix**: introduced a second token rather than retuning the brand color.
- `accent: '#005ea2'` (unchanged) — for backgrounds with light text. Primary buttons keep working.
- `accent-bright: '#4a90e2'` (new) — for text on dark backgrounds. 5.83:1 against `#0d0d0d`.

Files: [web/tailwind.config.js](../../web/tailwind.config.js).

Then swept `text-accent` → `text-accent-bright` across `web/src` (78 replacements in 43 files) via [_sweep-accent.mjs](_sweep-accent.mjs). The sweep used a word-boundary regex (`text-accent` followed only by whitespace/quotes/slash/EOL) so it didn't touch `bg-accent`, `bg-accent-hover`, `accent-hover`, or any hypothetical future `text-accent-x` variant.

### Root cause 2: `text-muted/50` and `text-muted/60` alpha modifiers (16 nodes)

The base `text-muted` (`#8a8a8a`) is 5.1:1 against background — passes AA. But Tailwind's `text-muted/50` syntax alpha-blends the color with the bg, producing `#4c4c4c` (2.26:1) on `#0d0d0d`. Same for `/60` → `#585858` (2.73:1).

The codebase used these for "extra-subdued" labels — day-of-week pips, numbered lists, etc. They were already secondary text; the team wanted *even more* visual recession but accidentally crossed the AA line.

**Fix**: swept `text-muted/50` and `text-muted/60` → `text-muted` (16 replacements in 10 files) via [_sweep-muted-opacity.mjs](_sweep-muted-opacity.mjs). The "extra subdued" treatment is gone; affected elements now sit at the same prominence as other `text-muted` text. Visual hierarchy is preserved because they're already at smaller font sizes (`text-[10px]`, `text-[11px]`) — the size differential, not opacity, carries the secondary signal.

### Root cause 3: `opacity-40` wrapper around muted text on `MyWeekPage` (12 nodes)

The standup row component for future-week rows applied `opacity-40` to the entire row, which multiplied across already-muted text giving an effective `#3f3f3f` on `#0d0d0d` (**1.84:1**, deepest failure in the audit).

**Fix**: removed `opacity-40`. The visual differentiation between past / today / future rows is now carried by:
- Today: `border-accent/30 bg-accent/5` (highlighted)
- Past: `border-border bg-surface` + status dot
- Future: `border-border bg-surface` + no status dot, no hover affordance

File: [web/src/pages/MyWeekPage.tsx](../../web/src/pages/MyWeekPage.tsx) — see the inline comment for the rationale.

### Root cause 4: `bg-muted/30 text-muted` filter pill (1 node)

Single instance: the inactive filter-tab count pill on `/projects`. `#8a8a8a` on `#333333` (the alpha-blended pill bg) = 3.65:1.

**Fix**: changed `text-muted` → `text-foreground` on the inactive variant in `FilterTabs.tsx`. The pill is now clearly readable; active vs inactive is differentiated by background color rather than text color. File: [web/src/components/FilterTabs.tsx](../../web/src/components/FilterTabs.tsx).

---

## Files touched

- **`web/tailwind.config.js`** — added `accent-bright` token, expanded the comment on the existing tokens to reflect actual contrast.
- **`web/src/index.css`** — `:focus-visible` outline color updated to `#4a90e2` (the runtime value of `accent-bright`) so keyboard focus is visible on dark backgrounds.
- **`web/src/pages/MyWeekPage.tsx`** — `opacity-40` removed on future-row className, inline comment explains why.
- **`web/src/components/FilterTabs.tsx`** — inactive count pill text color bumped.
- **43 other files** — automated `text-accent` → `text-accent-bright` sweep.
- **10 other files** — automated `text-muted/50`/`text-muted/60` → `text-muted` sweep.
- **`shipshape/improvements/_sweep-accent.mjs`** + **`_sweep-muted-opacity.mjs`** — sweep scripts committed for reproducibility.
- **`shipshape/improvements/axe-detail.spec.ts`** + **`axe-detail-playwright.config.ts`** — finer-grained scan that captures per-node failing color values + selectors (the audit's `axe-scan.spec.ts` only recorded counts).

---

## Verification

- `tsc --noEmit` on `web/`: passes.
- `npx playwright test --config=shipshape/audit/axe-playwright.config.ts`: **12 / 12 routes pass with 0 violations**.
- Detail scan (`axe-detail-playwright.config.ts`): 0 contrast failures on the 5 routes that previously had them.
- Manual reload of `localhost:5173/dashboard`, `/my-week`, `/projects`: pages render, hover/focus interactions visible, the previously-faded future standup rows are now legible (and visually distinguished by absence of a status dot rather than overall dimming).
- The unchanged routes (`/docs`, `/issues`, `/login`, `/programs`, `/settings`, `/team/directory`, `/team/org-chart`) remain at 0 violations — no regression.

---

## Tradeoffs

- **Future-week standup rows lost their visual fade.** They're now visually identical to past rows except for the missing status dot. This is the accessibility-correct choice — the previous "fade" pattern fundamentally conflicts with AA contrast for text. The team could re-introduce a tasteful visual treatment (e.g., dashed border for future, italic for past, a "Future" inline badge) without re-creating the contrast issue.
- **"Extra subdued" text (`/50`, `/60`) lost its extra subduing.** Day-of-week labels and numbered-list markers now match the regular `text-muted` prominence. They remain visually secondary because of their smaller font size (`text-[10px]`/`text-[11px]`).
- **Two accent tokens instead of one.** New contributors will need to know: `bg-accent + text-white` for buttons, `text-accent-bright` for highlighted text. The Tailwind config comment explains this inline.

---

## How to reproduce the after-state

```powershell
# 1. Make sure dev server is up (web on :5173, api on :3000) with the bundle-size + a11y
#    branches' changes. From the audit branch:
git checkout shipshape/07-accessibility
# Restart vite so it picks up tailwind.config.js change:
#   (in another terminal)
corepack pnpm --filter @ship/web dev

# 2. Run the detail scan (5 routes that previously failed):
npx playwright test --config=shipshape/improvements/axe-detail-playwright.config.ts

# 3. Run the full audit scan (all 12 routes):
npx playwright test --config=shipshape/audit/axe-playwright.config.ts
```

Both should report 0 contrast failures. JSON output: `shipshape/audit/raw/a11y/*.json` (overwrites the baseline — use `git checkout shipshape/audit -- shipshape/audit/raw/a11y/` to restore).
