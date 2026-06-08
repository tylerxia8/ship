# PlugForge Grader Quickstart

Use this when you have only a few minutes and want the fastest path through the
final submission.

## 1. Open The Reviewer Hub

Start with:

```text
PLUGFORGE_FINAL_SUBMISSION.md
```

It contains the live URL, reviewer account, production OAuth apps, proof IDs,
and the requirement-to-evidence map.

## 2. Open The Live Platform Links

- Live app: `https://d2rr1fze9v095b.cloudfront.net`
- Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
- OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
- Scope registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
- Webhook event registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`

The reviewer account is listed in `PLUGFORGE_FINAL_SUBMISSION.md`. Sign in
before recording or reviewing so credentials stay off screen.

## 3. Run The Local Proof Commands

From the repo root:

```powershell
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm plugforge:proof-gate
```

`plugforge:final-check` covers live smoke, CLI discovery, SDK unit tests, and
the PlugForge API fitness suite. `plugforge:proof-gate` verifies the submission
files and the latest successful GitHub Actions PlugForge Drill run for the
current branch tip.

## 4. Review The Main Evidence Files

- Architecture: `docs/architecture.md`
- Pre-search: `PRESEARCH.md`
- Pre-search conversation reference: `PRESEARCH_CONVERSATION_REFERENCE.md`
- AI cost analysis with measured token/cost evidence:
  `PLUGFORGE_AI_COST_ANALYSIS.md`
- Part 1 performance comparison: `PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md`
- Evidence pack: `PLUGFORGE_EVIDENCE_PACK.md`
- Demo script: `PLUGFORGE_FINAL_DEMO_SCRIPT.md`
- Demo dashboard: `docs/plugforge-final-demo.html`

## 5. Demo Video Flow

Re-record the final demo with the complete SDK workflow:

1. Open `docs/plugforge-final-demo.html`.
2. Show the five-line story.
3. Show the Developer Portal app, scopes, webhook subscriptions, delivery log,
   audit trail, and replay controls.
4. Show OpenAPI, scopes, and webhook event registry.
5. Run or show `corepack.cmd pnpm plugforge:final-check`.
6. Show GitHub Actions run `27080244158` or newer for TTFE + flake proof.
7. Mention the final feedback upgrade: agent client-credentials OAuth,
   measured cost/perf evidence, and focused signer/SDK tests.

