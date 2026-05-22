# Cat 8 Manual Security Review

**Audit-baseline state** (`shipshape/audit` HEAD; this branch `shipshape/08-security` carries the same code in the four areas reviewed below, plus the two improvement fixes from `08-security.md`).

The brief is explicit: *"In addition to the probe tool, conduct manual review of"* the four areas below. The probe automates everything it can; this document captures what manual code reading adds — line-anchored references to actual config, subtleties the probe doesn't see, and concrete severity ratings per finding.

For each area I read the source on this branch and cross-checked against the probe's runtime findings. Where the manual review and probe agree, I cite the probe's finding ID. Where they diverge, both are documented.

---

## 1. CORS and CSP configuration

### CORS

**Source:** [api/src/app.ts:141-144](../../api/src/app.ts#L141-L144) and [api/src/index.ts:25-27](../../api/src/index.ts#L25-L27)

```ts
// app.ts (inside createApp)
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

// index.ts (boot)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const app = createApp(CORS_ORIGIN);
```

The `cors()` middleware uses a **single fixed origin** — whatever `CORS_ORIGIN` env evaluates to at boot. `credentials: true` allows cookies to ride along. There's no `function (origin, cb) {...}` resolver, no wildcard, no regex — it's a strict single-value match.

**Probe verification:** [`cors-restricts-origin`](raw-v2/report.md) (severity: ok) — OPTIONS preflight from `https://evil.example.com` returns `Access-Control-Allow-Origin: http://localhost:5173`, NOT the requesting origin. Reflective CORS is not possible.

**Manual findings beyond the probe:**

| Finding | Severity | Note |
|---|---|---|
| CORS origin is a single env-driven value, not a list. | ok | This is the right shape for production (Treasury deploys are single-origin), and explicitly excludes the credential-bearing reflective-origin anti-pattern. |
| Dev default falls back to `http://localhost:5173`. | low (dev only) | Hardcoded fallback in `index.ts` is harmless in dev; production deploys must set `CORS_ORIGIN` explicitly. SSM loader at `api/src/config/ssm.ts:46-58` resolves CORS_ORIGIN from SSM in production. |
| **WebSocket upgrade does NOT validate `Origin` header.** | **medium** | The browser sends `Origin: <originating-page-url>` on WS handshake, but [api/src/collaboration/index.ts:610-697](../../api/src/collaboration/index.ts#L610-L697) checks only the session cookie. A malicious page on `attacker.com` could in principle open a WS to `ship-api.../events` and receive a victim's real-time notifications IF the session cookie were sent cross-origin. Mitigated by `sameSite: 'strict'` on the session cookie (`api/src/app.ts:157` and `routes/auth.ts:188`) — browsers will refuse to send the cookie cross-origin, so the upgrade returns 401. Still, defense-in-depth gap: the WS upgrade handler should explicitly validate `request.headers.origin === CORS_ORIGIN`. Filed. |

### CSP

**Source:** [api/src/app.ts:114-137](../../api/src/app.ts#L114-L137)

```ts
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Admin credentials page uses inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"], // TipTap editor needs inline styles
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

**Probe verification:** [`csp-present`](raw-v2/report.md) (severity: low) — CSP header present on every response with no `'unsafe-eval'`, no wildcard `default-src`, but `'unsafe-inline'` on `script-src` and `style-src`.

**Manual findings beyond the probe:**

| Directive | Value | Verdict |
|---|---|---|
| `default-src 'self'` | restrictive | ✅ |
| `script-src 'self' 'unsafe-inline'` | **`'unsafe-inline'` allowed** | ⚠ Documented reason: `routes/admin-credentials.ts` injects inline `<script>` (verified by grepping `admin-credentials.ts:368-435` for `<script>` literals). A stricter CSP would refactor to use `nonce` or `hash-source` and remove `'unsafe-inline'`. Severity: low — the admin-credentials page is super-admin gated and not user-facing. |
| `style-src 'self' 'unsafe-inline'` | **`'unsafe-inline'` allowed** | ⚠ TipTap + USWDS both inject inline styles. Removing this would require significant editor refactoring. Severity: low — inline styles aren't typically an XSS sink. |
| `img-src 'self' data: blob: https:` | permissive | ⚠ `blob:` + `data:` + any HTTPS image are allowed. `blob:` is needed for file-upload previews. `https:` is broad but the alternative (allowlist of CDN hosts) is a deploy-config burden. Severity: low. |
| `connect-src 'self' wss: ws:` | broad WS | ⚠ Any WebSocket origin is allowed. A safer policy would scope to `wss://ship-api-prod...` only. Severity: low — this is "CSP for outbound WS the page makes," not inbound. |
| `frame-src 'none'`, `object-src 'none'` | restrictive | ✅ Clickjacking + plugin-execution surfaces removed. |
| `base-uri 'self'`, `form-action 'self'` | restrictive | ✅ Prevents `<base>` hijacking + form-redirection XSS. |
| HSTS 1 year, includeSubDomains, preload | strong | ✅ Eligible for `hstspreload.org` submission. |

**Cross-origin requests are properly restricted?** YES at the HTTP layer (CORS = single origin). **YES at the WS layer as of Cat 8 Fix #4** — the `setupCollaboration` upgrade handler now rejects browser-issued WS upgrades whose `Origin` header is not on the allow-list (returns 403 before the session check). Probe verifies via `ws-collab-rejects-evil-origin` + `ws-events-rejects-evil-origin` (both `ok`). See [shipshape/improvements/08-security.md § Fix #4](../improvements/08-security.md#fix-4--websocket-cross-site-hijacking--missing-origin-allow-list-medium--0).

---

## 2. Environment variable and secret handling

### Where secrets come from

**Source:** [api/src/config/ssm.ts](../../api/src/config/ssm.ts), [api/src/db/client.ts:9-11](../../api/src/db/client.ts#L9-L11), [api/src/index.ts:9-18](../../api/src/index.ts#L9-L18), [api/src/app.ts:40-44](../../api/src/app.ts#L40-L44)

| Secret | Where loaded | Production source | Dev source |
|---|---|---|---|
| `DATABASE_URL` | `db/client.ts:18`, `db/migrate.ts:24`, `db/seed.ts:43`, `db/scripts/orphan-diagnostic.ts:35` | AWS SSM (`/ship/{env}/DATABASE_URL`) loaded by `ssm.ts:loadProductionSecrets()` before `app.ts` imports anything | `api/.env.local` |
| `SESSION_SECRET` | `app.ts:44` | AWS SSM (`/ship/{env}/SESSION_SECRET`) | `api/.env.local`, or hardcoded dev fallback `'dev-only-secret-do-not-use-in-production'` |
| `CORS_ORIGIN` | `index.ts:25` | AWS SSM | env or default `http://localhost:5173` |
| `CDN_DOMAIN`, `APP_BASE_URL` | `ssm.ts:60-66` | AWS SSM | env |
| CAIA OAuth credentials | `services/caia.ts` via SSM | AWS SSM | env |
| `PORT`, `NODE_ENV`, etc. | various | platform-injected | platform/.env |

**Key checks:**

| Check | Result | Source |
|---|---|---|
| Is `SESSION_SECRET` validated as required in production? | ✅ **Yes** — boot fails with `throw new Error(...)` if missing | [`app.ts:40-44`](../../api/src/app.ts#L40-L44) |
| Are secrets ever read from a file path the client could request? | ✅ **No** — secrets come from process.env (set by SSM loader); no `app.get('/.env')` or similar | grep `\.env` in routes/ → only `*.test.ts` references |
| Are secrets ever logged? | ⚠ **Partial** — `ssm.ts:46` logs `Loading secrets from SSM path: ${basePath}` (the *path*, not the values). `seed.ts:123` logs the seeded password (`admin123`) — acceptable for dev seed but should never run in production. `services/caia.ts:131-236` logs CAIA endpoint URLs but not the access tokens. | See "Logging review" below |
| Are secrets ever included in error response bodies? | ❌ **One known leak** — the lack of a global error handler means `body-parser`'s `SyntaxError` exposes the stack trace including `node_modules/.pnpm/body-parser@...` paths. No secret values, but file-path disclosure is a CWE-209 information leak. See § Error message verbosity below. |

### Secrets in the client bundle?

The brief specifically asks: *"are secrets ever exposed to the client bundle?"*

**Vite injects only `VITE_*`-prefixed env vars into the client bundle.** Grepped `web/src` for every `VITE_` reference:

```
web/src/lib/api.ts:3                                       VITE_API_URL
web/src/hooks/useRealtimeEvents.tsx:34                     VITE_WS_URL
web/src/hooks/useRealtimeEvents.tsx:40                     VITE_API_URL
web/src/pages/Login.tsx:358                                VITE_APP_ENV (non-prod conditional)
web/src/{15 other call sites}                              VITE_API_URL only
```

**Only three VITE_ keys are referenced:** `VITE_API_URL`, `VITE_WS_URL`, `VITE_APP_ENV`. None of these are secrets — they're URLs and an environment-name label. **No `VITE_SECRET_*`, `VITE_PASSWORD_*`, `VITE_KEY_*`, or `VITE_TOKEN_*` keys exist** (`grep -rE "VITE_(SECRET|PASSWORD|KEY|TOKEN)" web/` → zero matches).

**Probe cross-check:** [`secrets-no-leaks-in-client-bundle`](raw-v2/report.md) (severity: ok) — scanned the actual `web/dist` build output for 5 known secret-shaped patterns (AWS keys, GitHub PATs, PEM private keys, database URLs, inline `SESSION_SECRET` literals); zero matches.

### Logging review (full grep)

```
api/src/config/ssm.ts:46              console.log(`Loading secrets from SSM path: ${basePath}`);
api/src/db/seed.ts:123                console.log(`✅ Created ${usersCreated} users (all use password: admin123)`);
api/src/middleware/auth.ts:98         console.error('API token auth error:', error);   // error object, not token
api/src/routes/api-tokens.ts:104-195  console.error('Create API token error:', error); // error only
api/src/services/caia.ts:131-236      console.log('[CAIA] Token endpoint: ...');        // URL only, not the token
```

| Finding | Severity | Note |
|---|---|---|
| `seed.ts` logs the seeded password `admin123` | low | Dev seed only; running in production is gated by `NODE_ENV` check and `pnpm db:seed` script. The password is also documented in `CLAUDE.md` and is the well-known reviewer credential. Not a real leak. |
| `caia.ts` logs the OAuth `token_endpoint` URL | ok | Endpoint URL is not a secret (it's discoverable from the OIDC metadata URL). Tokens themselves are not logged. |
| No password / token / secret values appear in any `console.log` / `console.error` | ok | Verified by grep `console\.(log\|error\|warn).*(password\|secret\|DATABASE_URL\|token)` filtered to non-test files |

**Are secrets ever exposed to the client bundle or logged?** **No.** Stack-trace leakage (next section) discloses file paths but not secret values.

---

## 3. Rate limiting

The brief: *"can a single client hammer the API or WebSocket endpoint without restriction?"*

### Full rate-limiter inventory

| Limiter | Window | Threshold | Counted requests | Source | What it protects |
|---|---|---|---|---|---|
| `loginLimiter` (HTTP) | 15 min | **5 failed attempts** | only `4xx`/`5xx` (skipSuccessfulRequests: true) | [`app.ts:74-81`](../../api/src/app.ts#L74-L81) | `POST /api/auth/login` — brute-force defense |
| `apiLimiter` (HTTP) | 1 min | **100** (prod) / **1000** (dev) / **10M** (SHIPSHAPE_AUDIT=1 measurement mode) | all `/api/*` requests | [`app.ts:84-90`](../../api/src/app.ts#L84-L90) | Every API route — generic abuse defense |
| WS connection limiter (per IP) | 1 min | **30 connections** | upgrade attempts | [`collaboration/index.ts:20-27, 53-67`](../../api/src/collaboration/index.ts#L20-L67) | Both `/events` and `/collaboration/*` — connection floods |
| WS message limiter (per connection) | 1 second | **50 messages** | every received frame | [`collaboration/index.ts:71-86`](../../api/src/collaboration/index.ts#L71-L86) | Per-socket message floods |
| WS message-violation kill | 50 violations | terminate | rate-limit hits, not raw msgs | [`collaboration/index.ts:37, 760-806`](../../api/src/collaboration/index.ts#L37-L806) | Progressive penalty after sustained abuse |
| HTTP server timeouts | per request | **60 s max duration**, 65 s keep-alive | total | [`index.ts:31-33`](../../api/src/index.ts#L31-L33) | Slowloris-class slow-read attacks |

**Probe verification:** [`ratelimit-login-active`](raw-v2/report.md) (severity: ok) — 12 failed login attempts in a row triggered HTTP 429 at attempt 5 (matches the configured threshold).

### Manual findings beyond the probe

| Finding | Severity | Note |
|---|---|---|
| Production API limit is 100 req/min/IP. | ok | Reasonable. A single legitimate user does ~20-30 reqs/min during normal use (auth/me on every nav + page-data calls). 100 leaves headroom for batch operations without enabling abuse. |
| **`/health` is NOT rate-limited** — defined at `app.ts:168-170` BEFORE the `app.use('/api/', apiLimiter)` mount, so health probes don't count against the limit. | ok | Intentional, and correct: health checks must always succeed. /health is also a no-op (returns `{status:'ok'}` without DB or session work), so unbounded hammering doesn't cost the server. |
| **`SHIPSHAPE_AUDIT=1` env disables the API limiter** (max → 10M). | low | Documented gated bypass for ShipShape audit measurements ([`app.ts:68-70, 86`](../../api/src/app.ts#L68-L86)). Risk: if the flag accidentally leaks into a production deploy, the API limiter is effectively off. Mitigation: prod uses CDK-managed env without SHIPSHAPE_AUDIT; the flag is a feature-flag, not a default. Severity: low. |
| WS connection limit (30/IP/min) applies BEFORE auth check (good). | ok | [`collaboration/index.ts:636-648`](../../api/src/collaboration/index.ts#L636) — connection counter incremented before `validateWebSocketSession()`, so unauth attackers can't probe-burn server resources beyond 30 attempted upgrades. |
| WS message limit is 50 msgs/sec/connection. | ok | Yjs sync protocol generates ~5-10 msgs/sec on a single doc; 50 leaves ~5× headroom for batched updates without enabling DoS. |
| Login limiter uses `skipSuccessfulRequests: true`. | ok | Means **failed** logins count, successful logins don't. Correct defense pattern: a legitimate user who mistypes once and succeeds doesn't lock themselves out, but a brute-forcer hitting 5 wrong passwords in 15 min does. |
| ~~Login limiter is per-IP, no per-account.~~ **RESOLVED in Cat 8 Fix #5.** | ok | An in-memory per-email failure counter now triggers `429 RATE_LIMITED` after 10 failures within 15 minutes, regardless of source IP. Cleared on successful login. Verified by 3 unit tests in `api/src/routes/auth.test.ts > Per-account login lockout` (including a load-bearing test that proves a correct password is still rejected while locked out). See [shipshape/improvements/08-security.md § Fix #5](../improvements/08-security.md#fix-5--distributed-credential-stuffing-no-per-account-lockout-medium--0). |
| No rate limiter on `/api/csrf-token` GET specifically. | low | The endpoint is GET-only, no body, no DB write — just generates a token from the session secret. Falls under the generic `/api/*` 100/min limiter. Could be tightened to 10/min for that path alone if abuse is observed, but not currently necessary. |
| WS message rate limiter uses in-memory `Map`. | low | A single-process limiter doesn't survive process restart and doesn't share state across horizontally-scaled instances. Acceptable for the current single-process deploy; would need Redis-backed limiter if multi-node. Documented at [`collaboration/index.ts:33-36`](../../api/src/collaboration/index.ts#L33-L36). |

**Can a single client hammer the API or WebSocket without restriction?** **No** — both surfaces are limited. The one structural gap is per-account login lockout (vs per-IP); a botnet could defeat the current login limiter.

---

## 4. Error message verbosity

The brief: *"do error responses leak stack traces, SQL, or internal paths?"*

### Per-handler error pattern (sampled)

I greped every `res.status(5xx).json(...)` in `api/src/routes/` (40+ matches). The pattern is consistent:

```ts
} catch (error) {
  console.error('Create issue error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

**Observed pattern across all routes:**

| Behavior | Source | Verdict |
|---|---|---|
| Error caught and logged server-side via `console.error(label, error)` | every route | ✅ — full context retained server-side |
| Response body returns a generic message, never `error.message` directly | every route | ✅ — no internals reach the client |
| 4xx responses (zod validation) return Zod's structured error.errors array | routes that use zod parsing | ⚠ — Zod error messages can include field names + expected types (e.g., `"String must contain at most 500 character(s)"`). Not a stack/path leak; reveals schema shape. Acceptable for the API documentation surface — this IS the API contract. |
| Server-side `console.error` includes the full Error object including its stack | every route | ⚠ — fine for dev logs; in production these go to CloudWatch under the API's log group. **Not exposed to clients.** |

**Sampled stack-trace-bearing handlers** (where `error.stack` or `error.message` is referenced):

```
grep -rnE "err\.stack|error\.stack" api/src/  →  zero matches
```

No route handler exposes `error.stack` to the client.

### The one real leak: body-parser SyntaxError

**Verified empirically** by sending malformed JSON to `POST /api/issues`:

```bash
$ curl -X POST http://localhost:3000/api/issues \
       -H 'Content-Type: application/json' \
       -d 'this-is-not-json'

HTTP/1.1 400 Bad Request
Content-Type: text/html

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>SyntaxError: Unexpected token 't', "this-is-not-json" is not valid JSON
    at JSON.parse (<anonymous>)
    at createStrictSyntaxError (C:\Users\tyler\ship\node_modules\.pnpm\body-parser@1.20.4\node_modules\body-parser\lib\types\json.js:169:10)
    at parse (C:\Users\tyler\ship\node_modules\.pnpm\body-parser@1.20.4\node_modules\body-parser\lib\types\json.js:86:15)
    ...
```

**Root cause:** [api/src/app.ts](../../api/src/app.ts) has no global Express error handler (no `app.use((err, req, res, next) => {...})`). When `body-parser` throws a `SyntaxError` on malformed JSON, the error propagates to **Express's built-in default handler**, which renders an HTML page that includes:

- The error class name (`SyntaxError`)
- The full Node.js stack trace
- **Absolute file paths** including `C:\Users\tyler\ship\node_modules\.pnpm\body-parser@1.20.4\...`

The file paths disclose the exact versions of body-parser + raw-body installed in `.pnpm`. That's information that helps an attacker identify which CVEs to try.

**Probe verification:** [`error-stack-leak`](raw-v2/report.md) (severity: **high**) — the probe's `manual-error-verbosity` module caught this on the first run.

| Finding | Severity | Disclosure type |
|---|---|---|
| Body-parser JSON-parse error returns Express default HTML with full stack | **high** | CWE-209 (Information Exposure Through an Error Message) — leaks Node module versions + filesystem paths to any unauthenticated client |
| No global error handler middleware in `app.ts` | **high** (root cause) | Means every uncaught error inside body-parser, helmet, csrf-sync, etc. falls to Express's default. The development-mode default renders HTML + stack. |
| No SQL leakage observed | ok | `pg` errors are caught inside route handlers and replaced with `{error: 'Internal server error'}` — never re-thrown. |
| No internal-path leakage in 5xx route responses | ok | Sampled 10 route handlers; all use sanitized envelopes. |
| Production behavior: same HTML+stack pattern | **high** | Express's default error handler returns stack traces **even in production** unless `NODE_ENV=production` causes it to omit them. **Express in fact DOES strip stack on `NODE_ENV=production`** — but the audit-baseline dev tests this in dev mode. Verifying production behavior requires building and deploying. Filed. |

### Remediation (already documented in Cat 6 work)

The fix is one Express middleware appended after route mounts:

```ts
// pseudo-code; the actual Cat 6 fix lives on shipshape/06-runtime-errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' },
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request body exceeds size limit' },
    });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
});
```

This was the headline Cat 6 fix on `shipshape/06-runtime-errors`. **Now also landed on `shipshape/08-security`** as Cat 8 Fix #3 via cherry-pick of commit `0470de1` — see [shipshape/improvements/08-security.md § Fix #3](../improvements/08-security.md). Post-fix re-probe shows `error-no-stack-leak` = **ok**. Raw: [probe-after-v3.json](../improvements/raw/cat8-measurement/probe-after-v3.json).

**Do error responses leak stack traces, SQL, or internal paths?** **No** (after Fix #3). Pre-fix the body-parser path leaked stack + file paths; post-fix all error shapes return structured envelopes. **SQL: no** (pg errors caught in handlers). **Other internals: no** (route 5xx responses use sanitized envelopes).

---

## Summary — manual review verdicts

| Brief area | Finding count | Worst severity | Probe finding ID(s) |
|---|---:|---|---|
| CORS / CSP | 3 (2 ok, 1 low; medium → **resolved by Fix #4**) | low (CSP `'unsafe-inline'` for admin-credentials page) | `cors-restricts-origin`, `csp-present`, `ws-collab-rejects-evil-origin` |
| Env vars / secrets | 4 (3 ok, 1 low — dev-seed password log) | low | `secrets-no-leaks-in-client-bundle` |
| Rate limiting | 9 (8 ok/low; medium → **resolved by Fix #5**) | low | `ratelimit-login-active` + 3 lockout unit tests |
| Error verbosity | 4 (3 ok, 1 high → **resolved by Fix #3**) | none | `error-no-stack-leak` (was `error-stack-leak`) |

All four areas now reach `ok` or `low` at worst. The five fix commits that brought us here:

1. **Fix #3** — body-parser stack-trace leak resolved by cherry-picking the Cat 6 global error handler (commit `0470de1`).
2. **Fix #4** — WS Origin allow-list added to `setupCollaboration` upgrade handler. Probe verifies `Origin: https://evil.example.com` is now refused at the upgrade.
3. **Fix #5** — Per-account login lockout (in-memory counter on `auth.ts`, 10 failures / 15min). Three unit tests in `auth.test.ts > Per-account login lockout` prove the lockout fires even when the password is correct.

Fixes #1 + #2 (WebSocket unhandled-error crash + 2 critical CVEs) are tracked in [shipshape/improvements/08-security.md](../improvements/08-security.md) and were the original 2-fix target before the manual review surfaced the medium-severity surface.
