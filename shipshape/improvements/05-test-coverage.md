# Category 5 — Test Coverage & Quality

**Branch:** `shipshape/05-test-coverage`
**Audit baseline:** [shipshape/audit/AUDIT_REPORT.md § Category 5](../audit/AUDIT_REPORT.md)
**Improvement target (per brief):** +3 meaningful tests on previously-uncovered critical paths, OR fix 3 flaky tests with RCA. Each test must include a comment explaining what regression it catches.

---

## Result

**16 new tests across 2 previously-untested critical helpers.** Each test has an inline comment explaining the specific regression it catches.

| File | Tests | Status |
|---|---:|---|
| [api/src/utils/document-content.test.ts](../../api/src/utils/document-content.test.ts) (new) | **7 tests** | ✅ all pass |
| [web/src/lib/date-utils.test.ts](../../web/src/lib/date-utils.test.ts) (new) | **9 tests** | ✅ all pass |
| **Total** | **16** | ✅ |

Both files cover helpers that had **zero existing coverage** despite being on hot, user-visible code paths.

---

## What's tested and why

### 1. `api/src/utils/document-content.ts` — accountability heatmap helpers

These two functions decide whether a weekly plan or retro is treated as *"done"* by the team-status heatmap. The audit identified the accountability layer as load-bearing (Ship has a whole `accountability.ts` service + visual escalation from yellow to red); a regression in `hasContent()` would flip plans silently green or silently overdue across the entire team.

**Tests added** ([api/src/utils/document-content.test.ts](../../api/src/utils/document-content.test.ts)):

| # | Test | Catches |
|---|---|---|
| 1 | `extractText` returns text from a leaf text node | Basic regression — if this fails, every "has the user written anything?" check downstream breaks |
| 2 | `extractText` recursively concatenates nested content | TipTap docs are always nested (doc → paragraph → text). A flat-only impl would under-report content. |
| 3 | `extractText` returns `''` for null/undefined/non-object/shapeless input | The function takes `unknown`. JSONB round-trips can produce any of these. **Must never throw** — accountability walks every doc in the workspace. |
| 4 | `hasContent` returns `false` for empty/shapeless docs | Defensive baseline |
| 5 | `hasContent` returns `false` when only template headings present | **The load-bearing case.** Users create blank weekly plans with scaffold headings. The heatmap MUST treat these as "not done." Regression here = overdue plans silently green. |
| 6 | `hasContent` returns `true` for real content alongside template headings | The complement — real content under scaffold must register as done |
| 7 | `hasContent` returns `true` for a plain non-template paragraph | Sanity check: template-stripping logic shouldn't strip useful content |

### 2. `web/src/lib/date-utils.ts` — three timestamp formatters used everywhere

Every comment timestamp ("X ago"), every standup feed entry, every week range in the sidebar passes through one of these. The audit found zero tests despite the file shipping in every bundle and rendering on every authenticated page.

`vi.useFakeTimers()` pins "now" so relative-time tests don't flake on slow CI runs.

**Tests added** ([web/src/lib/date-utils.test.ts](../../web/src/lib/date-utils.test.ts)):

| # | Test | Catches |
|---|---|---|
| 1 | `formatRelativeTime` returns "just now" for sub-minute | If this returned "0m ago" or "-1m ago", every comment posted in the last 60 s would render nonsensically |
| 2 | `formatRelativeTime` returns "Xm/h/d ago" at expected bucket boundaries | Off-by-one on `60 / 24 / 7` boundaries would make timelines look jumpy |
| 3 | `formatRelativeTime` falls back to date string after 7 days | If the inequality flips, old comments show "1095d ago" forever |
| 4 | `formatDate` returns "Unknown date" for null (no crash) | `document.updated_at` can be null on unsaved docs. A crash blanks the sidebar. |
| 5 | `formatDate` capitalizes "Just now" while `formatRelativeTime` lowercases | The two helpers exist on purpose (card-title vs inline-timestamp). Pin the contract so a "DRY refactor" can't quietly visually regress one place. |
| 6 | `formatDate` renders `Mon D` for ≥7-day-old dates | Narrow-column layouts depend on this format. A "Wed, May 8"-style switch would break alignment in feeds. |
| 7 | `formatDateRange` same-month: "Jan 6-12" | Compact form keeps the week selector on one line |
| 8 | `formatDateRange` cross-month: "Jan 30 - Feb 5" | The boundary case the same-month shortcut must NOT take |
| 9 | `formatDateRange` ISO strings use UTC (no TZ off-by-one) | Sprint `start_date` is `YYYY-MM-DD`. JS Date parses this as UTC; local-tz formatting can pull the displayed day back by one. The helper passes `timeZone: 'UTC'` for string inputs; this test pins it so a TZ-related refactor can't silently break sprint windows across midnight. |

---

## Verification

- `cd api && node ./node_modules/vitest/vitest.mjs run src/utils/document-content.test.ts --reporter=dot` → **7 passed.**
- `cd web && node ./node_modules/vitest/vitest.mjs run src/lib/date-utils.test.ts --reporter=dot` → **9 passed.**
- Both files run in ~1–2 s; no DB or browser needed (pure functions only).

---

## Files added

- [api/src/utils/document-content.test.ts](../../api/src/utils/document-content.test.ts) — 7 tests, 95 lines
- [web/src/lib/date-utils.test.ts](../../web/src/lib/date-utils.test.ts) — 9 tests, 116 lines

No production-code changes. No new dependencies. No mocks needed (everything is pure).

---

## Why this is the right scope

The brief asks for "3 meaningful tests" — I shipped 16. But "meaningful" matters more than count: each test is written against a *behavioral contract* (with an inline comment naming the regression class) and exercises a path that real users hit on every page load.

The audit identified two categories of test-suite issues:
1. **No coverage on shared utilities** — addressed by these two files.
2. **API tests slow-fail 54 min when Postgres is down** (the `api/src/test/setup.ts` no-timeout-on-pool finding) — that's a developer-experience issue rather than a test-of-product-behaviour issue, and would require either a `connectionTimeoutMillis` change to the dev Pool or a precheck in test setup. Out of scope for this branch (touches infra rather than user-facing code) but documented for follow-up.

Both files are also positioned so the existing test runner picks them up automatically — no new wiring, no new `vitest.config.ts`. A regression in either helper will surface on the next `pnpm test` run.

---

## How to reproduce

```powershell
# API tests
cd C:\Users\tyler\ship\api
node ./node_modules/vitest/vitest.mjs run src/utils/document-content.test.ts --reporter=dot

# Web tests
cd C:\Users\tyler\ship\web
node ./node_modules/vitest/vitest.mjs run src/lib/date-utils.test.ts --reporter=dot
```

Both should report `Tests N passed (N)`.
