#!/usr/bin/env node
/**
 * ShipShape — Security Probe Tool
 *
 * One-command security audit of a running Ship instance. Probes four attack
 * surfaces (auth, websocket, input, deps) and runs four manual-review checks
 * (cors, csp, secrets, rate limit, error verbosity). Produces a structured
 * report (JSON + Markdown) with severity ratings and reproduction steps.
 *
 * Usage:
 *   node shipshape/security/probe.mjs                       # local dev defaults
 *   node shipshape/security/probe.mjs --api=https://...     # remote target
 *
 * The tool is read-only by default — it CREATES test data via the API (issues,
 * documents) using authenticated calls, but never deletes existing rows. Use
 * --cleanup to remove the artifacts it created.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAuthProbe } from './modules/auth.mjs';
import { runInputProbe } from './modules/input.mjs';
import { runWebSocketProbe } from './modules/websocket.mjs';
import { runDepsProbe } from './modules/deps.mjs';
import { runManualReview } from './modules/manual.mjs';
import { writeReport } from './report.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

const ARGS = parseArgs(process.argv.slice(2));
const CONFIG = {
  api: ARGS.api ?? 'http://localhost:3000',
  web: ARGS.web ?? 'http://localhost:5173',
  email: ARGS.email ?? 'dev@ship.local',
  password: ARGS.password ?? 'admin123',
  cleanup: !!ARGS.cleanup,
  outDir: ARGS.out ?? resolve(REPO_ROOT, 'shipshape/security/raw'),
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (arg.startsWith('--')) out[arg.slice(2)] = true;
  }
  return out;
}

async function main() {
  console.log('=== ShipShape Security Probe ===');
  console.log(`api:  ${CONFIG.api}`);
  console.log(`web:  ${CONFIG.web}`);
  console.log(`out:  ${CONFIG.outDir}`);
  console.log();

  // Quick liveness check before doing anything else.
  try {
    const h = await fetch(`${CONFIG.api}/health`);
    if (!h.ok) throw new Error(`health=${h.status}`);
  } catch (e) {
    console.error(`✗ API at ${CONFIG.api} not reachable: ${e.message}`);
    console.error(`  Start the dev servers with \`pnpm dev\` and re-run.`);
    process.exit(1);
  }

  mkdirSync(CONFIG.outDir, { recursive: true });

  // Run each probe sequentially. Probes are isolated — a failure in one
  // doesn't fail the whole run; the result.error field carries the cause.
  const findings = [];
  const probes = [
    { name: 'auth', fn: runAuthProbe },
    { name: 'input', fn: runInputProbe },
    { name: 'websocket', fn: runWebSocketProbe },
    { name: 'deps', fn: runDepsProbe },
    { name: 'manual', fn: runManualReview },
  ];

  for (const probe of probes) {
    console.log(`▶ ${probe.name}`);
    const started = Date.now();
    try {
      const result = await probe.fn(CONFIG);
      findings.push(...result.findings);
      console.log(`  ✓ ${probe.name}: ${result.findings.length} finding(s) in ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`  ✗ ${probe.name} threw: ${err.message}`);
      findings.push({
        surface: probe.name,
        id: `${probe.name}-probe-error`,
        severity: 'info',
        title: `Probe '${probe.name}' threw during execution`,
        description: err.message,
        reproduction: ['Re-run the probe; if the error reproduces, file a bug against the probe tool.'],
      });
    }
  }

  // Sort: critical → high → medium → low → info → ok
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4, ok: 5 };
  findings.sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));

  const meta = {
    target: { api: CONFIG.api, web: CONFIG.web },
    scannedAt: new Date().toISOString(),
    probeVersion: '1.0.0',
  };
  writeReport(findings, meta, CONFIG.outDir);

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
    ok: findings.filter(f => f.severity === 'ok').length,
  };
  console.log();
  console.log('=== Summary ===');
  console.log(`critical: ${counts.critical}  high: ${counts.high}  medium: ${counts.medium}  low: ${counts.low}  info: ${counts.info}  ok: ${counts.ok}`);
  console.log(`Report: ${resolve(CONFIG.outDir, 'report.md')}`);

  // Non-zero exit if anything is critical/high — CI-friendly.
  if (counts.critical > 0 || counts.high > 0) process.exit(2);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
