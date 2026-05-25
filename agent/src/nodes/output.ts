/**
 * output — terminal node, formats the final response for the caller.
 *
 * Two output shapes depending on mode:
 *   - on_demand: chat response with citations (returned synchronously to the HTTP handler)
 *   - proactive: notification record (persisted; eventually pushed to Ship's notification rail)
 *
 * Also where dismissal/snooze decisions get logged so future runs can
 * suppress repeated findings (full suppression cache wired in once
 * PostgresSaver is in place).
 */

import type { FleetGraphStateType } from '../state.js';

export function output(state: FleetGraphStateType): Partial<FleetGraphStateType> {
  const { context, reasoning, humanDecision } = state;

  // Dismissed/snoozed paths produce a quiet output — nothing surfaces to
  // the user (the suppression is the value).
  if (humanDecision === 'dismissed') {
    return {
      output: {
        kind: 'notification',
        text: '[dismissed] finding suppressed by user',
        citations: [],
      },
    };
  }

  if (humanDecision === 'snoozed') {
    return {
      output: {
        kind: 'notification',
        text: '[snoozed] finding paused, will re-evaluate after snooze window',
        citations: [],
      },
    };
  }

  const text = reasoning?.answer ?? '(no answer produced)';
  const citations = reasoning?.citations ?? [];

  return {
    output: {
      kind: context.mode === 'on_demand' ? 'chat' : 'notification',
      text,
      citations,
    },
  };
}
