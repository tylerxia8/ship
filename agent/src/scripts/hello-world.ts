/**
 * Hello-world LangGraph that proves the plumbing works end-to-end:
 *
 *   1. LangGraph.js installed and importable
 *   2. State annotation compiles + runs
 *   3. Conditional edge produces visibly different traces
 *   4. LangSmith picks up the trace from env vars
 *
 * Two scenarios run by this script, on the same graph, producing two
 * distinct traces in LangSmith — satisfies the PRD's MVP requirement
 * of "at least two shared trace links submitted showing different
 * execution paths." Once this works locally, we can wire real Ship
 * data into the graph nodes without changing the structure.
 *
 * Run:
 *   $ANTHROPIC_API_KEY=... LANGSMITH_API_KEY=... pnpm --filter @ship/agent hello-world
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { config } from '../config.js';

// ─── State ─────────────────────────────────────────────────────────────────

const HelloState = Annotation.Root({
  input: Annotation<string>(),
  intent: Annotation<'greet' | 'count' | 'unknown'>({
    reducer: (_p, n) => n,
    default: () => 'unknown',
  }),
  result: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '',
  }),
});

// ─── Nodes ─────────────────────────────────────────────────────────────────

function classify(state: typeof HelloState.State): Partial<typeof HelloState.State> {
  const lower = state.input.toLowerCase();
  if (lower.includes('hello') || lower.includes('hi')) return { intent: 'greet' };
  if (/\d/.test(lower) || lower.includes('count')) return { intent: 'count' };
  return { intent: 'unknown' };
}

function handleGreet(state: typeof HelloState.State): Partial<typeof HelloState.State> {
  return { result: `Greeting received: "${state.input}". The graph is alive.` };
}

function handleCount(state: typeof HelloState.State): Partial<typeof HelloState.State> {
  const digits = state.input.match(/\d+/g) ?? [];
  const sum = digits.reduce((acc, d) => acc + parseInt(d, 10), 0);
  return { result: `Counted ${digits.length} number(s) summing to ${sum}.` };
}

function handleUnknown(state: typeof HelloState.State): Partial<typeof HelloState.State> {
  return { result: `Unhandled input: "${state.input}". This is the fallback branch.` };
}

// ─── Routing ───────────────────────────────────────────────────────────────

function routeFromIntent(state: typeof HelloState.State): 'greet' | 'count' | 'unknown' {
  return state.intent;
}

// ─── Build graph ───────────────────────────────────────────────────────────

const graph = new StateGraph(HelloState)
  .addNode('classify', classify)
  .addNode('handleGreet', handleGreet)
  .addNode('handleCount', handleCount)
  .addNode('handleUnknown', handleUnknown)
  .addEdge(START, 'classify')
  .addConditionalEdges('classify', routeFromIntent, {
    greet: 'handleGreet',
    count: 'handleCount',
    unknown: 'handleUnknown',
  })
  .addEdge('handleGreet', END)
  .addEdge('handleCount', END)
  .addEdge('handleUnknown', END)
  .compile();

// ─── Run two scenarios so we get two distinct traces ────────────────────────

async function main(): Promise<void> {
  console.log('[hello-world] config check:');
  console.log(`  LANGSMITH_TRACING: ${config.langsmith.tracing}`);
  console.log(`  LANGSMITH_PROJECT: ${config.langsmith.project}`);
  console.log(`  LANGSMITH_ENDPOINT: ${config.langsmith.endpoint}`);
  console.log('');

  const scenarios = [
    { label: 'greet path', input: 'Hello, FleetGraph!' },
    { label: 'count path', input: 'I see 3 issues and 5 sprints' },
    { label: 'unknown path', input: 'Random text with no signal' },
  ];

  for (const scenario of scenarios) {
    console.log(`▶ Scenario: ${scenario.label}`);
    console.log(`  Input: "${scenario.input}"`);
    const finalState = await graph.invoke({ input: scenario.input });
    console.log(`  Intent: ${finalState.intent}`);
    console.log(`  Result: ${finalState.result}`);
    console.log('');
  }

  console.log('[hello-world] done. Check LangSmith for the traces:');
  console.log(`  https://smith.langchain.com/o/-/projects/p/${config.langsmith.project}`);
}

main().catch((err) => {
  console.error('[hello-world] FAILED:', err);
  process.exit(1);
});
