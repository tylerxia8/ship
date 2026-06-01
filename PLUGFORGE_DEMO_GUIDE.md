# Plugforge Demo Guide

## Story

Plugforge turns Ship into a developer platform. The demo proves the contract from
three viewpoints:

1. Workspace admin registers an OAuth app in Ship.
2. Developer uses the CLI/public API to create a document.
3. Subscriber receives a signed `document.created` webhook and sees delivery
   observability.

## Websites To Open

- Ship app: `/settings/developers`
- Public OpenAPI: `/api/v1/openapi.json`
- Static OpenAPI file: `docs/openapi.json`
- GitHub branch: `plugforge/main`

## Terminal Commands

Run the fitness suite:

```bash
corepack.cmd pnpm --filter @ship/api plugforge:fitness
```

Regenerate the static OpenAPI contract:

```bash
corepack.cmd pnpm --filter @ship/api plugforge:openapi
```

Run the time-to-first-event drill:

```bash
SHIP_URL=http://localhost:3000 SHIP_TOKEN=ship_at_... node scripts/plugforge-ttfe-drill.mjs
```

Use the reference CLI:

```bash
node integrations/cli/src/index.mjs login --client-id ship_app_... --ship-url http://localhost:3000
node integrations/cli/src/index.mjs scopes --ship-url http://localhost:3000
node integrations/cli/src/index.mjs docs create "Plugforge demo document" --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks events --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks deliveries --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks rotate-secret <subscription-id> --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks deactivate <subscription-id> --ship-url http://localhost:3000
node integrations/cli/src/index.mjs webhooks tail --ship-url http://localhost:3000
```

## Demo Script

1. "This week's goal was to make Ship usable as a platform, not just an app."
2. "The public boundary is `/api/v1`; internal Ship routes stay separate."
3. "Here is the Developer Portal. A workspace admin can create an OAuth app, see
   the client secret once, and inspect registered apps without exposing secret
   hashes."
4. "The OpenAPI contract is served live and exported to `docs/openapi.json`."
5. "The CLI uses Device Authorization Grant, so it does not need a client secret
   or local callback server. It refreshes expired access tokens with the stored
   rotating refresh token."
6. "Creating a document through the public API emits a signed
   `document.created` webhook."
7. "Webhook delivery attempts are logged with status, response code, latency,
   next retry time, and idempotency key."
8. "Transient failures become `retry_pending`, permanent failures become
   `dead_letter`, and the API process runs a 15-second retry worker."
9. "The fitness suite proves OAuth, scopes, error shape, OpenAPI/SDK parity, the
   public/internal boundary, webhooks, retry behavior, and replay behavior."

## Evidence Checklist

- `PRESEARCH.md` contains the planning and risk discovery.
- `docs/architecture.md` contains architecture defense and tradeoffs.
- `docs/openapi.json` contains the static public contract.
- `api/src/platform/platform.test.ts` contains end-to-end public API contract
  tests.
- `api/src/platform/fitness.test.ts` contains boundary and SDK parity checks.
- `scripts/plugforge-ttfe-drill.mjs` proves time to first event.
- `integrations/cli/src/index.mjs` is the reference integration.

## Known Demo Notes

- On Windows, prefer `corepack.cmd pnpm ...`.
- The root `pnpm dev` script uses a shell script; if it is unavailable, run API
  and web servers with the workspace-specific commands from a shell that has
  pnpm/corepack on PATH.
- The TTFE drill needs a real public API bearer token with `documents:write` and
  `webhooks:manage`.
- The TTFE drill deactivates its temporary webhook subscription by default. Set
  `KEEP_WEBHOOK=1` only when you want to inspect the subscription afterward.
