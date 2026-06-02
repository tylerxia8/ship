#!/usr/bin/env node
import { ShipClient } from '../../sdk/dist/index.js';

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const token = process.env.SHIP_TOKEN;

if (!token) {
  console.error('Set SHIP_TOKEN to a public API bearer token with documents:write.');
  process.exit(1);
}

const client = new ShipClient({
  baseUrl: `${shipUrl}/api/v1`,
  token,
});

const created = await client.documents.create({
  title: `Plugforge SDK example ${new Date().toISOString()}`,
  document_type: 'wiki',
  properties: {
    source: 'examples/plugforge/node-doc-create.mjs',
  },
});

console.log(JSON.stringify(created, null, 2));
