-- Migration 040: Durable FleetGraph findings.
--
-- Proactive FleetGraph runs need a concrete Ship-side artifact, not only
-- LangSmith traces or agent logs. Findings are notification-shaped records
-- scoped to a workspace/document and deduped by finding_hash.

BEGIN;

CREATE TABLE IF NOT EXISTS fleetgraph_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  finding_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'snoozed', 'resolved')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, scope_id, finding_hash)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_workspace_status
  ON fleetgraph_findings (workspace_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_scope
  ON fleetgraph_findings (scope_id, last_seen_at DESC);

COMMIT;
