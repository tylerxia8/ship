/**
 * List recent traces in the fleetgraph-dev LangSmith project, picking two
 * with visibly different graph shapes (one with human_gate span, one
 * without). Prints clickable URLs + the Share button instructions.
 *
 * Use this to satisfy the PRD's "at least two shared trace links" without
 * having to scroll through the LangSmith UI.
 */

import { Client } from 'langsmith';
import { config } from '../config.js';

async function main(): Promise<void> {
  const client = new Client({
    apiKey: config.langsmith.apiKey,
    apiUrl: config.langsmith.endpoint,
  });

  console.log(`[list-trace-candidates] querying project: ${config.langsmith.project}`);
  console.log('');

  // Pull recent top-level runs (LangGraph wraps each graph invocation in a
  // single top-level run). executionOrder=1 keeps us at the outermost layer.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const runs: Array<{
    id: string;
    start: string;
    status: string;
    childCount: number;
    hasHumanGate: boolean;
  }> = [];

  for await (const run of client.listRuns({
    projectName: config.langsmith.project,
    executionOrder: 1,
    startTime: cutoff,
  })) {
    // To detect human_gate, walk the child runs by querying for runs whose
    // trace_id matches this run.id. Simpler and more accurate than guessing
    // from the top-level run's metadata.
    let hasHumanGate = false;
    let childCount = 0;
    for await (const child of client.listRuns({ traceId: run.id })) {
      childCount++;
      if (child.name === 'human_gate') hasHumanGate = true;
      if (childCount > 50) break; // safety cap
    }

    runs.push({
      id: run.id,
      start: run.start_time?.toString() ?? '',
      status: run.status ?? '',
      childCount,
      hasHumanGate,
    });
  }

  // Group by shape
  const withGate = runs.filter((r) => r.hasHumanGate);
  const withoutGate = runs.filter((r) => !r.hasHumanGate);

  console.log(`Found ${runs.length} total runs in the last 24 hours:`);
  console.log(`  - ${withGate.length} with human_gate span (HITL engaged)`);
  console.log(`  - ${withoutGate.length} without human_gate (read-only path)`);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PICK ONE FROM EACH GROUP — these have visibly different shapes');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const showRun = (r: typeof runs[number], label: string): void => {
    console.log(`▶ ${label}`);
    console.log(`  id:    ${r.id}`);
    console.log(`  child spans: ${r.childCount} (has human_gate=${r.hasHumanGate})`);
    console.log(`  start: ${r.start}`);
    console.log(`  link:  https://smith.langchain.com → fleetgraph-dev → run ${r.id}`);
    console.log('');
  };

  if (withoutGate.length > 0) {
    showRun(withoutGate[0]!, 'Trace 1 (read-only path, no human_gate)');
  } else {
    console.log('  No "no human_gate" runs in fleetgraph-dev. Need to fire one.');
  }

  if (withGate.length > 0) {
    showRun(withGate[0]!, 'Trace 2 (HITL path, with human_gate)');
  } else {
    console.log('  No "with human_gate" runs in fleetgraph-dev. Need to fire one.');
  }

  console.log('How to share each:');
  console.log('  1. Open https://smith.langchain.com → log in to the workspace');
  console.log('  2. Left sidebar → "Tracing Projects" → click "fleetgraph-dev"');
  console.log('  3. Find the run by id (above). Click into it.');
  console.log('  4. Top-right "Share" button → "Create public link" → copy URL');
}

main().catch((err) => {
  console.error('[list-trace-candidates] FAILED:', err);
  process.exit(1);
});
