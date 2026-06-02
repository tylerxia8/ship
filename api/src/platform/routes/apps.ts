import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool, queryOne } from '../../db/client.js';
import { authMiddleware } from '../../middleware/auth.js';
import { ApiError } from '../errors.js';
import { generateClientId, generateClientSecret, hashSecret } from '../crypto.js';
import { parseScopes } from '../scopes.js';
import { deliverWebhook } from '../webhooks.js';

const router = Router();

const createOAuthAppSchema = z.object({
  name: z.string().min(1).max(120),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  requested_scopes: z.array(z.string()).default([]),
});

function publicOAuthApp(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    client_id: row.client_id,
    redirect_uris: row.redirect_uris,
    requested_scopes: row.requested_scopes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicWebhookSubscription(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    event_type: row.event_type,
    target_url: row.target_url,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicWebhookDelivery(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    subscription_id: row.subscription_id,
    event_id: row.event_id,
    event_type: row.event_type,
    attempt_number: row.attempt_number,
    response_status: row.response_status,
    response_excerpt: row.response_excerpt,
    latency_ms: row.latency_ms,
    idempotency_key: row.idempotency_key,
    status: row.status,
    next_attempt_at: row.next_attempt_at,
    delivered_at: row.delivered_at,
    created_at: row.created_at,
  };
}

function publicAuditRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    request_id: row.request_id,
    client_id: row.client_id,
    method: row.method,
    route: row.route,
    scope_used: row.scope_used,
    status: row.status,
    latency_ms: row.latency_ms,
    created_at: row.created_at,
  };
}

interface MembershipRow {
  role: string;
}

async function requireWorkspaceAdmin(userId: string, workspaceId: string): Promise<void> {
  const membership = await queryOne<MembershipRow>(
    'SELECT role FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );

  if (membership?.role !== 'admin') {
    throw new ApiError(403, 'forbidden', 'Only workspace admins can manage OAuth apps');
  }
}

async function requireAdminApp(userId: string, workspaceId: string, appId: string): Promise<void> {
  await requireWorkspaceAdmin(userId, workspaceId);

  const row = await queryOne<{ id: string }>(
    'SELECT id FROM oauth_apps WHERE id = $1 AND workspace_id = $2',
    [appId, workspaceId],
  );

  if (!row) {
    throw new ApiError(404, 'not_found', 'OAuth app not found');
  }
}

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    await requireWorkspaceAdmin(userId, workspaceId);

    const result = await pool.query(
      `SELECT id, workspace_id, owner_user_id, name, client_id, redirect_uris,
              requested_scopes, active, created_at, updated_at
         FROM oauth_apps
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [workspaceId],
    );

    res.json({ data: result.rows.map(publicOAuthApp), next_cursor: null });
  } catch (err) {
    next(err);
  }
});

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    await requireWorkspaceAdmin(userId, workspaceId);

    const parsed = createOAuthAppSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid OAuth app request', {
        issues: parsed.error.flatten(),
      });
    }

    const requestedScopes = parseScopes(parsed.data.requested_scopes);
    if (requestedScopes.length !== parsed.data.requested_scopes.length) {
      throw new ApiError(400, 'validation_failed', 'One or more requested scopes are not registered');
    }

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();

    const result = await pool.query(
      `INSERT INTO oauth_apps
        (workspace_id, owner_user_id, name, client_id, client_secret_hash, redirect_uris, requested_scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, workspace_id, owner_user_id, name, client_id, redirect_uris, requested_scopes, active, created_at`,
      [
        workspaceId,
        userId,
        parsed.data.name,
        clientId,
        hashSecret(clientSecret),
        parsed.data.redirect_uris,
        requestedScopes,
      ],
    );

    res.status(201).json({
      app: publicOAuthApp(result.rows[0]),
      client_secret: clientSecret,
      secret_display: 'shown_once',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rotate-secret', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    await requireWorkspaceAdmin(userId, workspaceId);

    const clientSecret = generateClientSecret();
    const result = await pool.query(
      `UPDATE oauth_apps
          SET client_secret_hash = $1, updated_at = NOW()
        WHERE id = $2 AND workspace_id = $3
        RETURNING id, workspace_id, owner_user_id, name, client_id, redirect_uris,
                  requested_scopes, active, created_at, updated_at`,
      [hashSecret(clientSecret), req.params.id, workspaceId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, 'not_found', 'OAuth app not found');
    }

    res.json({
      app: publicOAuthApp(row),
      client_secret: clientSecret,
      secret_display: 'shown_once',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/audit', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }
    const appId = String(req.params.id);

    await requireAdminApp(userId, workspaceId, appId);

    const result = await pool.query(
      `SELECT request_id, client_id, method, route, scope_used, status, latency_ms, created_at
         FROM public_api_audit_log
        WHERE workspace_id = $1
          AND app_id = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [workspaceId, appId],
    );

    res.json({ data: result.rows.map(publicAuditRow), next_cursor: null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/webhook-subscriptions', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }
    const appId = String(req.params.id);

    await requireAdminApp(userId, workspaceId, appId);

    const result = await pool.query(
      `SELECT id, event_type, target_url, active, created_at, updated_at
         FROM webhook_subscriptions
        WHERE workspace_id = $1
          AND app_id = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [workspaceId, appId],
    );

    res.json({ data: result.rows.map(publicWebhookSubscription), next_cursor: null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/webhook-deliveries', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }
    const appId = String(req.params.id);

    await requireAdminApp(userId, workspaceId, appId);

    const result = await pool.query(
      `SELECT d.id, d.subscription_id, d.event_id, e.event_type,
              d.attempt_number, d.response_status, d.response_excerpt, d.latency_ms,
              d.idempotency_key, d.status, d.next_attempt_at, d.delivered_at, d.created_at
         FROM webhook_deliveries d
         JOIN webhook_subscriptions s ON s.id = d.subscription_id
         JOIN webhook_events e ON e.id = d.event_id
        WHERE s.workspace_id = $1
          AND s.app_id = $2
        ORDER BY d.created_at DESC
        LIMIT 50`,
      [workspaceId, appId],
    );

    res.json({ data: result.rows.map(publicWebhookDelivery), next_cursor: null });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/webhook-subscriptions/:subscriptionId/test', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }
    const appId = String(req.params.id);
    const subscriptionId = String(req.params.subscriptionId);

    await requireAdminApp(userId, workspaceId, appId);

    const subscription = await queryOne<{ id: string; event_type: string; active: boolean }>(
      `SELECT id, event_type, active
         FROM webhook_subscriptions
        WHERE id = $1
          AND app_id = $2
          AND workspace_id = $3`,
      [subscriptionId, appId, workspaceId],
    );

    if (!subscription) {
      throw new ApiError(404, 'not_found', 'Webhook subscription not found');
    }
    if (!subscription.active) {
      throw new ApiError(400, 'validation_failed', 'Webhook subscription is inactive');
    }

    const idempotencyKey = `test.${subscription.event_type}:${crypto.randomUUID()}`;
    const eventResult = await pool.query<{ id: string }>(
      `INSERT INTO webhook_events (workspace_id, event_type, payload, idempotency_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        workspaceId,
        subscription.event_type,
        {
          id: crypto.randomUUID(),
          type: subscription.event_type,
          test: true,
          created_at: new Date().toISOString(),
          data: {
            document: {
              id: crypto.randomUUID(),
              title: 'Plugforge test event',
              document_type: 'wiki',
            },
          },
        },
        idempotencyKey,
      ],
    );

    const eventId = eventResult.rows[0]?.id;
    if (!eventId) {
      throw new Error('Webhook test event insert did not return an id');
    }

    await deliverWebhook(subscription.id, eventId);

    const delivery = await pool.query(
      `SELECT d.id, d.subscription_id, d.event_id, e.event_type,
              d.attempt_number, d.response_status, d.response_excerpt, d.latency_ms,
              d.idempotency_key, d.status, d.next_attempt_at, d.delivered_at, d.created_at
         FROM webhook_deliveries d
         JOIN webhook_events e ON e.id = d.event_id
        WHERE d.subscription_id = $1
          AND d.event_id = $2
        ORDER BY d.created_at DESC
        LIMIT 1`,
      [subscription.id, eventId],
    );

    res.status(202).json({
      event_id: eventId,
      idempotency_key: idempotencyKey,
      delivery: delivery.rows[0] ? publicWebhookDelivery(delivery.rows[0]) : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/deactivate', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      throw new ApiError(401, 'unauthorized', 'Login required');
    }

    await requireWorkspaceAdmin(userId, workspaceId);

    const result = await pool.query(
      `UPDATE oauth_apps
          SET active = FALSE, updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2
        RETURNING id, workspace_id, owner_user_id, name, client_id, redirect_uris,
                  requested_scopes, active, created_at, updated_at`,
      [req.params.id, workspaceId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, 'not_found', 'OAuth app not found');
    }

    res.json({ app: publicOAuthApp(row) });
  } catch (err) {
    next(err);
  }
});

export default router;
