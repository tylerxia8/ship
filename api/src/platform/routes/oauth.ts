import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/client.js';
import { authMiddleware } from '../../middleware/auth.js';
import { ApiError } from '../errors.js';
import {
  generateAccessToken,
  generateAuthorizationCode,
  generateDeviceCode,
  generateRefreshToken,
  generateUserCode,
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

const authorizationCodeTokenSchema = z.object({
  grant_type: z.literal('authorization_code'),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(32),
});

const deviceCodeTokenSchema = z.object({
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code'),
  client_id: z.string().min(1),
  device_code: z.string().min(1),
});

const refreshTokenSchema = z.object({
  grant_type: z.literal('refresh_token'),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  refresh_token: z.string().min(1),
});

const tokenBodySchema = z.discriminatedUnion('grant_type', [
  authorizationCodeTokenSchema,
  deviceCodeTokenSchema,
  refreshTokenSchema,
]);

const deviceCodeBodySchema = z.object({
  client_id: z.string().min(1),
  scope: z.string().optional(),
});

const deviceVerifyBodySchema = z.object({
  user_code: z.string().trim().min(1),
  approve: z.enum(['true', 'false']).default('true'),
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

interface DeviceCodeRow {
  id: string;
  app_id: string;
  workspace_id: string;
  scopes: string[];
  interval_seconds: number;
  expires_at: string;
  approved_user_id: string | null;
  approved_at: string | null;
  denied_at: string | null;
  last_polled_at: string | null;
  consumed_at: string | null;
}

interface RefreshTokenRow {
  id: string;
  token_family_id: string;
  app_id: string;
  user_id: string;
  workspace_id: string;
  scopes: string[];
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  invalidated_at: string | null;
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

async function issueTokens(app: OAuthAppRow, userId: string, workspaceId: string, scopes: string[]): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const familyResult = await client.query(
      `INSERT INTO oauth_token_families (app_id, user_id, workspace_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [app.id, userId, workspaceId],
    );
    const familyId = familyResult.rows[0].id;

    await client.query(
      `INSERT INTO oauth_access_tokens
        (token_hash, app_id, token_family_id, user_id, workspace_id, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')`,
      [hashToken(accessToken), app.id, familyId, userId, workspaceId, scopes],
    );

    await client.query(
      `INSERT INTO oauth_refresh_tokens
        (token_hash, token_family_id, app_id, user_id, workspace_id, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')`,
      [hashToken(refreshToken), familyId, app.id, userId, workspaceId, scopes],
    );

    await client.query('COMMIT');
    return { accessToken, refreshToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

    if (parsed.data.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      const app = await getActiveApp(parsed.data.client_id);
      const deviceRow = await queryOne<DeviceCodeRow>(
        `SELECT id, app_id, workspace_id, scopes, interval_seconds, expires_at,
                approved_user_id, approved_at, denied_at, last_polled_at, consumed_at
           FROM oauth_device_codes
          WHERE device_code_hash = $1`,
        [hashToken(parsed.data.device_code)],
      );

      if (!deviceRow || deviceRow.app_id !== app.id || new Date(deviceRow.expires_at) <= new Date()) {
        throw new ApiError(400, 'invalid_grant', 'Invalid or expired device_code');
      }

      if (deviceRow.denied_at) {
        throw new ApiError(400, 'invalid_grant', 'Device authorization was denied');
      }

      if (deviceRow.consumed_at) {
        throw new ApiError(400, 'invalid_grant', 'Device authorization code was already consumed');
      }

      if (deviceRow.last_polled_at) {
        const elapsedMs = Date.now() - new Date(deviceRow.last_polled_at).getTime();
        if (elapsedMs < deviceRow.interval_seconds * 1000) {
          await pool.query('UPDATE oauth_device_codes SET interval_seconds = interval_seconds + 5, last_polled_at = NOW() WHERE id = $1', [deviceRow.id]);
          res.status(400).json({
            code: 'slow_down',
            message: 'Polling too quickly',
            request_id: req.requestId,
          });
          return;
        }
      }

      await pool.query('UPDATE oauth_device_codes SET last_polled_at = NOW() WHERE id = $1', [deviceRow.id]);

      if (!deviceRow.approved_user_id || !deviceRow.approved_at) {
        res.status(400).json({
          code: 'authorization_pending',
          message: 'Device authorization is pending',
          request_id: req.requestId,
        });
        return;
      }

      await pool.query('UPDATE oauth_device_codes SET consumed_at = NOW() WHERE id = $1', [deviceRow.id]);
      const issued = await issueTokens(app, deviceRow.approved_user_id, deviceRow.workspace_id, deviceRow.scopes);
      res.json({
        token_type: 'Bearer',
        access_token: issued.accessToken,
        expires_in: 15 * 60,
        refresh_token: issued.refreshToken,
        scope: deviceRow.scopes.join(' '),
      });
      return;
    }

    if (parsed.data.grant_type === 'refresh_token') {
      const app = await getActiveApp(parsed.data.client_id);
      if (parsed.data.client_secret && !verifySecret(parsed.data.client_secret, app.client_secret_hash)) {
        throw new ApiError(401, 'unauthorized', 'Invalid client_secret');
      }

      const tokenRow = await queryOne<RefreshTokenRow>(
        `SELECT rt.id, rt.token_family_id, rt.app_id, rt.user_id, rt.workspace_id, rt.scopes,
                rt.expires_at, rt.used_at, rt.revoked_at, tf.invalidated_at
           FROM oauth_refresh_tokens rt
           JOIN oauth_token_families tf ON tf.id = rt.token_family_id
          WHERE rt.token_hash = $1`,
        [hashToken(parsed.data.refresh_token)],
      );

      if (!tokenRow || tokenRow.app_id !== app.id) {
        throw new ApiError(400, 'invalid_grant', 'Invalid refresh_token');
      }

      if (tokenRow.used_at || tokenRow.invalidated_at) {
        await pool.query('UPDATE oauth_token_families SET invalidated_at = COALESCE(invalidated_at, NOW()) WHERE id = $1', [tokenRow.token_family_id]);
        throw new ApiError(400, 'invalid_grant', 'Refresh token was already used');
      }

      if (tokenRow.revoked_at || new Date(tokenRow.expires_at) <= new Date()) {
        throw new ApiError(400, 'invalid_grant', 'Refresh token is expired or revoked');
      }

      const accessToken = generateAccessToken();
      const refreshToken = generateRefreshToken();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE oauth_refresh_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
        await client.query(
          `INSERT INTO oauth_access_tokens
            (token_hash, app_id, token_family_id, user_id, workspace_id, scopes, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')`,
          [hashToken(accessToken), app.id, tokenRow.token_family_id, tokenRow.user_id, tokenRow.workspace_id, tokenRow.scopes],
        );
        await client.query(
          `INSERT INTO oauth_refresh_tokens
            (token_hash, token_family_id, app_id, user_id, workspace_id, scopes, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')`,
          [hashToken(refreshToken), tokenRow.token_family_id, app.id, tokenRow.user_id, tokenRow.workspace_id, tokenRow.scopes],
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
        scope: tokenRow.scopes.join(' '),
      });
      return;
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE oauth_authorization_codes SET used_at = NOW() WHERE id = $1', [codeRow.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const issued = await issueTokens(app, codeRow.user_id, codeRow.workspace_id, codeRow.scopes);

    res.json({
      token_type: 'Bearer',
      access_token: issued.accessToken,
      expires_in: 15 * 60,
      refresh_token: issued.refreshToken,
      scope: codeRow.scopes.join(' '),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/device/code', async (req, res, next) => {
  try {
    const parsed = deviceCodeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid device code request', {
        issues: parsed.error.flatten(),
      });
    }

    const app = await getActiveApp(parsed.data.client_id);
    const scopes = requestedScopesFor(app, parsed.data.scope);
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const interval = 5;

    await pool.query(
      `INSERT INTO oauth_device_codes
        (app_id, workspace_id, device_code_hash, user_code_hash, scopes, interval_seconds, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')`,
      [app.id, app.workspace_id, hashToken(deviceCode), hashToken(userCode), scopes, interval],
    );

    res.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: '/oauth/device/verify',
      expires_in: 15 * 60,
      interval,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/device/verify', authMiddleware, async (req, res, next) => {
  try {
    const parsed = deviceVerifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid device verification request', {
        issues: parsed.error.flatten(),
      });
    }

    if (!req.userId || !req.workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    const deviceRow = await queryOne<DeviceCodeRow>(
      `SELECT id, app_id, workspace_id, scopes, interval_seconds, expires_at,
              approved_user_id, approved_at, denied_at, last_polled_at, consumed_at
         FROM oauth_device_codes
        WHERE user_code_hash = $1`,
      [hashToken(parsed.data.user_code.toUpperCase())],
    );

    if (!deviceRow || new Date(deviceRow.expires_at) <= new Date()) {
      throw new ApiError(400, 'invalid_grant', 'Invalid or expired user_code');
    }

    if (deviceRow.workspace_id !== req.workspaceId) {
      throw new ApiError(403, 'forbidden', 'User is not in the OAuth app workspace');
    }

    if (parsed.data.approve !== 'true') {
      await pool.query('UPDATE oauth_device_codes SET denied_at = NOW() WHERE id = $1', [deviceRow.id]);
      res.json({ approved: false });
      return;
    }

    await pool.query(
      'UPDATE oauth_device_codes SET approved_user_id = $1, approved_at = NOW() WHERE id = $2',
      [req.userId, deviceRow.id],
    );
    res.json({ approved: true });
  } catch (err) {
    next(err);
  }
});

export default router;
