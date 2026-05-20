// Cat 7 — Lighthouse a11y audit on every major route.
//
// Drives Lighthouse 13.3.0 against each route in the audit's 12-route set,
// passing the dev session cookie via --extra-headers so authenticated routes
// don't bounce to /login. Writes per-route JSON + HTML reports under
// raw/cat7-measurement/lighthouse/ and a parsed _summary.json at the root.
//
// Reads session cookie from .cookies.txt (created via the login curl).

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_DIR = resolve('shipshape/improvements/raw/cat7-measurement/lighthouse');
mkdirSync(OUT_DIR, { recursive: true });
// Clear stale .report.report.* artifacts from a prior buggy run
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.report.report.json') || f.endsWith('.report.report.html')) {
    try { unlinkSync(resolve(OUT_DIR, f)); } catch {}
  }
}

const ROUTES = [
  { name: 'login',           path: '/login',           requiresAuth: false },
  { name: 'my-week',         path: '/my-week',         requiresAuth: true  },
  { name: 'dashboard',       path: '/dashboard',       requiresAuth: true  },
  { name: 'docs',            path: '/docs',            requiresAuth: true  },
  { name: 'issues',          path: '/issues',          requiresAuth: true  },
  { name: 'projects',        path: '/projects',        requiresAuth: true  },
  { name: 'programs',        path: '/programs',        requiresAuth: true  },
  { name: 'team-allocation', path: '/team/allocation', requiresAuth: true  },
  { name: 'team-directory',  path: '/team/directory',  requiresAuth: true  },
  { name: 'team-status',     path: '/team/status',     requiresAuth: true  },
  { name: 'team-org-chart',  path: '/team/org-chart',  requiresAuth: true  },
  { name: 'settings',        path: '/settings',        requiresAuth: true  },
];

const SESSION = (() => {
  if (!existsSync('.cookies.txt')) {
    console.error('No .cookies.txt — run the login curl first.');
    process.exit(1);
  }
  const cookies = readFileSync('.cookies.txt', 'utf-8');
  const m = cookies.match(/^[^#].*\bsession_id\s+(\S+)/m);
  if (!m) {
    console.error('No session_id in .cookies.txt — run the login curl first');
    process.exit(1);
  }
  return m[1];
})();

const summary = {};

// Write headers to a temp file — works cross-shell because no quoting needed.
const HEADERS_FILE = resolve(OUT_DIR, '_headers.json');
writeFileSync(HEADERS_FILE, JSON.stringify({ Cookie: `session_id=${SESSION}` }));

for (const r of ROUTES) {
  const url = `http://localhost:5173${r.path}`;
  // Lighthouse APPENDS .report.json / .report.html to --output-path; pass the bare basename.
  const outBase = resolve(OUT_DIR, r.name);
  const json = `${outBase}.report.json`;
  const html = `${outBase}.report.html`;

  const headersArg = r.requiresAuth ? `--extra-headers=${HEADERS_FILE}` : '';

  const cmd = `npx -y lighthouse@13.3.0 ${url} --only-categories=accessibility --quiet --chrome-flags="--headless=new --no-sandbox" --output=json --output=html --output-path=${outBase} ${headersArg}`;

  console.log(`[${r.name}] running Lighthouse…`);
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
  } catch (e) {
    // Lighthouse may exit non-zero on Windows due to a Chrome-launcher tmp-dir
    // cleanup race (EPERM on rmSync of \\?\…\lighthouse.<pid>). The report
    // itself is already written before that step, so check for the file
    // before deciding the run failed.
    if (!existsSync(json)) {
      console.error(`  [${r.name}] FAIL (no report): ${e.message.slice(0, 200)}`);
      summary[r.name] = { error: e.message.slice(0, 400), url };
      continue;
    }
    // Report exists → cleanup-only failure, ignore.
  }
  try {
    const report = JSON.parse(readFileSync(json, 'utf-8'));
    const score = Math.round((report.categories.accessibility.score || 0) * 100);
    const fails = Object.values(report.audits)
      .filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'informative')
      .map(a => ({ id: a.id, title: a.title, scoreDisplayMode: a.scoreDisplayMode }));
    summary[r.name] = {
      score,
      fails,
      url,
      finalDisplayedUrl: report.finalDisplayedUrl,
      fetchTime: report.fetchTime,
      lhVer: report.lighthouseVersion,
    };
    console.log(`  [${r.name}] score=${score}  fails=${fails.map(f => f.id).join(',') || '(none)'}`);
  } catch (e) {
    summary[r.name] = { error: `parse: ${e.message}`, url };
  }
}

const sumPath = resolve('shipshape/improvements/raw/cat7-measurement/lighthouse/_summary.json');
writeFileSync(sumPath, JSON.stringify(summary, null, 2));
console.log(`\nWrote ${sumPath}`);
// Remove the temp headers file — contains a session cookie, must not be committed.
try { unlinkSync(HEADERS_FILE); } catch {}
const scores = Object.values(summary).filter(s => s.score != null).map(s => s.score);
if (scores.length) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  console.log(`\nSummary: ${scores.length} routes scored, mean=${mean.toFixed(1)}, min=${min}`);
}
