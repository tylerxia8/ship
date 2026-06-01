import type { NextFunction, Request, Response } from 'express';
import { queryOne, pool } from '../db/client.js';
import { hashToken } from './crypto.js';
import type { PublicScope } from './scopes.js';
import { ApiError } from './errors.js';

interface OAuthAccessTokenRow {
  id: string;
  app_id: string;
  client_id: string;
  user_id: string;
  workspace_id: string;
  scopes: PublicScope[];
  expires_at: string;
  revoked_at: string | null;
  app_active: boolean;
}

export interface PublicAuthContext {
  tokenId: string;
  appId: string;
  clientId: string;
  userId: string;
  workspaceId: string;
  scopes: PublicScope[];
}

declare global {
  namespace Express {
    interface Request {
      publicAuth?: PublicAuthContext;
      publicAuthScopeUsed?: string;
    }
  }
}

export async function publicBearerAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new ApiError(401, 'unauthorized', 'Missing bearer token'));
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    next(new ApiError(401, 'unauthorized', 'Missing bearer token'));
    return;
  }

  const row = await queryOne<OAuthAccessTokenRow>(
    `SELECT t.id, t.app_id, a.client_id, t.user_id, t.workspace_id, t.scopes,
            t.expires_at, t.revoked_at, a.active AS app_active
       FROM oauth_access_tokens t
       JOIN oauth_apps a ON a.id = t.app_id
      WHERE t.token_hash = $1`,
    [hashToken(token)],
  );

  if (!row || row.revoked_at || !row.app_active) {
    next(new ApiError(401, 'unauthorized', 'Invalid bearer token'));
    return;
  }

  if (new Date(row.expires_at) <= new Date()) {
    next(new ApiError(401, 'unauthorized', 'Bearer token expired', { code: 'token_expired' }));
    return;
  }

  await pool.query('UPDATE oauth_access_tokens SET last_used_at = NOW() WHERE id = $1', [row.id]);

  req.publicAuth = {
    tokenId: row.id,
    appId: row.app_id,
    clientId: row.client_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    scopes: row.scopes ?? [],
  };

  next();
}
