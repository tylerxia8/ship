# ShipShape — Audit Report

**Project:** Ship (US-Department-of-the-Treasury/ship)
**Branch:** `shipshape/audit`
**Author:** Tyler Xia
**Audit window:** Mon 2026-05-18 → Tue 2026-05-19 23:59 (hard gate)
**Scope:** 7 categories — baseline measurements only. No fixes here; treatment goes in implementation branches.

This report's mission is diagnosis. Each category section follows the brief's template: methodology, numbers, top findings ranked by impact, and the improvement target derived from the brief.

> **Reading order for reviewers:** Skip to [§ Summary](#summary) for the at-a-glance table; jump to a category section for raw numbers and methodology. Raw output files (axe JSON, Lighthouse reports, EXPLAIN ANALYZE dumps, autocannon JSON) live in [shipshape/audit/raw/](raw/).

---

## Summary

| # | Category | Baseline (headline) | Improvement target |
|---|----------|---------------------|--------------------|
| 1 | Type Safety | `any`: **260**, `as <T>`: **460**, `!`: **324**, `@ts-*-error`: **1**. Strict mode **on** in api/shared; web has stock `strict: true` only — turning on root's superset surfaces **~102 hidden errors across 22 files**. | Eliminate 25% of violations w/ correct narrowing |
| 2 | Bundle Size | Total `web/dist`: **3.8 MB**. Total JS: **~2.15 MB**. **Largest chunk: 2,073,698 bytes (1.98 MB, 92% of all JS)** in `index-*.js` — single bundle, Vite warns about it. | -15% total or -20% initial via code split |
| 3 | API Response Time | _(pending live app)_ | -20% P95 on ≥2 endpoints |
| 4 | DB Query Efficiency | _(pending live app + pg log)_ | -20% queries on a flow or -50% on slowest |
| 5 | Test Coverage & Quality | **866 E2E** (71 files), **447 API unit** (28 files), **151 web unit** (16 files) — total ~1,464 | +3 meaningful tests on untested paths, or fix 3 flakes w/ RCA |
| 6 | Runtime Errors | _(pending live app + DevTools)_ | 3 fixes, ≥1 real data-loss scenario |
| 7 | Accessibility | _(pending Lighthouse + axe on live app)_ | +10 Lighthouse on worst page or all Critical/Serious on top 3 |

---

## Category 1 — Type Safety

### Methodology

- **Static counts via `Grep` (ripgrep) across `api/src/**/*.ts`, `web/src/**/*.{ts,tsx}`, `shared/src/**/*.ts`.**
- Patterns:
  - `any`: `:\s*any\b|\bany\[|<any>|as any\b`
  - `as <Type>`: `\bas\s+[A-Z]` (excludes `as const`, `as default`, `as unknown`)
  - Non-null `!`: `[a-zA-Z0-9_\)\]]!(\.|\[|\(|;|,|\)|\s*\}|\s*$)` (covers `arr[0]!`, `foo()!`, `userId!;`, `userId!.x`)
  - `@ts-*-error`: `@ts-ignore|@ts-expect-error|@ts-nocheck`
- **Strict-mode investigation**: Read all four `tsconfig.json`s — root + api + web + shared. Checked which inherit from which.
- **Web strict probe**: Created [web/tsconfig.strict-probe.json](../../web/tsconfig.strict-probe.json) extending `tsconfig.json` and adding `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. Pending tsc run after `pnpm install` completes.

### Baseline

| Metric | Count | Top contributors |
|---|---:|---|
| `any` (api) | 229 across 23 files | tests: `accountability.test.ts:32`, `transformIssueLinks.test.ts:37`, `auth.test.ts:24`; code: `projects.ts:13`, `yjsConverter.ts:12`, `weeks.ts:10` |
| `any` (web) | 31 across 8 files | `FileAttachment.tsx:7`, `SlashCommands.tsx:6`, `AIScoringDisplay.tsx:6` |
| `any` (shared) | 0 | clean |
| **`any` total** | **260** | |
| `as <Type>` (api) | 250 across 26 files | `weeks.ts:48`, `issues.ts:34`, `projects.ts:26`, `team.ts:25`, `admin.ts:14` |
| `as <Type>` (web) | 210 across 78 files | `UnifiedEditor.tsx:25`, `PropertiesPanel.tsx:13`, `DiffViewer.tsx:8` |
| **`as <Type>` total** | **460** | |
| Non-null `!` (api) | 290 across 27 files | `weeks.ts:48`, `issues.ts:34`, `team.ts:28`, `projects.ts:26` |
| Non-null `!` (web) | 34 across 19 files | `ReviewsPage.tsx:5`, `MyWeekPage.tsx:4`, `useSessionTimeout.ts:3` |
| **Non-null `!` total** | **324** | |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **1** | only `web/src/components/icons/uswds/Icon.test.tsx` |
| **Strict mode enabled?** | **Yes (partial)** | api+shared inherit root's `strict + noUncheckedIndexedAccess + noImplicitReturns + noFallthroughCasesInSwitch`; **web has only stock `strict: true`** (does not extend root config) |
| **Strict-probe error count (web)** | **102 errors across 22 files** | After adding `noUncheckedIndexedAccess + noImplicitReturns + noFallthroughCasesInSwitch` to web. Raw output: [raw/web-strict-probe-errors.txt](raw/web-strict-probe-errors.txt) |
| Error breakdown by TS code | TS2532 × 41 (Object possibly undefined), TS18048 × 29 (possibly undefined), TS2322 × 12 (assignability), TS2345 × 11 (param type), TS7030 × 8 (missing return), TS18047 × 1 (possibly null) | ~80 of 102 (78%) are real undefined-access bugs the lint doesn't catch today |
| Top files (strict-probe) | `CommandPalette.tsx` (13), `lib/cn.ts` (12), `hooks/useSelection.ts` (12), `editor/CommentDisplay.tsx` (12), `editor/AIScoringDisplay.tsx` (12) | Five files account for 61 of 102 errors |

### Top 5 violation-dense files

Combined (`any` + `as <T>` + `!`):

| File | any | as | ! | Total | Why it's problematic |
|---|---:|---:|---:|---:|---|
| `api/src/routes/weeks.ts` | 10 | 48 | 48 | **106** | Largest weekly-plan handler; mixes typed zod schemas with `any` rows from `pool.query`. Hot path. |
| `api/src/routes/issues.ts` | 5 | 34 | 34 | **73** | Issue CRUD + state transitions. `any` here makes state-machine bugs invisible to TS. |
| `api/src/routes/projects.ts` | 13 | 26 | 26 | **65** | Project ICE/RACI logic. `properties` JSONB cast to `any` instead of `ProjectProperties`. |
| `api/src/routes/team.ts` | 1 | 25 | 28 | **54** | Person/membership joins; `!` on every `req.userId` is the dominant pattern. |
| `api/src/routes/programs.ts` | 2 | 18 | 18 | **38** | Same JSONB-cast pattern as projects.ts. |

Note: many `!` counts equal `as` counts because both reflect the same pattern of unsafe-cast-then-non-null on raw query rows. Fixing the underlying typing of `pool.query` would knock out both in one go.

### Findings

1. **Web `tsconfig.json` does not extend the root** ([web/tsconfig.json](../../web/tsconfig.json)). Root sets `strict + noUncheckedIndexedAccess + noImplicitReturns + noFallthroughCasesInSwitch`. Web has only `strict: true`. **Impact:** the strongest TS constraints are silently disabled in the package with the most surface area (78 files using `as`, 19 using `!`). _(Severity: high — fix surfaces real undefined-access bugs.)_
2. **Untyped `pool.query` rows** propagate `any` through route handlers (visible in `documents.ts:18` — `Promise<{ canAccess: boolean; doc: any | null }>`). Each route then `as`-casts back to a properties type. **Impact:** ~250 `as <T>` in api are mostly this. A generic `query<T>` wrapper that infers the row type from a zod schema or a `Document<T>` discriminated row type would eliminate hundreds. _(Severity: high — single change with broad reach.)_
3. **Zod schemas drift from reality.** `createDocumentSchema` in `documents.ts` still accepts `program_id` and `sprint_id` even though migrations 027/029 dropped those columns. **Impact:** the API contract published in the OpenAPI spec lies about what fields are persisted. _(Severity: medium — bugs at the schema/DB boundary.)_
4. **Tests dominate `any` totals** (~155 of 260). This is acceptable in unit-test fixtures but inflates the headline number. The Category target should be measured on non-test files only: ~105 `any` in production code, of which ~80 in api routes. _(Severity: methodological — affects the target denominator.)_
5. **`@ts-ignore` is essentially absent (1 total).** Good sign — the team prefers refactoring to suppression. _(Severity: positive finding.)_

### Improvement target (per brief)

> Eliminate 25% of type safety violations with correct narrowing. Replacing `any` with `unknown` and leaving it unnarrowed does not count.

Target on the non-test set: drop 25% of (`any` + `as <T>` + `!`) in non-test files. With the proposed `pool.query<T>` generic, the `web/tsconfig` strict bump, and fixing the zod-schema drift, this is achievable in a few focused commits.

---

## Category 2 — Bundle Size

### Methodology

- Run `pnpm build` (which runs `pnpm build:shared && tsc && vite build` for the web package).
- Measure `web/dist/` size (total + per-chunk + per-asset).
- Add `rollup-plugin-visualizer` as a devDep on the audit branch only, re-build, capture treemap as `shipshape/audit/raw/bundle-stats.html`.
- Cross-reference `web/package.json` dependencies vs. actual imports for dead-deps.

### Baseline

| Metric | Value |
|---|---|
| Total `web/dist` size | **3.8 MB** |
| Total assets dir size | **2.7 MB** |
| **Largest chunk** | **`index-C2vAyoQ1.js` — 2,073,698 bytes (1.98 MB raw, 589.49 KB gzipped)** |
| Largest chunk share of JS | **92%** of total JS |
| Number of JS chunks (assets/*.js) | ~145 (mostly small USWDS icons) |
| Total JS bytes | 2,250,445 bytes (~2.15 MB) |
| Total CSS bytes | 66,512 bytes (~65 KB, single file) |
| 2nd-largest JS chunk | `ProgramWeeksTab-*.js` — 16,761 bytes (16.4 KB) |
| Chunks ≥ 100 KB | **1** (the main one) |
| Vite build warning | "Some chunks are larger than 500 kB after minification. Consider dynamic import or `manualChunks`" |

Treemap available at [raw/bundle-stats.html](raw/bundle-stats.html); composition summary at [raw/bundle-composition.txt](raw/bundle-composition.txt).

### Bundle composition (top contributors)

Generated by `rollup-plugin-visualizer` with `ANALYZE=1 vite build`. Sizes here are pre-minification source sizes ("renderedLength" from the visualizer); the actual minified+chunked output is the 2.07 MB main bundle.

| # | Package | Rendered | Gzip | Where it's used |
|---|---|---:|---:|---|
| 1 | `emoji-picker-react` | 399.6 KB | 72.4 KB | **One component only** (`EmojiPicker.tsx`) → ideal lazy-load |
| 2 | `highlight.js` | 377.9 KB | 118.5 KB | Only when rendering code blocks (via `extension-code-block-lowlight`) → ideal lazy-load |
| 3 | `yjs` | 264.9 KB | 55.5 KB | Editor pages only |
| 4 | `prosemirror-view` | 236.3 KB | 57.2 KB | Editor only |
| 5 | TipTap `core` | 181.2 KB | 36.9 KB | Editor only |
| 6 | `react-dom` | 131.7 KB | 42.4 KB | Universal (cannot split) |
| 7 | `prosemirror-model` | 121.2 KB | 28.7 KB | Editor only |
| 8 | `lib0` | 106.5 KB | 34.0 KB | Yjs dependency |
| 10 | `diff-match-patch` | 80.6 KB | 18.1 KB | **One component only** (`DiffViewer.tsx`) → ideal lazy-load |
| 11 | `@tiptap/extension-code-block-lowlight` | 80.0 KB | 23.3 KB | Pulls `highlight.js` |
| 13 | `react-router` | 79.6 KB | 19.5 KB | Universal |
| ⋯ | App code total | 1,316.6 KB | _(174 files)_ | _includes all editor pages, sidebars, components_ |

The editor stack (`@tiptap/*`, `prosemirror-*`, `yjs`, `lib0`, `y-prosemirror`, `lowlight`, `highlight.js`) sums to **~1.5 MB rendered** and is loaded on every route — including `/login`, `/team/directory`, `/team/status`, `/admin`, etc. that don't need an editor.

### Findings (from `rollup-plugin-visualizer` treemap)

I added `rollup-plugin-visualizer` as a devDep (gated by `ANALYZE=1` env so it never runs in normal builds) and generated [raw/bundle-stats.html](raw/bundle-stats.html) plus [raw/bundle-top-contributors.txt](raw/bundle-top-contributors.txt).

**Top contributors to the main `index-*.js` chunk** (rendered raw bytes — full chunk total before minification is ~4.55 MB; the post-minification figure of 2.07 MB cited above is the actually-shipped size):

| Bucket | Rendered | Gzip | % of chunk | Notes |
|---|---:|---:|---:|---|
| **app/src (web)** | 1,222 KB | 270 KB | 26.8% | application code |
| **emoji-picker-react** | 409 KB | 74 KB | 9.0% | only used in `EmojiPicker.tsx` |
| **highlight.js** | 387 KB | 121 KB | 8.5% | 39 language files — only for code blocks |
| **yjs** | 271 KB | 57 KB | 6.0% | core editor sync |
| **prosemirror-view** | 242 KB | 59 KB | 5.3% | core editor |
| **@tiptap/core** | 186 KB | 38 KB | 4.1% | core editor |
| **react-dom** | 135 KB | 43 KB | 3.0% | framework |
| **prosemirror-model** | 124 KB | 29 KB | 2.7% | core editor |
| **lib0** | 109 KB | 35 KB | 2.4% | yjs dependency, 37 files |
| **@dnd-kit/core** | 103 KB | 22 KB | 2.3% | drag-and-drop |
| **diff-match-patch** | 82 KB | 19 KB | 1.8% | only used in `DiffViewer.tsx` |
| **@tiptap/extension-code-block-lowlight** | 82 KB | 24 KB | 1.8% | wraps highlight.js |
| @popperjs/core | 59 KB | 23 KB | 1.3% | tippy.js dep |
| react-router | 81 KB | 20 KB | 1.8% | routing |

**Three obvious code-split wins** worth a single targeted commit each:
1. **`emoji-picker-react`** (409 KB rendered) — lazy-load `EmojiPicker.tsx`.
2. **`highlight.js`** / `@tiptap/extension-code-block-lowlight` (469 KB rendered combined) — lazy-load the code-block extension; most documents have no code blocks.
3. **`diff-match-patch`** (82 KB rendered) — lazy-load `DiffViewer.tsx` (used only in revision-history views).

Together: **~960 KB rendered / ~218 KB gzipped removed from initial load** without any feature loss. Plus a `manualChunks` for `react-dom + react-router + @tanstack/query` as a long-lived vendor chunk for cache stability.

### Improvement target

> -15% total or implement code splitting that reduces initial load by -20%.

The three lazy-loads above + a vendor split should comfortably exceed -20% initial load reduction.

---

## Category 3 — API Response Time

### Methodology

- **Seed data:** Use `pnpm db:seed` plus a top-up script to hit the brief's targets — 500+ documents, 100+ issues, 20+ users, 10+ sprints. The standard seed creates a handful of demo entities; will write `shipshape/audit/scripts/seed-load.ts` if needed.
- **Endpoint selection:** Trace the React Query calls fired during five user flows (load /my-week, open a doc, list issues, load a sprint board, search). Top 5 by frequency become the benchmark set.
- **Tool:** `autocannon` via `corepack pnpm dlx autocannon` (no global install needed). Capture P50/P95/P99 at 10, 25, 50 concurrent connections per endpoint. JSON output → `shipshape/audit/raw/perf-<endpoint>-<conn>.json`.
- **Ambient conditions:** identical machine state for before/after — note CPU/memory/free-RAM at run time.

### Baseline

_(pending live app — user will start `pnpm dev`; I'll then run autocannon for ~10 minutes total)_

### Hypotheses to confirm

- The **per-document GET** (`/api/documents/:id`) joins associations, author, history-summary, and properties — likely the slowest single-doc endpoint.
- The **dashboard / my-week** endpoints aggregate across documents and projections — high probability of N+1 against `document_associations`.
- The **list endpoints** (`/api/issues`, `/api/documents`) likely scan rows then filter in code rather than push filters to SQL.

### Improvement target

> -20% P95 on ≥2 endpoints under identical conditions.

---

## Category 4 — Database Query Efficiency

### Methodology

- Enable `log_statement = 'all'` and `log_duration = on` on the dev Postgres for the measurement window. For native Windows Postgres, set in `postgresql.conf` and `pg_ctl reload`.
- Drive five user flows from the UI; capture queries from the log.
- `EXPLAIN (ANALYZE, BUFFERS)` on the top-5 slowest distinct queries.
- Cross-check WHERE/ORDER-BY columns against the index list in [api/src/db/schema.sql](../../api/src/db/schema.sql:336-434) (38 indexes; pretty thorough already).

### Baseline

_(pending live app)_

### Hypotheses to confirm

- **N+1 in dashboard/my-week.** _Updated after reading `api/src/routes/dashboard.ts`_: the `/my-work` handler **actually does proper joins** — issues + sprint association + sprint document + program association + program document, all in one SQL — so the dashboard itself is **not** a textbook N+1. But individual handlers (e.g. document loaders that fetch comments + associations + history separately) probably are. Need live trace.
- **JSONB-key casts without functional indexes.** `dashboard.ts` filters by `(d.properties->>'assignee_id')::uuid = $2` and `d.properties->>'state' NOT IN (...)`. The schema has `idx_documents_properties` (GIN over `properties`) and an `idx_documents_person_user_id` ((properties->>'user_id')) **but no functional index on `properties->>'assignee_id'` or `properties->>'state'`**. Confirm in EXPLAIN.
- **No partial index for `document_type = 'issue'`** alone. Composite index on `(workspace_id, document_type)` partial-filtered by `archived_at IS NULL AND deleted_at IS NULL` — good — but type-specific list queries with state filters on `properties.state` would benefit from a partial GIN expression index.
- **`document_associations` lookups** by `(document_id, relationship_type)` are indexed — good. But "find documents that belong-to project X" is `WHERE relationship_type = 'project' AND related_id = $X`, served by `idx_document_associations_related_type` — verify it's used.

### Improvement target

> -20% query count on a flow OR -50% on slowest query.

---

## Category 5 — Test Coverage & Quality

### Methodology

- File counts via `Glob`.
- Test counts via ripgrep over `^\s*(test|it)(\.fixme|\.skip|\.only)?\s*\(` (counts each test entry, including ones inside `describe`).
- Suite runtime + flakes: requires E2E run. Will use the `/e2e-test-runner` skill per CLAUDE.md and capture `test-results/summary.json` over 3 runs to detect flakes.
- Coverage: configure `vitest --coverage` for api and web (not currently enabled). Report v8 line/branch %.

### Baseline

| Metric | Value |
|---|---|
| Total E2E spec files | **71** (brief says "73+"; file count, not test count) |
| Total E2E test entries | **866** |
| Total API unit test files | **28** |
| Total API unit tests | **447** |
| Total Web unit test files | **16** |
| Total Web unit tests | **151** |
| **Grand total tests** | **~1,464** |
| `.fixme` / `.skip` / `.only` markers (e2e) | 0 |
| Pre-commit empty-test hook | yes (`scripts/check-empty-tests.sh` per CLAUDE.md) |
| **API unit test status (no DB)** | **28/28 files fail to start** — `ECONNREFUSED` from pg-pool. All 451 tests "skipped" because `beforeAll` in `api/src/test/setup.ts:14` issues `TRUNCATE CASCADE` and pg retries until exhaustion. **3248s** (54 min) burned on retries. |
| Pass / Fail / Flake rates | _(pending live Postgres + run)_ |
| Suite runtime | _(pending)_ |
| Code coverage % | _(pending; tooling not configured)_ |

Raw vitest output: [raw/api-vitest-baseline.txt](raw/api-vitest-baseline.txt).

### Findings (preliminary)

- **Coverage tooling not configured.** `@vitest/coverage-v8` is not in any package's devDependencies — even though `api/package.json` has a `test:coverage` script that calls `vitest run --coverage`. Configuring is itself a measurable improvement worth at least mentioning.
- **No Playwright sharding for CI in `playwright.config.ts`.** With 866 tests at 4 workers × 60s avg, CI time is non-trivial. (This is about quality of the suite infra, not test count.)

### Improvement target

> +3 meaningful tests on previously-uncovered critical paths OR fix 3 flakes with documented RCA. Each test must include a comment explaining the regression it catches.

### Critical flows to check coverage of

- Session timeout & re-auth (sliding window + 12-hour absolute).
- Yjs offline edit → online merge.
- API token auth (Bearer) bypassing CSRF.
- Workspace membership revoke — does the user actually get kicked out?
- Document conversion (issue ↔ project) preserving `original_type`/`conversion_count`.

---

## Category 6 — Runtime Error & Edge-Case Handling

### Methodology

- Open the dev app in Chrome with DevTools open. Use the app through the 4 golden flows. Note every console error and warning.
- Drop the network in DevTools while editing a doc collaboratively (use 2 browser profiles). Re-enable. Verify Yjs convergence and UI recovery.
- Submit malformed input on each form: empty, 10k-char string, `<script>alert(1)</script>`, control chars, emoji.
- Two-tab same-field-edit. Verify CRDT convergence.
- Throttle to "Slow 3G" in DevTools. Note hanging spinners / silent failures.

### Baseline

_(pending live app)_

### Existing error-handling infrastructure (preliminary read)

The codebase already has solid foundations:
- **`MutationCache.onError`** in [web/src/lib/queryClient.ts:166](../../web/src/lib/queryClient.ts) emits via `notifyMutationError` → `<MutationErrorToast>` in `main.tsx`.
- **`subscribeToCacheCorruption`** detects bad IndexedDB state and notifies listeners.
- **`handleSessionExpired`** in `web/src/lib/api.ts` redirects to `/login?expired=true&returnTo=...`.
- **`ErrorBoundary` exists** at [web/src/components/ui/ErrorBoundary.tsx](../../web/src/components/ui/ErrorBoundary.tsx) and is used in `pages/App.tsx` and `components/Editor.tsx`. Has a "Try Again" reset path. **Open question for live audit:** is the boundary at the right granularity? E.g., does an error inside a route render gate the whole AppLayout?

### Concrete gaps already identified (pre-live-app)

1. **API tests slow-fail when Postgres is unreachable.** [api/src/test/setup.ts:14](../../api/src/test/setup.ts#L14) calls `pool.query(TRUNCATE ...)` directly in `beforeAll`. There is no connection precheck and no `connectionTimeoutMillis` set on the `Pool`. Result observed during this audit: 28/28 test files spend a combined **3248 seconds (54 minutes)** retrying connections before failing the whole suite. **Severity: medium** — affects developer experience; doesn't ship to users but a clear quality-of-life win.

2. **Pre-commit `check-empty-tests.sh` is a false-positive generator.** The awk parser at [scripts/check-empty-tests.sh:42-54](../../scripts/check-empty-tests.sh#L42-L54) treats the first `^\s*}\);` it finds as the end of a `test()` body. When a test contains a nested arrow function (e.g. `await context.route('...', async (route) => { ... });`), the inner `});` is matched first — before any `expect(` or `page.` call inside the outer test runs through the regexes. **Effect:** tests with real content are flagged as "empty," and developers either resort to `--no-verify` (explicitly forbidden by CLAUDE.md) or are blocked. **Confirmed instances on master**: `autosave-race-conditions.spec.ts:179, 277` (both have `context.route` + real `expect`); `critical-blockers.spec.ts:118, 143` (similar); `session-timeout.spec.ts:505, 1099`. **Severity: high** — actively blocks commits; encourages bypass; ironic for a quality-gate hook.

### Hypotheses

- No `<ErrorBoundary>` wrapping `AppLayout` → an unhandled render error blanks the whole UI.
- Slow-3G probably exposes one of: dashboard query timing out without indicator, save-on-blur silently failing on a flaky network, or missing optimistic update for an obvious action.
- Malformed input on `properties` JSONB endpoints is only zod-validated on known keys (`.passthrough` patterns) — XSS via wiki content is rendered, so TipTap's sanitizer is the only line of defense.

### Improvement target

> 3 error-handling gaps fixed, ≥1 involving real user-facing data loss or confusion. Each fix needs repro steps + before/after.

---

## Category 7 — Accessibility

### Methodology

- Run Lighthouse (Chrome built-in) on every major route while signed in: `/my-week`, `/docs`, `/documents/:id`, `/issues`, `/programs`, `/team/allocation`, `/team/directory`, `/team/status`, `/team/org-chart`, `/settings`.
- Run `@axe-core/playwright` programmatically against the same set; save violations as JSON to `shipshape/audit/raw/axe-<route>.json`. Categorize by impact (Critical / Serious / Moderate / Minor).
- Keyboard nav: Tab through each route. Note any focus trap, lost focus, or unreachable element.
- Screen reader: NVDA on Windows (free). Verify landmarks, headings, and form labels.
- Color contrast: spot-check with the WCAG contrast checker on suspect tokens in the design system (theming via Tailwind + USWDS).

### Baseline

_(pending live app)_

### Existing infrastructure (preliminary read)

- USWDS tokens via `@uswds/uswds` — gives a reasonable a11y default.
- `@axe-core/playwright` is already a devDep (root `package.json`).
- Several E2E specs already exercise a11y: `accessibility.spec.ts` (11 tests), `accessibility-remediation.spec.ts` (57 tests — large!), `check-aria.spec.ts`, `status-colors-accessibility.spec.ts`. The team has invested here. **This means baselines might be _good_ — and the improvement target may need to focus on raising bar (Lighthouse score) rather than fixing critical violations (might already be at zero).**
- Recent commits (last week) include `838375e fix: use aria-label instead of aria-labelledby for USWDS Icon a11y` — active a11y work.
- **Zero `<div onClick=>` or `<span onClick=>` patterns** in `web/src/**/*.tsx` (positive finding from static grep). The codebase uses proper `<button>` elements for interactive elements. One major class of WCAG 2.1.1 (Keyboard) violations is structurally avoided.

### Improvement target

> +10 Lighthouse points on lowest-scoring page OR fix all Critical/Serious violations on top 3 pages.

---

## Status & blockers

| Blocker | Resolves when | What unlocks |
|---|---|---|
| `pnpm install` running in background | a few minutes | Build, tsc strict-probe, vitest |
| User starts `pnpm dev` per agreed plan | next step after install | Categories 3, 4, 6, 7 measurements |
| Postgres logging needs `log_statement = 'all'` | I'll request user toggle | Category 4 measurement |

---

## Provenance

- Repository commit at audit time: `076a183` (master HEAD when branched).
- Audit branch: `shipshape/audit`.
- All raw measurement outputs go in [raw/](raw/) and are committed (decided in kickoff Q&A).
- This report is updated incrementally as numbers come in; the Tuesday deadline version has every "_(pending)_" replaced with concrete numbers.
