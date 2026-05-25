/**
 * FleetGraph agent service — HTTP entry point.
 *
 * Two real routes:
 *   POST /agent/chat   — on-demand graph invocation, returns chat output or interrupt
 *   POST /agent/resume — resume a paused HITL flow with user's decision
 *
 * Plus /health for Render's liveness check.
 *
 * Auth: a shared X-Agent-Secret header verified against AGENT_SHARED_SECRET
 * env var. Ship's api/ proxies user chat through, attaching the secret. The
 * agent service itself never authenticates browser users directly.
 *
 * Proactive poller is wired separately (will be added in setInterval below
 * after the deploy infra is settled — for MVP the on-demand flow is the
 * primary exercise of the graph).
 */

import express, { Request, Response, NextFunction } from 'express';
import { Command } from '@langchain/langgraph';
import { config } from './config.js';
import { fleetGraph } from './graph.js';
import { startPoller } from './poller.js';
import type { Context, ScopeType, TriggerMode, HumanDecision } from './state.js';

const AGENT_SHARED_SECRET = process.env.AGENT_SHARED_SECRET ?? '';

const app = express();
app.use(express.json({ limit: '256kb' }));

// ─── Auth middleware ────────────────────────────────────────────────────────

function requireSharedSecret(req: Request, res: Response, next: NextFunction): void {
  if (!AGENT_SHARED_SECRET) {
    // Dev mode — no secret configured, allow all. Warn loudly.
    if (!req.headers['x-agent-secret']) {
      console.warn('[agent] AGENT_SHARED_SECRET not set; allowing unauthenticated requests (dev only)');
    }
    next();
    return;
  }
  const provided = req.headers['x-agent-secret'];
  if (provided !== AGENT_SHARED_SECRET) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'invalid or missing X-Agent-Secret header' },
    });
    return;
  }
  next();
}

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ship-agent',
    langsmith_project: config.langsmith.project,
    tracing: config.langsmith.tracing,
    auth_enforced: AGENT_SHARED_SECRET !== '',
  });
});

// ─── Chat endpoint ──────────────────────────────────────────────────────────

interface ChatRequest {
  scopeType: ScopeType;
  scopeId: string;
  workspaceId: string;
  userId: string;
  userMessage?: string;
  threadId?: string; // omit to start a new conversation; include to continue one
}

interface ChatResponse {
  ok: true;
  threadId: string;
  output?: {
    kind: 'chat' | 'notification';
    text: string;
    citations: string[];
  };
  pendingInterrupt?: {
    actions: unknown;
    findingAnswer: string;
  };
  intent?: { kind: string; confidence: string };
  elapsed_ms: number;
}

app.post('/agent/chat', requireSharedSecret, async (req: Request, res: Response) => {
  const body = req.body as Partial<ChatRequest>;
  const validation = validateChatBody(body);
  if (!validation.ok) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: validation.error },
    });
    return;
  }

  const threadId = body.threadId ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const runConfig = { configurable: { thread_id: threadId } };
  const context: Context = {
    scopeType: body.scopeType!,
    scopeId: body.scopeId!,
    workspaceId: body.workspaceId!,
    userId: body.userId!,
    mode: 'on_demand' satisfies TriggerMode,
    userMessage: body.userMessage,
  };

  const start = Date.now();

  try {
    const result = await fleetGraph.invoke({ context }, runConfig);
    const elapsed = Date.now() - start;

    // Check whether the graph interrupted at human_gate
    const state = await fleetGraph.getState(runConfig);
    const interrupted = state.tasks.some((t) => t.interrupts && t.interrupts.length > 0);

    if (interrupted) {
      const firstInterrupt = state.tasks[0]?.interrupts?.[0];
      const response: ChatResponse = {
        ok: true,
        threadId,
        pendingInterrupt: {
          actions: (firstInterrupt?.value as Record<string, unknown>)?.actions,
          findingAnswer:
            ((firstInterrupt?.value as Record<string, unknown>)?.findingAnswer as string) ?? '(no answer)',
        },
        intent: result.intent
          ? { kind: result.intent.kind, confidence: result.intent.confidence }
          : undefined,
        elapsed_ms: elapsed,
      };
      res.json(response);
      return;
    }

    const response: ChatResponse = {
      ok: true,
      threadId,
      output: result.output
        ? {
            kind: result.output.kind,
            text: result.output.text,
            citations: result.output.citations,
          }
        : undefined,
      intent: result.intent
        ? { kind: result.intent.kind, confidence: result.intent.confidence }
        : undefined,
      elapsed_ms: elapsed,
    };
    res.json(response);
  } catch (err) {
    console.error('[agent/chat] graph error:', err);
    res.status(500).json({
      error: { code: 'GRAPH_ERROR', message: (err as Error).message },
    });
  }
});

// ─── Resume endpoint (HITL approval/dismiss/snooze) ────────────────────────

interface ResumeRequest {
  threadId: string;
  decision: HumanDecision;
}

app.post('/agent/resume', requireSharedSecret, async (req: Request, res: Response) => {
  const body = req.body as Partial<ResumeRequest>;
  if (!body.threadId || !body.decision) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'threadId and decision are required' },
    });
    return;
  }
  const validDecisions: HumanDecision[] = ['approved', 'dismissed', 'snoozed', 'modified'];
  if (!validDecisions.includes(body.decision)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `decision must be one of: ${validDecisions.join(', ')}` },
    });
    return;
  }

  const runConfig = { configurable: { thread_id: body.threadId } };
  const start = Date.now();

  try {
    const result = await fleetGraph.invoke(new Command({ resume: body.decision }), runConfig);
    res.json({
      ok: true,
      threadId: body.threadId,
      output: result.output,
      humanDecision: result.humanDecision,
      elapsed_ms: Date.now() - start,
    });
  } catch (err) {
    console.error('[agent/resume] graph error:', err);
    res.status(500).json({
      error: { code: 'GRAPH_ERROR', message: (err as Error).message },
    });
  }
});

// ─── Validation helper ─────────────────────────────────────────────────────

function validateChatBody(
  body: Partial<ChatRequest>,
): { ok: true } | { ok: false; error: string } {
  const required: Array<keyof ChatRequest> = ['scopeType', 'scopeId', 'workspaceId', 'userId'];
  for (const field of required) {
    if (!body[field] || typeof body[field] !== 'string') {
      return { ok: false, error: `missing or invalid field: ${field}` };
    }
  }
  const validScopes: ScopeType[] = ['issue', 'sprint', 'program', 'project', 'person', 'workspace'];
  if (!validScopes.includes(body.scopeType as ScopeType)) {
    return { ok: false, error: `scopeType must be one of: ${validScopes.join(', ')}` };
  }
  return { ok: true };
}

// ─── Start ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.listen(PORT, () => {
  console.log(`[ship-agent] listening on http://localhost:${PORT}`);
  console.log(`[ship-agent] langsmith tracing: ${config.langsmith.tracing}`);
  console.log(`[ship-agent] langsmith project: ${config.langsmith.project}`);
  console.log(`[ship-agent] auth: ${AGENT_SHARED_SECRET ? 'shared secret enforced' : 'OPEN (dev mode)'}`);

  // Start the proactive poller in deployed environments. Skip in dev to
  // avoid hammering Anthropic + Ship during smoke testing. Toggle via
  // FLEETGRAPH_POLLER_ENABLED=true.
  if (process.env.FLEETGRAPH_POLLER_ENABLED === 'true') {
    console.log('[ship-agent] proactive poller enabled');
    startPoller();
  } else {
    console.log('[ship-agent] proactive poller disabled (set FLEETGRAPH_POLLER_ENABLED=true to enable)');
  }
});
