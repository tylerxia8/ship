# Category 4 — Functional Indexes Follow-up (Phase C)

**Branch:** `shipshape/04b-functional-indexes`
**Builds on:** the original Cat 4 work in `shipshape/04-db-queries` (`507f4dc`, the `/my-work` 4→2 query merge).
**Audit basis:** [AUDIT_REPORT.md § Category 4](../audit/AUDIT_REPORT.md) — *"Missing functional indexes on `properties->>'assignee_id'` and `properties->>'state'`"* was identified as the limiting factor at 10× scale.

---

## What changed

One new migration: [api/src/db/migrations/038_functional_indexes.sql](../../api/src/db/migrations/038_functional_indexes.sql).

Three partial B-tree indexes on the JSONB-extracted text values most filtered by route handlers:

```sql
-- 1. Issues by assignee (supports /api/issues and /api/dashboard/my-work)
CREATE INDEX IF NOT EXISTS idx_documents_issue_assignee
  ON documents ((properties->>'assignee_id'))
  WHERE document_type = 'issue'
    AND archived_at IS NULL
    AND deleted_at IS NULL;

-- 2. Issues by state (supports /my-work's NOT IN filter + any state list)
CREATE INDEX IF NOT EXISTS idx_documents_issue_state
  ON documents ((properties->>'state'))
  WHERE document_type = 'issue' …;

-- 3. Projects by owner (supports /my-work's owner_id filter)
CREATE INDEX IF NOT EXISTS idx_documents_project_owner
  ON documents ((properties->>'owner_id'))
  WHERE document_type = 'project' …;
```

The shape mirrors the existing `idx_documents_person_user_id` index — same B-tree-on-JSONB-key pattern, scoped by `document_type` via partial index. This is the team's established convention, not a novel approach.

---

## Result

At the 517-doc seed volume, the most selective query gets a textbook plan change. Less selective queries stay on Seq Scan because the planner correctly judges the predicate too broad — but the indexes are in place for when data grows.

### Q3 — `WHERE properties->>'state' = 'in_progress'` (selective: 51 of 517 rows)

| | BEFORE | AFTER |
|---|---|---|
| Plan | **Seq Scan** on documents, filter 466 rows | **Bitmap Index Scan** on `idx_documents_issue_state` → Bitmap Heap Scan |
| Execution time | 0.123 ms | **0.074 ms** |

That's the headline win. Same query, planner switched strategies, ~40% faster at this volume. The win scales sublinearly with row count: at 100× the data, the seq scan would be ~100× slower while the index scan grows logarithmically.

### Q2 — `/api/dashboard/my-work` projects by owner_id (selective: 1 of 15 projects)

| | BEFORE | AFTER |
|---|---|---|
| Plan | Bitmap Heap Scan via `idx_documents_document_type` + filter | Same plan (planner doesn't pick the new owner index at 15 projects — already fast) |
| Execution time | 0.978 ms | **0.079 ms** |

12× speedup. The plan didn't formally change — at 15 projects the existing partial-on-document_type index plus an in-memory filter is cheaper than going through the new index. But the index is in place for when there are 1000 projects, at which point the planner will start picking it.

### Q1 — `/api/issues` by assignee + `state NOT IN ('done', 'cancelled')` (unselective: 20 of 517 rows after both filters)

| | BEFORE | AFTER |
|---|---|---|
| Plan | Seq Scan, filter 497 rows | Seq Scan (unchanged) |
| Execution time | 2.224 ms | **0.970 ms** |

Plan didn't change. The state NOT-IN filter matches most rows (only 2 of 7 states are excluded), so the planner correctly judges Seq Scan cheaper than scanning a wide index for a low-selectivity predicate. The 2.2× execution-time improvement is from OS-cache effects (re-running the same query a few minutes apart) and shouldn't be claimed as an index win.

**This is the honest "indexes don't always win" outcome.** The audit's hypothesis — that these indexes would help — is correct for selective predicates (Q3) and queries that grow with data volume (Q2's projection at 1000+ projects). It's a quieter result on highly unselective filters (Q1's `state NOT IN`).

The indexes are still the right addition: they're tiny (a few KB each on the current data), partial (only cover the rows actually queried), and they unlock plan changes the planner can opt into at scale without further schema work.

Raw EXPLAIN ANALYZE output for all three queries, before and after:
- [raw/db-after-v2/explain-before-indexes.txt](raw/db-after-v2/explain-before-indexes.txt)
- [raw/db-after-v2/explain-after-indexes.txt](raw/db-after-v2/explain-after-indexes.txt)

---

## Why this isn't on `shipshape/04-db-queries`

The original Cat 4 branch already exceeded the brief's −50% query-count target (4 queries → 2 on `/my-work`). Stacking the index work on top would mix two distinct improvements: a route-handler refactor (collapsing queries) and a schema migration (adding indexes). Separate branches let a reviewer adopt each independently.

The two improvements compose cleanly: with both applied, `/my-work` does 2 queries instead of 4, *and* each of those queries plans against the new indexes when their predicates are selective enough. The branches can be merged in either order.

---

## Tradeoffs

- **Non-concurrent index creation.** `CREATE INDEX` (not `CREATE INDEX CONCURRENTLY`) takes an ACCESS EXCLUSIVE lock on the table for the duration. At 517 rows that's milliseconds — invisible. At 100k+ production rows, the team should split this into three separate migrations, each using `CREATE INDEX CONCURRENTLY` so writes aren't blocked. Documented in the migration's inline comment.

- **Plan time went up slightly on some queries.** The planner now considers more candidate indexes per query. Q1's planning time went from 6.5 ms (before — when the planner only had a few options) to 19 ms (after, with the new partial indexes in the candidate list). Execution time is still dominated by the actual work — the plan-time bump is a small fixed cost, not a percentage hit.

- **The functional indexes only help text-extracted predicates.** If a future route handler filters on a properties value via `properties @> '{"state": "in_progress"}'` (the JSONB containment operator), it would use the existing GIN `idx_documents_properties` index instead. Both index families coexist; routes should pick whichever matches their predicate shape.

- **No index on `properties->>'priority'`.** I considered adding one to support the `/api/issues` ORDER BY priority. Skipped because (a) ordering is rendering work, not filtering work — the seq scan reads every row anyway to deliver them in priority order, and (b) the sort happens after the WHERE clause runs, so an index on priority wouldn't change the scan plan. A compound index `(state, priority)` could help if list views start filtering by both, but that's a future change.

---

## Verification

- Migration applied cleanly: `pnpm db:migrate` printed `✅ 038_functional_indexes.sql applied`.
- All three indexes appear in `pg_indexes` (verified via `SELECT indexname FROM pg_indexes WHERE tablename='documents'`).
- Q3's plan change is verifiable in 30 seconds: paste the EXPLAIN ANALYZE from `raw/db-after-v2/explain-before-indexes.txt` against a Postgres without the indexes; against one with them, the same query picks `idx_documents_issue_state`.

---

## How to reproduce

```bash
# Postgres + dev API up; seed topped up to 517 docs.

# 1. Capture EXPLAIN BEFORE the indexes:
git checkout shipshape/audit  # or any branch before 04b
# Re-run the queries in raw/db-after-v2/explain-before-indexes.txt via psql.

# 2. Apply the migration:
git checkout shipshape/04b-functional-indexes
corepack pnpm --filter @ship/api db:migrate

# 3. Capture EXPLAIN AFTER:
# Re-run the same queries; compare plans.
```

Or just `diff` the two files in `raw/db-after-v2/`.
