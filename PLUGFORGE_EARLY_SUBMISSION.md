# Plugforge Early Submission

This file is the reviewer entry point for the Week 6 early submission.

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

```text
Name: Plugforge MVP Grader App
Client ID: ship_app_d8200057ae8afcd914151e0738af09f3
Scopes: documents:read, documents:write, webhooks:manage
Redirect URI: https://example.com/callback
```

The client secret was shown once during production app creation and is not
committed in the repo. Create or rotate an app secret from the Developer Portal
if a fresh secret is needed for review.

## Evidence Map

- Pre-search: `PRESEARCH.md`
- Architecture defense: `docs/architecture.md`
- Static public API contract: `docs/openapi.json`
- Submission checklist and live proof IDs: `PLUGFORGE_SUBMISSION_CHECKLIST.md`
- Demo guide: `PLUGFORGE_DEMO_GUIDE.md`
- Copyable examples: `PLUGFORGE_API_EXAMPLES.md`
- SDK: `sdk/`
- CLI reference integration: `integrations/cli/src/index.mjs`
- Time-to-first-event drill: `scripts/plugforge-ttfe-drill.mjs`
- Live smoke script: `scripts/plugforge-live-smoke.mjs`

## Live Proof Already Captured

- Device Authorization Grant approved with user code `AZK5-FXJZ`.
- Public API document create proof: `4689f19c-24bf-4b75-8999-133d4debc762`.
- Webhook trigger document: `501394e7-90e6-45dc-bfef-5b4b4b4e4d62`.
- Webhook subscription: `2ed4b869-718c-49e1-9dcb-a4eb8e2ee210`.
- Webhook delivery: `1dfdb680-d30b-4e02-92d5-6c2e2c5bee04`.
- Delivery result: `document.created`, attempt `1`, status `delivered`, response `200`, latency `43ms`.

## Verification Commands

```powershell
corepack.cmd pnpm --filter @ship/api plugforge:fitness
corepack.cmd pnpm plugforge:live-smoke
node integrations/cli/src/index.mjs --help
```

The live smoke script can run without a token for public discovery endpoints.
Set `SHIP_TOKEN` to include `/api/v1/me`, document listing, and webhook delivery
listing in the smoke run.

## Demo Path

1. Log into the live app.
2. Open `/settings/developers`.
3. Show the production OAuth app and create/rotate a secret if needed.
4. Open live `/api/v1/openapi.json`.
5. Run `corepack.cmd pnpm plugforge:live-smoke`.
6. Run the CLI `scopes`, `webhooks events`, and `docs ls` commands against the live URL.
7. Show the webhook delivery proof from the Developer Portal or checklist IDs.
