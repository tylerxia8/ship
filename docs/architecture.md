# Plugforge Architecture

Plugforge turns Ship into a developer platform. The platform contract is deliberately small: a versioned `/api/v1` public API, OAuth apps and tokens, scopes-as-data, generated OpenAPI, a typed SDK, signed webhooks, and a CLI reference integration. Internal Ship routes remain under `/api/*`; public consumers use `/api/v1/*`.

## Architectural Defense Coverage

| PRD-required section | Covered here |
|---|---|
| Module Layout | Module Layout |
| SOLID Rationale | SOLID Rationale |
| Composition Root | Composition Root |
| Public/Internal Boundary | Public/Internal Boundary |
| OAuth Flows | OAuth Flows |
| Webhook Pipeline | Webhook Pipeline |
| SDK Surface | SDK Surface |
| Agent-as-Citizen | Agent As Citizen |
| Failure Modes | Failure Modes |
| Scope and risk discipline | MVP Cut, Risk Register, Architectural Decisions To Defend |

## MVP Cut

Tuesday MVP is intentionally narrower than the final platform. The MVP must prove the contract spine:

- OAuth app registration with hashed `client_secret` and raw secret shown once.
- Authorization Code + PKCE happy path and wrong-verifier negative path.
- Bearer token middleware on `/api/v1/*`.
- Scope registry and `requireScope(scope)` middleware.
- Public documents API: list, get by id, and create.
- Consistent `ApiError` shape with `request_id`.
- Generated `/api/v1/openapi.json`.
- SDK skeleton where `new ShipClient({ token }).me()` works against a running server.
- Device Authorization Grant for CLI-style integrations, including `authorization_pending`
  and `slow_down` branches.

Post-MVP scope adds webhooks, CLI, TTFE drill, developer portal, rate-limit hardening, and FleetGraph's agent-as-citizen rewire. The defense is that OAuth + public API correctness is the foundation; webhooks and CLI become meaningful only after tokens, scopes, errors, and OpenAPI are stable.

## Module Layout

Planned backend layout:

```text
api/src/platform/
  api-v1/          Public Express routers, route metadata, pagination helpers
  apps/            OAuth app registration, secret hashing, rotation
  audit/           Public API audit logging
  errors/          ApiError class, request_id middleware, public error handler
  oauth/           Authorization Code + PKCE, Device Grant, token rotation
  openapi/         Zod route metadata to OpenAPI 3.1 generator
  ratelimit/       Per-app and per-token token buckets
  scopes/          ScopeRegistry and requireScope middleware
  webhooks/        Event registry, signer, subscriptions, deliverer, DLQ, replay
```

Planned SDK/integration layout:

```text
sdk/
  src/
    client.ts          ShipClient root
    documents.ts       DocumentsClient
    issues.ts          IssuesClient placeholder for parity
    sprints.ts         SprintsClient placeholder for parity
    webhooks.ts        WebhooksClient and verifyWebhook
    auth/              deviceLogin, authorizationCodeFlow, token stores
    errors.ts          typed SDK error union

integrations/
  cli/
    src/               ship login, docs, webhooks subscribe
    tests/             TTFE drill and CLI integration tests
```

Database changes live in numbered migrations under `api/src/db/migrations/`. Ship's existing `documents` table remains the source of truth for documents, issues, sprints, projects, programs, and people.

## SOLID Rationale

**Single Responsibility.** Public platform modules have one job each. `errors` owns the response shape, `scopes` owns authorization decisions, `oauth` owns token lifecycle, and `webhooks` owns delivery. This prevents `/api/v1` handlers from becoming large mixed-responsibility functions.

**Open/Closed.** `ScopeRegistry` and `EventRegistry` are data registries. Adding `issues:read` or `issue.assigned` should register new data without rewriting middleware. The OpenAPI generator also stays closed to route-specific behavior by reading metadata instead of special-casing endpoints.

**Liskov Substitution.** `IEventBus` and `IWebhookDeliverer` define contracts that can be backed by in-memory implementations for MVP and queue-backed implementations later. Tests use the same interface as production code.

**Interface Segregation.** The SDK exposes resource clients: `client.documents`, `client.issues`, `client.sprints`, and `client.webhooks`. Consumers do not import one giant client with every method mixed together.

**Dependency Inversion.** Public routes depend on domain/data services and platform interfaces, not on internal Express route handlers. Webhook publishing depends on `IEventBus`, not on a concrete queue. The CLI imports only `@ship/sdk`, not `api/src`.

## Composition Root

Production wiring belongs in `api/src/app.ts` or a small sibling composition module:

```ts
const scopeRegistry = createScopeRegistry();
const oauthStore = new PostgresOAuthStore(pool);
const tokenService = new OAuthTokenService(oauthStore, clock, crypto);
const rateLimiter = new InMemoryTokenBucket();
const auditLogger = new PostgresAuditLogger(pool);
const eventBus = new InProcessEventBus();
const webhookDeliverer = new InProcessWebhookDeliverer(pool, clock, fetch);

const publicApi = createPublicApiRouter({
  tokenService,
  scopeRegistry,
  rateLimiter,
  auditLogger,
  eventBus,
});

app.use("/api/v1", publicApi);
app.use("/oauth", createOAuthRouter({ tokenService, scopeRegistry }));
```

Test wiring swaps concrete implementations:

```ts
const clock = new FakeClock();
const eventBus = new InMemoryEventBus();
const webhookDeliverer = new CapturingWebhookDeliverer(clock);
```

This keeps retry tests deterministic and avoids real-time sleeps.

## Public/Internal Boundary

Public routes live only under `/api/v1/*`. Internal Ship routes remain under `/api/*`. Public routes may call shared domain/data services, but they must not import internal route handlers.

```text
external app
  -> /api/v1/documents
  -> request_id
  -> rate limit headers
  -> bearer token auth
  -> requireScope("documents:read")
  -> audit start
  -> document service / direct pg utility
  -> audit finish
  -> ApiError or typed response

Ship UI
  -> /api/documents
  -> session auth
  -> existing internal route
  -> same document service / direct pg utility
```

This preserves Ship's existing UI while giving external developers a stable, versioned contract.

```mermaid
sequenceDiagram
    participant App as External App
    participant V1 as /api/v1 Router
    participant Auth as Bearer Auth
    participant Scope as Scope Middleware
    participant Audit as Audit Logger
    participant Domain as Document Service
    participant DB as Postgres

    App->>V1: GET /api/v1/documents
    V1->>Auth: validate access token
    Auth-->>V1: app, user, granted scopes
    V1->>Scope: require documents:read
    Scope-->>V1: allowed
    V1->>Audit: start request record
    V1->>Domain: list documents
    Domain->>DB: SELECT documents
    DB-->>Domain: rows
    Domain-->>V1: documents
    V1->>Audit: finish status/latency/scope
    V1-->>App: { data, next_cursor }
```

## OAuth Flows

### Authorization Code + PKCE

```text
browser app -> GET /oauth/authorize?client_id&redirect_uri&scope&code_challenge
Ship session auth -> consent screen
user approves -> auth code stored with code_challenge and scopes
redirect -> client callback with code
client -> POST /oauth/token with code_verifier
token service verifies PKCE challenge
token service issues access token + refresh token
client -> /api/v1/* with Bearer access token
```

Wrong or missing `code_verifier` returns `400 invalid_grant`. Auth codes are single-use and short-lived.

```mermaid
sequenceDiagram
    participant Browser as Browser App
    participant Ship as Ship OAuth
    participant User as User
    participant Token as Token Service
    participant API as /api/v1

    Browser->>Ship: GET /oauth/authorize + code_challenge
    Ship->>User: consent screen
    User-->>Ship: approve scopes
    Ship-->>Browser: redirect with authorization code
    Browser->>Token: POST /oauth/token + code_verifier
    Token->>Token: verify PKCE challenge
    Token-->>Browser: access token + refresh token
    Browser->>API: Bearer access token
    API-->>Browser: scoped response
```

### Device Authorization Grant

```text
CLI -> POST /oauth/device/code
server returns device_code, user_code, verification_uri, interval
CLI polls /oauth/token
user visits verification_uri and approves user_code
poll returns access token + refresh token
CLI stores tokens in file token store
```

Polling faster than the issued interval returns `slow_down`. Expired or denied device codes return explicit OAuth errors.

```mermaid
sequenceDiagram
    participant CLI as Ship CLI
    participant OAuth as Ship OAuth
    participant User as User Browser
    participant Store as Token Store

    CLI->>OAuth: POST /oauth/device/code
    OAuth-->>CLI: device_code, user_code, verification_uri, interval
    CLI->>OAuth: poll /oauth/token
    OAuth-->>CLI: authorization_pending
    User->>OAuth: open verification_uri and enter user_code
    OAuth-->>User: consent approved
    CLI->>OAuth: poll /oauth/token
    OAuth-->>CLI: access token + refresh token
    CLI->>Store: persist tokens
```

### Refresh Token Rotation

```text
client -> /oauth/token grant_type=refresh_token
token service checks token family and spent status
old refresh token marked spent
new access token and refresh token issued
reuse of spent token invalidates the family
```

This detects stolen refresh token replay.

## Webhook Pipeline

```text
document write
  -> domain publishes document.created
  -> IEventBus
  -> subscription matcher
  -> payload builder
  -> signer creates Ship-Signature
  -> IWebhookDeliverer
  -> POST target URL
  -> webhook_deliveries row
  -> retry scheduler or DLQ
  -> replay endpoint can re-emit original event
```

The signature is HMAC-SHA256 over `timestamp + "." + rawBody`. The SDK verifier rejects missing `v1`, tampered bodies, and timestamps older than 5 minutes by default. Replays preserve the original idempotency key.

```mermaid
sequenceDiagram
    participant Write as Document Write
    participant Bus as IEventBus
    participant Matcher as Subscription Matcher
    participant Signer as HMAC Signer
    participant Deliverer as Webhook Deliverer
    participant Target as Subscriber URL
    participant Log as Delivery Log

    Write->>Bus: publish document.created
    Bus->>Matcher: find active subscriptions
    Matcher->>Signer: raw payload + signing secret
    Signer-->>Deliverer: Ship-Signature + Idempotency-Key
    Deliverer->>Target: POST signed event
    Target-->>Deliverer: 2xx / 4xx / 5xx
    Deliverer->>Log: record attempt, latency, response
    Deliverer->>Deliverer: retry or DLQ if needed
```

## SDK Surface

Stable MVP surface:

```ts
const client = new ShipClient({ token });

await client.me();
await client.documents.list();
await client.documents.get(id);
await client.documents.create({ title: "hello" });

for await (const doc of client.documents.iterate()) {
  // cursor handled internally
}

const subscription = await client.webhooks.createSubscription({
  event_type: "document.created",
  target_url: "https://example.com/ship/webhook",
});

verifyWebhook(headers, rawBody, signingSecret);
```

Auth helpers:

```ts
await ShipClient.deviceLogin({
  clientId: "ship_app_...",
  scope: "documents:read documents:write",
  onCode: ({ user_code, verification_uri }) => {
    console.log(`Open ${verification_uri} and enter ${user_code}`);
  },
});

await ShipClient.refreshAccessToken({
  clientId: "ship_app_...",
  refreshToken,
});
```

Pre-1.0 surfaces:

- `client.issues`
- `client.sprints`
- advanced webhook filters
- browser localStorage token store

## CLI Reference Integration

The reference CLI lives at `integrations/cli` and is intentionally dependency-light. It proves the developer path without requiring the Ship web UI:

```bash
node integrations/cli/src/index.mjs login --client-id ship_app_... --ship-url http://localhost:3000
node integrations/cli/src/index.mjs docs ls --ship-url http://localhost:3000
node integrations/cli/src/index.mjs docs create "CLI proof" --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks subscribe --url https://example.com/ship/webhook --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks tail --ship-url http://localhost:3000
```

`SHIP_TOKEN` can override the local token store for repeatable demos. By default, successful device login stores tokens in `~/.ship/plugforge-cli.json`.
The CLI opens the browser-facing `/oauth/device/verify` approval flow, which is
session-authenticated and supports prefilled `user_code` query parameters.

## TTFE Drill

The time-to-first-event drill proves the platform from a developer's point of
view: create a webhook subscription, create a document, receive a signed
`document.created` event, and confirm the delivery log.

```bash
SHIP_URL=http://localhost:3000 SHIP_TOKEN=ship_at_... node scripts/plugforge-ttfe-drill.mjs
```

The token must include `documents:write` and `webhooks:manage`. The script prints
a JSON result with elapsed time, document id, subscription id, delivery id,
delivery status, response status, and signature verification.

## Agent As Citizen

Before:

```text
FleetGraph agent -> internal Ship API / direct service account path -> documents
```

After:

```text
FleetGraph OAuth app -> @ship/sdk -> /api/v1 -> scope middleware -> audit log -> documents
```

The payoff is that the agent has the same scopes, rate limits, and audit trail as an external developer app. The final proof should be an audit-log row showing FleetGraph's app identity, route, scope, status, and latency.

```mermaid
sequenceDiagram
    participant Agent as FleetGraph Agent
    participant SDK as @ship/sdk
    participant API as /api/v1
    participant Scope as Scope Middleware
    participant Audit as Public Audit Log
    participant Domain as Ship Domain Services

    Agent->>SDK: client.documents.list()
    SDK->>API: GET /api/v1/documents + Bearer token
    API->>Scope: require documents:read
    Scope-->>API: allowed
    API->>Audit: record app/user/scope/route
    API->>Domain: read document graph
    Domain-->>API: documents
    API-->>SDK: typed public response
    SDK-->>Agent: typed documents
```

## Failure Modes

**Token store corrupted.** SDK treats unreadable token stores as logged-out state and asks the user to login again. It must not silently reuse partial tokens.

**Subscriber signing secret rotated mid-flight.** New deliveries use the new secret. Old delivery rows record which subscription and attempt were used. MVP does not support dual-secret grace periods, so a subscriber must update its secret before expecting future signatures to verify.

**Queue deliverer crashes.** MVP in-memory delivery is process-local and therefore not durable across crash. Every delivery attempt is persisted with status, response, latency, and next retry time, so the retry scanner can resume visible failures after the process is healthy. Subscribers must treat delivery as at-least-once and dedupe by idempotency key.

**Webhook retries.** Transient failures (`5xx`, `429`, or network errors) become `retry_pending` with the schedule `1s, 4s, 16s, 1m, 5m, 30m`. Permanent `4xx` failures go straight to `dead_letter`. After six attempts, transient failures also move to `dead_letter`. Replay preserves the original event idempotency key.

**OpenAPI generator throws at boot.** Fail fast in non-production/test. In production, serve the last generated static `docs/openapi.json` only if available and log an error; do not silently serve a partial spec.

**OAuth app owner deleted.** Deactivate the app and require admin transfer before reactivation. This is safer than leaving orphaned credentials active.

**Rate limiter misconfigured.** Public API should default closed: conservative per-token limits and explicit headers on every response. Missing limiter config should not mean unlimited traffic.

**Demo rate limit.** MVP uses an in-memory one-minute bucket with `RateLimit-Limit`,
`RateLimit-Remaining`, and `RateLimit-Reset` headers on `/api/v1/*`. Production should
swap this for Redis or another shared store so limits hold across instances.

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| OAuth correctness slips | MVP blocker and security risk | Implement PKCE first, include Playwright happy path and wrong-verifier `invalid_grant` test |
| Public/internal route leakage | Contract becomes unstable | Add boundary test/lint rule banning imports from internal route handlers into `api/src/platform/api-v1` |
| OpenAPI drift | SDK and docs lie | Generate spec from route metadata and add route/spec/SDK parity fitness tests |
| Webhook retry tests become flaky | CI instability | Inject fake clock/scheduler; avoid real sleeps in retry tests |
| TTFE drill fails late | Final rubric risk | Add first TTFE drill as soon as SDK + documents + webhooks work, then keep it in CI |
| SDK grows heavy | Fails install-size target | Keep `@ship/sdk` dependency-light; put CLI dependencies in `integrations/cli` |
| Agent rewire breaks Week 5 behavior | Regression risk | Feature flag public-API mode and run tests with flag on/off |

## Implementation Order

1. Errors, request IDs, and `/api/v1` router skeleton.
2. Scope registry and bearer token middleware.
3. OAuth app model and registration.
4. Authorization Code + PKCE.
5. `/api/v1/me` and documents list/get/create.
6. OpenAPI generation and fitness tests.
7. SDK `ShipClient`, documents client, errors, and pagination.
8. Device Grant and CLI login.
9. Webhook event registry, signer, deliveries, replay.
10. TTFE drill and developer portal.
11. FleetGraph agent-as-citizen rewire.

## Fitness Checks

Plugforge has a focused API fitness suite:

```bash
corepack.cmd pnpm --filter @ship/api plugforge:fitness
```

It verifies the public platform boundary does not import internal `api/src/routes`
handlers, and it checks OpenAPI paths for documents/webhooks against SDK client
methods. This is intentionally small and fast so it can run before every demo
without replacing the broader build/test suite.

## Architectural Decisions To Defend

**Small API first.** Documents are the first public resource because every Ship content type uses the unified document model. This gets the contract right before expanding to issues and sprints.

**Generated OpenAPI.** Route metadata and Zod schemas are the source of truth. Hand-written specs drift.

**Public/internal split.** `/api/v1` is not a thin alias of internal routes. It is a contract boundary with OAuth, scopes, rate limits, audit, pagination, and stable errors.

**In-memory webhooks first.** In-memory delivery is enough for demo and test determinism. Interfaces are shaped so Redis/SQS can replace it later.

**SDK hand-written, parity-tested.** Generated SDKs often expose awkward types. A hand-written SDK gives good DX, while parity tests prevent missing methods.

## Defense Talking Points

**Why separate `/api/v1` from internal `/api`?** Internal routes are optimized for Ship's first-party UI and session model. Public routes need OAuth, scopes, rate-limit headers, cursor pagination, stable errors, OpenAPI metadata, and audit logging. Mixing them would make the public contract inherit internal UI churn.

**Why Authorization Code + PKCE for web apps and Device Grant for CLI?** Browser/web integrations can redirect through a consent screen and use PKCE to bind the code to the original client. CLIs cannot safely host a browser redirect or keep a client secret, so Device Grant gives a user-code approval flow designed for terminals.

**Why generated OpenAPI?** The spec is the platform contract. A hand-written spec will drift from handlers. Route metadata plus Zod schemas lets the server, docs, tests, and SDK parity checks all read from the same source of truth.

**Why in-memory webhooks for MVP?** The PRD allows an in-process must-ship implementation. The interface shape (`IEventBus`, `IWebhookDeliverer`) lets us prove signing, logging, retry, DLQ, and replay without adding Redis/SQS operational risk during the learning sprint.

**Why make FleetGraph an OAuth app?** It proves Ship is actually a platform. The agent should not have a privileged shortcut that external developers cannot use. Going through OAuth + SDK gives scopes, rate limits, and audit rows for the agent just like any other integration.
