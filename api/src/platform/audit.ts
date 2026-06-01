import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/client.js';

export function publicAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    if (!req.originalUrl.startsWith('/api/v1')) return;

    const auth = req.publicAuth;
    const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : req.originalUrl.split('?')[0] ?? req.originalUrl;
    const latencyMs = Date.now() - start;

    void pool.query(
      `INSERT INTO public_api_audit_log
        (request_id, workspace_id, app_id, client_id, user_id, method, route, scope_used, status, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        req.requestId ?? '',
        auth?.workspaceId ?? null,
        auth?.appId ?? null,
        auth?.clientId ?? null,
        auth?.userId ?? null,
        req.method,
        route,
        req.publicAuthScopeUsed ?? null,
        res.statusCode,
        latencyMs,
      ],
    ).catch((err) => {
      console.error('[public-api/audit] failed to record request:', err);
    });
  });

  next();
}
