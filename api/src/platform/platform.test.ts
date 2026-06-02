import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import http from 'http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';
import { hashToken } from './crypto.js';
import { processDueWebhookDeliveries } from './webhooks.js';
import { clearPublicRateLimitBuckets } from './ratelimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Plugforge public API foundation', () => {
  const app = createApp();
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const adminEmail = `plugforge-admin-${testRunId}@ship.local`;

  let workspaceId: string;
  let adminUserId: string;
  let memberUserId: string;
  let sessionCookie: string;
  let csrfToken: string;
  let memberSessionCookie: string;
  let memberCsrfToken: string;
  let clientId: string;
  let clientSecret: string;
  let oauthAppId: string;
  let accessToken: string;
  let refreshToken: string;

  function verifyWebhookSignature(headers: http.IncomingHttpHeaders, rawBody: string, secret: string): boolean {
    const signatureHeader = headers['ship-signature'];
    const value = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!value) return false;
    const parts = Object.fromEntries(value.split(',').map((part) => {
      const [key, val] = part.split('=');
      return [key, val];
    }));
    const timestamp = Number(parts.t);
    const signature = parts.v1;
    if (!timestamp || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const actualBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  }

  async function waitForAuditRow(whereSql: string, params: unknown[]): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await pool.query(
        `SELECT client_id, method, route, scope_used, status
           FROM public_api_audit_log
          WHERE ${whereSql}
          ORDER BY created_at DESC
          LIMIT 1`,
        params,
      );
      if (result.rows[0]) return result.rows[0];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for public API audit row');
  }

  beforeAll(async () => {
    const migration041Sql = readFileSync(join(__dirname, '../db/migrations/041_plugforge_platform.sql'), 'utf8');
    const migration042Sql = readFileSync(join(__dirname, '../db/migrations/042_device_code_consumed_at.sql'), 'utf8');
    const migration043Sql = readFileSync(join(__dirname, '../db/migrations/043_webhook_signing_secret.sql'), 'utf8');
    await pool.query(migration041Sql);
    await pool.query(migration042Sql);
    await pool.query(migration043Sql);

    const workspace = await pool.query(
      'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
      [`Plugforge ${testRunId}`],
    );
    workspaceId = workspace.rows[0].id;

    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, name, last_workspace_id)
       VALUES ($1, 'test-hash', 'Plugforge Admin', $2)
       RETURNING id`,
      [adminEmail, workspaceId],
    );
    adminUserId = admin.rows[0].id;

    const member = await pool.query(
      `INSERT INTO users (email, password_hash, name, last_workspace_id)
       VALUES ($1, 'test-hash', 'Plugforge Member', $2)
       RETURNING id`,
      [`plugforge-member-${testRunId}@ship.local`, workspaceId],
    );
    memberUserId = member.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin'), ($1, $3, 'member')`,
      [workspaceId, adminUserId, memberUserId],
    );

    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, adminUserId, workspaceId],
    );
    sessionCookie = `session_id=${sessionId}`;

    const csrfResponse = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', sessionCookie);
    csrfToken = csrfResponse.body.token;
    const connectSidCookie = csrfResponse.headers['set-cookie']?.[0]?.split(';')[0] || '';
    if (connectSidCookie) {
      sessionCookie = `${sessionCookie}; ${connectSidCookie}`;
    }

    const memberSessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [memberSessionId, memberUserId, workspaceId],
    );
    memberSessionCookie = `session_id=${memberSessionId}`;

    const memberCsrfResponse = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', memberSessionCookie);
    memberCsrfToken = memberCsrfResponse.body.token;
    const memberConnectSidCookie = memberCsrfResponse.headers['set-cookie']?.[0]?.split(';')[0] || '';
    if (memberConnectSidCookie) {
      memberSessionCookie = `${memberSessionCookie}; ${memberConnectSidCookie}`;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public_api_audit_log WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM oauth_access_tokens WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM oauth_refresh_tokens WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM oauth_token_families WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM oauth_authorization_codes WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM oauth_device_codes WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM webhook_deliveries WHERE event_id IN (SELECT id FROM webhook_events WHERE workspace_id = $1)', [workspaceId]);
    await pool.query('DELETE FROM webhook_events WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM webhook_subscriptions WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM oauth_apps WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [adminUserId, memberUserId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUserId, memberUserId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  });

  it('serves the public OpenAPI 3.1 contract', async () => {
    const response = await request(app).get('/api/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths['/scopes'].get['x-required-scope']).toBeNull();
    expect(response.body.paths['/webhooks/events'].get['x-required-scope']).toBeNull();
    expect(response.body.paths['/documents'].get['x-required-scope']).toBe('documents:read');
    expect(response.body.paths['/documents'].post['x-required-scope']).toBe('documents:write');
    expect(response.body.paths['/webhooks/subscriptions'].post['x-required-scope']).toBe('webhooks:manage');
    expect(response.body.paths['/webhooks/deliveries'].get['x-required-scope']).toBe('webhooks:manage');
  });

  it('serves the public scope registry without a bearer token', async () => {
    const response = await request(app).get('/api/v1/scopes');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'documents:read',
        description: expect.any(String),
      }),
      expect.objectContaining({
        name: 'webhooks:manage',
        description: expect.any(String),
      }),
    ]));
    expect(response.body.next_cursor).toBeNull();
  });

  it('serves the public webhook event registry without a bearer token', async () => {
    const response = await request(app).get('/api/v1/webhooks/events');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [
        {
          type: 'document.created',
          description: expect.any(String),
          required_scope: 'documents:read',
        },
      ],
      next_cursor: null,
    });
  });

  it('rejects OAuth app management for non-admin workspace members', async () => {
    const listResponse = await request(app)
      .get('/api/v1/oauth/apps')
      .set('Cookie', memberSessionCookie);

    expect(listResponse.status).toBe(403);
    expect(listResponse.body.code).toBe('forbidden');

    const createResponse = await request(app)
      .post('/api/v1/oauth/apps')
      .set('Cookie', memberSessionCookie)
      .set('x-csrf-token', memberCsrfToken)
      .send({
        name: 'Member App',
        redirect_uris: ['https://example.com/member-callback'],
        requested_scopes: ['documents:read'],
      });

    expect(createResponse.status).toBe(403);
    expect(createResponse.body.code).toBe('forbidden');
  });

  it('registers an OAuth app and shows the raw secret once', async () => {
    const response = await request(app)
      .post('/api/v1/oauth/apps')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Plugforge Test App',
        redirect_uris: ['https://example.com/callback'],
        requested_scopes: ['documents:read', 'documents:write', 'webhooks:manage'],
      });

    expect(response.status).toBe(201);
    oauthAppId = response.body.app.id;
    expect(response.body.app.client_id).toMatch(/^ship_app_/);
    expect(response.body.client_secret).toMatch(/^ship_sk_/);
    expect(response.body.app.client_secret_hash).toBeUndefined();
    clientId = response.body.app.client_id;
    clientSecret = response.body.client_secret;

    const listResponse = await request(app)
      .get('/api/v1/oauth/apps')
      .set('Cookie', sessionCookie);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data[0]).toMatchObject({
      client_id: clientId,
      name: 'Plugforge Test App',
    });
    expect(listResponse.body.data[0].client_secret_hash).toBeUndefined();
    expect(listResponse.body.data[0].client_secret).toBeUndefined();
  });

  it('rotates OAuth app secrets and invalidates the old secret', async () => {
    const verifier = `rotate-${crypto.randomBytes(32).toString('base64url')}`;
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const authParams = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://example.com/callback',
      scope: 'documents:read',
      state: 'rotate-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };

    const consentResponse = await request(app)
      .post('/oauth/authorize/consent')
      .set('Cookie', sessionCookie)
      .type('form')
      .send({ ...authParams, approve: 'true' });

    const code = new URL(String(consentResponse.headers.location)).searchParams.get('code');

    const rotateResponse = await request(app)
      .post(`/api/v1/oauth/apps/${oauthAppId}/rotate-secret`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    expect(rotateResponse.status).toBe(200);
    expect(rotateResponse.body.client_secret).toMatch(/^ship_sk_/);
    expect(rotateResponse.body.app.client_secret_hash).toBeUndefined();

    const oldSecretResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: 'https://example.com/callback',
        code_verifier: verifier,
      });

    expect(oldSecretResponse.status).toBe(401);
    expect(oldSecretResponse.body.code).toBe('unauthorized');

    const newSecretResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: rotateResponse.body.client_secret,
        code,
        redirect_uri: 'https://example.com/callback',
        code_verifier: verifier,
      });

    expect(newSecretResponse.status).toBe(200);
    clientSecret = rotateResponse.body.client_secret;
  });

  it('completes Authorization Code + PKCE and rejects a wrong verifier', async () => {
    const verifier = `verifier-${crypto.randomBytes(32).toString('base64url')}`;
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    const deniedVerifier = `wrong-${crypto.randomBytes(32).toString('base64url')}`;
    const authParams = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://example.com/callback',
      scope: 'documents:read documents:write',
      state: 'test-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };

    const consentResponse = await request(app)
      .post('/oauth/authorize/consent')
      .set('Cookie', sessionCookie)
      .type('form')
      .send({ ...authParams, approve: 'true' });

    expect(consentResponse.status).toBe(302);
    const location = consentResponse.headers.location;
    expect(location).toEqual(expect.any(String));
    const redirect = new URL(String(location));
    expect(redirect.origin + redirect.pathname).toBe('https://example.com/callback');
    expect(redirect.searchParams.get('state')).toBe('test-state');
    const code = redirect.searchParams.get('code');
    expect(code).toMatch(/^ship_code_/);

    const wrongTokenResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: 'https://example.com/callback',
        code_verifier: deniedVerifier,
      });

    expect(wrongTokenResponse.status).toBe(400);
    expect(wrongTokenResponse.body.code).toBe('invalid_grant');
    expect(wrongTokenResponse.body.message).toBe('Invalid code_verifier');

    const tokenResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: 'https://example.com/callback',
        code_verifier: verifier,
      });

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.access_token).toMatch(/^ship_at_/);
    expect(tokenResponse.body.refresh_token).toMatch(/^ship_rt_/);
    expect(tokenResponse.body.scope).toBe('documents:read documents:write');
    refreshToken = tokenResponse.body.refresh_token;
  });

  it('rotates refresh tokens and rejects replay of the spent token', async () => {
    const rotateResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });

    expect(rotateResponse.status).toBe(200);
    expect(rotateResponse.body.access_token).toMatch(/^ship_at_/);
    expect(rotateResponse.body.refresh_token).toMatch(/^ship_rt_/);
    expect(rotateResponse.body.refresh_token).not.toBe(refreshToken);

    const replayResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });

    expect(replayResponse.status).toBe(400);
    expect(replayResponse.body.code).toBe('invalid_grant');
    expect(replayResponse.body.message).toBe('Refresh token was already used');

    const revokedAccessResponse = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${rotateResponse.body.access_token}`);
    expect(revokedAccessResponse.status).toBe(401);
    expect(revokedAccessResponse.body.code).toBe('unauthorized');
  });

  it('completes Device Authorization Grant with pending and slow_down branches', async () => {
    const deviceCodeResponse = await request(app)
      .post('/oauth/device/code')
      .send({
        client_id: clientId,
        scope: 'documents:read',
      });

    expect(deviceCodeResponse.status).toBe(200);
    expect(deviceCodeResponse.body.device_code).toMatch(/^ship_dc_/);
    expect(deviceCodeResponse.body.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(deviceCodeResponse.body.interval).toBe(5);

    const verifyPageResponse = await request(app)
      .get(`/oauth/device/verify?user_code=${encodeURIComponent(deviceCodeResponse.body.user_code)}`)
      .set('Cookie', sessionCookie);

    expect(verifyPageResponse.status).toBe(200);
    expect(verifyPageResponse.headers['x-frame-options']).toBe('DENY');
    expect(verifyPageResponse.headers['cache-control']).toBe('no-store');
    expect(verifyPageResponse.text).toContain('Verify Ship Device');
    expect(verifyPageResponse.text).toContain(deviceCodeResponse.body.user_code);

    const pendingResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCodeResponse.body.device_code,
      });

    expect(pendingResponse.status).toBe(400);
    expect(pendingResponse.body.code).toBe('authorization_pending');

    const slowDownResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCodeResponse.body.device_code,
      });

    expect(slowDownResponse.status).toBe(400);
    expect(slowDownResponse.body.code).toBe('slow_down');

    const verifyResponse = await request(app)
      .post('/oauth/device/verify')
      .set('Cookie', sessionCookie)
      .send({
        user_code: ` ${deviceCodeResponse.body.user_code.toLowerCase()} `,
        approve: 'true',
      });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.approved).toBe(true);

    await pool.query(
      `UPDATE oauth_device_codes
          SET last_polled_at = NOW() - INTERVAL '30 seconds'
        WHERE device_code_hash = $1`,
      [hashToken(deviceCodeResponse.body.device_code)],
    );

    const tokenResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCodeResponse.body.device_code,
      });

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.access_token).toMatch(/^ship_at_/);
    expect(tokenResponse.body.refresh_token).toMatch(/^ship_rt_/);
    expect(tokenResponse.body.scope).toBe('documents:read');

    const meResponse = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tokenResponse.body.access_token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.workspace.id).toBe(workspaceId);

    const replayResponse = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCodeResponse.body.device_code,
      });

    expect(replayResponse.status).toBe(400);
    expect(replayResponse.body.code).toBe('invalid_grant');
  });

  it('returns ApiError shape for missing bearer token', async () => {
    const response = await request(app).get('/api/v1/me');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'unauthorized',
      message: 'Missing bearer token',
    });
    expect(response.body.request_id).toEqual(expect.any(String));
  });

  it('enforces scope requirements with the missing scope named', async () => {
    accessToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
    const appRow = await pool.query('SELECT id FROM oauth_apps WHERE client_id = $1', [clientId]);
    const appId = appRow.rows[0].id;
    await pool.query(
      `INSERT INTO oauth_access_tokens
        (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
      [hashToken(accessToken), appId, adminUserId, workspaceId, ['documents:read']],
    );

    const response = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Should fail' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('forbidden');
    expect(response.body.details.missing_scope).toBe('documents:write');
  });

  it('delivers a signed document.created webhook from the public documents API', async () => {
    const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(204).end();
      });
    });

    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected receiver port');

    try {
      const webhookToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
      const appRow = await pool.query('SELECT id FROM oauth_apps WHERE client_id = $1', [clientId]);
      const appId = appRow.rows[0].id;
      await pool.query(
        `INSERT INTO oauth_access_tokens
          (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
        [hashToken(webhookToken), appId, adminUserId, workspaceId, ['documents:write', 'webhooks:manage']],
      );

      const subscriptionResponse = await request(app)
        .post('/api/v1/webhooks/subscriptions')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({
          event_type: 'document.created',
          target_url: `http://127.0.0.1:${address.port}/ship-webhook`,
        });

      expect(subscriptionResponse.status).toBe(201);
      expect(subscriptionResponse.body.signing_secret).toMatch(/^ship_whsec_/);
      expect(subscriptionResponse.body.data.signing_secret).toBeUndefined();

      const createResponse = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({ title: 'Webhook Proof' });

      expect(createResponse.status).toBe(201);
      expect(received).toHaveLength(1);
      const webhookRequest = received[0]!;
      expect(webhookRequest.headers['ship-event-type']).toBe('document.created');
      expect(verifyWebhookSignature(webhookRequest.headers, webhookRequest.body, subscriptionResponse.body.signing_secret)).toBe(true);

      const payload = JSON.parse(webhookRequest.body);
      expect(payload.type).toBe('document.created');
      expect(payload.data.document.title).toBe('Webhook Proof');

      const delivery = await pool.query(
        `SELECT status, response_status, attempt_number
           FROM webhook_deliveries
          WHERE idempotency_key = $1`,
        [`document.created:${createResponse.body.data.id}`],
      );
      expect(delivery.rows[0]).toMatchObject({
        status: 'delivered',
        response_status: 204,
        attempt_number: 1,
      });
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it('rotates and deactivates webhook subscriptions', async () => {
    const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(204).end();
      });
    });

    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected receiver port');

    try {
      const webhookToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
      const appRow = await pool.query('SELECT id FROM oauth_apps WHERE client_id = $1', [clientId]);
      const appId = appRow.rows[0].id;
      await pool.query(
        `INSERT INTO oauth_access_tokens
          (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
        [hashToken(webhookToken), appId, adminUserId, workspaceId, ['documents:write', 'webhooks:manage']],
      );

      const subscriptionResponse = await request(app)
        .post('/api/v1/webhooks/subscriptions')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({
          event_type: 'document.created',
          target_url: `http://127.0.0.1:${address.port}/ship-webhook-lifecycle`,
        });

      expect(subscriptionResponse.status).toBe(201);
      const subscriptionId = subscriptionResponse.body.data.id;
      const oldSecret = subscriptionResponse.body.signing_secret;

      const rotateResponse = await request(app)
        .post(`/api/v1/webhooks/subscriptions/${subscriptionId}/rotate-secret`)
        .set('Authorization', `Bearer ${webhookToken}`);

      expect(rotateResponse.status).toBe(200);
      expect(rotateResponse.body.signing_secret).toMatch(/^ship_whsec_/);
      expect(rotateResponse.body.signing_secret).not.toBe(oldSecret);
      expect(rotateResponse.body.data.signing_secret).toBeUndefined();
      expect(rotateResponse.body.data.signing_secret_hash).toBeUndefined();

      await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({ title: 'Webhook Rotation Proof' })
        .expect(201);

      expect(received).toHaveLength(1);
      const rotatedRequest = received[0]!;
      expect(verifyWebhookSignature(rotatedRequest.headers, rotatedRequest.body, oldSecret)).toBe(false);
      expect(verifyWebhookSignature(rotatedRequest.headers, rotatedRequest.body, rotateResponse.body.signing_secret)).toBe(true);

      const deliveriesBeforeDeactivate = await pool.query(
        'SELECT COUNT(*)::int AS count FROM webhook_deliveries WHERE subscription_id = $1',
        [subscriptionId],
      );

      const deactivateResponse = await request(app)
        .post(`/api/v1/webhooks/subscriptions/${subscriptionId}/deactivate`)
        .set('Authorization', `Bearer ${webhookToken}`);

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.data.active).toBe(false);

      await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({ title: 'Webhook Deactivation Proof' })
        .expect(201);

      expect(received).toHaveLength(1);
      const deliveriesAfterDeactivate = await pool.query(
        'SELECT COUNT(*)::int AS count FROM webhook_deliveries WHERE subscription_id = $1',
        [subscriptionId],
      );
      expect(deliveriesAfterDeactivate.rows[0].count).toBe(deliveriesBeforeDeactivate.rows[0].count);
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it('schedules retry_pending webhooks and processes due retries', async () => {
    let fail = true;
    const received: string[] = [];
    const receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        received.push(Buffer.concat(chunks).toString('utf8'));
        if (fail) {
          res.writeHead(500).end('temporary failure');
        } else {
          res.writeHead(204).end();
        }
      });
    });

    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected receiver port');

    try {
      const webhookToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
      const appRow = await pool.query('SELECT id FROM oauth_apps WHERE client_id = $1', [clientId]);
      const appId = appRow.rows[0].id;
      await pool.query(
        `INSERT INTO oauth_access_tokens
          (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
        [hashToken(webhookToken), appId, adminUserId, workspaceId, ['documents:write', 'webhooks:manage']],
      );

      const subscriptionResponse = await request(app)
        .post('/api/v1/webhooks/subscriptions')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({
          event_type: 'document.created',
          target_url: `http://127.0.0.1:${address.port}/ship-webhook-retry`,
        })
        .expect(201);

      const createResponse = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({ title: 'Webhook Retry Proof' })
        .expect(201);

      const pending = await pool.query(
        `SELECT id, status, response_status, attempt_number, next_attempt_at
           FROM webhook_deliveries
          WHERE idempotency_key = $1
            AND subscription_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [`document.created:${createResponse.body.data.id}`, subscriptionResponse.body.data.id],
      );
      expect(pending.rows[0]).toMatchObject({
        status: 'retry_pending',
        response_status: 500,
        attempt_number: 1,
      });
      expect(pending.rows[0].next_attempt_at).toBeTruthy();

      fail = false;
      await pool.query(
        `UPDATE webhook_deliveries
            SET next_attempt_at = NOW() - INTERVAL '1 second'
          WHERE id = $1`,
        [pending.rows[0].id],
      );

      const processed = await processDueWebhookDeliveries();
      expect(processed).toBeGreaterThanOrEqual(1);
      expect(received).toHaveLength(2);

      const deliveriesResponse = await request(app)
        .get('/api/v1/webhooks/deliveries')
        .set('Authorization', `Bearer ${webhookToken}`);

      expect(deliveriesResponse.status).toBe(200);
      const retriedDelivery = deliveriesResponse.body.data.find(
        (delivery: Record<string, unknown>) => delivery.subscription_id === subscriptionResponse.body.data.id
          && delivery.attempt_number === 2,
      );
      expect(retriedDelivery).toMatchObject({
        status: 'delivered',
        response_status: 204,
        attempt_number: 2,
      });
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it('dead-letters permanent webhook subscriber failures', async () => {
    const received: string[] = [];
    const receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        received.push(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(410).end('subscriber endpoint removed');
      });
    });

    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected receiver port');

    try {
      const webhookToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
      const appRow = await pool.query('SELECT id FROM oauth_apps WHERE client_id = $1', [clientId]);
      const appId = appRow.rows[0].id;
      await pool.query(
        `INSERT INTO oauth_access_tokens
          (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
        [hashToken(webhookToken), appId, adminUserId, workspaceId, ['documents:write', 'webhooks:manage']],
      );

      const subscriptionResponse = await request(app)
        .post('/api/v1/webhooks/subscriptions')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({
          event_type: 'document.created',
          target_url: `http://127.0.0.1:${address.port}/ship-webhook-dead-letter`,
        })
        .expect(201);

      const createResponse = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({ title: 'Webhook Dead Letter Proof' })
        .expect(201);

      expect(received).toHaveLength(1);
      const delivery = await pool.query(
        `SELECT status, response_status, attempt_number, next_attempt_at
           FROM webhook_deliveries
          WHERE idempotency_key = $1
            AND subscription_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [`document.created:${createResponse.body.data.id}`, subscriptionResponse.body.data.id],
      );

      expect(delivery.rows[0]).toMatchObject({
        status: 'dead_letter',
        response_status: 410,
        attempt_number: 1,
      });
      expect(delivery.rows[0].next_attempt_at).toBeNull();

      const processed = await processDueWebhookDeliveries();
      expect(processed).toBe(0);
      expect(received).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it('honors Retry-After on transient webhook subscriber rate limits', async () => {
    const receiver = http.createServer((_req, res) => {
      res.writeHead(429, { 'Retry-After': '7' }).end('rate limited');
    });

    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected receiver port');

    try {
      const webhookToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
      const appRow = await pool.query('SELECT id FROM oauth_apps WHERE client_id = $1', [clientId]);
      const appId = appRow.rows[0].id;
      await pool.query(
        `INSERT INTO oauth_access_tokens
          (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
        [hashToken(webhookToken), appId, adminUserId, workspaceId, ['documents:write', 'webhooks:manage']],
      );

      const subscriptionResponse = await request(app)
        .post('/api/v1/webhooks/subscriptions')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({
          event_type: 'document.created',
          target_url: `http://127.0.0.1:${address.port}/ship-webhook-rate-limit`,
        })
        .expect(201);

      const createResponse = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${webhookToken}`)
        .send({ title: 'Webhook Retry After Proof' })
        .expect(201);

      const delivery = await pool.query(
        `SELECT status, response_status, attempt_number,
                next_attempt_at >= NOW() + INTERVAL '6 seconds' AS retry_after_lower_bound,
                next_attempt_at <= NOW() + INTERVAL '8 seconds' AS retry_after_upper_bound
           FROM webhook_deliveries
          WHERE idempotency_key = $1
            AND subscription_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [`document.created:${createResponse.body.data.id}`, subscriptionResponse.body.data.id],
      );

      expect(delivery.rows[0]).toMatchObject({
        status: 'retry_pending',
        response_status: 429,
        attempt_number: 1,
        retry_after_lower_bound: true,
        retry_after_upper_bound: true,
      });
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it('allows an authorized public token to call me and list documents', async () => {
    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, created_by, visibility)
       VALUES ($1, 'wiki', 'Public API Doc', $2, 'workspace')`,
      [workspaceId, adminUserId],
    );

    const meResponse = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(adminEmail);

    const listResponse = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(listResponse.body.next_cursor).toBeDefined();

    const auditRow = await waitForAuditRow(
      'workspace_id = $1 AND client_id = $2 AND method = $3 AND scope_used = $4 AND status = $5',
      [workspaceId, clientId, 'GET', 'documents:read', 200],
    );

    expect(auditRow.route).toBe('/api/v1/documents/');
  });

  it('reads public documents by id without leaking missing or private documents', async () => {
    const publicDoc = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, created_by, visibility)
       VALUES ($1, 'wiki', 'Public API Read Proof', $2, 'workspace')
       RETURNING id`,
      [workspaceId, adminUserId],
    );
    const privateDoc = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, created_by, visibility)
       VALUES ($1, 'wiki', 'Private API Read Proof', $2, 'private')
       RETURNING id`,
      [workspaceId, adminUserId],
    );
    const publicDocId = publicDoc.rows[0]?.id;
    const privateDocId = privateDoc.rows[0]?.id;
    if (!publicDocId || !privateDocId) throw new Error('Expected inserted document ids');

    const foundResponse = await request(app)
      .get(`/api/v1/documents/${publicDocId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(foundResponse.status).toBe(200);
    expect(foundResponse.body.data).toMatchObject({
      id: publicDocId,
      title: 'Public API Read Proof',
      document_type: 'wiki',
    });

    const privateResponse = await request(app)
      .get(`/api/v1/documents/${privateDocId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(privateResponse.status).toBe(404);
    expect(privateResponse.body.code).toBe('not_found');

    const missingResponse = await request(app)
      .get(`/api/v1/documents/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body.code).toBe('not_found');
  });

  it('paginates public documents with stable cursors and rejects invalid cursors', async () => {
    const rows = [
      ['Public Pagination Old', '2026-01-01T12:00:00.000Z'],
      ['Public Pagination Middle', '2026-01-02T12:00:00.000Z'],
      ['Public Pagination New', '2026-01-03T12:00:00.000Z'],
    ];

    for (const [title, timestamp] of rows) {
      await pool.query(
        `INSERT INTO documents
          (workspace_id, document_type, title, created_by, visibility, created_at, updated_at)
         VALUES ($1, 'weekly_retro', $2, $3, 'workspace', $4, $4)`,
        [workspaceId, title, adminUserId, timestamp],
      );
    }

    const invalidCursorResponse = await request(app)
      .get('/api/v1/documents?cursor=not-a-cursor')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(invalidCursorResponse.status).toBe(400);
    expect(invalidCursorResponse.body.code).toBe('validation_failed');

    const firstPage = await request(app)
      .get('/api/v1/documents?type=weekly_retro&limit=2')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.map((document: Record<string, unknown>) => document.title)).toEqual([
      'Public Pagination New',
      'Public Pagination Middle',
    ]);
    expect(firstPage.body.next_cursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(`/api/v1/documents?type=weekly_retro&limit=2&cursor=${encodeURIComponent(firstPage.body.next_cursor)}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.map((document: Record<string, unknown>) => document.title)).toEqual([
      'Public Pagination Old',
    ]);
    expect(secondPage.body.next_cursor).toBeNull();
  });

  it('deactivates OAuth apps and immediately rejects their bearer tokens', async () => {
    const deactivatedToken = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
    await pool.query(
      `INSERT INTO oauth_access_tokens
        (token_hash, app_id, user_id, workspace_id, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
      [hashToken(deactivatedToken), oauthAppId, adminUserId, workspaceId, ['documents:read']],
    );

    const beforeResponse = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${deactivatedToken}`);
    expect(beforeResponse.status).toBe(200);

    const deactivateResponse = await request(app)
      .post(`/api/v1/oauth/apps/${oauthAppId}/deactivate`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.app.active).toBe(false);
    expect(deactivateResponse.body.app.client_secret).toBeUndefined();
    expect(deactivateResponse.body.app.client_secret_hash).toBeUndefined();

    const afterResponse = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${deactivatedToken}`);
    expect(afterResponse.status).toBe(401);
    expect(afterResponse.body.code).toBe('unauthorized');
  });

  it('rate limits bearer tokens independently before auth validation', async () => {
    const previousLimit = process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE;
    process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE = '2';
    clearPublicRateLimitBuckets();
    const auditBefore = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM public_api_audit_log
        WHERE route = '/api/v1/me'
          AND status = 429`,
    );

    try {
      const firstToken = `ship_at_rate_${crypto.randomBytes(16).toString('base64url')}`;
      const secondToken = `ship_at_rate_${crypto.randomBytes(16).toString('base64url')}`;

      await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(401);
      await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(401);

      const limitedResponse = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${firstToken}`);
      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.body.code).toBe('rate_limited');

      const auditRow = await waitForAuditRow(
        'route = $1 AND status = $2 AND created_at >= NOW() - INTERVAL \'10 seconds\'',
        ['/api/v1/me', 429],
      );
      expect(auditRow.status).toBe(429);

      const independentTokenResponse = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${secondToken}`);
      expect(independentTokenResponse.status).toBe(401);
      expect(independentTokenResponse.headers['ratelimit-remaining']).toBe('1');

      const auditAfter = await pool.query(
        `SELECT COUNT(*)::int AS count
           FROM public_api_audit_log
          WHERE route = '/api/v1/me'
            AND status = 429`,
      );
      expect(auditAfter.rows[0].count).toBeGreaterThan(auditBefore.rows[0].count);
    } finally {
      if (previousLimit === undefined) {
        delete process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE;
      } else {
        process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE = previousLimit;
      }
      clearPublicRateLimitBuckets();
    }
  });
});
