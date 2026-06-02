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
| Architecture and pre-search | `PRESEARCH.md`, `docs/architecture.md` |
| Public API contract | Live `/api/v1/openapi.json`, static `docs/openapi.json` |
| OAuth app lifecycle | `/settings/developers`, `api/src/platform/routes/apps.ts` |
| Auth flows | `api/src/platform/routes/oauth.ts`, `api/src/platform/platform.test.ts` |
| Scoped public API | `api/src/platform/api-v1.ts`, `api/src/platform/routes/documents.ts` |
| SDK | `sdk/src/` |
| Runnable developer examples | `examples/plugforge/` |
| CLI reference integration | `integrations/cli/src/index.mjs` |
| Signed webhooks | `api/src/platform/webhooks.ts`, `sdk/src/webhook-client.ts` |
| Delivery observability and replay | `/api/v1/webhooks/deliveries`, Developer Portal, fitness tests |
| Live smoke and final verification | `scripts/plugforge-live-smoke.mjs`, `scripts/plugforge-final-check.mjs` |
| Security controls | `PLUGFORGE_SECURITY.md` |

## Live Proof Captured

- Device Authorization Grant approved with user code `AZK5-FXJZ`.
- Public API document create proof: `4689f19c-24bf-4b75-8999-133d4debc762`.
- Webhook trigger document: `501394e7-90e6-45dc-bfef-5b4b4b4e4d62`.
- Webhook subscription: `2ed4b869-718c-49e1-9dcb-a4eb8e2ee210`.
- Webhook delivery: `1dfdb680-d30b-4e02-92d5-6c2e2c5bee04`.
- Delivery result: `document.created`, attempt `1`, status `delivered`, response `200`, latency `43ms`.

## Repeatable Verification

Run the final check from the repository root:

```powershell
corepack.cmd pnpm plugforge:final-check
```

That command runs:

- Live deployment smoke check.
- Live CLI scope discovery.
- Live CLI webhook event discovery.
- CLI help output.
- Plugforge API fitness suite.

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
corepack.cmd pnpm plugforge:ttfe
```

## Demo Video Path

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

- The public platform uses `/api/v1/*`; first-party Ship UI routes remain under
  `/api/*`.
- Public API responses include request IDs and rate-limit headers.
- Access tokens are scoped and short-lived; refresh tokens rotate.
- Webhook signatures are HMAC-SHA256 and verified by the SDK helper.
- Delivery is at-least-once. Subscribers dedupe with idempotency keys.
