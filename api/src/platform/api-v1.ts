import { Router } from 'express';
import appsRouter from './routes/apps.js';
import documentsRouter from './routes/documents.js';
import meRouter from './routes/me.js';
import { publicAuditMiddleware } from './audit.js';
import { ApiError, publicApiErrorHandler, requestIdMiddleware } from './errors.js';
import { servePublicOpenApi } from './openapi.js';
import { ScopeRegistry } from './scopes.js';

export function createPublicApiV1Router(): Router {
  const router = Router();

  router.use(requestIdMiddleware);
  router.use(publicAuditMiddleware);

  router.get('/openapi.json', servePublicOpenApi);

  router.get('/scopes', (_req, res) => {
    res.json({ data: Object.values(ScopeRegistry), next_cursor: null });
  });

  router.use('/oauth/apps', appsRouter);
  router.use('/me', meRouter);
  router.use('/documents', documentsRouter);

  router.use((_req, _res, next) => {
    next(new ApiError(404, 'not_found', 'Public API route not found'));
  });

  router.use(publicApiErrorHandler);

  return router;
}
