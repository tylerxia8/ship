/**
 * FleetGraph agent service entry point.
 *
 * Two things run in one process:
 *   1. HTTP server (Express) for on-demand chat invocations + HITL resume callbacks
 *   2. Proactive poller (setInterval) for sprint scans
 *
 * Deployed as a separate Render web service (`ship-agent`) alongside Ship's
 * `ship-api-76ez`. See FLEETGRAPH.md § Architecture Decisions § Deployment Model.
 *
 * This file is a stub at scaffolding-time. Routes + poller wired in as the
 * MVP build progresses.
 */

import express from 'express';
import { config } from './config.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ship-agent',
    langsmith_project: config.langsmith.project,
    tracing: config.langsmith.tracing,
  });
});

// ─── Chat endpoint (on-demand mode) — stub ──────────────────────────────────

app.post('/agent/chat', (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Chat endpoint wired in MVP build (see todo list).' },
  });
});

// ─── HITL resume callback — stub ────────────────────────────────────────────

app.post('/agent/resume', (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Resume endpoint wired in MVP build (see todo list).' },
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.listen(PORT, () => {
  console.log(`[ship-agent] listening on http://localhost:${PORT}`);
  console.log(`[ship-agent] langsmith tracing: ${config.langsmith.tracing}`);
  console.log(`[ship-agent] langsmith project: ${config.langsmith.project}`);
});

// ─── Proactive poller — wired in next phase ─────────────────────────────────
// setInterval(async () => { /* enumerate active sprints, run graph */ },
//             config.scheduler.pollIntervalMs);
