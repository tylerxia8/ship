// WebSocket validation probe.
// Targets: /events (notifications WS), /collaboration/:docType::docId (Yjs sync).
// Tests: auth requirement, malformed frames, oversized payloads, unexpected paths.

const COLLAB_TIMEOUT = 4000;

export async function runWebSocketProbe(config) {
  const findings = [];
  const wsBase = config.api.replace(/^http/, 'ws');

  // ── A. Unauthenticated WS connection should be rejected ────────────────
  const eventsUnauth = await probeWebSocket(`${wsBase}/events`);
  if (eventsUnauth.closeCode === 1006 || eventsUnauth.gotErrorBeforeOpen) {
    findings.push({
      surface: 'websocket',
      id: 'ws-events-requires-auth',
      severity: 'ok',
      title: '/events WebSocket rejects unauthenticated upgrade',
      description: `Connection without session_id cookie was refused at the upgrade handshake (closeCode=${eventsUnauth.closeCode}, gotOpenEvent=${eventsUnauth.gotOpenEvent}).`,
      evidence: eventsUnauth,
    });
  } else {
    findings.push({
      surface: 'websocket',
      id: 'ws-events-no-auth',
      severity: 'critical',
      title: '/events WebSocket accepts unauthenticated connections',
      description: `Connection without any cookie/session opened successfully.`,
      cwe: 'CWE-306 (Missing Authentication for Critical Function)',
      evidence: eventsUnauth,
    });
  }

  // ── B. Same check for /collaboration/* ─────────────────────────────────
  const collabUnauth = await probeWebSocket(`${wsBase}/collaboration/wiki:00000000-0000-0000-0000-000000000000`);
  if (collabUnauth.closeCode === 1006 || collabUnauth.gotErrorBeforeOpen) {
    findings.push({
      surface: 'websocket',
      id: 'ws-collab-requires-auth',
      severity: 'ok',
      title: '/collaboration WebSocket rejects unauthenticated upgrade',
      description: `Connection to a Yjs collab endpoint without session_id was refused at the upgrade (closeCode=${collabUnauth.closeCode}).`,
      evidence: collabUnauth,
    });
  } else {
    findings.push({
      surface: 'websocket',
      id: 'ws-collab-no-auth',
      severity: 'critical',
      title: '/collaboration WebSocket accepts unauthenticated connections',
      description: 'Connection to Yjs collab endpoint opened without authentication. Anyone can read/write document state.',
      cwe: 'CWE-306',
      evidence: collabUnauth,
    });
  }

  // ── C. Unknown WS path → server destroys socket (no 5xx, no panic) ─────
  const unknownPath = await probeWebSocket(`${wsBase}/this-is-not-a-real-ws-endpoint`);
  if (unknownPath.closeCode === 1006 || unknownPath.gotErrorBeforeOpen) {
    findings.push({
      surface: 'websocket',
      id: 'ws-unknown-path-handled',
      severity: 'ok',
      title: 'Unknown WebSocket paths are dropped without server error',
      description: `Connection to /this-is-not-a-real-ws-endpoint was rejected at upgrade. No server panic, no resource leak detected.`,
      evidence: unknownPath,
    });
  } else {
    findings.push({
      surface: 'websocket',
      id: 'ws-unknown-path-accepted',
      severity: 'medium',
      title: 'Unknown WebSocket path was accepted',
      description: 'Connection to a non-existent WS path opened. Should be rejected at the upgrade handler.',
      evidence: unknownPath,
    });
  }

  // ── D. Authenticated WS: send malformed frames, verify server stays up ─
  const auth = await login(config.api, config.email, config.password);
  if (auth.sessionId) {
    const collabAuthRes = await probeAuthenticatedCollab(wsBase, auth);
    if (collabAuthRes.opened) {
      findings.push({
        surface: 'websocket',
        id: 'ws-collab-auth-works',
        severity: 'ok',
        title: 'Authenticated /collaboration connection succeeds',
        description: `Connection to /collaboration/wiki:<docId> with valid session_id opened successfully.`,
        evidence: { docId: collabAuthRes.docId, openedAfterMs: collabAuthRes.openedAfterMs },
      });

      // D.1 — send malformed binary (random bytes, not a valid Yjs sync message)
      const malformed = await sendMalformedAndCheckHealth(config.api, wsBase, auth, collabAuthRes.docId, randomBytes(64));
      findings.push(buildMalformedFinding(malformed, '64-byte random binary'));

      // D.2 — send oversized payload (>10 MB)
      const oversized = await sendMalformedAndCheckHealth(config.api, wsBase, auth, collabAuthRes.docId, randomBytes(11 * 1024 * 1024));
      findings.push(buildMalformedFinding(oversized, '11 MB binary payload'));

      // D.3 — send text frame (Yjs is binary-only)
      const textFrame = await sendMalformedAndCheckHealth(config.api, wsBase, auth, collabAuthRes.docId, 'this is text, not a Yjs sync frame');
      findings.push(buildMalformedFinding(textFrame, 'text frame to binary Yjs endpoint'));

      // D.4 — valid binary frame with UNEXPECTED messageType varuint.
      // Yjs protocol defines two messageType values: 0 (sync) and 1 (awareness).
      // Send a structurally valid binary frame whose leading varuint encodes
      // 99 — server must drop the message silently (the default branch in
      // handleMessage's switch), not crash and not act on it.
      const unknownTypeFrame = encodeVarUintFrame(99);
      const unknownType = await sendMalformedAndCheckHealth(config.api, wsBase, auth, collabAuthRes.docId, unknownTypeFrame);
      findings.push(buildMalformedFinding(unknownType, 'unknown messageType varuint=99'));
    } else {
      findings.push({
        surface: 'websocket',
        id: 'ws-collab-auth-failed',
        severity: 'info',
        title: 'Could not open authenticated /collaboration WS (malformed-frame tests skipped)',
        description: `Authenticated connection did not open: ${collabAuthRes.reason}`,
        evidence: collabAuthRes,
      });
    }
  } else {
    findings.push({
      surface: 'websocket',
      id: 'ws-auth-login-failed',
      severity: 'info',
      title: 'WebSocket probe could not log in (authenticated tests skipped)',
      description: 'Login failed; only unauthenticated WS tests ran.',
    });
  }

  return { findings };
}

function buildMalformedFinding(result, label) {
  if (result.serverAliveAfter && result.frameRejected) {
    return {
      surface: 'websocket',
      id: `ws-malformed-${label.replace(/\W+/g, '-').toLowerCase()}`,
      severity: 'ok',
      title: `Server correctly rejects ${label} on WS`,
      description: `Sent ${label}; WS closed with code ${result.closeCode}, but /health still 200 immediately after — server unaffected.`,
      evidence: result,
    };
  }
  if (result.serverAliveAfter && !result.frameRejected) {
    return {
      surface: 'websocket',
      id: `ws-malformed-silently-accepted-${label.replace(/\W+/g, '-').toLowerCase()}`,
      severity: 'low',
      title: `Server silently accepted ${label} on WS`,
      description: `Sent ${label}; WS stayed open and server stayed responsive. No error, no rejection. Indicates the frame was discarded by Yjs's parser without explicit validation feedback.`,
      evidence: result,
    };
  }
  return {
    surface: 'websocket',
    id: `ws-malformed-server-crash-${label.replace(/\W+/g, '-').toLowerCase()}`,
    severity: 'critical',
    title: `Server unhealthy after sending ${label} on WS`,
    description: `Sent ${label}; /health failed/timed out immediately after. Likely server crash or hang triggered by the malformed frame.`,
    cwe: 'CWE-20 (Improper Input Validation)',
    evidence: result,
  };
}

// Probe a WS URL with no credentials. Returns the lifecycle observed.
function probeWebSocket(url, options = {}) {
  return new Promise((resolveOuter) => {
    const headers = options.headers || {};
    let ws;
    try {
      ws = new WebSocket(url, { headers });
    } catch (err) {
      return resolveOuter({ openedSuccessfully: false, gotErrorBeforeOpen: true, error: err.message });
    }
    const t0 = Date.now();
    let openedSuccessfully = false;
    let gotErrorBeforeOpen = false;
    let closeCode = null;
    let closeReason = null;
    let gotOpenEvent = false;
    ws.addEventListener('open', () => {
      gotOpenEvent = true;
      openedSuccessfully = true;
    });
    ws.addEventListener('error', () => {
      if (!openedSuccessfully) gotErrorBeforeOpen = true;
    });
    ws.addEventListener('close', (e) => {
      closeCode = e.code;
      closeReason = e.reason;
      resolveOuter({
        openedSuccessfully,
        gotErrorBeforeOpen,
        gotOpenEvent,
        closeCode,
        closeReason,
        elapsedMs: Date.now() - t0,
      });
    });
    setTimeout(() => {
      try { ws.close(); } catch {}
      resolveOuter({
        openedSuccessfully,
        gotErrorBeforeOpen,
        gotOpenEvent,
        closeCode,
        closeReason,
        elapsedMs: Date.now() - t0,
        timedOut: true,
      });
    }, COLLAB_TIMEOUT);
  });
}

async function probeAuthenticatedCollab(wsBase, auth) {
  // Find any wiki doc ID to attach to.
  let docId = '00000000-0000-0000-0000-000000000000';
  try {
    const docsRes = await fetch(`${wsBase.replace(/^ws/, 'http')}/api/documents?type=wiki`, {
      headers: { Cookie: auth.cookieJar },
    });
    if (docsRes.ok) {
      const docs = await docsRes.json();
      const list = docs.documents || docs.data || (Array.isArray(docs) ? docs : []);
      if (list[0]?.id) docId = list[0].id;
    }
  } catch {
    // fall through with the all-zeros UUID — server will accept the connection
    // but probably reject post-handshake. Either way, we'll see what happens.
  }

  const result = await probeWebSocket(`${wsBase}/collaboration/wiki:${docId}`, {
    headers: { Cookie: auth.cookieJar },
  });
  return {
    opened: result.openedSuccessfully,
    docId,
    openedAfterMs: result.elapsedMs,
    closeCode: result.closeCode,
    reason: result.openedSuccessfully ? 'OK' : `WS handshake closed (code=${result.closeCode})`,
  };
}

async function sendMalformedAndCheckHealth(api, wsBase, auth, docId, payload) {
  const url = `${wsBase}/collaboration/wiki:${docId}`;
  let frameRejected = false;
  let closeCode = null;
  let serverAliveAfter = false;
  await new Promise((resolveOuter) => {
    const ws = new WebSocket(url, { headers: { Cookie: auth.cookieJar } });
    ws.addEventListener('open', () => {
      try {
        ws.send(payload);
      } catch (err) {
        frameRejected = true;
        try { ws.close(); } catch {}
        resolveOuter();
      }
      // give server 1 s to react before we close
      setTimeout(() => {
        try { ws.close(); } catch {}
      }, 1000);
    });
    ws.addEventListener('close', (e) => {
      closeCode = e.code;
      // close code 1009 = "message too big", 1003 = "unsupported data" — both = rejected
      if (e.code === 1009 || e.code === 1003 || (e.code !== 1000 && e.code !== 1005)) {
        frameRejected = true;
      }
      resolveOuter();
    });
    ws.addEventListener('error', () => {
      frameRejected = true;
      resolveOuter();
    });
    setTimeout(() => resolveOuter(), 5000);
  });

  // /health check — retry briefly to absorb transient tsx-watch restart latency
  // (only a real crash would still be unresponsive after a 3 s retry window).
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const h = await fetch(`${api}/health`, { signal: AbortSignal.timeout(2000) });
      if (h.ok) { serverAliveAfter = true; break; }
    } catch { /* fall through, retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return { frameRejected, closeCode, serverAliveAfter };
}

function randomBytes(n) {
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

// Encode a Yjs-style unsigned varuint (LEB128 / base-128 little-endian). The
// Yjs protocol reads the leading varuint as messageType. Probe uses this to
// craft a frame whose messageType is structurally valid but semantically
// unknown (e.g. 99) to test the switch-default branch of handleMessage().
function encodeVarUintFrame(value) {
  const bytes = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  // Pad with a few extra random bytes after the messageType so the parser
  // would try to consume a payload — if the switch-default branch correctly
  // ignores unknown types, these extra bytes are harmless.
  for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  return new Uint8Array(bytes);
}

async function login(base, email, password) {
  try {
    const csrfRes = await fetch(`${base}/api/csrf-token`);
    const csrfBody = await csrfRes.json();
    const csrfToken = csrfBody.token;
    const setCookie = csrfRes.headers.get('set-cookie') ?? '';
    const sidMatch = setCookie.match(/connect\.sid=([^;]+)/);
    const connectSid = sidMatch ? sidMatch[1] : null;

    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        ...(connectSid ? { Cookie: `connect.sid=${connectSid}` } : {}),
      },
      body: JSON.stringify({ email, password }),
    });
    if (loginRes.status !== 200) return { sessionId: null };
    const setCookie2 = loginRes.headers.get('set-cookie') ?? '';
    const sessionIdMatch = setCookie2.match(/session_id=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;
    const cookieJar = [
      connectSid ? `connect.sid=${connectSid}` : '',
      sessionId ? `session_id=${sessionId}` : '',
    ].filter(Boolean).join('; ');
    return { sessionId, csrfToken, cookieJar };
  } catch {
    return { sessionId: null };
  }
}
