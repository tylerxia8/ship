/**
 * Runtime configuration for the FleetGraph agent.
 *
 * All secrets and environment-specific settings come from env vars.
 * Never hardcode credentials. See FLEETGRAPH.md § Architecture Decisions
 * for the env-var contract.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `See agent/README.md § Environment for the full list.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  // Anthropic — for the reasoner + intent classifier LLM calls
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
  },

  // LangSmith — auto-detected by langsmith npm package when these are set
  langsmith: {
    apiKey: required('LANGSMITH_API_KEY'),
    project: optional('LANGSMITH_PROJECT', 'fleetgraph-dev'),
    tracing: optional('LANGSMITH_TRACING', 'true') === 'true',
    endpoint: optional('LANGSMITH_ENDPOINT', 'https://api.smith.langchain.com'),
  },

  // Ship — agent reads the document graph via Ship's REST API,
  // authenticated as a service-account user (users.is_service_account=true,
  // see migration 0NN_service_account.sql). For dev, point at local API.
  ship: {
    apiBaseUrl: optional('SHIP_API_BASE_URL', 'http://localhost:3000'),
    serviceAccountKey: optional('SHIP_SERVICE_ACCOUNT_KEY', ''),
    agentSharedSecret: optional('AGENT_SHARED_SECRET', ''),
  },

  // Postgres — same Neon DB Ship uses, separate fleetgraph_* schema.
  // Used by LangGraph's PostgresSaver for checkpoint + HITL pause/resume.
  postgres: {
    databaseUrl: optional('DATABASE_URL', ''),
  },

  // Models — pinned versions per FLEETGRAPH.md § Cost Analysis
  models: {
    intentClassifier: 'claude-haiku-4-5-20251001',
    reasoner: 'claude-sonnet-4-6',
  },

  // Proactive trigger — see FLEETGRAPH.md § Trigger Model
  scheduler: {
    pollIntervalMs: 60_000, // check every 60s for sprints needing a run
    perScopeCooldownMs: 4 * 60_000, // 4 min minimum between runs per sprint
  },
} as const;

// Side effect: ensure LangSmith env vars are propagated to the langsmith
// npm package's auto-detection. The package reads LANGCHAIN_* OR LANGSMITH_*;
// we standardize on LANGSMITH_* but set LANGCHAIN_* as a compat alias so the
// older SDK code paths also pick it up.
if (config.langsmith.tracing) {
  process.env.LANGCHAIN_TRACING_V2 = 'true';
  process.env.LANGCHAIN_API_KEY = config.langsmith.apiKey;
  process.env.LANGCHAIN_PROJECT = config.langsmith.project;
  process.env.LANGCHAIN_ENDPOINT = config.langsmith.endpoint;
}
