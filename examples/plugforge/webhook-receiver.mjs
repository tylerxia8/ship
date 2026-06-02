#!/usr/bin/env node
import http from 'node:http';
import { verifyWebhook } from '../../sdk/dist/index.js';

const secret = process.env.SHIP_WEBHOOK_SECRET;
const port = Number(process.env.PORT || 8787);

if (!secret) {
  console.error('Set SHIP_WEBHOOK_SECRET to the signing secret shown when creating a webhook subscription.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const verified = verifyWebhook(req.headers, rawBody, secret);
  console.log(JSON.stringify({
    verified,
    event_id: req.headers['ship-event-id'],
    event_type: req.headers['ship-event-type'],
    idempotency_key: req.headers['ship-idempotency-key'],
    body: JSON.parse(rawBody),
  }, null, 2));

  res.writeHead(verified ? 204 : 401).end();
});

server.listen(port, () => {
  console.log(`Listening for Ship webhooks on http://127.0.0.1:${port}`);
});
