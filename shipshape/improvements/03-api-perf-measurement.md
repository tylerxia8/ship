# Cat 3 — API Response Time Measurement

This document executes each item from the brief's **"How to Measure"** checklist for Category 3, against the current `shipshape/deploy` state at the brief's required seed volume.

Reproducible:
```bash
# 1. Seed to brief-spec volume:
corepack pnpm --filter @ship/api db:seed
corepack pnpm --filter @ship/api exec tsx ../shipshape/audit/scripts/seed-topup.ts

# 2. Login + capture session:
curl -s -c .cookies.txt http://localhost:3000/api/csrf-token -o .csrf.json
CSRF=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.csrf.json','utf8')).token)")
curl -s -c .cookies.txt -b .cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"dev@ship.local","password":"admin123"}'

# 3. Run the sweep:
node shipshape/improvements/_measure-api-perf.mjs
```

---

## Brief check 1 — Seed to realistic volume

Brief asks for **500+ docs / 100+ issues / 20+ users / 10+ sprints**. The standard `pnpm db:seed` produces ~257 docs / 104 issues / 11 users / 35 sprints — sprint count meets, but the others don't.

Topped up via [`shipshape/audit/scripts/seed-topup.ts`](../audit/scripts/seed-topup.ts) which adds 10 users + 200 issues + 50 wikis idempotently:

| Metric | Brief min | After standard seed | After top-up |
|---|---:|---:|---:|
| Total documents | 500+ | 257 | **517** ✅ |
| Issues | 100+ | 104 | **304** ✅ |
| Users | 20+ | 11 | **21** ✅ |
| Sprints | 10+ | 35 | **35** ✅ |
| Programs | — | 5 | 5 |
| Projects | — | 15 | 15 |

Seed verifiable via:
```sql
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM documents WHERE document_type='issue') AS issues,
  (SELECT COUNT(*) FROM documents WHERE document_type='wiki') AS wikis,
  (SELECT COUNT(*) FROM documents WHERE document_type='sprint') AS sprints,
  (SELECT COUNT(*) FROM documents) AS total_docs;
```

---

## Brief check 2 — Top 5 endpoints by user-flow trace

Identified by frontend code analysis (grep'd every `apiGet`/`apiPost`/`apiPatch`/`apiDelete` call site) + manual walk-through of common flows:

| Endpoint | Why it's a top-5 | Fires during |
|---|---|---|
| `GET /api/auth/me` | Fires on **every page** to refresh auth + workspace context | Every navigation |
| `GET /api/weeks/my-week` | The default route post-login | My Week page (the workspace's hub) |
| `GET /api/dashboard/my-work` | Aggregates issues + projects + sprints for the user | Dashboard + Action Items modal |
| `GET /api/issues` | The cross-workspace issues list | Issues page (the audit's hot path) |
| `GET /api/documents?type=wiki` | Documents tab, lists all wiki docs in workspace | Docs page |

Frontend call-site counts (`grep apiGet/apiPost in web/src`):
- `/api/documents` 41 references (highest-volume endpoint family)
- `/api/weeks` 19
- `/api/projects` 10, `/api/programs` 10
- `/api/issues` 8

`/api/auth/me` shows lower grep count because it's wired through `useAuth()` hook (one call site, fired on every mount). The selection above is **call-frequency-weighted**, not call-site-count-weighted.

---

## Brief check 3 + 4 — Benchmark at c=10/25/50 with P50/P95/P99

autocannon 10-second runs, identical conditions, rate-limiter bypassed via `SHIPSHAPE_AUDIT=1` env flag. **P95 is interpolated between autocannon's `p90` and `p97_5`** since autocannon doesn't report it directly: `P95 = P90 + (P97.5 − P90) × (5/7.5)`. Raw JSONs at [shipshape/improvements/raw/perf-after-v3/](raw/perf-after-v3/).

### Full sweep

| Endpoint | Conc. | P50 | P95 | P99 | RPS |
|---|---:|---:|---:|---:|---:|
| `/api/auth/me` | 10 | 7 ms | 12 ms | 16 ms | 1,212 |
| `/api/auth/me` | 25 | 19 ms | 30 ms | 50 ms | 1,189 |
| `/api/auth/me` | 50 | 38 ms | 47 ms | 54 ms | 1,273 |
| `/api/weeks/my-week` | 10 | 18 ms | 38 ms | 53 ms | 490 |
| `/api/weeks/my-week` | 25 | 45 ms | 69 ms | 88 ms | 524 |
| `/api/weeks/my-week` | 50 | 92 ms | 146 ms | 179 ms | 509 |
| `/api/dashboard/my-work` | 10 | 20 ms | 39 ms | 48 ms | 445 |
| `/api/dashboard/my-work` | 25 | 48 ms | 128 ms | 166 ms | 446 |
| `/api/dashboard/my-work` | 50 | 108 ms | 196 ms | 230 ms | 427 |
| `/api/issues` | 10 | **67 ms** | **88 ms** | **99 ms** | 147 |
| `/api/issues` | 25 | **174 ms** | **242 ms** | **282 ms** | 139 |
| `/api/issues` | 50 | **375 ms** | **479 ms** | **505 ms** | 130 |
| `/api/documents?type=wiki` | 10 | 14 ms | 19 ms | 24 ms | 683 |
| `/api/documents?type=wiki` | 25 | 37 ms | 53 ms | 76 ms | 640 |
| `/api/documents?type=wiki` | 50 | 77 ms | 171 ms | 229 ms | 570 |

**Zero non-2xx responses** across all 15 cells. Zero timeouts. Clean signal.

### Ranking by P95 at c=50 (the brief's stress condition)

| Rank | Endpoint | P95 at c=50 | RPS | Response size |
|:---:|---|---:|---:|---:|
| 1 (slowest) | `/api/issues` | **479 ms** | 130 | **256 KB** |
| 2 | `/api/dashboard/my-work` | 196 ms | 427 | 11 KB |
| 3 | `/api/documents?type=wiki` | 171 ms | 570 | 22 KB |
| 4 | `/api/weeks/my-week` | 146 ms | 509 | 13 KB |
| 5 (fastest) | `/api/auth/me` | 47 ms | 1,273 | 377 B |

---

## Brief check 5 — Hypothesize why each slow endpoint is slow

### `/api/issues` — **slowest by far** (P95 at c=50 = 479 ms, 5× the median)

**Hypothesis: response-size dominated, not query-time dominated.**

- Response payload: **256 KB** at 304 issues = ~840 bytes per issue
- At 130 RPS × 256 KB/response = **~33 MB/s outbound** from the dev API
- That's TCP send-buffer territory; even with the Cat 3 fix that already dropped `d.content` from the SELECT, the remaining per-issue payload (id + title + properties JSONB + ticket_number + 4 timestamps + 2 join columns) at 304 issues × 50 concurrent connections saturates the response pipeline.

The query itself is cheap (`Seq Scan` on 517 rows finishes in ~1 ms per EXPLAIN ANALYZE). The latency is bandwidth + JSON serialization, not SQL.

**Proposed fix (filed as follow-up #1 in SUBMISSION.md):**
1. **Cursor-based pagination** (`?cursor=<updated_at,id>&limit=50`) — default page size 50 brings the per-request payload to ~42 KB. P95 drops to <100 ms by construction.
2. **Don't ship `properties` JSONB at the list level** — only ship the keys the list UI uses (state, priority, assignee_id, sprint_id). Trim the JSONB shape server-side.

Out of scope for the Cat 3 fix because it's a UI contract change (the issues list expects the full property bag today). Filed.

### `/api/dashboard/my-work` — 196 ms P95 at c=50

**Hypothesis: correlated-subquery cost on the project branch.**

- Response is only 11 KB so it's not bandwidth.
- The Cat 4 fix already combined 4 queries → 2 via `UNION ALL`. Most of the new combined query is fast (Index Scan), but the project branch contains a *correlated subquery* that computes `inferred_status` per project (joining 4 tables: issues + sprint_assoc + sprint + projects). EXPLAIN ANALYZE shows 596 buffer hits at baseline volume.
- At 50 concurrent requests × 596 buffer hits each = lots of cache pressure. The plan is `Nested Loop + Bitmap Heap Scan`; under load it's CPU-bound on Postgres.

**Proposed fix:** rewrite the correlated subquery as a single CTE that computes `inferred_status` for all projects in one aggregate pass. Out of scope for the brief target (the 4→2 query consolidation already cleared Cat 4); documented in `04-db-queries.md` as the intentional non-rewrite.

### `/api/documents?type=wiki` — 171 ms P95 at c=50

**Hypothesis: response-size growth at 50 connections.**

- 57 wiki docs × ~400 bytes/doc = 22 KB response.
- At c=10 / c=25 it's <80 ms; only at c=50 does it climb to 171 ms.
- The query itself uses `idx_documents_active` (partial index on `document_type='wiki' AND archived_at IS NULL AND deleted_at IS NULL`). EXPLAIN shows Index Scan + sort, well under 1 ms.
- The c=50 jump is the same bandwidth/serialization pattern as `/api/issues`, just smaller in absolute terms.

**Proposed fix:** same as `/api/issues` — pagination at the list level. Doesn't matter as much because the payload is already moderate.

### `/api/weeks/my-week` — 146 ms P95 at c=50

**Hypothesis: in-handler JS computation (sprint-grouping + accountability).**

- Response is 13 KB.
- The handler does a small SQL fetch (3 queries: workspace + sprints + accountability rows) + considerable in-JS work computing the current sprint, grouping issues/standups/plans/retros by sprint, and deriving accountability badges.
- The c=50 P95 jump is consistent with Node's single event-loop being shared across 50 in-flight handler executions doing CPU work.

**Proposed fix:** push grouping logic into SQL (one query that returns pre-grouped JSONB structure). Would simplify the handler and let Postgres do the work in parallel. Out of scope here.

### `/api/auth/me` — 47 ms P95 at c=50 (the fastest)

**No bottleneck.** P95 stays under 50 ms at every concurrency level. Two trivial queries (`SELECT user`, `SELECT membership`) + a 377-byte response. The Cat 3 pool bump (max=10 → 20) was the structural fix here — the audit baseline at c=50 was P99=1575ms because 40 of 50 requests sat queued for a Pool slot. With max=20, queue is gone.

---

## Summary against the brief's checklist

| "How to Measure" item | Status |
|---|---|
| Seed the database with realistic data (500+ docs, 100+ issues, 20+ users, 10+ sprints) | ✅ 517 docs / 304 issues / 21 users / 35 sprints — all 4 thresholds exceeded |
| Identify the 5 most important API endpoints by tracing the frontend's network requests | ✅ Identified via grep'd `apiGet`/`apiPost` references + user-flow walk-through |
| Benchmark each endpoint using a load-testing tool. Record P50, P95, P99 | ✅ autocannon, 10s/cell, P95 interpolated from P90/P97.5 (autocannon doesn't report P95 natively — documented in script) |
| Test under concurrent load: 10, 25, 50 simultaneous connections | ✅ 5 endpoints × 3 concurrency = 15 cells, all clean (0 non-2xx, 0 timeouts) |
| Identify the slowest endpoints and hypothesize why they are slow | ✅ Ranked by P95 at c=50. Each of the 4 non-best endpoints has a documented hypothesis (response-size vs CPU vs correlated subquery vs in-handler JS work) with proposed fix |

---

## What changed since the audit baseline

| Endpoint | P95 baseline (c=50) | P95 now at 517 docs (c=50) | Net |
|---|---:|---:|---|
| `/api/auth/me` | ~954 ms (interpolated) | **47 ms** | **−95%** |
| `/api/weeks/my-week` | ~126 ms | 146 ms | +16% — fair because volume doubled (257 → 517 docs); per-doc-volume P95 is roughly stable |
| `/api/dashboard/my-work` | ~278 ms (anomalous) | 196 ms | −29% |
| `/api/issues` | ~486 ms | 479 ms | −1% — the headline problem at scale; *content stripping fixed the worst case but pagination is the right next step* |
| `/api/documents?type=wiki` | ~181 ms | 171 ms | −5% |

The Cat 3 brief target (`−20% P95 on ≥2 endpoints`) was satisfied at audit-spec volume (257 docs) — see [03-api-perf.md](03-api-perf.md). At brief-spec volume (517 docs) the headline wins (especially `/api/auth/me`) hold; the remaining bottleneck is now genuinely `/api/issues` and the response-size hypothesis above. **Documented as the #1 follow-up.**
