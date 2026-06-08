#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = process.env.PLUGFORGE_PROOF_OUTPUT || 'test-results/plugforge-proof-gate.json';
const requireGithub = !process.argv.includes('--skip-github');

function usage() {
  console.log(`Plugforge proof gate

Checks that the final submission has current evidence, proof commands, and CI
drill coverage. By default, it also verifies that the current HEAD has a
successful GitHub Actions "PlugForge Drill" run when gh is authenticated.

Optional:
  PLUGFORGE_PROOF_OUTPUT   Default: test-results/plugforge-proof-gate.json
  --skip-github            Do not require a matching successful GitHub run

Examples:
  corepack.cmd pnpm plugforge:proof-gate
  corepack.cmd pnpm plugforge:proof-gate -- --skip-github
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

function read(file) {
  return readFileSync(file, 'utf8');
}

function json(file) {
  return JSON.parse(read(file));
}

function run(command, args) {
  const [spawnCommand, spawnArgs] = normalizeCommand(command, args);
  return execFileSync(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
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

function visibleStatus(rawStatus) {
  const ignored = new Set(['.agents/', '.codex/', 'AGENTS.md']);
  return rawStatus
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      const changedPath = line.replace(/^\s*[MADRCU?!]{1,2}\s+/, '').replace(/\\/g, '/');
      return !ignored.has(changedPath);
    });
}

function addCheck(name, ok, detail, required = true) {
  checks.push({ name, ok: Boolean(ok), required, detail });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

const checks = [];
const packageJson = json('package.json');
const workflow = read('.github/workflows/plugforge-drill.yml');
const evidence = read('PLUGFORGE_EVIDENCE_PACK.md');
const checklist = read('PLUGFORGE_SUBMISSION_CHECKLIST.md');
const reviewerHub = read('PLUGFORGE_README.md');
const costAnalysis = read('PLUGFORGE_AI_COST_ANALYSIS.md');
const finalSubmission = read('PLUGFORGE_FINAL_SUBMISSION.md');
const performanceComparison = read('PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md');

const requiredFiles = [
  'PLUGFORGE_README.md',
  'PLUGFORGE_FINAL_SUBMISSION.md',
  'PLUGFORGE_GRADER_QUICKSTART.md',
  'PLUGFORGE_EARLY_SUBMISSION.md',
  'PLUGFORGE_EARLY_DEMO_RUNBOOK.md',
  'PLUGFORGE_FINAL_DEMO_SCRIPT.md',
  'PLUGFORGE_EVIDENCE_PACK.md',
  'PLUGFORGE_SUBMISSION_CHECKLIST.md',
  'PLUGFORGE_DEMO_SCRIPT.md',
  'PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md',
  'PRESEARCH_CONVERSATION_REFERENCE.md',
  'PRESEARCH.md',
  'docs/architecture.md',
  'docs/openapi.json',
  'docs/plugforge-final-demo.html',
  'docs/screenshots/plugforge/README.md',
  'api/src/platform/webhooks.signer.test.ts',
  'sdk/tests/client.test.ts',
  'sdk/tests/webhooks.test.ts',
  'scripts/plugforge-final-check.mjs',
  'scripts/plugforge-evidence-pack.mjs',
  'scripts/plugforge-doctor.mjs',
  'scripts/plugforge-flake-drill.mjs',
  'scripts/plugforge-proof-gate.mjs',
];

for (const file of requiredFiles) {
  const present = existsSync(file);
  addCheck(
    `required file: ${file}`,
    present && statSync(file).size > 0,
    present ? `${statSync(file).size} bytes` : 'missing',
  );
}

const requiredScripts = [
  'plugforge:doctor',
  'plugforge:final-check',
  'plugforge:evidence-pack',
  'plugforge:flake',
  'plugforge:proof-gate',
  'plugforge:sdk-test',
];
for (const script of requiredScripts) {
  addCheck(`package script: ${script}`, Boolean(packageJson.scripts?.[script]), packageJson.scripts?.[script] || 'missing');
}

addCheck(
  'evidence pack reports clean source revision',
  evidence.includes('No relevant uncommitted changes.'),
  'PLUGFORGE_EVIDENCE_PACK.md Source Revision section',
);
addCheck(
  'evidence pack embeds passing final check',
  evidence.includes('## Final Check') && evidence.includes('- Passed: Yes'),
  'PLUGFORGE_EVIDENCE_PACK.md Final Check section',
);
addCheck(
  'reviewer hub names repeatable proof commands',
  includesAll(reviewerHub, ['plugforge:proof-gate', 'plugforge:final-check', 'plugforge:doctor']),
  'PLUGFORGE_README.md Developer Experience / Verification',
);
addCheck(
  'final check includes SDK unit regression tests',
  read('scripts/plugforge-final-check.mjs').includes('sdk unit tests'),
  'scripts/plugforge-final-check.mjs checks array',
);
addCheck(
  'final check includes cost and performance evidence',
  includesAll(read('scripts/plugforge-final-check.mjs'), ['performance evidence', 'cost snapshot']),
  'scripts/plugforge-final-check.mjs checks array',
);
addCheck(
  'agent client credentials rewire is documented',
  includesAll(finalSubmission, ['Client Credentials', 'SHIP_AGENT_CLIENT_ID', 'plugforge-agent-audit-proof']),
  'PLUGFORGE_FINAL_SUBMISSION.md Agent-as-citizen evidence',
);
addCheck(
  'cost analysis includes measured token and cost evidence',
  includesAll(costAnalysis, ['50,296', '14,886', '$0.336628', '0%']),
  'PLUGFORGE_AI_COST_ANALYSIS.md measured development evidence',
);
addCheck(
  'performance comparison includes Part 1 baseline and PlugForge measurements',
  includesAll(performanceComparison, ['Initial chunk raw', 'Query Counts', '0.009473ms/call', '4,094 B']),
  'PLUGFORGE_FINAL_PERFORMANCE_COMPARISON.md',
);
addCheck(
  'checklist records behavior evidence and environment limits',
  includesAll(checklist, ['GitHub Actions PlugForge Drill run', 'PLAYWRIGHT_WORKERS=2', 'comply opensource']),
  'PLUGFORGE_SUBMISSION_CHECKLIST.md Final Readiness Sweep',
);
addCheck(
  'workflow runs TTFE and 20-run flake proof',
  includesAll(workflow, ['TTFE_TARGET_MS: "60000"', 'PLUGFORGE_FLAKE_RUNS: "20"', 'plugforge-flake-proof.json']),
  '.github/workflows/plugforge-drill.yml',
);
addCheck(
  'workflow is prepared for Node 24 actions',
  includesAll(workflow, ['node-version: 24', 'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"']),
  '.github/workflows/plugforge-drill.yml',
);

const gitStatus = visibleStatus(run('git', ['status', '--short']));
addCheck(
  'working tree has no relevant uncommitted changes',
  gitStatus.length === 0,
  gitStatus.length ? gitStatus.join('\n') : 'clean',
  false,
);

const head = run('git', ['rev-parse', 'HEAD']);
let githubRun = null;
if (requireGithub) {
  try {
    const runs = JSON.parse(run('gh', [
      'run',
      'list',
      '--workflow',
      'PlugForge Drill',
      '--limit',
      '20',
      '--json',
      'databaseId,status,conclusion,headSha,url,createdAt',
    ]));
    githubRun = runs.find((runInfo) => runInfo.headSha === head && runInfo.status === 'completed' && runInfo.conclusion === 'success') || null;
    addCheck(
      'current HEAD has successful PlugForge Drill run',
      Boolean(githubRun),
      githubRun ? `${githubRun.databaseId} ${githubRun.url}` : `no successful run found for ${head}`,
    );
  } catch (err) {
    addCheck(
      'current HEAD has successful PlugForge Drill run',
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
} else {
  addCheck('current HEAD has successful PlugForge Drill run', true, 'skipped by --skip-github', false);
}

const failed = checks.filter((check) => check.required && !check.ok);
const summary = {
  ok: failed.length === 0,
  generated_at: new Date().toISOString(),
  head,
  github_run: githubRun,
  checks,
};

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
