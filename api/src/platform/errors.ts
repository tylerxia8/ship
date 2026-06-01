import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export type PublicApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'rate_limited'
  | 'server_error'
  | 'invalid_grant';

export class ApiError extends Error {
  readonly status: number;
  readonly code: PublicApiErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: PublicApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-request-id'];
  req.requestId = typeof header === 'string' && header.trim() ? header : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function sendApiError(req: Request, res: Response, error: ApiError): void {
  res.status(error.status).json({
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
    request_id: req.requestId ?? crypto.randomUUID(),
  });
}

export function publicApiErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof ApiError) {
    sendApiError(req, res, err);
    return;
  }

  console.error('[public-api] unhandled error:', err);
  sendApiError(req, res, new ApiError(500, 'server_error', 'Internal server error'));
}
