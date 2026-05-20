# Cat 6 — Runtime Error & Edge-Case Measurement

Executes each item from the brief's **"How to Measure"** checklist for Category 6, against the current `shipshape/deploy` state at brief-spec seed volume (517 docs / 304 issues / 21 users).

Reproducible — see [§ "How to reproduce"](#how-to-reproduce) at the bottom.

Most of this category is browser-driven (DevTools console, network failure, throttle, two-tab edit). I automated every check via a single Playwright spec ([runtime-errors-measurement.spec.ts](runtime-errors-measurement.spec.ts)) so the measurement is reproducible end-to-end rather than a one-time manual click-through. Raw output: [shipshape/improvements/raw/cat6-measurement/](raw/cat6-measurement/).

---

## Brief check 1 — Open DevTools, monitor console, count errors and warnings during normal usage

Playwright captures three event streams per page: `console` (error + warning level), `pageerror` (uncaught exceptions), and `requestfailed` (network errors). I walked all 12 user-facing routes (same set as Cat 7's a11y sweep so the routes are comparable across categories) with a **fresh browser context per route** to make each measurement independent.

### Result — totals per route

| Route | console errors | console warnings | uncaught pageerrors |
|---|---:|---:|---:|
| `/login` | 1 | 0 | 0 |
| `/my-week` | 1 | 0 | 0 |
| `/dashboard` | 1 | 0 | 0 |
| `/docs` | 1 | 0 | 0 |
| `/issues` | 1 | 0 | 0 |
| `/projects` | 1 | 0 | 0 |
| `/programs` | 1 | 0 | 0 |
| `/team/allocation` | 1 | 0 | 0 |
| `/team/directory` | 1 | 0 | 0 |
| `/team/status` | 1 | 0 | 0 |
| `/team/org-chart` | 1 | 0 | 0 |
| `/settings` | 1 | 0 | 0 |

The single error on every route is **identical text**:

> `Failed to load resource: the server responded with a status of 401 (Unauthorized)`

This comes from the app's session-bootstrap probe: on every page boot the React shell calls `GET /api/auth/me` before it knows whether a session exists. On unauth (login screen) it correctly returns 401, and on auth-required routes the spec's fresh context triggers `ensureLoggedIn()` which itself starts at `/login`, where the same 401 fires before the form submit. The 401 is **expected, designed behavior** — not a runtime error. Quality observation though: a real user opening the app from cold doesn't *see* this in the console because they don't open DevTools first — but from a code-quality perspective it is "noise" in the audit-log sense. The frontend's auth-check hook could be wrapped to suppress the 401 path from console logging.

**Zero uncaught pageerrors. Zero warnings.** Twelve routes × fresh context = nothing thrown at console.error or window.onerror beyond the one designed 401. Clean.

Raw: [raw/cat6-measurement/console-errors.json](raw/cat6-measurement/console-errors.json).

---

## Brief check 2 — Test malformed input

POST `/api/issues` with 8 input shapes through a **fully-authenticated session** (real login + matching CSRF token) so the probes actually reach the route handler, not the CSRF guard.

| Probe | HTTP | Response | Stack leak? |
|---|---:|---|:---:|
| Empty body | **400** | `{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request body is not valid JSON"}}` | NO |
| Non-JSON body (`"this is not JSON"`) | **400** | Same structured envelope | NO |
| Huge title — 50 000 chars | **400** | Structured Zod error with `path: ["title"]`, max 500 | NO |
| XSS in title — `<script>alert(1)</script>` | **201** | Stored verbatim; React text-escapes on render | NO |
| Negative estimate (`-99999`) | **201** | `estimate: null` — see real finding below | NO |
| SQL injection — `'; DROP TABLE documents; --` | **201** | Stored verbatim; parameterized queries prevent execution | NO |
| Deep nested object (5 levels) | **201** | Zod strips the unknown nested field | NO |
| Payload over 10 MB — 12 MB body | **413** | `{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request body exceeds size limit"}}` | NO |

**Brief criterion is met: ZERO stack-trace leaks across all 8 probes.** Every error response uses the structured `{success:false, error:{code,message}}` envelope with `code:"VALIDATION_ERROR"` and no internal details.

### Real findings from this probe

1. **`createIssueSchema` silently strips the `estimate` field on create.**
   The probe sent `{ title: 'x', estimate: -99999 }`. Response shows `estimate: null`. The reason is at [api/src/routes/issues.ts:30-45](../../api/src/routes/issues.ts#L30-L45): `createIssueSchema` defines title/state/priority/assignee_id/belongs_to/source/due_date/is_system_generated/accountability_target_id/accountability_type — **but NOT `estimate`**. Zod silently strips unknown keys. The result: the UI's "create with estimate" flow on the issue form silently drops the estimate. The update-issue flow handles it correctly ([api/src/routes/issues.ts:53](../../api/src/routes/issues.ts#L53) has `estimate: z.number().positive().nullable().optional()`). The user has to create, then update, to set an estimate.

2. **XSS / SQL strings are stored verbatim in the database.**
   This is not a vulnerability per se because:
   - All DB writes are via `pg` parameterized queries → SQL strings are inert at the DB layer
   - All title rendering uses React's default text escaping → `<script>` becomes `&lt;script&gt;` in the DOM
   The brief criterion is "does the API surface user-facing errors without leaking internals" — yes, it does for the *malformed* probes, and the "accepted" probes don't leak either since the response is just the created issue.

3. **Server-side error logging is verbose but client-side is sanitized.**
   The dev API log (the `tsx watch` stdout) shows full stack traces for each rejected probe — `SyntaxError` from body-parser, `ForbiddenError` from csrf-sync, `PayloadTooLargeError` from raw-body. These are **expected, handled errors** logged with stack traces for debugging. But the *client* never sees those stacks — they're suppressed via the structured-error envelope. So the brief's intent (no internals leaked) is satisfied. Worth flagging though: an attacker who can read server logs sees the dependency versions (`body-parser@1.20.4`, `csrf-sync@4.2.1`, etc.) which is mild information disclosure if the log destination ever escapes its dev shell.

Raw: [raw/cat6-measurement/malformed-probe.json](raw/cat6-measurement/malformed-probe.json).

---

## Brief check 3 — Throttle to 3G and walk the app

Slow 3G profile via Chrome DevTools Protocol: 50 KB/s down, 50 KB/s up, 400 ms RTT. Login is done at full speed first (a real user does NOT load fresh JS bundles on the login page over 3G — they're already at a doc URL). Then the throttle is enabled for the route walk.

| Route | navigation `domcontentloaded` | requests still pending at 5 s | requests still pending at 15 s |
|---|---:|---:|---:|
| `/my-week` | 25.4 s | 4 | 1 |
| `/dashboard` | 25.7 s | 5 | 1 |
| `/docs` | 25.8 s | 1 | 1 |
| `/issues` | 25.7 s | 1 | 1 |
| `/projects` | 25.7 s | 1 | 1 |

### Findings

- **Every route comes within ~0.4 s of every other** — the 25 s floor is the bundle download budget. With initial JS at 785 KB (post-Cat 2 lazy-loading, see [02-bundle-size-measurement.md](02-bundle-size-measurement.md)) and 50 KB/s, the math is roughly `785 KB / 50 KB/s + 0.4 s RTT × n_chunks = ~16 s for the JS alone + handshakes`. The remaining ~9 s is HTML + critical CSS + the first 2-3 API calls. So 25 s on 3G is what we'd predict from the bundle size — there's no surprise latency, just bandwidth-bound asset delivery.
- **`/my-week` and `/dashboard` have 4–5 requests still pending at 5 s** (vs. 1 for the others). These are the per-card data calls — `my-week` issues a follow-up `GET /api/dashboard/my-work` aggregate, and dashboard's grid pulls weekly + standup + retro statuses serially after the initial render. The other routes have a single follow-up data call (`/api/documents?type=…`) which is in-flight by 15 s.
- **The single request still pending at 15 s on every route is identical**: it's the long-lived events WebSocket at `wss://localhost:3000/events`. Long-poll connections are *expected* to look like "pending requests" forever; that's not a hang, that's the contract.

### Spinners that "never resolve" — none observed

By the brief's standard ("every spinner that hangs, every silent failure"), nothing hung. The app's loading skeletons (`<LoadingSkeleton>`) resolve once each follow-up call returns, and every follow-up call resolved within the 15 s window. There are no race conditions where a `Suspense` boundary keeps spinning after data is back.

What I'd improve: **the initial 25 s bundle download has no visible progress indicator beyond the browser's URL-bar spinner.** A "loading…" placeholder in [web/index.html](../../web/index.html) — like a basic CSS-only spinner that the React app overwrites on mount — would let a 3G user see *something* happening immediately. This is a known follow-up (file: bundle-size category cleanup).

Raw: [raw/cat6-measurement/throttle-3g.json](raw/cat6-measurement/throttle-3g.json).

---

## Brief check 4 — Concurrent edge case: two users editing the same document field

Opened the same wiki document in two **independent browser contexts** (separate cookie jars — equivalent to two real users), typed distinct markers from each, then reloaded the first context and verified both edits survived through the Yjs sync.

### First-pass result

Test 4 in the first run timed out with the editor *visible* but *not clickable*: a Radix Dialog overlay was intercepting pointer events.

```text
locator resolved to <div contenteditable="true" class="tiptap ProseMirror …">
<div role="dialog" data-state="open" id="radix-:r21:" class="fixed left-1/2 top-1/2 z-[101] max-w-lg …">
<div data-state="open" aria-hidden="true" class="fixed inset-0 z-[100] bg-black/60">  ← intercepts pointer events
```

The blocking dialog is [web/src/components/ActionItemsModal.tsx](../../web/src/components/ActionItemsModal.tsx), which auto-opens on first page load whenever the user has pending accountability tasks. The code already has an opt-out for E2E specs ([web/src/pages/App.tsx:120](../../web/src/pages/App.tsx#L120) `if (localStorage.getItem('ship:disableActionItemsModal') === 'true') return;`). I set that flag in the test context and re-ran.

This is a legitimate finding worth flagging for Cat 6: **navigating to `/documents/:id` by URL while the user has pending action items renders a modal that visually occludes the editor.** Real users with action items reach the editor via the doc list, where the modal will already have been dismissed once. Direct-URL navigation (sharing a link) hits this — first click on the editor is captured by the modal overlay. UX-wise, the modal *should* close on Escape or click-outside (it's Radix Dialog with `modal={true}`, which both behaviors come for free), so the actual user experience is "press Escape, click into editor" — not a runtime failure, just one extra step.

### Re-run result with modal disabled

```json
{
  "tested": true,
  "docId": "27d6cf3a-0602-45a4-a8c0-e33e2fdfb567",
  "docTitle": "Advanced Topics",
  "finalText": " [TAB-A-EDIT]  [TAB-B-EDIT] Dev UserDev User",
  "containsTabA": true,
  "containsTabB": true
}
```

**Both edits merged into the document body, in the order they were applied.** Reload of tab A picks up tab B's edit via the Yjs CRDT through the WebSocket collab channel. ✅ Concurrent edge case handled correctly. No conflict dialog, no "your version is stale" UI — the merge is automatic and idempotent.

Raw: [raw/cat6-measurement/concurrent.json](raw/cat6-measurement/concurrent.json).

---

## Brief check 5 — Network failure during real-time collab: disconnect while editing, then reconnect

Single browser context: load a wiki document, click into the editor, set the page offline (`context.setOffline(true)` — the Playwright primitive for full network-down simulation), type a marker, set it back online, wait 5 s for Yjs to sync the queued ops, then reload and verify the offline edit persisted.

```json
{
  "tested": true,
  "docId": "27d6cf3a-0602-45a4-a8c0-e33e2fdfb567",
  "offlineTextSnippet": " [TAB-A-EDIT]  [TAB-B-EDIT]  [OFFLINE-EDIT] Dev User",
  "reloadedTextSnippet": " [TAB-A-EDIT]  [TAB-B-EDIT]  [OFFLINE-EDIT] Dev User",
  "offlineEditSurvived": true
}
```

**`offlineEditSurvived: true`** — the offline-typed marker is in the document body after the reload. Yjs queued the edit while the socket was disconnected and flushed it on reconnect. ✅ The brief's "does data survive? does the UI recover?" criterion is met.

Worth noting: the offline-edit text and the reloaded text are byte-for-byte identical (both end with `…[OFFLINE-EDIT] Dev User`). Yjs delivered exactly-once, no duplicate, no loss.

Raw: [raw/cat6-measurement/offline.json](raw/cat6-measurement/offline.json).

---

## Brief check 6 — Check server logs for unhandled errors during all the above

The dev API process was running with `tsx watch src/index.ts` in a background task throughout the entire Cat 6 measurement window. I greped the full stdout/stderr capture for `Error|UnhandledRejection|Exception|Traceback`.

### What appeared in the log

| Count | Error class | When | Triggered by |
|---:|---|---|---|
| 4 | `SyntaxError` from body-parser | malformed-probe test, twice (one run had 2 attempts) | Empty + non-JSON probes |
| 5 | `ForbiddenError: invalid csrf token` from csrf-sync | **first** run only (before I added real-CSRF login to test 2) | 5 of 8 probes in the original run |
| 2 | `PayloadTooLargeError` from raw-body | each run | 12 MB body probe |

### What did NOT appear

- ✅ Zero `UnhandledPromiseRejectionWarning`
- ✅ Zero `node:internal/process/promises` warnings (which would indicate an un-awaited rejection escaped a handler)
- ✅ Zero stack traces *outside* the body-parser/csrf-sync/raw-body cluster — i.e., no traces originating in `api/src/` route handlers
- ✅ Zero `pg` errors — no SQL parse errors, no constraint violations, no deadlocks

The 11 logged errors are all *expected* validation rejections that the API correctly turned into structured 4xx responses to the client. They are logged at error-level because the dev server uses Express's default error logging (every 4xx/5xx response with `err` set gets stack-printed). That is **noisy for development but not a real error count.** Worth a follow-up: the [api/src/middleware/error-handler.ts](../../api/src/middleware/error-handler.ts) could downgrade 400/403/413 to log.warn instead of log.error so that real 500-class errors stand out in production logs. Filed.

---

## Summary against the brief's checklist

| "How to Measure" item | Status |
|---|---|
| Open DevTools and monitor console; count errors and warnings | ✅ All 12 routes walked with fresh-context Playwright. **Zero pageerrors, zero warnings, one expected `/api/auth/me` 401 per route.** |
| Test network failure during real-time collab | ✅ `context.setOffline(true)` mid-edit, then `false`. **Offline edit survived reconnect + reload.** |
| Test malformed input — 8 input shapes | ✅ Empty / non-JSON / 50 KB title / XSS / negative estimate / SQL injection / deep nested / 12 MB body. **Zero stack-trace leaks. Two real findings: `estimate` silently stripped on create; XSS/SQL strings stored as inert text by design.** |
| Concurrent edge case — two users editing same field | ✅ Two independent contexts; both edits merged via Yjs. **Real surface-area finding: `ActionItemsModal` blocks first-click on direct-URL document navigation.** |
| Throttle to 3G — note hangs / silent failures / missing loading states | ✅ 5 routes walked at 50 KB/s + 400 ms RTT. **All routes resolve within 26 s. The only persistently-pending request at 15 s is the events WebSocket (expected). Missing: initial-paint progress indicator for the 25 s bundle download.** |
| Check server logs for unhandled errors during all the above | ✅ Greped the full `tsx watch` log. **Zero UnhandledRejection, zero handler-originated stacks. The 11 logged errors are body-parser / csrf-sync / raw-body expected rejections that the API correctly mapped to 4xx with sanitized envelopes.** |

---

## What this measurement uncovered that the audit didn't

Three findings that the static audit (which scanned for `componentDidCatch`, error-boundary coverage, and missing loading states) didn't surface:

1. **`createIssueSchema` is missing `estimate`.** Static audit can't catch a schema mismatch with the UI; only an actual round-trip probe reveals that `POST /api/issues { estimate: 5 }` silently strips the field. **Fixed on this branch** — see [api/src/routes/issues.ts](../../api/src/routes/issues.ts): three-line change (schema field + destructure + properties insert). Verified end-to-end: `POST /api/issues {title:"x", estimate:5}` now returns `estimate: 5` instead of `estimate: null`.

2. **`ActionItemsModal` blocks direct-URL document navigation.** The audit flagged "no Radix Dialog overlay click-through patterns" — but didn't catch the specific UX collision of the modal auto-opening on top of the editor. Modal does dismiss on Escape, so it's not a hard block; just an extra step for shared-link users.

3. **Express's default 4xx error logging makes real errors hard to spot.** Audit Cat 6's hypothesized "structured error logging" item was about format; this measurement shows the *level* (error vs warn) is the actual problem — 4xx/413 noise drowns out real 500s.

All three are written up as Cat 6 follow-ups in [shipshape/SUBMISSION.md](../SUBMISSION.md).

---

## How to reproduce

```bash
# 1. Dev servers up (web :5173, api :3000) with seed data
pnpm dev

# 2. Run the Playwright Cat 6 spec
npx playwright test --config=shipshape/improvements/runtime-errors-playwright.config.ts

# 3. Inspect raw output
ls shipshape/improvements/raw/cat6-measurement/
#   console-errors.json   per-route { errors, warnings, pageerrors }
#   malformed-probe.json  per-probe { status, contentType, bodySnippet, leaksStack }
#   throttle-3g.json      per-route { navigationMs, pendingRequestsAt5s, pendingRequestsAt15s }
#   concurrent.json       two-tab edit transcript
#   offline.json          offline-then-online edit transcript

# 4. Server-log grep (one-time, after the run)
#    The API process was running in a background shell during the spec.
#    Re-run with:
#       corepack pnpm --filter @ship/api dev 2>&1 | tee /tmp/cat6-api.log
#    Then in another shell:
#       grep -nE 'Error|UnhandledRejection|Exception|Traceback' /tmp/cat6-api.log
```
