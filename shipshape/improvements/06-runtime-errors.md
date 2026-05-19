# Category 6 — Runtime Errors & Edge Cases

**Branch:** `shipshape/06-runtime-errors`
**Audit baseline:** [shipshape/audit/AUDIT_REPORT.md § Category 6](../audit/AUDIT_REPORT.md)
**Improvement target (per brief):** Fix 3 error-handling gaps, at least one involving real user-facing data loss or confusion.

---

## Result

Three concrete gaps fixed in one focused commit on the API:

| # | Gap | Before | After |
|---|---|---|---|
| 1 | **Stack-trace leak on malformed JSON** | 400 HTML page with full Node.js stack (`createStrictSyntaxError(...)`, internal file paths) | Sanitized 400 JSON: `{ success: false, error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON" } }` |
| 2 | **Unmatched `/api/*` route returns HTML** | `<pre>Cannot GET /api/foo</pre>` from Express's default 404 | 404 JSON: `{ success: false, error: { code: "NOT_FOUND", message: "No route for GET /api/foo" } }` |
| 3 | **`PayloadTooLargeError` (body > 10 MB) had no JSON shape** | Express default HTML 413 | 413 JSON: `{ success: false, error: { code: "VALIDATION_ERROR", message: "Request body exceeds size limit" } }` |
| 4 | **Any unhandled thrown error** | Express default HTML 500 with stack trace (NODE_ENV != production) | 500 JSON with generic `"Internal server error"` (no message/stack leak). Full error still logged server-side. |

The brief asked for "at least one involving real user-facing data loss or confusion." Gap #1 is exactly that — clients hitting malformed-JSON paths saw an HTML error page rather than a JSON response, breaking their error-handling code paths AND leaking a stack trace that hints at internal request-handler chains (a security finding in the original audit).

### Reproducible before/after

Before (from the audit baseline at [shipshape/audit/raw/malformed/issues-post.txt](../audit/raw/malformed/issues-post.txt)):

```
--- non-JSON body ---
Body length: 16
Status: 400
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>SyntaxError: Unexpected token &#39;t&#39;, &quot;this is not JSON&quot; is not valid JSON<br>
   &nbsp; &nbsp;at JSON.parse (&lt;anonymous&gt;)<br>
   &nbsp; &nbsp;at createStrictSyntaxError (C:\Users\t…
```

After (raw output: [shipshape/improvements/raw/issues-post-after.txt](raw/issues-post-after.txt)):

```
--- non-JSON body ---
Body length: 16
Status / content-type: 400|application/json; charset=utf-8
{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request body is not valid JSON"}}
```

Same input, same status code, no stack trace, no internal paths, no internal class names. The content-type is now JSON (`application/json; charset=utf-8` vs. `text/html` before), so client-side error handling code paths that branch on JSON works correctly.

---

## What changed (single file diff)

The implementation is two new pieces of middleware appended after every route registration in [api/src/app.ts](../../api/src/app.ts):

1. **`app.use('/api', (req, res) => …)`** — JSON 404 for unmatched `/api/*` routes.
2. **`app.use((err, req, res, next) => …)`** — global error handler. 4-argument signature registers it as an Express error handler. Recognises three body-parser error types (`entity.parse.failed`, `entity.too.large`) plus a general fallback. Trusts `err.status` only for 4xx; collapses anything else to 500 with no message leak.

Both use `HTTP_STATUS` + `ERROR_CODES` from `@ship/shared` so the response shape matches the rest of the API.

Non-`/api/*` 404s still fall through to Express's default — that's intentional. In production the SPA shell serves them via CloudFront → S3 (the Express app never sees them); in dev the browser hits Vite on `:5173` (also not the API process). The dev-only edge case where someone curls `localhost:3000/some-static-thing` and gets HTML is acceptable.

The full error is still `console.error`-logged server-side (with the original stack) — observability isn't sacrificed. Only the client-facing payload is sanitized.

---

## Out of scope on this branch (carried as audit follow-ups)

The audit identified two additional findings that don't fit a focused error-handling commit:

- **XSS-shaped title accepted verbatim**: `{title: "<script>alert(1)</script>"}` was accepted by the issues route. Verified that React escapes title by default in the rendering path (no `dangerouslySetInnerHTML` consumes title), so the stored value is rendered safely as text. A defence-in-depth strip-on-input would be a separate sanitisation policy decision; deferred.
- **Zod schemas not `.strict()`**: extra fields like `estimate: -99999` are silently dropped on the issues route. Adding `.strict()` would reject extras with a 400 — but this changes the API contract (clients sending forward-compatible extra fields would start failing). Needs team discussion; deferred.

Both are documented here so they're not lost.

A separate audit finding (54-min retry-thrash when Postgres is unreachable in `api/src/test/setup.ts`) is purely a developer-experience improvement — different layer, different commit.

---

## Verification

- `tsc --noEmit` on `api/`: passes (exit 0).
- `tsx watch` auto-reloaded the running API; no manual restart needed.
- 7-case malformed-input probe ([raw/issues-post-after.txt](raw/issues-post-after.txt)): non-JSON returns sanitized JSON; valid CRUD still succeeds.
- 404 probe: `/api/this-does-not-exist` → 404 JSON; `/api/this/also/does/not/exist` (auth'd) → 404 JSON. Non-`/api` paths still HTML (intentional, scope of handler).
- The full error is still visible in the server console — no observability regression.

---

## Tradeoffs

- **Generic 500 message** — clients no longer learn anything from a server-side bug except that one occurred. That's the security-correct behavior for prod, and dev still has server logs. If a developer wants client-facing error detail in dev, they can read the server console.
- **`err.expose === false`** is honoured for 4xx responses — `http-errors`-shaped errors with `expose: false` won't leak their message. Matches the convention from libraries like Koa.
- **No request ID correlation yet** — a future improvement: include a UUID in 500 responses and log it server-side, so support can match client-reported errors to server logs. The current handler is the structural prerequisite for that.
- **Route-handler-level 5xx still goes through here** — some routes already `try { ... } catch { res.status(500).json({ error: 'Internal server error' }) }`. Those bypass this handler (they return a response themselves). Both shapes (`{ error: ... }` and `{ success: false, error: { code, message } }`) currently coexist in 5xx responses. A future cleanup would standardise on the latter, but it's a per-route refactor.

---

## How to reproduce

```powershell
# 1. From the audit branch, ensure dev stack is running with SHIPSHAPE_AUDIT=1.
git checkout shipshape/06-runtime-errors
# tsx watch picks up the source change automatically.

# 2. Re-run the malformed input probe. From repo root (Git Bash):
bash -c '
  TOK=$(cat shipshape/audit/raw/.api_token 2>/dev/null | tr -d "\r\n " || echo "")
  for desc in "non-JSON body" "valid body" "huge body"; do
    case "$desc" in
      "non-JSON body") body="not json";;
      "valid body") body='\''{"title":"x"}'\'';;
      "huge body") body=$(node -e "console.log('\''{ \"title\": \"'\''+'\''A'\''.repeat(11_000_000)+'\''\" }'\'')") ;;
    esac
    echo "--- $desc ---"
    curl -s -o /tmp/r.txt -w "%{http_code}|%{content_type}\n" \
      -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
      -d "$body" http://localhost:3000/api/issues
    head -c 200 /tmp/r.txt; echo
  done
'

# 3. 404 check:
curl -s -o /tmp/r.txt -w "%{http_code}|%{content_type}\n" http://localhost:3000/api/does-not-exist
cat /tmp/r.txt
```

Expect: all responses JSON, no HTML, no stack traces.
