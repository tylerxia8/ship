import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const args = new Set(process.argv.slice(2));
const measureCi = args.has('--measure-ci');
const measureTtfe = args.has('--ttfe');

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeCommand(command, commandArgs) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) {
    return [command, commandArgs];
  }
  const line = [command, ...commandArgs].map(quoteWindowsArg).join(' ');
  return ['cmd.exe', ['/d', '/s', '/c', line]];
}

function quoteWindowsArg(value) {
  if (!/[ \t"&<>|^]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function runTimed(name, command, commandArgs) {
  const started = Date.now();
  const [spawnCommand, spawnArgs] = normalizeCommand(command, commandArgs);
  const child = spawn(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  return {
    name,
    ok: exitCode === 0,
    exit_code: exitCode,
    elapsed_ms: Date.now() - started,
    stdout_excerpt: stdout.trim().slice(-500) || null,
    stderr_excerpt: stderr.trim().slice(-500) || null,
  };
}

async function countOauthBrowserLaunches() {
  const spec = await readFile('e2e/plugforge-oauth.spec.ts', 'utf8');
  const tests = [...spec.matchAll(/\btest\(/g)].length;
  const usesPageFixture = /\bpage\b/.test(spec);
  return {
    spec: 'e2e/plugforge-oauth.spec.ts',
    tests,
    estimated_browser_contexts_per_run: usesPageFixture ? tests : 0,
    note: 'Playwright creates a browser context/page for each test using the page fixture.',
  };
}

function storageEstimate() {
  const drillRunsPerWeek = numberEnv('PLUGFORGE_COST_DRILL_RUNS_PER_WEEK', 100);
  const attemptsPerDrill = numberEnv('PLUGFORGE_COST_WEBHOOK_ATTEMPTS_PER_DRILL', 1);
  const portalViewsPerWeek = numberEnv('PLUGFORGE_COST_PORTAL_VIEWS_PER_WEEK', 25);
  const eventBytes = numberEnv('PLUGFORGE_COST_WEBHOOK_EVENT_BYTES', 1536);
  const deliveryBytes = numberEnv('PLUGFORGE_COST_WEBHOOK_DELIVERY_BYTES', 1792);
  const auditBytes = numberEnv('PLUGFORGE_COST_AUDIT_ROW_BYTES', 768);
  const deliveryEgressBytes = numberEnv('PLUGFORGE_COST_WEBHOOK_EGRESS_BYTES', 2048);
  const portalReadBytes = numberEnv('PLUGFORGE_COST_PORTAL_READ_BYTES', 8192);

  const events = drillRunsPerWeek;
  const deliveries = drillRunsPerWeek * attemptsPerDrill;
  const auditRows = drillRunsPerWeek * 3;
  const storageBytes = events * eventBytes + deliveries * deliveryBytes + auditRows * auditBytes;
  const egressBytes = deliveries * deliveryEgressBytes + portalViewsPerWeek * portalReadBytes;

  return {
    inputs: {
      drill_runs_per_week: drillRunsPerWeek,
      webhook_attempts_per_drill: attemptsPerDrill,
      portal_views_per_week: portalViewsPerWeek,
    },
    row_size_assumptions_bytes: {
      webhook_event: eventBytes,
      webhook_delivery: deliveryBytes,
      public_api_audit_row: auditBytes,
    },
    weekly_counts: {
      webhook_events: events,
      webhook_deliveries: deliveries,
      public_api_audit_rows_from_drills: auditRows,
    },
    weekly_storage_bytes: storageBytes,
    weekly_storage_kb: Number((storageBytes / 1024).toFixed(2)),
    weekly_egress_bytes: egressBytes,
    weekly_egress_kb: Number((egressBytes / 1024).toFixed(2)),
  };
}

function epic7SpendSnapshot() {
  const beforeTokens = numberEnv('EPIC7_AGENT_BASELINE_TOKENS_PER_TURN', 0);
  const afterTokens = numberEnv('EPIC7_AGENT_REWIRE_TOKENS_PER_TURN', 0);
  const dailySpendUsd = numberEnv('EPIC7_LLM_SPEND_USD_DAY', 0);
  return {
    llm_spend_usd_day: dailySpendUsd,
    baseline_tokens_per_turn: beforeTokens,
    rewire_tokens_per_turn: afterTokens,
    token_delta: afterTokens - beforeTokens,
    token_delta_percent: beforeTokens > 0
      ? Number((((afterTokens - beforeTokens) / beforeTokens) * 100).toFixed(2))
      : null,
    expected_invariant: 'Agent rewire changes direct service calls to SDK/public API calls; token volume should remain flat for the same agent turns.',
  };
}

const measurements = [];
if (measureCi) {
  measurements.push(await runTimed('openapi_generation', corepack, ['pnpm', '--filter', '@ship/api', 'plugforge:openapi']));
  measurements.push(await runTimed(
    'openapi_schema_validation',
    corepack,
    [
      'pnpm',
      '--filter',
      '@ship/api',
      'exec',
      'vitest',
      'run',
      'src/platform/fitness.test.ts',
      '-t',
      'validates the public OpenAPI document against the OpenAPI schema',
    ],
  ));
}

if (measureTtfe) {
  measurements.push(await runTimed('ttfe_drill', corepack, ['pnpm', 'drill', 'ttfe']));
}

const proof = {
  generated_at: new Date().toISOString(),
  measured_ci_commands: measureCi,
  measured_ttfe: measureTtfe,
  epic7_llm_spend_tracking: epic7SpendSnapshot(),
  ci_minutes_tracking: {
    ttfe_command: 'corepack.cmd pnpm drill ttfe',
    ttfe_ci_target_ms: Number(process.env.TTFE_TARGET_MS || 60_000),
    note: measureTtfe
      ? 'TTFE drill was measured in this snapshot.'
      : 'Run with --ttfe and SHIP_TOKEN/SHIP_URL or local Docker availability to measure the full loop.',
  },
  oauth_flow_testing: await countOauthBrowserLaunches(),
  openapi_overhead: measurements.filter((row) => row.name.startsWith('openapi_')),
  dev_portal_storage_and_egress: storageEstimate(),
  measurements,
};

console.log(JSON.stringify(proof, null, 2));

if (measurements.some((row) => !row.ok)) {
  process.exitCode = 1;
}
