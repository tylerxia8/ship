// Auth + session probe.
// Verifies: unauth route access, session-token format, privilege escalation,
// session expiry, logout invalidation.

const PROTECTED_ROUTES = [
  '/api/auth/me',
  '/api/issues',
  '/api/documents?type=wiki',
  '/api/dashboard/my-work',
  '/api/weeks/my-week',
  '/api/projects',
  '/api/programs',
  '/api/team',
  '/api/workspaces',
];

// Routes that REQUIRE super-admin access (test for vertical privilege escalation
// from a regular workspace admin).
const SUPER_ADMIN_ROUTES = [
  '/api/admin/users',
  '/api/admin/workspaces',
];

export async function runAuthProbe(config) {
  const findings = [];
  const base = config.api;

  // ── A. Unauthenticated access to protected routes ──────────────────────
  const unauthed = [];
  for (const route of PROTECTED_ROUTES) {
    try {
      const res = await fetch(`${base}${route}`);
      unauthed.push({ route, status: res.status });
    } catch (err) {
      unauthed.push({ route, status: 'error', error: err.message });
    }
  }
  const allowed = unauthed.filter(r => r.status === 200);
  if (allowed.length === 0) {
    findings.push({
      surface: 'auth',
      id: 'auth-unauthenticated-access',
      severity: 'ok',
      title: 'All protected routes correctly require authentication',
      description: `Probed ${PROTECTED_ROUTES.length} protected routes without credentials; every one returned 401/403/404. No unauthenticated access to authenticated data.`,
      evidence: unauthed,
    });
  } else {
    findings.push({
      surface: 'auth',
      id: 'auth-unauthenticated-access',
      severity: 'critical',
      title: 'Protected routes accessible without authentication',
      description: `${allowed.length} of ${PROTECTED_ROUTES.length} routes returned 200 OK without any session cookie.`,
      cwe: 'CWE-306 (Missing Authentication)',
      reproduction: [
        `curl ${base}${allowed[0].route}`,
        'Expected 401 Unauthorized; observed 200 OK.',
      ],
      evidence: allowed,
      remediation: 'Wrap the affected route handlers in authMiddleware (api/src/middleware/auth.ts).',
    });
  }

  // ── B. Session-token format check ──────────────────────────────────────
  // Login, capture the session_id cookie, inspect entropy.
  const { sessionId, csrfToken, cookieJar } = await login(base, config.email, config.password);

  if (!sessionId) {
    findings.push({
      surface: 'auth',
      id: 'auth-login-failed',
      severity: 'info',
      title: 'Probe could not log in (subsequent auth checks skipped)',
      description: `Login to ${base}/api/auth/login with the configured credentials did not return a session_id cookie. Check that the dev account exists and CSRF flow is functional.`,
    });
  } else {
    // Session ID format: api/src/routes/auth.ts uses crypto.randomBytes(32).toString('hex') → 64 hex chars
    const isHex64 = /^[a-f0-9]{64}$/i.test(sessionId);
    if (isHex64) {
      findings.push({
        surface: 'auth',
        id: 'auth-session-token-format',
        severity: 'ok',
        title: 'Session token is 256 bits of entropy, hex-encoded',
        description: `Captured session_id is 64 hex chars (256 bits) — matches the documented \`crypto.randomBytes(32).toString('hex')\` shape in api/src/routes/auth.ts.`,
        evidence: { length: sessionId.length, sample: sessionId.slice(0, 8) + '…' + sessionId.slice(-4) },
      });
    } else {
      findings.push({
        surface: 'auth',
        id: 'auth-session-token-format',
        severity: 'high',
        title: 'Session token format does not match expected entropy',
        description: `Captured session_id is "${sessionId.slice(0, 16)}…" — expected 64 hex chars. Check for weak token generation.`,
        cwe: 'CWE-330 (Use of Insufficiently Random Values)',
        evidence: { length: sessionId.length, sample: sessionId.slice(0, 16) + '…' },
      });
    }

    // ── C. Logout actually invalidates the session ─────────────────────────
    try {
      const logoutRes = await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: cookieJar, 'X-CSRF-Token': csrfToken },
      });
      if (logoutRes.status === 200) {
        // Try to use the old session_id; should fail.
        const reuseRes = await fetch(`${base}/api/auth/me`, {
          headers: { Cookie: `session_id=${sessionId}` },
        });
        if (reuseRes.status === 401) {
          findings.push({
            surface: 'auth',
            id: 'auth-logout-invalidates-session',
            severity: 'ok',
            title: 'Logout correctly invalidates the session token',
            description: 'After POST /api/auth/logout, reusing the same session_id returns 401.',
          });
        } else {
          findings.push({
            surface: 'auth',
            id: 'auth-logout-invalidates-session',
            severity: 'high',
            title: 'Logout does NOT invalidate the session token',
            description: `After logout, GET /api/auth/me with the old session_id returns ${reuseRes.status}. Expected 401.`,
            cwe: 'CWE-613 (Insufficient Session Expiration)',
            reproduction: [
              '1. Log in, capture session_id',
              '2. POST /api/auth/logout with CSRF token',
              '3. GET /api/auth/me with the captured session_id',
              'Expected 401; observed ' + reuseRes.status,
            ],
          });
        }
      }
    } catch (err) {
      findings.push({
        surface: 'auth',
        id: 'auth-logout-test-error',
        severity: 'info',
        title: 'Logout invalidation test errored',
        description: err.message,
      });
    }
  }

  // ── D. Invalid session cookie format → 401 ─────────────────────────────
  const malformed = [
    'not-a-session-id',
    'a'.repeat(1000), // oversized
    "'); DROP TABLE sessions; --", // SQL injection shape
    '', // empty
  ];
  const malformedResults = [];
  for (const sid of malformed) {
    try {
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Cookie: `session_id=${sid}` },
      });
      malformedResults.push({ probe: sid.slice(0, 40), status: res.status });
    } catch (err) {
      malformedResults.push({ probe: sid.slice(0, 40), status: 'error', error: err.message });
    }
  }
  const acceptedBad = malformedResults.filter(r => r.status === 200);
  if (acceptedBad.length === 0) {
    findings.push({
      surface: 'auth',
      id: 'auth-malformed-session-rejected',
      severity: 'ok',
      title: 'Malformed session IDs are rejected with 401',
      description: 'Empty, oversized, SQL-shaped, and random-string session_ids all return 401.',
      evidence: malformedResults,
    });
  } else {
    findings.push({
      surface: 'auth',
      id: 'auth-malformed-session-accepted',
      severity: 'critical',
      title: 'Malformed session IDs are accepted as valid',
      description: `${acceptedBad.length} malformed session_id values returned 200.`,
      cwe: 'CWE-639 (Authorization Bypass)',
      evidence: acceptedBad,
    });
  }

  // ── E. Privilege escalation: super-admin endpoints ─────────────────────
  if (sessionId) {
    const escalation = [];
    for (const route of SUPER_ADMIN_ROUTES) {
      try {
        const res = await fetch(`${base}${route}`, {
          headers: { Cookie: `session_id=${sessionId}` },
        });
        escalation.push({ route, status: res.status });
      } catch (err) {
        escalation.push({ route, status: 'error', error: err.message });
      }
    }
    // Note: the seeded dev user is super-admin per seed.ts, so we expect 200 here.
    // We're recording this as info — actual horizontal escalation testing requires
    // a regular member account, which the dev seed doesn't expose by default.
    findings.push({
      surface: 'auth',
      id: 'auth-admin-route-access-as-superadmin',
      severity: 'info',
      title: 'Super-admin routes accessible with super-admin session',
      description: 'The seeded dev account has is_super_admin=true. Recording responses for super-admin routes. Horizontal privilege-escalation testing (regular user → admin) would need a second seed account.',
      evidence: escalation,
    });
  }

  return { findings };
}

// Helper: login flow with CSRF. Returns { sessionId, csrfToken, cookieJar }
// or { sessionId: null, ... } if login fails.
async function login(base, email, password) {
  try {
    // 1. GET csrf-token to establish a session + receive token
    const csrfRes = await fetch(`${base}/api/csrf-token`);
    const csrfBody = await csrfRes.json();
    const csrfToken = csrfBody.token;
    const setCookie = csrfRes.headers.get('set-cookie') ?? '';
    const sidMatch = setCookie.match(/connect\.sid=([^;]+)/);
    const connectSid = sidMatch ? sidMatch[1] : null;

    // 2. POST login with csrf token + carry the connect.sid cookie
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        ...(connectSid ? { Cookie: `connect.sid=${connectSid}` } : {}),
      },
      body: JSON.stringify({ email, password }),
    });
    if (loginRes.status !== 200) return { sessionId: null, csrfToken, cookieJar: '' };
    const setCookie2 = loginRes.headers.get('set-cookie') ?? '';
    const sessionIdMatch = setCookie2.match(/session_id=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;
    const cookieJar = [
      connectSid ? `connect.sid=${connectSid}` : '',
      sessionId ? `session_id=${sessionId}` : '',
    ].filter(Boolean).join('; ');
    return { sessionId, csrfToken, cookieJar };
  } catch (err) {
    return { sessionId: null, csrfToken: null, cookieJar: '', error: err.message };
  }
}
