/**
 * Verify LangSmith traces uploaded by directly querying the LangSmith API.
 * Independent of UI access; useful to confirm the flush worked end-to-end.
 *
 * Run after hello-world to confirm traces are visible to the API:
 *   LANGSMITH_API_KEY=... pnpm --filter @ship/agent tsx src/scripts/verify-traces.ts
 */

import { Client } from 'langsmith';
import { config } from '../config.js';

async function main(): Promise<void> {
  const client = new Client({
    apiKey: config.langsmith.apiKey,
    apiUrl: config.langsmith.endpoint,
  });

  console.log(`[verify-traces] querying LangSmith for project "${config.langsmith.project}"...`);
  console.log('');

  // List recent runs in the project, last 30 minutes
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const runs: Array<{ id: string; name: string; status: string; start_time?: string }> = [];

  try {
    for await (const run of client.listRuns({
      projectName: config.langsmith.project,
      executionOrder: 1, // top-level (graph) runs, not nested
      startTime: cutoff,
    })) {
      runs.push({
        id: run.id,
        name: run.name ?? '(no name)',
        status: run.status ?? '(no status)',
        start_time: run.start_time?.toString(),
      });
    }
  } catch (err) {
    console.error('[verify-traces] FAILED to list runs:', err);
    process.exit(1);
  }

  console.log(`Found ${runs.length} top-level run(s) in the last 30 minutes:`);
  console.log('');

  for (const run of runs.slice(0, 10)) {
    console.log(`  ▶ ${run.name}`);
    console.log(`    id:     ${run.id}`);
    console.log(`    status: ${run.status}`);
    console.log(`    start:  ${run.start_time ?? '(none)'}`);
    console.log(`    link:   https://smith.langchain.com/o/-/projects/p/${config.langsmith.project}/r/${run.id}`);
    console.log('');
  }

  if (runs.length === 0) {
    console.log('No runs found. Either:');
    console.log('  - Project name does not match (current: ' + config.langsmith.project + ')');
    console.log('  - Traces did not upload (try re-running hello-world)');
    console.log('  - LANGSMITH_API_KEY belongs to a different workspace than the project');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[verify-traces] error:', err);
  process.exit(1);
});
