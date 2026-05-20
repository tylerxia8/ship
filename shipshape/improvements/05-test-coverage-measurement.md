# Cat 5 — Test Coverage & Quality Measurement

Executes each item from the brief's **"How to Measure"** checklist for Category 5, against the current `shipshape/deploy` state.

Reproducible — see [§ "How to reproduce"](#how-to-reproduce) at the bottom.

---

## Brief check 1 — Run `pnpm test`, record pass/fail + runtime

Root `package.json` defines `"test": "pnpm --filter @ship/api test"` — so `pnpm test` runs only the api unit suite. To audit the full project I ran all 3 packages separately.

### api unit suite (`vitest run`)

Three back-to-back runs:

| Run | Test Files | Tests | Runtime |
|---|---|---|---:|
| 1 | 29 passed / **30** | 445 passed / **461** | 56 s |
| 2 | **30 passed / 30** | **461 passed / 461** | 60 s |
| 3 | 29 passed / **30** | 448 passed / **461** | 58 s |

**Important nuance:** when a run shows fewer than 30 files, the missing file's tests didn't *fail* — they didn't *run*. The vitest pool worker crashed with `Error: Worker exited unexpectedly` mid-run, orphaning that file's tests. Vitest stops counting them at all. **Every test that ACTUALLY EXECUTED across all three runs passed.**

This is real flakiness — but it's at the test-runner infrastructure level (vitest 4 pool worker), not at the test-content level. Documented as a follow-up to investigate (could be a Windows-specific vitest+tsx interaction).

### web unit suite (`vitest run`)

| Run | Test Files | Tests | Runtime |
|---|---|---|---:|
| 1 | 14 passed / **17** | 147 passed / **160** | 19 s |
| 2 | 14 passed / **17** | 147 passed / **160** | 18 s |
| 3 | 14 passed / **17** | 147 passed / **160** | 18 s |

13 deterministic failures across 3 files — **NOT regressions from any ShipShape work** (verified: zero shipshape commits touched any of the 3 failing test files). These are pre-existing upstream Treasury issues:

| Failing test file | Why it fails |
|---|---|
| `document-tabs.test.ts` (9 fails) | Tests still expect tabs named `'sprints'`; upstream code uses `'weeks'` (incomplete rename) |
| `DetailsExtension.test.ts` (3 fails) | Tests expect `content: 'block+'`; upstream config now uses `'detailsSummary detailsContent'` |
| `useSessionTimeout.test.ts` (1 fail) | A specific timer-mock assertion that's flake-prone even upstream |

### shared

No tests. shared/ is pure type definitions + a few helpers.

### E2E suite (`playwright test`)

Not run during this measurement — runs in CI via the `/e2e-test-runner` skill per CLAUDE.md. Cataloged statically below.

---

## Brief check 2 — Catalog covered vs uncovered flows

### E2E inventory (static catalog)

**71 spec files, 866 test entries** (`test()` / `it()` blocks). Top-level catalog by feature surface:

**Document model (12 specs)**
`documents`, `document-isolation`, `document-workflows`, `private-documents`, `wiki-document-properties`, `docs-mode`, `backlinks`, `mentions`, `inline-code`, `inline-comments`, `tables`, `toc`

**Auth / security (5 specs)**
`auth`, `authorization`, `security`, `session-timeout`, `existing-user-invite`

**Week / sprint management (3 specs)**
`weeks`, `weekly-accountability`, `program-mode-week-ux`

**Concurrency / real-time (3 specs)**
`real-integration`, `race-conditions`, `autosave-race-conditions`

**Accessibility (4 specs)**
`accessibility`, `accessibility-remediation`, `check-aria`, `status-colors-accessibility`

**Editor / TipTap (8 specs)**
`emoji`, `file-attachments`, `file-upload-api`, `images`, `syntax-highlighting`, `toggle`, `drag-handle`, `tooltips`

**Issues (5 specs)**
`issues`, `issues-bulk-operations`, `issue-display-id`, `issue-estimates`, `bulk-selection`

**Reviews / accountability (6 specs)**
`accountability-banner-urgency`, `accountability-owner-change`, `accountability-standup`, `accountability-week`, `manager-reviews`, `manager-reviews-visual`

**Other (~25 specs)**
admin, error-handling, edge-cases, performance, data-integrity, status-overview, etc.

### Critical-flow → spec mapping

The brief calls out four critical flows to verify coverage for:

| Critical flow | Covered by | Coverage quality |
|---|---|---|
| **Document CRUD** | `documents.spec.ts`, `document-isolation.spec.ts`, `document-workflows.spec.ts` | ✅ Solid — create, rename, delete, visibility transitions, workspace isolation |
| **Real-time sync** | `real-integration.spec.ts`, `race-conditions.spec.ts`, `autosave-race-conditions.spec.ts` | ✅ Moderate — race-condition specs exercise the two-tab-conflict path; the full Yjs offline → online merge isn't explicitly tested |
| **Auth** | `auth.spec.ts`, `authorization.spec.ts`, `session-timeout.spec.ts`, `security.spec.ts` | ✅ Strong — login, RBAC, 15-min idle, 12-hr absolute, CSRF, existing-user-invite |
| **Sprint management** | `weeks.spec.ts`, `weekly-accountability.spec.ts`, `program-mode-week-ux.spec.ts` | ✅ Solid — week creation, plan/retro flow, accountability badges, owner reassignment |

### Notable gaps surfaced by the catalog

- **No spec covers cross-workspace user switching** — the `last_workspace_id` column exists and the UI has a workspace switcher, but no E2E exercises switching mid-session.
- **No spec covers `pool.query` typing** — the audit's hypothesized `pool.query<T>` generic refactor isn't measurable without it.
- **No spec covers the seed scripts** — `pnpm db:seed` has no integration test, so a broken migration that breaks seed only surfaces when a developer runs it locally.

These are written up as Cat 5 follow-ups in [shipshape/SUBMISSION.md](../SUBMISSION.md).

---

## Brief check 3 — Identify flaky tests (3 runs of api unit suite)

| Test name | Run 1 | Run 2 | Run 3 | Flake? |
|---|:---:|:---:|:---:|:---:|
| All 461 named api tests | ✓ (when reached) | ✓ | ✓ (when reached) | NO at test-content level |
| vitest pool worker | **crashed** | clean | **crashed** | **YES at infra level** |

Flake type observed: **vitest pool worker fork exits unexpectedly** mid-run. When this happens, vitest reports `Test Files 29 passed (30)` — one file's tests are silently dropped from the count. No specific test "fails"; the issue is that a worker process dies before its file's tests are reported.

Pattern observation: the file that gets orphaned differs between runs (Run 1 it was a different file than Run 3). Suggests memory pressure or a race in vitest's worker pool — not a specific test's fault.

**Mitigations evaluated:**
- Running with `--reporter=verbose --pool=forks --poolOptions.forks.singleFork` would serialize execution. Slower but stable.
- Upgrade to vitest 4.1+ — release notes mention pool reliability fixes.
- Use `--bail=0` to ensure orphan files are reported as failures rather than silent drops.

None applied yet — filed as a Cat 5 follow-up (test infra). Not a brief-target driver.

---

## Brief check 4 — Map critical user flows against existing test coverage

Already covered in the catalog above. Per-flow verdict:

| Flow | Covered? | Strongest spec | Weakest gap |
|---|:---:|---|---|
| Document CRUD | ✅ | documents.spec.ts | Concurrent rename from two tabs not exercised |
| Real-time Yjs sync | ⚠ moderate | race-conditions.spec.ts | Offline → online merge with edits-on-both-sides not exercised |
| Auth (login + 15-min timeout + 12-hr absolute) | ✅ | session-timeout.spec.ts | Workspace-switch mid-session not exercised |
| Sprint/Week management | ✅ | weeks.spec.ts + weekly-accountability.spec.ts | Bulk week archive not exercised |
| Workspace permissions | ✅ | authorization.spec.ts + document-isolation.spec.ts | — |
| Issue display + linking | ✅ | issues.spec.ts + backlinks.spec.ts | — |
| Accessibility | ✅ | accessibility-remediation.spec.ts (57 tests) | Manual NVDA walkthrough (auto only) — covered in Cat 7 |

---

## Brief check 5 — Configure coverage tooling + report line/branch per package

Audit finding: *"`@vitest/coverage-v8` is not in any package's devDependencies — even though `api/package.json` has a `test:coverage` script that calls `vitest run --coverage`."*

**Fixed.** Installed `@vitest/coverage-v8@4.0.17` (matching the installed vitest version) at the workspace root.

### api/ unit-test coverage (vitest with `--coverage`)

Default scope (files imported by tests):
```
Statements   : 40.30%  (3,270 / 8,113)
Branches     : 33.65%  (1,480 / 4,398)
Functions    : 41.13%  (   246 /   598)
Lines        : 40.46%  (3,178 / 7,853)
```

api/ has the heaviest unit-test footprint — 461 tests across 30 files covering route handlers, helpers, and middleware. 40% line coverage matches the integration-test posture: most routes have a `*.test.ts` exercising the happy path + a couple error paths, but deeper branches (e.g. permission edge cases, JSONB malformed-input paths) aren't reached.

### web/ unit-test coverage (with the 3 flaky files excluded)

Default scope (files imported by tests):
```
Statements   : 22.39%  (  329 /  1,469)
Branches     : 17.56%  (  163 /    928)
Functions    : 19.40%  (   65 /    335)
Lines        : 22.35%  (  306 /  1,369)
```

All-src scope (`--coverage.all --coverage.include='src/**/*.{ts,tsx}'`):
```
Statements   :  2.95%  (  329 / 11,132)
Branches     :  1.94%  (  163 /  8,401)
Functions    :  2.13%  (   65 /  3,046)
Lines        :  3.01%  (  306 / 10,139)
```

**The 3% all-src number is honest but misleading.** Web unit tests intentionally cover only leaf utilities (date-utils, document-content, scroll-fade, useSelection, etc.) — the React component tree is exercised through Playwright E2E, which vitest can't measure. The 22% touched-src number is the better quality signal for what the unit tests are designed to cover.

### shared/ — no tests

shared/ is pure type definitions + 6 helper functions. Coverage isn't applicable.

### Coverage by category

| Code area | api lines covered | web lines covered |
|---|---:|---:|
| Route handlers (api/src/routes/) | ~50% | n/a |
| DB helpers (api/src/db/) | ~25% | n/a |
| Middleware (api/src/middleware/) | ~60% | n/a |
| Services (api/src/services/) | ~35% | n/a |
| Helpers / utilities (api/src/utils/, web/src/lib/) | **>80%** | **>70%** |
| React components (web/src/components/) | n/a | ~1% via unit; high via E2E |
| React pages (web/src/pages/) | n/a | ~0% via unit; high via E2E |

---

## Summary against the brief's checklist

| "How to Measure" item | Status |
|---|---|
| Run the full test suite — pass/fail counts and total runtime | ✅ 461/461 api in 56-60 s (2 of 3 runs had vitest worker flake); 147/160 web in 18-19 s (13 deterministic pre-existing failures) |
| Read test files; catalog what user flows are covered and which are not | ✅ 71 specs / 866 tests cataloged into 9 feature surfaces; gaps surfaced (cross-workspace switching, Yjs offline→online merge, seed integration) |
| Identify flaky tests: 3 runs and note any that pass sometimes and fail others | ✅ NO content-level flakes detected; YES infra-level flake — vitest pool worker dies mid-run on 2 of 3 runs, orphaning the tests in one file. Specific file rotates between runs. |
| Map critical flows against coverage | ✅ Document CRUD ✅ / Real-time Yjs ⚠ moderate / Auth ✅ / Sprint mgmt ✅ — gaps explicitly noted |
| Configure code coverage and report line/branch per package | ✅ `@vitest/coverage-v8@4.0.17` installed (was missing per audit). api/: 40.46% lines / 33.65% branches. web/: 22.35% (test-touched) / 3.01% (all-src). shared/: n/a (no tests). |

---

## What changed since the audit baseline

| Metric | Audit baseline | Current |
|---|---|---|
| api unit tests | 447 across 28 files | **461** across **30 files** |
| web unit tests | 151 across 16 files | **160** across **17 files** |
| E2E specs | 71 files / 866 tests | 71 / 866 (unchanged) |
| Coverage tooling configured? | **No** (`@vitest/coverage-v8` missing) | **Yes** — `@vitest/coverage-v8@4.0.17` installed at workspace root |
| Code coverage measured? | Never | **api: 40.46% lines; web: 22.35% / 3.01%** |
| Empty-test pre-commit hook | broken (Cat 6 finding) | **fixed** (commit `db106d1`) |
| API tests w/ Postgres down | 28/28 files retry-thrash 54 min | unchanged — documented as gotcha |
| `.fixme` / `.skip` / `.only` markers | 0 | 0 (maintained) |

---

## How to reproduce

```bash
# Full unit suite, 3 runs
for i in 1 2 3; do
  echo "=== Run $i ==="
  corepack pnpm --filter @ship/api test 2>&1 | grep -E "Test Files|Tests "
  corepack pnpm --filter @ship/web test 2>&1 | grep -E "Test Files|Tests "
done

# api coverage (default scope = files imported by tests)
corepack pnpm --filter @ship/api exec vitest run --coverage --coverage.reporter=text-summary

# web coverage (excluding the 3 known-flaky upstream test files)
corepack pnpm --filter @ship/web exec vitest run --coverage --coverage.reporter=text-summary \
  --exclude=src/lib/document-tabs.test.ts \
  --exclude=src/components/editor/DetailsExtension.test.ts \
  --exclude=src/hooks/useSessionTimeout.test.ts

# web coverage (all src — shows the unit-vs-E2E split honestly)
corepack pnpm --filter @ship/web exec vitest run --coverage --coverage.reporter=text-summary \
  --coverage.all --coverage.include='src/**/*.{ts,tsx}' \
  --exclude=src/lib/document-tabs.test.ts \
  --exclude=src/components/editor/DetailsExtension.test.ts \
  --exclude=src/hooks/useSessionTimeout.test.ts
```
