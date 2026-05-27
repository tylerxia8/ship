# Deploying `ship-agent` to Render

Step-by-step for getting the FleetGraph agent service publicly accessible.

## Prerequisites

You already have:
- `ship-api-76ez` on Render — the existing Ship API (Week 4 deploy)
- An Anthropic API key + LangSmith API key
- A Ship service-account API token (from `api/scripts/create-service-account.ts`)

You need to create:
- A second Render service for `ship-agent` (this guide)

## Step 1 — Create the Render service

Two paths. Pick whichever you prefer.

### Path A: Render Blueprint (recommended)

1. Visit https://dashboard.render.com/blueprints
2. Click **New Blueprint Instance**
3. Connect to the `tylerxia8/ship` repo if not already
4. Branch: `fleetgraph/main`
5. Blueprint file path: `agent/render.yaml`
6. Click **Apply**

Render reads `agent/render.yaml` and provisions the service with build/start
commands + non-secret env vars pre-populated.

### Path B: Manual web service

1. Visit https://dashboard.render.com → **New** → **Web Service**
2. Connect repo: `tylerxia8/ship`, branch `fleetgraph/main`
3. Root directory: leave blank (the agent imports from `shared/` which lives at repo root)
4. Runtime: **Node**
5. Build command:
   ```
   corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ship/shared build && pnpm --filter @ship/agent build
   ```
6. Start command:
   ```
   pnpm --filter @ship/agent start
   ```
7. Plan: **Starter** ($7/mo — free tier spins down on idle, breaks the poller)
8. Health check path: `/health`
9. Name: `ship-agent`

## Step 2 — Set the secret environment variables

In the new service's **Environment** tab, add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-…` |
| `LANGSMITH_API_KEY` | `lsv2_pt_…` |
| `SHIP_SERVICE_ACCOUNT_KEY` | `ship_sa_…` (from `api/scripts/create-service-account.ts`) |
| `AGENT_SHARED_SECRET` | Generate a random string, e.g. `openssl rand -hex 32`. Both this service AND ship-api need it. |
| `FLEETGRAPH_TARGET_WORKSPACE_ID` | UUID of the workspace the agent should monitor proactively |

Save. Render auto-redeploys.

## Step 3 — Update ship-api with the matching shared secret

The proxy in `api/src/routes/fleetgraph.ts` needs the SAME `AGENT_SHARED_SECRET`
to inject as the `X-Agent-Secret` header on outbound calls. On the existing
`ship-api-76ez` Render service, **Environment** tab, add:

| Key | Value |
|---|---|
| `FLEETGRAPH_AGENT_URL` | `https://ship-agent-<your-suffix>.onrender.com` (URL from step 1) |
| `FLEETGRAPH_AGENT_SHARED_SECRET` | The same random string from step 2 |
| `FLEETGRAPH_AGENT_TIMEOUT_MS` | Optional; default `25000`. Keep under the hosting platform request timeout. |

ship-api auto-redeploys.

## Step 4 — Verify

```bash
# Agent's own health
curl https://ship-agent-<suffix>.onrender.com/health
# Expected: { ok: true, service: "ship-agent", ... }

# Ship API → agent proxy roundtrip
curl https://ship-api-76ez.onrender.com/api/fleetgraph/health
# Expected: { proxy_ok: true, agent: { ok: true, ... } }
```

If both come back ok, the deploy is wired. Open https://ship-henna.vercel.app
in a browser, log in, navigate to any document, and the Project Assistant
panel (bottom-right) should be talking to the live deployed agent.

## Step 5 — Watch the first proactive run

In Render's `ship-agent` service → **Logs**, you should see within ~60s of
boot:

```
[poller] starting — interval 60000ms, per-scope cooldown 240000ms
[poller] tick complete in <N>ms — workspaces=1 sprints_considered=<N> sprints_run=<N>
```

Each sprint run shows up as a separate LangSmith trace under the
`fleetgraph-prod` project. Open https://smith.langchain.com → projects →
fleetgraph-prod to see them stream in.

## Cost notes

- Render Starter: $7/month always-on
- Anthropic: ~$0.013 per graph run × 360 polls/day × N active sprints. At
  the seed workspace's 35 sprints (most stale), filtered to maybe 5
  truly-active = ~$2.30/day proactive + on-demand traffic.
- LangSmith: free tier covers up to 5K traces/month; project usage will
  show in their dashboard.

Total: roughly **$10–$15/month** for a single-workspace deploy.

## Tearing down

When you're done with the submission:

1. Render dashboard → `ship-agent` → **Settings** → Delete service. Render
   stops billing as soon as it's gone.
2. Don't forget to:
   - Remove `FLEETGRAPH_AGENT_URL` + `FLEETGRAPH_AGENT_SHARED_SECRET` from
     ship-api's env (otherwise the chat proxy will 502 on every call).
   - Rotate `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`, and
     `SHIP_SERVICE_ACCOUNT_KEY` (they were in chat transcripts during
     development).
