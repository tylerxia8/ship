#!/usr/bin/env node
import { ShipClient } from '../../sdk/dist/index.js';

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const token = process.env.SHIP_TOKEN;

if (!token) {
  console.error('Set SHIP_TOKEN to a public API bearer token with webhooks:manage.');
  process.exit(1);
}

const client = new ShipClient({
  baseUrl: `${shipUrl}/api/v1`,
  token,
});

const [events, deliveries] = await Promise.all([
  client.webhooks.listEvents(),
  client.webhooks.listDeliveries(),
]);

console.log(JSON.stringify({
  ship_url: shipUrl,
  events: events.data,
  recent_deliveries: deliveries.data.slice(0, 5),
}, null, 2));
