# Plugforge Submission Checklist

Use this as the quick evidence map for the Week 6 Plugforge submission.

## Required Evidence

- Architecture defense: `docs/architecture.md`
- Pre-search and risk discovery: `PRESEARCH.md`
- Public OpenAPI contract: `docs/openapi.json`
- Developer Portal: `/settings/developers`
- Public API implementation: `api/src/platform/`
- SDK: `sdk/`
- Developer examples: `examples/plugforge/`
- CLI reference integration: `integrations/cli/src/index.mjs` (`login`, `scopes`, `docs ls/get/create`, `webhooks`)
- TTFE drill: `scripts/plugforge-ttfe-drill.mjs`
- Demo walkthrough: `PLUGFORGE_DEMO_GUIDE.md`
- Copyable API examples: `PLUGFORGE_API_EXAMPLES.md`
- Early submission entry point: `PLUGFORGE_EARLY_SUBMISSION.md`
- Final submission entry point: `PLUGFORGE_FINAL_SUBMISSION.md`
- Submission requirements map: `PLUGFORGE_SUBMISSION_REQUIREMENTS.md`
- Per-epic write-up: `PLUGFORGE_PER_EPIC_WRITEUP.md`
- Three discoveries: `PLUGFORGE_DISCOVERIES.md`
- Interview preparation: `PLUGFORGE_INTERVIEW_PREP.md`
- Social post draft and screenshot plan: `PLUGFORGE_SOCIAL_POST.md`
- Security controls summary: `PLUGFORGE_SECURITY.md`
- Operational readiness: `PLUGFORGE_OPERATIONAL_READINESS.md`
- Live proof IDs and screenshots: `PLUGFORGE_LIVE_PROOF.md`
- Reviewer hub: `PLUGFORGE_README.md`
- Live deployment smoke script: `scripts/plugforge-live-smoke.mjs`
- Final submission verification script: `scripts/plugforge-final-check.mjs`
- Reviewer evidence bundle: `PLUGFORGE_EVIDENCE_PACK.md`
- Evidence bundle generator: `scripts/plugforge-evidence-pack.mjs`
- Demo/social screenshots: `docs/screenshots/plugforge/`
- Screenshot generator: `scripts/plugforge-screenshots.mjs`

## Live MVP Deployment

- Public app: `https://d2rr1fze9v095b.cloudfront.net`
- Public OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Public scopes registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Public webhook event registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`
- API health through CloudFront: `https://d2rr1fze9v095b.cloudfront.net/health`
- Elastic Beanstalk version verified: `v20260602113723`
- Production read-only OAuth app created: `Plugforge MVP Read-Only Grader App`
- Production read-only OAuth `client_id`: `ship_app_8d138f5f898a7dd8bd9ae88e1d6f18c5`
- Production read-only scopes: `documents:read`
- Production full demo OAuth app: `Plugforge MVP Grader App`
- Production full demo OAuth `client_id`: `ship_app_d8200057ae8afcd914151e0738af09f3`
- Production full demo scopes: `documents:read`, `documents:write`, `webhooks:manage`
- Production webhook registry currently exposes the deployed `document.created`
  event. This branch expands the registry to all required events and should be
  deployed before external grading.

## Live MVP Proof

- Device Authorization Grant approved with user code `AZK5-FXJZ`.
- Public API document create proof: `4689f19c-24bf-4b75-8999-133d4debc762`
- Webhook trigger document: `501394e7-90e6-45dc-bfef-5b4b4b4e4d62`
- Webhook subscription: `2ed4b869-718c-49e1-9dcb-a4eb8e2ee210`
- Webhook delivery: `1dfdb680-d30b-4e02-92d5-6c2e2c5bee04`
- Delivery result: `document.created`, attempt `1`, status `delivered`, response `200`, latency `43ms`

Latest authenticated TTFE proof:

- Device Authorization Grant approved with user code `YNDK-AP95`.
- Public API document create proof: `436f86e1-07e1-4e4e-adff-e958f23200c9`
- Webhook subscription: `542901f6-4a4f-45cf-92cc-04cd3cbf73e7`
- Webhook delivery: `52d11acd-1c1c-44df-92b6-889f2829408c`
- Delivery result: `document.created`, status `delivered`, response `204`, elapsed `2916ms`
- HMAC signature verification: `true`

## Verification Commands

```bash
corepack.cmd pnpm --filter @ship/api plugforge:fitness
corepack.cmd pnpm plugforge:live-smoke
corepack.cmd pnpm plugforge:evidence-pack -- --include-final-check
corepack.cmd pnpm plugforge:screenshots
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm exec playwright test e2e/plugforge-oauth.spec.ts --workers=1
corepack.cmd pnpm --recursive run type-check
corepack.cmd pnpm --recursive run build
node integrations/cli/src/index.mjs --help
```

## MVP Hard Gate Status

| Requirement | Status / evidence |
|---|---|
| OAuth app registration endpoint | Pass: `api/src/platform/routes/apps.ts`; production read-only app `ship_app_8d138f5f898a7dd8bd9ae88e1d6f18c5`; raw secret omitted from docs because it is shown once. |
| Authorization Code + PKCE via Playwright | Pass: `e2e/plugforge-oauth.spec.ts`; command above passed on 2026-06-02. |
| Bearer middleware on `/api/v1/*` | Pass: `api/src/platform/auth.ts`; platform tests assert missing, invalid, and expired token behavior. |
| Documents list/get/create with scopes | Pass: `api/src/platform/routes/documents.ts`; `requireScope` coverage in platform tests. |
| Public `ApiError` shape | Pass: `api/src/platform/errors.ts`; `api/src/platform/fitness.test.ts`. |
| ScopeRegistry and explicit missing-scope error | Pass: `api/src/platform/scopes.ts`; platform missing-scope tests name the required scope. |
| Cursor pagination | Pass: `api/src/platform/pagination.ts`; document list cursors use stable `created_at, id` ordering and platform tests mutate `updated_at` between page requests. |
| OpenAPI 3.1 live and generated | Pass: live `/api/v1/openapi.json`, static `docs/openapi.json`, `plugforge:openapi`, route metadata generation, and OpenAPI 3.1 schema validation in fitness tests. |
| SDK workspace package | Pass: `sdk/src/client.ts`, `sdk/README.md`, `examples/plugforge/`; SDK parity tests cover `.me()` and public resources. |
| Typed SDK resource clients | Pass: `client.documents`, `client.issues`, `client.sprints`, and `client.webhooks` are exposed by `sdk/src/client.ts`; issues/sprints are typed document facades in `sdk/src/document-resources.ts`. |
| SDK OAuth helpers and token stores | Pass: `ShipClient.authorizationCodeFlow()`, `ShipClient.deviceLogin()`, `ITokenStore`, `InMemoryTokenStore`, `FileTokenStore`, and `BrowserLocalStorageTokenStore` are implemented under `sdk/src/`. |
| SDK pagination, webhook verifier, typed errors | Pass: async iterator pagination hides cursors; `verifyWebhook()` checks timestamped HMAC signatures; `ShipSDKErrorUnion` supports exhaustive `kind` switching. |
| Per-app/per-token rate limiting | Pass: `api/src/platform/ratelimit.ts`; platform tests assert token isolation, shared app bucket enforcement, `X-RateLimit-*`, and `Retry-After`; generated OpenAPI declares those headers. |
| Public audit trail | Pass: `api/src/platform/audit.ts`; `/api/v1/oauth/apps/{id}/audit`; Developer Portal API Activity table. |
| Developer Portal controls | Pass: `web/src/pages/DeveloperPortal.tsx` lists/registers apps, shows/rotates one-time secrets, manages subscriptions, browses deliveries, replays deliveries, and shows public API audit rows. |
| Webhook event registry and schemas | Pass in branch: `api/src/platform/events.ts` registers `document.created`, `document.updated`, `document.deleted`, `issue.created`, `issue.assigned`, `issue.status_changed`, `sprint.started`, and `sprint.completed` with Zod schemas. |
| Event bus and domain publication | Pass in branch: `IEventBus` and in-process implementation live in `api/src/platform/events.ts`; document writes publish from `api/src/platform/domain/documents.ts`; fitness blocks route-layer webhook publication. |
| Webhook signing, retries, DLQ, replay | Pass: `api/src/platform/webhooks.ts`; tests assert `Ship-Signature`, `Idempotency-Key`, first retry near 1s, 4xx dead-lettering, delivery listing, replay, rotation, and deactivation. |
| Regression and performance guardrails | Partial in this session: focused Playwright PKCE, `plugforge:final-check`, `plugforge:fitness`, type-check, and build passed. Full 600+ Playwright suite should be run via the repo E2E runner workflow, not directly. |
| Deployed public app and grader app | Pass for current deployed MVP: CloudFront URLs above plus read-only grader app. Expanded webhook registry changes are branch-ready and need deployment before graders inspect all eight events live. |

## Demo Flow

1. Open Ship at `/settings/developers`.
2. Create an OAuth app and show the client secret once.
3. Open `/api/v1/openapi.json` and `docs/openapi.json`.
4. Run `ship scopes` to show the public permission catalog.
5. Run device login with the CLI.
6. Create a document through the CLI/public API.
7. Show the signed `document.created` webhook delivery log.
8. Show webhook retry/replay evidence from the fitness suite.
9. Show lifecycle controls: rotate/deactivate OAuth apps and webhook subscriptions.

## Current Fitness Coverage

The Plugforge fitness command covers:

- Public OpenAPI contract serving and static artifact freshness.
- Public/internal route boundary.
- Workspace admin enforcement for OAuth app management.
- OAuth app registration, secret rotation, and deactivation.
- Authorization Code + PKCE happy path and wrong-verifier failure.
- Device Authorization Grant pending, slow-down, approve, consume, and replay paths.
- Refresh token rotation and replay-triggered token family revocation.
- Public scope registry.
- Public webhook event registry with eight event definitions as data.
- Document list, read-by-id, private-document non-disclosure, cursor pagination, and invalid-cursor errors.
- Scope enforcement and missing-scope error details.
- Rate-limit isolation by bearer token, shared app-bucket enforcement, `X-RateLimit-*`, `Retry-After`, and audit evidence for 429 responses.
- Domain event bus boundary for webhook publication.
- Signed `document.created` webhooks with Stripe-style timestamped HMAC headers.
- Webhook retry schedule, timeout retry behavior, permanent 4xx dead lettering, delivery listing, replay, signing-secret rotation, and deactivation.
- Developer Portal audit viewing, webhook delivery viewing, failed-delivery replay, and test-event sending.
- Developer Portal onboarding checklist, copyable curl examples, accessible app controls, and delivery detail drawer.
- Public API audit evidence for `/api/v1/documents`.
- SDK/OpenAPI parity for documents, scopes, webhook event discovery, and webhook lifecycle routes.
