/**
 * The full FleetGraph graph — both modes through one topology.
 *
 *   START
 *     └─ context_resolver
 *          └─ intent_classifier
 *               └─ (conditional fan-out based on intent.requiredFetches)
 *                    ├─ fetch_doc  (always — every intent needs the primary doc)
 *                    └─ fetch_assocs  (when intent includes 'assocs')
 *                         └─ (both fetches merged into fetchedData via reducer)
 *                              └─ reasoner  (Sonnet 4.6, structured output)
 *                                   └─ action_decision
 *                                        ├─ needsHumanApproval=false → output
 *                                        └─ needsHumanApproval=true  → human_gate
 *                                             └─ output (regardless of decision)
 *                                                  └─ END
 *
 * Conditional edges produce visibly different LangSmith traces per intent
 * (PRD requirement). fetch_load + fetch_activity nodes will be added later;
 * for MVP this 6-node topology covers blocker_check, general_qa, and
 * proactive_scan well enough to demo.
 */

import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { FleetGraphState } from './state.js';
import {
  contextResolver,
  intentClassifier,
  fetchDoc,
  fetchAssocs,
  reasoner,
  actionDecision,
  humanGate,
  output as finalize,
} from './nodes/index.js';

// ─── Conditional routing helpers ──────────────────────────────────────────

// After intent_classifier: fan out to the fetches the intent requires.
// fetch_doc always runs. fetch_assocs only when intent includes 'assocs'.
function routeAfterIntent(state: typeof FleetGraphState.State): string[] {
  const fetches = state.intent?.requiredFetches ?? ['doc'];
  const next: string[] = ['fetch_doc']; // always
  if (fetches.includes('assocs')) next.push('fetch_assocs');
  // fetch_load + fetch_activity hooks added when those nodes ship
  return next;
}

// After action_decision: either gate the action or skip straight to output.
function routeAfterDecision(state: typeof FleetGraphState.State): 'human_gate' | 'finalize' {
  return state.needsHumanApproval ? 'human_gate' : 'finalize';
}

// ─── Build the graph ──────────────────────────────────────────────────────

const builder = new StateGraph(FleetGraphState)
  .addNode('context_resolver', contextResolver)
  .addNode('intent_classifier', intentClassifier)
  .addNode('fetch_doc', fetchDoc)
  .addNode('fetch_assocs', fetchAssocs)
  .addNode('reasoner', reasoner)
  .addNode('action_decision', actionDecision)
  .addNode('human_gate', humanGate)
  .addNode('finalize', finalize)
  .addEdge(START, 'context_resolver')
  .addEdge('context_resolver', 'intent_classifier')
  .addConditionalEdges('intent_classifier', routeAfterIntent, {
    fetch_doc: 'fetch_doc',
    fetch_assocs: 'fetch_assocs',
  })
  // Both fetch nodes converge into reasoner. LangGraph waits for all
  // parallel fan-out branches before running the next node.
  .addEdge('fetch_doc', 'reasoner')
  .addEdge('fetch_assocs', 'reasoner')
  .addEdge('reasoner', 'action_decision')
  .addConditionalEdges('action_decision', routeAfterDecision, {
    human_gate: 'human_gate',
    output: 'finalize',
  })
  .addEdge('human_gate', 'finalize')
  .addEdge('finalize', END);

// In-memory checkpointer for now — survives within a process so human_gate
// interrupts can be resumed. PostgresSaver swaps in when we wire DB-backed
// cross-restart persistence for production.
const checkpointer = new MemorySaver();

export const fleetGraph = builder.compile({ checkpointer });
