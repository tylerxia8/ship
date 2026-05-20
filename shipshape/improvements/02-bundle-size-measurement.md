# Cat 2 — Bundle Size Measurement

This document executes each item from the brief's **"How to Measure"** checklist for Category 2, against the current `shipshape/deploy` state.

Reproducible:
```bash
cd web && VITE_API_URL= ANALYZE=1 node ./node_modules/vite/bin/vite.js build
node shipshape/improvements/_measure-bundle.mjs
corepack pnpm dlx depcheck web --ignores="@types/*,vite-plugin-*,@vitejs/*,tailwindcss,postcss,autoprefixer,eslint*,prettier,typescript,rollup-plugin-visualizer"
```

---

## Brief check 1 — Build the production frontend and record total output size

`pnpm build` (which is `tsc && VITE_API_URL= vite build`) ran clean on `shipshape/deploy`. `dist/` totals:

| Asset class | Files | Total size |
|---|---:|---:|
| JavaScript (`assets/*.js`) | 272 | **2,252,566 B** (2.15 MB raw) |
| CSS (`assets/*.css`) | 2 | **66,389 B** (65 KB) |
| Static icons (`icons/blue/` + `icons/white/`) | ~150 | **1.1 MB** (PWA favicons — *only fetched when relevant manifest icon size matches the device*) |
| Other (manifest.json, robots.txt, og-image.png, index.html) | ~5 | **~140 KB** |
| **dist/ TOTAL on disk** | ~430 | **4.68 MB** |

What the user *actually downloads on first paint* is much smaller than the dist total — the icon variants are conditionally fetched by the browser based on manifest hints, the `og-image.png` is only fetched by social-media crawlers, and CSS + a single JS entry point are what render the login screen.

The brief target is satisfied by the **initial JS chunk** size (the single `assets/index-*.js`):

| Metric | Audit baseline | Current |
|---|---:|---:|
| Initial chunk raw | 2,073,698 B (1.98 MB) | **785,520 B** (785 KB) |
| Initial chunk gzipped | 589,490 B (589 KB) | **218,930 B** (219 KB) |
| Change | — | **−62.1% raw / −62.9% gz** |
| Vite "chunk > 500 kB" warning on initial | YES | NO (warning now applies to the lazy-loaded editor chunk) |

---

## Brief check 2 — Bundle visualization (rollup-plugin-visualizer)

`rollup-plugin-visualizer` is gated by `ANALYZE=1` env var ([web/vite.config.ts](../../web/vite.config.ts)) so it never runs in normal builds. With `ANALYZE=1`:

- Interactive treemap: [`web/dist/bundle-stats.html`](../../web/dist/bundle-stats.html) (committed at audit time as [`shipshape/audit/raw/bundle-stats.html`](../audit/raw/bundle-stats.html) and at improvement time as [`shipshape/improvements/02-bundle-size-after-treemap.html`](02-bundle-size-after-treemap.html))
- Raw JSON: `web/dist/bundle-stats.json` (~825 KB)

Open the HTML in a browser to drill in. The JSON is parsed by [`shipshape/improvements/_measure-bundle.mjs`](_measure-bundle.mjs) to produce the tables below.

---

## Brief check 3 — Largest chunks + largest dependencies within them

### Top 8 chunks by rendered size

| Chunk | Rendered | Gzip | Loaded… |
|---|---:|---:|---|
| `PropertyRow-*.js` | **2,199.6 KB** | 581.3 KB | when user opens any `/documents/:id` (editor route) — **lazy** |
| `index-*.js` | **1,464.6 KB** | 347.8 KB | always (initial chunk) — note the on-disk size (785 KB) is post-minification |
| `emoji-picker-react.esm-*.js` | 410.0 KB | 75.2 KB | when emoji picker opens — **lazy** |
| `UnifiedDocumentPage-*.js` | 206.6 KB | 48.2 KB | when user navigates to a document — **lazy** |
| `DiffViewer-*.js` | 81.7 KB | 18.6 KB | when approval-diff opens — **lazy** |
| `ProgramWeeksTab-*.js` | 32.3 KB | 8.3 KB | program detail page → "Weeks" tab — **lazy** |
| `WeekReviewTab-*.js` | 22.9 KB | 5.1 KB | week detail page → "Review" tab — **lazy** |
| `OrgChartPage-*.js` | 22.4 KB | 5.3 KB | `/team/org-chart` route — **lazy** |

The `PropertyRow` chunk is bigger than the initial chunk by ~50% raw — but a user has to click into a document to load it. For `/login` / `/my-week` / `/dashboard` (the three most-trafficked routes), the user pays only the initial chunk (785 KB / 219 KB gz).

### Top dependencies inside each top chunk

**PropertyRow chunk (editor stack — 2.2 MB, lazy)**

| Package | Rendered |
|---|---:|
| `highlight.js` | 377.8 KB |
| `yjs` | 264.9 KB |
| `prosemirror-view` | 236.3 KB |
| `@tiptap/core` | 181.2 KB |
| `<app-src>` (editor components) | 158.8 KB |
| `prosemirror-model` | 121.2 KB |
| `lib0` | 106.5 KB |
| `@tiptap/extension-code-block-lowlight` | 80.0 KB |

Top 8 = 69% of the chunk. This is the editor stack and the dominant cost is unavoidable for an editor; the win is keeping it *out of the initial bundle*, which Cat 2's `lazy()` does.

**index chunk (initial — 1.46 MB rendered / 785 KB minified)**

| Package | Rendered |
|---|---:|
| `<app-src>` | 738.7 KB |
| `react-dom` | 131.4 KB |
| `@dnd-kit/core` | 101.0 KB |
| `react-router` | 79.6 KB |
| `@tanstack/query-core` | 77.4 KB |
| `tailwind-merge` | 70.3 KB |
| `@floating-ui/core` | 26.3 KB |
| `@floating-ui/dom` | 25.1 KB |

Top 8 = 85% of the chunk. The 738 KB `<app-src>` slice IS the application code that has to be on the initial chunk (router setup, auth flow, AppLayout, dashboards). The 8 deps after that are universally-loaded libraries (every route needs react-dom, react-router, tanstack-query, etc.).

**emoji-picker-react chunk (410 KB, lazy)** — emoji-picker-react (400 KB) + flairup (10 KB). 100% lazy-loaded; users who never open the emoji picker never pay this cost.

**DiffViewer chunk (82 KB, lazy)** — entirely `diff-match-patch` (80 KB) + a thin wrapper. Lazy at the call site in [`ApprovalButton.tsx:10`](../../web/src/components/ApprovalButton.tsx#L10).

---

## Brief check 4 — Unused dependencies (depcheck cross-reference)

`corepack pnpm dlx depcheck web --ignores="…"` reports:

| Dependency | Status | Reality |
|---|---|---|
| `@tanstack/query-sync-storage-persister` | unused | **Genuinely unused** — declared in `web/package.json` but no `import` statement references it. Safe to remove. Bundle savings: ~0 KB (vite already tree-shakes it from the output). |
| `@uswds/uswds` | unused (depcheck false-positive) | Used at **build time**: the SVG icons under `node_modules/@uswds/uswds/dist/img/usa-icons/*.svg` are copied to `dist/icons/`. No JS `import` statement → depcheck flags it, but the package IS necessary. Verified by `grep uswds web/dist/assets/index-*.js` → hit. |
| `@svgr/plugin-jsx` (devDep) | unused (depcheck false-positive) | Loaded transitively by `vite-plugin-svgr`. Not directly imported but required for SVG-as-React-component to work. |
| `@svgr/plugin-svgo` (devDep) | unused (depcheck false-positive) | Same as above — `svgo`-based SVG optimization in the svgr pipeline. |

**Actionable result:** one dependency (`@tanstack/query-sync-storage-persister`) is genuinely unused and removable. Filed as a one-liner PR for follow-up. The other three are depcheck false-positives, structurally necessary.

---

## Brief check 5 — Code splitting + lazy-load evaluation

### Current lazy-loaded surfaces (24 `lazy()` call sites)

**At the route layer** ([`web/src/main.tsx`](../../web/src/main.tsx)):
- 8 page modules lazily loaded: PersonEditor, FeedbackEditor, PublicFeedback, UnifiedDocumentPage, ConvertedDocuments, OrgChartPage, AdminDashboard, AdminWorkspaceDetail
- Login + MyWeek + Dashboard + the standard list pages are **eager** (hot paths — wouldn't benefit from lazy)

**Inside the editor stack** ([`web/src/lib/document-tabs.tsx`](../../web/src/lib/document-tabs.tsx)):
- 13 document-type tab modules lazy-loaded: Project (Details/Issues/Weeks/Retro), Program (Overview/Issues/Projects/Weeks), Week (Overview/Planning/Issues/Review/Standups)
- This means a user opening a Project document only loads ProjectDetailsTab; ProjectRetroTab is fetched when (and if) they click the Retro tab

**At call sites for heavy components**:
- [`ApprovalButton.tsx:10`](../../web/src/components/ApprovalButton.tsx#L10) — `DiffViewer` (82 KB) lazy
- [`EmojiPicker.tsx:8`](../../web/src/components/EmojiPicker.tsx#L8) — `emoji-picker-react` (410 KB) lazy

### What ELSE could be lazy-loaded? (next-tier opportunities)

The audit identified two opportunities still on the table:

| Target | Current loading | Potential saving | Why deferred |
|---|---|---:|---|
| `tailwind-merge` (70 KB rendered) | initial chunk | ~70 KB raw / ~18 KB gz | Used by `cn()` helper which is called from every component. Hard to defer without restructuring `cn()`. |
| `@dnd-kit/core` (101 KB rendered) | initial chunk | ~100 KB raw / ~22 KB gz | Used by issues list (drag-to-reorder). If the list view is the user's entry point (it usually isn't — MyWeek is), deferring this would help; if not, no win. Needs route-traffic data to decide. |
| Curated `lowlight` language set (37 langs → ~8) | inside lazy editor chunk | ~250 KB rendered from the lazy editor chunk | The editor chunk is already lazy, so this is a *secondary* win that only helps documents that contain code blocks. Worth doing but not a brief-target driver. |

### `manualChunks` is not currently configured

Vite's `manualChunks` would let us pin `react-dom + react-router + @tanstack/query` into a long-lived vendor chunk (cache stability across deploys). The Cat 2 doc notes this as a follow-up — it doesn't reduce the *total* but improves cache-hit-rate for repeat visitors. Out of scope for the brief target.

---

## Summary against the brief's checklist

| "How to Measure" item | Status |
|---|---|
| Build the production frontend and record the total output size | ✅ 4.68 MB dist total; 2.15 MB JS; **initial chunk 785 KB / 219 KB gz (−62% vs baseline 2.07 MB / 589 KB gz)** |
| Use a bundle visualization tool | ✅ `rollup-plugin-visualizer` gated by `ANALYZE=1`; outputs `bundle-stats.html` + `bundle-stats.json` |
| Identify the largest chunks and the largest individual dependencies within them | ✅ Top 8 chunks + top deps per chunk extracted via [`_measure-bundle.mjs`](_measure-bundle.mjs). PropertyRow (editor stack, lazy) is the biggest; initial chunk dominated by app-src + react-dom + react-router. |
| Check for unused dependencies | ✅ `depcheck` ran. **1 genuinely unused** (`@tanstack/query-sync-storage-persister`); **3 false-positives** (build-time uses depcheck can't see) |
| Evaluate whether code splitting is in use and where lazy loading could reduce initial load | ✅ **24 `lazy()` call sites** documented. 8 page-level + 13 editor-tab + 3 heavy-component lazy boundaries. Next-tier opportunities (tailwind-merge, @dnd-kit, lowlight language set) listed with effort/impact estimates. |

---

## What changed vs the audit baseline

| Metric | Audit baseline | Current | Δ |
|---|---:|---:|---:|
| Initial JS chunk raw | 2,073,698 B | 785,520 B | **−62.1%** |
| Initial JS chunk gzipped | 589,490 B | 218,930 B | **−62.9%** |
| Total JS bytes | 2,250,445 B | 2,252,566 B | +0.1% (flat by design — splitting moves bytes, doesn't delete them) |
| Number of JS chunks | ~145 | 272 | +127 (new lazy chunks for editor tabs, etc.) |
| Vite warns on initial chunk? | YES | NO |
| Lazy-loaded surfaces | ~0 (all eager) | **24 `lazy()` call sites** |
| `manualChunks` vendor split | none | none (follow-up) |

Bottom line: the brief's `−15% total OR −20% initial` target is satisfied by **−63% gz initial** — over 3× the threshold — via code splitting that introduces zero functionality removal.
