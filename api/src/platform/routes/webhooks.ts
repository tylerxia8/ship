import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { publicBearerAuth } from '../auth.js';
import { generateWebhookSecret, hashSecret } from '../crypto.js';
import { ApiError } from '../errors.js';
import { requireScope } from '../scopes.js';
import { deliverWebhook, WEBHOOK_EVENTS } from '../webhooks.js';

const router = Router();

const createSubscriptionSchema = z.object({
  event_type: z.enum(WEBHOOK_EVENTS),
  target_url: z.string().url(),
});

function publicSubscription(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    event_type: row.event_type,
    target_url: row.target_url,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/subscriptions', publicBearerAuth, requireScope('webhooks:manage'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, event_type, target_url, active, created_at, updated_at
         FROM webhook_subscriptions
        WHERE workspace_id = $1 AND app_id = $2
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.publicAuth!.workspaceId, req.publicAuth!.appId],
    );

    res.json({ data: result.rows.map(publicSubscription), next_cursor: null });
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions', publicBearerAuth, requireScope('webhooks:manage'), async (req, res, next) => {
  try {
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'Invalid webhook subscription request', {
        issues: parsed.error.flatten(),
      });
    }

    const signingSecret = generateWebhookSecret();
    const result = await pool.query(
      `INSERT INTO webhook_subscriptions
        (app_id, workspace_id, event_type, target_url, signing_secret, signing_secret_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, event_type, target_url, active, created_at, updated_at`,
      [
        req.publicAuth!.appId,
        req.publicAuth!.workspaceId,
        parsed.data.event_type,
        parsed.data.target_url,
        signingSecret,
        hashSecret(signingSecret),
      ],
    );

    res.status(201).json({
      data: publicSubscription(result.rows[0]),
      signing_secret: signingSecret,
      secret_display: 'shown_once',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/deliveries/:id/replay', publicBearerAuth, requireScope('webhooks:manage'), async (req, res, next) => {
  try {
    const delivery = await pool.query(
      `SELECT d.id, d.subscription_id, d.event_id
         FROM webhook_deliveries d
         JOIN webhook_subscriptions s ON s.id = d.subscription_id
        WHERE d.id = $1
          AND s.workspace_id = $2
          AND s.app_id = $3`,
      [req.params.id, req.publicAuth!.workspaceId, req.publicAuth!.appId],
    );

    const row = delivery.rows[0];
    if (!row) {
      throw new ApiError(404, 'not_found', 'Webhook delivery not found');
    }

    await deliverWebhook(row.subscription_id, row.event_id);
    res.status(202).json({ replayed: true });
  } catch (err) {
    next(err);
  }
});

export default router;
