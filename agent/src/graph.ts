/**
 * The FleetGraph graph — proactive + on-demand modes through the same
 * topology. This file is the canonical wiring; nodes live in src/nodes/.
 *
 * Current shape (will grow as we add fetch + reasoner + HITL nodes):
 *
 *   START → context_resolver → intent_classifier → END
 *
 * Subsequent commits add:
 *   - parallel fetch nodes (fetch_doc, fetch_assocs, fetch_load, fetch_activity)
 *   - reasoner (Sonnet) with conditional fetch routing
 *   - action_decision (deterministic) with HITL conditional
 *   - human_gate (interrupt)
 *   - executor + output
 *
 * See FLEETGRAPH.md § Graph Diagram for the full target topology.
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { FleetGraphState } from './state.js';
import { contextResolver, intentClassifier } from './nodes/index.js';

export const fleetGraph = new StateGraph(FleetGraphState)
  .addNode('context_resolver', contextResolver)
  .addNode('intent_classifier', intentClassifier)
  .addEdge(START, 'context_resolver')
  .addEdge('context_resolver', 'intent_classifier')
  .addEdge('intent_classifier', END)
  .compile();
