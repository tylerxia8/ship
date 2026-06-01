#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';

const shipUrl = (process.env.SHIP_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.SHIP_TOKEN;

function usage() {
  console.log(`Plugforge TTFE drill

Runs: subscribe webhook -> create document -> receive signed webhook -> verify delivery log.

Required:
  SHIP_TOKEN   Public API bearer token with documents:write and webhooks:manage

Optional:
  SHIP_URL     Ship API base URL, default http://localhost:3000

Example:
  SHIP_URL=https://ship.example.gov SHIP_TOKEN=ship_at_... node scripts/plugforge-ttfe-drill.mjs
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

if (!token) {
  usage();
  console.error('Missing SHIP_TOKEN.');
  process.exit(1);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${shipUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${body?.message || text}`);
  }
  return body;
}

function verifyWebhook(headers, rawBody, secret) {
  const value = headers['ship-signature'];
  if (!value) return false;
  const parts = Object.fromEntries(String(value).split(',').map((part) => part.split('=')));
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function waitForDelivery(idempotencyKey) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const page = await requestJson('/api/v1/webhooks/deliveries');
    const delivery = page.data.find((row) => row.idempotency_key === idempotencyKey);
    if (delivery) return delivery;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for delivery log row ${idempotencyKey}`);
}

const received = [];
const receiver = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    received.push({
      headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    res.writeHead(204).end();
  });
});

try {
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const address = receiver.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind local receiver');
  const targetUrl = `http://127.0.0.1:${address.port}/ship-webhook`;

  const startedAt = Date.now();
  const subscription = await requestJson('/api/v1/webhooks/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      event_type: 'document.created',
      target_url: targetUrl,
    }),
  });

  const created = await requestJson('/api/v1/documents', {
    method: 'POST',
    body: JSON.stringify({
      title: `Plugforge TTFE ${new Date().toISOString()}`,
      properties: { source: 'plugforge-ttfe-drill' },
    }),
  });

  const idempotencyKey = `document.created:${created.data.id}`;
  const deadline = Date.now() + 15_000;
  while (received.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (received.length === 0) {
    throw new Error('Timed out waiting for local webhook receiver');
  }

  const webhook = received[0];
  const signatureOk = verifyWebhook(webhook.headers, webhook.body, subscription.signing_secret);
  const delivery = await waitForDelivery(idempotencyKey);

  console.log(JSON.stringify({
    ok: signatureOk && delivery.status === 'delivered',
    elapsed_ms: Date.now() - startedAt,
    ship_url: shipUrl,
    document_id: created.data.id,
    subscription_id: subscription.data.id,
    delivery_id: delivery.id,
    delivery_status: delivery.status,
    response_status: delivery.response_status,
    signature_verified: signatureOk,
  }, null, 2));

  if (!signatureOk || delivery.status !== 'delivered') {
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => receiver.close(() => resolve()));
}
