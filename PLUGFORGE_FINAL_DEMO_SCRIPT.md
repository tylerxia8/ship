# PlugForge Final Demo Video Script

Target length: 4-5 minutes.

Use this for the final-submission recording. Keep tokens, raw client secrets,
and passwords off screen. If login is needed, sign in before recording starts.

## Recording Dashboard

Open the local demo dashboard in a browser:

```text
docs/plugforge-final-demo.html
```

It contains the live links, commands, and short cue cards below.

## Tabs To Open

1. Demo dashboard: `docs/plugforge-final-demo.html`
2. Final submission hub: `PLUGFORGE_FINAL_SUBMISSION.md`
3. Live Developer Portal: `https://d2rr1fze9v095b.cloudfront.net/settings/developers`
4. Live OpenAPI: `https://d2rr1fze9v095b.cloudfront.net/api/v1/openapi.json`
5. Scope registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/scopes`
6. Webhook event registry: `https://d2rr1fze9v095b.cloudfront.net/api/v1/webhooks/events`
7. GitHub Actions proof: `https://github.com/tylerxia8/ship/actions/runs/27080244158`
8. Terminal in repo root: `c:\Users\tyler\ship`

## Before Recording

Run these once so successful proof is ready in terminal history:

```powershell
corepack.cmd pnpm plugforge:final-check
corepack.cmd pnpm plugforge:proof-gate
```

If you want fresh screenshots after a UI change:

```powershell
corepack.cmd pnpm plugforge:screenshots
```

## 0:00-0:30 Opening

Show the demo dashboard or `PLUGFORGE_FINAL_SUBMISSION.md`.

Say:

> This is the final PlugForge submission for Ship. The goal was to turn Ship
> from a first-party product into a small but real developer platform: OAuth
> apps, scoped public APIs, generated OpenAPI, a typed SDK, a CLI reference
> integration, signed webhooks, retries, replay, rate limits, audit trails, and
> a developer portal.

Then say:

> The headline proof is Time-to-First-Event: how quickly an outside developer
> can authenticate, create a document, and receive a verified signed webhook.

## 0:30-1:15 Five-Line Developer Story

Show the five-line story on the dashboard.

Say:

> The developer story compresses to five lines.

Read:

```bash
pnpm install @ship/sdk
ship login
ship docs create --title "hello"
ship webhooks tail
# document.created arrives, signature verified
```

Say:

> The CLI runs through the SDK, and the SDK runs through the public API. That is
> the point: the reference integration uses the same front door as any external
> developer.

## 1:15-2:00 Complete SDK Workflow

Switch to terminal or show the TTFE proof output.

Say:

> For the re-recorded final demo, I am walking the complete SDK-backed workflow:
> login, create a webhook subscription, create a document, receive the signed
> event, verify it with the SDK helper, then replay the delivery from the portal.

Show or run:

```powershell
ship login
ship webhooks subscribe --url <public-listener-url> --event document.created
ship docs create --title "hello"
ship webhooks tail
```

Say:

> `ship login` uses Device Authorization Grant. The docs and webhooks commands
> go through `@ship/sdk`, not private server internals.

## 2:00-2:45 Developer Portal

Switch to the Developer Portal.

Show:

- Registered OAuth app list.
- Client ID and scopes.
- Webhook subscriptions.
- Delivery log or audit activity.
- Replay/test-event controls if visible.

Say:

> This is the Developer Portal. A workspace admin can register apps, request
> scopes, rotate secrets, manage subscriptions, inspect webhook deliveries,
> replay deliveries, and view the public API audit trail. Raw secrets are shown
> once and stored hashed, so they cannot be recovered later.

If you show a delivery:

> Delivery logs include status, latency, attempts, response excerpts, and the
> idempotency key. Replay keeps the original idempotency key so subscribers can
> dedupe safely.

Click replay for one delivery if the portal has a completed delivery visible.

Say:

> This closes the SDK workflow: the event arrived signed, and the operator can
> replay it with the same idempotency key.

## 2:45-3:20 Public Contract

Open `/api/v1/openapi.json`.

Say:

> The public API contract is served live as OpenAPI 3.1 and generated from route
> metadata. It is not hand-written documentation.

Open `/api/v1/scopes`.

Say:

> Scopes are registered as data. Middleware asks for named scopes, and
> insufficient-scope errors explicitly name the missing scope.

Open `/api/v1/webhooks/events`.

Say:

> Webhook event types are also data with schemas. Domain writes publish through
> the event bus, not from route handlers, so the public layer stays clean.

## 3:20-4:10 Proof Commands

Switch to terminal and run or show the successful output:

```powershell
corepack.cmd pnpm plugforge:final-check
```

Say:

> The final check runs live smoke tests, CLI discovery, SDK unit tests, and the
> PlugForge fitness suite.

Then run or show:

```powershell
corepack.cmd pnpm plugforge:proof-gate
```

Say:

> The proof gate checks that the evidence pack is current, required submission
> files exist, SDK tests are wired in, and the current branch tip has a
> successful GitHub Actions PlugForge Drill run.

Switch to GitHub Actions run `27080244158` or a newer passing run.

Say:

> This run passed for the current commit. It ran the Time-to-First-Event drill
> and the 20-run flake drill, then uploaded proof artifacts.

## 4:10-4:45 Feedback Growth Edge

Show or mention:

- `api/src/platform/webhooks.signer.test.ts`
- `sdk/tests/client.test.ts`
- `sdk/tests/webhooks.test.ts`
- `ShipClient.clientCredentials()`
- `scripts/plugforge-agent-audit-proof.mjs`

Say:

> The last feedback was to move from integration-level confidence to isolated
> proof. I added a focused signer suite for the four named cases: positive,
> negative, replay, and tamper. I also added minimal SDK regression tests for
> `.me()`, resource clients, async pagination, typed errors, and the webhook
> verifier.

Then say:

> The final feedback also asked for a cleaner agent citizen story. The agent can
> now use OAuth Client Credentials to mint its own scoped public API token, so it
> no longer depends on a pre-injected bearer token for the preferred path.

## 4:45-5:00 Closing

Say:

> The final shape is intentionally small: one excellent platform loop, not a
> sprawling API. OAuth gives apps identity, scopes give boundaries, OpenAPI gives
> a contract, the SDK and CLI prove developer experience, webhooks prove event
> integration, and the audit trail proves the agent and external clients go
> through the front door.

Then close with:

> The thesis is depth over breadth and proof over promises. A small public API
> that matches its spec beats a large one that contradicts it.

## If Something Breaks

- If the Developer Portal is slow, show `PLUGFORGE_FINAL_SUBMISSION.md` and
  `PLUGFORGE_EVIDENCE_PACK.md`.
- If a command is slow, show the latest successful output already in terminal
  history and the GitHub Actions run.
- If login appears, stop recording or crop credentials.
- Do not show bearer tokens, raw client secrets, or passwords.
