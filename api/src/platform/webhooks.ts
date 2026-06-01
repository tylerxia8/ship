import { pool } from '../db/client.js';
import { signWebhookPayload } from './crypto.js';

export const WEBHOOK_EVENTS = ['document.created'] as const;
export type WebhookEventType = typeof WEBHOOK_EVENTS[number];

interface WebhookSubscriptionRow {
  id: string;
  target_url: string;
  signing_secret: string | null;
}

interface WebhookEventInsertRow {
  id: string;
  created_at: string;
}

interface WebhookDeliveryRow {
  id: string;
  event_id: string;
  event_type: WebhookEventType;
  target_url: string;
  signing_secret: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
}

interface PublishWebhookEventInput {
  workspaceId: string;
  eventType: WebhookEventType;
  idempotencyKey: string;
  data: Record<string, unknown>;
}

function responseExcerpt(text: string): string {
  return text.slice(0, 1000);
}

export async function deliverWebhook(subscriptionId: string, eventId: string): Promise<void> {
  const result = await pool.query<WebhookDeliveryRow>(
    `SELECT s.id, s.target_url, s.signing_secret,
            e.id AS event_id, e.event_type, e.payload, e.idempotency_key, e.created_at
       FROM webhook_subscriptions s
       JOIN webhook_events e ON e.id = $2
      WHERE s.id = $1
        AND s.active = TRUE`,
    [subscriptionId, eventId],
  );

  const row = result.rows[0];
  if (!row || !row.signing_secret) return;

  const attemptResult = await pool.query(
    `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attempt_number
       FROM webhook_deliveries
      WHERE subscription_id = $1 AND event_id = $2`,
    [subscriptionId, eventId],
  );
  const attemptNumber = Number(attemptResult.rows[0].attempt_number);

  const rawBody = JSON.stringify(row.payload);
  const startedAt = Date.now();
  let responseStatus: number | null = null;
  let responseText = '';
  let status = 'failed';

  try {
    const response = await fetch(row.target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ship-Event-Id': row.event_id,
        'Ship-Event-Type': row.event_type,
        'Ship-Idempotency-Key': row.idempotency_key,
        'Ship-Signature': signWebhookPayload(rawBody, row.signing_secret),
      },
      body: rawBody,
    });
    responseStatus = response.status;
    responseText = await response.text();
    status = response.ok ? 'delivered' : (response.status >= 500 || response.status === 429 ? 'retry_pending' : 'dead_letter');
  } catch (err) {
    responseText = err instanceof Error ? err.message : 'Webhook delivery failed';
    status = 'retry_pending';
  }

  await pool.query(
    `INSERT INTO webhook_deliveries
      (subscription_id, event_id, attempt_number, response_status, response_excerpt,
       latency_ms, idempotency_key, status, delivered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'delivered' THEN NOW() ELSE NULL END)`,
    [
      subscriptionId,
      eventId,
      attemptNumber,
      responseStatus,
      responseExcerpt(responseText),
      Date.now() - startedAt,
      row.idempotency_key,
      status,
    ],
  );
}

export async function publishWebhookEvent(input: PublishWebhookEventInput): Promise<string> {
  const eventResult = await pool.query<WebhookEventInsertRow>(
    `INSERT INTO webhook_events (workspace_id, event_type, payload, idempotency_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
     RETURNING id, created_at`,
    [input.workspaceId, input.eventType, input.data, input.idempotencyKey],
  );
  const eventRow = eventResult.rows[0];
  if (!eventRow) {
    throw new Error('Webhook event insert did not return a row');
  }
  const eventId = eventRow.id;

  const subscriptionResult = await pool.query<WebhookSubscriptionRow>(
    `SELECT id, target_url, signing_secret
       FROM webhook_subscriptions
      WHERE workspace_id = $1
        AND event_type = $2
        AND active = TRUE`,
    [input.workspaceId, input.eventType],
  );

  await Promise.all(subscriptionResult.rows.map((subscription) => deliverWebhook(subscription.id, eventId)));
  return eventId;
}
