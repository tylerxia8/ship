# Plugforge Architecture

Plugforge turns Ship into a developer platform. The platform contract is deliberately small: a versioned `/api/v1` public API, OAuth apps and tokens, scopes-as-data, generated OpenAPI, a typed SDK, signed webhooks, and a CLI reference integration. Internal Ship routes remain under `/api/*`; public consumers use `/api/v1/*`.

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
    src/               ship login, docs, webhooks tail
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
  -> bearer token auth
  -> rate limit
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

verifyWebhook(headers, rawBody, signingSecret);
```

Auth helpers:

```ts
await ShipClient.deviceLogin({
  onUserCode: (code, url) => console.log(code, url),
  tokenStore,
});
```

Pre-1.0 surfaces:

- `client.issues`
- `client.sprints`
- advanced webhook filters
- browser localStorage token store

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

## Failure Modes

**Token store corrupted.** SDK treats unreadable token stores as logged-out state and asks the user to login again. It must not silently reuse partial tokens.

**Subscriber signing secret rotated mid-flight.** New deliveries use the new secret. Old delivery rows record which subscription and attempt were used. MVP does not support dual-secret grace periods, so a subscriber must update its secret before expecting future signatures to verify.

**Queue deliverer crashes.** MVP in-memory delivery is process-local and therefore not durable across crash. The interface is designed for a queue-backed deliverer that persists pending deliveries before send. Subscribers must treat delivery as at-least-once and dedupe by idempotency key.

**OpenAPI generator throws at boot.** Fail fast in non-production/test. In production, serve the last generated static `docs/openapi.json` only if available and log an error; do not silently serve a partial spec.

**OAuth app owner deleted.** Deactivate the app and require admin transfer before reactivation. This is safer than leaving orphaned credentials active.

**Rate limiter misconfigured.** Public API should default closed: conservative per-token limits and explicit headers on every response. Missing limiter config should not mean unlimited traffic.

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

## Architectural Decisions To Defend

**Small API first.** Documents are the first public resource because every Ship content type uses the unified document model. This gets the contract right before expanding to issues and sprints.

**Generated OpenAPI.** Route metadata and Zod schemas are the source of truth. Hand-written specs drift.

**Public/internal split.** `/api/v1` is not a thin alias of internal routes. It is a contract boundary with OAuth, scopes, rate limits, audit, pagination, and stable errors.

**In-memory webhooks first.** In-memory delivery is enough for demo and test determinism. Interfaces are shaped so Redis/SQS can replace it later.

**SDK hand-written, parity-tested.** Generated SDKs often expose awkward types. A hand-written SDK gives good DX, while parity tests prevent missing methods.
