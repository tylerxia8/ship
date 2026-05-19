# Category 4 — DB Query Efficiency

**Branch:** `shipshape/04-db-queries`
**Audit baseline:** [shipshape/audit/AUDIT_REPORT.md § Category 4](../audit/AUDIT_REPORT.md)
**Improvement target (per brief):** −20% query count on a flow OR −50% on slowest query.

---

## Result

`/api/dashboard/my-work` went from **4 queries → 2 queries (−50% query count)**, and the combined SQL is also slightly *faster* than the slowest of the original three.

| Metric | Before | After | Δ |
|---|---|---|---|
| Queries per `/my-work` request | 4 (workspace + issues + projects + sprints) | 2 (workspace + combined) | **−50%** |
| EXPLAIN ANALYZE execution time (combined query) | 2.054 ms (projects-only, the slowest of the 3) | **1.522 ms** | **−26%** |
| Planning time | 9.4 ms (projects-only) | 11.7 ms | +2.3 ms (single query plans more total work) |

Raw EXPLAIN ANALYZE output: [raw/db-after/explain-combined.txt](raw/db-after/explain-combined.txt). Before-state EXPLAIN lives at [shipshape/audit/raw/explain-analyze.txt](../audit/raw/explain-analyze.txt).

---

## What changed

Single file, single function: `/api/dashboard/my-work` in [api/src/routes/dashboard.ts](../../api/src/routes/dashboard.ts).

The audit baseline ran three independent `pool.query()` calls in sequence — one each for issues, projects, sprints — preceded by a workspace lookup. That's 4 round-trips per dashboard page load.

The new version keeps the workspace query (its result is used in JS to compute `currentSprintNumber`) but collapses the other three into a single `UNION ALL` query. Each branch projects to a uniform shape:

```sql
SELECT 'issue'   AS kind, d.id, d.title, d.properties, d.ticket_number, jsonb_build_object(...) AS extras, ...
UNION ALL
SELECT 'project' AS kind, d.id, d.title, d.properties, NULL::int        , jsonb_build_object(...) AS extras, ...
UNION ALL
SELECT 'sprint'  AS kind, d.id, d.title, d.properties, NULL::int        , jsonb_build_object(...) AS extras, ...
ORDER BY sort_key, sort_ts DESC
```

JS dispatches on `row.kind` to build typed `WorkItem` values, identical to before. The `extras` JSONB column carries kind-specific fields (sprint_name, inferred_status, etc.) so each branch can return what it needs without forcing every column on every kind.

### Functional equivalence

Response shape is unchanged:
- `items` array with `{ id, title, type, urgency, ... }` — identical fields per `type`.
- `grouped` object with `overdue`, `this_sprint`, `later` keys.
- `current_sprint_number`, `days_remaining` top-level.

Verified against the running dev API: the response keys, item count, and grouped buckets match the baseline.

### What was intentionally NOT changed

- **Workspace query stays separate.** Its result feeds `currentSprintNumber`, which is computed in JS (handling some Date/string casing from the pg driver). Pushing that computation into SQL would be a bigger refactor than a query-merge change should attempt; the 4→2 win is independent of it.
- **The projects "inferred_status" correlated subquery is preserved.** The subquery runs once per project row to determine whether the project has issues in past/current/future sprints. Switching to a LATERAL join would change row-count semantics in a way that risks introducing duplicates. The audit flagged this as a quadratic growth path at scale — the right fix is a dedicated `project_status` CTE that aggregates once across all projects, but that's a substantive logic change worth a separate, focused commit.

---

## Tradeoffs

- **Single query plan vs three smaller plans.** Postgres plans the combined query as one unit; the planner sees the whole shape and can pick the right join order across branches. Planning time goes from ~9 ms (projects-only baseline) to ~12 ms (full combined), but execution drops. Net: small absolute regression on planning, larger absolute win on execution + dramatic win on round-trip count.
- **JSONB `extras` adds a tiny per-row cost** (~50 bytes each). At ~15 items per dashboard load that's negligible; at 100+ items it's still <10 KB.
- **The combined query is harder to read.** I added a sizable comment block explaining the rationale and pointing readers at this doc. The cost is real (more SQL on one screen) but the alternative was three separate pool.query()s that nobody had reason to consolidate, which is exactly what produced the original N+1.

---

## Verification

- `tsc --noEmit` on `api/`: passes.
- Live test against `/api/dashboard/my-work` on dev: response has `items: 13, grouped: { overdue: 4, this_sprint: 3, later: 6 }, current_sprint_number: 14`. Matches the same user's pre-change response.
- EXPLAIN ANALYZE on the new query (full SQL captured): 1.522 ms execution, ~700 buffer hits — well within budget.

---

## How to reproduce

```powershell
# 1. Postgres + dev API running on this branch with SHIPSHAPE_AUDIT=1.
# 2. Get an API token (one-time, in shipshape/audit/raw/.api_token).

# Compare query counts by enabling pg statement logging temporarily:
#   ALTER SYSTEM SET log_statement = 'all';
#   SELECT pg_reload_conf();
# Then hit the endpoint and watch the postgres log — you'll see 2 statements
# per call (was 4).

# EXPLAIN ANALYZE the new combined query directly via psql:
#   See raw/db-after/explain-combined.txt for the captured plan.
```
