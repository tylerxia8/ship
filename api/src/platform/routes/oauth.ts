import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/client.js';
import { authMiddleware } from '../../middleware/auth.js';
import { ApiError } from '../errors.js';
import {
  generateAccessToken,
  generateAuthorizationCode,
  generateRefreshToken,
  hashToken,
  pkceS256,
  verifySecret,
} from '../crypto.js';
import { parseScopes } from '../scopes.js';

const router = Router();

const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().min(32),
  code_challenge_method: z.literal('S256').default('S256'),
});

const consentBodySchema = authorizeQuerySchema.extend({
  approve: z.enum(['true', 'false']).default('true'),
});

const tokenBodySchema = z.object({
  grant_type: z.literal('authorization_code'),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(32),
});

interface OAuthAppRow {
  id: string;
  workspace_id: string;
  client_id: string;
  client_secret_hash: string;
  redirect_uris: string[];
  requested_scopes: string[];
  active: boolean;
  name: string;
}

interface AuthorizationCodeRow {
  id: string;
  app_id: string;
  workspace_id: string;
  user_id: string;
  redirect_uri: string;
  scopes: string[];
  code_challenge: string;
  code_challenge_method: string;
  expires_at: string;
  used_at: string | null;
}

function parseScopeParam(scope: string | undefined): string[] {
  return scope?.split(/\s+/).map((s) => s.trim()).filter(Boolean) ?? [];
}

async function getActiveApp(clientId: string): Promise<OAuthAppRow> {
  const app = await queryOne<OAuthAppRow>(
    `SELECT id, workspace_id, client_id, client_secret_hash, redirect_uris,
            requested_scopes, active, name
       FROM oauth_apps
      WHERE client_id = $1`,
    [clientId],
  );

  if (!app || !app.active) {
    throw new ApiError(400, 'validation_failed', 'Unknown or inactive OAuth app');
  }

  return app;
}

function assertRedirectUri(app: OAuthAppRow, redirectUri: string): void {
  if (!app.redirect_uris.includes(redirectUri)) {
    throw new ApiError(400, 'validation_failed', 'redirect_uri is not registered for this app');
  }
}

function requestedScopesFor(app: OAuthAppRow, scopeParam: string | undefined): string[] {
  const requested = parseScopes(parseScopeParam(scopeParam));
  const allowed = new Set(app.requested_scopes);
  const missing = requested.find((scope) => !allowed.has(scope));
  if (missing) {
    throw new ApiError(400, 'validation_failed', `App is not allowed to request scope: ${missing}`, {
      missing_scope: missing,
    });
  }
  return requested.length > 0 ? requested : parseScopes(app.requested_scopes);
}

router.get('/authorize', authMiddleware, async (req, res, next) => {
  try {
    const parsed = authorizeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid authorization request', {
        issues: parsed.error.flatten(),
      });
    }

    const app = await getActiveApp(parsed.data.client_id);
    assertRedirectUri(app, parsed.data.redirect_uri);
    const scopes = requestedScopesFor(app, parsed.data.scope);

    res.type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Authorize ${app.name}</title></head>
  <body>
    <main>
      <h1>Authorize ${app.name}</h1>
      <p>This app is requesting: ${scopes.join(', ') || 'no scopes'}.</p>
      <form method="post" action="/oauth/authorize/consent">
        ${Object.entries(parsed.data).map(([key, value]) => (
          `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, '&quot;')}">`
        )).join('\n        ')}
        <input type="hidden" name="approve" value="true">
        <button type="submit">Approve</button>
      </form>
    </main>
  </body>
</html>`);
  } catch (err) {
    next(err);
  }
});

router.post('/authorize/consent', authMiddleware, async (req, res, next) => {
  try {
    const parsed = consentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid consent request', {
        issues: parsed.error.flatten(),
      });
    }

    if (parsed.data.approve !== 'true') {
      const deniedUrl = new URL(parsed.data.redirect_uri);
      deniedUrl.searchParams.set('error', 'access_denied');
      if (parsed.data.state) deniedUrl.searchParams.set('state', parsed.data.state);
      res.redirect(deniedUrl.toString());
      return;
    }

    const app = await getActiveApp(parsed.data.client_id);
    assertRedirectUri(app, parsed.data.redirect_uri);
    const scopes = requestedScopesFor(app, parsed.data.scope);

    if (!req.userId || !req.workspaceId || req.workspaceId !== app.workspace_id) {
      throw new ApiError(403, 'forbidden', 'User is not in the OAuth app workspace');
    }

    const code = generateAuthorizationCode();
    await pool.query(
      `INSERT INTO oauth_authorization_codes
        (app_id, workspace_id, user_id, code_hash, redirect_uri, scopes,
         code_challenge, code_challenge_method, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '10 minutes')`,
      [
        app.id,
        app.workspace_id,
        req.userId,
        hashToken(code),
        parsed.data.redirect_uri,
        scopes,
        parsed.data.code_challenge,
        parsed.data.code_challenge_method,
      ],
    );

    const redirectUrl = new URL(parsed.data.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (parsed.data.state) redirectUrl.searchParams.set('state', parsed.data.state);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    next(err);
  }
});

router.post('/token', async (req, res, next) => {
  try {
    const parsed = tokenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid token request', {
        issues: parsed.error.flatten(),
      });
    }

    const app = await getActiveApp(parsed.data.client_id);
    assertRedirectUri(app, parsed.data.redirect_uri);

    if (parsed.data.client_secret && !verifySecret(parsed.data.client_secret, app.client_secret_hash)) {
      throw new ApiError(401, 'unauthorized', 'Invalid client_secret');
    }

    const codeRow = await queryOne<AuthorizationCodeRow>(
      `SELECT id, app_id, workspace_id, user_id, redirect_uri, scopes,
              code_challenge, code_challenge_method, expires_at, used_at
         FROM oauth_authorization_codes
        WHERE code_hash = $1`,
      [hashToken(parsed.data.code)],
    );

    if (!codeRow || codeRow.app_id !== app.id || codeRow.redirect_uri !== parsed.data.redirect_uri) {
      throw new ApiError(400, 'invalid_grant', 'Invalid authorization code');
    }

    if (codeRow.used_at || new Date(codeRow.expires_at) <= new Date()) {
      throw new ApiError(400, 'invalid_grant', 'Authorization code is expired or already used');
    }

    if (codeRow.code_challenge_method !== 'S256' || pkceS256(parsed.data.code_verifier) !== codeRow.code_challenge) {
      throw new ApiError(400, 'invalid_grant', 'Invalid code_verifier');
    }

    const accessToken = generateAccessToken();
    const refreshToken = generateRefreshToken();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE oauth_authorization_codes SET used_at = NOW() WHERE id = $1', [codeRow.id]);

      const familyResult = await client.query(
        `INSERT INTO oauth_token_families (app_id, user_id, workspace_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [app.id, codeRow.user_id, codeRow.workspace_id],
      );
      const familyId = familyResult.rows[0].id;

      await client.query(
        `INSERT INTO oauth_access_tokens
          (token_hash, app_id, token_family_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')`,
        [hashToken(accessToken), app.id, familyId, codeRow.user_id, codeRow.workspace_id, codeRow.scopes],
      );

      await client.query(
        `INSERT INTO oauth_refresh_tokens
          (token_hash, token_family_id, app_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')`,
        [hashToken(refreshToken), familyId, app.id, codeRow.user_id, codeRow.workspace_id, codeRow.scopes],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: 15 * 60,
      refresh_token: refreshToken,
      scope: codeRow.scopes.join(' '),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
