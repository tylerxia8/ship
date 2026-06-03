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
  const writeOperationsPerWeek = numberEnv('PLUGFORGE_COST_WRITE_OPS_PER_WEEK', numberEnv('PLUGFORGE_COST_DRILL_RUNS_PER_WEEK', 100));
  const subscriptionsPerEventType = numberEnv('PLUGFORGE_COST_SUBSCRIPTIONS_PER_EVENT_TYPE', 1);
  const attemptsPerDelivery = numberEnv('PLUGFORGE_COST_WEBHOOK_ATTEMPTS_PER_DELIVERY', numberEnv('PLUGFORGE_COST_WEBHOOK_ATTEMPTS_PER_DRILL', 1));
  const portalViewsPerWeek = numberEnv('PLUGFORGE_COST_PORTAL_VIEWS_PER_WEEK', 25);
  const deliveryRetentionDays = numberEnv('PLUGFORGE_COST_DELIVERY_RETENTION_DAYS', 30);
  const auditRetentionDays = numberEnv('PLUGFORGE_COST_AUDIT_RETENTION_DAYS', 90);
  const eventBytes = numberEnv('PLUGFORGE_COST_WEBHOOK_EVENT_BYTES', 1536);
  const deliveryBytes = numberEnv('PLUGFORGE_COST_WEBHOOK_DELIVERY_BYTES', 1792);
  const auditBytes = numberEnv('PLUGFORGE_COST_AUDIT_ROW_BYTES', 768);
  const deliveryEgressBytes = numberEnv('PLUGFORGE_COST_WEBHOOK_EGRESS_BYTES', 2048);
  const portalReadBytes = numberEnv('PLUGFORGE_COST_PORTAL_READ_BYTES', 8192);

  const events = writeOperationsPerWeek;
  const logicalDeliveries = writeOperationsPerWeek * subscriptionsPerEventType;
  const deliveryAttemptRows = logicalDeliveries * attemptsPerDelivery;
  const auditRows = writeOperationsPerWeek * 3;
  const weeklyStorageBytes = events * eventBytes + deliveryAttemptRows * deliveryBytes + auditRows * auditBytes;
  const retainedWebhookBytes = (events * eventBytes + deliveryAttemptRows * deliveryBytes) * (deliveryRetentionDays / 7);
  const retainedAuditBytes = auditRows * auditBytes * (auditRetentionDays / 7);
  const egressBytes = deliveryAttemptRows * deliveryEgressBytes + portalViewsPerWeek * portalReadBytes;

  return {
    inputs: {
      write_operations_per_week: writeOperationsPerWeek,
      webhook_fanout_ratio: subscriptionsPerEventType,
      webhook_attempts_per_delivery: attemptsPerDelivery,
      portal_views_per_week: portalViewsPerWeek,
      delivery_retention_days: deliveryRetentionDays,
      audit_retention_days: auditRetentionDays,
    },
    row_size_assumptions_bytes: {
      webhook_event: eventBytes,
      webhook_delivery: deliveryBytes,
      public_api_audit_row: auditBytes,
    },
    weekly_counts: {
      webhook_events: events,
      logical_webhook_deliveries: logicalDeliveries,
      webhook_delivery_attempt_rows: deliveryAttemptRows,
      public_api_audit_rows_from_drills: auditRows,
    },
    weekly_storage_bytes: weeklyStorageBytes,
    weekly_storage_kb: Number((weeklyStorageBytes / 1024).toFixed(2)),
    retained_storage_bytes: Math.round(retainedWebhookBytes + retainedAuditBytes),
    retained_storage_kb: Number(((retainedWebhookBytes + retainedAuditBytes) / 1024).toFixed(2)),
    weekly_egress_bytes: egressBytes,
    weekly_egress_kb: Number((egressBytes / 1024).toFixed(2)),
  };
}

function epic7SpendSnapshot() {
  const beforeTokens = numberEnv('EPIC7_AGENT_BASELINE_TOKENS_PER_TURN', 0);
  const afterTokens = numberEnv('EPIC7_AGENT_REWIRE_TOKENS_PER_TURN', 0);
  const dailySpendUsd = numberEnv('EPIC7_LLM_SPEND_USD_DAY', 0);
  const users = numberEnv('EPIC7_USERS', 0);
  const activeRate = numberEnv('EPIC7_AGENT_ACTIVE_RATE', 0.05);
  const turnsPerActiveUser = numberEnv('EPIC7_AGENT_TURNS_PER_ACTIVE_USER', 10);
  return {
    llm_spend_usd_day: dailySpendUsd,
    baseline_tokens_per_turn: beforeTokens,
    rewire_tokens_per_turn: afterTokens,
    token_delta: afterTokens - beforeTokens,
    token_delta_percent: beforeTokens > 0
      ? Number((((afterTokens - beforeTokens) / beforeTokens) * 100).toFixed(2))
      : null,
    agent_active_rate: activeRate,
    agent_turns_per_active_user: turnsPerActiveUser,
    estimated_agent_llm_calls_day: Math.round(users * activeRate * turnsPerActiveUser),
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
