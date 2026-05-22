# ShipShape Security Probe

A single-command security probe for a running Ship instance. Built as the Category 8 deliverable.

## What it does

Actively probes the running app across five surfaces and writes a JSON + Markdown report:

| Surface | What it checks |
|---|---|
| **auth** | Unauthenticated route access (9 routes); session-token entropy; logout invalidates the session; malformed-cookie rejection; **session-timeout configuration check** (reads `SESSION_TIMEOUT_MS` + `ABSOLUTE_SESSION_TIMEOUT_MS` from `shared/src/constants.ts`, asserts sane bounds); **vertical privilege test** (super-admin → admin route); **horizontal privilege escalation** when `--member-email/--member-password` supplied (regular member must 401/403 on admin routes) |
| **input** | XSS / SQL injection (time-based) / oversized input on issue title; **plus XSS-shaped input across 3 more user-facing fields**: document title, document content (TipTap text node), project title; reflected XSS in `/api/search/mentions?q=` |
| **websocket** | `/events` + `/collaboration` upgrade auth; unknown-path handling; authenticated collab WS receives: 64-byte random binary, 11 MB binary (oversized), text frame to binary endpoint, **valid binary frame with unknown `messageType` varuint=99** (unexpected message type per Yjs protocol); `/health` poll after each frame distinguishes crash / silent-accept / reject |
| **deps** | `pnpm audit --json` parsed; advisories bucketed by severity; **per-advisory dependency-chain capture** via `pnpm why <pkg>` so each finding's `evidence` shows `consumingWorkspace` + `dependencyChains[]` |
| **manual** | CORS preflight from a hostile origin; CSP header + anti-pattern scan; client-bundle secret scan (AWS keys / PEM / DB URL / SESSION_SECRET); login rate-limit probe (12 failed attempts, expects 429 at ≤ 5); error-verbosity (stack-trace leakage on 3 probe shapes) |

Findings are graded per the [audit's severity rubric](../audit/AUDIT_REPORT.md#severity-rubric): `critical / high / medium / low / info / ok`. A finding graded `ok` is a *positive* result — the surface was tested and behaved correctly.

## One-command run

```bash
# Prereqs: pnpm dev running locally (api on :3000, web on :5173)
node shipshape/security/probe.mjs
```

Outputs to `shipshape/security/raw/`:
- `report.json` — machine-readable, every finding with its full evidence
- `report.md` — human-readable, grouped by surface, severity-ordered

## CLI flags

```bash
node shipshape/security/probe.mjs \
  --api=http://localhost:3000 \
  --web=http://localhost:5173 \
  --email=dev@ship.local \
  --password=admin123 \
  --out=shipshape/security/raw/<custom-dir>
```

| Flag | Default | Notes |
|---|---|---|
| `--api` | `http://localhost:3000` | API host. Can point at a deployed instance (e.g. `https://ship-api-76ez.onrender.com`) — note WS tests will use `wss://`. |
| `--web` | `http://localhost:5173` | Not used by the probes directly today; reserved for future SPA-side checks. |
| `--email`, `--password` | `dev@ship.local` / `admin123` | Used to obtain a session for authenticated probes. |
| `--member-email`, `--member-password` | (none) | Non-admin credentials. When supplied, the auth probe runs the **horizontal privilege escalation** test — logs in as this account and verifies admin routes return 401/403. Without it, only the vertical direction (admin → admin) is checked. Can also be supplied via `SHIPSHAPE_MEMBER_EMAIL` / `SHIPSHAPE_MEMBER_PASSWORD` env. |
| `--out` | `shipshape/security/raw/` | Output directory for the JSON + MD report. |

## Exit code

- `0` — clean (no critical/high)
- `1` — fatal probe error
- `2` — at least one critical or high finding (CI-friendly)

## Design notes

- **Read-mostly.** The probes create test data (issues with malformed titles) but never delete existing rows. Pass `--cleanup` to remove the probe's own creations (not yet implemented).
- **Independent modules.** Each surface is a standalone file in `modules/`. If one throws, the rest still run; the failure is captured as a `info`-severity finding.
- **No third-party dependencies.** The probe uses Node 24's built-in `fetch` and `WebSocket`. The only external command it shells out to is `pnpm audit`.
- **Reproducible.** Every finding includes a `reproduction` array — copy-pasteable curl/playwright steps a grader can re-run.
