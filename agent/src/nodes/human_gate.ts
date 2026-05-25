/**
 * human_gate — pauses the graph at an INTERRUPT until a human responds.
 *
 * Uses LangGraph's interrupt() primitive — the graph state is persisted to
 * the checkpointer (MemorySaver for now, PostgresSaver for cross-process
 * survival later) and the graph waits. The HTTP /agent/resume endpoint
 * unblocks it with the user's decision (approve / dismiss / snooze).
 *
 * For MVP this gate is the PRD-required "at least one human-in-the-loop
 * gate implemented." Real Postgres-backed persistence + UI plumbing comes
 * in the subsequent commits.
 */

import { interrupt } from '@langchain/langgraph';
import type { FleetGraphStateType, HumanDecision } from '../state.js';

export interface HumanApprovalRequest {
  kind: 'approval_request';
  scopeType: string;
  scopeId: string;
  findingAnswer: string;
  findingHash: string;
  actions: FleetGraphStateType['pendingActions'];
}

export function humanGate(state: FleetGraphStateType): Partial<FleetGraphStateType> {
  // The interrupt() call throws a GraphInterrupt; the graph runtime catches
  // it, persists state, and pauses. Resume by re-invoking with a Command.
  const request: HumanApprovalRequest = {
    kind: 'approval_request',
    scopeType: state.context.scopeType,
    scopeId: state.context.scopeId,
    findingAnswer: state.reasoning?.answer ?? '(no answer)',
    findingHash: state.reasoning?.findingHash ?? '(no hash)',
    actions: state.pendingActions,
  };

  // The value passed to interrupt() becomes the structured payload visible
  // to whoever resumes the graph. The resume call provides the human's
  // decision, which becomes the return value here.
  const decision = interrupt<HumanApprovalRequest, HumanDecision>(request);

  return { humanDecision: decision };
}
