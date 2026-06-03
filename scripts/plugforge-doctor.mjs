#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');

function run(command, args = [], options = {}) {
  const startedAt = Date.now();
  const [spawnCommand, spawnArgs] = normalizeCommand(command, args);
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 15_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    command: [command, ...args].join(' '),
    elapsed_ms: Date.now() - startedAt,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
    error: result.error?.message,
  };
}

function normalizeCommand(command, args) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) {
    return [command, args];
  }
  return ['cmd.exe', ['/d', '/s', '/c', command, ...args]];
}

async function request(name, url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return {
      name,
      ok: response.ok,
      status: response.status,
      elapsed_ms: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function summarizeCommand(name, result, detail = 'stdout') {
  return {
    name,
    ok: result.ok,
    command: result.command,
    elapsed_ms: result.elapsed_ms,
    detail: (result[detail] || result.stderr || result.error || '').split(/\r?\n/).at(0) || null,
  };
}

const checks = [
  summarizeCommand('git', run('git', ['--version'])),
  summarizeCommand('node', run('node', ['--version'])),
  summarizeCommand('corepack', run(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['--version'])),
  summarizeCommand('pnpm', run(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', '--version'])),
  summarizeCommand('postgres readiness', run('pg_isready', [], { timeout: 5_000 })),
  summarizeCommand('docker engine', run('docker', ['version', '--format', '{{json .}}'], { timeout: 30_000 })),
  summarizeCommand('aws cli', run('aws', ['--version'])),
  summarizeCommand('terraform', run('terraform', ['version', '-json'])),
  summarizeCommand('comply opensource', run('comply', ['opensource', '--help'])),
];

const live = await Promise.all([
  request('live health', `${shipUrl}/health`),
  request('live openapi', `${shipUrl}/api/v1/openapi.json`),
  request('live scopes', `${shipUrl}/api/v1/scopes`),
  request('live webhook events', `${shipUrl}/api/v1/webhooks/events`),
]);

const required = new Set(['git', 'node', 'corepack', 'pnpm', 'live health', 'live openapi']);
const all = [...checks, ...live];
const requiredFailures = all.filter((check) => required.has(check.name) && !check.ok);

const proof = {
  ok: requiredFailures.length === 0,
  generated_at: new Date().toISOString(),
  ship_url: shipUrl,
  required_failures: requiredFailures.map((check) => check.name),
  checks: all,
  notes: [
    'PostgreSQL, Docker, AWS CLI, Terraform, and comply are environment readiness checks.',
    'Docker is required for Testcontainers-backed full Playwright E2E and local TTFE Docker mode.',
    'A compatible comply CLI must expose `comply opensource`; similarly named packages may not.',
  ],
};

console.log(JSON.stringify(proof, null, 2));
if (!proof.ok) process.exitCode = 1;
