# ShipShape — Orientation Notes

**Project:** Ship (US-Department-of-the-Treasury/ship) — project management tool with unified document model + real-time collab.
**Author:** Tyler Xia
**Date started:** 2026-05-18 (Mon, Week 4 kickoff)
**Audience:** Future me, during the audit and implementation phases. Mental model first; measurements come next.

This file is the deliverable for the 4-hour orientation called out in the project brief's Appendix. It maps to the appendix's Phase 1 / Phase 2 / Phase 3 sections. No measurements yet — diagnosis comes in the audit.

---

## TL;DR — the mental model in 6 bullets

1. **Everything is a row in `documents`.** Wiki pages, issues, programs, projects, weeks (called "sprint" in the DB for historical reasons), people, weekly plans/retros, standups, weekly reviews — all share one table with a `document_type` discriminator and a JSONB `properties` blob. The schema sketch in [docs/unified-document-model.md](docs/unified-document-model.md) says "the current schema uses explicit columns" but the actual [api/src/db/schema.sql](api/src/db/schema.sql) already uses JSONB properties. The doc is out of date — code is the source of truth.
2. **Relationships moved out of columns.** Migrations [027](api/src/db/migrations/027_drop_legacy_association_columns.sql) and [029](api/src/db/migrations/029_drop_program_id_column.sql) dropped `project_id`, `sprint_id`, and `program_id` from `documents`. They now live in a `document_associations` junction table with a `relationship_type` enum (`parent | project | sprint | program`). Older code that still references those columns is dead/migrated.
3. **Server is the source of truth; client is offline-tolerant, not offline-first.** Editor content syncs via Yjs CRDTs over WebSocket (with y-indexeddb cache); list/metadata is TanStack Query with an IndexedDB persister for stale-while-revalidate. The "local-first mutation queue" was explicitly removed Jan 2025 — see decision log in [docs/application-architecture.md](docs/application-architecture.md).
4. **Single Express process handles REST + WebSocket.** `api/src/index.ts` boots `createApp()` then `setupCollaboration(server)` on the same HTTP server. Routes are mounted in `api/src/app.ts` with `conditionalCsrf` middleware that skips CSRF when an `Authorization: Bearer` header is present (API tokens).
5. **Strict TS is on at the root.** `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. So the Type Safety category baseline isn't "is strict mode off" — it's counting `any`, `as`, `!`, `@ts-ignore`/`@ts-expect-error` and any leaked implicit-`any` parameters.
6. **E2E is Playwright with per-worker Postgres testcontainers.** Each worker boots its own Postgres + API + Vite **preview** (not dev — preview is lightweight; using `vite dev` historically blew up to 90 GB and crashed the box). Unit tests are vitest in `api/`; `web/` has vitest configured but few specs.

---

## Phase 1 — First Contact

### 1. Repository Overview

**Clone / run / doc-the-gaps.** I'm operating on the existing checkout at `c:\Users\tyler\ship`. The kickoff slide shows `git checkout -b shipshape/audit` — I haven't branched yet because today is read-only orientation. Current branch is `master`, clean working tree.

The README's setup steps are accurate but the project CLAUDE.md is more current:
- `pnpm dev` runs `scripts/dev.sh`, which auto-creates `api/.env.local`, finds free ports (API:3000+, Web:5173+), creates the DB if absent, runs migrations, and starts both servers in parallel.
- PostgreSQL must be running before `pnpm dev`. CLAUDE.md says local install, README mentions Docker Compose — both work; `docker-compose.yml` is "OPTIONAL" per its own header.
- Demo creds: `dev@ship.local` / `admin123` (per README).

**Pnpm workspaces.** `pnpm-workspace.yaml` declares three packages: `api`, `web`, `shared`. Build order matters: `shared` must build first because `api` and `web` import its compiled `dist/`.

```
ship/
├── api/         # Express + ws on a single HTTP server
├── web/         # React 18 + Vite 6 + TipTap + Yjs
├── shared/      # TypeScript types + constants (compiled to dist, consumed via workspace:*)
├── e2e/         # Playwright (chromium-only) with per-worker testcontainers
├── docs/        # Architecture decisions + claude-reference/ for AI tooling
├── terraform/   # AWS infra (dev, shadow, prod envs)
└── scripts/     # dev.sh, deploy.sh, deploy-frontend.sh, worktree-init.sh, etc.
```

**docs/ in one sentence each (skimmed in this orientation):**
- [application-architecture.md](docs/application-architecture.md) — Tech stack decisions + a long-form decision log going back to Dec 2024.
- [unified-document-model.md](docs/unified-document-model.md) — Data model spec; partly stale (says properties are columns; code says JSONB).
- [ship-philosophy.md](docs/ship-philosophy.md) — Programs / Projects / Weeks / Issues hierarchy with ICE scoring on projects.
- [document-model-conventions.md](docs/document-model-conventions.md) — Naming + 4-panel editor layout (Icon Rail | Sidebar | Content | Properties).
- `claude-reference/` — A sub-doc tree built for Claude Code agents (architecture, patterns, anti-patterns, gotchas, FAQ). This is meta — the team explicitly invests in AI-readable docs.

**Web ↔ API ↔ Shared diagram.**

```
┌─────────────────────────────────┐   workspace:* import
│              web/               │ ─────────────────┐
│  React 18 + Vite 6 + TipTap     │                  ▼
│  ↳ TanStack Query (+IndexedDB)  │            ┌──────────┐
│  ↳ y-websocket, y-indexeddb     │            │ shared/  │
│  ↳ React Router v6              │            │  types/  │
└────────────┬────────────────────┘            │  consts  │
             │ proxied via Vite                │ (CJS+ESM)│
             │ /api/* and /collaboration/*     └────▲─────┘
             ▼                                      │
┌─────────────────────────────────┐  workspace:* import
│             api/                │ ─────────────────┘
│  Express 4 + ws on one HTTP srv │
│  ↳ pg (raw SQL, no ORM)         │
│  ↳ zod for request validation   │
│  ↳ helmet, csrfSync, cookie-pkr │
│  ↳ swagger-ui-express + zod-to- │
│    openapi → /api/docs          │
└────────────┬────────────────────┘
             │  pool.query
             ▼
        PostgreSQL
```

### 2. Data Model

**Authoritative file:** [api/src/db/schema.sql](api/src/db/schema.sql). Migrations apply on top in order ([api/src/db/migrations/](api/src/db/migrations/), 38 files as of 037).

Tables in one paragraph:
- `workspaces` — top-level tenant container with a `sprint_start_date` (still the historical name).
- `users` — global identity; PIV/CAC fields (`x509_subject_dn`), `is_super_admin`, `last_workspace_id`. Email unique case-insensitively via a functional `LOWER(email)` index.
- `workspace_memberships` — **authorization layer**, separate from any content. Role `admin | member`.
- `workspace_invites` — email + optional PIV cert for invite acceptance.
- `sessions` — 15-min idle / 12-hour absolute timeout; session id is a hex `TEXT` (not UUID — explicit comment in the schema).
- `audit_logs`, `oauth_state`, `api_tokens` — security/audit infra.
- `documents` — the heart. JSONB `content` (TipTap doc), `BYTEA yjs_state`, JSONB `properties`. `ticket_number INTEGER` for issue display IDs. Status timestamps (`started_at`, `completed_at`, `cancelled_at`, `reopened_at`). Conversion tracking columns (`converted_to_id`, `converted_from_id`, `original_type`, `conversion_count`). Visibility (`private | workspace`). Soft-delete via `deleted_at` and `archived_at`.
- `document_associations` — junction table with `relationship_type` enum. Replaces dropped columns.
- `document_history` — field-level audit trail with `automated_by` (e.g., `"claude"`) to distinguish AI-generated changes.
- `document_snapshots` — pre-conversion state for undo.
- `document_links`, `comments` — backlinks + threaded inline comments.
- `sprint_iterations`, `issue_iterations` — completion-attempt logs (used by Claude Code `/work` integration).
- `files` — S3-backed attachment metadata.

**Discriminator semantics:** `document_type` is a real PG `ENUM` (`'wiki' | 'issue' | 'program' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro' | 'standup' | 'weekly_review'`). The corresponding TS union is at [shared/src/types/document.ts](shared/src/types/document.ts) with one `*Properties` interface per type, all carrying an `[key: string]: unknown` index signature so they round-trip through `properties JSONB`.

**Document relationships:** Three kinds —
1. **Parent/child (tree)** — `documents.parent_id` (FK to documents) with a PL/pgSQL `prevent_circular_parent` trigger that walks up to `max_depth = 100`.
2. **Associations (graph)** — `document_associations(document_id, related_id, relationship_type)` with a `UNIQUE` constraint preventing duplicate edges of the same type and a `CHECK` against self-reference.
3. **Backlinks** — `document_links` populated from TipTap content scanning.

The "Authorization vs Content Separation" callout in the docs is real and reflected in the schema: a `person` document with `properties.user_id` points at a `users` row, but `workspace_memberships` does **not** point at the person doc. Auth queries memberships; display queries person docs. No "repair logic" reconciles them.

### 3. Request Flow — "create an issue"

End-to-end trace based on reading `documents.ts` and `app.ts`:

1. **Web** — user fills the new-issue dialog → `useMutation` calls `createDocument`. Optimistic update inserts a temp-ID issue into the cached list ([web/src/lib/queryClient.ts](web/src/lib/queryClient.ts) configures the IndexedDB persister via `idb-keyval`).
2. **HTTP** — `POST /api/documents` with `Content-Type: application/json` and an `X-CSRF-Token` header (token fetched once from `GET /api/csrf-token`).
3. **Vite dev proxy** rewrites `/api/*` and `/collaboration/*` to `http://localhost:${apiPort}` (the port is read from `../.ports`, written by `scripts/dev.sh`).
4. **Express middleware chain** (top of `createApp` in [api/src/app.ts](api/src/app.ts)):
   - `trust proxy` + `Via`-header CloudFront `x-forwarded-proto` rewrite (prod only)
   - `helmet` with a strict CSP (`'unsafe-inline'` allowed for TipTap styles and the admin credentials page's inline scripts)
   - `apiLimiter` — 100 req/min prod, 1000 dev, 10000 test
   - `cors` (credentials: true), `express.json({ limit: '10mb' })`, `cookieParser`, `session`
   - `conditionalCsrf` — applied per-router. **Bearer tokens bypass CSRF** because cookies/CSRF only matter for browser-auto-attached creds.
5. **Route handler** — `documents.ts` `router.post('/')` (via `authMiddleware`). `authMiddleware` either:
   - validates a Bearer API token (SHA-256 lookup in `api_tokens`, updates `last_used_at`), or
   - validates the session cookie (`sessions` row, 15-min idle + 12-hr absolute timeout, refreshes `last_activity` and slides the cookie expiry — but only if >60s since last refresh, to avoid `Set-Cookie` on every request).
6. **Validation** — zod schema `createDocumentSchema` (note: it still accepts `program_id` and `sprint_id` even though those columns are gone; presumably routed into the associations table).
7. **DB** — `pool.query(...)` (no ORM, no transaction wrapper for simple inserts).
8. **Broadcast** — collaboration server `invalidateDocumentCache` + `broadcastToUser` notify other connected clients via the `/events` WebSocket channel.
9. **Response** — `{ success: true, data: <document> }` shape (per `ApiError`/`ApiResponse` in [shared/src/types/api.ts](shared/src/types/api.ts), though many routes return raw rows — not perfectly consistent).
10. **Web** — `onSuccess` swaps the temp ID for the real one in the cached list; `onSettled` invalidates queries to fetch authoritative state.

**Unauth'd request:** `authMiddleware` returns `401 { code: UNAUTHORIZED }` immediately. Several routers mount the auth middleware inside each handler (not as router-level `use`), so it's worth checking per-route during the audit.

---

## Phase 2 — Deep Dive

### 4. Real-time Collaboration

**Setup.** `setupCollaboration(server)` in [api/src/collaboration/index.ts](api/src/collaboration/index.ts) attaches a `ws.WebSocketServer` to the same HTTP server. Two channels:
- `/collaboration/:roomName` — Yjs document sync per room (`roomName` = `${type}:${uuid}`)
- `/events` — global per-user channel for non-document notifications

**Sync.** Standard `y-protocols/sync` + `y-protocols/awareness` framing, hand-rolled (not using `y-websocket` server library). Message types:
- `messageSync (0)` — Yjs sync step 1/2 + update messages
- `messageAwareness (1)` — presence
- `messageCustomEvent (2)` — application-level events
- `messageClearCache (3)` — server-pushed instruction to wipe IndexedDB before re-syncing (e.g., after a server-side conversion)

**Persistence.** In-memory `Map<string, Y.Doc>` keyed by room. Updates are debounced — `pendingSaves: Map<string, NodeJS.Timeout>` saves the Yjs binary state to `documents.yjs_state BYTEA` every ~2 s after the last change.

**Rate limiting.** Per-IP connection rate (30/min) + per-connection message rate (50/sec), with progressive penalty: 50 violations → close. `setInterval` cleanup every 30 s.

**Two-user same-field edit.** Yjs CRDT merges automatically. The server is the relay; convergence is guaranteed by the data structure, not the server. If one user is offline, their changes sit in y-indexeddb and merge on reconnect.

**Source of truth on reconnect.** Server's `yjs_state` is authoritative — the client sends sync-step-1 with its state vector, server replies with the diff. If a `messageClearCache` arrives, the client wipes IndexedDB first.

### 5. TypeScript Patterns

- **Version:** TypeScript `^5.7.2` everywhere (root, api, web, shared).
- **Configs:** Root `tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `isolatedModules`. Per-package configs extend it; `web/tsconfig.json` redeclares `strict: true` but does **not** redeclare the stricter flags (it doesn't `extends` the root), so the web package effectively runs with **stock strict** rather than the root's superset. Worth confirming during the audit — if `noUncheckedIndexedAccess` is off in web, that's a meaningful gap.
- **Shared as a contract.** `@ship/shared` is `workspace:*` in both `api` and `web` `package.json`. It compiles to `dist/` and is consumed via the `exports` map. `shared/tsconfig.json` enables `composite: true`, and `web/tsconfig.json` declares a project reference to `../shared`.
- **Discriminated unions** — see [shared/src/types/document.ts](shared/src/types/document.ts:267-317): the `Document` base type is extended by `WikiDocument | IssueDocument | ProgramDocument | ...`, each narrowing `document_type` to a literal and tightening `properties`.
- **Index signature pattern** on all `*Properties` interfaces (`[key: string]: unknown`) — allows JSONB round-trips while keeping known keys typed. Pragmatic compromise vs. exact types.
- **Patterns to verify in the audit:**
  - Are there places using `any` where a discriminated union would work? (`canAccessDocument` in `documents.ts:18` returns `{ doc: any | null }` — yes, at least one obvious example.)
  - Are zod schemas single-sourced into TS types via `z.infer`?
  - Are there `as` assertions where a type guard would do?

### 6. Testing Infrastructure

**Playwright (E2E).**
- Config at [playwright.config.ts](playwright.config.ts): chromium-only, fully parallel, retries 1 local / 2 CI, 60s timeout per test.
- **Per-worker isolation** via [e2e/fixtures/isolated-env.ts](e2e/fixtures/isolated-env.ts) — each worker boots its own `@testcontainers/postgresql` container, dynamic API port, and `vite preview` (static server, NOT `vite dev`). Worker count calculated from free memory; CI uses 4.
- Memory math: ~500 MB/worker = Postgres + API + preview + browser. Hard-cap reason documented: 8 workers with vite-dev caused a 90 GB blowup.
- **DB lifecycle:** fresh container per worker, schema + migrations applied on startup, fixture data seeded by `isolated-env.ts`.
- **Empty-test footgun:** files with only TODO comments pass silently; `scripts/check-empty-tests.sh` runs pre-commit to catch them.
- **Seed-data convention** (from CLAUDE.md): never `test.skip()` for missing data, use `expect(...).toBeGreaterThanOrEqual(N)` with a message that names the fixture file.

**Unit tests.**
- `api/` uses vitest (look for `*.test.ts` next to route files: `documents.test.ts`, `issues.test.ts`, `auth.test.ts`, etc.).
- `web/` has vitest configured but minimal coverage — `Dashboard.test.tsx` is one of few I saw.

**Test command surface:**
- `pnpm test` runs the api vitest suite only (per root `package.json`).
- `pnpm test:e2e` runs Playwright — **never run directly** per CLAUDE.md; use the `/e2e-test-runner` skill, which polls `test-results/summary.json` to avoid drowning the assistant in output from 600+ tests.

### 7. Build and Deploy

**Local build.**
- `pnpm build` is recursive. Order matters: shared first.
- `api/` build: `tsc && cp schema.sql + migrations/ → dist/`. Migrations are SQL files, not code.
- `web/` build: `tsc && vite build`. Output ends up in `web/dist/`.

**Dockerfile (api).** Reads `node:20-slim` from ECR Public (Docker Hub is blocked in gov), disables strict SSL (gov VPN intercepts certs), installs prod-only pnpm deps with `--ignore-scripts`, **copies pre-built `shared/dist/` and `api/dist/` from the host** (not built inside the image). On boot runs `node dist/db/migrate.js && node dist/index.js`. `Dockerfile.web` and `Dockerfile.dev` exist but I haven't read them yet.

**docker-compose.yml** is for local Postgres only (postgres:16 with hardcoded local creds, explicitly NOT production secrets). `docker-compose.local.yml` is the bigger one (referenced by `pnpm docker:up`).

**Terraform.** `terraform/` has dev, shadow, prod environments. Modules: aurora, cloudfront-s3, elastic-beanstalk, security-groups, ssm, vpc. Top-level files: `database.tf`, `elastic-beanstalk.tf`, `s3-cloudfront.tf`, `waf.tf`, `cloudfront-logging.tf`. So: ALB → Elastic Beanstalk Docker → Aurora; S3 + CloudFront for frontend; WAF in front. Bootstrap dir for state buckets.

**CI/CD.** No `.github/workflows/` directory — there is no GitHub Actions pipeline checked in. Deployment is manual via `./scripts/deploy.sh prod` (backend, EB) and `./scripts/deploy-frontend.sh prod` (S3/CloudFront), per CLAUDE.md. This matches the "Manual deploys initially (scripts, not pipeline)" decision in the architecture doc.

---

## Phase 3 — Synthesis

### 3 strongest architectural decisions

1. **Single-table document model with JSONB properties.** Removes ~10 tables, lets new content types ship without migrations, keeps cross-type features (comments, backlinks, history, snapshots) trivial. The 4-panel editor reuse follows directly from this. The cost is paid in indexes and in losing PK-level referential integrity for type-specific relationships — but the team accepts that, and the migrations to fix earlier mistakes (drop legacy columns, junction table) show they're following through.
2. **Single Express process for REST + WebSocket on the same HTTP server.** Avoids a microservice split, dodges sticky-session pain (or rather, keeps it to one box), and means session/auth state is trivially shared between channels. Scaling story is "vertical first, then sticky," which fits the stated 20–200-user scale.
3. **Per-worker testcontainers for E2E.** This is where many production codebases fail their E2E suites. Truly isolated DBs, fresh schema each run, no shared state. The painful history (90 GB memory crash) is documented in the fixture's docstring, so a future engineer won't try to "fix" the dev-vs-preview choice. That preserved-context is itself a strong decision.

### 3 weakest points (audit priorities)

1. **Stale architecture docs vs. code.** `docs/unified-document-model.md` says "current schema uses explicit columns; target uses JSONB" — but migration 001 already moved properties to JSONB, and migrations 027/029 removed the explicit relationship columns. Drift like this misleads new engineers and inflates audit time. **Audit angle:** N+1 / index analysis (Category 4) — if anything still queries by the dropped columns, it's broken.
2. **Validation schemas accept stale fields.** `createDocumentSchema` in `documents.ts` accepts `program_id` and `sprint_id` even though those columns no longer exist. Either the handler silently routes them into `document_associations`, or they're silently dropped. Either way, the schema lies about the API contract. **Audit angle:** Type Safety (Category 1) + Runtime Errors (Category 6).
3. **Web `tsconfig` likely doesn't inherit the root's stricter flags** — it stands alone with stock `strict: true`. This means the strongest typing constraints (`noUncheckedIndexedAccess`, `noImplicitReturns`) only apply on the api/shared side. **Audit angle:** Type Safety (Category 1) — turning these on in `web` is a high-leverage measurable improvement; almost certainly produces dozens of errors that surface real bugs.

### What I'd tell a new engineer first

- "Everything is a document. `documents.document_type` is the discriminator; `properties` is JSONB. When in doubt, grep migrations — not just `schema.sql`."
- "The DB still calls weeks `sprint`. Don't 'fix' the naming; you'll break things. Migration 033 is the rename-in-progress."
- "Editor content syncs via WebSocket + Yjs; list state syncs via REST + TanStack Query + IndexedDB persister. Never use one mechanism for the other's job."
- "Never run `pnpm test:e2e` blind — use the `/e2e-test-runner` skill. It exists because 600+ Playwright tests will drown you."
- "If you're tempted to add a new content table, you're probably wrong. See `/ship-philosophy-reviewer`."

### What breaks first at 10× load

1. **WebSocket fanout.** Today, all rooms live in-memory in one process. With 10× users, more concurrent docs → more Y.Docs held in `Map<string, Y.Doc>` → process memory becomes the first wall. Mitigation path: stickiness + room-aware sharding, or moving to a dedicated y-websocket relay. Not a refactor, but it'd be the first to bend.
2. **`documents` table indexes.** The schema has `idx_documents_workspace_id`, `idx_documents_document_type`, GIN on `properties`, plus per-flag partial indexes. But list queries with multiple filters (e.g., "all active issues in program X assigned to me") are going to scan-or-bitmap-OR more aggressively at 10× row counts. The audit (Category 4, EXPLAIN ANALYZE) will quantify.
3. **Session storage.** `sessions` is a plain table with no LRU eviction policy. At 10× users + 12-hour absolute timeout, this grows linearly. Cleanup probably runs somewhere; need to verify.
4. **Vite preview during E2E (CI side).** Today's 4-worker CI is sized for the current test count. 10× more tests in CI will overrun the time budget unless sharded. Less of a "breaks" concern, more of a "becomes the slow build."

---

## Discovery candidates (running list)

The brief asks for three things I didn't know before. Capturing more than three so I can pick the best for the final write-up.

1. **`prevent_circular_parent` PL/pgSQL trigger** at [api/src/db/schema.sql:165-197](api/src/db/schema.sql#L165-L197). Recursive depth-bounded walk (`max_depth := 100`) executed BEFORE INSERT OR UPDATE OF `parent_id` on `documents`. Enforces a graph invariant at the database layer with a built-in safety net — no application code can accidentally create a cycle. I'd typically have done this in TypeScript; doing it in the DB is bulletproof and shows up in `EXPLAIN`.
2. **`conditionalCsrf` middleware that swaps protection per auth scheme** at [api/src/app.ts:51-61](api/src/app.ts#L51-L61). If `Authorization: Bearer …` is present, skip CSRF (Bearer tokens aren't auto-attached by browsers, so CSRF is irrelevant). Otherwise apply standard `csrfSync`. Single middleware, clean separation between machine and human clients.
3. **Sliding-window cookie refresh with a 60-second throttle** at [api/src/middleware/auth.ts:212-221](api/src/middleware/auth.ts#L212-L221). Every authed request normally would mean a new `Set-Cookie` to extend the session. They throttle to "only if >60s since last activity" — cuts unnecessary cookie traffic without compromising the sliding timeout.
4. **CloudFront `Via`-header rewrite of `x-forwarded-proto`** at [api/src/app.ts:99-107](api/src/app.ts#L99-L107). CloudFront-to-EB hops over HTTP, so EB sees `X-Forwarded-Proto: http` and would issue insecure cookies. The middleware detects the CloudFront `Via` header and forces `x-forwarded-proto = https`. Subtle, prod-only, hard to think of until you've been bitten by it.
5. **Per-worker testcontainers + `vite preview` (not dev)** at [playwright.config.ts](playwright.config.ts) + [e2e/fixtures/isolated-env.ts](e2e/fixtures/isolated-env.ts). Worker isolation via fresh Postgres containers + lightweight static preview server. The 90 GB-explosion war story is preserved in the fixture's docstring — keeps future engineers from "fixing" the choice.
6. **`@asteasolutions/zod-to-openapi` for spec generation.** Listed in `api/package.json` and there's an `openapi:generate` script. Single source of truth: zod schemas drive both runtime validation and the published Swagger/OpenAPI spec.
7. **`document_history.automated_by` column** ([api/src/db/migrations/016_document_history_automated_by.sql](api/src/db/migrations/016_document_history_automated_by.sql)). Field-level audit log that distinguishes human edits from AI-generated changes (e.g., `automated_by = 'claude'`). Encodes AI provenance at the schema level rather than in metadata.

---

## Open questions for the audit (followups)

- Where exactly is `pnpm test:e2e` measured today? `test-results/summary.json` is mentioned by CLAUDE.md but I haven't seen the writer yet — `e2e/progress-reporter.ts`?
- The web `tsconfig.json` — does it really diverge from root, or is there a base inheritance I missed? **Confirm during the audit; pivotal for Category 1's improvement target.**
- The "73+ Playwright tests" claim — what's the actual current number? Brief says 73, I'll count.
- Are there `*.test.tsx` files outside `web/src/pages/Dashboard.test.tsx`? Code coverage tooling appears unconfigured — needs `vitest --coverage` setup before measurement.
- Bundle analyzer — `web/` doesn't have `rollup-plugin-visualizer` or `vite-bundle-analyzer` in its devDeps. I'll need to add one in the audit phase (read-only build, then strip it before commit, or land it on a labeled branch).

---

## Working agreement with myself

- One labeled branch per category in implementation phase (`shipshape/01-type-safety`, `shipshape/02-bundle-size`, ...). Audit lives on `master` since it's read-only artifacts.
- All baselines reproducible from `shipshape/audit/`: keep raw output files (axe scans, lighthouse JSON, `EXPLAIN ANALYZE` output, autocannon results) under `shipshape/audit/raw/`.
- Every improvement gets a `shipshape/improvements/<NN>-<slug>.md` with before/after numbers and the diff link.
- Discovery write-up lives at `shipshape/discoveries.md` and is updated as I go — not crammed at the end.
