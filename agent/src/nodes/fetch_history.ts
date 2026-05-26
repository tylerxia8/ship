/**
 * fetch_history — small historical snapshot for diff-style questions.
 *
 * v1 uses history already present in document properties (for example
 * plan_history on weeks/projects) plus the current document state. It is not
 * a full workspace snapshot system; that remains a future upgrade.
 */

import { getDocument } from '../ship-client.js';
import type { FleetGraphStateType, HistorySnapshot, ShipDocument } from '../state.js';

export async function fetchHistory(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const required = state.intent?.requiredFetches ?? [];
  if (!required.includes('history')) {
    return {};
  }

  const doc = state.fetchedData.documents?.[0] ?? await getDocument(state.context.scopeId);
  const snapshot = buildHistorySnapshot(doc);
  return { fetchedData: { history: snapshot } };
}

function buildHistorySnapshot(doc: ShipDocument): HistorySnapshot {
  const states: Record<string, string> = {};
  const state = doc.properties?.state;
  if (typeof state === 'string') {
    states[doc.id] = state;
  }

  const propertyHistory = firstArrayProperty(doc, ['plan_history', 'review_history', 'retro_history']);
  const latestHistoryEntry = propertyHistory?.[propertyHistory.length - 1];
  const snapshotAt =
    readHistoryDate(latestHistoryEntry) ??
    doc.updated_at;

  return {
    scopeId: doc.id,
    snapshotAt,
    documentIds: [doc.id],
    states,
  };
}

function firstArrayProperty(doc: ShipDocument, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = doc.properties?.[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function readHistoryDate(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const candidate = record.updated_at ?? record.created_at ?? record.timestamp;
  return typeof candidate === 'string' ? candidate : null;
}
