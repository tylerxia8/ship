import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120;

function limitForRequest(): number {
  const parsed = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

function keyForRequest(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function publicRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const limit = limitForRequest();
  const key = keyForRequest(req);
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + WINDOW_MS };

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    next(new ApiError(429, 'rate_limited', 'Public API rate limit exceeded', {
      retry_after_seconds: Math.ceil((bucket.resetAt - now) / 1000),
    }));
    return;
  }

  next();
}
