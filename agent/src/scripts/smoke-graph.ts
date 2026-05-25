/**
 * Smoke test: run the full FleetGraph graph end-to-end against a real
 * seeded Ship document. This is the canary that proves all 6 nodes work
 * with real auth + real data + real LLM + real tracing.
 *
 * Two scenarios, producing two distinct LangSmith traces with visibly
 * different conditional-edge paths:
 *
 *   1. On-demand chat about a real issue ("is this blocking anything?")
 *      → blocker_check intent → fetch_doc + fetch_assocs → reasoner → output
 *
 *   2. Proactive scan of a sprint (no user message)
 *      → proactive_scan intent → fetch_doc + fetch_assocs → reasoner →
 *      (possibly human_gate if reasoner proposes a mutation) → output
 *
 * Run:
 *   ANTHROPIC_API_KEY=... LANGSMITH_API_KEY=... \
 *   SHIP_SERVICE_ACCOUNT_KEY=... SMOKE_ISSUE_ID=... SMOKE_SPRINT_ID=... \
 *     pnpm --filter @ship/agent exec tsx src/scripts/smoke-graph.ts
 */

import { Command } from '@langchain/langgraph';
import { Client } from 'langsmith';
import { fleetGraph } from '../graph.js';
import { config } from '../config.js';
import type { Context } from '../state.js';

interface Scenario {
  label: string;
  context: Context;
}

async function runScenario(scenario: Scenario, threadId: string): Promise<void> {
  console.log(`▶ ${scenario.label}`);
  console.log(`  scope: ${scenario.context.scopeType}/${scenario.context.scopeId}`);
  console.log(`  mode: ${scenario.context.mode}`);
  if (scenario.context.userMessage) {
    console.log(`  msg: "${scenario.context.userMessage}"`);
  }
  console.log('');

  const runConfig = { configurable: { thread_id: threadId } };
  const start = Date.now();

  let result = await fleetGraph.invoke({ context: scenario.context }, runConfig);

  // If the graph interrupted at human_gate, simulate the user approving.
  // Real implementation: HTTP /agent/resume endpoint posts the decision.
  // For the smoke test, auto-approve so we see the full flow including
  // executor/output paths.
  let state = await fleetGraph.getState(runConfig);
  if (state.tasks.some((t) => t.interrupts && t.interrupts.length > 0)) {
    const interrupt = state.tasks[0]?.interrupts?.[0];
    console.log('  ⏸  graph interrupted at human_gate');
    console.log(`     proposal: ${JSON.stringify(interrupt?.value, null, 2).slice(0, 300)}...`);
    console.log('     auto-approving (smoke-test only — real flow waits for user)');
    result = await fleetGraph.invoke(new Command({ resume: 'approved' }), runConfig);
  }

  const elapsed = Date.now() - start;
  console.log('');
  console.log(`  → intent: ${result.intent?.kind} (${result.intent?.confidence})`);
  console.log(`  → docs fetched: ${result.fetchedData.documents?.length ?? 0}`);
  console.log(`  → assocs fetched: ${result.fetchedData.associations?.length ?? 0}`);
  console.log(`  → reasoner confidence: ${result.reasoning?.confidence ?? '(none)'}`);
  console.log(`  → needs human approval: ${result.needsHumanApproval}`);
  console.log(`  → pending actions: ${result.pendingActions?.length ?? 0}`);
  console.log(`  → human decision: ${result.humanDecision ?? '(n/a)'}`);
  console.log(`  → output (${result.output?.kind}): ${(result.output?.text ?? '').slice(0, 200)}${(result.output?.text ?? '').length > 200 ? '...' : ''}`);
  console.log(`  → citations: ${(result.output?.citations ?? []).slice(0, 5).join(', ')}`);
  console.log(`  → elapsed: ${elapsed}ms`);
  console.log('');
}

async function main(): Promise<void> {
  const workspaceId = process.env.SMOKE_WORKSPACE_ID;
  const issueId = process.env.SMOKE_ISSUE_ID;
  const sprintId = process.env.SMOKE_SPRINT_ID;

  if (!workspaceId || !issueId || !sprintId) {
    console.error('Required env: SMOKE_WORKSPACE_ID, SMOKE_ISSUE_ID, SMOKE_SPRINT_ID');
    process.exit(1);
  }

  console.log(`[smoke-graph] config:`);
  console.log(`  ship api: ${config.ship.apiBaseUrl}`);
  console.log(`  langsmith project: ${config.langsmith.project}`);
  console.log(`  reasoner model: ${config.models.reasoner}`);
  console.log('');

  const scenarios: Scenario[] = [
    {
      label: 'on-demand: blocker question on real issue',
      context: {
        scopeType: 'issue',
        scopeId: issueId,
        workspaceId,
        userId: 'smoke-test-user-id',
        mode: 'on_demand',
        userMessage: 'Is this issue blocking anything else? Should I prioritize it?',
      },
    },
    {
      label: 'proactive scan on real sprint',
      context: {
        scopeType: 'sprint',
        scopeId: sprintId,
        workspaceId,
        userId: null,
        mode: 'proactive',
      },
    },
  ];

  for (let i = 0; i < scenarios.length; i++) {
    await runScenario(scenarios[i]!, `smoke-${i}-${Date.now()}`);
  }

  console.log('[smoke-graph] flushing LangSmith trace queue...');
  const client = new Client({
    apiKey: config.langsmith.apiKey,
    apiUrl: config.langsmith.endpoint,
  });
  await client.awaitPendingTraceBatches();
  console.log('[smoke-graph] flush complete.');
  console.log('');
  console.log('[smoke-graph] ✅ full graph end-to-end passed');
  console.log(`  Check traces at: https://smith.langchain.com → project "${config.langsmith.project}"`);
}

main().catch((err) => {
  console.error('[smoke-graph] FAILED:', err);
  process.exit(1);
});
