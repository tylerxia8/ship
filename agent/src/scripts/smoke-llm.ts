/**
 * Smoke test: exercise the real FleetGraph graph (so far: context_resolver →
 * intent_classifier) against the real Anthropic API.
 *
 * Each scenario classifies a different user intent — produces distinct
 * structured-output traces in LangSmith that demonstrate the conditional
 * routing the real graph will use.
 *
 * Run:
 *   ANTHROPIC_API_KEY=... LANGSMITH_API_KEY=... \
 *     pnpm --filter @ship/agent exec tsx src/scripts/smoke-llm.ts
 */

import { Client } from 'langsmith';
import { fleetGraph } from '../graph.js';
import { config } from '../config.js';
import type { Context } from '../state.js';

interface Scenario {
  label: string;
  context: Context;
}

const scenarios: Scenario[] = [
  {
    label: 'on-demand: blocker question on an issue',
    context: {
      scopeType: 'issue',
      scopeId: 'fake-issue-id-001',
      workspaceId: 'fake-workspace',
      userId: 'fake-user',
      mode: 'on_demand',
      userMessage: 'Is this issue blocking anything else?',
    },
  },
  {
    label: 'on-demand: load question on workspace',
    context: {
      scopeType: 'workspace',
      scopeId: 'fake-workspace',
      workspaceId: 'fake-workspace',
      userId: 'fake-user',
      mode: 'on_demand',
      userMessage: 'Who is overloaded this week?',
    },
  },
  {
    label: 'on-demand: ambiguous question (test low confidence)',
    context: {
      scopeType: 'sprint',
      scopeId: 'fake-sprint',
      workspaceId: 'fake-workspace',
      userId: 'fake-user',
      mode: 'on_demand',
      userMessage: 'How does this look?',
    },
  },
  {
    label: 'proactive: scan a sprint (no LLM call — fast path)',
    context: {
      scopeType: 'sprint',
      scopeId: 'fake-sprint',
      workspaceId: 'fake-workspace',
      userId: null,
      mode: 'proactive',
    },
  },
];

async function main(): Promise<void> {
  console.log(`[smoke-llm] config:`);
  console.log(`  langsmith project: ${config.langsmith.project}`);
  console.log(`  intent classifier model: ${config.models.intentClassifier}`);
  console.log('');

  for (const scenario of scenarios) {
    console.log(`▶ ${scenario.label}`);
    console.log(`  scope: ${scenario.context.scopeType}/${scenario.context.scopeId}`);
    console.log(`  mode: ${scenario.context.mode}`);
    if (scenario.context.userMessage) {
      console.log(`  msg: "${scenario.context.userMessage}"`);
    }

    const start = Date.now();
    const result = await fleetGraph.invoke({ context: scenario.context });
    const elapsed = Date.now() - start;

    console.log(`  → intent: ${result.intent?.kind} (confidence: ${result.intent?.confidence})`);
    console.log(`  → fetches: [${result.intent?.requiredFetches.join(', ')}]`);
    console.log(`  → elapsed: ${elapsed}ms`);
    console.log('');
  }

  console.log('[smoke-llm] flushing LangSmith trace queue...');
  const client = new Client({
    apiKey: config.langsmith.apiKey,
    apiUrl: config.langsmith.endpoint,
  });
  await client.awaitPendingTraceBatches();
  console.log('[smoke-llm] flush complete.');
  console.log('');
  console.log(`[smoke-llm] visit https://smith.langchain.com and look for project "${config.langsmith.project}"`);
}

main().catch((err) => {
  console.error('[smoke-llm] FAILED:', err);
  process.exit(1);
});
