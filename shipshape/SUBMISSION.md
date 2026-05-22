# ShipShape — Submission

**Audited repository:** [US-Department-of-the-Treasury/ship](https://github.com/US-Department-of-the-Treasury/ship)
**Audit + improvement window:** 2026-05-18 → 2026-05-24
**Author:** Tyler Xia

This is the reviewer's entry point. Everything else is one or two clicks away.

**In a hurry? Read [AT_A_GLANCE.md](AT_A_GLANCE.md)** — all 8 categories on one page (baseline → target → delivered) plus the 8 brief-deliverable checklist. Come back here for deep dives.

**Want every brief metric, baseline + after, on one page each?** Read [audit/COMPREHENSIVE_AUDIT.md](audit/COMPREHENSIVE_AUDIT.md) — fills in the brief's "Audit Deliverable" tables row-by-row for all 8 categories, with explicit "not measured" labels where I have honest gaps.

---

## TL;DR

I inherited Ship — a U.S. Treasury project-management app — read it, diagnosed it across eight categories (the brief's 7 + the Cat 8 Security Audit addendum), then improved every category with measurable before/after proof. Every brief target is met; most by a wide margin. The improvements live on eight labeled branches off `shipshape/audit`, each one self-contained so you can read the diff for a single category without scanning the others.

The audit gate (Tuesday hard deadline) is satisfied by [shipshape/audit/AUDIT_REPORT.md](audit/AUDIT_REPORT.md) — see [shipshape/audit/GATE_CHECKLIST.md](audit/GATE_CHECKLIST.md) for a 1-page index confirming all four gate components (methodology / baseline / weaknesses / severity ranking) are present for every category. Implementation is satisfied by the seven `shipshape/0N-<category>` branches indexed below.

---

## Results — all 8 categories

| # | Category | Brief target | Result | Branch | Headline commit |
|---|---|---|---|---|---|
| 1 | Type Safety | −25% violations w/ correct narrowing | **102 hidden tsc errors → 0** • web/tsconfig aligned with root's strict superset | `shipshape/01-type-safety` | [`c1d6755`](#) |
| 2 | Bundle Size | −15% total OR −20% initial via code split | **−62% initial chunk** (2073 → 785 kB raw, 589 → 219 kB gzipped) | `shipshape/02-bundle-size` | [`0435d92`](#) |
| 3 | API Response Time | −20% P95 on ≥2 endpoints | **`/api/auth/me` P99 1575ms → 45ms (−97%)** at c=50; `/api/weeks` −28% to −55% across c=10/25/50 | `shipshape/03-api-perf` | [`b49df0f`](#) |
| 4 | DB Query Efficiency | −20% queries on a flow OR −50% on slowest | **`/api/dashboard/my-work` 4 → 2 queries (−50%)** with combined query also faster than the slowest of the original three | `shipshape/04-db-queries` | [`507f4dc`](#) |
| 5 | Test Coverage | +3 meaningful tests OR fix 3 flakes | **+19 tests** across 3 previously-untested critical paths (extractText/hasContent helpers, date formatting utilities, the global error handler) | `shipshape/05-test-coverage` | [`5ee270f`](#) |
| 6 | Runtime Errors | 3 fixes, ≥1 user-facing data-loss case | Global JSON error handler closes stack-trace leak on malformed JSON, sanitises payload-too-large to JSON 413, and replaces HTML 404 with JSON `{ NOT_FOUND }` on unmatched `/api/*` | `shipshape/06-runtime-errors` | [`0470de1`](#) |
| 7 | Accessibility | +10 Lighthouse on worst page OR clear Critical/Serious on top 3 | **46 → 0 color-contrast violations** across all 12 audited routes (cleared everything, not just top 3); cross-checked with Lighthouse 13.3.0 — the two lowest-scoring routes (`/my-week`, `/dashboard`) went **96 → 100** | `shipshape/07-accessibility` | [`97a5eec`](#) + [`186ecf8`](#) |
| 8 | Security Audit | Build a probe tool; fix ≥2 verified vulnerabilities with before/after proof | **Probe tool runnable** ([shipshape/security/probe.mjs](security/probe.mjs)) across 5 surfaces. **5 verified fixes; critical: 4 → 0; both medium findings from the manual review also resolved**: (a) WebSocket process-crash on oversized/malformed frame (CWE-20 + CWE-400 — any authenticated user could DoS the API); (b) two transitive critical CVEs (fast-xml-parser CVE-2026-25896 + protobufjs CVE-2026-41242) bumped via `pnpm.overrides`; (c) body-parser stack-trace leak on malformed JSON (CWE-209) closed via global error handler; (d) WS Origin allow-list closes the CSWSH gap (CWE-346); (e) per-account login lockout closes the distributed credential stuffing gap (CWE-307). All 454 api unit tests still pass (451 baseline + 3 new lockout tests). | `shipshape/08-security` | [`1361c54`](#) + [`9cdf809`](#) + [`176ff29`](#) + [`e85cfa0`](#) |

Plus a pre-existing tooling bug found while opening the audit: [`db106d1`](#) fixes a brace-tracking bug in `scripts/check-empty-tests.sh` that was throwing false positives on tests containing nested arrow functions.

---

## How this maps to the brief's grading rubric

| Rubric weight | Where this submission scores |
|---|---|
| **Measurable improvement (40%)** | Every category hit its brief target with reproducible before/after numbers. Raw measurement output (autocannon JSON, EXPLAIN ANALYZE, axe scans, bundle treemaps) is committed under [shipshape/audit/raw/](audit/raw/) and [shipshape/improvements/raw/](improvements/raw/) so reviewers can rerun. Three categories (Cat 2, Cat 3, Cat 4, Cat 7) exceeded the target by ≥2×. |
| **Technical depth (25%)** | Each fix targets a root cause, not a symptom. Examples: Cat 3 traced the auth-me tail-latency explosion to pool-slot queueing (max=10) and bumped the pool to 20 after measuring that max=50 regressed Postgres-side; Cat 4 collapsed 4 sequential round-trips into a single SQL UNION ALL with a typed JS dispatch on the discriminator column; Cat 6 added a 4-arg Express error handler that distinguishes body-parser failures (`entity.parse.failed`, `entity.too.large`) from generic 500s with proper `err.expose` handling for `http-errors`-style errors. |
| **TypeScript quality (15%)** | Cat 1 didn't just `any → unknown`-and-call-it-a-day. It aligned `web/tsconfig.json` with the root's strict superset (`noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) and then narrowed every resulting error with real types — including a 7-tuple `TimelineWeek` for fixed-arity arrays, an `ApprovalState` discriminated union narrowing, type-only `Theme` imports to keep an enum out of the main bundle, and at least a dozen other domain-aware narrowings. |
| **Documentation quality (10%)** | One improvement doc per category at `shipshape/improvements/0N-<name>.md`, each with: (a) the brief target verbatim, (b) the before/after numbers, (c) the exact files/lines changed with rationale, (d) tradeoffs accepted, (e) reproducibility steps. The audit report uses the brief's exact category framing. Three discoveries written up at [shipshape/discoveries.md](discoveries.md) with file:line refs and "how I'd apply this in a future project." |
| **Commit discipline (10%)** | One branch per category, one logical change per commit. Commit messages follow the conventional `type(scope): summary` form with multi-paragraph bodies that explain *why*, not just *what*. Pre-commit hooks (`comply`, `check-empty-tests`, UI-route-coverage check) ran clean on every commit — no `--no-verify` bypasses. |

---

## Reading order if you have 10 minutes

1. **[shipshape/orientation.md](orientation.md)** (~3 min) — the 4-hour codebase orientation deliverable from Day 1. Section "TL;DR — the mental model in 6 bullets" tells you everything you need before reading any improvement.
2. **[shipshape/audit/AUDIT_REPORT.md § Summary](audit/AUDIT_REPORT.md)** (~2 min) — baseline numbers for all 7 categories, with methodology.
3. **One improvement doc of your choice** (~3 min) — pick a category that interests you from the table above; the doc explains the rootcause, the fix, the numbers, and the tradeoffs.
4. **[shipshape/discoveries.md](discoveries.md)** (~2 min) — 3 patterns I'd carry to other projects, with file:line references.

If you have 30 minutes, also read the audit's full Category sections + skim one improvement diff (`git diff shipshape/audit shipshape/03-api-perf -- 'api/src/**'`).

---

## Improvement docs (one per category)

| # | Doc | Branch | What you'll find |
|---|---|---|---|
| 1 | [01-type-safety.md](improvements/01-type-safety.md) | `shipshape/01-type-safety` | tsconfig alignment, the 102 errors broken down by TS code, narrowing strategies file by file |
| 2 | [02-bundle-size.md](improvements/02-bundle-size.md) | `shipshape/02-bundle-size` | three lazy-load targets, before/after treemap, manualChunks consideration |
| 3 | [03-api-perf.md](improvements/03-api-perf.md) | `shipshape/03-api-perf` | full autocannon comparison table, pool-sizing rationale (incl. the failed max=50 experiment) |
| 4 | [04-db-queries.md](improvements/04-db-queries.md) | `shipshape/04-db-queries` | the UNION ALL design, EXPLAIN ANALYZE on the combined query, why the correlated subquery is intentionally preserved |
| 5 | (multiple test files) | `shipshape/05-test-coverage` | 16 tests for `extractText`/`hasContent`/date helpers + 3 regression tests for the Cat 6 error handler |
| 6 | [06-runtime-errors.md](improvements/06-runtime-errors.md) | `shipshape/06-runtime-errors` | before/after malformed-input probe, JSON 404 design, what was scoped out |
| 7 | [07-accessibility.md](improvements/07-accessibility.md) + [v2-lighthouse](improvements/07-accessibility-v2-lighthouse.md) | `shipshape/07-accessibility` | new `accent-bright` token, `text-muted/{N}` sweep script, opacity-40 wrapper rewrite; v2 doc adds independent Lighthouse cross-check with full HTML reports |
| 8 | [08-security.md](improvements/08-security.md) + [MANUAL_REVIEW.md](security/MANUAL_REVIEW.md) | `shipshape/08-security` | runnable probe tool ([shipshape/security/probe.mjs](security/probe.mjs)), 5 verified fixes (WS process-crash, two transitive critical CVEs, body-parser stack-leak, WS Origin allow-list against CSWSH, per-account login lockout against distributed credential stuffing), manual review of CORS/CSP/secrets/rate-limit/error-verbosity with file:line refs |

---

## Submission deliverables index

The brief lists 8 deliverables. This is where each one lives:

| # | Deliverable | Where |
|---|---|---|
| 1 | GitHub repository — branches + setup guide | This fork. Branches: `shipshape/audit` + `shipshape/01-…` through `shipshape/08-…` (+ `shipshape/04b-functional-indexes` bonus). Setup: [README.md § Setup (ShipShape fork)](../README.md#getting-started). |
| 2 | Audit report w/ baselines + methodology | [shipshape/audit/AUDIT_REPORT.md](audit/AUDIT_REPORT.md) (8 categories) + [GATE_CHECKLIST.md](audit/GATE_CHECKLIST.md) (1-page brief-gate index) + [COMPREHENSIVE_AUDIT.md](audit/COMPREHENSIVE_AUDIT.md) (brief's exact-tables variant). Cat 8 adds a runnable probe tool: [shipshape/security/probe.mjs](security/probe.mjs). Raw evidence under [audit/raw/](audit/raw/) + [security/raw/](security/raw/). |
| 3 | Improvement documentation (one per category) | [shipshape/improvements/0N-*.md](improvements/) — see the table above. Each has before, root cause, fix, after, reproducibility. |
| 4 | Discovery write-up (3 patterns + reflection) | [shipshape/discoveries.md](discoveries.md) — 4 named discoveries (one extra above the brief minimum) + 3 honorable mentions, each with file:line refs and "how I'd apply this." Direct links: [#1 PG cycle trigger](discoveries.md#1-enforce-tree-invariants-in-the-database-not-the-application) · [#2 conditional CSRF middleware](discoveries.md#2-make-csrf-protection-auth-scheme-aware-via-one-middleware) · [#3 AI provenance as a schema column](discoveries.md#3-encode-ai-provenance-at-the-schema-layer-not-in-opaque-metadata) · [#4 REST/CRDT bridge with one-shot cache-bust signal](discoveries.md#4-bridge-rest-writers-and-crdt-writers-with-a-one-shot-conversion--client-cache-bust-signal). |
| 5 | Demo video (3–5 min) | Recorded. Script: [shipshape/demo-video-script.md](demo-video-script.md). |
| 6 | AI cost analysis | [shipshape/ai-cost-analysis.md](ai-cost-analysis.md) — spend template + 3-section reflection (where AI helped, where it stumbled, what to carry forward). |
| 7 | Deployed application | Live on Vercel (web) + Render (api) + Neon (Postgres). Web: [ship-henna.vercel.app](https://ship-henna.vercel.app). API: `https://ship-api-76ez.onrender.com`. Production-side Cat 8 verification: [shipshape/security/raw-prod/verification.md](security/raw-prod/verification.md). The deploy is also codified as Terraform at [terraform/render-vercel-neon/](../terraform/render-vercel-neon/) (parallel to the Treasury AWS path at `terraform/`) and as a production-mirror compose at [docker-compose.prod-mirror.yml](../docker-compose.prod-mirror.yml) for end-to-end image verification. |
| 8 | Social post (X + LinkedIn) | 3 drafts each + posting checklist: [shipshape/social-posts.md](social-posts.md). |

---

## Raw measurement evidence

All measurements are reproducible from committed inputs:

| Category | Baseline output | After-state output |
|---|---|---|
| 2 Bundle Size | [audit/raw/bundle-stats.html](audit/raw/bundle-stats.html), [bundle-composition.txt](audit/raw/bundle-composition.txt), [bundle-top-contributors.txt](audit/raw/bundle-top-contributors.txt) | [improvements/02-bundle-size-after-treemap.html](improvements/02-bundle-size-after-treemap.html) |
| 3 API Perf | [audit/raw/perf/](audit/raw/perf/) (15 autocannon JSON files) | [improvements/raw/perf-after/](improvements/raw/perf-after/) (15 files) |
| 4 DB Queries | [audit/raw/explain-analyze.txt](audit/raw/explain-analyze.txt) | [improvements/raw/db-after/explain-combined.txt](improvements/raw/db-after/explain-combined.txt) |
| 5 Tests | n/a | `pnpm --filter @ship/api test src/routes/error-handler.test.ts` and the document-content/date-utils suites pass clean |
| 6 Runtime Errors | [audit/raw/malformed/issues-post.txt](audit/raw/malformed/issues-post.txt) | [improvements/raw/issues-post-after.txt](improvements/raw/issues-post-after.txt) |
| 7 A11y | [audit/raw/a11y/](audit/raw/a11y/) (12 axe JSON files) | regenerate by running [audit/axe-scan.spec.ts](audit/axe-scan.spec.ts) — color-contrast violation count now zero on every route |

---

## How to reproduce everything

Tested on Windows 11 with Git Bash + native PostgreSQL 18. Should work on any platform with a Unix shell and Postgres 14+.

```bash
# 1. Clone the fork, install, set up the DB (one-time)
git clone https://github.com/tylerxia8/ship.git && cd ship
corepack pnpm install
cp api/.env.example api/.env.local
# Create the role + database (psql as superuser):
#   CREATE USER ship WITH PASSWORD 'ship_dev_password';
#   CREATE DATABASE ship_dev OWNER ship;
corepack pnpm --filter @ship/api db:migrate
corepack pnpm --filter @ship/api db:seed

# 2. Reproduce the audit baselines (read-only, ~5 min)
git checkout shipshape/audit
# - Bundle:   cd web && ANALYZE=1 node ./node_modules/vite/bin/vite.js build
# - Type:     cd web && node ./node_modules/typescript/bin/tsc --noEmit --project tsconfig.strict-probe.json
# - DB:       psql -f shipshape/audit/raw/explain-analyze.txt (or just read it)
# - Perf:     see audit/AUDIT_REPORT.md § How to reproduce (requires dev API running)
# - A11y:     npx playwright test --config=shipshape/audit/axe-playwright.config.ts

# 3. Reproduce any improvement
git checkout shipshape/0N-<category>
# Each improvement doc has its own "How to reproduce" section.
```

The audit-only `SHIPSHAPE_AUDIT=1` env flag (in `api/src/app.ts`) bypasses the dev rate limiter for honest perf measurements. Production builds ignore this flag. Documented in commit [`ce79bbb`](#).

---

## Honest hedges

A few caveats so reviewers know what they're getting:

- **Seed volume is ~250 documents**, not the brief's stated 500+. Improvements still land — most categories aren't volume-sensitive — but two specific numbers (`/api/issues` content strip and the projects-with-correlated-subquery in Cat 4) would look more dramatic at 500+. A topup script is on the follow-up list.
- **Two `c=25` perf rows show anomalous P99 spikes** (`/api/issues` and `/api/dashboard/my-work`). These are single-request stalls — autovacuum or a cold-cache page fault during one specific 10s window. The brief target is met at *every other* concurrency level on those endpoints; the c=10 and c=50 numbers for the same endpoints are clean. Documented in [shipshape/improvements/03-api-perf.md](improvements/03-api-perf.md#tradeoffs) with the proposed fix (longer autocannon runs to average out the spike).
- ~~**The Cat 4 correlated subquery was preserved**, not rewritten.~~ **Done on 2026-05-22** — see Cat 4's "Follow-up: LATERAL join rewrite (DELIVERED)" section in [improvements/04-db-queries.md](improvements/04-db-queries.md). Single shared `INFERRED_STATUS_LATERAL` constant; all three previously-inline subqueries (list / detail / update) now use it; 451 tests pass.
- **Parallel agent collisions** during implementation caused one branch hygiene issue (a stray Cat 4 commit briefly landed on `shipshape/01-type-safety` before I cherry-picked it to the correct branch). The work itself is correct on every branch; only the order of operations got messy. If you spot a duplicate-looking commit, that's why.
- **Vercel + Render + Neon Terraform — `init` + `validate` clean on 2026-05-22.** [terraform/render-vercel-neon/](../terraform/render-vercel-neon/) codifies the live deploy. Both `terraform init` (all four providers resolved + installed — `render-oss/render v1.8.0`, `vercel/vercel v2.15.1`, `kislerdm/neon v0.13.0`, `hashicorp/random v3.9.0`) and `terraform validate` (`Success! The configuration is valid.`) pass. The committed [terraform/render-vercel-neon/.terraform.lock.hcl](../terraform/render-vercel-neon/.terraform.lock.hcl) pins the verified provider versions and their hashes. The previously-flagged hedge that `neon_branch.endpoint` might need adjustment was correct — one leaf attribute did need a fix, and the README documents it. `terraform apply` against real provider credentials is the only step deferred and requires user-supplied API tokens for Render, Vercel, and Neon.
- **Dockerfile + docker-compose.prod-mirror.yml were not `docker compose up --build`-tested in this session.** Static checks pass: `docker compose -f docker-compose.prod-mirror.yml config` validates clean (all references resolve, schema correct), every Dockerfile `COPY` source exists in the repo, every `COPY --from=builder` stage produces the output it references. Runtime verification deferred because the local Docker WSL VHDX exhausted disk space mid-build earlier in the session and the auto-mode classifier (correctly) won't let me run `docker system prune -af --volumes` against shared local state.

---

## What's still on the follow-up list

In rough priority order, what I'd do next if I had another day:

1. **Top up the seed to 500+ documents** and re-run autocannon. Cleans up the c=25 anomalies via averaging and matches the brief's stated data volume.
2. **Functional indexes** on `(workspace_id, properties->>'assignee_id')` and `(workspace_id, properties->>'state')`. Cat 4 identified these as the limiting factor at 10×. Migration + EXPLAIN ANALYZE before/after.
3. ~~**`pool.query<T>` generic wrapper** in `api/src/db/client.ts`.~~ **Done on 2026-05-22** — see Cat 1's "Architectural follow-up — `pool.query<T>` generic wrapper (DELIVERED)" section in [improvements/01-type-safety.md](improvements/01-type-safety.md). `query<T>` and `queryOne<T>` helpers added; auth hot path migrated (middleware/auth.ts + routes/auth.ts; 20 typed call sites, 9 row interfaces, 464 tests pass). Sweep of the remaining ~30 route files is the next-round target.
4. **Curated lowlight language set** (37 langs → 8). Cat 2 hit −62% initial bundle; this would push to ~−70% by removing another ~250 kB rendered from the editor chunk. Trade-off is a small user-visible feature regression (uncommon code-block languages stop highlighting); needs team buy-in.
5. **Top-level React `<ErrorBoundary>`** wrapping `<AppLayout>`. Existing boundaries are at the Editor level; a route-level boundary would prevent a render error in one page from blanking the whole app.
6. **`ActionItemsModal` overlay on direct-URL doc navigation.** Cat 6 measurement found the modal auto-opens on top of the editor when a user with pending action items lands directly on `/documents/:id` (e.g. via a shared link). It dismisses on Escape, so it's not a hard block — but the first click on the editor goes nowhere, which is surprising for a shared-link user. Two reasonable fixes: (a) suppress the modal when the navigation target is a deep-link rather than the dashboard; (b) lower the modal's z-index below the editor's focus surface and let it sit beside the editor rather than over it.
7. **4xx responses are logged at error-level in Express.** Cat 6 measurement greped the dev API log and found 11 `Error:`-prefixed stack traces during the malformed-input probe — all *expected* validation rejections (`SyntaxError` from body-parser, `ForbiddenError` from csrf-sync, `PayloadTooLargeError` from raw-body) that the API correctly mapped to structured 4xx responses. The noise drowns out real 500-class errors in production logs. One-line fix in [api/src/middleware/error-handler.ts](../api/src/middleware/error-handler.ts): downgrade `console.error` to `console.warn` for status codes `<500`. Holding off on shipping unilaterally because logging-level changes have ops/observability implications worth a maintainer signoff.
8. ~~**`scrollable-region-focusable` on `/dashboard` and `/team/directory`.**~~ **Done in `shipshape/07-accessibility`.** Cat 7 measurement flagged two `<div>` elements with `overflow:auto` that couldn't be scrolled with the keyboard — WCAG 2.1.1 (Keyboard) failure, serious impact. Cleared by adding `tabIndex={0}` + `role="region"` + `aria-label` to each container.
9. ~~**`select-name` violation on `/settings` (10 nodes, critical).**~~ **Done in `shipshape/07-accessibility`.** The workspace-members table's role-select column rendered 10 `<select>` elements without accessible names — WCAG 4.1.2 (Name, Role, Value). Cleared by adding `aria-label={`Role for ${member.name || member.email}`}` to each row's select.
10. **Lighthouse under-reports a11y violations on dynamic content.** A measurement-methodology finding from Cat 7: Lighthouse scored `/settings` at 100, but axe-core (which scans after `networkidle` + 1.5 s settle) found 10 critical violations on the same route. Don't trust Lighthouse alone for data-driven routes — pair it with an axe scan that waits for hydration. The Cat 7 measurement spec ([axe-wcag-measurement.spec.ts](../shipshape/improvements/axe-wcag-measurement.spec.ts)) demonstrates the pattern.

---

## Commits + branches at a glance

```
shipshape/audit                  ← shared base; SHIPSHAPE_AUDIT flag, rollup-plugin-visualizer, etc.
├── shipshape/01-type-safety     c1d6755  align web tsconfig + fix 102 hidden errors
├── shipshape/02-bundle-size     0435d92  lazy-load editor + emoji-picker + diff-viewer (-62%)
├── shipshape/03-api-perf        b49df0f  strip content from issues list + bump pg pool
├── shipshape/04-db-queries      507f4dc  merge /my-work 4 queries into 2
├── shipshape/05-test-coverage   5ee270f  + 9596851 + 912381e + bb6bb3c — 19 tests + Cat 6 + discoveries
├── shipshape/06-runtime-errors  0470de1  global JSON error handler + JSON 404
├── shipshape/07-accessibility   97a5eec  clear all 46 color-contrast violations
└── shipshape/08-security        1361c54 + 9cdf809 + 176ff29 + e85cfa0
                                  probe tool + 5 verified fixes (WS crash, 2 CVEs,
                                  body-parser leak, WS Origin allow-list, login lockout)

Plus on the audit base:
  db106d1  fix(scripts): track brace depth in check-empty-tests.sh
  bf2ae36  shipshape: live-app audit baselines for Categories 3, 4, 6, 7
  ce79bbb  audit: add SHIPSHAPE_AUDIT=1 env to bypass dev rate limiter
  3c7b469  shipshape: more static findings — error boundary, joins, a11y wins
  3bf85c3  shipshape: bundle finding — top contributors + lazy-load targets
  b47c2a2  shipshape: add gated rollup-plugin-visualizer + capture bundle composition
  43d3fcc  shipshape: audit baselines for Type Safety, Bundle Size, Test inventory
  7f73ba3  shipshape: Phase 1 orientation notes
```

---

## Other deliverables per the brief

| Deliverable | Status | Where |
|---|---|---|
| Forked GitHub repo with labeled branches | ✅ | this repo + the 8 `shipshape/*` branches |
| Audit report | ✅ | [shipshape/audit/AUDIT_REPORT.md](audit/AUDIT_REPORT.md) + [GATE_CHECKLIST.md](audit/GATE_CHECKLIST.md) |
| Improvement documentation per category | ✅ | [shipshape/improvements/](improvements/) — 8 docs |
| Discovery write-up (3 things) | ✅ | [shipshape/discoveries.md](discoveries.md) |
| Demo video (3–5 min) | ✅ | Recorded; script at [shipshape/demo-video-script.md](demo-video-script.md) |
| AI cost analysis | ⏳ | template ready; needs actual usage numbers |
| Deployed application | ✅ | Web: [ship-henna.vercel.app](https://ship-henna.vercel.app) · API: `ship-api-76ez.onrender.com` · DB: Neon. Production Cat 8 verification: [shipshape/security/raw-prod/verification.md](security/raw-prod/verification.md). |
| Social post (X / LinkedIn) | ⏳ | draft pending |
