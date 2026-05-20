// Cat 3 — Benchmark the top 5 endpoints at c=10/25/50.
//
// Drives `corepack pnpm dlx autocannon` per cell, captures the latency
// JSON, and reports P50 / P95 (interpolated from p90 + p97.5) / P99.
//
// Reads session_id from .cookies.txt (created by the login curl one-liner
// in 03-api-perf-measurement.md). Writes per-cell JSON to
// shipshape/improvements/raw/perf-after-v3/ and a parsed summary to
// _summary.json + _summary.txt.
//
// Run: node shipshape/improvements/_measure-api-perf.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SESSION = (() => {
  const cookies = readFileSync('.cookies.txt', 'utf-8');
  const m = cookies.match(/^[^#].*\bsession_id\s+(\S+)/m);
  if (!m) throw new Error('No session_id in .cookies.txt — run the login curl first');
  return m[1];
})();

const OUT_DIR = resolve('shipshape/improvements/raw/perf-after-v3');
mkdirSync(OUT_DIR, { recursive: true });

const ENDPOINTS = [
  { name: 'auth_me',        path: '/api/auth/me' },
  { name: 'weeks_my_week',  path: '/api/weeks/my-week' },
  { name: 'my_work',        path: '/api/dashboard/my-work' },
  { name: 'issues_list',    path: '/api/issues' },
  { name: 'documents_wiki', path: '/api/documents?type=wiki' },
];
const CONCURRENCY = [10, 25, 50];
const DURATION = 10;

function p95(j) {
  // autocannon doesn't report p95; interpolate linearly between p90 and p97.5.
  return Math.round(j.latency.p90 + (j.latency.p97_5 - j.latency.p90) * (5 / 7.5));
}

const summary = {
  seed: '517 docs / 304 issues / 21 users / 35 sprints',
  conditions: { duration_sec: DURATION, hardware: 'Windows 11 dev box, native Postgres 18', flag: 'SHIPSHAPE_AUDIT=1 rate-limiter bypass' },
  cells: [],
};

// Helper: sleep ms between cells so the dev API can drain its pool/queue
// and finish any in-flight WebSocket heartbeats without piling on the next
// load test.
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

for (const ep of ENDPOINTS) {
  for (const c of CONCURRENCY) {
    const outFile = resolve(OUT_DIR, `${ep.name}_c${c}.json`);
    sleepSync(3000); // 3s cooldown between cells
    console.error(`Running ${ep.name} c=${c} …`);
    try {
      const stdout = execFileSync('cmd', ['/c', 'corepack', 'pnpm', 'dlx', 'autocannon@latest',
        '-c', String(c),
        '-d', String(DURATION),
        '-H', `Cookie: session_id=${SESSION}`,
        '-j',
        `http://localhost:3000${ep.path}`,
      ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      // autocannon emits JSON on stdout when -j is set. Corepack also
      // emits progress text; find the autocannon JSON by scanning for
      // `{"url":` (the first key of autocannon's output) on a line.
      const lines = stdout.split(/\r?\n/);
      const jsonLine = lines.find(l => l.startsWith('{"url":'));
      if (!jsonLine) throw new Error('no autocannon JSON line in stdout');
      const json = JSON.parse(jsonLine);
      writeFileSync(outFile, JSON.stringify(json, null, 2));
      const p50 = json.latency.p50;
      const p95v = p95(json);
      const p99 = json.latency.p99;
      const rps = Math.round(json.requests.average);
      const non2xx = json.non2xx || 0;
      const status = non2xx > 0 ? `⚠ ${non2xx} non-2xx` : 'OK';
      summary.cells.push({
        endpoint: ep.path, concurrency: c,
        p50_ms: p50, p95_ms: p95v, p99_ms: p99, rps,
        non2xx,
      });
      console.error(`  P50=${p50}  P95=${p95v}  P99=${p99}  RPS=${rps}  ${status}`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      summary.cells.push({ endpoint: ep.path, concurrency: c, error: e.message });
    }
  }
}

writeFileSync(resolve(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));

const rows = ['Endpoint                       Conc  P50     P95     P99     RPS     Status'];
rows.push('-'.repeat(75));
for (const c of summary.cells) {
  if (c.error) {
    rows.push(`${c.endpoint.padEnd(30)} ${String(c.concurrency).padStart(4)}  ERROR: ${c.error}`);
  } else {
    rows.push(
      `${c.endpoint.padEnd(30)} ${String(c.concurrency).padStart(4)}  ` +
      `${String(c.p50_ms).padStart(4)}ms  ${String(c.p95_ms).padStart(4)}ms  ${String(c.p99_ms).padStart(4)}ms  ${String(c.rps).padStart(5)}  ` +
      (c.non2xx > 0 ? `⚠ ${c.non2xx} non-2xx` : 'OK')
    );
  }
}
const summaryTxt = rows.join('\n');
writeFileSync(resolve(OUT_DIR, '_summary.txt'), summaryTxt);
console.error('\n' + summaryTxt);
