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
- Social post draft and screenshot plan: `PLUGFORGE_SOCIAL_POST.md`
- Security controls summary: `PLUGFORGE_SECURITY.md`
- Live deployment smoke script: `scripts/plugforge-live-smoke.mjs`
- Final submission verification script: `scripts/plugforge-final-check.mjs`

## Live MVP Deployment

- Public app: `https://d2rr1fze9v095b.cloudfront.net`
- Public OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Public scopes registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Public webhook event registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`
- API health through CloudFront: `https://d2rr1fze9v095b.cloudfront.net/health`
- Elastic Beanstalk version verified: `v20260602113723`
- Production OAuth app created: `Plugforge MVP Grader App`
- Production OAuth `client_id`: `ship_app_d8200057ae8afcd914151e0738af09f3`
- Production scopes: `documents:read`, `documents:write`, `webhooks:manage`

## Live MVP Proof

- Device Authorization Grant approved with user code `AZK5-FXJZ`.
- Public API document create proof: `4689f19c-24bf-4b75-8999-133d4debc762`
- Webhook trigger document: `501394e7-90e6-45dc-bfef-5b4b4b4e4d62`
- Webhook subscription: `2ed4b869-718c-49e1-9dcb-a4eb8e2ee210`
- Webhook delivery: `1dfdb680-d30b-4e02-92d5-6c2e2c5bee04`
- Delivery result: `document.created`, attempt `1`, status `delivered`, response `200`, latency `43ms`

## Verification Commands

```bash
corepack.cmd pnpm --filter @ship/api plugforge:fitness
corepack.cmd pnpm plugforge:live-smoke
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm --recursive run type-check
corepack.cmd pnpm --recursive run build
node integrations/cli/src/index.mjs --help
```

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
- Public webhook event registry.
- Document list, read-by-id, private-document non-disclosure, cursor pagination, and invalid-cursor errors.
- Scope enforcement and missing-scope error details.
- Rate-limit isolation by bearer token and audit evidence for 429 responses.
- Signed `document.created` webhooks.
- Webhook retry, `Retry-After` handling, permanent-failure dead lettering, delivery listing, replay, signing-secret rotation, and deactivation.
- Developer Portal audit viewing, webhook delivery viewing, and test-event sending.
- Public API audit evidence for `/api/v1/documents`.
- SDK/OpenAPI parity for documents, scopes, webhook event discovery, and webhook lifecycle routes.
