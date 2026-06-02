# Plugforge Live Proof

This file captures the concrete production evidence used in the final demo.

## Production URLs

- App: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Scopes: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Webhook events: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`

## Production OAuth App

- Name: `Plugforge MVP Grader App`
- Client ID: `ship_app_d8200057ae8afcd914151e0738af09f3`
- Scopes: `documents:read`, `documents:write`, `webhooks:manage`

## Live IDs

- Device Authorization Grant user code: `AZK5-FXJZ`
- Public API document create proof: `4689f19c-24bf-4b75-8999-133d4debc762`
- Webhook trigger document: `501394e7-90e6-45dc-bfef-5b4b4b4e4d62`
- Webhook subscription: `2ed4b869-718c-49e1-9dcb-a4eb8e2ee210`
- Webhook delivery: `1dfdb680-d30b-4e02-92d5-6c2e2c5bee04`
- Delivery result: `document.created`, attempt `1`, delivered, HTTP `200`, `43ms`

## Screenshots

- `docs/screenshots/plugforge/developer-portal.png`
- `docs/screenshots/plugforge/developer-portal-expanded-app.png`
- `docs/screenshots/plugforge/openapi-json.png`
- `docs/screenshots/plugforge/scopes-registry.png`
- `docs/screenshots/plugforge/webhook-events-registry.png`

## Repeatable Proof Commands

```powershell
corepack.cmd pnpm plugforge:live-smoke
corepack.cmd pnpm plugforge:evidence-pack
corepack.cmd pnpm plugforge:screenshots
corepack.cmd pnpm --filter @ship/api plugforge:fitness
```
