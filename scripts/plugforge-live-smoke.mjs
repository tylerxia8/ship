#!/usr/bin/env node

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const token = process.env.SHIP_TOKEN;

function usage() {
  console.log(`Plugforge live smoke

Checks public discovery endpoints against a running Ship deployment. If
SHIP_TOKEN is set, also checks authenticated app context and document listing.

Optional:
  SHIP_URL     Default: https://d2rr1fze9v095b.cloudfront.net
  SHIP_TOKEN   Public API bearer token for authenticated checks

Example:
  SHIP_URL=https://d2rr1fze9v095b.cloudfront.net node scripts/plugforge-live-smoke.mjs
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

async function request(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${shipUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return {
    path,
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    body,
  };
}

const checks = [
  ['GET /health', () => request('/health')],
  ['GET /api/v1/openapi.json', () => request('/api/v1/openapi.json')],
  ['GET /api/v1/scopes', () => request('/api/v1/scopes')],
  ['GET /api/v1/webhooks/events', () => request('/api/v1/webhooks/events')],
  ['POST /oauth/device/code', () => request('/oauth/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'ship_app_d8200057ae8afcd914151e0738af09f3' }),
  })],
];

if (token) {
  checks.push(
    ['GET /api/v1/me', () => request('/api/v1/me')],
    ['GET /api/v1/documents', () => request('/api/v1/documents?limit=3')],
    ['GET /api/v1/webhooks/deliveries', () => request('/api/v1/webhooks/deliveries')],
  );
}

const results = [];
for (const [name, run] of checks) {
  try {
    const result = await run();
    results.push({
      name,
      path: result.path,
      ok: result.ok,
      status: result.status,
      elapsed_ms: result.elapsed_ms,
    });
  } catch (err) {
    results.push({
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const summary = {
  ok: results.every((result) => result.ok),
  ship_url: shipUrl,
  authenticated_checks: Boolean(token),
  checked_at: new Date().toISOString(),
  results,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
