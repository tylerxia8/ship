/**
 * The full FleetGraph graph — both modes through one topology.
 *
 *   START
 *     └─ context_resolver
 *          └─ intent_classifier
 *               └─ fetch_doc (always)
 *                    └─ fetch_assocs (early-returns when not required by intent)
 *                         └─ reasoner (Sonnet 4.6, structured output)
 *                              └─ action_decision
 *                                   ├─ needsHumanApproval=false → finalize
 *                                   └─ needsHumanApproval=true  → human_gate
 *                                        └─ finalize
 *                                             └─ END
 *
 * Conditional edge at action_decision is the one that produces visibly
 * different LangSmith traces — read-only paths skip human_gate, mutating
 * paths pause at it. (Earlier draft had a second conditional fanning fetches
 * from intent_classifier, but LangGraph 1.x's array-return + destinations-
 * map routing was finicky; replaced with deterministic chain + each fetch
 * node early-returning when intent doesn't require it. Same logical
 * behavior, simpler graph, no flake.)
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

function routeAfterDecision(state: typeof FleetGraphState.State): 'human_gate' | 'finalize' {
  return state.needsHumanApproval ? 'human_gate' : 'finalize';
}

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
  .addEdge('intent_classifier', 'fetch_doc')
  .addEdge('fetch_doc', 'fetch_assocs')
  .addEdge('fetch_assocs', 'reasoner')
  .addEdge('reasoner', 'action_decision')
  .addConditionalEdges('action_decision', routeAfterDecision)
  .addEdge('human_gate', 'finalize')
  .addEdge('finalize', END);

const checkpointer = new MemorySaver();

export const fleetGraph = builder.compile({ checkpointer });
