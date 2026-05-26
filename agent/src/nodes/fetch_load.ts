/**
 * fetch_load — deterministic load/capacity snapshot for person or sprint scopes.
 *
 * This uses the existing Ship documents + associations API. For sprint scopes,
 * reverse sprint associations identify issues assigned to the sprint; for
 * person scopes, the agent scans open issues assigned to that person.
 */

import { getDocument, getReverseAssociations, listDocuments } from '../ship-client.js';
import type { FleetGraphStateType, LoadSnapshot, ShipDocument } from '../state.js';

const MAX_ISSUES = 50;

export async function fetchLoad(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const required = state.intent?.requiredFetches ?? [];
  if (!required.includes('load')) {
    return {};
  }

  const primaryDoc = state.fetchedData.documents?.[0] ?? await getDocument(state.context.scopeId);
  const people = await listDocuments({
    workspaceId: state.context.workspaceId,
    documentType: 'person',
  });

  const issues =
    state.context.scopeType === 'sprint' || primaryDoc.document_type === 'sprint'
      ? await getSprintIssues(primaryDoc.id)
      : await getPersonIssues(primaryDoc, state.context.workspaceId);

  const snapshot = buildLoadSnapshot(state.context.scopeType, state.context.scopeId, issues, people);
  return { fetchedData: { load: snapshot } };
}

async function getSprintIssues(sprintId: string): Promise<ShipDocument[]> {
  const assocs = await getReverseAssociations(sprintId, 'sprint');
  const issueIds = assocs.map((a) => a.source_id).slice(0, MAX_ISSUES);
  const docs = await Promise.allSettled(issueIds.map((id) => getDocument(id)));
  return docs
    .filter((r): r is PromiseFulfilledResult<ShipDocument> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((d) => d.document_type === 'issue');
}

async function getPersonIssues(personDoc: ShipDocument, workspaceId: string): Promise<ShipDocument[]> {
  const personUserId = stringProp(personDoc, 'user_id') ?? personDoc.id;
  const issues = await listDocuments({ workspaceId, documentType: 'issue' });
  return issues
    .filter((issue) => stringProp(issue, 'state') !== 'done')
    .filter((issue) => stringProp(issue, 'assignee_id') === personUserId || stringProp(issue, 'assignee_id') === personDoc.id)
    .slice(0, MAX_ISSUES);
}

function buildLoadSnapshot(
  scopeType: FleetGraphStateType['context']['scopeType'],
  scopeId: string,
  issues: ShipDocument[],
  people: ShipDocument[],
): LoadSnapshot {
  const peopleById = new Map<string, ShipDocument>();
  for (const person of people) {
    peopleById.set(person.id, person);
    const userId = stringProp(person, 'user_id');
    if (userId) peopleById.set(userId, person);
  }

  const buckets = new Map<string, { person: ShipDocument; issues: ShipDocument[] }>();
  let unassignedIssueCount = 0;
  let totalEstimatedHours = 0;

  for (const issue of issues) {
    const estimate = numberProp(issue, 'estimate_hours') ?? numberProp(issue, 'estimate') ?? 0;
    totalEstimatedHours += estimate;

    const assigneeId = stringProp(issue, 'assignee_id');
    const person = assigneeId ? peopleById.get(assigneeId) : undefined;
    if (!assigneeId || !person) {
      unassignedIssueCount++;
      continue;
    }

    const key = person.id;
    const bucket = buckets.get(key) ?? { person, issues: [] };
    bucket.issues.push(issue);
    buckets.set(key, bucket);
  }

  return {
    scopeType,
    scopeId,
    people: Array.from(buckets.values()).map(({ person, issues: assigned }) => {
      const estimatedHoursAssigned = assigned.reduce(
        (sum, issue) => sum + (numberProp(issue, 'estimate_hours') ?? numberProp(issue, 'estimate') ?? 0),
        0,
      );
      const capacityHours = numberProp(person, 'capacity_hours');
      return {
        personId: person.id,
        personTitle: person.title,
        assignedIssueCount: assigned.length,
        estimatedHoursAssigned,
        capacityHours,
        loadRatio: capacityHours && capacityHours > 0 ? estimatedHoursAssigned / capacityHours : null,
      };
    }),
    unassignedIssueCount,
    totalEstimatedHours,
  };
}

function stringProp(doc: ShipDocument, key: string): string | null {
  const value = doc.properties?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberProp(doc: ShipDocument, key: string): number | null {
  const value = doc.properties?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
