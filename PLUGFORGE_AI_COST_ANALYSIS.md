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
