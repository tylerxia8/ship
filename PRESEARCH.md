# PRESEARCH - Plugforge

Week 6 assignment: turn Ship into a developer-first platform with OAuth, a versioned public API, signed webhooks, a TypeScript SDK, a CLI reference integration, and a developer portal.

This document answers the PRD pre-search checklist and turns it into the working plan for implementation. It is intentionally scoped toward the smallest platform that can pass the rubric: a small public API that matches its contract beats a broad API that drifts.

## Phase 1: Define Constraints

### 1.1 Scale And Load Expectations

**Demo request rate.** The deployed demo is expected to see low interactive traffic: one grader, one pre-registered OAuth app, one CLI drill, and a small number of browser/API requests. Budget assumption: 5-10 API requests/second burst during demo, normally under 1 request/second.

**Webhook fanout.** MVP fanout is intentionally small. We will seed one grader app and one or two webhook subscriptions. A `document.created` event should produce 1-2 deliveries. The in-memory deliverer should stay under the PRD's `<2s` P95 first-attempt target at this demo fanout.

**Seeded apps and subscriptions.** Seed at least:

- One read-only grader OAuth app with `documents:read`.
- One CLI app with `documents:read`, `documents:write`, and `webhooks:manage`.
- One webhook subscription for `document.created`.

**Concurrent CLI sessions.** Demo expectation is one CLI session. Tests may run two sessions to prove device-flow polling and `slow_down` semantics. Device polling should enforce a per-device interval and return `slow_down` when the client polls too quickly.

**Delivery-log growth.** Demo volume is tiny: tens or hundreds of rows. Production projection assumes each webhook delivery attempt stores one row. Retention target: 30 days for delivery logs, 90 days for public API audit logs. This balances debugging usefulness with storage growth.

### 1.2 Budget And Cost Ceilings

**LLM budget.** The platform layer should make zero LLM calls. LLM spend only changes if FleetGraph is rewired to call the public API through the SDK. Week 6 budget target: keep agent-rewire test spend under the Week 5 baseline by confirming the same number of model calls per user turn.

**CI minutes.** The TTFE drill, OAuth Playwright test, OpenAPI validation, SDK parity test, and API unit tests will run in CI. Initial budget: keep the drill under 60 seconds and the full Week 6 CI set under 10 minutes. If CI time grows, run long browser/drill tests in a dedicated job while keeping unit tests fast.

**SDK install footprint.** Target production dependency footprint under 250 KB minified + gzipped. Keep SDK dependencies minimal: native `fetch`, `crypto`, and TypeScript types. Avoid heavy CLI dependencies inside `@ship/sdk`; CLI can have its own dependencies.

**Runaway webhook cost ceiling.** In-memory deliverer caps attempts at 6, uses the prescribed schedule, and moves to DLQ after final failure. Production queue adapters should also cap attempts and store delivery rows so failures cannot retry forever.

### 1.3 Timeline And Scope Reality

**Must-ship slices.**

1. OAuth app registration, Authorization Code + PKCE, and Device Authorization Grant.
2. `/api/v1` public API boundary with documents and `/me`.
3. Scope registry, bearer auth, consistent `ApiError`.
4. Generated OpenAPI 3.1.
5. SDK skeleton with `ShipClient`, `client.me()`, documents client, and webhook verifier.
6. Webhooks for `document.created`, delivery log, retry, DLQ, replay.
7. CLI: `ship login`, `ship docs ls/get/create`, `ship webhooks tail`.

**Should-ship slices.**

- Developer portal for apps, subscriptions, delivery log, and replay.
- Browser SDK demo for PKCE.
- FleetGraph agent-as-citizen rewire behind a feature flag.

**Kill criteria.**

- If OAuth takes longer than planned, reduce resource coverage to documents only but keep scope/error/OpenAPI rigor.
- If webhooks take longer than planned, ship `document.created` end-to-end with signing, delivery log, and replay before adding additional event types.
- If the portal is late, ship a read-only delivery-log portal plus app registration and keep CLI as the main integration proof.

### 1.4 Security And Data Sensitivity

**Client secrets.** Raw `client_secret` is shown exactly once on creation and rotation. Store only a salted hash using Node `crypto.scrypt` or `argon2` if already available. Never log raw secrets. Rotation invalidates the old secret immediately for MVP unless a dual-secret grace period is explicitly added later.

**Tokens.** Access tokens should be short-lived, around 15 minutes. Refresh tokens are one-time-use and rotate. Reusing a spent refresh token invalidates the token family to detect stolen-token replay.

**Webhook payload contents.** MVP payloads should include event metadata and document ID/title/type, not full rich-text content. Subscribers can fetch content using the public API if their app has the right scopes. This reduces accidental exposure while keeping integration useful.

**Developer portal secret display.** Secret display is shown-once, masked after leaving the page, never returned by list/get endpoints, and not included in screenshots by default. Browser back should not recover raw secret from server state.

### 1.5 Team Skill Inventory

**OAuth.** This is the riskiest slice. Implement minimal IETF-correct flows directly for learning: RFC 6749 Authorization Code, RFC 7636 PKCE, and RFC 8628 Device Authorization Grant. Keep the implementation small and heavily tested.

**Zod/OpenAPI.** Existing Ship already has an `api/src/openapi` area. Prefer adding route metadata and generated spec from Zod schemas over hand-written JSON. If generation breaks late, ship generated docs for the smaller documents API rather than expanding route count.

**SDK design.** Use a hand-written SDK with fitness tests against the spec. This gives better TypeScript ergonomics than pure generation while still preventing drift.

## Phase 2: Architecture Discovery

### 2.1 OAuth Flow Choices

**Refresh tokens from day one.** Implement refresh rotation early because retrofitting token families later changes the token table design and SDK token store contract.

**Scope upgrades.** MVP requires re-consent when requesting additional scopes. Incremental consent is a later enhancement.

**Consent screen location.** The consent screen lives in Ship's existing React app, routed from `/oauth/authorize`. It should use session auth for the logged-in user and apply clickjacking headers (`X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`).

**Device verification UX.** Device flow returns `user_code`, `device_code`, and `verification_uri`. CLI prints both the URL and code. Tests can approve the code via API/test helper or browser form.

### 2.2 Public API Shape

**Error shape.** Every `/api/v1` failure returns:

```ts
{
  code: "unauthorized" | "forbidden" | "not_found" | "validation_failed" | "rate_limited" | "server_error",
  message: string,
  details?: Record<string, unknown>,
  request_id: string
}
```

**Pagination.** Every public list endpoint returns:

```ts
{
  data: T[],
  next_cursor: string | null
}
```

Cursors are opaque base64url JSON over stable sort keys: `{ id, timestamp }`.

**Versioning.** Public routes live only under `/api/v1/*`. Breaking changes require `/api/v2`. Additive fields are allowed in v1.

**Small static lists.** `/api/v1/scopes` may return an unpaginated registry if implemented, but all resource lists must paginate. The fitness test should know which routes are resource lists via route metadata.

### 2.3 Webhook Reliability

**Signature.** Sign `timestamp + "." + rawBody` with HMAC-SHA256. Header:

```text
Ship-Signature: t=<unix-seconds>,v1=<hex-hmac>
```

The timestamp prevents replay. SDK verifier rejects timestamps older than 300 seconds by default.

**Retry schedule.** Use 1s, 4s, 16s, 1m, 5m, 30m with jitter. Unit tests should use deterministic clock injection or direct scheduler stepping rather than real sleeps.

**Permanent vs transient failures.** 2xx succeeds. 4xx is permanent and goes to DLQ. 5xx/timeouts retry. 429 should be treated as transient and honor `Retry-After` if present.

**Idempotency.** Every event has a stable idempotency key. Replays preserve the original key so subscribers can dedupe.

### 2.4 SDK Design

**Hand-written SDK, parity tested.** The SDK is hand-written for quality but checked against OpenAPI so every spec method has a corresponding typed method.

**Errors.** SDK throws a structured `ShipSDKError` with discriminated `kind`: `auth`, `rate_limit`, `not_found`, `validation`, `server`, `network`.

**Pagination.** SDK exposes both raw `list({ cursor })` and `iterate()` async iterator. Consumer code can ignore cursors for common cases.

**Token store.** `ITokenStore` persists access and refresh tokens. Implement memory and file stores for CLI. Browser localStorage store is optional for the browser demo.

### 2.5 Developer Portal And Self-Service

**Dogfood public API where reasonable.** The portal should use public API endpoints for app and webhook management where possible. It may still rely on the existing session for first-party UI auth.

**Secret rotation.** MVP immediately invalidates the old secret and shows the new secret once. A grace-period dual-secret model is v2.

**Delivery log scale.** Use server-side pagination, status filters, and event-type filters. Payload details are hidden behind click-to-reveal.

**Payload redaction.** Show event metadata by default. Full payload may be shown only behind a reveal control, and secrets should never be present.

### 2.6 Agent-As-Citizen Rewire

**OAuth flow.** For the first-party FleetGraph service, use a seeded OAuth app with a service-user grant. The PRD asks for first-party OAuth app behavior, not a privileged shortcut. If implementing pure client credentials is too much for the week, seed a refresh token for the service account and let the agent use the SDK token store.

**Seeded app.** Migration or deploy seed creates the FleetGraph OAuth app with a stable `client_id` and hashed secret stored in deployment secrets.

**Scopes.** Start read-heavy:

- `documents:read`
- `issues:read`
- `sprints:read`
- `webhooks:manage` only if the agent manages subscriptions
- write scopes only if approved actions actually mutate Ship

**CI proof.** Run FleetGraph tests with direct mode and public-API mode. In public-API mode, inspect audit log rows showing the agent app, route, user/service account, scope, and status.

## Phase 3: Post-Stack Refinement

### 3.0 Build Strategy Priority Order

1. OAuth foundation first. Without working tokens and scope checks, nothing
   else has a contract. Authorization Code + PKCE must be browser-tested early,
   including wrong-verifier rejection. Device Authorization Grant follows the
   same day.
2. Public/internal API boundary on Day 1. `/api/v1` starts as a fresh public
   router, and the boundary fitness check lands before public routes have a
   chance to import internal route handlers.
3. Error shape and `ApiError` before resources. Every `/api/v1` failure must
   return the same shape, and the route-enumerating fitness test becomes the E2
   TODO list.
4. OpenAPI generated from route metadata, never hand-written. Prove the loop
   with documents before adding broader resources, then let route/spec/SDK parity
   defend against drift.
5. Webhooks end-to-end on the webhook day: event registry, event bus,
   subscriptions, signer, deliverer, delivery log, and replay. The HMAC signer
   gets positive, negative, replay, and tamper checks.
6. SDK skeleton, one resource client, and auth helpers next. The CLI consumes
   the SDK as it grows so real consumer compilation exposes SDK bugs.
7. CLI reference integration must ship: `ship login`, `ship docs create`, and
   `ship webhooks tail` are the demo proof.
8. Developer Portal and Epic 7 agent rewire last. The portal should consume the
   public API like any other client. The agent rewire replaces direct service
   calls with SDK/public API calls behind a feature flag so Part 2 tests pass
   with the flag on or off.

Critical guidance:

- The public/internal split is a one-way door; `/api/v1` cannot import internal
  `/api` route handlers.
- OpenAPI is generated from Zod route metadata, never hand-written.
- Webhook tests use synchronous in-memory delivery or deterministic clocks, not
  real `setTimeout` waits.
- The platform is LLM-free; LLM calls remain agent-turn-only.
- External integrations import `@ship/sdk`, never `api/src`.
- TTFE runs in CI as soon as SDK + one resource exist.

### 3.1 Security And Failure Modes

**OAuth app owner deleted.** Deactivate apps by default and allow workspace admin transfer. Do not leave active orphaned apps.

**Deliverer crash mid-batch.** MVP in-memory deliverer is at-least-once within a single process. Production adapter should persist events and pending deliveries before send. Subscribers must dedupe by idempotency key.

**Leaked client secret.** Owner can rotate manually. Audit log records secret rotation and failed token attempts. Admin can force deactivate an app.

**CSRF.** Developer portal and consent actions use existing session CSRF protections. Token endpoints are not session-authenticated and validate OAuth credentials/PKCE instead.

### 3.2 Testing Strategy

**TTFE drill.** `pnpm drill ttfe` should run from a clean temp project if feasible. For CI speed, it can consume the workspace package tarball or packed local SDK rather than publishing to npm.

**OAuth Playwright.** Use the existing app login/session flow and a test registered app. Include happy path and wrong `code_verifier` negative case.

**Webhook retry tests.** Use fake timers or injected scheduler. Avoid tests that sleep for 1s + 4s + 16s in real time.

### 3.3 Tooling And CI

**Boundary lint.** Add a test or lint script that fails if `api/src/platform/api-v1` imports internal route handlers from `api/src/routes`. Public API may call domain/data services, not internal Express handlers.

**OpenAPI fitness.** CI validates generated `/api/v1/openapi.json` and asserts route/spec/SDK parity.

**Performance.** Track OAuth round-trip time, webhook first-attempt delivery latency, public API route query counts, and SDK install size. MVP can document baseline and compare manually; final should automate the key fitness checks.

### 3.4 Deployment And Hosting

**Deployment.** Reuse existing Ship deployment. Public URLs required:

- Ship frontend
- `/api/v1/openapi.json`
- Developer portal

**Grader app.** Seed one read-only OAuth app and document its `client_id`, redirect URI, and scopes. Do not expose a reusable raw secret in public docs unless it is read-only and intentionally for graders.

**CLI setup.** README should include a one-command CLI setup and TTFE drill command.

### 3.5 Observability Of API Usage

**Public API audit log.** Record timestamp, request_id, app client_id, user_id, route, method, scope used, status, latency_ms, and rate-limit result.

**Agent proof.** The agent-as-citizen proof is either a dashboard panel or a SQL/audit log excerpt showing FleetGraph calls going through `/api/v1` with OAuth app identity.

**Webhook observability.** Delivery log stores event_id, subscription_id, attempt number, response status, response excerpt, latency, and idempotency key. Portal should make replay and DLQ status obvious.

## Day-By-Day Plan

### Monday: Architecture And OAuth Skeleton

- Commit this `PRESEARCH.md`.
- Commit `docs/architecture.md`.
- Create migrations for OAuth apps, auth codes, tokens, device codes, scopes/audit, and webhook tables.
- Build `api/src/platform/errors`, `scopes`, and `api-v1` skeleton.
- Implement OAuth app registration with hashed secret shown once.
- Start Auth Code + PKCE backend endpoints.

### Tuesday MVP: Hard Gate

- Finish Auth Code + PKCE end-to-end Playwright test.
- Add wrong `code_verifier` negative test returning `invalid_grant`.
- Add bearer token middleware for `/api/v1/*`.
- Implement `/api/v1/me` and documents list/get/create.
- Add scope middleware and insufficient-scope 403 with missing scope named.
- Generate and serve `/api/v1/openapi.json`.
- Add SDK skeleton: `new ShipClient({ token }).me()`.
- Deploy and document public OpenAPI URL and grader app.

### Wednesday: Device Flow, SDK, And Fitness Tests

- Implement Device Authorization Grant.
- Add SDK auth helpers and token stores.
- Add route/spec/scope/error-shape fitness tests.
- Add SDK/spec parity test.
- Add cursor pagination utilities and async iterator support.

### Thursday: Webhooks

- Event registry as data.
- In-process `IEventBus`.
- `document.created` publication from the document domain write path.
- Webhook subscriptions under `/api/v1/webhooks`.
- HMAC signer and SDK `verifyWebhook`.
- Delivery log, retry scheduler, DLQ, replay.

### Friday Early Submission

- CLI integration: `ship login`, `ship docs ls/get/create`, `ship webhooks tail`.
- TTFE drill first passing version.
- Developer portal minimum: apps, subscriptions, delivery log, replay.
- Static `docs/openapi.json`.
- Early demo checklist and evidence screenshots.

### Saturday: Hardening And Agent Rewire

- Rate limiting headers on all public responses.
- Public audit trail and portal visibility.
- Agent-as-citizen feature flag using SDK/public API.
- CI drill and regression cleanup.
- Performance and cost analysis.

### Sunday Final

- Final README/grader instructions.
- Social post screenshot: `ship webhooks tail` showing verified event.
- Demo video: five-line developer story plus portal replay.
- Final deploy verification.
- Final submission links.

## Highest-Risk Items

1. OAuth correctness and tests.
2. OpenAPI generation without drift.
3. Webhook retry/replay without flaky timing tests.
4. CLI TTFE drill from clean environment.
5. Agent rewire without breaking Week 5 functionality.

## Minimum Passing Platform

If scope gets tight, the smallest acceptable platform is:

- OAuth app registration.
- Auth Code + PKCE and Device Grant.
- `/api/v1/me` and documents list/get/create.
- Generated OpenAPI and static copy.
- `@ship/sdk` with auth, documents, pagination, and webhook verifier.
- `document.created` webhook with signing, delivery log, DLQ, replay.
- CLI TTFE drill proving login -> create document -> verified webhook.
