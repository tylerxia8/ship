# Plugforge AI Cost Analysis

The headline cost discipline is simple: the Plugforge platform itself does zero
AI work.

OAuth, `/api/v1`, generated OpenAPI, the SDK, CLI, webhooks, rate limiting,
audit logging, delivery retries, and the Developer Portal do not invoke an LLM.
They are deterministic platform infrastructure. Cost scales with API traffic,
database work, webhook delivery, and normal hosting, not model tokens.

LLM calls remain isolated to FleetGraph agent turns, exactly as in Part 2. The
agent invokes models only when a user-initiated or explicitly scheduled agent
run reaches an LLM node such as intent classification or reasoning. Deterministic
agent nodes such as context resolution, document fetching, action decisions, and
webhook/platform calls do not invoke a model.

Epic 7's architectural payoff is access-shape alignment, not a new cost shape:
the agent should run through the public API like any other client. That means
the agent receives the same scopes, rate limits, OpenAPI/SDK contract, and audit
trail as an external developer app. Moving the agent behind `/api/v1` changes
how it is authorized and observed; it does not make the platform invoke models
on ordinary platform traffic.

## Cost Shape

| Traffic | LLM cost? | Notes |
|---|---:|---|
| Public API requests under `/api/v1/*` | No | OAuth, scopes, rate limits, pagination, audit, and ApiError handling are deterministic. |
| OAuth app registration, PKCE, device flow, refresh rotation | No | Token lifecycle work is crypto/database work only. |
| Webhook signing, delivery, retries, DLQ, replay | No | HMAC signing and retry scheduling are deterministic. |
| SDK and CLI commands | No | They call public endpoints and verify webhook signatures locally. |
| Developer Portal usage | No | Portal screens list apps, audit rows, subscriptions, and deliveries. |
| FleetGraph user-initiated agent turns | Yes | Model spend occurs only inside the separate agent service when graph execution reaches LLM nodes. |
| FleetGraph deterministic graph nodes | No | Fetching Ship data, resolving context, and action classification helpers do not require model calls. |

## Scaling Rule

Cost scales with agent activity, not platform traffic.

More external developers using OAuth apps or webhooks increases ordinary API,
database, and network load. It does not increase token spend unless those
developers explicitly call an agent feature that runs an LLM. This keeps
Plugforge from turning every document create, webhook delivery, or API read into
an implicit AI bill.

## Production Cost Projections

Platform-layer cost scales with API traffic and webhook delivery, not with LLM
calls. The numbers below assume the agent app is one of N installed apps at each
tier. LLM cost is attributable to the agent app's user-driven sessions, not the
platform itself.

| Tier | API calls/day | Webhook deliveries/day | Agent LLM calls/day | Estimated cost/month |
|---|---:|---:|---:|---:|
| 100 users | ~20,000 | ~5,000 | ~50 | $2-8 |
| 1,000 users | ~200,000 | ~50,000 | ~500 | $15-50 |
| 10,000 users | ~2,000,000 | ~500,000 | ~5,000 | $80-250 |
| 100,000 users | ~20,000,000 | ~5,000,000 | ~50,000 | $500-1,500 |

These are planning ranges, not invoices. The platform portion is ordinary API,
database, audit-log, webhook POST, and delivery-log storage cost. The agent LLM
portion is separately attributable because the agent authenticates as an app and
its activity is visible through the same public audit trail as other apps.

## Development And Testing Costs To Track

Run the cost snapshot from the repository root:

```powershell
corepack.cmd pnpm plugforge:costs -- --measure-ci
```

Use `--ttfe` when `SHIP_URL`/`SHIP_TOKEN` or local Docker are available and the
full TTFE loop should be timed:

```powershell
corepack.cmd pnpm plugforge:costs -- --measure-ci --ttfe
```

| Cost bucket | What to track | How to measure | Target or invariant |
|---|---|---|---|
| LLM API spend during Epic 7 agent rewire | Daily provider spend, baseline tokens per turn, rewire tokens per turn. | Export provider billing/LangSmith token counts, then run `EPIC7_LLM_SPEND_USD_DAY=<n> EPIC7_AGENT_BASELINE_TOKENS_PER_TURN=<n> EPIC7_AGENT_REWIRE_TOKENS_PER_TURN=<n> corepack.cmd pnpm plugforge:costs`. | Rewire direct service calls to SDK/public API calls without changing token volume for the same user-initiated agent turns. |
| CI minutes for TTFE drill | Elapsed time for `corepack.cmd pnpm drill ttfe` on Day 1 and weekly PR volume. | `corepack.cmd pnpm plugforge:costs -- --ttfe` records the drill elapsed time; CI history gives P95 and weekly run count. | CI P95 stays below 60s; weekly CI bill is budgeted from measured minutes times PR count. |
| OAuth flow testing | Number of Playwright browser-backed tests launched for auth-code PKCE. | `plugforge:costs` counts tests in `e2e/plugforge-oauth.spec.ts`; current focused suite is one browser-backed test. | Count remains explicit when adding more browser auth cases. |
| OpenAPI spec generation and validation overhead | Time spent generating and schema-validating the public OpenAPI document in CI. | `plugforge:costs -- --measure-ci` times `@ship/api plugforge:openapi` and the focused OpenAPI schema validation test. | Keep as a measured small fixed cost instead of a hand-wave. |
| Dev portal demo storage and egress | Expected weekly webhook event rows, delivery rows, audit rows, subscriber POST egress, and portal log-read egress. | `plugforge:costs` estimates volume from `PLUGFORGE_COST_DRILL_RUNS_PER_WEEK`, `PLUGFORGE_COST_WEBHOOK_ATTEMPTS_PER_DRILL`, and `PLUGFORGE_COST_PORTAL_VIEWS_PER_WEEK`. | Demo-volume logs should remain tiny; growth should be visible before production retention decisions. |

Default demo-volume assumptions are intentionally conservative: 100 drill runs
per week, one webhook delivery attempt per drill, and 25 Developer Portal log
views. Override them with:

```powershell
$env:PLUGFORGE_COST_DRILL_RUNS_PER_WEEK = "250"
$env:PLUGFORGE_COST_WEBHOOK_ATTEMPTS_PER_DRILL = "2"
$env:PLUGFORGE_COST_PORTAL_VIEWS_PER_WEEK = "50"
corepack.cmd pnpm plugforge:costs
```

## Evidence In Code

- `api/src/platform/*` implements the public API, OAuth, scopes, OpenAPI,
  webhooks, rate limiting, and audit without importing model clients.
- `sdk/src/*` contains no model provider dependency and has no production
  dependencies.
- `integrations/cli` and `integrations/flows` call the SDK/public API and verify
  HMAC signatures; they do not call model providers.
- `agent/src/config.ts` is where model provider configuration lives.
- `agent/src/nodes/intent_classifier.ts` and `agent/src/nodes/reasoner.ts` are
  the LLM-bearing graph nodes; deterministic agent nodes are documented as no-LLM
  paths.

## Review Sound Bite

Plugforge did not add AI to the platform. It made the platform usable by the
agent and by third-party developers through the same public contract. The AI
bill remains tied to explicit agent work, while the platform contract remains
deterministic, auditable, and cheap to exercise.
