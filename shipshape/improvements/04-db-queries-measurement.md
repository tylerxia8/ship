# Cat 4 — Database Query Efficiency Measurement

Executes each item from the brief's **"How to Measure"** checklist for Category 4, against the current `shipshape/deploy` state at brief-spec seed volume (517 docs / 304 issues / 21 users / 35 sprints).

Reproducible — see [§ "How to reproduce"](#how-to-reproduce) at the bottom.

---

## Brief check 1 — Enable query logging

Brief says: *"Enable PostgreSQL query logging (`log_statement = 'all'` in postgresql.conf or via Docker environment variables)."*

The dev box uses **native Postgres 18 on Windows** (not Docker), and `postgresql.conf` requires admin access to edit + reload. I achieved the equivalent at the **application level**: a conditional wrapper around `pool.query` that writes one TSV line per call to a path given by the `QUERY_LOG` env var.

Wrapper in [api/src/db/client.ts](../../api/src/db/client.ts) (gated by `process.env.QUERY_LOG` — zero overhead when off, no impact on production):

```ts
if (process.env.QUERY_LOG) {
  const fs = await import('fs');
  const originalQuery = pool.query.bind(pool);
  pool.query = async (...args) => {
    const start = Date.now();
    try {
      const result = await originalQuery(...args);
      const dt = Date.now() - start;
      fs.appendFileSync(QUERY_LOG, `${new Date().toISOString()}\t${dt}\t${sql_first_220}\n`);
      return result;
    } catch (err) { … }
  };
}
```

Equivalent to `log_statement='all' + log_duration=on` in `postgresql.conf` but with per-query duration measured client-side (no parser/planner-time-only split, but for our purposes the end-to-end roundtrip number is what matters).

---

## Brief check 2 — Execute 5 common user flows

Brief lists them by example: load the main page, view a document, list issues, load a sprint board, search for content. Mapping to Ship's actual routes:

| Brief's flow | Ship's HTTP request(s) |
|---|---|
| **Load the main page** | `GET /api/auth/me` then `GET /api/weeks/my-week` (the post-login default route) |
| **View a document** | `GET /api/documents/:id` (after `/api/documents?type=wiki` to pick one) |
| **List issues** | `GET /api/issues` |
| **Load a sprint board** | `GET /api/auth/me` then `GET /api/dashboard/my-work` (the action-items aggregate) |
| **Search for content** | `GET /api/search/mentions?q=ship` |

Each was driven via `fetch()` from [shipshape/improvements/_measure-db-queries.mjs](_measure-db-queries.mjs), with the QUERY_LOG cleared between flows. Raw output at [shipshape/improvements/raw/cat4-flows/](raw/cat4-flows/).

---

## Brief check 3 — Total queries per flow

| Flow | HTTP requests | Queries | Total query time | Slowest single query |
|---|---:|---:|---:|---|
| `load_main_page` | 2 (auth/me + my-week) | **10** | 43 ms | 27 ms — my-week issue join |
| `view_a_document` | 1 (`/api/documents/:id`) | **4** | 11 ms | 6 ms — doc visibility-resolved SELECT |
| `list_issues` | 1 (`/api/issues`) | **5** | 26 ms | 13 ms — issues list |
| `load_sprint_board` | 2 (auth/me + my-work) | **10** | 36 ms | 23 ms — my-work UNION ALL |
| `search_content` | 1 (`/api/search/mentions`) | **5** | 12 ms | 5 ms — person search |

**Observations:**
- Every flow that includes an authenticated request triggers **3 fixed-overhead queries** (session SELECT + session activity UPDATE + workspace-membership role check). That's `2.4× total queries per flow` if a user only cares about the domain query.
- The 2-request flows (load_main_page, load_sprint_board) double-up the session overhead. Each HTTP request validates its own session independently.
- The 1-request flows (view_a_document, list_issues, search_content) cost 4–5 queries each: 3 session-overhead + 1-2 domain queries.

---

## Brief check 4 — EXPLAIN ANALYZE on the slowest queries

### Slowest #1 — `/my-week` issue assignment query (27 ms in flow, 2.6 ms execution)

```sql
SELECT i.id, i.title, i.properties, …
FROM documents i
WHERE i.workspace_id = $1
  AND i.document_type = 'issue'
  AND (i.properties->>'assignee_id')::uuid = $2
  AND i.archived_at IS NULL AND i.deleted_at IS NULL
```

**EXPLAIN ANALYZE result:**
```
Seq Scan on documents i  (cost=0.00..51.92 rows=2 width=218)
  Filter: ((archived_at IS NULL) AND (deleted_at IS NULL) AND (workspace_id = …)
          AND (document_type = 'issue') AND (((properties ->> 'assignee_id'))::uuid = …))
  Rows Removed by Filter: 499
  Buffers: shared hit=39
Planning Time: 21.032 ms
Execution Time: 2.559 ms
```

**Finding:** the planner takes **21 ms** vs only **2.6 ms** to execute. That's because the JSONB extraction `(properties->>'assignee_id')::uuid` doesn't match any existing index (more on this below). Sequential scan over 518 rows is still fast in absolute terms, but the planning overhead is the dominant cost. At 5,000+ rows the seq scan would become the dominant cost.

### Slowest #2 — `/my-work` UNION ALL (23 ms in flow, 3.7 ms execution)

```sql
SELECT 'issue' AS kind, d.* FROM documents WHERE … document_type = 'issue' AND (properties->>'assignee_id')::uuid = $2 …
UNION ALL
SELECT 'project' AS kind, d.* FROM documents WHERE … document_type = 'project' AND (properties->>'owner_id')::uuid = $2 …
UNION ALL
SELECT 'sprint' AS kind, d.* FROM documents WHERE … document_type = 'sprint' AND (properties->>'owner_id')::uuid = $2 …
```

**EXPLAIN ANALYZE result (abbreviated):**
```
Append (cost=0.00..133.89 rows=4 width=79) (actual time=0.733..2.431 rows=19.00 loops=1)
  -> Seq Scan on documents d  (issue branch)   — falls back to seq scan
  -> Bitmap Heap Scan on documents d_1  (project branch) — uses idx_documents_document_type
       └─ Bitmap Index Scan on idx_documents_document_type
  -> Bitmap Heap Scan on documents d_2  (sprint branch)  — uses idx_documents_document_type
       └─ Bitmap Index Scan on idx_documents_document_type
Planning Time: 4.080 ms
Execution Time: 3.740 ms
```

**Finding:** the **project** and **sprint** branches DO use an index (`idx_documents_document_type`) → Bitmap Index Scan. The **issue** branch falls back to Seq Scan despite the 04b functional index `idx_documents_issue_assignee` existing on `(properties->>'assignee_id')`. **Why?** The query casts to `::uuid`; the index is on the text extraction. Type mismatch → planner can't use the index. **Real finding — see brief check 5 below for the fix.**

### Slowest #3 — `/api/issues` list (13 ms in flow, 1.4 ms execution)

```sql
SELECT d.id, d.title, d.properties, …
FROM documents d
WHERE d.workspace_id = $1 AND d.document_type = 'issue'
  AND d.archived_at IS NULL AND d.deleted_at IS NULL
ORDER BY (CASE priority …), d.updated_at DESC
```

**EXPLAIN ANALYZE result:**
```
Sort  (cost=63.09..63.85 rows=304 width=238) — quicksort in 105 kB memory
  -> Seq Scan on documents d (304 rows from 518 scanned)
Planning Time: 0.658 ms
Execution Time: 1.425 ms
```

**Finding:** healthy at this volume. The Seq Scan reads all 518 rows because the issues are 60% of the table — selectivity is too low for an index to be worth it. At 10× the data, `idx_documents_active` (the partial index on `(workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL`) would kick in. No fix needed.

---

## Brief check 5 — Check missing indexes vs WHERE clauses

Catalog of WHERE-clause patterns observed in the 5 flows, cross-referenced against the indexes that exist in schema + migrations:

| WHERE clause | Existing index | Index used in EXPLAIN? |
|---|---|---|
| `workspace_id = ? AND document_type = ? AND archived_at IS NULL AND deleted_at IS NULL` | `idx_documents_active` (partial, on `workspace_id, document_type`) | Sometimes — planner chooses Seq Scan at this volume because the partial index doesn't help filter much when 60% of rows match. ✓ working as designed. |
| `(properties->>'assignee_id')::uuid = ?` (issues) | `idx_documents_issue_assignee` (partial functional, on `(properties->>'assignee_id')` **TEXT**) | **NO — type mismatch.** Index is on text extraction; query casts to uuid. Planner can't use the index. |
| `(properties->>'owner_id')::uuid = ?` (projects) | `idx_documents_project_owner` (partial functional, on `(properties->>'owner_id')` **TEXT**) | **NO — same type mismatch.** |
| `(properties->>'state') NOT IN ('done','cancelled')` | `idx_documents_issue_state` (partial functional, on `(properties->>'state')`) | Yes when the predicate is `=` (textbook plan change documented in 04b doc). NO when it's `NOT IN` because B-tree indexes are bad at `NOT IN` selectivity. |
| `sessions.id = ?` (every authenticated request) | implicit PK | Yes |
| `workspace_memberships.workspace_id = ? AND user_id = ?` | composite PK | Yes |

**Real finding from this measurement:** the 04b functional indexes need a one-line fix to cover the cast that the route handlers actually use.

**Current (the 04b migration):**
```sql
CREATE INDEX idx_documents_issue_assignee
  ON documents ((properties->>'assignee_id'))   -- text
  WHERE document_type = 'issue' …;
```

**Should be:**
```sql
CREATE INDEX idx_documents_issue_assignee
  ON documents (((properties->>'assignee_id')::uuid))   -- cast inside the index
  WHERE document_type = 'issue' …;
```

That's a one-character change per index (×3 indexes from 04b). Filed as a **new Cat 4 follow-up** uncovered specifically by this measurement.

---

## Brief check 6 — Identify N+1 patterns

Heuristic: scan each flow for query *shapes* (SQL with literals/UUIDs normalized) that appear ≥3 times. None of the 5 flows hit this threshold.

Manual inspection of the issues list flow (the historically N+1-prone case):

```
list_issues (5 queries):
  [1ms] SELECT s.id, s.user_id, s.workspace_id … FROM sessions … (auth)
  [1ms] UPDATE sessions SET last_activity = ? WHERE id = ?       (auth)
  [0ms] SELECT role FROM workspace_memberships …                 (auth)
  [13ms] SELECT d.id, d.title, … FROM documents WHERE …          (issues list)
  [11ms] SELECT da.document_id, da.related_id … FROM document_associations
         WHERE da.document_id = ANY($1) …                        (BATCH associations)
```

The associations fetch uses `WHERE document_id = ANY($1)` — that's a **single batched query** for all issues, not one query per issue. **No N+1.**

The previously-identified N+1 risk in the dashboard /my-work flow was already addressed by Cat 4's `UNION ALL` consolidation (4 → 2 queries). EXPLAIN confirms the 2 queries each touch the right rows in one pass.

---

## Summary against the brief's checklist

| "How to Measure" item | Status |
|---|---|
| Enable PostgreSQL query logging | ✅ App-level wrapper in `client.ts` gated by `QUERY_LOG` env var (system Postgres conf needs admin; equivalent measurement) |
| Execute 5 common user flows | ✅ load_main_page, view_a_document, list_issues, load_sprint_board, search_content — all driven via [`_measure-db-queries.mjs`](_measure-db-queries.mjs) |
| Count total queries per flow | ✅ 10 / 4 / 5 / 10 / 5 queries. Of these, ~3 per request are session-validation overhead. |
| Run EXPLAIN ANALYZE on the slowest queries | ✅ Top 3 EXPLAINed: my-week issue join (21 ms planning, 3 ms exec), my-work UNION ALL (4 ms planning, 4 ms exec), issues list (Seq Scan + Sort, 1.4 ms exec) |
| Check for missing indexes | ✅ Real finding: 04b functional indexes are on **text** extractions but route handlers cast to **uuid**, so the indexes aren't chosen. One-line fix per index. |
| Identify N+1 patterns | ✅ None found. Issues list correctly uses `WHERE id = ANY($1)` batching for associations. Heuristic check (shape repeated ≥3×) returned zero hits. |

---

## What this measurement uncovered that the audit didn't

The audit identified the missing functional indexes as a future bottleneck at scale. The 04b branch added them. **This measurement uncovers that the indexes aren't actually being used by the production query paths** because of the `::uuid` cast type mismatch. The follow-up: re-cast the indexes to `((properties->>'assignee_id')::uuid)` etc. so they cover the actual query shape. EXPLAIN ANALYZE re-run after that fix would show Bitmap Index Scan instead of Seq Scan on the issue branch of `/my-work`. Filed.

---

## How to reproduce

```bash
# 1. Start the API with QUERY_LOG set
mkdir -p shipshape/improvements/raw/cat4-flows
QUERY_LOG="$(pwd)/shipshape/improvements/raw/cat4-flows/queries.tsv" \
SHIPSHAPE_AUDIT=1 \
corepack pnpm --filter @ship/api dev

# 2. In another shell — login + capture session
curl -s -c .cookies.txt http://localhost:3000/api/csrf-token -o .csrf.json
CSRF=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.csrf.json','utf8')).token)")
curl -s -c .cookies.txt -b .cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"dev@ship.local","password":"admin123"}'

# 3. Drive the 5 flows + write per-flow summary
node shipshape/improvements/_measure-db-queries.mjs
# Writes:
#   shipshape/improvements/raw/cat4-flows/_flows-summary.json
#   shipshape/improvements/raw/cat4-flows/_flows-summary.txt

# 4. Re-run EXPLAIN ANALYZE on any specific query via the api/-scoped node helper.
```
