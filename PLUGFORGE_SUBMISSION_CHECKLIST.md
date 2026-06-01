# Plugforge Submission Checklist

Use this as the quick evidence map for the Week 6 Plugforge submission.

## Required Evidence

- Architecture defense: `docs/architecture.md`
- Pre-search and risk discovery: `PRESEARCH.md`
- Public OpenAPI contract: `docs/openapi.json`
- Developer Portal: `/settings/developers`
- Public API implementation: `api/src/platform/`
- SDK: `sdk/`
- CLI reference integration: `integrations/cli/src/index.mjs`
- TTFE drill: `scripts/plugforge-ttfe-drill.mjs`
- Demo walkthrough: `PLUGFORGE_DEMO_GUIDE.md`

## Verification Commands

```bash
corepack.cmd pnpm --filter @ship/api plugforge:fitness
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
- OAuth app registration, secret rotation, and deactivation.
- Authorization Code + PKCE happy path and wrong-verifier failure.
- Device Authorization Grant pending, slow-down, approve, consume, and replay paths.
- Refresh token rotation and replay-triggered token family revocation.
- Public scope registry.
- Public webhook event registry.
- Document cursor pagination and invalid-cursor errors.
- Scope enforcement and missing-scope error details.
- Signed `document.created` webhooks.
- Webhook retry, delivery listing, replay, signing-secret rotation, and deactivation.
- Public API audit evidence for `/api/v1/documents`.
- SDK/OpenAPI parity for documents, scopes, webhook event discovery, and webhook lifecycle routes.
