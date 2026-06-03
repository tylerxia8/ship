# Plugforge Reviewer Hub

Start here when reviewing the Week 6 final submission.

## Live Review

- Live app: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Read-only grader OAuth app: `ship_app_8d138f5f898a7dd8bd9ae88e1d6f18c5` (`documents:read`)
- Webhook registry status: production currently exposes `document.created`;
  this branch implements and tests all eight required webhook event definitions
  and needs deployment before final external grading.
- Evidence pack: `PLUGFORGE_EVIDENCE_PACK.md`
- Live proof IDs: `PLUGFORGE_LIVE_PROOF.md`
- Demo video script: `PLUGFORGE_DEMO_SCRIPT.md`
- Five-line developer story: `PLUGFORGE_FIVE_LINE_STORY.md`
- Screenshots: `docs/screenshots/plugforge/`
- Latest authenticated TTFE proof: document `436f86e1-07e1-4e4e-adff-e958f23200c9`,
  delivery `52d11acd-1c1c-44df-92b6-889f2829408c`, signature verified.

## Architecture

- Pre-search: `PRESEARCH.md`
- Architecture defense: `docs/architecture.md`
- Security controls: `PLUGFORGE_SECURITY.md`
- Operational readiness: `PLUGFORGE_OPERATIONAL_READINESS.md`
- Post-MVP status: `PLUGFORGE_POST_MVP_STATUS.md`

## Developer Experience

- API examples: `PLUGFORGE_API_EXAMPLES.md`
- SDK quickstart: `sdk/README.md`
- Signature TTFE drill: `corepack.cmd pnpm plugforge:ttfe`
- Runnable SDK examples: `examples/plugforge/`
- CLI reference integration: `integrations/cli/src/index.mjs`

## SDK Packaging Note

`@ship/sdk` is implemented as a workspace package for this assignment. The
production follow-up is publishing the same package to npm. A clean-machine
reviewer can use the SDK today with:

```powershell
git clone https://github.com/tylerxia8/ship.git
cd ship
git checkout plugforge/main
corepack.cmd pnpm install
corepack.cmd pnpm --filter @ship/sdk build
```

## Verification

```powershell
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm plugforge:evidence-pack -- --include-final-check
corepack.cmd pnpm plugforge:screenshots
```

The final check covers live discovery, CLI discovery, CLI help, and the Plugforge
fitness suite.

For the Time-to-First-Event signature challenge, set `SHIP_URL` and a token with
`documents:write webhooks:manage`, then run `corepack.cmd pnpm plugforge:ttfe`.
It builds `@ship/sdk`, creates the subscription and document through the SDK,
receives the signed webhook locally, verifies it through the SDK helper, checks
the delivery log, and fails if elapsed time exceeds `TTFE_TARGET_MS` defaulting
to `60000`.
