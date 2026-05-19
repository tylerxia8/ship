/**
 * Regression tests for the global JSON error handler added in
 * `shipshape/06-runtime-errors`. Each test catches a specific failure mode
 * that the audit identified as user-facing: HTML stack-trace leaks on
 * malformed JSON, HTML 404s on unmatched /api/* routes, and missing JSON
 * shape on PayloadTooLargeError.
 *
 * These tests intentionally do NOT require a database. The body-parser and
 * router-not-found errors all fire BEFORE any route handler is invoked, so
 * we can drive them through supertest with no testcontainer setup. Keeps
 * them fast (whole file < 200ms) and immune to the audit's other Cat 6
 * finding (api/src/test/setup.ts spending 54 min retry-thrashing when
 * Postgres is unreachable).
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('global error handler — Cat 6 regression protection', () => {
  const app = createApp();

  /**
   * AUDIT FINDING (Category 6, severity high):
   *   POST /api/issues with body="not valid JSON" returned a 400 HTML page
   *   containing the full Node.js stack:
   *
   *     <pre>SyntaxError: Unexpected token 't', "this is not JSON"…
   *       at JSON.parse (<anonymous>)
   *       at createStrictSyntaxError (C:\Users\…)…
   *
   *   That's both a security finding (internal paths + class names leaked to
   *   anonymous clients) AND a breakage for any client whose error-handling
   *   branches on JSON content-type. The fix in api/src/app.ts catches
   *   `entity.parse.failed` from the body-parser middleware and returns a
   *   sanitized JSON 400.
   *
   *   This test pins that contract: malformed JSON must produce a JSON 400
   *   with `error.code === 'VALIDATION_ERROR'` and no leaked stack.
   *
   *   We send to /api/anything (not a real route) because body-parser runs
   *   BEFORE route matching, so the test is independent of any specific
   *   route's auth/CSRF chain.
   */
  it('malformed JSON body returns sanitized 400 JSON (not HTML stack trace)', async () => {
    const response = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('this is not JSON');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is not valid JSON',
      },
    });

    // The body must NOT contain anything that looks like a leaked stack trace
    // or internal file path. Convert to string for the assertion so the test
    // catches accidental regressions even if the JSON shape changes.
    const bodyText = JSON.stringify(response.body);
    expect(bodyText).not.toMatch(/\.parse\b/i);
    expect(bodyText).not.toMatch(/[a-zA-Z]:\\/); // Windows-style absolute paths
    expect(bodyText).not.toMatch(/\/.+\/.+\.(?:ts|js|mjs):\d+/); // Unix-style stack frames
    expect(bodyText).not.toMatch(/SyntaxError/);
  });

  /**
   * AUDIT FINDING (Category 6):
   *   Unmatched /api/* routes returned Express's default HTML 404 —
   *   `<pre>Cannot GET /api/foo</pre>`. Clients that branch on a JSON
   *   `error.code` were left guessing what happened. The fix in
   *   api/src/app.ts adds a JSON 404 handler scoped to /api/* (non-API
   *   routes still fall through, because in prod CloudFront/S3 serves them
   *   as the SPA shell and they never reach Express).
   *
   *   This test pins the JSON shape for the 404 case.
   */
  it('unmatched /api/* route returns 404 JSON (not HTML)', async () => {
    const response = await request(app).get('/api/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
      },
    });
    expect(response.body.error.message).toContain('/api/this-route-does-not-exist');
  });

  /**
   * AUDIT FINDING (Category 6):
   *   express.json({ limit: '10mb' }) emits `PayloadTooLargeError` when the
   *   request body exceeds 10 MB. Express's default handler returns an HTML
   *   413, breaking any client doing `await response.json()`. The fix
   *   recognises body-parser's `entity.too.large` error type and returns
   *   sanitized JSON.
   *
   *   This test pins the JSON shape for oversized payloads. We construct a
   *   12 MB string (well past the limit) to ensure the parser rejects it.
   */
  it('payload over 10 MB returns 413 JSON (not HTML)', async () => {
    // 12 MB JSON string with a single, structurally-valid string property.
    // Note: building this as `'a'.repeat(12 * 1024 * 1024)` and using
    // supertest's .send() is the simplest way to exceed the cap without
    // tripping the OOM killer on the test runner.
    const oversize = JSON.stringify({ blob: 'a'.repeat(12 * 1024 * 1024) });

    const response = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(oversize);

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body exceeds size limit',
      },
    });
  });
});
