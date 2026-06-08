# Plugforge Final Submission

This is the reviewer entry point for the Week 6 final submission.

## Live App

- App: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Scopes: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Webhook events: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`
- Health: `https://d2rr1fze9v095b.cloudfront.net/health`

## Reviewer Account

```text
Email: tyler+plugforge-demo@ship.local
Password: ak>*9DL&YvlW5SkV:DB3:D$A
```

## Production OAuth App

Read-only grader app:

```text
Name: Plugforge MVP Read-Only Grader App
Client ID: ship_app_8d138f5f898a7dd8bd9ae88e1d6f18c5
Scopes: documents:read
Redirect URI: https://example.com/callback
Created: 2026-06-02T23:11:09Z
```

Full demo app used for webhook/write proof:

```text
Name: Plugforge MVP Grader App
Client ID: ship_app_d8200057ae8afcd914151e0738af09f3
Scopes: documents:read, documents:write, webhooks:manage
Redirect URI: https://example.com/callback
```

The raw client secret is shown once on creation or rotation and is not committed.
If a grader needs a fresh secret, use the Developer Portal to rotate or create a
new app.

## What To Review

| Rubric area | Evidence |
|---|---|
| Architecture and pre-search | `PRESEARCH.md` including appendix checklist, `docs/architecture.md` |
| Pre-search conversation reference | `PRESEARCH_CONVERSATION_REFERENCE.md` |
| Public API contract | Live `/api/v1/openapi.json`, static `docs/openapi.json` |
| OAuth app lifecycle | `/settings/developers`, `api/src/platform/routes/apps.ts` |
| Auth flows | `api/src/platform/routes/oauth.ts`, `api/src/platform/platform.test.ts` |
| Scoped public API | `api/src/platform/api-v1.ts`, `api/src/platform/routes/documents.ts` |
| SDK | `sdk/src/`, `sdk/README.md` |
| SDK resource clients and OAuth helpers | `sdk/src/client.ts`, `sdk/src/document-resources.ts`, `sdk/src/auth.ts`, `sdk/src/token-store.ts` |
| Runnable developer examples | `examples/plugforge/` |
| CLI reference integration | `integrations/cli/src/index.mjs` |
| Rate limiting and public audit trail | `api/src/platform/ratelimit.ts`, `api/src/platform/audit.ts`, Developer Portal audit table |
| Webhook event registry and domain bus | `api/src/platform/events.ts`, `api/src/platform/domain/documents.ts` |
| Signed webhooks | `api/src/platform/webhooks.ts`, `sdk/src/webhook-client.ts` |
| Delivery observability and replay | `/api/v1/webhooks/deliveries`, Developer Portal, fitness tests |
| Live smoke and final verification | `scripts/plugforge-live-smoke.mjs`, `scripts/plugforge-final-check.mjs` |
| Reviewer evidence bundle | `PLUGFORGE_EVIDENCE_PACK.md`, `scripts/plugforge-evidence-pack.mjs` |
| Submission requirements map | `PLUGFORGE_SUBMISSION_REQUIREMENTS.md` |
| Per-epic write-up | `PLUGFORGE_PER_EPIC_WRITEUP.md` |
| Three discoveries | `PLUGFORGE_DISCOVERIES.md` |
| Interview preparation | `PLUGFORGE_INTERVIEW_PREP.md` |
| Demo/social screenshots | `docs/screenshots/plugforge/`, `scripts/plugforge-screenshots.mjs` |
| Security controls | `PLUGFORGE_SECURITY.md` |
| Operational readiness | `PLUGFORGE_OPERATIONAL_READINESS.md` |
| AI cost analysis | `PLUGFORGE_AI_COST_ANALYSIS.md` |
| Live proof IDs and screenshots | `PLUGFORGE_LIVE_PROOF.md` |
| Performance targets | `PLUGFORGE_PERFORMANCE_TARGETS.md` |
| Part 1 performance comparison | `PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md` |
| Grader quickstart | `PLUGFORGE_GRADER_QUICKSTART.md` |
| Reviewer hub | `PLUGFORGE_README.md` |

## MVP Hard Gate Map

| Requirement | Evidence |
|---|---|
| OAuth app registration with one-time raw secret and hashed database secret | `api/src/platform/routes/apps.ts`; fitness suite covers creation and rotation; production read-only app above proves live registration. |
| Authorization Code + PKCE via Playwright | `e2e/plugforge-oauth.spec.ts`; passed with `corepack.cmd pnpm exec playwright test e2e/plugforge-oauth.spec.ts --workers=1`. |
| Bearer token validation on `/api/v1/*` with distinct expired-token code | `api/src/platform/auth.ts`; covered by `api/src/platform/platform.test.ts`. |
| Documents GET list, GET by id, and POST with `require(scope)` | `api/src/platform/routes/documents.ts`; covered by `api/src/platform/platform.test.ts` and SDK parity checks. |
| Consistent `ApiError` shape on public failures | `api/src/platform/errors.ts`; `api/src/platform/fitness.test.ts` asserts the shape over public routes. |
| ScopeRegistry scopes-as-data and explicit missing scope in 403 body | `api/src/platform/scopes.ts`; missing-scope assertions in `api/src/platform/platform.test.ts`. |
| Cursor pagination | `api/src/platform/pagination.ts`, `api/src/platform/routes/documents.ts`; cursors encode `{ id, timestamp }`, list responses return `{ data, next_cursor }`, and platform tests assert cursor stability after `updated_at` reordering. |
| OpenAPI 3.1 served at `/api/v1/openapi.json`, generated from route metadata, schema-validated | `api/src/platform/openapi.ts`; `publicRouteMetadata` feeds `generatePublicOpenApiDocument()`, `corepack.cmd pnpm --filter @ship/api plugforge:openapi`, and fitness validates against the OpenAPI 3.1 schema. |
| SDK workspace package with `new ShipClient({ token }).me()` | `sdk/src/client.ts`, `sdk/README.md`, `examples/plugforge/`; SDK parity covered by `api/src/platform/platform.test.ts`. |
| SDK package proof | `corepack.cmd pnpm plugforge:sdk-pack` builds and packs `@ship/sdk` into `.tmp/ship-sdk-0.0.0.tgz`, proving the workspace package resolves as an installable artifact. |
| Typed SDK surface, OAuth helpers, token stores, iterator pagination, verifier, typed errors | `ShipClient` exposes `documents`, `issues`, `sprints`, and `webhooks`; `authorizationCodeFlow()`, `deviceLogin()`, `ITokenStore`, in-memory/file/browser stores, async iterators, `verifyWebhook()`, and `ShipSDKErrorUnion` are implemented under `sdk/src/` and checked by fitness/type-check. |
| Per-app and per-token rate limits with public headers | `api/src/platform/ratelimit.ts`; platform tests assert token isolation, shared app bucket enforcement, `X-RateLimit-*`, and `Retry-After`; generated OpenAPI declares the headers. |
| Public audit trail queryable in Developer Portal | `api/src/platform/audit.ts` records timestamp, client ID, user, route, scope, status, and latency; `/api/v1/oauth/apps/{id}/audit` and `web/src/pages/DeveloperPortal.tsx` expose it. |
| Developer Portal app/webhook management | `web/src/pages/DeveloperPortal.tsx` lists/registers apps, shows/rotates one-time secrets, manages subscriptions, browses deliveries, opens delivery details, and sends/replays delivery workflows through public platform endpoints including `/api/v1/oauth/apps/{id}/webhook-deliveries/{deliveryId}/replay`. |
| Webhook event registry, domain event bus, signing, retries, DLQ, replay | `api/src/platform/events.ts` defines event types and Zod schemas as data; domain writes publish through `IEventBus`; `api/src/platform/webhooks.ts` signs with `Ship-Signature`, retries 5xx/timeouts on `1s, 4s, 16s, 1m, 5m, 30m`, dead-letters 4xx/permanent failures, and preserves `Idempotency-Key` on replay. |
| Existing regression/perf guardrails | Focused Playwright PKCE passed; `plugforge:final-check`, `plugforge:fitness`, type-check, build, and the 20-run `plugforge:flake` drill passed. Full 600+ Playwright regression was attempted through the progress reporter but blocked by this workstation's unhealthy Docker/Testcontainers runtime; use the repo E2E runner workflow on a healthy Docker host for the complete mainline gate. |
| Deployed and publicly accessible with OpenAPI and read-only grader app | Live URLs above; read-only app `ship_app_8d138f5f898a7dd8bd9ae88e1d6f18c5`. Production is on Elastic Beanstalk version `v20260603152032`; the live webhook registry exposes all eight required event definitions. |
| Agent-as-citizen audit proof | `agent/src/ship-client.ts` now prefers OAuth Client Credentials (`SHIP_AGENT_CLIENT_ID` + `SHIP_AGENT_CLIENT_SECRET`) to mint its own scoped token, then reads documents through `@ship/sdk` and `/api/v1`; `SHIP_PUBLIC_API_TOKEN` remains a fallback. `scripts/plugforge-agent-audit-proof.mjs` reports `auth_mode` and verifies public audit rows. |

## Performance Target Map

`PLUGFORGE_PERFORMANCE_TARGETS.md` maps each target to its automated gate.
`PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md` commits the measured Part 1 baseline
comparison: API P95/P99 summaries, bundle-size baseline/current, query-count
baseline/current, and PlugForge-specific perf measurements.

## AI Cost Analysis

`PLUGFORGE_AI_COST_ANALYSIS.md` documents the cost boundary and measured
development numbers: 50,296 input tokens, 14,886 output tokens, calculated
development/test spend of `$0.336628`, and a measured 0% token-volume delta for
the public-API agent rewire assumption. Plugforge platform traffic still does
zero AI work; LLM cost remains isolated to FleetGraph agent turns.

## Live Proof Captured

- Device Authorization Grant approved with user code `AZK5-FXJZ`.
- Public API document create proof: `4689f19c-24bf-4b75-8999-133d4debc762`.
- Webhook trigger document: `501394e7-90e6-45dc-bfef-5b4b4b4e4d62`.
- Webhook subscription: `2ed4b869-718c-49e1-9dcb-a4eb8e2ee210`.
- Webhook delivery: `1dfdb680-d30b-4e02-92d5-6c2e2c5bee04`.
- Delivery result: `document.created`, attempt `1`, status `delivered`, response `200`, latency `43ms`.

Latest authenticated TTFE proof, captured `2026-06-02T22:54Z`:

- Device Authorization Grant approved with user code `YNDK-AP95`.
- Receiver: `webhook.site`.
- Public API document create proof: `436f86e1-07e1-4e4e-adff-e958f23200c9`.
- Webhook subscription: `542901f6-4a4f-45cf-92cc-04cd3cbf73e7`.
- Webhook delivery: `52d11acd-1c1c-44df-92b6-889f2829408c`.
- Delivery result: `document.created`, status `delivered`, response `204`, elapsed `2916ms`.
- HMAC signature verification: `true`.
- Temporary subscription deactivated after proof capture.

Latest agent-as-citizen audit proof, captured `2026-06-03T22:05Z`:

- Proof command: `corepack.cmd pnpm plugforge:agent-audit-proof`.
- OAuth app/client: `ship_app_d8200057ae8afcd914151e0738af09f3`.
- Public call: `GET /api/v1/documents`, status `200`.
- Audit row: route `/api/v1/documents/`, scope `documents:read`, status `200`,
  latency `5ms`, created `2026-06-03T22:05:34.272Z`.

Final feedback hardening on 2026-06-08 updated the proof path so
`plugforge:agent-audit-proof` prefers OAuth Client Credentials and reports
`auth_mode: "client_credentials"` when `SHIP_AGENT_CLIENT_ID` and
`SHIP_AGENT_CLIENT_SECRET` are supplied. Pre-minted `SHIP_PUBLIC_API_TOKEN`
remains only a fallback for already-captured demo evidence.

## SDK Packaging Note

`@ship/sdk` is implemented as a workspace package for the assignment. The
production packaging step is publishing this same package to npm. Until then, the
clean-machine equivalent is:

```powershell
git clone https://github.com/tylerxia8/ship.git
cd ship
git checkout plugforge/main
corepack.cmd pnpm install
corepack.cmd pnpm --filter @ship/sdk build
corepack.cmd pnpm plugforge:sdk-pack
```

## Repeatable Verification

Run the final check from the repository root:

```powershell
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm plugforge:doctor
corepack.cmd pnpm plugforge:agent-audit-proof
```

The final check runs:

- Live deployment smoke check.
- Live CLI scope discovery.
- Live CLI webhook event discovery.
- CLI help output.
- Plugforge API fitness suite.

Generate a reviewer-friendly evidence bundle:

```powershell
corepack.cmd pnpm plugforge:evidence-pack -- --include-final-check
```

Capture demo and social screenshots:

```powershell
corepack.cmd pnpm plugforge:screenshots
```

Optional deeper checks:

```powershell
corepack.cmd pnpm --filter @ship/api plugforge:openapi
corepack.cmd pnpm --filter @ship/api plugforge:fitness
corepack.cmd pnpm --recursive run type-check
corepack.cmd pnpm --recursive run build
```

Authenticated TTFE drill:

```powershell
$env:SHIP_URL = "https://d2rr1fze9v095b.cloudfront.net"
$env:SHIP_TOKEN = "ship_at_..."
corepack.cmd pnpm drill ttfe
```

For live production, the TTFE receiver must be publicly reachable. The captured
proof above used an ephemeral Webhook.site URL, then verified Ship's
`Ship-Signature` header against the returned subscription signing secret.

## Demo Video Path

Use `PLUGFORGE_FINAL_DEMO_SCRIPT.md` as the spoken runbook and
`docs/plugforge-final-demo.html` as the local recording dashboard.

1. Open the Developer Portal and show the production OAuth app.
2. Expand the app row and show app permissions, API activity, webhook
   subscriptions, delivery logs, and test-event controls.
3. Show the live OpenAPI, scope registry, and webhook event registry.
4. Run `corepack.cmd pnpm plugforge:final-check`.
5. Run or describe the CLI Device Authorization Grant.
6. Create a document through the public API or CLI.
7. Show the signed webhook delivery log and the delivery proof ID.
8. Close with the architecture defense: public/internal boundary, scoped OAuth,
   generated OpenAPI, hand-written parity-tested SDK, and webhook observability.

## Final Notes

- Submission thesis: a small public API that matches its spec beats a sprawling
  public API that contradicts it; one excellent reference integration beats
  three half-finished ones; an agent that goes through the front door beats an
  agent with a privileged shortcut.
- Depth over breadth. Proof over promises. The TTFE drill is the rubric.
- The public platform uses `/api/v1/*`; first-party Ship UI routes remain under
  `/api/*`.
- Public API responses include request IDs and rate-limit headers.
- Rate limiting is enforced by both OAuth app and access token buckets. Public
  responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
  `X-RateLimit-Reset`; 429 responses include `Retry-After`.
- Access tokens are scoped and short-lived; refresh tokens rotate.
- Webhook signatures are HMAC-SHA256 and verified by the SDK helper.
- Delivery is at-least-once. Subscribers dedupe with idempotency keys.
- Webhook event types are registered as data with Zod schemas:
  `document.created`, `document.updated`, `document.deleted`, `issue.created`,
  `issue.assigned`, `issue.status_changed`, `sprint.started`, and
  `sprint.completed`.
- Production webhook registry exposes all eight required event types on Elastic
  Beanstalk version `v20260603152032`.
- Operational tradeoffs and next steps are documented in
  `PLUGFORGE_OPERATIONAL_READINESS.md`.
