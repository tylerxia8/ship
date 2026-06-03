# Plugforge Submission Requirements Map

Deadline: Sunday 10:59 PM CT.

| Requirement | Status | Evidence |
|---|---|---|
| GitHub repository public | Ready | Branch `plugforge/main`; reviewer hub in `PLUGFORGE_README.md`. Per-slice branches/PR descriptions are repository-history evidence; every shipped slice in this branch maps to acceptance criteria in the docs below. |
| Demo video 3-5 min | Ready script | `PLUGFORGE_DEMO_SCRIPT.md` uses the five-line story, then Developer Portal replay. |
| Pre-search document | Ready | `PRESEARCH.md` contains all three phases plus the appendix checklist completion matrix. Saved AI conversation should be attached by exporting this Codex thread as the reference artifact. |
| Architecture document | Ready | `docs/architecture.md` is the concise required architecture doc; `docs/architecture-extended.md` preserves deeper rationale. |
| OpenAPI spec live and static | Ready | Live `/api/v1/openapi.json`; static `docs/openapi.json`; schema validation in `api/src/platform/fitness.test.ts`. |
| AI cost analysis | Ready | `PLUGFORGE_AI_COST_ANALYSIS.md` tracks dev spend, production projections, webhook fanout, agent active rate, and retention assumptions. |
| Per-epic write-up | Ready | `PLUGFORGE_PER_EPIC_WRITEUP.md`. Epic 6 proof is TTFE/flows; Epic 7 proof is a live OAuth app audit row captured by `corepack.cmd pnpm plugforge:agent-audit-proof`. |
| Three discoveries | Ready | `PLUGFORGE_DISCOVERIES.md`. |
| Deployed application | Ready | `PLUGFORGE_FINAL_SUBMISSION.md` lists live app, Developer Portal, OpenAPI URL, read-only OAuth app, reviewer credentials, and the verified Elastic Beanstalk version `v20260603152032`. |
| Social post | Ready draft | `PLUGFORGE_SOCIAL_POST.md`; screenshot target is terminal `ship webhooks tail` showing a verified signed event, tag `@GauntletAI`. |

## Video Runbook

Open a fresh terminal and show:

```powershell
pnpm install @ship/sdk
ship login
ship docs create --title "hello"
ship webhooks tail
# document.created event arrives, signature verified
```

Then switch to `/settings/developers`, open a delivery row, and click replay.

## Final Verification Commands

```powershell
corepack.cmd pnpm plugforge:boundary
corepack.cmd pnpm plugforge:flows
corepack.cmd pnpm plugforge:perf
corepack.cmd pnpm plugforge:costs -- --measure-ci
corepack.cmd pnpm --filter @ship/api plugforge:fitness
corepack.cmd pnpm --recursive run type-check
```
