# ShipShape — At-a-Glance

**For reviewers in a hurry.** One row per category, audit + improvement on the same line. Click any number to verify. Full details in [SUBMISSION.md](SUBMISSION.md).

---

## The whole project in one table

| # | Category | Baseline (audit) | Target (brief) | Delivered | Proof |
|---|---|---|---|---|---|
| **1** | Type Safety | **102 hidden tsc errors** when web tsconfig aligns w/ root strict superset | −25% violations w/ narrowing | **102 → 0** (1 commit, 13 files narrowed) | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/01-type-safety) · [doc](improvements/01-type-safety.md) |
| **2** | Bundle Size | **2.07 MB / 589 KB gz main chunk** (92% of all JS) | −15% total OR −20% initial | **−62% raw / −63% gz initial** (785 KB raw / 219 KB gz) | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/02-bundle-size) · [doc](improvements/02-bundle-size.md) · [treemap](improvements/02-bundle-size-after-treemap.html) |
| **3** | API Response Time | `/api/auth/me` **P99 = 1575 ms** at c=50 (pool saturation) | −20% P95 on ≥2 endpoints | **`/api/auth/me` −97% P99**; `/api/weeks` −28% to −55% P99 | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/03-api-perf) · [doc](improvements/03-api-perf.md) · [v2 re-bench at 517 docs](improvements/03-api-perf-v2.md) |
| **4** | DB Query Efficiency | `/my-work` runs **4 queries**; correlated subquery 596 buffer hits | −20% queries OR −50% slowest | **4 → 2 queries (−50%)** via `UNION ALL` + **bonus 3 functional indexes** | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/04-db-queries) · [doc](improvements/04-db-queries.md) · [bonus 04b](improvements/04b-functional-indexes.md) |
| **5** | Test Coverage | ~1,464 tests but **0% coverage on `extractText`/`hasContent`/date-utils** | +3 meaningful tests | **+19 tests** across 3 critical paths (extractText, dates, error handler) | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/05-test-coverage) · [doc](improvements/05-test-coverage.md) |
| **6** | Runtime Errors | **Stack trace leaks** on malformed JSON; 3/7 malformed inputs accepted silently | 3 fixes, ≥1 data-loss/confusion case | **4 fixes**: JSON 404, sanitized 5xx, `entity.parse.failed`, `entity.too.large` | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/06-runtime-errors) · [doc](improvements/06-runtime-errors.md) |
| **7** | Accessibility | **46 color-contrast violations** across 5 of 12 routes (badge "WCAG 2.1 AA" was wrong) | +10 Lighthouse OR clear Crit/Serious on top 3 | **46 → 0 violations on all 12 routes**; Lighthouse 96→100 on 2 worst | [diff](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/07-accessibility) · [doc](improvements/07-accessibility.md) · [Lighthouse v2](improvements/07-accessibility-v2-lighthouse.md) |

**Headline:** every category met its brief target. Five categories exceeded it by ≥2×. Cat 1 found a hidden bug *during the audit phase* that no automated tool caught. Cat 4 + Cat 7 shipped bonus deliverables (functional indexes, Lighthouse cross-check) beyond the brief minimum.

---

## How to verify any single category in 90 seconds

```bash
# 1. Clone the fork
git clone https://github.com/tylerxia8/ship.git && cd ship

# 2. Pick a category and read just that diff
git diff shipshape/audit shipshape/01-type-safety -- 'web/**'   # or 02, 03, ...
```

Every improvement branch is rooted at `shipshape/audit`, so this command shows **only** that category's change set — no cross-category noise.

To reproduce a measurement, the improvement doc for each category has a "How to reproduce" section with the exact commands. The audit's [GATE_CHECKLIST.md](audit/GATE_CHECKLIST.md) maps every baseline number to its raw-evidence file under [shipshape/audit/raw/](audit/raw/).

---

## Per-category one-paragraph summaries

### 1. Type Safety — *the audit found the biggest fix*

The `web` package's `tsconfig.json` didn't extend the root strict config — so `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` were silently disabled across the entire frontend. Adding `"extends": "../tsconfig.json"` surfaced **102 real undefined-access bugs across 22 files** that no lint rule was catching. Each was narrowed with a proper type guard (no `as any`, no `!` shortcuts). Top 5 violator files matched the audit's prediction: `CommandPalette.tsx`, `useSelection.ts`, `lib/cn.ts`, `CommentDisplay.tsx`, `AIScoringDisplay.tsx`.

### 2. Bundle Size — *three targeted lazy-loads*

The single main chunk shipped **1.98 MB raw / 589 KB gzipped** on every route, including `/login`. The treemap (built with `rollup-plugin-visualizer`) showed three obvious lazy-load wins on the editor stack and emoji picker. Result: the initial chunk dropped to **219 KB gzipped (−63%)**. Total JS bytes stayed flat (code splitting moves bytes, doesn't delete them) — the user wins because only the chunks they need are downloaded. `/login` users no longer pay for TipTap.

### 3. API Response Time — *pool sizing + response shape*

`/api/auth/me` P99 was **1575 ms at c=50** despite running ~2 trivial queries. Root cause: the pg pool was `max=10`, so 40 of every 50 in-flight requests queued for a slot. Queue time, not query time, was the latency. Bumping to `max=20` (and `max=30` in prod) drops P99 to **45 ms — a −97% reduction**. Bonus fix: `/api/issues` was selecting the full TipTap `content` blob per row, blowing the response to 102 KB for 104 issues. Dropping `content` cuts that to ~10 KB. The audit doc captures the *failed* `max=50` experiment too — Postgres went CPU-bound. 20 was the largest pool size that didn't regress.

### 4. DB Query Efficiency — *4 queries → 2 with `UNION ALL`*

The `/api/dashboard/my-work` endpoint fired four separate Postgres round-trips — workspace, issues, projects, sprints — for one page render. Collapsed into a single `UNION ALL` with a `kind` discriminator column and typed JS dispatch on the result. **4 → 2 = −50% query count.** On the separate `shipshape/04b-functional-indexes` branch, I added 3 partial B-tree indexes on JSONB-extracted keys (`properties->>'assignee_id'`, `properties->>'state'`, `properties->>'owner_id'`). EXPLAIN ANALYZE shows the issues-by-state query went from Seq Scan → Bitmap Index Scan — textbook plan improvement, captured in `raw/db-after-v2/`.

### 5. Test Coverage — *3 critical untested paths*

The audit grep-counted **1,464 tests** but spot-checked the helpers: `extractText`, `hasContent`, and the date formatting utilities had **zero coverage**. Wrote **19 tests** across three new files. The `error-handler.test.ts` tests double as regression tests for the Cat 6 fix — they probe the four error paths (parse-fail, too-large, generic 5xx, JSON 404) and assert the response shape. Each test has a comment explaining the regression it catches, per the brief's framing.

### 6. Runtime Errors — *no more stack-trace leaks*

The audit probed `POST /api/issues` with 7 malformed inputs. The smoking gun: non-JSON body returned an HTML page with the **full Node.js stack trace**, including library file paths and version info — a real reconnaissance leak. Added a 4-arg Express error handler (`(err, req, res, next)`) at the end of `api/src/app.ts` that distinguishes `entity.parse.failed`, `entity.too.large`, and generic errors, all returning the same sanitized JSON shape from `@ship/shared`. Plus a JSON 404 handler so unmatched `/api/*` no longer returns HTML. Server-side logs keep the full error for debugging; client-side never sees a stack trace again.

### 7. Accessibility — *the badge was wrong; we made it right*

The README claimed "WCAG 2.1 AA Compliant" but `@axe-core/playwright` against 12 routes flagged **46 nodes failing `color-contrast` (Serious)** across 5 routes. Three root causes: (1) the `accent` color token did double duty as button background AND text — fine as bg-with-white, fails as text-on-dark (2.89:1); (2) `text-muted/50` alpha-blended to `#4c4c4c` (2.26:1); (3) `opacity-40` wrapper on future-week standup rows multiplied across already-muted text (1.84:1, the worst). Fixed all three with a new `accent-bright` token for text-on-dark, an automated `text-muted/50` → `text-muted` sweep, and removal of the `opacity-40` wrapper. After-state: **0 violations on all 12 routes.** Cross-checked with Lighthouse: 96→100 on the two lowest-scoring routes.

---

## What's *not* in this submission (called out so you don't have to ask)

- **Login page Lighthouse `landmark-one-main`** — out of scope for the color-contrast work; documented as follow-up in [07-accessibility-v2-lighthouse.md](improvements/07-accessibility-v2-lighthouse.md).
- **`/api/issues` pagination** — bandwidth, not query speed; adding it would compound Cat 3's gains. Documented as follow-up in [03-api-perf.md](improvements/03-api-perf.md).
- **The correlated subquery in `dashboard.ts`** — preserved verbatim. The 4→2 merge already clears the brief target; rewriting the subquery to a LATERAL join changes row-count semantics and warrants its own focused commit.
- **`pool.query<T>` generic wrapper** — Cat 1 hypothesized this single change eliminates hundreds of `as` casts in route handlers. Not done in scope; a real architectural improvement worth a separate sprint.

---

## Submission deliverable status (all 8 from the brief)

| # | Deliverable | Status |
|---|---|---|
| 1 | GitHub repo w/ labeled branches + README setup | ✅ [github.com/tylerxia8/ship](https://github.com/tylerxia8/ship) — 7 labeled branches + `shipshape/deploy` |
| 2 | Audit report w/ baselines + methodology + raw data | ✅ [AUDIT_REPORT.md](audit/AUDIT_REPORT.md) + [GATE_CHECKLIST.md](audit/GATE_CHECKLIST.md) |
| 3 | Improvement docs (1 per category) | ✅ [improvements/0N-*.md](improvements/) per branch |
| 4 | Discovery write-up (3 patterns + reflection) | ✅ [discoveries.md](discoveries.md) |
| 5 | Demo video (3–5 min) | 📝 [demo-video-script.md](demo-video-script.md) ready; recording is the user's step |
| 6 | AI cost analysis | ✅ [ai-cost-analysis.md](ai-cost-analysis.md) |
| 7 | Deployed application | 🟡 in progress on Railway (project `sublime-balance`); see [deploy-railway.md](deploy-railway.md) |
| 8 | Social post (X + LinkedIn) | ✅ 3 drafts each in [social-posts.md](social-posts.md); to be posted after deploy |
