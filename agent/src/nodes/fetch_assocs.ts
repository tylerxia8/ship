/**
 * fetch_assocs — load the outgoing document_associations for the scope.
 * Runs when intent.requiredFetches includes 'assocs'.
 *
 * Uses Ship's GET /api/documents/:id/associations endpoint. Caps at 50 edges
 * per hop to prevent context blow-up on heavily-connected nodes.
 *
 * Errors are non-fatal — if the associations endpoint 404s, we just emit an
 * empty list and let the reasoner work with what it has.
 */

import { getAssociations, ShipApiError } from '../ship-client.js';
import type { FleetGraphStateType, ShipAssociation } from '../state.js';

const MAX_EDGES_PER_HOP = 50;

export async function fetchAssocs(
  state: FleetGraphStateType,
): Promise<Partial<FleetGraphStateType>> {
  // Early-return when the intent doesn't require associations. Keeps the
  // graph topology simple (no conditional fan-out from intent_classifier),
  // and the no-op cost is negligible.
  const required = state.intent?.requiredFetches ?? [];
  if (!required.includes('assocs')) {
    return { fetchedData: { associations: [] } };
  }

  try {
    const raw = await getAssociations(state.context.scopeId);
    const bounded: ShipAssociation[] = raw.slice(0, MAX_EDGES_PER_HOP);
    return {
      fetchedData: { associations: bounded },
    };
  } catch (err) {
    if (err instanceof ShipApiError && err.status === 404) {
      console.warn(`[fetch_assocs] no associations endpoint for ${state.context.scopeId}, returning empty`);
      return { fetchedData: { associations: [] } };
    }
    throw err;
  }
}
