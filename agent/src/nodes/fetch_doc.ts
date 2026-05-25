/**
 * fetch_doc — load the primary document for the scope.
 * Always runs (every intent's requiredFetches includes 'doc').
 */

import { getDocument } from '../ship-client.js';
import type { FleetGraphStateType } from '../state.js';

export async function fetchDoc(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const doc = await getDocument(state.context.scopeId);
  return {
    fetchedData: { documents: [doc] },
  };
}
