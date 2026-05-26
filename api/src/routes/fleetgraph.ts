/**
 * FleetGraph chat proxy.
 *
 * Browser → Ship API → ship-agent service → graph. Ship's existing auth
 * (session cookie) validates the user before we forward; the agent service
 * never authenticates browser sessions directly. We inject:
 *   - The authenticated userId from the session (browser can't lie about it)
 *   - workspaceId (server-resolved from session, not trusted from body)
 *   - X-Agent-Secret header (the shared key between ship-api and ship-agent)
 *
 * The agent's chat endpoint returns either a finished output or a
 * pendingInterrupt; we pass either back to the client unchanged.
 *
 * Env vars:
 *   FLEETGRAPH_AGENT_URL          — agent base URL (default http://localhost:4000)
 *   FLEETGRAPH_AGENT_SHARED_SECRET — must match AGENT_SHARED_SECRET on the agent side
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';
import { authCtx } from '../middleware/auth-context.js';

const router = Router();

const AGENT_URL = process.env.FLEETGRAPH_AGENT_URL ?? 'http://localhost:4000';
const AGENT_SECRET = process.env.FLEETGRAPH_AGENT_SHARED_SECRET ?? '';

interface ChatProxyBody {
  scopeType?: string;
  scopeId?: string;
  userMessage?: string;
  threadId?: string;
}

interface ResumeProxyBody {
  threadId?: string;
  decision?: string;
}

interface ScanProxyBody {
  scopeType?: string;
  scopeId?: string;
  threadId?: string;
}

const createFindingSchema = z.object({
  scopeType: z.string().min(1).max(50),
  scopeId: z.string().uuid(),
  findingHash: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(10_000),
  confidence: z.enum(['high', 'medium', 'low']),
  citations: z.array(z.string()).default([]),
  suggestedActions: z.array(z.record(z.unknown())).default([]),
});

const updateFindingSchema = z.object({
  status: z.enum(['open', 'dismissed', 'snoozed', 'resolved']),
});

async function requireFleetGraphWriter(req: Request, res: Response): Promise<boolean> {
  if (!req.isApiToken || !req.userId) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'FleetGraph findings can only be created by the agent service' },
    });
    return false;
  }

  const user = await pool.query(
    `SELECT is_service_account FROM users WHERE id = $1`,
    [req.userId],
  );

  if (!user.rows[0]?.is_service_account) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'FleetGraph findings can only be created by the agent service' },
    });
    return false;
  }

  return true;
}

router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  const { userId, workspaceId } = authCtx(req);
  const body = req.body as ChatProxyBody;

  if (!body.scopeType || !body.scopeId) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'scopeType and scopeId are required' },
    });
    return;
  }

  const agentBody = {
    scopeType: body.scopeType,
    scopeId: body.scopeId,
    workspaceId,
    userId,
    userMessage: body.userMessage,
    threadId: body.threadId,
  };

  try {
    const agentResponse = await fetch(`${AGENT_URL}/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGENT_SECRET ? { 'X-Agent-Secret': AGENT_SECRET } : {}),
      },
      body: JSON.stringify(agentBody),
    });

    const responseBody = (await agentResponse.json().catch(() => null)) as unknown;
    res.status(agentResponse.status).json(responseBody);
  } catch (err) {
    console.error('[fleetgraph/chat] proxy error:', err);
    res.status(502).json({
      success: false,
      error: {
        code: 'AGENT_UNREACHABLE',
        message: `FleetGraph agent at ${AGENT_URL} unreachable: ${(err as Error).message}`,
      },
    });
  }
});

router.post('/resume', authMiddleware, async (req: Request, res: Response) => {
  const body = req.body as ResumeProxyBody;
  if (!body.threadId || !body.decision) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'threadId and decision are required' },
    });
    return;
  }

  try {
    const agentResponse = await fetch(`${AGENT_URL}/agent/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGENT_SECRET ? { 'X-Agent-Secret': AGENT_SECRET } : {}),
      },
      body: JSON.stringify({ threadId: body.threadId, decision: body.decision }),
    });

    const responseBody = (await agentResponse.json().catch(() => null)) as unknown;
    res.status(agentResponse.status).json(responseBody);
  } catch (err) {
    console.error('[fleetgraph/resume] proxy error:', err);
    res.status(502).json({
      success: false,
      error: {
        code: 'AGENT_UNREACHABLE',
        message: `FleetGraph agent unreachable: ${(err as Error).message}`,
      },
    });
  }
});

router.post('/scan', authMiddleware, async (req: Request, res: Response) => {
  const { userId, workspaceId } = authCtx(req);
  const body = req.body as ScanProxyBody;

  if (!body.scopeType || !body.scopeId) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'scopeType and scopeId are required' },
    });
    return;
  }

  try {
    const agentResponse = await fetch(`${AGENT_URL}/agent/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGENT_SECRET ? { 'X-Agent-Secret': AGENT_SECRET } : {}),
      },
      body: JSON.stringify({
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        workspaceId,
        userId,
        threadId: body.threadId,
      }),
    });

    const responseBody = (await agentResponse.json().catch(() => null)) as unknown;
    res.status(agentResponse.status).json(responseBody);
  } catch (err) {
    console.error('[fleetgraph/scan] proxy error:', err);
    res.status(502).json({
      success: false,
      error: {
        code: 'AGENT_UNREACHABLE',
        message: `FleetGraph agent unreachable: ${(err as Error).message}`,
      },
    });
  }
});

router.get('/findings', authMiddleware, async (req: Request, res: Response) => {
  const { workspaceId } = authCtx(req);
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';

  if (!['open', 'dismissed', 'snoozed', 'resolved', 'all'].includes(status)) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'status must be open, dismissed, snoozed, resolved, or all' },
    });
    return;
  }

  const params: string[] = [workspaceId];
  let where = 'WHERE f.workspace_id = $1';
  if (status !== 'all') {
    params.push(status);
    where += ` AND f.status = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT f.id, f.workspace_id, f.scope_type, f.scope_id, f.finding_hash,
            f.title, f.body, f.confidence, f.citations, f.suggested_actions,
            f.status, f.created_at, f.updated_at, f.last_seen_at,
            d.title AS scope_title, d.document_type AS scope_document_type
       FROM fleetgraph_findings f
       JOIN documents d ON d.id = f.scope_id
       ${where}
       ORDER BY f.last_seen_at DESC
       LIMIT 50`,
    params,
  );

  res.json({
    findings: result.rows,
    total: result.rows.length,
  });
});

router.post('/findings', authMiddleware, async (req: Request, res: Response) => {
  const { userId, workspaceId } = authCtx(req);
  if (!(await requireFleetGraphWriter(req, res))) return;

  const parsed = createFindingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'invalid FleetGraph finding', details: parsed.error.errors },
    });
    return;
  }

  const body = parsed.data;
  const scope = await pool.query(
    `SELECT id FROM documents
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL AND archived_at IS NULL`,
    [body.scopeId, workspaceId],
  );
  if (scope.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'scope document not found' },
    });
    return;
  }

  const result = await pool.query(
    `INSERT INTO fleetgraph_findings
       (workspace_id, scope_type, scope_id, finding_hash, title, body, confidence,
        citations, suggested_actions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
     ON CONFLICT (workspace_id, scope_id, finding_hash)
     DO UPDATE SET
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       confidence = EXCLUDED.confidence,
       citations = EXCLUDED.citations,
       suggested_actions = EXCLUDED.suggested_actions,
       updated_at = NOW(),
       last_seen_at = NOW()
     RETURNING *`,
    [
      workspaceId,
      body.scopeType,
      body.scopeId,
      body.findingHash,
      body.title,
      body.body,
      body.confidence,
      JSON.stringify(body.citations),
      JSON.stringify(body.suggestedActions),
      userId,
    ],
  );

  res.status(201).json({ success: true, finding: result.rows[0] });
});

router.patch('/findings/:id', authMiddleware, async (req: Request, res: Response) => {
  const { workspaceId } = authCtx(req);
  const parsed = updateFindingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'status is required', details: parsed.error.errors },
    });
    return;
  }

  const result = await pool.query(
    `UPDATE fleetgraph_findings
        SET status = $1, updated_at = NOW()
      WHERE id = $2 AND workspace_id = $3
      RETURNING *`,
    [parsed.data.status, req.params.id, workspaceId],
  );

  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'FleetGraph finding not found' },
    });
    return;
  }

  res.json({ success: true, finding: result.rows[0] });
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${AGENT_URL}/health`);
    const body = (await r.json().catch(() => null)) as unknown;
    res.status(r.status).json({ proxy_ok: true, agent: body });
  } catch (err) {
    res.status(502).json({
      proxy_ok: true,
      agent: null,
      error: (err as Error).message,
    });
  }
});

export default router;
