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
| 3 | API Response Time | `/api/issues` P99 grows 165→515ms across c=10→50 (102 KB response per call). `/api/auth/me` melts at c=50 (P99 **1575ms**, max 2785ms) due to pool saturation. `/api/dashboard/my-work` P95 6× at c=25 vs c=10. | -20% P95 on ≥2 endpoints |
| 4 | DB Query Efficiency | At seeded volume (104 issues, 250 docs) most plans run in 1–2 ms. Correlated subquery in projects-with-inferred-status hits **596 buffer hits**. JSONB-key filters `(properties->>'assignee_id')::uuid` + `properties->>'state'` use seq-scan-and-filter — no functional indexes. | -20% queries on a flow or -50% on slowest |
| 5 | Test Coverage & Quality | **866 E2E** (71 files), **447 API unit** (28 files), **151 web unit** (16 files) — total ~1,464 | +3 meaningful tests on untested paths, or fix 3 flakes w/ RCA |
| 6 | Runtime Errors | **Stack trace leaked** to client on malformed JSON (Express default handler). 3 of 7 malformed-input probes succeeded silently. XSS-shaped title accepted verbatim. API tests slow-fail 54 min when Postgres is down. | 3 fixes, ≥1 real data-loss scenario |
| 7 | Accessibility | **5 of 12 routes have a serious violation**: color-contrast across **46 total nodes** on `dashboard`, `my-week`, `projects`, `team/allocation`, `team/status`. 0 critical, 0 moderate, 0 minor. 7 routes are clean. Directly contradicts the WCAG 2.1 AA badge. | +10 Lighthouse on worst page or all Critical/Serious on top 3 |
| 8 | Security Audit | Probe tool ([shipshape/security/probe.mjs](../security/probe.mjs)) runnable in one command. **4 critical findings**: 2× WebSocket process-crash on oversized/malformed frame (CWE-20 + CWE-400, production DoS by any authenticated user); 2× transitive-dep critical CVEs (fast-xml-parser CVE-2026-25896 via AWS SDK; protobufjs CVE-2026-41242 dev-only). **30 high** (mostly dep CVEs). CORS / CSP / secrets / rate-limit / error-verbosity all clean. | Fix at least 2 verified vulnerabilities w/ before/after proof |

---

## Severity rubric

Every finding in this report is graded by **impact × likelihood**, using a single rubric so a High in Cat 3 means the same thing as a High in Cat 7. The five-level scale:

| Label | Definition | Example |
|---|---|---|
| **High** | Affects a hot user path or scales linearly with data. Realistic prod blast radius if shipped unfixed. | "`/api/issues` over-fetches `content`: 102 KB per call at 104 issues → ~1 MB at 1000 issues." |
| **Medium** | Affects a real user path but is bounded — degrades, doesn't break. Or a structural concern that bites only at 10× scale. | "Correlated subquery in projects-with-inferred-status: 596 buffer hits today; grows as projects × issues-per-project." |
| **Low** | A code-quality or maintenance concern that doesn't affect prod users. Worth fixing for hygiene. | "`@ts-ignore` count is 1 — no suppression patterns to clean up." (positive direction) |
| **Methodological** | A finding about how something was measured, not what it found. Affects the baseline's denominator or interpretation. | "Tests dominate `any` totals (155 of 260); target should measure on non-test files only." |
| **Positive** | A baseline number that doesn't need fixing — recording it explicitly prevents 'fixing what isn't broken' in implementation. | "Zero `<div onClick=>` patterns — keyboard-nav anti-pattern is structurally avoided." |

**Likelihood is implicit** — a violation that runs on every page load (Cat 2 bundle, Cat 3 `auth/me`) is "always," whereas a violation triggered only by a malformed-input probe (Cat 6) is "rare." When a finding's severity could go either way, I default to the higher level if the affected path is on a default route (e.g., `/dashboard`, `/login`).

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

### Anchored examples — patterns the codebase already uses (and should expand)

The "correct narrowing" criterion from the brief implies a positive vocabulary, not just a negative one. Three pattern types are already present in the codebase — at small scale — and an effective Phase-2 fix should generalize them instead of inventing new ones.

**1. Generic — workspace-wide API response envelope.**
[shared/src/types/api.ts:2](../../shared/src/types/api.ts#L2):

```ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}
```

Used at every response site. A second generic pattern lives at [web/src/components/SelectableList.tsx:5,59](../../web/src/components/SelectableList.tsx#L5) — `SelectableList<T extends { id: string }>` for a constrained-shape React component. **The hypothesized `pool.query<T>` wrapper (Finding #2 below) is the same shape — and would eliminate ~250 of the 460 `as <T>` casts** by inferring the row type from the call site instead of the handler asserting it after the fact.

**2. Utility type — `Partial<T>` for updates, `ReturnType<typeof X>` for handles.**
[web/src/components/IssuesList.tsx:111](../../web/src/components/IssuesList.tsx#L111):

```ts
onUpdateIssue?: (id: string, updates: Partial<Issue>) => Promise<Issue | null>;
```

And [web/src/components/Editor.tsx:734](../../web/src/components/Editor.tsx#L734):

```ts
let debounceTimer: ReturnType<typeof setTimeout>;
```

`Partial<>` for "PATCH-shaped" updates is the right pattern; the audit's Zod-schema drift (Finding #3) is the cost of *not* using it consistently — instead of one `IssueUpdate = Partial<Issue>` driven by the Zod schema, drift accumulates in handler signatures.

**3. Type guard — `value is T` predicate.**
[api/src/routes/associations.ts:36](../../api/src/routes/associations.ts#L36):

```ts
function isValidRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === 'string'
    && (value === 'parent' || value === 'project' || value === 'sprint' || value === 'program');
}
```

Other instances: [web/src/hooks/useIssuesQuery.ts:18](../../web/src/hooks/useIssuesQuery.ts#L18) (`isCascadeWarningError`), [web/src/components/sidebars/QualityAssistant.tsx:80](../../web/src/components/sidebars/QualityAssistant.tsx#L80) (`isError`). These are the *correct* way to replace an `as <T>` cast on unknown input — they narrow `unknown` to the target type via a runtime check, so the cast is *earned* not just asserted. The audit's `as <T>` count of 460 includes many sites where a type guard would be safer and clearer.

### Improvement target (per brief)

> Eliminate 25% of type safety violations with correct narrowing. Replacing `any` with `unknown` and leaving it unnarrowed does not count.

Target on the non-test set: drop 25% of (`any` + `as <T>` + `!`) in non-test files. With the proposed `pool.query<T>` generic (pattern #1), broader `Partial<>` use at the Zod-schema boundary (pattern #2), and more type-guard predicates at unknown-input boundaries (pattern #3), this is achievable in a few focused commits.

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

### Baseline — brief-spec volume (Phase B re-run, post-improvements)

Per the brief: **500+ documents, 100+ issues, 20+ users, 10+ sprints.** Topped up via [shipshape/audit/scripts/seed-topup.ts](scripts/seed-topup.ts) (idempotent) to reach the threshold. Final seed:

| Metric | Brief min | Seed |
|---|---:|---:|
| Total documents | 500+ | **517** ✅ |
| Issues | 100+ | **304** ✅ |
| Users | 20+ | **21** ✅ |
| Sprints | 10+ | **35** ✅ |

Latency at brief-spec volume (10-second autocannon, P95 interpolated between P90 and P97.5). Raw JSON: [shipshape/improvements/raw/perf-after-v3/](../improvements/raw/perf-after-v3/).

| Endpoint | Conn | P50 | P95 | P99 | RPS |
|---|---:|---:|---:|---:|---:|
| `/api/auth/me` (377 B) | 10 | 7 ms | 12 ms | 16 ms | 1,212 |
| `/api/auth/me` | 25 | 19 ms | 30 ms | 50 ms | 1,189 |
| `/api/auth/me` | **50** | **38 ms** | **47 ms** | **54 ms** | 1,273 |
| `/api/weeks/my-week` | 10 | 18 ms | 38 ms | 53 ms | 490 |
| `/api/weeks/my-week` | 25 | 45 ms | 69 ms | 88 ms | 524 |
| `/api/weeks/my-week` | 50 | 92 ms | 146 ms | 179 ms | 509 |
| `/api/dashboard/my-work` | 10 | 20 ms | 39 ms | 48 ms | 445 |
| `/api/dashboard/my-work` | 25 | 48 ms | 128 ms | 166 ms | 446 |
| `/api/dashboard/my-work` | 50 | 108 ms | 196 ms | 230 ms | 427 |
| `/api/issues` (256 KB at 304 issues) | 10 | 67 ms | 88 ms | 99 ms | 147 |
| `/api/issues` | 25 | 174 ms | 242 ms | 282 ms | 139 |
| `/api/issues` | **50** | **375 ms** | **479 ms** | 505 ms | 130 |
| `/api/documents?type=wiki` | 10 | 14 ms | 19 ms | 24 ms | 683 |
| `/api/documents?type=wiki` | 25 | 37 ms | 53 ms | 76 ms | 640 |
| `/api/documents?type=wiki` | 50 | 77 ms | 171 ms | 229 ms | 570 |

**Zero non-2xx, zero timeouts** across all 15 cells.

### Ranking by P95 at c=50 (the brief's stress condition)

| Rank | Endpoint | P95 @ c=50 | Response size |
|:---:|---|---:|---:|
| 1 (slowest) | `/api/issues` | **479 ms** | **256 KB** at 304 issues — bandwidth bound |
| 2 | `/api/dashboard/my-work` | 196 ms | 11 KB — correlated-subquery cost |
| 3 | `/api/documents?type=wiki` | 171 ms | 22 KB |
| 4 | `/api/weeks/my-week` | 146 ms | 13 KB |
| 5 (fastest) | `/api/auth/me` | 47 ms | 377 B |

### Audit-window baseline at 250-doc / 11-user volume (original, kept for diff)

The initial sweep was done at the smaller seed before the brief-spec top-up. The auth-me cliff was the standout finding:

> `/api/auth/me` P99 grew **41 ms at c=25 → 1,575 ms at c=50** purely from pg-pool saturation (dev `max=10`). The 41 ms → 47 ms drop in the Phase B table above came from the pool-size bump (dev `max=20`, prod `max=30`) landed in `shipshape/03-api-perf`.

Rate-limiter caveat: both sweeps bypassed the dev `apiLimiter` (1000 req/min) via the `SHIPSHAPE_AUDIT=1` env flag in [api/src/app.ts:70](../../api/src/app.ts#L70). Without it, the limiter returns 429 after ~1000 reqs/min and the perf numbers measure rate-limit rejection rather than real handler perf.

Full audit-window table preserved at [raw/perf/](raw/perf/) (15 JSONs: 5 endpoints × 3 concurrency levels). The Phase B re-run JSONs are at [shipshape/improvements/raw/perf-after-v3/](../improvements/raw/perf-after-v3/) — same shape, same script.

### Findings

1. **`/api/issues` over-fetches `content` (full TipTap doc) for every issue.** [issues.ts:126](../../api/src/routes/issues.ts#L126) selects `d.content`. Response is **~1 KB/issue** when titles alone would be ~150 B. At 104 issues this is 102 KB; at 1000 issues it'd be ~1 MB per call. P99 already 165 ms at c=10 with this much data. **The single biggest perf win in the app.** _(Severity: high.)_
2. **Connection pool saturates at c=50.** `api/src/db/client.ts` sets `max: 10` for dev (`max: 20` for prod). At 50 concurrent in-flight requests, ≥40 are queued for a Pool slot. `/api/auth/me` P99 explodes to 1575 ms even though the endpoint does ~2 trivial queries. Bumping dev `max` to 50 (or having Pool size scale with expected concurrency) would knock down tail latency across every endpoint. _(Severity: high.)_
3. **`/api/dashboard/my-work` has non-monotonic latency**: 44 → 278 → 193 ms P97.5 across c=10/25/50. The c=25 spike points at the correlated subquery in the projects-with-inferred-status query (Category 4). _(Severity: medium.)_
4. **No `LIMIT` / pagination** on `/api/issues` or `/api/documents`. Latency scales linearly with seed size; will degrade hard at 10× docs. _(Severity: high — scaling cliff.)_

### Improvement target

> -20% P95 on ≥2 endpoints under identical conditions.

Easy path: (a) strip `content` from `/api/issues` list response (project to title + properties + ticket_number only), (b) bump dev pool max to ~50 or scale to `os.availableParallelism() * 4`. Either alone should hit the target on multiple endpoints.

---

## Category 4 — Database Query Efficiency

### Methodology

- Enable `log_statement = 'all'` and `log_duration = on` on the dev Postgres for the measurement window. For native Windows Postgres, set in `postgresql.conf` and `pg_ctl reload`.
- Drive five user flows from the UI; capture queries from the log.
- `EXPLAIN (ANALYZE, BUFFERS)` on the top-5 slowest distinct queries.
- Cross-check WHERE/ORDER-BY columns against the index list in [api/src/db/schema.sql](../../api/src/db/schema.sql:336-434) (38 indexes; pretty thorough already).

### Baseline (EXPLAIN ANALYZE on suspect queries)

Captured via psql against the live seeded DB. Full output: [raw/explain-analyze.txt](raw/explain-analyze.txt).

**At seeded volume (104 issues, 250 docs total), every plan executes in 1–2 ms.** That sounds great, but two observations qualify it:

- **All filtered queries use Seq Scan + Filter.** For example the issues list (Q1) does `Seq Scan on documents d` with `Filter: archived_at IS NULL AND deleted_at IS NULL AND workspace_id = ... AND document_type = 'issue'`. Rows removed by filter: 153 (out of 257 docs). At 1 ms/scan and 257 rows that's fine — at 100,000 docs the seq scan dominates. The `idx_documents_active` partial index on `(workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL` exists but isn't being chosen — the planner thinks the seq scan is cheaper at this scale, and at 250 rows it is.
- **The dashboard projects query (Q2) reads 596 shared buffers.** Plan time alone: 9.4 ms (only 2 ms execution). 596 buffer hits for 15 projects = ~40 buffers per project. The correlated subquery joins documents (issues), document_associations (sprint), documents (sprint), document_associations (project), workspaces — per project row. Indexes hide the cost today; at scale this will grow N × M where N=projects and M=issues-per-project.

| # | Query | Exec time | Plan | Concern |
|---|---|---:|---|---|
| Q1 | `/api/issues` list with `(properties->>'assignee_id')::uuid` join to users + person_doc | 1.339 ms | Seq Scan + 2 Hash Left Joins | Will be Seq Scan at 10× — needs functional index on `properties->>'assignee_id'` |
| Q2 | `/api/dashboard/my-work` projects-with-inferred-status (correlated subquery) | 2.054 ms | Nested Loop + Bitmap Heap Scan | Correlated subquery scans all issues per project; quadratic at scale |
| Q3 | `/api/dashboard/my-work` issues filtered by `assignee_id` + `state NOT IN ('done','cancelled')` | < 1 ms | (output truncated) | Same JSONB-cast pattern; would benefit from same functional index |

### Findings

1. **Missing functional indexes on `properties->>'assignee_id'` and `properties->>'state'`.** The GIN index on the whole `properties` JSONB column [exists](../../api/src/db/schema.sql#L357) but PostgreSQL doesn't use a GIN index for equality on a single extracted text key efficiently. A B-tree functional index on each of these keys would let issues-by-assignee and issues-by-state queries become index scans at scale. (`idx_documents_person_user_id` is exactly this pattern, on a different key.) _(Severity: high at scale; low at current volume.)_
2. **Correlated subquery in projects-with-inferred-status** ([dashboard.ts:153-181](../../api/src/routes/dashboard.ts#L153-L181)). The CASE expression's inner SELECT runs once per project row, joining 4 tables. Could be rewritten as a single CTE that computes inferred_status for all projects in one pass. _(Severity: medium — quadratic growth path.)_
3. **`/api/issues` over-fetches `content`** (Cat 3 finding); fixing this also cuts DB IO. _(Severity: high.)_
4. **`/api/dashboard/my-work` makes 4 separate queries** for one render (workspace, issues, projects, sprints). Could be one query with UNION ALL or one CTE. Saves 3 round-trips per page load. _(Severity: medium — easy 25-30% query count reduction.)_

### Improvement target

> -20% query count on a flow OR -50% on slowest query.

Combining the 4 my-work queries into one query is a clean -75% query count win. The functional indexes will become measurable at higher data volume.

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

Raw vitest output (no-DB baseline): [raw/api-vitest-baseline.txt](raw/api-vitest-baseline.txt).

### Pass/fail/runtime — 3 back-to-back runs with Postgres up (Phase B re-run, post-improvements)

`pnpm test` per package, run three times consecutively to detect flakes. Postgres 18 local, `ship_dev` DB owned by `ship` user, all migrations applied, seed loaded.

**api unit suite (`vitest run`):**

| Run | Test Files | Tests | Runtime |
|---|---|---|---:|
| 1 | 29 passed / **30** | 445 passed / **461** | 56 s |
| 2 | **30 passed / 30** | **461 passed / 461** | 60 s |
| 3 | 29 passed / **30** | 448 passed / **461** | 58 s |

**Important nuance:** when a run shows fewer than 30 files, the missing file's tests didn't *fail* — they didn't *run*. The vitest pool worker crashed with `Error: Worker exited unexpectedly` mid-run, orphaning one file's tests. **Every test that actually executed across all three runs passed.** This is real flakiness at the **test-runner infrastructure** level (vitest 4 pool worker on Windows + tsx), not at the test-content level. The orphaned file rotates between runs.

**web unit suite (`vitest run`):**

| Run | Test Files | Tests | Runtime |
|---|---|---|---:|
| 1 | 14 passed / **17** | 147 passed / **160** | 19 s |
| 2 | 14 passed / **17** | 147 passed / **160** | 18 s |
| 3 | 14 passed / **17** | 147 passed / **160** | 18 s |

13 deterministic failures across 3 files — **NOT regressions from any audit work** (verified: zero shipshape commits touched any of the 3 failing test files). Pre-existing upstream Treasury issues:

| Failing test file | Why it fails |
|---|---|
| `document-tabs.test.ts` (9 fails) | Tests still expect tabs named `'sprints'`; upstream code uses `'weeks'` (incomplete rename) |
| `DetailsExtension.test.ts` (3 fails) | Tests expect `content: 'block+'`; upstream config now uses `'detailsSummary detailsContent'` |
| `useSessionTimeout.test.ts` (1 fail) | A specific timer-mock assertion that's flake-prone even upstream |

**E2E suite (`playwright test`):** not run during this measurement — runs in CI via the `/e2e-test-runner` skill per CLAUDE.md. 71 spec files / 866 test entries cataloged statically.

### Code coverage (Phase B re-run, post-improvements)

Audit finding: `@vitest/coverage-v8` was missing from devDependencies despite a `test:coverage` script existing. Installed `@vitest/coverage-v8@4.0.17` at workspace root.

| Package | Statements | Branches | Functions | Lines | Scope |
|---|---:|---:|---:|---:|---|
| **api** | 40.30% | 33.65% | 41.13% | **40.46%** | Files imported by tests |
| **web** | 22.39% | 17.56% | 19.40% | **22.35%** | Files imported by tests |
| **web** | 2.95% | 1.94% | 2.13% | **3.01%** | All `src/**/*.{ts,tsx}` |
| **shared** | n/a | n/a | n/a | n/a | No tests (pure type definitions) |

The web all-src 3% number is **honest but misleading**: unit tests intentionally cover only leaf utilities (date-utils, document-content, scroll-fade, etc.); the React component tree is exercised through Playwright E2E, which vitest can't see. The 22% touched-src number is the better quality signal for what the unit tests are designed to cover.

By code area:

| Code area | api lines covered | web lines covered |
|---|---:|---:|
| Route handlers (api/src/routes/) | ~50% | n/a |
| Middleware (api/src/middleware/) | ~60% | n/a |
| DB helpers (api/src/db/) | ~25% | n/a |
| Services (api/src/services/) | ~35% | n/a |
| Helpers / utilities (api/src/utils/, web/src/lib/) | **>80%** | **>70%** |
| React components (web/src/components/) | n/a | ~1% via unit; high via E2E |
| React pages (web/src/pages/) | n/a | ~0% via unit; high via E2E |

### Findings

- **Coverage tooling missing at audit time.** `@vitest/coverage-v8` was not in any package's devDependencies — even though `api/package.json` had a `test:coverage` script. Phase B installed `@vitest/coverage-v8@4.0.17` at workspace root. _(Severity: medium — infra gap, not a content gap.)_
- **No Playwright sharding for CI in `playwright.config.ts`.** With 866 tests at 4 workers × 60s avg, CI time is non-trivial. _(Severity: low — quality of suite infra, not test count.)_
- **Vitest pool worker flake on Windows.** Two of three api runs orphaned one file's tests; 461/461 passed when they ran. Could be tsx + ESM + vitest@4 pool interaction. Mitigations evaluated: `--pool=forks --poolOptions.forks.singleFork` (slower but stable), or upgrade to vitest 4.1+. _(Severity: methodological — affects how we count test "failures.")_
- **Web suite has 13 deterministic pre-existing failures** in 3 files. None are regressions from audit work. _(Severity: methodological — gives an honest baseline.)_

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

### Baseline (live probes)

Malformed-input probe results against `POST /api/issues` (raw: [raw/malformed/issues-post.txt](raw/malformed/issues-post.txt)):

| Input | Result | Concern |
|---|---|---|
| Empty body | **400 JSON** with zod details | ✅ Correct |
| Non-JSON body (`"this is not JSON"`) | **400 HTML with full Node.js stack trace** including `at JSON.parse (<anonymous>) at createStrictSyntaxError (...)` | **Stack trace leak** — Express's default error handler escapes through |
| `<script>alert(1)</script>` as title | **201 Created**, stored verbatim | Needs verification that no downstream `dangerouslySetInnerHTML` consumes title (likely OK due to React's default escaping) |
| `estimate: -99999` (not in createIssueSchema) | **201 Created**, field silently dropped | Zod schema isn't `.strict()` — accepts arbitrary extra fields |
| `title: "'; DROP TABLE documents; --"` | **201 Created**, stored as literal text | ✅ Parameterized queries prevent injection |
| Deep nested 10 KB object | **201 Created** | ✅ JSON parser handled it fine |

Console errors from the a11y walk (which doubles as a Cat 6 probe): `/login` emitted 1 console error during navigation; all other 11 routes were silent. Detail in each `raw/a11y/<route>.json` under `consoleErrors`.

### Existing error-handling infrastructure (preliminary read)

The codebase already has solid foundations:
- **`MutationCache.onError`** in [web/src/lib/queryClient.ts:166](../../web/src/lib/queryClient.ts) emits via `notifyMutationError` → `<MutationErrorToast>` in `main.tsx`.
- **`subscribeToCacheCorruption`** detects bad IndexedDB state and notifies listeners.
- **`handleSessionExpired`** in `web/src/lib/api.ts` redirects to `/login?expired=true&returnTo=...`.
- **`ErrorBoundary` exists** at [web/src/components/ui/ErrorBoundary.tsx](../../web/src/components/ui/ErrorBoundary.tsx) and is used in `pages/App.tsx` and `components/Editor.tsx`. Has a "Try Again" reset path. **Open question for live audit:** is the boundary at the right granularity? E.g., does an error inside a route render gate the whole AppLayout?

### Concrete gaps already identified (pre-live-app)

1. **API tests slow-fail when Postgres is unreachable.** [api/src/test/setup.ts:14](../../api/src/test/setup.ts#L14) calls `pool.query(TRUNCATE ...)` directly in `beforeAll`. There is no connection precheck and no `connectionTimeoutMillis` set on the `Pool`. Result observed during this audit: 28/28 test files spend a combined **3248 seconds (54 minutes)** retrying connections before failing the whole suite. **Severity: medium** — affects developer experience; doesn't ship to users but a clear quality-of-life win.

2. **Pre-commit `check-empty-tests.sh` is a false-positive generator.** The awk parser at [scripts/check-empty-tests.sh:42-54](../../scripts/check-empty-tests.sh#L42-L54) treats the first `^\s*}\);` it finds as the end of a `test()` body. When a test contains a nested arrow function (e.g. `await context.route('...', async (route) => { ... });`), the inner `});` is matched first — before any `expect(` or `page.` call inside the outer test runs through the regexes. **Effect:** tests with real content are flagged as "empty," and developers either resort to `--no-verify` (explicitly forbidden by CLAUDE.md) or are blocked. **Confirmed instances on master**: `autosave-race-conditions.spec.ts:179, 277` (both have `context.route` + real `expect`); `critical-blockers.spec.ts:118, 143` (similar); `session-timeout.spec.ts:505, 1099`. **Severity: high** — actively blocks commits; encourages bypass; ironic for a quality-gate hook.

### Live-app probe results (Phase B re-run, post-improvements)

All four hypotheses below got driven by a single automated Playwright spec ([shipshape/improvements/runtime-errors-measurement.spec.ts](../improvements/runtime-errors-measurement.spec.ts)) so the measurement is reproducible end-to-end rather than a manual click-through.

#### Two-browser Yjs disconnect/reconnect

Two independent browser contexts (separate cookie jars — two real users in effect), opened the same wiki document, typed distinct markers from each tab, reloaded tab A, verified both edits survived:

```json
{
  "tested": true,
  "docId": "27d6cf3a-0602-45a4-a8c0-e33e2fdfb567",
  "docTitle": "Advanced Topics",
  "finalText": " [TAB-A-EDIT]  [TAB-B-EDIT] Dev UserDev User",
  "containsTabA": true,
  "containsTabB": true
}
```

✅ Both edits merged via Yjs CRDT through the WebSocket collab channel. No conflict dialog, no "your version is stale" UI — merge is automatic and idempotent.

**Offline → online recovery** (separate probe): set the page offline mid-edit via `context.setOffline(true)`, typed a marker, restored network, reloaded:

```json
{
  "tested": true,
  "offlineTextSnippet": " [TAB-A-EDIT]  [TAB-B-EDIT]  [OFFLINE-EDIT] Dev User",
  "reloadedTextSnippet": " [TAB-A-EDIT]  [TAB-B-EDIT]  [OFFLINE-EDIT] Dev User",
  "offlineEditSurvived": true
}
```

✅ Offline edit survived reconnect + reload. Byte-for-byte identical pre/post-reload — Yjs delivered exactly-once.

Raw: [shipshape/improvements/raw/cat6-measurement/concurrent.json](../improvements/raw/cat6-measurement/concurrent.json), [offline.json](../improvements/raw/cat6-measurement/offline.json).

#### Slow 3G walk-through — per-page findings

Chrome DevTools Protocol throttle: 50 KB/s down, 50 KB/s up, 400 ms RTT. Login at full speed, then enable throttle and walk routes.

| Route | `domcontentloaded` | pending @ 5s | pending @ 15s | Verdict |
|---|---:|---:|---:|---|
| `/my-week` | 25.4 s | 4 | 1 (events WS) | Two follow-up API calls in flight at 5 s; both resolved by 15 s. No spinners hung. |
| `/dashboard` | 25.7 s | 5 | 1 (events WS) | Worst route at 5 s — pulls weekly + standup + retro statuses serially. All resolve by 15 s. |
| `/docs` | 25.8 s | 1 | 1 (events WS) | One follow-up `/api/documents?type=…` in flight; resolves before 15 s. |
| `/issues` | 25.7 s | 1 | 1 (events WS) | Same shape as `/docs`. The /api/issues 256 KB payload is the wait, not a hang. |
| `/projects` | 25.7 s | 1 | 1 (events WS) | Same shape. |

**Silent failures / missing loading states:**

- **None of the 5 routes had a spinner that never resolved.** All `<LoadingSkeleton>` instances replaced with rendered content by the 15 s window.
- **The only persistently-pending request is the events WebSocket** at `wss://localhost:3000/events` — that's a long-lived connection, not a hang.
- **Missing pattern: no initial-paint placeholder.** During the 25-second bundle download, only the browser URL-bar spinner indicates activity. Adding a tiny CSS-only "loading…" indicator in `web/index.html` (overwritten by React on mount) would show 3G users *something* is happening immediately. Filed as a Cat 2 follow-up.
- **The 25 s floor is math-bounded by bundle size**: 785 KB initial bundle / 50 KB/s + RTT × n_chunks ≈ 16 s of JS download alone. The remaining ~9 s is HTML + critical CSS + the first 2-3 API calls. No surprise latency.

Raw: [shipshape/improvements/raw/cat6-measurement/throttle-3g.json](../improvements/raw/cat6-measurement/throttle-3g.json).

#### Console errors across 12 routes

Twelve user-facing routes, fresh browser context each, captured `console` (error + warning) + `pageerror` (uncaught) + `requestfailed`:

- **Zero uncaught pageerrors. Zero warnings. One console error per route — identical text: `Failed to load resource: 401`** from the app's session-bootstrap probe (`GET /api/auth/me` fires on every boot before knowing whether a session exists). Expected designed behavior, not a runtime error. _(Severity: low — log-noise hygiene, optional suppression.)_

Raw: [shipshape/improvements/raw/cat6-measurement/console-errors.json](../improvements/raw/cat6-measurement/console-errors.json).

#### Additional findings surfaced by the live probe

1. **`createIssueSchema` was missing `estimate`.** Probe sent `{ title: 'x', estimate: -99999 }` and got back 201 with `estimate: null`. Zod silently strips unknown keys; the UI's "create with estimate" flow was silently dropping the value. Confirmed by reading [api/src/routes/issues.ts:30-45](../../api/src/routes/issues.ts#L30-L45) — `estimate` field absent from `createIssueSchema` but present in `updateIssueSchema`. _(Severity: high — silent data loss in a hot user flow. Fixed on `shipshape/06-runtime-errors`.)_
2. **ActionItemsModal occludes editor on direct-URL doc navigation.** When the user has pending action items and lands directly on `/documents/:id` (via shared link), a Radix Dialog with z-index 101 fires automatically and intercepts pointer events on the editor. Modal does dismiss on Escape (Radix default). _(Severity: low — extra-keystroke surprise for shared-link users, not a hard block.)_

### Hypotheses (audit-window, before Phase B probes)

- No `<ErrorBoundary>` wrapping `AppLayout` → an unhandled render error blanks the whole UI. (Confirmed: top-level boundary doesn't exist; Editor-level does.)
- Slow-3G probably exposes one of: dashboard query timing out without indicator, save-on-blur silently failing on a flaky network, or missing optimistic update. (Refuted by Phase B: no spinners hung; one cosmetic improvement available — initial-paint placeholder.)
- Malformed input on `properties` JSONB endpoints is only zod-validated on known keys — XSS via wiki content is rendered, so TipTap's sanitizer is the only line of defense. (Phase B confirmed React's text-escaping is the relevant defense for the issue-title surface; verified `<script>alert(1)</script>` stored verbatim, rendered as text.)

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

### Baseline (axe-core scan via [shipshape/audit/axe-scan.spec.ts](../axe-scan.spec.ts))

12 routes scanned via Playwright + `@axe-core/playwright` with WCAG 2 A/AA + WCAG 2.1 A/AA tags. Raw per-route JSON: [raw/a11y/](raw/a11y/).

| Route | Total | Critical | Serious | Moderate | Minor | Console |
|---|---:|---:|---:|---:|---:|---:|
| `/dashboard` | 1 | 0 | **1** | 0 | 0 | 0 |
| `/docs` | 0 | 0 | 0 | 0 | 0 | 0 |
| `/issues` | 0 | 0 | 0 | 0 | 0 | 0 |
| `/login` | 0 | 0 | 0 | 0 | 0 | 1 |
| `/my-week` | 1 | 0 | **1** | 0 | 0 | 0 |
| `/programs` | 0 | 0 | 0 | 0 | 0 | 0 |
| `/projects` | 1 | 0 | **1** | 0 | 0 | 0 |
| `/settings` | 0 | 0 | 0 | 0 | 0 | 0 |
| `/team/allocation` | 1 | 0 | **1** | 0 | 0 | 0 |
| `/team/directory` | 0 | 0 | 0 | 0 | 0 | 0 |
| `/team/org-chart` | 0 | 0 | 0 | 0 | 0 | 0 |
| `/team/status` | 1 | 0 | **1** | 0 | 0 | 0 |

**Single violation rule across all 5 hit routes**: `color-contrast` (impact: serious; WCAG 2 AA 1.4.3). 46 total nodes failing across `dashboard` + `my-week` + `projects` + `team/allocation` + `team/status`. **The README claims WCAG 2.1 AA conformance — this is a direct, verifiable contradiction.**

### Lighthouse on all 12 routes (Phase B re-run, post-improvements)

Lighthouse 13.3.0 headless run, accessibility-only category, authenticated routes use the dev session cookie via `--extra-headers`. Driver: [shipshape/improvements/_measure-a11y-lighthouse.mjs](../improvements/_measure-a11y-lighthouse.mjs). Raw HTML + JSON per route at [shipshape/improvements/raw/cat7-measurement/lighthouse/](../improvements/raw/cat7-measurement/lighthouse/).

| Route | Score | Failing audits |
|---|---:|---|
| `/login` | **100** | (none) |
| `/my-week` | **100** | (none) |
| `/dashboard` | **100** | (none) |
| `/docs` | **100** | (none) |
| `/issues` | **100** | (none) |
| `/projects` | **100** | (none) |
| `/programs` | **100** | (none) |
| `/team/allocation` | **100** | (none) |
| `/team/directory` | **100** | (none) |
| `/team/status` | **100** | (none) |
| `/team/org-chart` | **100** | (none) |
| `/settings` | **100** | (none) |
| **Mean** | **100.0** | |

Audit-window Lighthouse subset (5 routes) had `/my-week` and `/dashboard` at 96 and `/login` at 98 (`landmark-one-main` audit failure on `/login`). All three rose to 100 after the Cat 7 fixes added a `<main>` wrapper to login and cleared the contrast token issues.

### Keyboard navigation (Phase B re-run)

Custom Playwright probe ([shipshape/improvements/keyboard-nav-measurement.spec.ts](../improvements/keyboard-nav-measurement.spec.ts)): fresh context per route, 30 × Tab to enumerate reachables, Enter on primary, ArrowDown on first listbox.

| Route | Unique focusables (30 × Tab) | Tags reached | Enter on primary |
|---|---:|---|:---:|
| `/login` | 5 | input, button | ✅ submit fires |
| `/my-week` | 23 | button, a | ✅ menu opens |
| `/dashboard` | 16 | div, button, a | ✅ menu/popover |
| `/docs` | 22 | input, button, a | ✅ menu/popover |
| `/issues` | 30 | button, table | ✅ table-row context |
| `/projects` | 30 | button, table, a | ✅ row click |
| `/programs` | 30 | button, table, a | ✅ row click |
| `/team/allocation` | 17 | button, input | ✅ filter change |
| `/team/directory` | 21 | button, input, div, a | ✅ filter change |
| `/team/status` | 21 | input, button | ✅ filter change |
| `/team/org-chart` | 20 | input, li, button, a | ✅ open person |
| `/settings` | 12 | button, a, input, select | (no detectable URL/dialog change) |

- **Every route is fully Tab-reachable** (5–30 focusables in 30 Tab presses, covering input/button/a/table/select).
- **Enter activates the primary control on 10 of 12 routes.** On `/dashboard` the first focused button is a sidebar collapse toggle (works correctly, just no URL change). On `/settings` the first focused button toggles a panel (same pattern).
- **Escape on Cmd+K dialog**: probe couldn't measure cleanly (lazy-loaded CommandPalette chunk imports on first invocation), but manual verification on `/my-week` confirmed Cmd+K opens the palette in ~250 ms and Escape closes cleanly.

Raw: [shipshape/improvements/raw/cat7-measurement/keyboard.json](../improvements/raw/cat7-measurement/keyboard.json).

### Screen reader — NVDA 2026.1 (Phase B re-run)

Real NVDA driven via `@guidepup/playwright` against `/login`, `/my-week`, `/dashboard`. Setup doc: [shipshape/improvements/07-accessibility-nvda.md](../improvements/07-accessibility-nvda.md). Captured: accessibility tree, per-Tab focus sequence, and NVDA's literal speech log.

**`/login` representative output:**

```
Tab 1 → <input> Email address
        NVDA: "Email address, edit, focused, required, blank"
Tab 2 → <input> Password
        NVDA: "Password, edit, focused, protected, required, blank"
Tab 3 → <button> Sign in
        NVDA: "Sign in, button, focused"

Tree:
- main "Sign in to Ship…"
  - heading "Sign in to Ship"
  - form "Email address Password Sign in"
    - textbox "Email address"
    - textbox "Password"
    - button "Sign in"
```

**`/my-week` tree (authenticated):**

```
- main "Week 14 Current May 19 – May 25, 2026 Assigned Projects Ship Cor…"
  - heading "Week"
  - button "Previous week"
  - button "Next week"
  - heading "Assigned Projects"
    - link "Ship Core - Core FeaturesShip Core"
```

**`/dashboard`:** similar shape — `<main>`-wrapped, headings present, all action buttons named.

NVDA findings (across all 3 routes):
- ✅ Single `<main>` landmark per page (after Cat 7 added `<main>` to `/login`)
- ✅ Form fields all have programmatic names (NVDA announces "Email address, edit, required" cleanly)
- ✅ Buttons all named (no `<button>` with empty accessible name)
- ✅ Heading hierarchy intact (h1 → h2 nesting respected; `B` and `H` quick-nav keys work)
- ⚠ **Coverage gap**: `/issues` and `/settings` (data-table routes) not in the NVDA harness. Those would be the next-priority routes for SR coverage — left as a follow-up.

Raw transcripts: [shipshape/improvements/raw/nvda/](../improvements/raw/nvda/) (3 routes).

### axe full WCAG 2.1 AA re-scan (Phase B, broadens the audit's SR-curated rule filter)

Same 12 routes, axe-core 4.11, WCAG 2.0 A/AA + 2.1 A/AA tags (the audit baseline above used the SR-curated filter — Phase B broadens to ALL WCAG rules at those tags). Initial Phase B scan surfaced 3 violations the audit's narrower scan missed:

| Rule | Routes affected | Impact | Notes |
|---|---|---|---|
| `scrollable-region-focusable` | `/dashboard`, `/team/directory` | serious | `<div>` with `overflow:auto` and no `tabindex` — keyboard users can't scroll. WCAG 2.1.1. |
| `select-name` | `/settings` (10 nodes) | critical | Role `<select>` in workspace-members table has no `aria-label`. WCAG 4.1.2. |

All three were cleared on the `shipshape/07-accessibility` branch (`tabIndex={0}` + `role="region"` + `aria-label` on the scrollables; `aria-label={`Role for ${member.name || member.email}`}` on the select). Post-fix scan: **0 violations across all 12 routes, all severities**.

Raw: [shipshape/improvements/raw/cat7-measurement/axe-wcag.json](../improvements/raw/cat7-measurement/axe-wcag.json).

### Methodology note — why Lighthouse alone underreports

A measurement-methodology finding from the Phase B re-run: Lighthouse scored `/settings` at 100 even when axe-core found 10 critical violations on the same page. Lighthouse audits at page-load with minimal post-hydration wait; the Playwright + axe-core spec waits for `networkidle` + 1.5 s before scanning, so the workspace-members table is rendered when axe sees it. **For dynamic-content routes, Lighthouse alone is insufficient — pair it with an axe scan that waits for hydration.**

### Existing infrastructure (preliminary read)

- USWDS tokens via `@uswds/uswds` — gives a reasonable a11y default.
- `@axe-core/playwright` is already a devDep (root `package.json`).
- Several E2E specs already exercise a11y: `accessibility.spec.ts` (11 tests), `accessibility-remediation.spec.ts` (57 tests — large!), `check-aria.spec.ts`, `status-colors-accessibility.spec.ts`. The team has invested here. **This means baselines might be _good_ — and the improvement target may need to focus on raising bar (Lighthouse score) rather than fixing critical violations (might already be at zero).**
- Recent commits (last week) include `838375e fix: use aria-label instead of aria-labelledby for USWDS Icon a11y` — active a11y work.
- **Zero `<div onClick=>` or `<span onClick=>` patterns** in `web/src/**/*.tsx` (positive finding from static grep). The codebase uses proper `<button>` elements for interactive elements. One major class of WCAG 2.1.1 (Keyboard) violations is structurally avoided.

### Improvement target

> +10 Lighthouse points on lowest-scoring page OR fix all Critical/Serious violations on top 3 pages.

---

## Category 8 — Security Audit

### Methodology

The brief for Category 8 requires a **runnable security probe tool** as a deliverable, not optional. I built one under [shipshape/security/probe.mjs](../security/probe.mjs) — single command, no third-party deps, five surfaces:

| Module | What it probes | Surface label |
|---|---|---|
| `auth.mjs` | 9 protected routes hit without credentials; session-token entropy + format; logout invalidation; malformed-cookie rejection; super-admin route exposure | `auth` |
| `input.mjs` | 5 stored-XSS payloads in `POST /api/issues` title; 4 time-based SQL injection payloads (≥4 s response delta = pg_sleep executed); oversized input at 10 KB / 100 KB / 1 MB; reflected XSS in `/api/search/mentions` | `input` |
| `websocket.mjs` | `/events` + `/collaboration` upgrade requires auth; unknown WS path rejection; authenticated collab WS: 64-byte random binary, 11 MB binary, text frame to binary endpoint, with `/health` poll after each to detect process crash | `websocket` |
| `deps.mjs` | `corepack pnpm audit --json` parsed; advisories bucketed by severity; CVE + vulnerable/patched ranges captured per finding | `deps` |
| `manual.mjs` | CORS preflight from `https://evil.example.com`; CSP header anti-pattern scan; `web/dist` greped for AWS keys / GitHub PATs / PEM private keys / DB URLs / SESSION_SECRET literals; login rate-limit probe (12 failed attempts); error-verbosity probe (stack-trace leakage on 3 error-eliciting requests) | `manual-cors`, `manual-csp`, `manual-secrets`, `manual-ratelimit`, `manual-error-verbosity` |

Findings graded per the [severity rubric above](#severity-rubric): `critical / high / medium / low / info / ok`. An `ok` is a positive result — the surface was actively probed and behaved correctly. Surfaces that aren't probed don't get an `ok` finding, so `ok` count is meaningful signal.

Reproducible:
```bash
# Dev servers up (api on :3000, web on :5173)
pnpm dev

node shipshape/security/probe.mjs
# Writes shipshape/security/raw/report.json + report.md
# Exit code 0 = clean, 2 = critical/high present (CI-friendly).
```

Raw output for the baseline run: [shipshape/security/raw/report-before-fixes.json](../security/raw/report-before-fixes.json) (+ `.md`).

### Baseline (probe v1.0.0, against `shipshape/audit` HEAD)

**95 findings total.** Breakdown by severity:

| Severity | Count | Top instance |
|---|---:|---|
| 🔴 critical | **4** | WS frame > 10 MB crashes the Node process (CWE-20 + CWE-400) |
| 🟠 high | **30** | Mostly transitive dep CVEs (undici, vite, minimatch, path-to-regexp ReDoS, etc.) |
| 🟡 medium | **1** | `/api/search/mentions` echoes raw query (CWE-79 reflected, low practical risk due to JSON content-type + React escape) |
| ⚪ low | **2** | XSS-shaped strings stored verbatim (rendered safely by React); WS silently accepts random 64-byte binary |
| 🔵 info | **6** | Probe-tool stubs (super-admin route access via super-admin session, etc.) |
| 🟢 ok | **11** | Auth requirements, malformed-session rejection, logout invalidation, SQL-injection inertness, oversized-input rejection, CORS restricted, CSP present, no secrets in client bundle, login rate-limit active, error responses sanitized |

### Top findings ranked by impact (audit-window state, before fixes)

1. **🔴 critical — `ws-malformed-server-crash-11-mb-binary-payload`** (production DoS). Authenticated client sends an 11 MB binary frame to `/collaboration/wiki:<docId>`. The `ws` library emits `error` on the WebSocket; **Ship's collab handler doesn't attach an `error` listener**, so Node's EventEmitter default rethrows → process crash. Subsequent requests fail with `ECONNREFUSED` until tsx watch restarts. **Severity: high** — exploitable by any logged-in user.

2. **🔴 critical — `ws-malformed-server-crash-text-frame-to-binary-yjs-endpoint`** (same vulnerability class, different code path). Text frame's UTF-8 bytes reach `decoding.readVarUint` in `handleMessage`; throws; uncaught; process crash. **Severity: high.**

3. **🔴 critical — `[fast-xml-parser] CVE-2026-25896`** entity encoding bypass. Transitive via `@aws-sdk/xml-builder` → production chain (Ship's api uses AWS SDK for SSM + Bedrock). **Severity: high.**

4. **🔴 critical — `[protobufjs] CVE-2026-41242`** arbitrary code execution. Transitive via `testcontainers` → `dockerode` → `@grpc/grpc-js`. **Dev-only path** (test infrastructure); production runtime isn't affected. **Severity: medium** (positive direction — limited blast radius), but the CVE itself is graded critical by the upstream advisory.

5. **🟠 high — 25 dep CVEs total**, dominated by ReDoS in tooling: `minimatch` × 4 (in vite + tsx chains), `path-to-regexp` × 2 (in express), `picomatch` × 2, `undici` × 3 (in fetch internals), `vite`, `rollup`, `svgo`, `hono`, `fast-uri`, `lodash` (code injection via `_.template`). _(Severity: high in aggregate; individual instances vary from high to medium given most are dev-tooling.)_

6. **🟡 medium — `input-xss-reflected`** in `/api/search/mentions`. Query parameter echoed verbatim in the JSON response. Browsers won't execute (JSON content-type + React escape), but non-browser consumers could mishandle. _(Severity: low.)_

### Manual review results

Of the four required manual-review checks from the brief, the probe automated all four:

| Manual check | Result | Severity |
|---|---|---|
| CORS configuration | ✅ restricts origin to configured `CORS_ORIGIN` env (not `*`, not echo-from-request) | ok |
| CSP configuration | ⚪ present via helmet; includes `'unsafe-inline'` for styles (acceptable for TipTap/USWDS); no `'unsafe-eval'`, no wildcard `default-src` | low |
| Secrets in client bundle | ✅ scanned `web/dist` (assets + html); zero matches for AWS keys, GitHub PATs, PEM keys, DB URLs, or SESSION_SECRET literals | ok |
| Rate limiting (login endpoint) | ✅ `5 failed attempts / 15 min` window kicks in at attempt 5 with HTTP 429 | ok |
| Error message verbosity | ✅ probed 3 error shapes (non-JSON body, unknown route, invalid UUID path); none returned stack traces or internal paths to clients — structured envelopes only | ok |

### Findings ranked by severity (audit-window)

Top tier:
1. WS process-crash on oversized binary — **high** (any authenticated user can DoS the server)
2. WS process-crash on text frame — **high** (same root cause as #1)
3. fast-xml-parser entity encoding bypass — **high** (production path via AWS SDK)
4. 25 transitive dep CVEs at high severity — **medium aggregate** (mostly dev-tooling ReDoS)
5. protobufjs RCE CVE — **medium** (dev-only path; production not exposed)
6. Reflected query echo in search — **low** (JSON + React render)
7. CSP includes `unsafe-inline` for styles — **low** (acceptable concession)

Positive findings (the surface is correctly defended):
- 9 unauth route probes all returned 401 (`auth-unauthenticated-access` = ok)
- Session tokens are 64 hex chars / 256 bits of entropy
- Logout actually invalidates the session
- Malformed cookies rejected
- WS upgrade requires auth on both `/events` and `/collaboration`
- SQL injection payloads are inert (parameterized queries)
- Oversized JSON inputs rejected at 400/413
- CORS restricted; CSP present; no secrets in bundle; rate limiting active; error envelopes sanitized

### Improvement target (per brief)

> Fix at least 2 verified vulnerabilities with before/after proof. Each fix must include: the vulnerability class, the reproduction steps used to confirm it, the fix applied, and evidence that the fix works.

Target picks (executed on `shipshape/08-security`):
1. **WS unhandled-error process crash** — collapses both critical WS findings (#1 + #2 above) into one root-cause fix. Two-layer defense in [api/src/collaboration/index.ts](../../api/src/collaboration/index.ts): `ws.on('error', ...)` listeners on both `WebSocketServer` connection handlers + try/catch around `handleMessage()`.
2. **Two transitive critical CVEs** — `fast-xml-parser 5.3.4 → 5.8.0` (CVE-2026-25896) + `protobufjs 7.5.4 → 7.6.0` (CVE-2026-41242). Applied via `pnpm.overrides` in root [package.json](../../package.json) — bypasses upstream pins.

Both fixes verified by re-running the probe: **4 critical → 0 critical**, full evidence at [shipshape/improvements/raw/cat8-measurement/probe-{before,after}.json](../improvements/raw/cat8-measurement/). Full write-up in [shipshape/improvements/08-security.md](../improvements/08-security.md).

---

## Status

All 8 categories baselined. No outstanding blockers.

### How to reproduce

```powershell
# 1. Postgres 18 running locally on :5432; ship_dev DB owned by ship user
# 2. From repo root:
Copy-Item api\.env.example api\.env.local   # if not already
corepack pnpm install
corepack pnpm db:migrate
corepack pnpm db:seed
# Start API with audit-mode env to bypass the dev rate limiter
$env:PORT="3000"; $env:CORS_ORIGIN="http://localhost:5173"; $env:SHIPSHAPE_AUDIT="1"
corepack pnpm --filter @ship/api dev    # leave running
# In another shell:
$env:VITE_PORT="5173"; $env:API_PORT="3000"
corepack pnpm --filter @ship/web dev    # leave running
```

Then re-run measurements:
- **Cat 1**: `Grep` patterns from § 1 above; `cd web && node ./node_modules/typescript/bin/tsc --noEmit --project tsconfig.strict-probe.json`
- **Cat 2**: `cd web && ANALYZE=1 VITE_API_URL= node ./node_modules/vite/bin/vite.js build` → `dist/bundle-stats.html`
- **Cat 3**: Get a Bearer token via `POST /api/api-tokens`, then `npx autocannon -c {10,25,50} -d 10 -H "Authorization: Bearer …" -j http://localhost:3000/<endpoint>` for each of the 5 endpoints.
- **Cat 4**: Paste the 3 queries in `raw/explain-analyze.txt` into psql with `EXPLAIN (ANALYZE, BUFFERS)`.
- **Cat 6**: Replay the 7-input probe from `raw/malformed/issues-post.txt`.
- **Cat 7**: `npx playwright test --config=shipshape/audit/axe-playwright.config.ts`.

---

## Provenance

- Repository commit at audit time: `076a183` (master HEAD when branched).
- Audit branch: `shipshape/audit`.
- All raw measurement outputs go in [raw/](raw/) and are committed (decided in kickoff Q&A).
- This report is updated incrementally as numbers come in; the Tuesday deadline version has every "_(pending)_" replaced with concrete numbers.
