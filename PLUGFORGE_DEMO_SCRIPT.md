# PlugForge MVP Demo Script

Use this as the recording runbook for the MVP demo video.

## Tabs To Open

1. Ship app: `https://d2rr1fze9v095b.cloudfront.net`
2. Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
3. OpenAPI spec: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
4. Scope registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
5. Webhook events: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`
6. Terminal in the repo root: `c:\Users\tyler\ship`

## Opening

Say:

> Hi, this is the Ship PlugForge MVP. The goal was to turn Ship from a
> first-party app into a platform: OAuth apps, scoped public APIs, generated
> OpenAPI, a typed SDK, signed webhooks, rate limiting, audit trails, and a
> developer portal. The core proof is Time-to-First-Event: how quickly a new
> developer can create a useful loop and receive a verified signed webhook.

## Demo Flow

### 1. Ship App

Open the live Ship app.

Say:

> This is the live Ship app. The existing product still works as the first-party
> UI, but PlugForge adds a public integration layer alongside it.

### 2. Developer Portal

Open the Developer Portal.

Say:

> This is the developer portal. Admins can register OAuth apps, see client IDs,
> rotate secrets, manage webhook subscriptions, inspect delivery logs, and replay
> failed webhook deliveries. Secrets are only shown once and are hashed in the
> database.

Show:

- Registered OAuth app list.
- Read-only grader app.
- App scopes.
- Audit and delivery sections if visible.

### 3. OpenAPI Contract

Open `/api/v1/openapi.json`.

Say:

> The public API contract is generated from route metadata and served as OpenAPI
> 3.1. This is not hand-written documentation. The fitness suite validates the
> spec against the OpenAPI schema and checks parity between public routes,
> scopes, errors, pagination, and SDK methods.

### 4. Scope Registry

Open `/api/v1/scopes`.

Say:

> Scopes are registered as data: documents read/write, issues, sprints, and
> webhook management. Middleware asks for scopes by name, and insufficient-scope
> responses explicitly name the missing scope.

### 5. Webhook Events

Open `/api/v1/webhooks/events`.

Say:

> Webhook event types are also registered as data with schemas. Domain writes
> publish events through the event bus, not from route handlers, so the public
> integration layer stays clean.

### 6. Verification

In the terminal, run or show:

```powershell
corepack.cmd pnpm --filter @ship/api plugforge:fitness
```

Say:

> This covers OAuth app registration, Authorization Code plus PKCE including the
> wrong-verifier case, Device Grant behavior, bearer middleware, ApiError shape,
> scope enforcement, OpenAPI validation, SDK parity, webhooks, retry schedule,
> dead-letter queue, replay, rate limits, and audit logging.

### 7. Time-To-First-Event

Say:

> The signature challenge is Time-to-First-Event: from SDK and docs to a signed
> webhook in the terminal.

If a local server and token are ready, run:

```powershell
$env:SHIP_URL = "http://localhost:3000"
$env:SHIP_TOKEN = "ship_at_..."
corepack.cmd pnpm plugforge:ttfe
```

If not running live, say:

> The drill builds `@ship/sdk`, creates a webhook subscription through
> `ShipClient`, creates a document through `ShipClient`, receives the webhook
> locally, verifies the `Ship-Signature` with the SDK helper, checks the delivery
> log, and fails if it exceeds the configured target. The latest captured live
> proof completed in about 2.9 seconds.

## Closing

Say:

> The MVP is intentionally small but complete: OAuth, scoped resources,
> generated contract, typed SDK, signed events, retries, dead-letter queue,
> replay, rate limits, auditability, and a developer portal. The point is not a
> sprawling API. It is a public platform loop that a stranger can trust quickly.
