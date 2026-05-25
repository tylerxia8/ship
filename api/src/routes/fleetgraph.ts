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
