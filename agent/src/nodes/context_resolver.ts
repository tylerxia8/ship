/**
 * context_resolver — entry node, deterministic, no LLM.
 *
 * Takes the inbound trigger metadata and normalizes it into the typed
 * Context object the rest of the graph expects. For proactive runs the
 * scope comes from the poller; for on-demand runs it comes from Ship's
 * frontend (which view the user has open).
 *
 * Side effect: this is the only node that mutates the `context` field of
 * state. All downstream nodes treat context as read-only.
 *
 * See FLEETGRAPH.md § Graph Diagram for the node's role in the topology.
 */

import type { Context, FleetGraphStateType } from '../state.js';

/**
 * The entry payload coming in from a trigger. We accept a partial Context
 * (the trigger provides what it has) and fill in defaults / validate here.
 */
export interface TriggerInput {
  context: Partial<Context> & Pick<Context, 'scopeType' | 'scopeId' | 'workspaceId' | 'mode'>;
}

export function contextResolver(state: FleetGraphStateType): Partial<FleetGraphStateType> {
  const incoming = state.context as Partial<Context> | undefined;

  if (!incoming) {
    throw new Error(
      'context_resolver: state.context is undefined — graph must be invoked with at least { context: { scopeType, scopeId, workspaceId, mode } }',
    );
  }

  if (!incoming.scopeType || !incoming.scopeId || !incoming.workspaceId || !incoming.mode) {
    throw new Error(
      `context_resolver: missing required context fields. Got: ${JSON.stringify({
        scopeType: incoming.scopeType,
        scopeId: incoming.scopeId,
        workspaceId: incoming.workspaceId,
        mode: incoming.mode,
      })}`,
    );
  }

  const normalized: Context = {
    scopeType: incoming.scopeType,
    scopeId: incoming.scopeId,
    workspaceId: incoming.workspaceId,
    mode: incoming.mode,
    userId: incoming.userId ?? null,
    userMessage: incoming.userMessage,
    parentRunId: incoming.parentRunId,
  };

  // Sanity checks
  if (normalized.mode === 'on_demand' && !normalized.userId) {
    throw new Error('context_resolver: on_demand mode requires userId (requester)');
  }
  if (normalized.mode === 'on_demand' && !normalized.userMessage && !normalized.parentRunId) {
    // Empty on-demand without user message is allowed (summary mode) but
    // worth flagging so the intent_classifier knows.
    // (No error, just leave it.)
  }

  return { context: normalized };
}
