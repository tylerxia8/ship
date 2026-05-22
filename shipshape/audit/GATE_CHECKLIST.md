# Hard-Gate Checklist — ShipShape Audit

The brief defines a hard gate: **a written audit report with baselines for all 7 categories, before any fix.** For each category the report must contain (1) measurement methodology, (2) concrete baseline numbers, (3) specific weaknesses identified, (4) severity ranking.

Category 8 (Security Audit) was added by an addendum to the brief and follows the same four-component template. It additionally requires a **runnable probe tool** as a deliverable — that lives at [shipshape/security/probe.mjs](../security/probe.mjs).

This is a one-page index so a reviewer can confirm each requirement is satisfied without scrolling the full [AUDIT_REPORT.md](AUDIT_REPORT.md). Line refs point into that file; raw-evidence refs point into [raw/](raw/) and [shipshape/security/raw/](../security/raw/).

---

| Cat | (1) How measured | (2) Baseline headline | (3) Top weakness | (4) Severity | In report | Raw evidence |
|---:|---|---|---|---|---|---|
| **1. Type Safety** | Ripgrep counts of `any` / `as <T>` / `!` / `@ts-*` across all 3 packages; web `tsconfig.strict-probe.json` extending root's strict superset → tsc run | `any`=260, `as <T>`=460, `!`=324; **102 hidden tsc errors across 22 files** when web strict aligns with root | Web `tsconfig.json` doesn't extend root → noUncheckedIndexedAccess silently off in 78 files | **High** (×2), Medium, Methodological, Positive (5 findings ranked) | [§ Cat 1, L29–88](AUDIT_REPORT.md#L29-L88) | [web-strict-probe-errors.txt](raw/web-strict-probe-errors.txt) |
| **2. Bundle Size** | `pnpm build` + `rollup-plugin-visualizer` (gated by `ANALYZE=1` so it never runs in normal builds) | Total 3.8 MB; **main chunk 2.07 MB / 589 KB gz — 92% of all JS**; Vite emits >500 kB warning | Three lazy-load wins (emoji-picker 409 KB; highlight.js 387 KB; diff-match-patch 82 KB) loaded on every route incl. `/login` | Findings table ranks every contributor by KB + role | [§ Cat 2, L92–173](AUDIT_REPORT.md#L92-L173) | [bundle-stats.html](raw/bundle-stats.html), [bundle-composition.txt](raw/bundle-composition.txt), [bundle-top-contributors.txt](raw/bundle-top-contributors.txt) |
| **3. API Response Time** | autocannon via `corepack pnpm dlx autocannon`, 10-s runs at c=10/25/50 across 5 endpoints; rate limiter bypassed via `SHIPSHAPE_AUDIT=1` env flag (instrumentation, not a fix) | **`/api/auth/me` P99 = 1575 ms at c=50** (pool saturation); `/api/issues` ships **102 KB per call** at 104 issues | (a) `/api/issues` selects full TipTap `content`; (b) `pg.Pool max=10` saturates well before c=50 | **High**, **High**, Medium, **High** (scaling cliff) — 4 findings ranked | [§ Cat 3, L177–224](AUDIT_REPORT.md#L177-L224) | [raw/perf/](raw/perf/) (15 JSON files: 5 endpoints × 3 concurrency levels) |
| **4. DB Query Efficiency** | Postgres `log_statement=all` + `log_duration=on`; `EXPLAIN (ANALYZE, BUFFERS)` on the 3 hottest distinct queries from live UI walk-through | All plans ≤2 ms at 250 docs, but **Q2 (projects-with-inferred-status) reads 596 buffer hits** via correlated subquery | Missing functional indexes on `properties->>'assignee_id'` and `->>'state'`; 4-query my-work flow that can become 1 query | **High at scale** / Medium / **High** / Medium — 4 findings ranked | [§ Cat 4, L228–267](AUDIT_REPORT.md#L228-L267) | [explain-analyze.txt](raw/explain-analyze.txt) |
| **5. Test Coverage & Quality** | Glob for spec-file counts; ripgrep `^\s*(test\|it)(\.fixme\|\.skip\|\.only)?\s*\(` for test-entry counts; `corepack pnpm test` for status | **866 E2E + 447 API + 151 web = ~1,464 tests**; 0 skip/fixme/only markers; **API suite 28/28 files fail in 3,248 s (54 min)** without Postgres | Coverage tooling absent (`@vitest/coverage-v8` not installed yet `test:coverage` script exists); no Playwright sharding config | Infrastructure / Medium — 2 findings ranked + 5 critical flows nominated for coverage check | [§ Cat 5, L271–314](AUDIT_REPORT.md#L271-L314) | [api-vitest-baseline.txt](raw/api-vitest-baseline.txt) |
| **6. Runtime Errors** | 7-input malformed-payload probe against `POST /api/issues` (empty / non-JSON / XSS-shaped title / unknown field / SQL-injection-shaped title / 10 KB nested object); console-error walk across 12 routes during a11y scan | **Stack trace leaked** to client on non-JSON body via Express default handler; zod schema silently drops unknown fields | Empty-test pre-commit hook ([scripts/check-empty-tests.sh:42–54](../../scripts/check-empty-tests.sh#L42-L54)) is a **false-positive generator** that encourages `--no-verify` (forbidden by CLAUDE.md) | Medium, **High** — 2 confirmed gaps + 3 hypotheses for live-app probe | [§ Cat 6, L318–366](AUDIT_REPORT.md#L318-L366) | [raw/malformed/issues-post.txt](raw/malformed/issues-post.txt) |
| **7. Accessibility** | `@axe-core/playwright` against 12 routes with WCAG 2 A/AA + WCAG 2.1 A/AA tags; static grep for `<div onClick>` / `<span onClick>` anti-patterns | **46 nodes failing `color-contrast` (Serious) across 5 routes** (`/dashboard`, `/my-week`, `/projects`, `/team/allocation`, `/team/status`); 7 routes clean; 0 Critical/Moderate/Minor | README's "WCAG 2.1 AA Compliant" badge is a verifiable contradiction; single rule causes all violations (concentrated fix surface) | All 46 nodes graded Serious by axe-core's impact taxonomy; per-route counts ranked in the table | [§ Cat 7](AUDIT_REPORT.md#category-7--accessibility) | [raw/a11y/](raw/a11y/) (12 per-route axe JSON files) |
| **8. Security Audit** | Custom probe tool `shipshape/security/probe.mjs` — 5 modules (auth, input, websocket, deps, manual) against the running app; one command; JSON + Markdown report | **4 critical / 30 high / 1 medium / 2 low / 11 ok**: 2× WS process-crash on oversized/malformed frame, 2× transitive critical CVEs (fast-xml-parser, protobufjs) | Authenticated WS clients can crash the API server with one >10 MB or text frame (CWE-20 + CWE-400, production DoS) | **High** (×2 WS crash), **Medium** (CVE: fast-xml-parser in prod path), **Low** (CVE: protobufjs in dev path), per-finding `severity` field on each | [§ Cat 8](AUDIT_REPORT.md#category-8--security-audit) | [shipshape/security/raw/report-before-fixes.json](../security/raw/report-before-fixes.json) + [shipshape/improvements/raw/cat8-measurement/](../improvements/raw/cat8-measurement/) |

---

## Discipline (no-fix-during-audit rule)

| Branch | Purpose | Production code touched? |
|---|---|---|
| `shipshape/audit` | Diagnosis only — this report + raw measurement output + the Cat 8 probe tool | **Only** the `SHIPSHAPE_AUDIT=1` env flag in [api/src/app.ts](../../api/src/app.ts) — pure measurement instrumentation. No handler logic changed. The Cat 8 probe tool is also pure measurement (zero changes to api/web/shared source). |
| `shipshape/01-type-safety` … `shipshape/08-security` | One per category — fixes branch off `shipshape/audit` | Yes, deliberately separate so reviewers can `git diff shipshape/audit shipshape/0N-...` per category |

Every improvement branch references its baseline back to this audit report. The audit is the diagnostic; treatment lives on the treatment branches.

---

## Provenance

- Audit window: Mon 2026-05-18 → Tue 2026-05-19 23:59 (per brief)
- Master HEAD at audit time: `076a183`
- All raw measurement output committed under [raw/](raw/) at audit time (no after-the-fact regeneration)
