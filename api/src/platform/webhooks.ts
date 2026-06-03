import { pool } from '../db/client.js';
import { signWebhookPayload } from './crypto.js';
import type { WebhookEventType } from './events.js';

const RETRY_DELAYS_SECONDS = [1, 4, 16, 60, 300, 1800] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length;
const MAX_RETRY_DELAY_SECONDS = 1800;
const WEBHOOK_TIMEOUT_MS = 10_000;

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

function deliveryStatus(responseStatus: number | null, ok: boolean, attemptNumber: number): string {
  if (ok) return 'delivered';
  if (responseStatus !== null && responseStatus >= 400 && responseStatus < 500) {
    return 'dead_letter';
  }
  return attemptNumber >= MAX_ATTEMPTS ? 'dead_letter' : 'retry_pending';
}

function nextAttemptDelaySeconds(attemptNumber: number): number | null {
  if (attemptNumber >= MAX_ATTEMPTS) return null;
  const baseDelay = RETRY_DELAYS_SECONDS[attemptNumber - 1];
  if (!baseDelay) return null;
  const jitterMultiplier = 1 + Math.random() * 0.2;
  return Math.max(1, Math.round(baseDelay * jitterMultiplier));
}

function retryAfterDelaySeconds(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  const numericSeconds = Number(trimmed);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.min(Math.ceil(numericSeconds), MAX_RETRY_DELAY_SECONDS);
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const deltaSeconds = Math.max(0, Math.ceil((dateMs - nowMs) / 1000));
    return Math.min(deltaSeconds, MAX_RETRY_DELAY_SECONDS);
  }

  return null;
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
  let retryAfterHeader: string | null = null;
  let status = 'failed';
  let ok = false;

  try {
    const response = await fetch(row.target_url, {
      method: 'POST',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'Ship-Event-Id': row.event_id,
        'Ship-Event-Type': row.event_type,
        'Idempotency-Key': row.idempotency_key,
        'Ship-Signature': signWebhookPayload(rawBody, row.signing_secret),
      },
      body: rawBody,
    });
    responseStatus = response.status;
    retryAfterHeader = response.headers.get('retry-after');
    responseText = await response.text();
    ok = response.ok;
    status = deliveryStatus(responseStatus, ok, attemptNumber);
  } catch (err) {
    responseText = err instanceof Error ? err.message : 'Webhook delivery failed';
    status = deliveryStatus(null, false, attemptNumber);
  }

  const nextDelaySeconds = status === 'retry_pending'
    ? retryAfterDelaySeconds(retryAfterHeader) ?? nextAttemptDelaySeconds(attemptNumber)
    : null;
  await pool.query(
    `INSERT INTO webhook_deliveries
      (subscription_id, event_id, attempt_number, response_status, response_excerpt,
       latency_ms, idempotency_key, status, next_attempt_at, delivered_at)
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       CASE WHEN $9::int IS NULL THEN NULL ELSE NOW() + ($9::text || ' seconds')::interval END,
       CASE WHEN $8 = 'delivered' THEN NOW() ELSE NULL END
     )`,
    [
      subscriptionId,
      eventId,
      attemptNumber,
      responseStatus,
      responseExcerpt(responseText),
      Date.now() - startedAt,
      row.idempotency_key,
      status,
      nextDelaySeconds,
    ],
  );
}

export async function processDueWebhookDeliveries(limit = 25): Promise<number> {
  const result = await pool.query<{ subscription_id: string; event_id: string }>(
    `SELECT DISTINCT ON (d.subscription_id, d.event_id)
            d.subscription_id, d.event_id
       FROM webhook_deliveries d
      WHERE d.status = 'retry_pending'
        AND d.next_attempt_at <= NOW()
        AND NOT EXISTS (
          SELECT 1
            FROM webhook_deliveries newer
           WHERE newer.subscription_id = d.subscription_id
             AND newer.event_id = d.event_id
             AND newer.created_at > d.created_at
        )
      ORDER BY d.subscription_id, d.event_id, d.created_at ASC
      LIMIT $1`,
    [limit],
  );

  for (const row of result.rows) {
    await deliverWebhook(row.subscription_id, row.event_id);
  }

  return result.rowCount ?? 0;
}

export function startWebhookRetryWorker(intervalMs = 15_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    processDueWebhookDeliveries().catch((err) => {
      console.error('[plugforge/webhooks] retry worker failed:', err);
    });
  }, intervalMs);

  timer.unref?.();
  return timer;
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
