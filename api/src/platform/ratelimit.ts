import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';
import { hashToken } from './crypto.js';
import { queryOne } from '../db/client.js';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitTokenRow {
  app_id: string;
  token_id: string;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120;

function limitForRequest(): number {
  const parsed = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

async function keysForRequest(req: Request): Promise<string[]> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      const tokenHash = hashToken(token);
      const tokenRow = await queryOne<RateLimitTokenRow>(
        `SELECT id AS token_id, app_id
           FROM oauth_access_tokens
          WHERE token_hash = $1`,
        [tokenHash],
      );

      return tokenRow
        ? [`token:${tokenRow.token_id}`, `app:${tokenRow.app_id}`]
        : [`bearer:${tokenHash}`];
    }
  }

  return [`ip:${req.ip || req.socket.remoteAddress || 'unknown'}`];
}

export function clearPublicRateLimitBuckets(): void {
  buckets.clear();
}

function consumeBucket(key: string, limit: number, now: number): Bucket {
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + WINDOW_MS };

  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket;
}

export async function publicRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  let mostConstrained: Bucket;
  let limit: number;
  const now = Date.now();

  try {
    limit = limitForRequest();
    const keys = await keysForRequest(req);
    const consumed = keys.map((key) => consumeBucket(key, limit, now));
    mostConstrained = consumed.reduce((current, bucket) => (
      bucket.count > current.count ? bucket : current
    ));
  } catch (err) {
    next(err);
    return;
  }

  const remaining = Math.max(0, limit - mostConstrained.count);
  const resetSeconds = Math.ceil(mostConstrained.resetAt / 1000);
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));

  if (mostConstrained.count > limit) {
    const retryAfterSeconds = Math.ceil((mostConstrained.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(new ApiError(429, 'rate_limited', 'Public API rate limit exceeded', {
      retry_after_seconds: retryAfterSeconds,
    }));
    return;
  }

  next();
}
