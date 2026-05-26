/**
 * intent_classifier — Haiku 4.5 call, structured output via tool-call mode.
 *
 * Takes the normalized context + (for on-demand) user message and emits
 * a typed Intent telling the rest of the graph:
 *   - what kind of reasoning the user is asking for
 *   - which downstream fetch nodes need to activate
 *   - how confident the classification is
 *
 * For proactive runs (mode='proactive'), the intent is always 'proactive_scan'
 * but the classifier still picks the relevant fetches based on the scope.
 *
 * Output is constrained with `withStructuredOutput()` — the model is forced
 * to emit a JSON object matching the IntentSchema. This is more reliable
 * than free-form generation + post-hoc parsing.
 *
 * See FLEETGRAPH.md § Graph Diagram for how the intent fans out to fetches.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import { config } from '../config.js';
import type { FleetGraphStateType, Intent, IntentKind } from '../state.js';

// Zod schema enforced via tool-call structured output. Each field maps
// directly to a property on the Intent type in state.ts.
const IntentSchema = z.object({
  kind: z
    .enum([
      'blocker_check',
      'load_check',
      'slip_check',
      'diff_query',
      'cross_program',
      'general_qa',
      'proactive_scan',
    ])
    .describe(
      'The kind of reasoning the user is asking for, or "proactive_scan" if running without a user message',
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'How confident the classification is. "high" when the user message contains explicit keywords; "low" when ambiguous.',
    ),
  requiredFetches: z
    .array(z.enum(['doc', 'assocs', 'load', 'activity', 'history']))
    .describe('Which fetch nodes should run next. At minimum, always include "doc".'),
});

const SYSTEM_PROMPT = `You are the intent classifier for FleetGraph, a project intelligence agent for Ship (a project management tool).

Your job: classify the user's question (or for proactive runs, the scope) into one of the kinds below, and select which fetch nodes downstream need to run.

Intent kinds:
- blocker_check: user asks about what blocks/is blocked. Needs: doc, assocs
- load_check: user asks who's overloaded or about capacity. Needs: doc, load
- slip_check: user asks what's slipping, behind schedule. Needs: doc, assocs, activity
- diff_query: user asks what changed since some point. Needs: doc, history
- cross_program: user asks across multiple programs. Needs: doc, assocs, load
- general_qa: general question about the document. Needs: doc
- proactive_scan: no user message, scanning for issues to surface. Needs: doc, assocs, load, activity

Always include "doc" in requiredFetches. Be conservative with "high" confidence — only when the user explicitly uses keywords matching the intent.`;

let _model: ChatAnthropic | null = null;
function getModel(): ChatAnthropic {
  if (!_model) {
    _model = new ChatAnthropic({
      model: config.models.intentClassifier,
      temperature: 0,
      maxTokens: 200,
      apiKey: config.anthropic.apiKey,
    });
  }
  return _model;
}

export async function intentClassifier(
  state: FleetGraphStateType,
): Promise<Partial<FleetGraphStateType>> {
  const { context } = state;

  // Proactive mode — fast path, no LLM call, deterministic.
  if (context.mode === 'proactive') {
    const intent: Intent = {
      kind: 'proactive_scan',
      confidence: 'high',
      requiredFetches: ['doc', 'assocs', 'load', 'activity'],
    };
    return { intent };
  }

  // On-demand mode — real LLM call with structured output.
  const userMessage = context.userMessage ?? '(no message — summarize this scope)';

  const model = getModel().withStructuredOutput(IntentSchema, {
    name: 'classify_intent',
  });

  const result = await model.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Scope: ${context.scopeType} (id: ${context.scopeId})\nUser message: ${userMessage}`,
    },
  ]);

  const intent: Intent = {
    kind: result.kind as IntentKind,
    confidence: result.confidence,
    requiredFetches: result.requiredFetches,
  };

  return { intent };
}
