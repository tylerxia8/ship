# Plugforge Reviewer Hub

Start here when reviewing the Week 6 final submission.

## Live Review

- Live app: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Evidence pack: `PLUGFORGE_EVIDENCE_PACK.md`
- Live proof IDs: `PLUGFORGE_LIVE_PROOF.md`
- Screenshots: `docs/screenshots/plugforge/`

## Architecture

- Pre-search: `PRESEARCH.md`
- Architecture defense: `docs/architecture.md`
- Security controls: `PLUGFORGE_SECURITY.md`
- Operational readiness: `PLUGFORGE_OPERATIONAL_READINESS.md`

## Developer Experience

- API examples: `PLUGFORGE_API_EXAMPLES.md`
- SDK quickstart: `sdk/README.md`
- Runnable SDK examples: `examples/plugforge/`
- CLI reference integration: `integrations/cli/src/index.mjs`

## Verification

```powershell
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm plugforge:evidence-pack
corepack.cmd pnpm plugforge:screenshots
```

The final check covers live discovery, CLI discovery, CLI help, and the Plugforge
fitness suite.
