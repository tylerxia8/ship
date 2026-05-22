// Manual-review module.
// Codifies the four manual review items from the brief into automated checks
// where possible:
//   - CORS + CSP configuration
//   - Secrets exposure (grep client bundle + repo for known patterns)
//   - Rate limiting (probe HTTP endpoints, observe 429 thresholds)
//   - Error message verbosity (probe responses for stack traces)
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo paths relative to the script, not the caller's cwd.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export async function runManualReview(config) {
  const findings = [];
  const base = config.api;

  // ── 1. CORS configuration ──────────────────────────────────────────────
  try {
    const res = await fetch(`${base}/api/csrf-token`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const acaOrigin = res.headers.get('access-control-allow-origin');
    const acaCreds = res.headers.get('access-control-allow-credentials');
    const restrictsOrigin = acaOrigin !== '*' && acaOrigin !== 'https://evil.example.com';
    if (restrictsOrigin) {
      findings.push({
        surface: 'manual-cors',
        id: 'cors-restricts-origin',
        severity: 'ok',
        title: 'CORS restricts cross-origin requests to a single configured origin',
        description: `OPTIONS preflight from \`https://evil.example.com\` did NOT echo back the origin in Access-Control-Allow-Origin. Server returned \`${acaOrigin}\` (the configured CORS_ORIGIN).`,
        evidence: { 'access-control-allow-origin': acaOrigin, 'access-control-allow-credentials': acaCreds },
      });
    } else {
      findings.push({
        surface: 'manual-cors',
        id: 'cors-permissive',
        severity: 'high',
        title: 'CORS is permissive — accepts arbitrary origins',
        description: `OPTIONS preflight returned \`Access-Control-Allow-Origin: ${acaOrigin}\` — should be a single configured origin.`,
        cwe: 'CWE-942 (Permissive Cross-domain Policy)',
        evidence: { acaOrigin, acaCreds },
      });
    }
  } catch (e) {
    findings.push({
      surface: 'manual-cors',
      id: 'cors-probe-error',
      severity: 'info',
      title: 'CORS probe errored',
      description: e.message,
    });
  }

  // ── 2. CSP configuration ───────────────────────────────────────────────
  try {
    const res = await fetch(`${base}/health`);
    const csp = res.headers.get('content-security-policy');
    if (!csp) {
      findings.push({
        surface: 'manual-csp',
        id: 'csp-missing',
        severity: 'medium',
        title: 'No Content-Security-Policy header set',
        description: 'Responses do not include a CSP header. Browser XSS defense relies entirely on React output escaping.',
        cwe: 'CWE-693 (Protection Mechanism Failure)',
      });
    } else {
      // Check for obvious anti-patterns
      const issues = [];
      if (csp.includes("'unsafe-eval'")) issues.push('script-src includes unsafe-eval');
      if (csp.includes("default-src *")) issues.push('default-src *');
      if (csp.includes("script-src *")) issues.push('script-src *');
      if (issues.length > 0) {
        findings.push({
          surface: 'manual-csp',
          id: 'csp-weak',
          severity: 'medium',
          title: 'CSP has permissive directives',
          description: `Found weaknesses: ${issues.join('; ')}.`,
          evidence: { csp },
        });
      } else {
        const unsafeInline = csp.includes("'unsafe-inline'");
        findings.push({
          surface: 'manual-csp',
          id: 'csp-present',
          severity: unsafeInline ? 'low' : 'ok',
          title: unsafeInline
            ? 'CSP is set but includes unsafe-inline (low-impact concession)'
            : 'CSP is set with no obvious anti-patterns',
          description: unsafeInline
            ? "Header includes 'unsafe-inline' — common for apps that need inline styles (TipTap, USWDS), but a strict CSP would use hashes or nonces."
            : 'CSP directives look reasonable. No `unsafe-eval`, no wildcard default-src.',
          evidence: { csp: csp.slice(0, 300) },
        });
      }
    }
  } catch (e) {
    findings.push({
      surface: 'manual-csp',
      id: 'csp-probe-error',
      severity: 'info',
      title: 'CSP probe errored',
      description: e.message,
    });
  }

  // ── 3. Secrets exposure in client bundle ───────────────────────────────
  // Grep web/dist for known secret patterns. If web/dist doesn't exist yet,
  // record info and skip.
  const distPath = resolve(REPO_ROOT, 'web/dist');
  if (existsSync(distPath)) {
    const patterns = [
      { name: 'AWS access key ID', regex: /AKIA[0-9A-Z]{16}/ },
      { name: 'GitHub PAT', regex: /ghp_[A-Za-z0-9]{36}/ },
      { name: 'Private key (PEM)', regex: /-----BEGIN .* PRIVATE KEY-----/ },
      { name: 'Database URL', regex: /postgres(?:ql)?:\/\/[^/\s]+:[^@\s]+@/ },
      { name: 'SESSION_SECRET literal', regex: /SESSION_SECRET\s*[=:]\s*["'][^"']{8,}/ },
    ];
    const hits = [];
    const scan = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, ent.name);
        if (ent.isDirectory()) scan(p);
        else if (ent.name.endsWith('.js') || ent.name.endsWith('.html') || ent.name.endsWith('.json')) {
          try {
            const content = readFileSync(p, 'utf-8');
            for (const pat of patterns) {
              if (pat.regex.test(content)) {
                hits.push({ file: p.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', ''), pattern: pat.name });
              }
            }
          } catch {}
        }
      }
    };
    scan(distPath);
    if (hits.length === 0) {
      findings.push({
        surface: 'manual-secrets',
        id: 'secrets-no-leaks-in-client-bundle',
        severity: 'ok',
        title: 'No known secret patterns found in client bundle',
        description: 'Scanned web/dist for AWS keys, GitHub PATs, PEM-format private keys, database URLs, and inline SESSION_SECRET literals. Zero matches.',
      });
    } else {
      findings.push({
        surface: 'manual-secrets',
        id: 'secrets-leaked-in-client-bundle',
        severity: 'critical',
        title: 'Secret patterns found in client bundle',
        description: `${hits.length} potential secret(s) match known patterns in web/dist/.`,
        cwe: 'CWE-200 (Information Exposure)',
        evidence: hits,
      });
    }
  } else {
    findings.push({
      surface: 'manual-secrets',
      id: 'secrets-no-dist',
      severity: 'info',
      title: 'web/dist does not exist; skipping client-bundle secret scan',
      description: 'Run `pnpm --filter @ship/web build` before this probe to scan the production bundle.',
    });
  }

  // ── 4. Rate limiting probe ─────────────────────────────────────────────
  // Hammer /api/auth/login with bad creds; verify the 5-failed-attempts/15min limit fires.
  let rateLimitedAt = null;
  try {
    for (let i = 1; i <= 12; i++) {
      const csrfRes = await fetch(`${base}/api/csrf-token`);
      const csrfBody = await csrfRes.json();
      const setCookie = csrfRes.headers.get('set-cookie') ?? '';
      const sidMatch = setCookie.match(/connect\.sid=([^;]+)/);
      const connectSid = sidMatch ? sidMatch[1] : null;

      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfBody.token,
          ...(connectSid ? { Cookie: `connect.sid=${connectSid}` } : {}),
        },
        body: JSON.stringify({ email: `no-such-user-${i}@example.com`, password: 'wrong' }),
      });
      if (res.status === 429) {
        rateLimitedAt = i;
        break;
      }
    }
    if (rateLimitedAt !== null && rateLimitedAt <= 10) {
      findings.push({
        surface: 'manual-ratelimit',
        id: 'ratelimit-login-active',
        severity: 'ok',
        title: `Login endpoint rate-limited after ${rateLimitedAt} failed attempts`,
        description: `POST /api/auth/login returned 429 on attempt #${rateLimitedAt}. Brute-force protection is active. The skipSuccessfulRequests:true means only failed attempts count.`,
        evidence: { rateLimitedAtAttempt: rateLimitedAt },
      });
    } else {
      findings.push({
        surface: 'manual-ratelimit',
        id: 'ratelimit-login-missing',
        severity: 'high',
        title: 'No rate limiting on /api/auth/login',
        description: `Sent 12 failed login attempts; no 429 observed. Brute-force protection is missing or misconfigured.`,
        cwe: 'CWE-307 (Improper Restriction of Excessive Authentication Attempts)',
      });
    }
  } catch (e) {
    findings.push({
      surface: 'manual-ratelimit',
      id: 'ratelimit-probe-error',
      severity: 'info',
      title: 'Rate-limit probe errored',
      description: e.message,
    });
  }

  // ── 5. Error verbosity probe ───────────────────────────────────────────
  // Send a request guaranteed to error and check the response body for stack traces.
  const verbosityProbes = [];
  try {
    // Non-JSON body to POST endpoint
    const r1 = await fetch(`${base}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'this-is-not-json',
    });
    verbosityProbes.push({ probe: 'non-JSON body to POST /api/issues', status: r1.status, body: (await r1.text()).slice(0, 500) });

    // Invalid route
    const r2 = await fetch(`${base}/api/this-route-does-not-exist`);
    verbosityProbes.push({ probe: 'GET /api/<unknown>', status: r2.status, body: (await r2.text()).slice(0, 500) });

    // Invalid UUID in path
    const r3 = await fetch(`${base}/api/documents/not-a-uuid`);
    verbosityProbes.push({ probe: 'GET /api/documents/not-a-uuid', status: r3.status, body: (await r3.text()).slice(0, 500) });
  } catch (e) {
    verbosityProbes.push({ probe: 'errored', error: e.message });
  }

  const stackLeaks = verbosityProbes.filter(p => {
    const b = p.body || '';
    return /at .+\(.+:\d+:\d+\)|node_modules[\\/]\.pnpm|Error: .+\n\s*at /i.test(b);
  });
  if (stackLeaks.length === 0) {
    findings.push({
      surface: 'manual-error-verbosity',
      id: 'error-no-stack-leak',
      severity: 'ok',
      title: 'Error responses do not leak stack traces or internal paths to clients',
      description: 'Probed non-JSON body, unknown route, and invalid UUID — none returned a Node.js stack trace, file path, or framework internals in the response body.',
      evidence: verbosityProbes,
    });
  } else {
    findings.push({
      surface: 'manual-error-verbosity',
      id: 'error-stack-leak',
      severity: 'high',
      title: 'Error responses leak stack traces / file paths to clients',
      description: `${stackLeaks.length} probe response(s) include Node.js stack-trace format. Production builds should sanitize.`,
      cwe: 'CWE-209 (Information Exposure Through an Error Message)',
      evidence: stackLeaks,
    });
  }

  return { findings };
}
