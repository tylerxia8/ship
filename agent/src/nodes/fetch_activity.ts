/**
 * fetch_activity — deterministic recent activity summary.
 *
 * Ship does not expose a general document-history endpoint for every document
 * type, so v1 derives activity from updated_at on the primary document and,
 * for sprint scopes, issues assigned to that sprint.
 */

import { getDocument, getReverseAssociations } from '../ship-client.js';
import type { ActivityEvent, FleetGraphStateType, ShipDocument } from '../state.js';

const MAX_EVENTS = 20;

export async function fetchActivity(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const required = state.intent?.requiredFetches ?? [];
  if (!required.includes('activity')) {
    return {};
  }

  const primaryDoc = state.fetchedData.documents?.[0] ?? await getDocument(state.context.scopeId);
  const docs = [primaryDoc];

  if (primaryDoc.document_type === 'sprint' || state.context.scopeType === 'sprint') {
    const assocs = await getReverseAssociations(primaryDoc.id, 'sprint');
    const issueIds = assocs.map((a) => a.source_id).slice(0, MAX_EVENTS);
    const issueResults = await Promise.allSettled(issueIds.map((id) => getDocument(id)));
    for (const result of issueResults) {
      if (result.status === 'fulfilled' && result.value.document_type === 'issue') {
        docs.push(result.value);
      }
    }
  }

  const activity = docs
    .map(toUpdatedEvent)
    .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))
    .slice(0, MAX_EVENTS);

  return { fetchedData: { activity } };
}

function toUpdatedEvent(doc: ShipDocument): ActivityEvent {
  return {
    documentId: doc.id,
    changedAt: doc.updated_at,
    changeType: 'updated_at',
    delta: {
      title: doc.title,
      document_type: doc.document_type,
      state: doc.properties?.state,
      assignee_id: doc.properties?.assignee_id,
    },
  };
}
