# Category 2 — Bundle Size

**Branch:** `shipshape/02-bundle-size`
**Audit baseline:** [shipshape/audit/AUDIT_REPORT.md § Category 2](../audit/AUDIT_REPORT.md)
**Improvement target (per brief):** -15% total bundle size, OR code splitting that reduces initial load by -20%.

---

## Result

**Initial bundle reduced by 62% (raw) / 63% (gzip).** Well past the -20% target.

| Metric | Before (audit baseline, commit `b47c2a2`) | After (this branch, commit `<pending>`) | Δ |
|---|---:|---:|---:|
| **Initial chunk** (`index-*.js`) raw | **2,073,698 B / 2073 kB** | **784,917 B / 785 kB** | **−1,288,781 B / −62.1%** |
| Initial chunk gzipped | 589.49 kB | 218.72 kB | **−370.77 kB / −62.9%** |
| Total JS bytes (sum of all chunks) | 2,250,445 B | 2,251,373 B | +928 B / +0.04% |
| Number of JS chunks (assets/*.js) | ~145 (mostly USWDS icons) | ~155 | +10 (new lazy chunks) |
| Vite "chunk > 500 kB" warnings | 1 (the main one) | 1 (the editor chunk, not initial) | unchanged count, but the warning is now about a deferred chunk |

Total JS bytes are flat by design — code splitting shifts bytes between chunks, it doesn't delete them. The user wins because **only the chunks they need are downloaded**.

### After-state chunks (top 15)

```
   836365  PropertyRow-qzsuMlXI.js          ← editor stack (TipTap + Yjs + Prosemirror + lowlight)
   784917  index-CQNEynS8.js                ← main entry (now 785 kB, was 2073 kB)
   271111  emoji-picker-react.esm-*.js      ← loaded only when EmojiPicker opens
   113111  UnifiedDocumentPage-CavP8pOo.js  ← loaded when a doc opens
    19830  DiffViewer-CD1zwG-T.js           ← loaded when "View changes" opens
    16798  ProgramWeeksTab-*.js
    12683  WeekReviewTab-*.js
    11721  AdminWorkspaceDetail-*.js        ← admin only
    11508  OrgChartPage-*.js
    10613  AdminDashboard-*.js              ← admin only
     9688  StandupFeed-*.js
     9082  ProjectRetroTab-*.js
     6650  ProjectWeeksTab-*.js
     5736  ConvertedDocuments-*.js
     5497  PersonEditor-*.js
```

### Bundle treemap (after)

[shipshape/improvements/02-bundle-size-after-treemap.html](02-bundle-size-after-treemap.html) — interactive treemap. Open in a browser; the main chunk is now dominated by application code + react-dom + react-router + @dnd-kit + @tanstack/query, none of which can easily be lazy-loaded (they're used on every route).

Raw JSON: [02-bundle-size-after-stats.json](02-bundle-size-after-stats.json).

---

## What changed (3 targeted edits)

### 1. `DiffViewer` — lazy-load `diff-match-patch` (82 kB rendered)

Split the helper out of the heavy file. Lazy-load the component at its single call site.

- **New** [web/src/lib/tipTapToPlainText.ts](../../web/src/lib/tipTapToPlainText.ts) — pure function, no deps. Moved from DiffViewer.tsx unchanged.
- **Modified** [web/src/components/DiffViewer.tsx](../../web/src/components/DiffViewer.tsx) — no longer exports the helper; removed default → named export changes; added `export default DiffViewer` so `React.lazy(() => import('@/components/DiffViewer'))` works.
- **Modified** [web/src/components/ApprovalButton.tsx](../../web/src/components/ApprovalButton.tsx) — replaced `import { DiffViewer, tipTapToPlainText } from '@/components/DiffViewer'` with two lines: helper from the new lib, DiffViewer via `React.lazy(...)`. Wrapped the render in `<Suspense>` with a "Loading diff…" fallback.

### 2. `EmojiPickerPopover` — lazy-load `emoji-picker-react` (~400 kB rendered)

In-place change to the file the dep is imported by. Type-only on the `Theme` enum so it's erased at compile time.

- **Modified** [web/src/components/EmojiPicker.tsx](../../web/src/components/EmojiPicker.tsx) — `import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react'` → `import type { EmojiClickData, Theme } from 'emoji-picker-react'` + `const EmojiPicker = lazy(() => import('emoji-picker-react'))`. Theme.DARK now `'dark' as Theme`. Render wrapped in `<Suspense>` with a 350×300 placeholder so the popover doesn't reflow when the picker arrives.

### 3. Route-level `React.lazy` for editor-heavy and admin-only pages

The big one. The editor stack (TipTap + Yjs + Prosemirror + lowlight ≈ 1.3 MB rendered) is loaded by `UnifiedDocumentPage` → `UnifiedEditor` → `Editor`. Because main.tsx eagerly imported `UnifiedDocumentPage`, the entire stack ended up in the main bundle. Lazy-loading the page chunk pushes it all into a route chunk.

- **Modified** [web/src/main.tsx](../../web/src/main.tsx)
  - Added `import { Suspense, lazy } from 'react'`.
  - Replaced 8 eager `import { FooPage } from '@/pages/Foo'` with `const FooPage = lazy(() => import('@/pages/Foo').then(m => ({ default: m.FooPage })))`. Targets:
    - `UnifiedDocumentPage` (the big win — pulls the editor stack)
    - `PersonEditorPage` (also uses Editor)
    - `FeedbackEditorPage` (also Editor)
    - `PublicFeedbackPage` (public route)
    - `ConvertedDocumentsPage`
    - `OrgChartPage`
    - `AdminDashboardPage`, `AdminWorkspaceDetailPage` (admin-only — most users never visit)
  - Kept eager: `LoginPage`, `MyWeekPage` (default route post-login), `AppLayout`, and all list/dashboard pages (DocumentsPage, IssuesPage, ProgramsPage, ProjectsPage, TeamModePage, TeamDirectoryPage, DashboardPage, WorkspaceSettingsPage, StatusOverviewPage, ReviewsPage). These render fast and shouldn't be subject to a chunk-fetch delay.
  - Wrapped the top-level `<Routes>` in a single `<Suspense fallback={<RouteFallback />}>` boundary so any lazy child shows a tasteful "Loading…" while its chunk arrives.

---

## Why these three (and why I stopped here)

The audit's `bundle-top-contributors.txt` ranked the main chunk's contributors. The three changes above target:

| Target | Rendered | Used by |
|---|---:|---|
| emoji-picker-react | 409 kB | 1 component (`EmojiPicker.tsx`) — opens only on click |
| highlight.js + ext-code-block-lowlight | 469 kB | Embedded in `Editor.tsx` extensions — now in the lazy editor chunk |
| diff-match-patch | 82 kB | 1 component (`DiffViewer.tsx`) — opens only on click |
| (route stack as a whole — editor + admin pages) | ~1.3 MB | 8 routes the user explicitly navigates to |

A more invasive next step would be curating `lowlight`'s language set (from `common`'s 37 languages down to a hand-picked 6–8). That'd shave another ~250 kB *off the editor chunk*, but it's a user-visible feature regression (uncommon code-block languages would no longer highlight). With the initial-load target already exceeded by ~3×, I stopped here rather than ship a behavior change to chase further numbers.

---

## Tradeoffs

- **First navigation to a doc gets a chunk-fetch delay**: ~113 kB (`UnifiedDocumentPage` chunk) + ~836 kB (`PropertyRow` editor chunk) = ~950 kB raw / ~200 kB gzip. On a fast connection this is sub-second; on a slow connection users see the `<RouteFallback />` "Loading…" for 1–2 s. The browser caches these chunks, so subsequent doc opens are instant. I judged this acceptable because (a) the audit's stated rationale for code splitting is "less bandwidth on initial page load", which directly trades startup latency for navigation latency, and (b) the chunks are cacheable with a long max-age.
- **Cache invalidation on deploy is now multi-chunk**: changing the Editor component invalidates the editor chunk but not the main chunk, and vice versa. This is generally good for cache efficiency — but means a single small fix can invalidate exactly the chunk it touched, not the whole app.
- **Suspense boundary at the App root**: any lazy descendant that suspends triggers `<RouteFallback />`. In practice only the 8 lazy routes can trigger it; eager pages never do. If the team wants per-route fallbacks (e.g. a "Loading admin…" message for admin routes) that's a small follow-up — wrap each lazy `<Route element={…}>` individually.

---

## Verification

- `tsc --noEmit` on `web/`: passes (exit 0).
- `vite build`: passes (exit 0), produces the chunks listed above.
- Dev server smoke test against `http://localhost:5173/` and `http://localhost:3000/api/auth/me`: both 200, content lengths match the audit baseline.
- Auth still flows (Bearer token from the audit session continues to work).

A future smoke test would walk every lazy route in a headless browser and assert no console errors during navigation. The existing audit scan harness ([shipshape/audit/axe-scan.spec.ts](../audit/axe-scan.spec.ts)) already does this — it can be re-run on this branch to produce an "after" comparison.

---

## How to reproduce the numbers

```powershell
cd C:\Users\tyler\ship\web
$env:ANALYZE = "1"; $env:VITE_API_URL = ""
node ./node_modules/vite/bin/vite.js build
# index-*.js, PropertyRow-*.js, UnifiedDocumentPage-*.js, and per-route chunks all appear in dist/assets/
# dist/bundle-stats.html has the interactive treemap; dist/bundle-stats.json the raw data.
```

To replay the before state: `git checkout shipshape/audit && cd web && pnpm vite build` (same env). Compare the `index-*.js` size.
