#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_SHIP_URL = process.env.SHIP_URL || 'http://localhost:3000';
const CONFIG_PATH = process.env.SHIP_CLI_CONFIG || join(homedir(), '.ship', 'plugforge-cli.json');
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

function usage() {
  console.log(`Ship Plugforge CLI

Usage:
  ship login --client-id <id> [--ship-url <url>] [--scope <scopes>]
  ship me [--ship-url <url>]
  ship docs ls [--ship-url <url>]
  ship docs create <title> [--ship-url <url>]
  ship webhooks subscribe --url <target> [--event document.created] [--ship-url <url>]

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
    throw new Error(`${message}${code}`);
  }
  return body;
}

async function tokenFor(shipUrl) {
  if (process.env.SHIP_TOKEN) return process.env.SHIP_TOKEN;
  const config = await readConfig();
  const token = config[shipUrl]?.access_token;
  if (!token) {
    throw new Error(`Not logged in for ${shipUrl}. Run: ship login --client-id <id> --ship-url ${shipUrl}`);
  }
  return token;
}

async function api(shipUrl, path, options = {}) {
  const token = await tokenFor(shipUrl);
  return requestJson(shipUrl, `/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
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
      config[shipUrl] = body;
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

  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
