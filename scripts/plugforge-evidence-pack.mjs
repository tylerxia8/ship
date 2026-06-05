#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const shipUrl = (process.env.SHIP_URL || 'https://d2rr1fze9v095b.cloudfront.net').replace(/\/$/, '');
const outputPath = process.env.OUTPUT || 'PLUGFORGE_EVIDENCE_PACK.md';
const includeFinalCheck = process.argv.includes('--include-final-check');
const requiredPaths = [
  '/scopes',
  '/webhooks/events',
  '/oauth/apps/{id}/audit',
  '/oauth/apps/{id}/webhook-subscriptions',
  '/oauth/apps/{id}/webhook-deliveries',
  '/oauth/apps/{id}/webhook-subscriptions/{subscriptionId}/test',
];

function usage() {
  console.log(`Plugforge evidence pack

Writes a reviewer-friendly markdown evidence bundle with live endpoint checks,
OpenAPI contract coverage, git revision, and optional final-check output.

Optional:
  SHIP_URL              Default: https://d2rr1fze9v095b.cloudfront.net
  OUTPUT                Default: PLUGFORGE_EVIDENCE_PACK.md
  --include-final-check Run the longer final check and include its tail output

Example:
  corepack.cmd pnpm plugforge:evidence-pack
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
}

function visibleStatus(rawStatus) {
  const ignored = new Set(['.agents/', '.codex/', 'AGENTS.md', outputPath.replace(/\\/g, '/')]);
  const visible = rawStatus
    .split('\n')
    .filter((line) => {
      const path = line.replace(/^\s*[MADRCU?!]{1,2}\s+/, '').replace(/\\/g, '/');
      return !ignored.has(path);
    })
    .join('\n')
    .trim();
  return visible || 'No relevant uncommitted changes.';
}

function runCommand(command, args) {
  const startedAt = Date.now();
  const [spawnCommand, spawnArgs] = normalizeCommand(command, args);
  try {
    const stdout = execFileSync(spawnCommand, spawnArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, SHIP_URL: shipUrl },
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      output_tail: stdout.trim().split('\n').slice(-40).join('\n'),
    };
  } catch (err) {
    return {
      ok: false,
      elapsed_ms: Date.now() - startedAt,
      output_tail: `${err.stdout || ''}${err.stderr || err.message}`.trim().split('\n').slice(-40).join('\n'),
    };
  }
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

async function request(path) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${shipUrl}${path}`);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const body = contentType.includes('application/json') && text ? JSON.parse(text) : text;
    return {
      path,
      ok: response.ok,
      status: response.status,
      elapsed_ms: Date.now() - startedAt,
      body,
    };
  } catch (err) {
    return {
      path,
      ok: false,
      status: null,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function staticOpenApiSummary() {
  try {
    const openapi = JSON.parse(readFileSync('docs/openapi.json', 'utf8'));
    const paths = Object.keys(openapi.paths || {});
    return {
      ok: true,
      title: openapi.info?.title || 'unknown',
      version: openapi.info?.version || 'unknown',
      path_count: paths.length,
      required: requiredPaths.map((path) => ({ path, present: Boolean(openapi.paths?.[path]) })),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      required: requiredPaths.map((path) => ({ path, present: false })),
    };
  }
}

function liveOpenApiSummary(openapiResult) {
  if (!openapiResult.ok || !openapiResult.body || typeof openapiResult.body !== 'object') {
    return {
      ok: false,
      path_count: 0,
      required: requiredPaths.map((path) => ({ path, present: false })),
    };
  }
  const openapi = openapiResult.body;
  const paths = Object.keys(openapi.paths || {});
  return {
    ok: true,
    title: openapi.info?.title || 'unknown',
    version: openapi.info?.version || 'unknown',
    path_count: paths.length,
    required: requiredPaths.map((path) => ({ path, present: Boolean(openapi.paths?.[path]) })),
  };
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function fenced(value) {
  return ['```text', value || '(no output)', '```'].join('\n');
}

const endpointChecks = await Promise.all([
  request('/health'),
  request('/api/v1/openapi.json'),
  request('/api/v1/scopes'),
  request('/api/v1/webhooks/events'),
]);

const openapiLive = liveOpenApiSummary(endpointChecks.find((result) => result.path === '/api/v1/openapi.json'));
const openapiStatic = staticOpenApiSummary();
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const smoke = runCommand(corepack, ['pnpm', 'plugforge:live-smoke']);
const finalCheck = includeFinalCheck ? runCommand(corepack, ['pnpm', 'plugforge:final-check']) : null;

const branch = runGit(['branch', '--show-current']);
const status = visibleStatus(runGit(['status', '--short']));
const generatedAt = new Date().toISOString();

const endpointTable = table(
  ['Check', 'Status', 'HTTP', 'Latency'],
  endpointChecks.map((result) => [
    `\`${result.path}\``,
    yesNo(result.ok),
    result.status ?? 'n/a',
    `${result.elapsed_ms}ms`,
  ]),
);

const staticPathTable = table(
  ['Required path under `/api/v1`', 'Static OpenAPI', 'Live OpenAPI'],
  requiredPaths.map((path) => {
    const staticRow = openapiStatic.required.find((row) => row.path === path);
    const liveRow = openapiLive.required.find((row) => row.path === path);
    return [`\`${path}\``, yesNo(staticRow?.present), yesNo(liveRow?.present)];
  }),
);

const markdown = `# Plugforge Evidence Pack

Generated: \`${generatedAt}\`

## Deployment

- Live app: \`${shipUrl}\`
- Developer Portal: \`${shipUrl}/settings/developers\`
- OpenAPI: \`${shipUrl}/api/v1/openapi.json\`
- Scopes: \`${shipUrl}/api/v1/scopes\`
- Webhook event registry: \`${shipUrl}/api/v1/webhooks/events\`

## Source Revision

- Branch: \`${branch}\`

${fenced(status)}

## Live Endpoint Checks

${endpointTable}

## OpenAPI Contract Coverage

- Static contract: ${yesNo(openapiStatic.ok)}${openapiStatic.ok ? `, ${openapiStatic.path_count} paths, ${openapiStatic.title} ${openapiStatic.version}` : ''}
- Live contract: ${yesNo(openapiLive.ok)}${openapiLive.ok ? `, ${openapiLive.path_count} paths, ${openapiLive.title} ${openapiLive.version}` : ''}

${staticPathTable}

## Smoke Verification

- Command: \`corepack.cmd pnpm plugforge:live-smoke\`
- Passed: ${yesNo(smoke.ok)}
- Elapsed: ${smoke.elapsed_ms}ms

${fenced(smoke.output_tail)}

${finalCheck ? `## Final Check

- Command: \`corepack.cmd pnpm plugforge:final-check\`
- Passed: ${yesNo(finalCheck.ok)}
- Elapsed: ${finalCheck.elapsed_ms}ms

${fenced(finalCheck.output_tail)}
` : `## Final Check

The longer final check was not run for this pack. To include it, run:

\`\`\`powershell
corepack.cmd pnpm plugforge:evidence-pack -- --include-final-check
\`\`\`
`}

## Reviewer Notes

- Public platform routes are under \`/api/v1/*\`.
- First-party Ship UI routes remain under \`/api/*\`.
- Developer Portal app activity, webhook subscriptions, deliveries, and test events are session-authenticated admin views.
- Webhook delivery is at-least-once. Consumers should dedupe with the idempotency key.
`;

writeFileSync(outputPath, markdown);
console.log(`Wrote ${outputPath}`);

if (!endpointChecks.every((result) => result.ok) || !openapiLive.ok || !openapiStatic.ok || !smoke.ok) {
  process.exitCode = 1;
}
