# Cat 5 — Coverage baseline (2026-05-22)

Captured by `corepack pnpm --filter @ship/api test:coverage` on `shipshape/05-test-coverage` HEAD.

**Tests:** 30 files / 461 passed (the 19 Cat 5 additions are included).

## Headline numbers

| Metric | Total | Covered | Pct |
|---|---:|---:|---:|
| Statements | 8,166 | 3,307 | **40.49%** |
| Branches | 4,380 | 1,476 | **33.69%** |
| Functions | 596 | 245 | **41.10%** |
| Lines | 7,909 | 3,215 | **40.64%** |

## CI thresholds (configured in `api/vitest.config.ts`)

```ts
thresholds: {
  statements: 35,   // floor ≈ baseline − 5
  branches:   30,   //   structurally lower; long if/else ladders in route handlers
  functions:  35,
  lines:      35,
}
```

`pnpm --filter @ship/api test:coverage` exits 0 today; any drop past the floor exits non-zero.

## Files with 100% coverage (the helpers Cat 5 tests targeted)

- `src/utils/business-days.ts`
- `src/utils/document-content.ts`
- `src/openapi/schemas/*` (all schema files — these are declarative constants)
- `src/middleware/visibility.ts`
- `src/openapi/registry.ts`
- Every route file that doesn't get integration-tested at this layer (issues, programs, projects, search, standups, team, weekly-plans, weeks, workspaces) shows 100% in the JSONB-property-extraction utilities they call, but the route handlers themselves are well below 100% (covered by E2E).

## Files with lowest coverage (next-round targets)

| File | Lines % | Why low |
|---|---:|---|
| `src/services/oauth-state.ts` | 6.66% | Requires SAML/OIDC integration env |
| `src/services/caia.ts` | 4.58% | Requires CAIA service running |
| `src/services/secrets-manager.ts` | 1.58% | Requires AWS credentials |
| `src/routes/dashboard.ts` | 2.04% | Large file (~700 lines); E2E only |
| `src/routes/programs.ts` | 5.18% | Large file (~900 lines); E2E only |
| `src/routes/weekly-plans.ts` | 5.09% | Large file (~1100 lines); E2E only |
| `src/routes/team.ts` | 9.05% | Large file (~2200 lines); E2E only |

These are honest gaps. The right fix is unit-level tests on the smaller, pure helpers each route calls; not heroic integration setups for the AWS/CAIA services.

## Reproducing this report

```bash
cd C:\Users\tyler\ship
corepack pnpm --filter @ship/api test:coverage
# Output:
#   api/coverage/index.html  → browseable HTML report
#   api/coverage/coverage-summary.json  → machine-readable summary
# A snapshot of coverage-summary.json is committed alongside this file.
```
