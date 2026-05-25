/**
 * Ship REST API client for the FleetGraph agent.
 *
 * Authenticates via the service-account API token (Bearer auth, same flow
 * as Ship's existing api_tokens). The token is issued by
 * api/scripts/create-service-account.ts and lives in SHIP_SERVICE_ACCOUNT_KEY.
 *
 * Wraps the read paths the agent's fetch nodes need:
 *   - GET /api/documents (filtered list)
 *   - GET /api/documents/:id
 *   - GET /api/documents/:id/associations
 *   - GET /api/issues / /api/projects / /api/weeks for type-specific lists
 *
 * Errors propagate as ShipApiError; the caller (graph nodes) decides whether
 * to retry, degrade, or fail the run.
 */

import { config } from './config.js';
import type { ShipDocument, ShipAssociation } from './state.js';

// ─── Errors ────────────────────────────────────────────────────────────────

export class ShipApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ShipApiError';
  }

  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

// ─── Low-level fetch wrapper with retry ────────────────────────────────────

interface FetchOptions {
  retries?: number;
  retryDelayMs?: number;
}

async function shipFetch(
  path: string,
  init: RequestInit = {},
  opts: FetchOptions = {},
): Promise<unknown> {
  const { retries = 3, retryDelayMs = 1_000 } = opts;
  const url = `${config.ship.apiBaseUrl}${path}`;

  if (!config.ship.serviceAccountKey) {
    throw new ShipApiError(
      0,
      url,
      null,
      'SHIP_SERVICE_ACCOUNT_KEY not set — agent cannot authenticate to Ship API',
    );
  }

  let lastErr: ShipApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ship.serviceAccountKey}`,
          'User-Agent': 'ship-agent/0.0.0 (FleetGraph)',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      // Network error — treat as retryable
      lastErr = new ShipApiError(0, url, null, `network error: ${(err as Error).message}`);
      if (attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
      throw lastErr;
    }

    if (response.ok) {
      // Ship API returns { success: true, data: ... } envelope per CLAUDE.md
      const body = (await response.json().catch(() => null)) as unknown;
      return body;
    }

    const body = (await response.json().catch(() => null)) as unknown;
    lastErr = new ShipApiError(
      response.status,
      url,
      body,
      `Ship API ${response.status} on ${path}`,
    );

    if (lastErr.isRetryable && attempt < retries) {
      await sleep(retryDelayMs * Math.pow(2, attempt));
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new Error('unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Typed read helpers ────────────────────────────────────────────────────

// Ship's API envelope shape: { success: true, data: T } | { success: false, error: ... }
function unwrap<T>(body: unknown): T {
  if (!body || typeof body !== 'object') {
    throw new Error('Ship API returned non-object body');
  }
  const env = body as { success?: boolean; data?: T; error?: unknown };
  if (env.success === false) {
    throw new Error(`Ship API error envelope: ${JSON.stringify(env.error)}`);
  }
  if (env.data === undefined) {
    throw new Error('Ship API envelope missing data field');
  }
  return env.data;
}

export async function getDocument(id: string): Promise<ShipDocument> {
  const body = await shipFetch(`/api/documents/${encodeURIComponent(id)}`);
  return unwrap<ShipDocument>(body);
}

export interface ListDocumentsOptions {
  workspaceId?: string;
  documentType?: string;
  programId?: string;
  projectId?: string;
  limit?: number;
}

export async function listDocuments(opts: ListDocumentsOptions = {}): Promise<ShipDocument[]> {
  const params = new URLSearchParams();
  if (opts.workspaceId) params.set('workspace_id', opts.workspaceId);
  if (opts.documentType) params.set('document_type', opts.documentType);
  if (opts.programId) params.set('program_id', opts.programId);
  if (opts.projectId) params.set('project_id', opts.projectId);
  if (opts.limit) params.set('limit', String(opts.limit));

  const qs = params.toString();
  const body = await shipFetch(`/api/documents${qs ? `?${qs}` : ''}`);
  return unwrap<ShipDocument[]>(body);
}

export async function getAssociations(documentId: string): Promise<ShipAssociation[]> {
  const body = await shipFetch(
    `/api/documents/${encodeURIComponent(documentId)}/associations`,
  );
  return unwrap<ShipAssociation[]>(body);
}

// ─── High-level helpers used by graph nodes ────────────────────────────────

/**
 * Active sprints for a workspace — the proactive poller enumerates these
 * and fires one graph run per sprint per 4-minute window.
 */
export async function listActiveSprints(workspaceId: string): Promise<ShipDocument[]> {
  // Ship's "sprint" is the historical name for week documents
  // (renamed in migration 033 but the document_type stayed 'sprint').
  // Active = computed from sprint_number + workspace start_date >= today.
  // The agent does the computation here rather than relying on a server
  // filter that doesn't exist; cheap because workspaces typically have
  // dozens, not thousands, of sprint docs.
  const all = await listDocuments({ workspaceId, documentType: 'sprint' });
  return all.filter((s) => isSprintActive(s));
}

function isSprintActive(sprint: ShipDocument): boolean {
  // Without the workspace start date we can't compute exactly; fall back to
  // updated_at within the last 14 days as a proxy. The real computation
  // happens server-side and is exposed via a query param in a future API
  // change; for v1 the proxy is close enough.
  const updated = new Date(sprint.updated_at);
  return Date.now() - updated.getTime() < 14 * 24 * 60 * 60 * 1000;
}

// ─── Health check ──────────────────────────────────────────────────────────

export async function ping(): Promise<{ ok: true; status: number } | { ok: false; error: string }> {
  try {
    const url = `${config.ship.apiBaseUrl}/health`;
    const r = await fetch(url);
    return { ok: r.ok, status: r.status } as { ok: true; status: number };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
