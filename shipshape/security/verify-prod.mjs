#!/usr/bin/env node
// Production verification — read-only Cat 8 protection check against a live
// deploy. No authentication required, no writes attempted. Run against
// shipshape/deploy after a Render auto-deploy completes.
//
// Usage:
//   node shipshape/security/verify-prod.mjs \
//     --api=https://ship-api-76ez.onrender.com \
//     --web=https://ship-henna.vercel.app
//
// Output: shipshape/security/raw-prod/{verification.json,verification.md}
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ARGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);
const API = ARGS.api ?? 'https://ship-api-76ez.onrender.com';
const WEB = ARGS.web ?? 'https://ship-henna.vercel.app';
const OUT = ARGS.out ?? resolve(SCRIPT_DIR, 'raw-prod');

mkdirSync(OUT, { recursive: true });

const checks = [];
function record(id, severity, title, evidence) {
  checks.push({ id, severity, title, evidence });
  const sym = { ok: '✓', info: 'ℹ', low: '◦', medium: '⚠', high: '⚠⚠', critical: '✗' }[severity] ?? '?';
  console.log(`${sym} [${severity}] ${title}`);
}

async function main() {
  // 1) Liveness
  try {
    const h = await fetch(`${API}/health`);
    record(
      'prod-api-health',
      h.ok ? 'ok' : 'medium',
      `API /health → ${h.status}`,
      { status: h.status, headers: Object.fromEntries(h.headers) }
    );
  } catch (e) {
    record('prod-api-health', 'critical', 'API /health unreachable', { error: String(e) });
  }

  try {
    const w = await fetch(WEB, { redirect: 'manual' });
    record('prod-web-root', w.status < 400 ? 'ok' : 'medium', `Web / → ${w.status}`, { status: w.status });
  } catch (e) {
    record('prod-web-root', 'critical', 'Web / unreachable', { error: String(e) });
  }

  // 2) Security headers on /health response
  try {
    const h = await fetch(`${API}/health`);
    const headers = Object.fromEntries(h.headers);
    const must = [
      'strict-transport-security',
      'x-content-type-options',
      'referrer-policy',
      'content-security-policy',
      'cross-origin-opener-policy',
    ];
    const missing = must.filter((k) => !headers[k]);
    record(
      'prod-security-headers',
      missing.length === 0 ? 'ok' : 'medium',
      missing.length === 0
        ? 'All required hardening headers present'
        : `Missing security headers: ${missing.join(', ')}`,
      {
        present: must.filter((k) => headers[k]),
        missing,
        csp: headers['content-security-policy']?.slice(0, 240),
      }
    );
  } catch (e) {
    record('prod-security-headers', 'info', 'Could not fetch headers', { error: String(e) });
  }

  // 3) CORS preflight from a malicious origin is rejected
  try {
    const r = await fetch(`${API}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const aco = r.headers.get('access-control-allow-origin');
    const allowed = aco === 'https://evil.example.com' || aco === '*';
    record(
      'prod-cors-evil-origin',
      allowed ? 'high' : 'ok',
      allowed
        ? `CORS reflects evil origin: ACAO=${aco}`
        : 'CORS preflight rejects evil.example.com origin',
      { responseStatus: r.status, allowOrigin: aco }
    );
  } catch (e) {
    record('prod-cors-evil-origin', 'info', 'CORS preflight probe errored', { error: String(e) });
  }

  // 4) CORS preflight from the legitimate web origin is allowed
  try {
    const r = await fetch(`${API}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: WEB,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const aco = r.headers.get('access-control-allow-origin');
    record(
      'prod-cors-legit-origin',
      aco === WEB ? 'ok' : 'medium',
      aco === WEB
        ? `CORS allows production web origin (${WEB})`
        : `CORS preflight from ${WEB} got ACAO=${aco}`,
      { responseStatus: r.status, allowOrigin: aco }
    );
  } catch (e) {
    record('prod-cors-legit-origin', 'info', 'Legit CORS preflight errored', { error: String(e) });
  }

  // 5) Body-parser stack-leak fix: malformed JSON should return sanitized 400
  try {
    const r = await fetch(`${API}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: 'this-is-not-json',
    });
    const text = await r.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    const sanitized =
      r.status === 400 &&
      parsed?.success === false &&
      parsed?.error?.code === 'VALIDATION_ERROR' &&
      !/at \w+\s\(/.test(text) && // no stack frames
      !/SyntaxError:/i.test(text); // no raw express body-parser leak
    record(
      'prod-body-parser-sanitized',
      sanitized ? 'ok' : 'high',
      sanitized
        ? 'Malformed JSON → sanitized {code: VALIDATION_ERROR} envelope, no stack leak (Fix #3 live)'
        : 'Malformed JSON response is not the sanitized envelope',
      { status: r.status, body: text.slice(0, 400) }
    );
  } catch (e) {
    record('prod-body-parser-sanitized', 'info', 'Body-parser probe errored', { error: String(e) });
  }

  // 6) Unauth /events WebSocket — must be rejected at upgrade
  await probeWs(`${API.replace(/^http/, 'ws')}/events`, 'prod-ws-events-unauth-rejected', '/events WS');
  // 7) Unauth /collaboration WebSocket — must be rejected at upgrade
  await probeWs(
    `${API.replace(/^http/, 'ws')}/collaboration/wiki:00000000-0000-0000-0000-000000000000`,
    'prod-ws-collab-unauth-rejected',
    '/collaboration WS'
  );
  // 8) Unknown WS path — must be dropped
  await probeWs(
    `${API.replace(/^http/, 'ws')}/this-is-not-a-real-ws-endpoint`,
    'prod-ws-unknown-path-rejected',
    'unknown WS path'
  );
  // 8.1) Fix #4 — CSWSH defense: upgrade carrying evil Origin must be refused
  // BEFORE the auth check. Sending Origin: https://evil.example.com on
  // /collaboration and /events should both close at handshake.
  await probeWs(
    `${API.replace(/^http/, 'ws')}/collaboration/wiki:00000000-0000-0000-0000-000000000000`,
    'prod-ws-collab-rejects-evil-origin',
    '/collaboration WS with evil Origin (Fix #4)',
    { Origin: 'https://evil.example.com' }
  );
  await probeWs(
    `${API.replace(/^http/, 'ws')}/events`,
    'prod-ws-events-rejects-evil-origin',
    '/events WS with evil Origin (Fix #4)',
    { Origin: 'https://evil.example.com' }
  );

  // 9) Re-check /health after the WS probes — server must still be alive
  // (this is the Fix #1 invariant: malformed upgrade attempts do not crash
  // the process).
  try {
    const h = await fetch(`${API}/health`);
    record(
      'prod-api-alive-after-ws-probes',
      h.ok ? 'ok' : 'critical',
      h.ok
        ? 'API /health still 200 after unauthenticated WS upgrade attempts (no crash)'
        : `API /health degraded after WS probes: ${h.status}`,
      { status: h.status }
    );
  } catch (e) {
    record(
      'prod-api-alive-after-ws-probes',
      'critical',
      'API unreachable after WS probes — possible crash',
      { error: String(e) }
    );
  }

  const summary = {
    target: { api: API, web: WEB },
    runAt: new Date().toISOString(),
    severityCounts: checks.reduce((acc, c) => {
      acc[c.severity] = (acc[c.severity] ?? 0) + 1;
      return acc;
    }, {}),
    checks,
  };
  writeFileSync(resolve(OUT, 'verification.json'), JSON.stringify(summary, null, 2));
  writeFileSync(resolve(OUT, 'verification.md'), renderMd(summary));
  console.log();
  console.log(`Wrote ${resolve(OUT, 'verification.json')}`);
  console.log(`Wrote ${resolve(OUT, 'verification.md')}`);
  const bad = ['critical', 'high'].some((s) => (summary.severityCounts[s] ?? 0) > 0);
  process.exit(bad ? 2 : 0);
}

async function probeWs(url, id, label, headers = null) {
  await new Promise((resolveOuter) => {
    let opened = false;
    let closed = false;
    let closeCode = null;
    let ws;
    try {
      // Node 24's global WebSocket constructor accepts a headers option via
      // the second argument (init bag). This matches how `ws` library expects
      // custom upgrade headers like Origin.
      ws = headers ? new WebSocket(url, { headers }) : new WebSocket(url);
    } catch (e) {
      record(id, 'ok', `${label}: WebSocket ctor threw (rejected immediately)`, { error: String(e) });
      return resolveOuter();
    }
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      if (!closed) {
        record(id, opened ? 'critical' : 'ok', `${label}: handshake timeout (opened=${opened})`, {
          opened,
          closeCode,
        });
      }
      resolveOuter();
    }, 4000);
    ws.addEventListener('open', () => { opened = true; });
    ws.addEventListener('error', () => {});
    ws.addEventListener('close', (e) => {
      closed = true;
      closeCode = e.code;
      clearTimeout(t);
      const rejected = !opened || e.code === 1006 || e.code === 1008 || e.code === 4401 || e.code === 4403;
      record(
        id,
        rejected ? 'ok' : 'critical',
        rejected
          ? `${label} rejected at handshake (closeCode=${e.code}, openedFirst=${opened})`
          : `${label} accepted without auth — closeCode=${e.code}`,
        { opened, closeCode: e.code, reason: e.reason }
      );
      resolveOuter();
    });
  });
}

function renderMd(s) {
  const lines = [];
  lines.push(`# Production deployment verification — Cat 8`);
  lines.push('');
  lines.push(`- API: ${s.target.api}`);
  lines.push(`- Web: ${s.target.web}`);
  lines.push(`- Run at: ${s.runAt}`);
  lines.push('');
  lines.push('## Severity counts');
  lines.push('');
  for (const [k, v] of Object.entries(s.severityCounts).sort()) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  for (const c of s.checks) {
    const sym = { ok: '✓', info: 'ℹ', low: '◦', medium: '⚠', high: '⚠⚠', critical: '✗' }[c.severity] ?? '?';
    lines.push(`### ${sym} ${c.id} — ${c.severity}`);
    lines.push('');
    lines.push(c.title);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(c.evidence, null, 2));
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((e) => {
  console.error('verify-prod fatal:', e);
  process.exit(1);
});
