/**
 * action_decision — deterministic, no LLM. Classifies the reasoner's
 * suggested actions as read-only or mutating, sets needsHumanApproval.
 *
 * Rules:
 *   - notify_user with targetUserId === requester  → no gate (user invited it)
 *   - notify_user with targetUserId !== requester  → gate
 *   - any other action type (change_state, reassign, comment, descope) → gate
 *
 * If reasoning.suggestedActions is empty, no gate needed (pure read-only chat).
 */

import type { FleetGraphStateType, SuggestedAction } from '../state.js';

export function actionDecision(state: FleetGraphStateType): Partial<FleetGraphStateType> {
  const actions = state.reasoning?.suggestedActions ?? [];
  const requesterId = state.context.userId;

  const needsApproval = actions.some((a) => requiresApproval(a, requesterId));

  return {
    pendingActions: actions,
    needsHumanApproval: needsApproval,
  };
}

function requiresApproval(action: SuggestedAction, requesterId: string | null): boolean {
  // notify_user pointed at the requester themselves — no gate
  if (action.type === 'notify_user' && action.targetUserId && action.targetUserId === requesterId) {
    return false;
  }
  // Everything else (including notify_user without targetUserId, or to a
  // different user, plus all mutations) needs human approval.
  return true;
}
