#!/usr/bin/env node
import { spawn } from 'node:child_process';

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

function usage() {
  console.log(`Plugforge final check

Runs the repeatable checks used for final-submission evidence.

Optional:
  SHIP_URL   Default: https://d2rr1fze9v095b.cloudfront.net

Example:
  corepack.cmd pnpm plugforge:final-check
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

async function run(name, command, args) {
  const startedAt = Date.now();
  const [spawnCommand, spawnArgs] = normalizeCommand(command, args);
  const child = spawn(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SHIP_URL: shipUrl,
      EPIC7_LLM_SPEND_USD_DAY: process.env.EPIC7_LLM_SPEND_USD_DAY || '0.336628',
      EPIC7_AGENT_BASELINE_TOKENS_PER_TURN: process.env.EPIC7_AGENT_BASELINE_TOKENS_PER_TURN || '2600',
      EPIC7_AGENT_REWIRE_TOKENS_PER_TURN: process.env.EPIC7_AGENT_REWIRE_TOKENS_PER_TURN || '2600',
      EPIC7_USERS: process.env.EPIC7_USERS || '1000',
    },
    shell: false,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve) => {
    child.on('close', resolve);
  });

  return {
    name,
    ok: exitCode === 0,
    exit_code: exitCode,
    elapsed_ms: Date.now() - startedAt,
    stderr_excerpt: stderr.trim().slice(0, 300) || null,
    stdout_excerpt: stdout.trim().slice(0, 300) || null,
  };
}

function normalizeCommand(command, args) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) {
    return [command, args];
  }

  const line = [command, ...args].map(quoteWindowsArg).join(' ');
  return ['cmd.exe', ['/d', '/s', '/c', line]];
}

function quoteWindowsArg(value) {
  if (!/[ \t"&<>|^]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

const checks = [
  ['live smoke', corepack, ['pnpm', 'plugforge:live-smoke']],
  ['cli scopes discovery', 'node', ['integrations/cli/src/index.mjs', 'scopes', '--ship-url', shipUrl]],
  ['cli webhook event discovery', 'node', ['integrations/cli/src/index.mjs', 'webhooks', 'events', '--ship-url', shipUrl]],
  ['cli help', 'node', ['integrations/cli/src/index.mjs', '--help']],
  ['sdk unit tests', corepack, ['pnpm', 'plugforge:sdk-test']],
  ['plugforge fitness', corepack, ['pnpm', '--filter', '@ship/api', 'plugforge:fitness']],
  ['performance evidence', corepack, ['pnpm', 'plugforge:perf']],
  ['cost snapshot', corepack, ['pnpm', 'plugforge:costs', '--', '--measure-ci']],
];

const results = [];
for (const [name, command, args] of checks) {
  console.log(`\n=== ${name} ===`);
  results.push(await run(name, command, args));
}

const summary = {
  ok: results.every((result) => result.ok),
  ship_url: shipUrl,
  checked_at: new Date().toISOString(),
  results,
};

console.log('\n=== summary ===');
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
