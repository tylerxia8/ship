# PlugForge Final Performance Comparison

This document commits the final performance comparison requested in feedback.
It ties the PlugForge submission to the Part 1 ShipShape baseline artifacts
already present in the repo and records the PlugForge-specific measurements run
on 2026-06-08.

## Part 1 Baseline Artifacts

The Part 1 baseline and follow-up measurements live under
`shipshape/improvements/`:

- API P95/P99 baseline and after summaries:
  `shipshape/improvements/raw/perf-after/_compare.txt`,
  `shipshape/improvements/raw/perf-after-v2/_summary.txt`,
  `shipshape/improvements/raw/perf-after-v3/_summary.txt`.
- Bundle-size baseline/current:
  `shipshape/improvements/02-bundle-size-measurement.md`.
- Query-count baseline/current:
  `shipshape/improvements/04-db-queries.md`.

## API Latency

Final stable API summary from `raw/perf-after-v3/_summary.txt`:

| Endpoint | Concurrency | P95 | P99 | Status |
|---|---:|---:|---:|---|
| `/api/auth/me` | 50 | 47ms | 54ms | OK |
| `/api/weeks/my-week` | 50 | 146ms | 179ms | OK |
| `/api/dashboard/my-work` | 50 | 196ms | 230ms | OK |
| `/api/issues` | 50 | 479ms | 505ms | OK |
| `/api/documents?type=wiki` | 50 | 171ms | 229ms | OK |

PlugForge adds new `/api/v1/*` platform routes rather than rewriting those
Part 1 first-party endpoints. The local PlugForge fitness suite runs public
routes with audit, rate-limit, scope, OpenAPI, SDK, webhook, retry, and replay
middleware enabled. The final check on 2026-06-08 passed those routes without
latency gate failures; the TTFE CI drill for commit `f8fc7c7` completed in
3m04s including install, drill, flake proof, and artifact upload.

## Bundle Size

Part 1 bundle measurement:

| Metric | Audit baseline | Current measured value | Change |
|---|---:|---:|---:|
| Initial chunk raw | 2,073,698 B | 785,520 B | -62.1% |
| Initial chunk gzipped | 589,490 B | 218,930 B | -62.9% |

PlugForge's SDK package measurement on 2026-06-08:

| Metric | Target | Measured |
|---|---:|---:|
| SDK minified + gzipped | < 250 KB | 4,094 B |
| SDK production dependencies | none preferred | 0 |

The Developer Portal code is part of the existing Ship web app and does not
increase the `@ship/sdk` install footprint. The SDK remains dependency-free.

## Query Counts

Part 1 query-count improvement from `shipshape/improvements/04-db-queries.md`:

| Flow | Before | After | Change |
|---|---:|---:|---:|
| `/api/dashboard/my-work` | 4 queries | 2 queries | -50% |

PlugForge public API calls add one audit insert per public request by design.
That is the platform cost of the audit trail. It does not alter the measured
Part 1 first-party `/api/dashboard/my-work` flow. Public routes are bounded and
small: document list/read/create, scope/event registries, OAuth app portal
operations, webhook subscription/delivery operations, and audit reads.

## PlugForge-Specific Measurements

Measured on 2026-06-08:

| Check | Command | Measured |
|---|---|---:|
| OpenAPI generation | `corepack.cmd pnpm plugforge:costs -- --measure-ci` | 1,721ms |
| OpenAPI schema validation slice | same | 9,120ms |
| Webhook signature verifier | `corepack.cmd pnpm plugforge:perf` | 0.009473ms/call |
| SDK package size | `corepack.cmd pnpm plugforge:perf` | 4,094 B gzip |
| OAuth browser-backed tests | `plugforge:costs` | 1 Playwright test/context |
| Demo-volume retained logs | `plugforge:costs` | ~4.19 MB retained |

## Final Position

The Part 1 baseline endpoints remain within the measured performance envelope
from ShipShape artifacts. PlugForge's new platform layer adds auditable public
contract behavior and has its own gates for TTFE, SDK size, signature verifier
speed, OpenAPI parity, rate-limit headers, and webhook delivery/retry behavior.

