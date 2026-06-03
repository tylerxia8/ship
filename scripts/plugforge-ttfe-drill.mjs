#!/usr/bin/env node
import http from 'node:http';
import { ShipClient, verifyWebhook } from '../sdk/dist/index.js';

const shipUrl = (process.env.SHIP_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.SHIP_TOKEN;
const targetMs = Number(process.env.TTFE_TARGET_MS || 60_000);

function usage() {
  console.log(`Plugforge TTFE drill

Runs: SDK subscribe webhook -> SDK create document -> receive signed webhook
-> SDK verifyWebhook -> SDK delivery-log verification.

Required:
  SHIP_TOKEN   Public API bearer token with documents:write and webhooks:manage

Optional:
  SHIP_URL        Ship API base URL, default http://localhost:3000
  TTFE_TARGET_MS  Failing threshold, default 60000 for CI
  KEEP_WEBHOOK    Set to 1 to leave the temporary webhook subscription active

Example:
  corepack pnpm --filter @ship/sdk build
  SHIP_URL=http://localhost:3000 SHIP_TOKEN=ship_at_... node scripts/plugforge-ttfe-drill.mjs
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

if (!Number.isFinite(targetMs) || targetMs <= 0) {
  console.error('TTFE_TARGET_MS must be a positive number.');
  process.exit(1);
}

const client = new ShipClient({ token, baseUrl: `${shipUrl}/api/v1` });

async function waitForDelivery(idempotencyKey) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const page = await client.webhooks.listDeliveries();
    const delivery = page.data.find((row) => row.idempotency_key === idempotencyKey);
    if (delivery) return delivery;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for delivery log row ${idempotencyKey}`);
}

const received = [];
let subscriptionId = null;
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
  const subscription = await client.webhooks.createSubscription({
    event_type: 'document.created',
    target_url: targetUrl,
  });
  subscriptionId = subscription.data.id;

  const created = await client.documents.create({
    title: `Plugforge TTFE ${new Date().toISOString()}`,
    properties: { source: 'plugforge-ttfe-drill' },
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
  const elapsedMs = Date.now() - startedAt;
  const ok = signatureOk && delivery.status === 'delivered' && elapsedMs <= targetMs;

  console.log(JSON.stringify({
    ok,
    elapsed_ms: elapsedMs,
    target_ms: targetMs,
    ship_url: shipUrl,
    document_id: created.data.id,
    subscription_id: subscriptionId,
    delivery_id: delivery.id,
    delivery_status: delivery.status,
    response_status: delivery.response_status,
    signature_verified: signatureOk,
    subscription_deactivated: process.env.KEEP_WEBHOOK === '1' ? false : true,
  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  if (subscriptionId && process.env.KEEP_WEBHOOK !== '1') {
    try {
      await client.webhooks.deactivateSubscription(subscriptionId);
    } catch (err) {
      console.error(`Could not deactivate temporary webhook subscription ${subscriptionId}:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
  await new Promise((resolve) => receiver.close(() => resolve()));
}
