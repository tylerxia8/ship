# Plugforge Social Post

## Short Version

This week I turned Ship into a developer platform.

Plugforge adds a versioned public API, OAuth apps, scoped access tokens, a
generated OpenAPI contract, a small SDK, a reference CLI, and signed webhooks.
The goal was not just "can an app call Ship?" It was "can Ship behave like a
platform developers can trust?"

Demo highlights:

- Workspace admin creates an OAuth app in the Ship Developer Portal.
- CLI logs in through Device Authorization Grant.
- Public API creates a Ship document.
- Ship emits a signed `document.created` webhook.
- Delivery logs show status, latency, retry state, and replay controls.

Live proof is running against the deployed Ship app, not mocks.

## Suggested Screenshots

1. Developer Portal at `/settings/developers`
   - Show app registration, scopes, and one-time secret behavior.
2. Live OpenAPI at `/api/v1/openapi.json`
   - Show that the platform has a concrete public contract.
3. Terminal running `corepack.cmd pnpm plugforge:final-check`
   - Show live smoke, CLI discovery, and fitness checks passing.
4. CLI command output
   - Show `ship scopes` or `ship webhooks events` against the live URL.
5. Webhook delivery log
   - Show `document.created`, delivered status, response `200`, and latency.
6. Architecture diagram or `docs/architecture.md`
   - Show the public/internal boundary and webhook pipeline.

## Demo Sections To Clip

### 1. Developer Portal

"An admin can create an OAuth app, choose scopes, rotate the secret, and
deactivate the app if credentials leak. The raw secret is shown once."

### 2. Public Contract

"External developers use `/api/v1`, not Ship's internal UI routes. The OpenAPI
contract is served live and exported into the repo."

### 3. CLI Login

"The CLI uses Device Authorization Grant, so developers do not need to paste a
client secret into the terminal or run a local callback server."

### 4. Public API Write

"Creating a document through the public API goes through bearer auth, scopes,
rate-limit headers, request IDs, and audit logging."

### 5. Signed Webhook

"The document write emits a signed `document.created` webhook. Delivery logs make
failures observable and replayable."

## Longer Version

For Week 6 I built Plugforge: the platform layer for Ship.

The hardest design choice was drawing a real public/internal boundary. Ship's
first-party UI can keep using session-authenticated internal routes, but external
apps now use a stable `/api/v1` contract with OAuth, scopes, cursor pagination,
consistent errors, request IDs, rate-limit headers, audit logging, generated
OpenAPI, and SDK parity checks.

The demo path is:

1. Create an OAuth app in the Developer Portal.
2. Discover the platform with `/api/v1/scopes` and `/api/v1/webhooks/events`.
3. Log in with the CLI through Device Authorization Grant.
4. Create a document through the public API.
5. Receive and verify a signed `document.created` webhook.
6. Inspect delivery logs, retry state, and replay controls.

I also added a final verification command:

```powershell
corepack.cmd pnpm plugforge:final-check
```

That runs the live deployment smoke test, CLI discovery against production, CLI
help output, and the Plugforge fitness suite.

The result is a small but defensible developer platform: scoped OAuth access,
typed API surface, working CLI, signed events, and operational evidence.
