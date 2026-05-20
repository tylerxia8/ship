// Cat 4 — drive the 5 user flows the brief calls out, count queries per flow.
//
// Method: the API process is started with QUERY_LOG=<path> so pool.query
// writes one TSV line per call. For each flow we:
//   1. Clear the log file
//   2. Issue the HTTP request(s) that the user-flow corresponds to
//   3. Read the log
//   4. Record { flow, queries, total_ms, slowest, slowest_ms }
//
// Reads session cookie from .cookies.txt.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const LOG_PATH = resolve('shipshape/improvements/raw/cat4-flows/queries.tsv');
const OUT_PATH = resolve('shipshape/improvements/raw/cat4-flows/_flows-summary.json');
const TXT_PATH = resolve('shipshape/improvements/raw/cat4-flows/_flows-summary.txt');

const SESSION = (() => {
  const cookies = readFileSync('.cookies.txt', 'utf-8');
  const m = cookies.match(/^[^#].*\bsession_id\s+(\S+)/m);
  if (!m) throw new Error('No session_id in .cookies.txt — run the login curl first');
  return m[1];
})();

const ROOT = 'http://localhost:3000';
const COOKIE = `Cookie: session_id=${SESSION}`;

async function http(method, path) {
  const res = await fetch(`${ROOT}${path}`, {
    method,
    headers: { Cookie: `session_id=${SESSION}` },
  });
  // Read body (mostly to make sure server finishes the request before we read the log)
  await res.text();
  return res.status;
}

function clearLog() {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
}

function readLog() {
  if (!existsSync(LOG_PATH)) return [];
  const text = readFileSync(LOG_PATH, 'utf-8');
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [ts, tag, dt, sql] = line.split('\t');
      return { ts, tag, dt: Number(dt), sql };
    });
}

// First-line SQL pattern (helps group N+1 detection)
function shapeOf(sql) {
  return sql
    .replace(/\$\d+/g, '?')                    // params
    .replace(/'\d{4}-\d{2}-\d{2}T[^']+'/g, "'<ts>'")
    .replace(/'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'/gi, "'<uuid>'")
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

const FLOWS = [
  {
    name: 'load_main_page',
    description: 'User opens /my-week (the workspace hub, the post-login default route)',
    requests: [
      ['GET', '/api/auth/me'],
      ['GET', '/api/weeks/my-week'],
    ],
  },
  {
    name: 'view_a_document',
    description: 'User opens a wiki document. Walks: list → pick first → fetch by id',
    requests: [],   // filled below after we know an ID
  },
  {
    name: 'list_issues',
    description: 'User opens /issues',
    requests: [['GET', '/api/issues']],
  },
  {
    name: 'load_sprint_board',
    description: 'User opens /dashboard which loads the my-work board',
    requests: [
      ['GET', '/api/auth/me'],
      ['GET', '/api/dashboard/my-work'],
    ],
  },
  {
    name: 'search_content',
    description: 'User invokes the global search (used in CommandPalette + mentions)',
    requests: [['GET', '/api/search/mentions?q=ship']],
  },
];

const results = [];

// Helper to discover a document ID for the "view a document" flow
async function pickADocId() {
  const res = await fetch(`${ROOT}/api/documents?type=wiki`, { headers: { Cookie: `session_id=${SESSION}` } });
  const json = await res.json();
  // shape may be { documents: [...] } or { data: [...] } — handle both
  const list = json.documents || json.data || (Array.isArray(json) ? json : []);
  return list[0]?.id;
}

const docId = await pickADocId();
if (docId) {
  FLOWS.find(f => f.name === 'view_a_document').requests = [['GET', `/api/documents/${docId}`]];
} else {
  console.warn('Warning: no wiki doc found for view_a_document flow');
}

for (const flow of FLOWS) {
  clearLog();
  for (const [method, path] of flow.requests) {
    await http(method, path);
  }
  // Give the file system a beat to flush
  await new Promise(r => setTimeout(r, 200));
  const entries = readLog();
  const totalMs = entries.reduce((s, e) => s + e.dt, 0);
  const slowest = entries.reduce((a, b) => (a && a.dt >= b.dt ? a : b), null);

  // N+1 detection: count distinct SQL shapes, find shapes that appear ≥3 times
  const shapeCounts = new Map();
  for (const e of entries) {
    const s = shapeOf(e.sql);
    shapeCounts.set(s, (shapeCounts.get(s) || 0) + 1);
  }
  const possibleNplus1 = [...shapeCounts.entries()].filter(([, n]) => n >= 3).map(([sql, count]) => ({ count, sql }));

  results.push({
    name: flow.name,
    description: flow.description,
    requests: flow.requests,
    query_count: entries.length,
    total_query_ms: totalMs,
    slowest_query: slowest ? { dt_ms: slowest.dt, sql: shapeOf(slowest.sql) } : null,
    possible_n_plus_1: possibleNplus1,
    queries: entries.map(e => ({ dt: e.dt, sql: shapeOf(e.sql) })),
  });
}

writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

const txt = [];
txt.push('Flow                  Queries  TotalMs  Slowest (ms)  Slowest query (first 80 chars)');
txt.push('-'.repeat(110));
for (const r of results) {
  const slowestSql = r.slowest_query ? r.slowest_query.sql.slice(0, 60) : '-';
  const slowestMs = r.slowest_query ? r.slowest_query.dt_ms : 0;
  txt.push(
    r.name.padEnd(22) +
    String(r.query_count).padStart(7) + '  ' +
    String(r.total_query_ms).padStart(6) + '  ' +
    String(slowestMs).padStart(11) + '  ' +
    slowestSql
  );
}
txt.push('');
txt.push('Possible N+1 (shape that repeated ≥3 times in a single flow):');
for (const r of results) {
  for (const n of r.possible_n_plus_1) {
    txt.push(`  [${r.name}] ${n.count}×  ${n.sql.slice(0, 80)}`);
  }
}
const summary = txt.join('\n');
writeFileSync(TXT_PATH, summary);
console.log(summary);
