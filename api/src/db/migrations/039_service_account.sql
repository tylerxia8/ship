-- Migration 039: Service-account flag for users (FleetGraph agent + future bots).
--
-- The Week 5 FleetGraph agent (see FLEETGRAPH.md at repo root) needs to read
-- Ship's document graph and post notifications without going through the
-- normal user-session flow. Ship already supports long-lived auth via the
-- api_tokens table + Bearer-token middleware (api/src/middleware/auth.ts).
-- The agent reuses that — service accounts are just users with a flag.
--
-- Why the flag at all (when api_tokens already gives us bot auth):
--   1. Audit log distinction — bot actions tagged differently from human
--   2. UI filters — Resource view + person documents exclude service accounts
--   3. Future enforcement — block service accounts from interactive endpoints
--      (login, password reset) at the middleware layer
--
-- Schema-only change. No backfill (default FALSE = human). The agent user
-- itself is seeded by api/scripts/create-service-account.ts, which creates
-- the row AND issues an api_tokens entry for it.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_service_account BOOLEAN NOT NULL DEFAULT FALSE;

-- Service accounts shouldn't have passwords. Guard the invariant.
ALTER TABLE users
  ADD CONSTRAINT users_service_account_no_password
  CHECK (
    is_service_account = FALSE
    OR password_hash IS NULL
  );

COMMIT;
