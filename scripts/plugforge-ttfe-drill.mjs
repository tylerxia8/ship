#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const shipUrl = (process.env.SHIP_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.SHIP_TOKEN;
const targetMs = Number(process.env.TTFE_TARGET_MS || 60_000);
const installedSdkPath = process.env.TTFE_INSTALLED_SDK_PATH;
const installMs = Number(process.env.TTFE_INSTALL_MS || 0);
const loginMs = Number(process.env.TTFE_LOGIN_MS || 0);
const listenHost = process.env.WEBHOOK_LISTEN_HOST || '127.0.0.1';
const publicHost = process.env.WEBHOOK_PUBLIC_HOST || listenHost;

function usage() {
  console.log(`Plugforge TTFE drill

Runs: SDK subscribe webhook -> SDK create document -> receive signed webhook
-> SDK verifyWebhook -> SDK delivery-log verification.

Required:
  SHIP_TOKEN   Public API bearer token with documents:write and webhooks:manage

Optional:
  SHIP_URL        Ship API base URL, default http://localhost:3000
  TTFE_TARGET_MS  Failing threshold, default 60000 for CI
  TTFE_INSTALLED_SDK_PATH Import path for a clean-installed @ship/sdk build
  KEEP_WEBHOOK    Set to 1 to leave the temporary webhook subscription active

Example:
  pnpm drill ttfe
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

let client;

async function loadSdk() {
  if (installedSdkPath) {
    return import(pathToFileURL(installedSdkPath).toString());
  }
  return import('../sdk/dist/index.js');
}

const timings = {};

async function timed(name, fn) {
  const started = Date.now();
  const value = await fn();
  timings[name] = Date.now() - started;
  return value;
}

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
  const { ShipClient, verifyWebhook } = await loadSdk();
  client = new ShipClient({ token, baseUrl: `${shipUrl}/api/v1` });

  if (installMs > 0) timings.install = installMs;
  if (loginMs > 0) {
    timings.login = loginMs;
  } else {
    await timed('login', () => client.me());
  }

  await new Promise((resolve) => receiver.listen(0, listenHost, resolve));
  const address = receiver.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind local receiver');
  const targetUrl = `http://${publicHost}:${address.port}/ship-webhook`;

  const startedAt = Date.now();
  const subscription = await timed('register_subscription', () => client.webhooks.createSubscription({
    event_type: 'document.created',
    target_url: targetUrl,
  }));
  subscriptionId = subscription.data.id;

  const created = await timed('create_document', () => client.documents.create({
    title: `Plugforge TTFE ${new Date().toISOString()}`,
    properties: { source: 'plugforge-ttfe-drill' },
  }));

  const idempotencyKey = `document.created:${created.data.id}`;
  await timed('receive_webhook', async () => {
    const deadline = Date.now() + 15_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  });

  if (received.length === 0) {
    throw new Error('Timed out waiting for local webhook receiver');
  }

  const webhook = received[0];
  const signature = await timed('verify_signature', async () => {
    const valid = verifyWebhook(webhook.headers, webhook.body, subscription.signing_secret);
    const tampered = verifyWebhook(webhook.headers, `${webhook.body} `, subscription.signing_secret);
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
    const oldSignature = crypto
      .createHmac('sha256', subscription.signing_secret)
      .update(`${oldTimestamp}.${webhook.body}`)
      .digest('hex');
    const expired = verifyWebhook(
      { ...webhook.headers, 'ship-signature': `t=${oldTimestamp},v1=${oldSignature}` },
      webhook.body,
      subscription.signing_secret,
    );
    return { valid, tampered, expired };
  });
  const delivery = await timed('delivery_log', () => waitForDelivery(idempotencyKey));
  const elapsedMs = Date.now() - startedAt;
  const ok = signature.valid && !signature.tampered && !signature.expired && delivery.status === 'delivered' && elapsedMs <= targetMs;

  console.log(JSON.stringify({
    ok,
    elapsed_ms: elapsedMs,
    stage_timings_ms: timings,
    target_ms: targetMs,
    ship_url: shipUrl,
    document_id: created.data.id,
    subscription_id: subscriptionId,
    delivery_id: delivery.id,
    delivery_status: delivery.status,
    response_status: delivery.response_status,
    signature_verified: signature.valid,
    signature_negative_cases: {
      tampered_rejected: !signature.tampered,
      expired_rejected: !signature.expired,
    },
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
      await client?.webhooks.deactivateSubscription(subscriptionId);
    } catch (err) {
      console.error(`Could not deactivate temporary webhook subscription ${subscriptionId}:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
  await new Promise((resolve) => receiver.close(() => resolve()));
}
