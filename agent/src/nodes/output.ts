/**
 * output — terminal node, formats the final response for the caller.
 *
 * Two output shapes depending on mode:
 *   - on_demand: chat response with citations (returned synchronously to the HTTP handler)
 *   - proactive: notification record (persisted; eventually pushed to Ship's notification rail)
 *
 * Dismiss/snooze decisions return quiet outputs in the MVP. Durable
 * suppression tables are a v2 hardening path with PostgresSaver.
 */

import { createFleetGraphFinding } from '../ship-client.js';
import type { FleetGraphStateType } from '../state.js';

export async function output(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
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

  if (context.mode === 'proactive' && reasoning && reasoning.confidence !== 'low') {
    const title = titleFromAnswer(reasoning.answer);
    try {
      await createFleetGraphFinding({
        scopeType: context.scopeType,
        scopeId: context.scopeId,
        findingHash: reasoning.findingHash,
        title,
        body: bodyFromAnswer(reasoning.answer, title),
        confidence: reasoning.confidence,
        citations,
        suggestedActions: reasoning.suggestedActions.map((action) => ({ ...action })),
      });
    } catch (err) {
      // Persistence failure should not break the graph run or LangSmith trace.
      console.error('[fleetgraph/output] failed to persist finding:', (err as Error).message);
    }
  }

  return {
    output: {
      kind: context.mode === 'on_demand' ? 'chat' : 'notification',
      text,
      citations,
    },
  };
}

function titleFromAnswer(answer: string): string {
  const firstLine = answer.split(/\r?\n/).find((line) => line.trim()) ?? 'FleetGraph finding';
  const cleaned = firstLine
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^\*(.*?)\*$/, '$1')
    .replace(/`/g, '')
    .trim();

  return (cleaned || 'FleetGraph finding').slice(0, 160);
}

function bodyFromAnswer(answer: string, title: string): string {
  const lines = answer.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim());

  if (firstContentIndex === -1) {
    return answer;
  }

  const firstContentLine = lines[firstContentIndex] ?? '';

  if (titleFromAnswer(firstContentLine) !== title) {
    return answer;
  }

  const remaining = lines.slice(firstContentIndex + 1).join('\n').trim();
  return remaining || answer;
}
