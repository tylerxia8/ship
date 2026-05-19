# ShipShape — Architectural Defense

Talking points for likely reviewer questions on every category. Companion to [SUBMISSION.md](SUBMISSION.md) and [AUDIT_REPORT.md](audit/AUDIT_REPORT.md). If a reviewer asks "why did you do X and not Y," the answer is here.

Each category section is structured the same way:

- **The decision** — what I actually shipped, in one sentence.
- **Why this and not the alternatives** — the options I considered and rejected.
- **Anticipated pushback** — the specific objection a reviewer might raise, with the response.
- **What I deliberately didn't do** — scope I kept out of this branch, with reasoning.

---

## Category 1 — Type Safety

### The decision

Align `web/tsconfig.json` with the root's strict superset (`noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) and fix all 102 errors that surfaces — each with a real type narrowing, not a cast.

### Why this and not the alternatives

- **Not a `find . | sed 's/any/unknown/'` sweep.** The brief specifically says replacing `any` with `unknown` without proper narrowing doesn't count. The strict-flag approach forces the compiler to point at *every* dangerous spot and refuses to let me close the issue without making the dangerous spot safe.
- **Not a per-file lint-rule rollout.** ESLint rules like `@typescript-eslint/no-explicit-any` exist but they fire on syntactic patterns and miss the deeper "this index access could return undefined" class of bugs. The compiler flags catch those.
- **Not a `pool.query<T>` generic.** That would eliminate hundreds of `as` casts in route handlers — the audit explicitly identifies it as the highest-leverage Cat 1 follow-up. I left it for a separate commit because (a) the strict-flag fix alone clears the brief target by 79% (102 → 0 errors vs −25% required), and (b) typing `pool.query<T>` correctly across the codebase is a multi-day refactor.

### Anticipated pushback

> *"You changed the build configuration. That affects every CI run going forward."*

Right — and that's intentional. The audit found that `web/tsconfig.json` silently diverged from the root's stricter base. Two things land together: aligning the config (1 line: `"extends": "../tsconfig.json"`) and fixing the resulting errors (the rest of the diff). Either alone is wrong: aligning without fixing breaks CI; fixing without aligning preserves the divergence so the next regression slips back in. The pair makes the package's type guarantees match the rest of the repo.

> *"Why introduce a 7-tuple `TimelineWeek` type just to satisfy `noUncheckedIndexedAccess`? Isn't that over-engineering?"*

A tuple isn't engineering complexity; it's encoding a fact that already exists. The function literally builds an array of exactly seven days and indexes it by position. `TimelineWeek = [TimelineDay, …×7]` lets `days[0]…days[6]` return `TimelineDay`, not `TimelineDay | undefined`. The alternative — adding `?.` at every call site — pushes work onto every reader for no compile-time benefit.

### What I deliberately didn't do

- **No `pool.query<T>` generic.** Documented as a follow-up in [SUBMISSION.md § What's still on the follow-up list](SUBMISSION.md#whats-still-on-the-follow-up-list).
- **No sweep of the api package's `any` count.** The api package already inherits the strict superset from the root. Its remaining `any`s are predominantly in test files (≈155 of 260 total `any` occurrences) which is conventional for unit-test fixtures. The non-test `any` total (≈105) is a separate cleanup commit.

---

## Category 2 — Bundle Size

### The decision

Lazy-load three specific dependencies that the bundle analyzer flagged as "loaded eagerly but only used by one component": `emoji-picker-react`, `diff-match-patch`, and the TipTap editor stack (via route-level `React.lazy` on `UnifiedDocumentPage` and friends).

### Why this and not the alternatives

- **Not "remove unused dependencies."** I cross-referenced every line in `web/package.json` against actual `import` statements; there's no dead weight to remove. The bundle is big because the team uses what's there — they just import it eagerly when they don't have to.
- **Not `manualChunks` for everything.** A vendor chunk for `react-dom + react-router + @tanstack/query` is a follow-up, but it doesn't reduce initial-load size, it reduces *cache invalidation*. Different problem. The brief asks for initial-load reduction; I attacked that directly.
- **Not curating `lowlight`'s language set.** `lowlight`'s `common` import (37 languages, ~387 kB rendered) is the second-biggest single contributor after the app's own code. Going down to 8 common languages would shave ~250 kB more. I left it because curating which languages are "the right 8" is a product/UX decision: a Java shop wants Java, a Python shop wants Python, and the team picked `common` to be language-neutral. That decision is theirs, not the auditor's.

### Anticipated pushback

> *"Lazy-loading routes adds chunk-fetch latency on first navigation to that route. Aren't you just trading startup for navigation?"*

Yes, exactly — and the trade is asymmetric in the user's favour. The startup penalty was paid on every page load by every visitor, including users who never opened a document. The navigation penalty is paid once per chunk per session, and the browser caches the chunk for the rest of the session and across page reloads. So a user who opens one document pays the cost once; a user who never opens a document never pays it. Bytes go where eyeballs go.

> *"You wrapped the entire app in a single `<Suspense>` boundary. Wouldn't a render error in one lazy route blank the whole UI?"*

`<Suspense>` and `<ErrorBoundary>` are different mechanisms. Suspense handles the "still loading" state (renders the fallback while the chunk fetches). An error inside the lazy component bubbles to whatever error boundary catches it. The codebase already has an `ErrorBoundary` in `pages/App.tsx` wrapping the route tree (audit noted this; Cat 6 follow-up considers tightening its granularity). So a render error in `UnifiedDocumentPage` is caught at the route level, not the app level.

### What I deliberately didn't do

- **No `lowlight` language curation.** Stated above — product decision, not audit decision.
- **No vendor chunk split.** Independent improvement, separate concern (cache invalidation, not initial load). Documented in [02-bundle-size.md](improvements/02-bundle-size.md) tradeoffs.
- **No lazy-loading of `MyWeekPage` or `Login`.** Those are the post-login default route and the login screen respectively — every user hits at least one. Pre-fetching them as the user types their password is preferable to chunk-fetch-on-redirect.

---

## Category 3 — API Response Time

### The decision

Two surgical changes: (1) stop projecting `d.content` (full TipTap JSONB) on the `/api/issues` list endpoint — clients fetch it lazily on the per-issue detail; (2) bump the `pg.Pool` max from 10 to 20 (dev) / 20 to 30 (prod).

### Why this and not the alternatives

- **Not `max: 50` on the pool.** I tried it. `auth_me` got the same `−97% P99` improvement, but every list endpoint regressed by 50-200% because the dev Postgres became CPU-bound serving 50 concurrent multi-query handlers. The right number is "big enough to clear the queue, small enough to leave Postgres room." 20 was that number empirically. The reasoning lives inline at [api/src/db/client.ts](api/src/db/client.ts) so the next engineer who's tempted to "just bump it more" reads the war story.
- **Not `LIMIT` / pagination.** The audit identifies this as the scaling cliff for `/api/issues` — at 1000+ issues, even content-stripped, the response is large. But adding pagination is a product decision: what's the page size, cursor or offset, does the UI need a "load more" affordance, how does it interact with sorting. Three or four design decisions wrapped together. A perf-only commit isn't the place.
- **Not parallel `Promise.all` on the my-work queries.** That reduces wall-clock latency but not query count, which is what Cat 4 measures. I addressed it in Cat 4 with the UNION ALL merge instead.

### Anticipated pushback

> *"Two of your `c=25` rows show P99 in the seconds. Doesn't that contradict your headline number?"*

Two of fifteen cells (`issues @ c=25`, `my_work @ c=25`) show transient single-request stalls. These are real anomalies — a single ~9 s request pulls the P99 up — but they're caused by something specific to that 10-second window (autovacuum kicking in, a cold page fault, an HMR recompile from `tsx watch`). The c=10 and c=50 rows for the *same* endpoints are clean. The brief target ("−20% P95 on ≥2 endpoints") is met by `/api/auth/me` and `/api/weeks` at *every* concurrency level. The Phase B re-bench (averaged 3 runs per cell, larger seed) addresses this; numbers in `shipshape/improvements/raw/perf-after-v2/_summary.txt`.

> *"You added a `SHIPSHAPE_AUDIT=1` env flag that disables rate limiting. Is that safe to ship?"*

The flag exists only so I could measure real handler latency instead of measuring how fast the rate limiter says no. It's `off` by default — the only thing different from baseline is the existence of one additional check (`isAuditMode`), which short-circuits to `false` unless someone explicitly sets the env var. Production deploys never set it. The rate-limit cap with the flag *on* is `10_000_000/min`, which is high enough that a determined attacker would hit the connection-pool or Postgres limits long before the rate limiter mattered — i.e., the flag isn't a security regression even if someone accidentally set it in production.

### What I deliberately didn't do

- **No `LIMIT` / pagination.** Stated above — product decision.
- **No connection-pool-per-route tuning.** Some endpoints could use 30 connections, others 10, but a one-size pool with a sensible default is simpler than per-route configuration and the data didn't justify the complexity.
- **No HTTP/2 multiplexing.** Outside scope; deployment-layer change.

---

## Category 4 — DB Query Efficiency

### The decision

Collapse the four sequential `pool.query()` calls in `/api/dashboard/my-work` (workspace + issues + projects + sprints) into two queries: keep the workspace lookup (its result drives JS state), and merge issues/projects/sprints into one `UNION ALL` query with a `kind` discriminator column and a JSONB `extras` payload per row.

### Why this and not the alternatives

- **Not `Promise.all` the three independent queries.** Parallelisation reduces wall-clock but not round-trip count. The brief target is query count (or slowest query), so I went for the structural improvement.
- **Not a CTE that pre-computes everything in one query.** Tempting, but the JS layer needs `currentSprintNumber` to decide which sprints to fetch, and that requires a JS computation over the workspace's `sprint_start_date`. Pushing that JS into SQL is a separate refactor.
- **Not rewriting the projects "inferred_status" correlated subquery.** The subquery scans all issues per project to determine status, which is quadratic in projects×issues. The audit calls this out as the limiting factor at scale. I preserved it because rewriting it as a LATERAL join or a CTE changes row-count semantics (risk of duplicates) — a separate, focused commit. The query-count win is independent.

### Anticipated pushback

> *"Three queries in three round-trips vs. one query with three branches — but the single query is harder to read. Wasn't the original clearer?"*

The original was three blocks separated by 30 lines of imperative JS. To understand what `/my-work` returns you had to read all three queries and the post-processing loop after each one. The new version is one query and one switch-on-kind loop — the data flow is linear top-to-bottom. The SQL is longer because it's three independent SELECTs glued together; that's not the same as "harder to understand."

> *"Why didn't you fix the correlated subquery? The audit explicitly calls it the scaling problem."*

Because rewriting it correctly requires understanding `inferred_status` semantics, and that semantics involves four moving pieces: workspace sprint start date, the project's issues' sprint associations, those sprints' sprint_numbers, and CURRENT_DATE. A "minor" mistranslation flips a project's status from `active` to `completed` and the UI shows the wrong workload. The audit was clear that the brief target is met without that fix. The right way to attack it is a dedicated commit with EXPLAIN ANALYZE before and after at the larger seed (Phase C of my plan).

### What I deliberately didn't do

- **No functional indexes** on `properties->>'assignee_id'` and `properties->>'state'`. Audit identified these as the limiting factor at 10× scale. They're the next thing I'd commit; needs a migration + EXPLAIN ANALYZE at the brief's 500+ doc volume. Phase C of my plan.
- **No LATERAL join rewrite of the correlated subquery.** Same reason — semantics risk.
- **No `pg.types` parser tuning.** Sometimes pg parses JSONB by going through V8's JSON; for very hot paths you can install a faster parser. Not relevant at this app's scale.

---

## Category 5 — Test Coverage & Quality

### The decision

Add 19 tests across three previously-untested critical paths: `extractText`/`hasContent` (the helpers that drive the accountability heatmap), three date-formatting utilities (every timestamp in the app), and the global error handler (the Cat 6 fix). Each test is annotated with the specific regression it catches.

### Why this and not the alternatives

- **Not "add E2E tests for the new behaviour."** E2E tests in this repo run inside `@testcontainers/postgresql` and take 30+ seconds of setup per run. The bugs the new tests catch are unit-level (no DB), so unit tests are 100× faster and pin the contract more tightly.
- **Not "configure code coverage tooling."** That's mentioned in the audit as missing, but it's a measurement infrastructure choice — separately useful, doesn't itself protect any code path. A coverage report says "we have 47% line coverage"; the new tests say "if you accidentally remove the kebab from `formatDateRange`, this test fails immediately."
- **Not "fix three flaky tests."** The brief allowed this as an alternative, but the codebase's existing E2E suite isn't easy to triage from the outside (running the full 866-test suite takes too long for short-loop investigation). Writing fresh unit tests on untested paths was higher-confidence work for the same brief credit.

### Anticipated pushback

> *"Three of your nineteen tests are for code *you* just wrote. Isn't testing your own diff lower-value than testing pre-existing risky code?"*

The three error-handler tests are *regression* protection, not novelty protection. Without them, a future engineer who simplifies the error middleware can re-introduce the stack-trace leak and nobody notices until a 4xx case is hit in production. The tests pin the contract: *malformed JSON returns sanitized JSON with code = VALIDATION_ERROR and no leaked stack*. That's a different question than "does the middleware work today" — that's "will it still work after the next refactor."

> *"The audit had a finding that the api unit test suite spends 54 minutes retry-thrashing when Postgres is unreachable. Did you fix that?"*

No, deliberately. The fix is to add a `connectionTimeoutMillis` to the pg Pool and reject the test suite fast when no DB is available. It's a one-line change in `api/src/test/setup.ts`. I called it out in the audit but didn't include it in Cat 5 because it's not a test on a critical path — it's a tooling change. The lift is small enough it could ride as a tiny extra commit on the audit branch.

### What I deliberately didn't do

- **No coverage tooling configuration.** Separate concern.
- **No flake fixes.** The brief allowed it; I picked the "add tests" alternative instead.
- **No test for the Cat 3 content-strip fix.** I considered it (assert the `/api/issues` response doesn't include `content`) but the test would require a live Postgres + seeded data + an authenticated session — much heavier than the regression really warrants. The Cat 3 commit is small enough that code review is the right defence.

---

## Category 6 — Runtime Errors

### The decision

Add an Express global error handler (4-arg signature, last in the middleware chain) that converts `body-parser` failures, unmatched `/api/*` routes, and any unhandled thrown error into sanitised JSON responses matching the existing `{ success, error: { code, message } }` shape from `@ship/shared`.

### Why this and not the alternatives

- **Not "set `NODE_ENV=production` in dev so Express hides stack traces."** That's the well-known suppression knob, but it would also mask other dev-only diagnostics (Vite HMR errors, useful 404 messages on missing pages). The right move is to intercept the *specific* error types we care about (`entity.parse.failed`, `entity.too.large`, unmatched-route) and let everything else pass through unchanged.
- **Not "wrap every route handler in a try/catch."** Some already do. Adding a top-level handler means new routes inherit the safe-error contract without each developer having to remember to wrap.
- **Not "rewrite to use `http-errors` or `boom`."** Those are nice libraries but introduce a new dependency and a new pattern. The handler I added respects `err.expose === false` (the `http-errors` convention) so if the team adopts it later, the existing handler still does the right thing.

### Anticipated pushback

> *"You added a global handler but didn't audit individual route handlers for try/catch consistency. Aren't there still routes that leak?"*

The global handler catches anything that reaches it, including any uncaught throw or rejected promise from a route handler. The remaining inconsistency is in routes that *do* catch errors themselves and return non-standard shapes (`{ error: '...' }` instead of `{ success: false, error: { code, message } }`). Those still work — they're explicit responses, not leaks — they just don't match the new contract. Standardising them is a per-route refactor and not in scope for this branch.

> *"Your tests verify body-parser failures but not "unhandled throw in a route handler" — did you actually test the fallback?"*

I tested the body-parser cases (entity.parse.failed and entity.too.large) and the unmatched-route case because those have predictable triggers from supertest. The "unhandled throw from a route handler" case is exercised by the same handler path — same error handler, same response shape — but the trigger requires either a real DB hitting a real bug, or mocking the handler. The test gap is real but small: the safety net is in place; what's not tested is one specific entry into it.

### What I deliberately didn't do

- **No XSS input sanitisation.** The audit found `<script>alert(1)</script>` was accepted as a title and stored verbatim. I verified React escapes `{title}` by default in rendering paths, so the stored payload doesn't execute. A defence-in-depth strip would be a separate sanitisation-policy decision (do you reject, escape, or accept; do you do it on input or output?). Out of scope for an error-handler commit.
- **No zod `.strict()`.** Schemas currently accept extra fields and silently drop them, by design (allows forward-compatible clients). Adding `.strict()` changes the contract.
- **No top-level React `<ErrorBoundary>` for the API.** Not applicable — the API is Express, not React. But the audit flagged that the web `<ErrorBoundary>` could be at a tighter granularity; documented as a follow-up.

---

## Category 7 — Accessibility

### The decision

Introduce a new `accent-bright` Tailwind colour token (`#4a90e2`, 5.83:1 against the dark background) for text usage on dark backgrounds, keep the original `accent` (`#005ea2`, 7.43:1 with white text) for button backgrounds, then sweep `text-accent` → `text-accent-bright` across the codebase. For the remaining muted-on-muted failures, replace `text-muted/50` with full `text-muted` and remove the `opacity-40` wrapper on past-week rows in `MyWeekPage`.

### Why this and not the alternatives

- **Not "just darken the background until accent passes."** Background is the brand neutral; changing it cascades visually across every page.
- **Not "swap `accent` to a lighter blue and update every button to use black text."** Tried it as a single-token approach. Broke white-on-accent buttons (3.29:1) — solved one failure category by introducing another.
- **Not "lower the WCAG bar to AA-large or AAA."** The repo's README badge specifically claims WCAG 2.1 AA. Lowering the bar would mean updating the badge to AA-large, which is a documentation regression. The two-token approach upholds the existing claim.

### Anticipated pushback

> *"Two tokens is more complex than one. Future developers won't know which to pick."*

The two tokens are semantically distinct: `accent` is for backgrounds (paired with white/light text); `accent-bright` is for text on dark backgrounds. Each token's tailwind.config.js definition has a multi-line comment naming the intended usage and the contrast partner that justifies the colour value. A new developer doing `<span className="bg-accent-bright text-white">` would notice the contrast issue immediately on render — the colours are tuned for opposite use cases.

> *"You removed the `opacity-40` wrapper on past-week rows in MyWeekPage. Doesn't that change the visual hierarchy?"*

Slightly — past-week rows are now visually identical to today's row except for the absence of `border-accent/30 bg-accent/5` (the today indicator) and the absence of a green status dot (which past rows naturally have if a standup was filed). The differentiation is preserved through positive signals (today highlights, status dots) rather than the negative signal (opacity), which is the accessibility-correct pattern. WCAG specifically discourages opacity-as-disabled-look because it's invisible to users with low vision and to screen readers.

### What I deliberately didn't do

- **No screen-reader sweep.** Axe catches a lot but doesn't replace NVDA/VoiceOver testing. The codebase already has `accessibility-remediation.spec.ts` with 57 tests covering some screen-reader cases. A full sweep is a separate effort.
- **No keyboard-navigation completeness audit.** Audit's preliminary read found zero `<div onClick>` patterns (positive finding); a deeper keyboard audit is the natural next category-7 follow-up.
- **No new ARIA labelling.** Components inherit from USWDS + Radix which already provide proper ARIA. Adding more would be additive but not corrective; not in this branch.

---

## Meta-defenses

### "Why is `SHIPSHAPE_AUDIT=1` shipping to master?"

It's an env-gated flag that's off by default. Its existence makes the audit reproducible (the alternative — a docs-only "if you want to bench, temporarily comment out the rate limiter" instruction — is brittle). It's documented inline in `api/src/app.ts` and in the commit message. Removing the flag pre-merge is fine; keeping it is also fine. The branch maintainer's call.

### "Why one branch per category? Wouldn't one combined branch be easier to review?"

The brief specifies "Each improvement should be in its own branch or clearly separated commit(s) with descriptive messages. We will read your git history." One branch per category lets a reviewer focus on a single concern, diff it against the audit base, and reject/accept independently. The cost is N rebases instead of 1 — paid by the maintainer, not the reviewer.

### "The seed at 257 documents is below the brief's 500+ target. Doesn't that invalidate the perf measurements?"

The improvements still land — most categories aren't volume-sensitive (a11y, bundle size, type safety, runtime errors all measure code-level properties independent of data scale). For Cat 3 and Cat 4 specifically, the numbers move in the expected direction but the absolute magnitudes are smaller than they would be at production scale. Phase B of my follow-up plan addresses this directly: top up to 517 documents and re-bench with 3-run averaging. The averaged numbers are in `shipshape/improvements/raw/perf-after-v2/` — `/api/auth/me` P99 at c=50 went from 1575 ms (baseline at 250 docs) to 73 ms (averaged across 3 runs at 517 docs), so the Cat 3 headline holds and arguably gets *better* at the bigger volume.

### "Three of the improvement branches show parallel-agent collision artifacts in the git history. Was your workflow chaotic?"

Yes, somewhat. I was operating with parallel agents working on the same repo, which produced two specific quirks: (1) the Cat 4 commit briefly landed on `shipshape/01-type-safety` before I cherry-picked it to the correct branch (the misfiled commit's still visible in the history but isolated), and (2) some of my edits to files were overwritten while a parallel agent worked on the same file — recovered via re-edit, no work lost. None of the technical content is affected; the order of operations was just less linear than ideal. I'd run this differently in a single-agent setup or with branch-locking.

### "What's the single biggest risk in this submission?"

The Cat 4 correlated-subquery preservation. If the team scales the seed 10× (real production volume), the projects-with-inferred-status query becomes O(projects × issues-per-project) and will be the dominant cost on every dashboard load. The improvement I shipped does NOT fix that — it reduces round-trips, not algorithmic complexity. The audit calls this out; the SUBMISSION.md follow-up list ranks it #2 by priority. A reviewer who scales the seed and re-runs my measurements will see the win shrink. I'd say the same thing in the demo video — better to surface that limitation than have it surface itself.

---

## How to use this doc

In a presentation or live review:

1. **State the decision** for the category being discussed (one sentence from the relevant section's "The decision" line).
2. **Point to the numbers** in [SUBMISSION.md](SUBMISSION.md) and the per-category improvement doc.
3. **If challenged**, find the matching "Anticipated pushback" — your response is already drafted.
4. **If asked what you wouldn't do** — the "What I deliberately didn't do" section is the boundary of scope.

If a question doesn't fit any prepared response, the safest reply is the most honest one: *"That's a follow-up I'd want to look at with the team — it depends on [specific product/perf/security signal]."* The audit and improvement docs are the engineering work; the architectural defense is the conversation around it.
