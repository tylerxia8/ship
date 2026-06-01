#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_SHIP_URL = process.env.SHIP_URL || 'http://localhost:3000';
const CONFIG_PATH = process.env.SHIP_CLI_CONFIG || join(homedir(), '.ship', 'plugforge-cli.json');
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

class ApiRequestError extends Error {
  constructor(message, response, body) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = response.status;
    this.body = body;
  }
}

function usage() {
  console.log(`Ship Plugforge CLI

Usage:
  ship login --client-id <id> [--ship-url <url>] [--scope <scopes>]
  ship scopes [--ship-url <url>]
  ship me [--ship-url <url>]
  ship docs ls [--ship-url <url>]
  ship docs create <title> [--ship-url <url>]
  ship webhooks events [--ship-url <url>]
  ship webhooks subscribe --url <target> [--event document.created] [--ship-url <url>]
  ship webhooks rotate-secret <subscription-id> [--ship-url <url>]
  ship webhooks deactivate <subscription-id> [--ship-url <url>]
  ship webhooks deliveries [--ship-url <url>]
  ship webhooks tail [--ship-url <url>] [--interval 2]

Environment:
  SHIP_URL            Default Ship URL
  SHIP_TOKEN          Bearer token override
  SHIP_CLI_CONFIG     Token config path override
`);
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value?.startsWith('--')) {
      const key = value.slice(2);
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = next;
        index += 1;
      }
    } else if (value) {
      rest.push(value);
    }
  }
  return { flags, rest };
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

async function requestJson(shipUrl, path, options = {}) {
  const response = await fetch(`${shipUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.message || `Request failed with status ${response.status}`;
    const code = body?.code ? ` (${body.code})` : '';
    throw new ApiRequestError(`${message}${code}`, response, body);
  }
  return body;
}

async function tokenEntryFor(shipUrl) {
  if (process.env.SHIP_TOKEN) return process.env.SHIP_TOKEN;
  const config = await readConfig();
  const entry = config[shipUrl];
  if (!entry?.access_token) {
    throw new Error(`Not logged in for ${shipUrl}. Run: ship login --client-id <id> --ship-url ${shipUrl}`);
  }
  return entry;
}

async function refreshCliToken(shipUrl, entry) {
  if (!entry?.client_id || !entry?.refresh_token) {
    throw new Error(`Token expired for ${shipUrl}. Run: ship login --client-id <id> --ship-url ${shipUrl}`);
  }

  const refreshed = await requestJson(shipUrl, '/oauth/token', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: entry.client_id,
      refresh_token: entry.refresh_token,
    }),
  });

  const config = await readConfig();
  config[shipUrl] = { ...refreshed, client_id: entry.client_id };
  await writeConfig(config);
  return config[shipUrl];
}

function isExpiredTokenError(err) {
  return err instanceof ApiRequestError
    && err.status === 401
    && err.body?.code === 'unauthorized'
    && err.body?.details?.code === 'token_expired';
}

async function api(shipUrl, path, options = {}) {
  const tokenEntry = await tokenEntryFor(shipUrl);
  const token = typeof tokenEntry === 'string' ? tokenEntry : tokenEntry.access_token;

  try {
    return await requestJson(shipUrl, `/api/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    if (typeof tokenEntry === 'string' || !isExpiredTokenError(err)) {
      throw err;
    }

    const refreshed = await refreshCliToken(shipUrl, tokenEntry);
    return requestJson(shipUrl, `/api/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        ...(options.headers || {}),
      },
    });
  }
}

async function login(args) {
  const { flags } = parseFlags(args);
  const clientId = flags['client-id'];
  const shipUrl = flags['ship-url'] || DEFAULT_SHIP_URL;
  const scope = flags.scope || 'documents:read documents:write webhooks:manage';
  if (!clientId) throw new Error('Missing --client-id');

  const code = await requestJson(shipUrl, '/oauth/device/code', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, scope }),
  });

  console.log(`Open ${shipUrl}${code.verification_uri}`);
  console.log(`Enter code: ${code.user_code}`);

  let waitMs = code.interval * 1000;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetch(`${shipUrl.replace(/\/$/, '')}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: DEVICE_GRANT,
        client_id: clientId,
        device_code: code.device_code,
      }),
    });
    const body = await response.json();
    if (response.ok) {
      const config = await readConfig();
      config[shipUrl] = { ...body, client_id: clientId };
      await writeConfig(config);
      console.log(`Logged in to ${shipUrl}`);
      return;
    }
    if (body.code === 'authorization_pending') continue;
    if (body.code === 'slow_down') {
      waitMs += 5000;
      continue;
    }
    throw new Error(body.message || 'Device login failed');
  }
}

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  const { flags, rest: positional } = parseFlags(rest);
  const shipUrl = flags['ship-url'] || DEFAULT_SHIP_URL;

  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }

  if (command === 'login') {
    await login([subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'scopes') {
    console.log(JSON.stringify(await requestJson(shipUrl, '/api/v1/scopes'), null, 2));
    return;
  }

  if (command === 'me') {
    console.log(JSON.stringify(await api(shipUrl, '/me'), null, 2));
    return;
  }

  if (command === 'docs' && subcommand === 'ls') {
    console.log(JSON.stringify(await api(shipUrl, '/documents'), null, 2));
    return;
  }

  if (command === 'docs' && subcommand === 'create') {
    const title = positional.join(' ') || 'Untitled';
    console.log(JSON.stringify(await api(shipUrl, '/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }), null, 2));
    return;
  }

  if (command === 'webhooks' && subcommand === 'subscribe') {
    if (!flags.url) throw new Error('Missing --url');
    console.log(JSON.stringify(await api(shipUrl, '/webhooks/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        event_type: flags.event || 'document.created',
        target_url: flags.url,
      }),
    }), null, 2));
    return;
  }

  if (command === 'webhooks' && subcommand === 'events') {
    console.log(JSON.stringify(await requestJson(shipUrl, '/api/v1/webhooks/events'), null, 2));
    return;
  }

  if (command === 'webhooks' && subcommand === 'rotate-secret') {
    const subscriptionId = positional[0];
    if (!subscriptionId) throw new Error('Missing subscription id');
    console.log(JSON.stringify(await api(shipUrl, `/webhooks/subscriptions/${subscriptionId}/rotate-secret`, {
      method: 'POST',
    }), null, 2));
    return;
  }

  if (command === 'webhooks' && subcommand === 'deactivate') {
    const subscriptionId = positional[0];
    if (!subscriptionId) throw new Error('Missing subscription id');
    console.log(JSON.stringify(await api(shipUrl, `/webhooks/subscriptions/${subscriptionId}/deactivate`, {
      method: 'POST',
    }), null, 2));
    return;
  }

  if (command === 'webhooks' && subcommand === 'deliveries') {
    console.log(JSON.stringify(await api(shipUrl, '/webhooks/deliveries'), null, 2));
    return;
  }

  if (command === 'webhooks' && subcommand === 'tail') {
    const intervalMs = Math.max(1, Number(flags.interval || 2)) * 1000;
    const seen = new Set();
    while (true) {
      const page = await api(shipUrl, '/webhooks/deliveries');
      for (const delivery of [...page.data].reverse()) {
        if (seen.has(delivery.id)) continue;
        seen.add(delivery.id);
        console.log([
          delivery.created_at,
          delivery.event_type,
          delivery.status,
          `attempt=${delivery.attempt_number}`,
          `status=${delivery.response_status ?? 'n/a'}`,
          delivery.idempotency_key,
        ].join(' '));
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
