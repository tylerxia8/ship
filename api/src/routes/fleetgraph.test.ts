import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('FleetGraph findings API', () => {
  const app = createApp();
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const testEmail = `fleetgraph-${testRunId}@ship.local`;
  const workspaceName = `FleetGraph Test ${testRunId}`;

  let sessionCookie: string;
  let csrfToken: string;
  let workspaceId: string;
  let userId: string;
  let scopeId: string;

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [workspaceName],
    );
    workspaceId = workspaceResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph User')
       RETURNING id`,
      [testEmail],
    );
    userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [workspaceId, userId],
    );

    const scopeResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, created_by)
       VALUES ($1, 'sprint', 'FleetGraph Sprint', $2)
       RETURNING id`,
      [workspaceId, userId],
    );
    scopeId = scopeResult.rows[0].id;

    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, userId, workspaceId],
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
  });

  afterAll(async () => {
    await pool.query('DELETE FROM fleetgraph_findings WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  });

  it('creates, lists, upserts, and resolves a finding', async () => {
    const createResponse = await request(app)
      .post('/api/fleetgraph/findings')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        scopeType: 'sprint',
        scopeId,
        findingHash: `load-risk-${testRunId}`,
        title: 'Capacity risk',
        body: 'One person is carrying more work than planned.',
        confidence: 'medium',
        citations: [scopeId],
        suggestedActions: [{ kind: 'rebalance', label: 'Rebalance sprint work' }],
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.finding.status).toBe('open');
    const findingId = createResponse.body.finding.id;

    const upsertResponse = await request(app)
      .post('/api/fleetgraph/findings')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        scopeType: 'sprint',
        scopeId,
        findingHash: `load-risk-${testRunId}`,
        title: 'Capacity risk updated',
        body: 'The same risk is still present.',
        confidence: 'high',
        citations: [scopeId],
        suggestedActions: [],
      });

    expect(upsertResponse.status).toBe(201);
    expect(upsertResponse.body.finding.id).toBe(findingId);
    expect(upsertResponse.body.finding.title).toBe('Capacity risk updated');

    const listResponse = await request(app)
      .get('/api/fleetgraph/findings?status=open')
      .set('Cookie', sessionCookie);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.total).toBeGreaterThanOrEqual(1);
    expect(listResponse.body.findings.some((finding: any) => finding.id === findingId)).toBe(true);

    const patchResponse = await request(app)
      .patch(`/api/fleetgraph/findings/${findingId}`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ status: 'resolved' });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.success).toBe(true);
    expect(patchResponse.body.finding.status).toBe('resolved');
  });

  it('validates manual scans before proxying to the agent', async () => {
    const response = await request(app)
      .post('/api/fleetgraph/scan')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ scopeType: 'sprint' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toBe('scopeType and scopeId are required');
  });
});
