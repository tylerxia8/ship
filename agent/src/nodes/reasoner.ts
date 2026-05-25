/**
 * reasoner — Sonnet 4.6 with structured output.
 *
 * Takes the fetched data + context and produces a typed ReasonerOutput:
 *   - answer: human-readable summary (the thing shown to the user)
 *   - citations: doc IDs referenced
 *   - findingHash: deterministic SHA-256 hash for dedup
 *   - confidence: high/medium/low
 *   - suggestedActions: zero or more actions (read-only or mutating)
 *
 * The reasoner has no tools in v1 (no `expand_doc` follow-up traversal yet).
 * It works with whatever the parallel fetch nodes provided. Future versions
 * will let the model request additional fetches via tool calls.
 *
 * Output is constrained by Zod schema. See FLEETGRAPH.md § Graph Diagram.
 */

import crypto from 'node:crypto';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import { config } from '../config.js';
import type { FleetGraphStateType, ReasonerOutput } from '../state.js';

const SuggestedActionSchema = z.object({
  type: z.enum(['notify_user', 'change_state', 'reassign', 'comment', 'descope']),
  description: z.string().describe('Human-readable verb-object sentence for the action.'),
  payload: z.record(z.unknown()).describe('Tool-input shape for the executor. Free-form object.'),
  targetUserId: z.string().optional().describe('User to notify, if applicable.'),
});

const ReasonerSchema = z.object({
  answer: z
    .string()
    .describe(
      'Human-readable response to the user, or for proactive runs, a one-paragraph finding describing what is worth surfacing. Cite document titles when referenced.',
    ),
  citations: z
    .array(z.string())
    .describe('Document IDs referenced in the answer. Subset of the IDs in the fetched data.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'How confident the reasoning is. "high" when the answer is directly supported by fetched data; "low" when inferred or speculative.',
    ),
  suggestedActions: z
    .array(SuggestedActionSchema)
    .describe(
      'Zero or more actions the user could take. Use [] when nothing actionable. Each action will be gated by the human if it mutates Ship state or notifies a non-requester.',
    ),
});

const SYSTEM_PROMPT = `You are the reasoner for FleetGraph, a project intelligence agent for Ship (a project management tool with a unified document model: programs, projects, issues, sprints, weekly plans/retros, people, and wiki docs all live in one documents table).

Your job:
- For on-demand runs, answer the user's question grounded in the fetched data.
- For proactive runs, identify what's worth surfacing about the scope. If nothing is, say so with confidence='low' and an empty suggestedActions array — the agent is designed to fail toward silence.

Always cite the documents you reference (by id, in the citations array). Be specific about what you observed (issue counts, dates, names). Prefer concrete numbers over hand-waving.

For suggestedActions, only propose actions that are clearly supported by the data. Actions that mutate Ship (change_state, reassign, comment, descope) will be human-gated; you don't need to be timid about proposing them, but they should be specific and actionable.`;

let _model: ChatAnthropic | null = null;
function getModel(): ChatAnthropic {
  if (!_model) {
    _model = new ChatAnthropic({
      model: config.models.reasoner,
      temperature: 0.2,
      maxTokens: 1200,
      apiKey: config.anthropic.apiKey,
    });
  }
  return _model;
}

function hashFinding(scopeId: string, answer: string): string {
  // Deterministic — same scope + same answer text → same hash, used for
  // the suppression cache so we don't re-notify about the same condition.
  return crypto.createHash('sha256').update(`${scopeId}::${answer}`).digest('hex').slice(0, 16);
}

export async function reasoner(
  state: FleetGraphStateType,
): Promise<Partial<FleetGraphStateType>> {
  const { context, intent, fetchedData } = state;

  const model = getModel().withStructuredOutput(ReasonerSchema, { name: 'reason' });

  const userPrompt = buildPrompt(context, intent, fetchedData);

  const result = await model.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);

  const reasoning: ReasonerOutput = {
    answer: result.answer,
    citations: result.citations,
    findingHash: hashFinding(context.scopeId, result.answer),
    confidence: result.confidence,
    suggestedActions: result.suggestedActions.map((a) => ({
      type: a.type,
      description: a.description,
      payload: a.payload,
      targetUserId: a.targetUserId,
    })),
  };

  return { reasoning };
}

function buildPrompt(
  context: FleetGraphStateType['context'],
  intent: FleetGraphStateType['intent'],
  fetchedData: FleetGraphStateType['fetchedData'],
): string {
  const lines: string[] = [];

  lines.push(`Scope: ${context.scopeType} ${context.scopeId} (workspace ${context.workspaceId})`);
  lines.push(`Mode: ${context.mode}`);
  if (context.userMessage) lines.push(`User question: ${context.userMessage}`);
  if (intent) lines.push(`Detected intent: ${intent.kind} (confidence: ${intent.confidence})`);
  lines.push('');

  if (fetchedData.documents && fetchedData.documents.length > 0) {
    lines.push(`Primary document(s) (${fetchedData.documents.length}):`);
    for (const d of fetchedData.documents.slice(0, 5)) {
      lines.push(
        `  - id=${d.id} type=${d.document_type} title="${d.title}" properties=${JSON.stringify(d.properties)}`,
      );
    }
    if (fetchedData.documents.length > 5) {
      lines.push(`  ...and ${fetchedData.documents.length - 5} more`);
    }
    lines.push('');
  }

  if (fetchedData.associations && fetchedData.associations.length > 0) {
    lines.push(`Associations (${fetchedData.associations.length}):`);
    for (const a of fetchedData.associations.slice(0, 30)) {
      lines.push(`  - ${a.source_id} --[${a.relationship_type}]--> ${a.target_id}`);
    }
    if (fetchedData.associations.length > 30) {
      lines.push(`  ...and ${fetchedData.associations.length - 30} more`);
    }
    lines.push('');
  }

  if (fetchedData.load) {
    lines.push(`Load snapshot: ${JSON.stringify(fetchedData.load)}`);
    lines.push('');
  }

  if (fetchedData.activity && fetchedData.activity.length > 0) {
    lines.push(`Recent activity (${fetchedData.activity.length} events):`);
    for (const e of fetchedData.activity.slice(0, 10)) {
      lines.push(`  - ${e.changedAt} doc=${e.documentId} change=${e.changeType}`);
    }
    lines.push('');
  }

  lines.push(
    context.mode === 'on_demand'
      ? 'Now answer the user question grounded in this data.'
      : 'Now identify what (if anything) is worth surfacing about this scope.',
  );

  return lines.join('\n');
}
