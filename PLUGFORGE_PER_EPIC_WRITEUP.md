# Plugforge Per-Epic Write-Up

## Epic 1: OAuth Foundation

**Before.** Ship had first-party session auth and internal API routes, but no
external OAuth app model, scoped access token, PKCE flow, device flow, or refresh
token rotation.

**Fix.** Added OAuth app registration, hashed `client_secret`, one-time raw
secret display, Authorization Code + PKCE, Device Authorization Grant, scoped
bearer tokens, and one-time-use refresh token rotation.

**After.** External apps can authenticate through browser or CLI-safe flows and
call `/api/v1/*` with scoped bearer tokens.

**Proof.** `api/src/platform/platform.test.ts`,
`e2e/plugforge-oauth.spec.ts`, and `sdk/src/auth.ts`.

## Epic 2: Public API Contract

**Before.** Ship's API surface was optimized for first-party UI behavior under
`/api/*`; external developers did not have a stable public contract.

**Fix.** Added a dedicated `/api/v1` router, bearer middleware, scope
middleware, consistent `ApiError`, cursor pagination, public audit logging, and
documents/issues/sprints resources over the unified document model.

**After.** Public routes are versioned, scoped, auditable, paginated, and
separate from internal session-auth routes.

**Proof.** `api/src/platform/api-v1.ts`, `api/src/platform/errors.ts`,
`api/src/platform/routes/documents.ts`, and `api/src/platform/fitness.test.ts`.

## Epic 3: Generated OpenAPI And SDK

**Before.** A public API without generated OpenAPI and SDK parity would drift
quickly from implementation.

**Fix.** Added Zod-backed route metadata, OpenAPI 3.1 generation, static
`docs/openapi.json`, OpenAPI schema validation, a hand-written TypeScript SDK,
and route/spec/SDK parity fitness checks.

**After.** The live spec, static spec, server metadata, and SDK client methods
are checked together.

**Proof.** `api/src/platform/openapi.ts`, `api/src/platform/export-openapi.ts`,
`docs/openapi.json`, `sdk/src/`, and `api/src/platform/fitness.test.ts`.

## Epic 4: Signed Webhooks

**Before.** Ship writes did not provide an external event loop with signatures,
delivery logs, retries, dead letters, or replay.

**Fix.** Added event registry, `IEventBus`, domain publication, webhook
subscriptions, HMAC-SHA256 `Ship-Signature`, idempotency keys, delivery logs,
retry scheduling, DLQ, and replay.

**After.** A document write can produce a signed `document.created` delivery
that developers can verify and operators can replay.

**Proof.** `api/src/platform/events.ts`,
`api/src/platform/domain/documents.ts`, `api/src/platform/webhooks.ts`,
`api/src/platform/routes/webhooks.ts`, and `sdk/src/webhooks.ts`.

## Epic 5: Developer Portal And Operations

**Before.** OAuth apps, webhook subscriptions, delivery logs, and public audit
rows were not visible from a single operator/developer surface.

**Fix.** Added Developer Portal app listing/registration, secret rotation,
app deactivation, subscription management, delivery log browsing, replay, test
events, and API activity views.

**After.** Graders can inspect the platform lifecycle in the app instead of
trusting terminal-only proof.

**Proof.** `web/src/pages/DeveloperPortal.tsx`,
`PLUGFORGE_LIVE_PROOF.md`, and `PLUGFORGE_EVIDENCE_PACK.md`.

## Epic 6: CLI And Time-To-First-Event

**Before.** Developers could not prove the platform loop from a fresh terminal.

**Fix.** Added the Node CLI, device login, SDK-backed document creation,
webhook delivery tailing, TTFE drill harness, per-stage timing, SDK install
check, and signature verification negative cases.

**After.** The five-line story is executable: install SDK, login, create a doc,
tail webhooks, and verify the signed event.

**Proof.** `integrations/cli/src/index.mjs`,
`integrations/cli/tests/ttfe.drill.ts`, `scripts/drill.mjs`,
`scripts/plugforge-ttfe-drill.mjs`, and CI command
`corepack.cmd pnpm plugforge:flows`.

## Epic 7: Agent As Platform Citizen

**Before.** FleetGraph was architecturally able to use privileged/direct Ship
access patterns, which made it unlike an external developer app.

**Fix.** Added a public API read path behind `SHIP_PUBLIC_API_TOKEN` so the
agent can authenticate as an OAuth app, use `@ship/sdk`, and read documents
through `/api/v1` with scopes, rate limits, and audit rows. The legacy
service-account path remains for associations and finding writes until those
surfaces are promoted to the public API.

**After.** The access shape is the same as external integrations, while model
cost remains isolated to explicit agent turns.

**Proof.** `agent/src/ship-client.ts`, `agent/src/config.ts`, `agent/README.md`,
`docs/architecture.md#agent-as-citizen`, `PLUGFORGE_AI_COST_ANALYSIS.md`, and
the public audit trail exposed through `api/src/platform/audit.ts`. Final
production proof should be an audit-log row showing the FleetGraph app
`client_id`, route, scope, status, and latency after `SHIP_PUBLIC_API_TOKEN` is
set in the agent environment.
