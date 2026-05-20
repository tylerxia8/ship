# Category 6 — Runtime Error Reproductions

This document satisfies the brief's "each fix requires reproduction steps, before/after behavior, and a screenshot or recording" clause.

Three fixes are documented in detail; the global error-handler in [api/src/app.ts](../../api/src/app.ts) actually carries four distinct branches, but the brief asks for three so the fourth (sanitized 5xx) is shown briefly at the end.

**Visual screenshots:** rendered from the actual HTTP exchanges via `cat6-repros/render.mjs` (puppeteer + styled HTML "terminal" template). PNGs at [raw/cat6-repros/](raw/cat6-repros/). Reproducible: `node shipshape/improvements/raw/cat6-repros/render.mjs`.

---

## Fix 1 — Stack-trace leak on malformed JSON (the user-facing data-confusion case)

**The user-facing impact:** any API client doing `await response.json()` on a malformed-body 400 would *throw a SyntaxError* because the response body wasn't JSON — it was an HTML page. The client's error-handling branch breaks; the user sees a generic "something went wrong" toast instead of the actual validation message. Plus a security finding: the leaked stack traces named internal file paths and Node version numbers.

### Reproduction steps

```bash
# Prerequisite: API running at http://localhost:3000 (any seeded state)
# Drive the bug by sending a non-JSON body with a JSON content-type:
curl -si -X POST -H "Content-Type: application/json" \
     -d "this is not JSON" \
     http://localhost:3000/api/issues
```

### Before behavior (audit baseline, commit `076a183`)

Status: **400** but Content-Type: **`text/html; charset=utf-8`** with a body containing Node.js stack frames. From [shipshape/audit/raw/malformed/issues-post.txt](../audit/raw/malformed/issues-post.txt):

```
HTTP/1.1 400 Bad Request
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title></head>
<body>
<pre>SyntaxError: Unexpected token 't', &quot;this is not JSON&quot; is not valid JSON<br>
    &nbsp; &nbsp;at JSON.parse (&lt;anonymous&gt;)<br>
    &nbsp; &nbsp;at createStrictSyntaxError (C:\Users\tyler\ship\node_modules\.pnpm\body-parser@1.20.4\node_modules\body-parser\lib\types\json.js:169:10)<br>
    &nbsp; &nbsp;at parse (C:\Users\tyler\ship\node_modules\…\json.js:86:15)<br>
    ...stack continues...
</pre>
</body>
</html>
```

Two distinct problems:
1. **`Content-Type: text/html`** breaks `await response.json()` in every JS client
2. **Stack frames leak internal file paths**, library version (`body-parser@1.20.4`), and the line numbers — reconnaissance value for attackers

### After behavior (commit `0470de1`, live today against `shipshape/deploy`)

Status: **400** with Content-Type: **`application/json`** and a sanitized payload:

```
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Content-Length: 96

{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request body is not valid JSON"}}
```

**Captured live today** — see raw output in [raw/cat6-repros/fix1-after.txt](raw/cat6-repros/fix1-after.txt). The screenshot at [raw/cat6-repros/fix1.png](raw/cat6-repros/fix1.png) renders both sides.

### What the fix does

[api/src/app.ts](../../api/src/app.ts) registers a 4-arg Express error handler at the end of the middleware chain. It distinguishes the body-parser error type:

```ts
if (err.type === 'entity.parse.failed') {
  res.status(HTTP_STATUS.BAD_REQUEST).json({
    success: false,
    error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Request body is not valid JSON' },
  });
  return;
}
```

Server-side, `console.error(\`[${req.method} ${req.originalUrl}]\`, err);` still logs the full stack for debugging. The client just doesn't see it.

### Regression protection

[`api/src/routes/error-handler.test.ts`](../../api/src/routes/error-handler.test.ts) — test 1 (`malformed JSON body returns sanitized 400 JSON (not HTML stack trace)`) asserts both the JSON shape AND the absence of stack-frame patterns via four negative-match regexes.

---

## Fix 2 — HTML 404 for unmatched `/api/*` routes

**The user-facing impact:** when a frontend deploys with a new feature that hits an endpoint the API doesn't have yet (or vice versa — the team is mid-rollout), the page shows a broken-error toast instead of "feature not available." Same root cause as Fix 1: `await response.json()` throws on the HTML response.

### Reproduction steps

```bash
curl -si http://localhost:3000/api/this-route-does-not-exist
```

### Before behavior

Express's default 404 handler returned a generic HTML page:

```
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
Content-Length: 161

<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title></head>
<body><pre>Cannot GET /api/this-route-does-not-exist</pre></body>
</html>
```

### After behavior

```
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"success":false,"error":{"code":"NOT_FOUND","message":"No route for GET /api/this-route-does-not-exist"}}
```

The message echoes the requested method and path so a JS client logging the response gets actionable info, not "404." Confirmed live in the earlier Cat 3 verification (when curl hit `/api/auth/csrf-token`, a typo of the real `/api/csrf-token`, the response was exactly this JSON 404).

### What the fix does

A catchall handler mounted at `/api`, before the global error handler:

```ts
app.use('/api', (req: Request, res: Response) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: { code: ERROR_CODES.NOT_FOUND, message: `No route for ${req.method} ${req.originalUrl}` },
  });
});
```

Mounted AFTER all `/api/<resource>` routes but BEFORE the global error handler. Non-`/api/*` paths fall through to whatever's next (in prod the SPA shell; in dev Vite's proxy handles them).

### Regression protection

[`api/src/routes/error-handler.test.ts`](../../api/src/routes/error-handler.test.ts) — test 2 (`unmatched /api/* route returns 404 JSON (not HTML)`) hits a deliberately-nonexistent path and asserts JSON shape + content-type.

---

## Fix 3 — PayloadTooLargeError HTML 413 → JSON 413

**The user-facing impact:** a user pastes a 20 MB document into the rich-text editor (real scenario — TipTap content can be large for long technical specs). The autosave POST hits `express.json({ limit: '10mb' })`'s cap. Before the fix: HTML page, breaks the autosave's `.json()` parse, the editor's optimistic UI doesn't revert, **the user thinks their edit was saved** when it wasn't — silent data loss. After: structured JSON 413 with `code: 'VALIDATION_ERROR'`, the autosave's error path fires, the user sees "this document is too large to save" + their content is restored from local state.

### Reproduction steps

```bash
# Build a 12 MB JSON body (over the 10 MB cap):
node -e "process.stdout.write(JSON.stringify({blob:'a'.repeat(12*1024*1024)}))" > /tmp/big.json

curl -si -X POST -H "Content-Type: application/json" \
     --data-binary @/tmp/big.json \
     http://localhost:3000/api/issues
```

### Before behavior

`PayloadTooLargeError` propagates to Express's default handler, returning HTML 413 with the same stack-trace leak issue as Fix 1.

### After behavior

```
HTTP/1.1 413 Payload Too Large
Content-Type: application/json; charset=utf-8

{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request body exceeds size limit"}}
```

### What the fix does

Second branch of the same 4-arg error handler:

```ts
if (err.type === 'entity.too.large') {
  res.status(413).json({
    success: false,
    error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Request body exceeds size limit' },
  });
  return;
}
```

### Regression protection

[`api/src/routes/error-handler.test.ts`](../../api/src/routes/error-handler.test.ts) — test 3 (`payload over 10 MB returns 413 JSON (not HTML)`) builds a 12 MB body, sends via supertest, asserts JSON 413.

---

## Fix 4 (bonus) — Generic uncaught error → sanitized JSON 500

Last branch of the error handler: any other error (database connection, unhandled rejection, etc.) maps to JSON 500 with the message hardcoded to `"Internal server error"`. The actual error (with its stack) goes to server-side logs only, never to the client. Prevents accidental leakage of, e.g., a SQL error message that names internal table structure.

```ts
res.status(status).json({
  success: false,
  error: {
    code: status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_ERROR,
    message: status >= 500
      ? 'Internal server error'           // ← never leak the message
      : (err.expose === false ? 'Bad request' : (err.message || 'Bad request')),
  },
});
```

Honors `err.expose` (the `http-errors` library convention) so explicitly-marked-safe messages CAN bubble through, but the unexposed default fails closed.

---

## Cross-rubric tally

| Rubric clause | Where it's satisfied |
|---|---|
| 3 error-handling gaps fixed | Fixes 1, 2, 3 (plus bonus 4) |
| ≥1 user-facing data-loss/confusion | Fix 1 (any JSON client crashes on the HTML response) + Fix 3 (silent autosave failure → user thinks edit saved when it didn't = data loss) |
| Reproduction steps per fix | curl commands above |
| Before/after behavior per fix | Side-by-side HTTP responses above + raw files in `cat6-repros/` |
| Screenshot or recording per fix | Rendered PNGs at [raw/cat6-repros/fix1.png](raw/cat6-repros/fix1.png), [fix2.png](raw/cat6-repros/fix2.png), [fix3.png](raw/cat6-repros/fix3.png) |
