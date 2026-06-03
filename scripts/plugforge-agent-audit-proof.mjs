#!/usr/bin/env node

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const token = process.env.SHIP_PUBLIC_API_TOKEN || process.env.SHIP_TOKEN;
const email = process.env.SHIP_DEMO_EMAIL;
const password = process.env.SHIP_DEMO_PASSWORD;
const appId = process.env.SHIP_AGENT_APP_ID || process.env.SHIP_OAUTH_APP_ID;

function usage() {
  console.log(`FleetGraph public API audit proof

Required:
  SHIP_PUBLIC_API_TOKEN or SHIP_TOKEN  OAuth bearer token for the agent app

Optional:
  SHIP_URL                             Default: https://d2rr1fze9v095b.cloudfront.net
  SHIP_DEMO_EMAIL / SHIP_DEMO_PASSWORD Session credentials for audit-row lookup
  SHIP_AGENT_APP_ID                    OAuth app id for audit-row lookup

The script always calls /api/v1/me and /api/v1/documents with the bearer token.
When session credentials and app id are provided, it also reads the Developer
Portal audit endpoint and reports matching rows.
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

if (!token) {
  usage();
  console.error('Missing SHIP_PUBLIC_API_TOKEN or SHIP_TOKEN.');
  process.exit(1);
}

async function request(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${shipUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') && text ? JSON.parse(text) : text;
  return {
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    headers: response.headers,
    body,
  };
}

async function publicRequest(path) {
  const result = await request(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return {
    path,
    ok: result.ok,
    status: result.status,
    elapsed_ms: result.elapsed_ms,
    body: result.body,
  };
}

function cookieHeader(headers) {
  const values = [];
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase() === 'set-cookie') {
      values.push(...value.split(/;\s*(?=[^=]+=)/).filter((part) => part.includes('=')));
    }
  }
  return values
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function auditRows() {
  if (!email || !password || !appId) return null;

  const csrf = await request('/api/csrf-token');
  if (!csrf.ok || typeof csrf.body !== 'object' || !csrf.body.token) {
    throw new Error(`Could not fetch CSRF token: ${csrf.status}`);
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf.body.token,
      Cookie: cookieHeader(csrf.headers),
    },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`Login failed: ${login.status}`);
  }

  const cookies = [cookieHeader(csrf.headers), cookieHeader(login.headers)].filter(Boolean).join('; ');
  const audit = await request(`/api/v1/oauth/apps/${encodeURIComponent(appId)}/audit`, {
    headers: { Cookie: cookies },
  });
  return {
    ok: audit.ok,
    status: audit.status,
    rows: audit.body?.data ?? [],
  };
}

const me = await publicRequest('/api/v1/me');
const docs = await publicRequest('/api/v1/documents?limit=1');
const audit = await auditRows();
const clientId = me.body?.app?.client_id ?? null;

const proof = {
  ok: me.ok && docs.ok && (!audit || audit.ok),
  generated_at: new Date().toISOString(),
  ship_url: shipUrl,
  client_id: clientId,
  public_calls: [
    {
      route: '/api/v1/me',
      ok: me.ok,
      status: me.status,
      elapsed_ms: me.elapsed_ms,
      scopes: me.body?.app?.scopes ?? null,
    },
    {
      route: '/api/v1/documents',
      ok: docs.ok,
      status: docs.status,
      elapsed_ms: docs.elapsed_ms,
      returned: Array.isArray(docs.body?.data) ? docs.body.data.length : null,
    },
  ],
  audit_lookup: audit
    ? {
        ok: audit.ok,
        status: audit.status,
        matching_rows: audit.rows.filter((row) => (
          (!clientId || row.client_id === clientId)
          && ['/api/v1/me', '/api/v1/documents/'].includes(row.route)
        )).slice(0, 10),
      }
    : {
        ok: false,
        skipped: 'Set SHIP_DEMO_EMAIL, SHIP_DEMO_PASSWORD, and SHIP_AGENT_APP_ID to read audit rows.',
      },
};

console.log(JSON.stringify(proof, null, 2));
if (!proof.ok) process.exitCode = 1;
