-- Migration 038: Functional indexes on hot JSONB-key filters.
--
-- The ShipShape audit's Category 4 identified that two query patterns scan
-- the documents table sequentially and filter in code, with no functional
-- index to support the predicate:
--
--   1. /api/issues + /api/dashboard/my-work issues query:
--        WHERE (properties->>'assignee_id')::uuid = $user
--          AND properties->>'state' NOT IN ('done', 'cancelled')
--
--   2. /api/dashboard/my-work projects query:
--        WHERE (properties->>'owner_id')::uuid = $user
--
-- At the seed audit volume (517 docs / 304 issues) both queries run in
-- 1-2 ms via Seq Scan because the table fits in memory. At 10×-100× that
-- volume the seq scan dominates query time linearly. These indexes turn
-- the predicate into an Index Scan / Bitmap Index Scan, which scales
-- sublinearly with row count.
--
-- WHY these specific predicate shapes:
--   - The schema has an existing `idx_documents_person_user_id` on
--     ((properties->>'user_id')) WHERE document_type = 'person'. That's
--     the same pattern: B-tree on a JSONB-extracted text value, scoped
--     by document_type via partial index. We're applying the same shape
--     to the two other JSONB keys most filtered in route handlers.
--
--   - The indexes are PARTIAL (filtered by document_type and
--     deleted_at IS NULL) so they only cover the rows the queries
--     actually scan. That keeps each index small and write costs low.
--
-- WHY this is safe to ship:
--   - CREATE INDEX (non-concurrent) takes an ACCESS EXCLUSIVE lock on
--     the table for the duration. At 517 rows that's milliseconds.
--     At 100k+ rows the team would want CREATE INDEX CONCURRENTLY in
--     a separate migration so writes aren't blocked.
--
--   - The audit captured EXPLAIN ANALYZE before/after to confirm the
--     planner actually picks the new indexes. See
--     shipshape/improvements/raw/db-after-v2/explain-{before,after}-indexes.txt

-- 1. Issues by assignee — supports /api/issues and /api/dashboard/my-work
CREATE INDEX IF NOT EXISTS idx_documents_issue_assignee
  ON documents ((properties->>'assignee_id'))
  WHERE document_type = 'issue'
    AND archived_at IS NULL
    AND deleted_at IS NULL;

-- 2. Issues by state — supports /my-work's NOT IN ('done', 'cancelled')
--    filter and any list endpoint that filters by state.
CREATE INDEX IF NOT EXISTS idx_documents_issue_state
  ON documents ((properties->>'state'))
  WHERE document_type = 'issue'
    AND archived_at IS NULL
    AND deleted_at IS NULL;

-- 3. Projects by owner — supports /api/dashboard/my-work's owner_id filter.
CREATE INDEX IF NOT EXISTS idx_documents_project_owner
  ON documents ((properties->>'owner_id'))
  WHERE document_type = 'project'
    AND archived_at IS NULL;
