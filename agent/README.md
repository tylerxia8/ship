# `@ship/agent` — FleetGraph

Project intelligence agent for Ship. Reads the document graph, reasons about
it, surfaces conditions worth acting on (proactive) or answers questions
scoped to what the user is looking at (on-demand). Same graph, two triggers.

Architecture: see [FLEETGRAPH.md](../FLEETGRAPH.md) at the repo root.

## Environment

| Variable | Required? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Reasoner + intent classifier LLM calls |
| `LANGSMITH_API_KEY` | yes | Trace upload |
| `LANGSMITH_PROJECT` | no (default `fleetgraph-dev`) | LangSmith project name |
| `LANGSMITH_TRACING` | no (default `true`) | Toggle tracing on/off |
| `LANGSMITH_ENDPOINT` | no (default `api.smith.langchain.com`) | LangSmith API endpoint |
| `SHIP_API_BASE_URL` | no (default `http://localhost:3000`) | Ship API host |
| `SHIP_PUBLIC_API_BASE_URL` | no (default `${SHIP_API_BASE_URL}/api/v1`) | Public API base URL used by the OAuth/SDK read path |
| `SHIP_PUBLIC_API_TOKEN` | no | OAuth bearer token for FleetGraph document reads through `@ship/sdk` and `/api/v1` |
| `SHIP_SERVICE_ACCOUNT_KEY` | yes (prod) | Long-lived agent API key |
| `AGENT_SHARED_SECRET` | yes (prod) | Shared service secret; validates browser-to-agent proxy calls and agent-to-Ship finding writes |
| `DATABASE_URL` | yes (prod) | Postgres for PostgresSaver checkpoints |
| `FLEETGRAPH_POLLER_ENABLED` | no (default `false`) | Enables the proactive polling loop when set to `true` |
| `FLEETGRAPH_TARGET_WORKSPACE_ID` | yes (prod poller) | Workspace UUID monitored by proactive scans |
| `PORT` | no (default `4000`) | HTTP server port |

Ship API also uses `FLEETGRAPH_AGENT_URL`, `FLEETGRAPH_AGENT_SHARED_SECRET`,
and optional `FLEETGRAPH_AGENT_TIMEOUT_MS` (default `25000`) for the browser
proxy to this service.

**Never commit env files** with real values. Set vars in your shell or via
Render's encrypted env var UI.

When `SHIP_PUBLIC_API_TOKEN` is set, FleetGraph reads documents through
`@ship/sdk` against `/api/v1`, so those reads produce the same OAuth app audit
rows, scope checks, and rate-limit behavior as an external integration.
Association reads and finding writes still use the service-account path until
those surfaces are promoted into the public API.

## Quick start

```bash
# From repo root after pnpm install picks up the new workspace
pnpm install

# Hello-world graph — proves LangGraph + LangSmith plumbing
export ANTHROPIC_API_KEY=sk-ant-...
export LANGSMITH_API_KEY=lsv2_pt_...
pnpm --filter @ship/agent hello-world

# Start the HTTP service locally
pnpm --filter @ship/agent dev
curl http://localhost:4000/health
```

## File layout

```
agent/
├── package.json           — @ship/agent workspace
├── tsconfig.json          — extends repo-root tsconfig
├── README.md              — this file
└── src/
    ├── index.ts           — HTTP server + proactive poller entry
    ├── config.ts          — env var contract + side-effect LangSmith init
    ├── state.ts           — FleetGraphState Annotation.Root
    ├── nodes/             — one file per graph node (added in MVP build)
    ├── ship-client.ts     — Ship REST API client (added in MVP build)
    └── scripts/
        └── hello-world.ts — sanity-check graph + LangSmith trace
```
