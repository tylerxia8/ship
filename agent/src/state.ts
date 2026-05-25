/**
 * FleetGraph state — what flows through the graph.
 *
 * Defined as a LangGraph `Annotation.Root` so the framework can:
 *   - merge parallel writes via the reducers on each field
 *   - serialize to PostgresSaver checkpoints
 *   - resume from human_gate interrupts after hours/days
 *
 * See FLEETGRAPH.md § Graph Diagram → State shape for the full architecture.
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';

// ─── Scope context (set by context_resolver, immutable thereafter) ──────────

export type ScopeType = 'issue' | 'sprint' | 'program' | 'project' | 'person' | 'workspace';

export type TriggerMode = 'proactive' | 'on_demand' | 'resumed_from_gate';

export interface Context {
  scopeType: ScopeType;
  scopeId: string;
  workspaceId: string;
  userId: string | null; // null for proactive; requester for on-demand
  mode: TriggerMode;
  userMessage?: string; // on-demand only
  parentRunId?: string; // for runs resumed from human_gate
}

// ─── Intent (set by intent_classifier) ──────────────────────────────────────

export type IntentKind =
  | 'blocker_check'
  | 'load_check'
  | 'slip_check'
  | 'diff_query'
  | 'cross_program'
  | 'general_qa'
  | 'proactive_scan';

export interface Intent {
  kind: IntentKind;
  confidence: 'high' | 'medium' | 'low';
  requiredFetches: Array<'doc' | 'assocs' | 'load' | 'activity' | 'history'>;
}

// ─── Fetched data (merged across parallel fetch nodes) ──────────────────────

export interface FetchBundle {
  documents?: ShipDocument[];
  associations?: ShipAssociation[];
  load?: LoadSnapshot;
  activity?: ActivityEvent[];
  history?: HistorySnapshot;
}

// Minimal Ship document shape — agent reads more from Ship API.
// We deliberately don't import the full Ship document type from @ship/shared
// to keep the agent loosely coupled.
export interface ShipDocument {
  id: string;
  document_type: string;
  title: string;
  workspace_id: string;
  program_id: string | null;
  project_id: string | null;
  parent_id: string | null;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ShipAssociation {
  id: string;
  source_id: string;
  target_id: string;
  relationship_type: 'parent' | 'project' | 'sprint' | 'program' | string;
}

export interface LoadSnapshot {
  personId: string;
  assignedIssueCount: number;
  estimatedHoursAssigned: number;
  capacityHours: number | null;
  loadRatio: number | null;
}

export interface ActivityEvent {
  documentId: string;
  changedAt: string;
  changeType: 'state' | 'assignee' | 'estimate' | 'comment' | string;
  delta?: Record<string, unknown>;
}

export interface HistorySnapshot {
  scopeId: string;
  snapshotAt: string;
  documentIds: string[];
  states: Record<string, string>; // docId → state at snapshot time
}

// ─── Reasoner output ────────────────────────────────────────────────────────

export interface ReasonerOutput {
  answer: string; // human-readable summary
  citations: string[]; // doc IDs referenced
  findingHash: string; // deterministic hash for dedup
  confidence: 'high' | 'medium' | 'low';
  suggestedActions: SuggestedAction[];
}

export interface SuggestedAction {
  type: 'notify_user' | 'change_state' | 'reassign' | 'comment' | 'descope';
  description: string; // human-readable
  payload: Record<string, unknown>; // tool-input shape
  targetUserId?: string; // who would be notified (if any)
}

// ─── HITL ──────────────────────────────────────────────────────────────────

export type HumanDecision = 'approved' | 'dismissed' | 'snoozed' | 'modified';

// ─── The Annotation root ───────────────────────────────────────────────────

export const FleetGraphState = Annotation.Root({
  context: Annotation<Context>(),

  intent: Annotation<Intent | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  fetchedData: Annotation<FetchBundle>({
    // parallel fetch nodes write partial bundles; merge them
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  reasoning: Annotation<ReasonerOutput | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  pendingActions: Annotation<SuggestedAction[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  needsHumanApproval: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  humanDecision: Annotation<HumanDecision | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Bounded conversation history — capped at 10 turns in the reducer
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => {
      const merged = messagesStateReducer(prev, next);
      return merged.slice(-10);
    },
    default: () => [],
  }),

  // Final output — what's returned to the caller or persisted as notification
  output: Annotation<{ kind: 'chat' | 'notification'; text: string; citations: string[] } | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
});

export type FleetGraphStateType = typeof FleetGraphState.State;
