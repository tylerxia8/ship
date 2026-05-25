# ShipShape — Demo Video Script (3–5 min)

**Target length:** 4:30 (gives buffer to land at 3:30–5:00 with light editing). Covers all 8 categories at a headline level (Cat 3 + Cat 4 + Cat 7 + Cat 8) plus discipline + honest hedges.
**Format:** screen recording with voice-over. Browser + terminal + VS Code on-screen.
**Recording tool:** OBS (free) on Windows, or QuickTime if on Mac.
**Resolution:** 1080p, 30fps. Mic input only — turn system audio off so background noise from the dev servers isn't captured.

---

## Setup checklist (do this once before recording)

1. **Open windows in this exact arrangement** so screen-share switches are clean:
   - **Window 1 — Browser (left half):** Chrome at `http://localhost:5173` with DevTools docked right (Network tab + Console).
   - **Window 2 — VS Code (right half):** open at the repo root with `shipshape/SUBMISSION.md` in the foreground tab and `shipshape/audit/AUDIT_REPORT.md` in tab 2.
   - **Window 3 — Terminal (full screen, behind):** PowerShell at repo root with `corepack pnpm dev` running. Have a second tab open for ad-hoc commands.
2. **Pre-stage the comparison artifacts:**
   - `shipshape/audit/raw/perf/` open in VS Code (before-state autocannon)
   - `shipshape/improvements/raw/perf-after-v2/_summary.txt` open in VS Code (after-state)
   - `shipshape/audit/raw/bundle-stats.html` open in a browser tab (before treemap)
   - `shipshape/improvements/raw/lighthouse/before/dashboard.report.html` + `after/dashboard.report.html` in two browser tabs side-by-side
   - `shipshape/security/raw-prod/verification.md` open in VS Code (Cat 8 production verification — 12/12 ok)
   - A terminal tab cd'd to the repo root, ready to run `node shipshape/security/probe.mjs --api=http://localhost:3000 --web=http://localhost:5173` live on-camera
3. **Have these git commands ready to paste:**
   - `git log --oneline shipshape/audit..shipshape/03-api-perf` (shows the API-perf branch's commits)
   - `git diff --stat shipshape/audit shipshape/03-api-perf -- 'api/src/**'` (file-by-file change)
4. **Practice run.** Read the script aloud once before recording. Time it — aim for 4:00.

---

## Scene-by-scene

### [0:00–0:20] Cold open — what this is

**On screen:** SUBMISSION.md scrolled to the "Results — all 8 categories" table.

**Say:**
> "I'm Tyler Xia. For the past 7 days I audited a U.S. Treasury project-management app called Ship — about 60,000 lines of TypeScript across an Express API, a React/Vite frontend, and Postgres — and shipped eight measured improvements: the brief's seven categories plus a Cat 8 security addendum that came mid-week. This video walks through the audit findings and the headline result for each category. Everything you see is reproducible — the commands are in the docs and the raw measurement output is committed under `shipshape/audit/raw/` and `shipshape/improvements/raw/`."

---

### [0:20–0:45] The audit gate

**On screen:** `shipshape/audit/GATE_CHECKLIST.md` (the 1-page index).

**Say:**
> "Before any fix, the brief required a written audit covering methodology, baseline numbers, weaknesses, and severity ranking for all eight categories — the original seven plus the security addendum. That's in `AUDIT_REPORT.md` — 450 lines — and there's a one-page checklist that maps each category to where those four components live. Diagnosis comes before treatment. The audit branch contains zero production-code changes except a single measurement instrumentation flag in `app.ts` that bypasses the dev rate limiter so load tests reflect handler latency, not 429 responses."

---

### [0:45–3:05] Four headline results

For each category, ~30 seconds. Show the before number, then the after number, then *one* sentence on the root cause. Cat 8 gets ~40s because the probe-in-action visual is worth the extra time.

#### Cat 3 — API perf (0:45–1:15)

**On screen:** terminal showing `cat shipshape/improvements/raw/perf-after-v2/_summary.txt` (or open the file in VS Code).

**Say:**
> "API: `/api/auth/me` had a P99 of **1575 milliseconds at 50 concurrent connections** — over a second and a half for a 377-byte response. Root cause: the pg connection pool was set to `max=10`, so 40 of the 50 requests queued for a pool slot. Bumping the pool to `max=20` (verified `max=50` regressed because Postgres went CPU-bound) and stripping the TipTap `content` blob out of the `/api/issues` list response cut that P99 to **73 milliseconds — a 95% reduction.** All measured with `autocannon`, three runs averaged."

#### Cat 4 — DB queries (1:15–1:50)

**On screen:** `shipshape/improvements/raw/db-after/explain-combined.txt` showing the EXPLAIN ANALYZE for the consolidated query.

**Say:**
> "DB queries: the `/api/dashboard/my-work` endpoint fired four separate Postgres queries — workspace, issues, projects, sprints — for one page render. Collapsed those into a single SQL `UNION ALL` with a discriminator column and a typed JS dispatch on the client side. **Four queries to two — a 50% reduction.** Then on a separate `shipshape/04b-functional-indexes` branch I added partial B-tree indexes on `properties->>'state'` and `properties->>'assignee_id'` and the planner switched from a Seq Scan to a Bitmap Index Scan on the issues-by-state query — textbook plan change documented in the improvement doc."

#### Cat 7 — Accessibility (1:50–2:25)

**On screen:** Lighthouse before/after dashboard reports side-by-side. Highlight `dashboard.report.html` showing 96 → 100.

**Say:**
> "Accessibility: 46 nodes failing the `color-contrast` rule across 5 of the 12 audited routes — a direct contradiction of the README's WCAG 2.1 AA badge. Three root causes: an `accent` color token that worked as a button background but failed as text on dark, `text-muted/50` alpha modifiers that crossed the contrast line, and an `opacity-40` wrapper on future-week standup rows. Cleared all 46. Cross-checked with Lighthouse — the two lowest-scoring routes both went **from 96 to 100.**"

#### Cat 8 — Security audit (2:25–3:05)

**On screen, sequence:**
1. Terminal — run `node shipshape/security/probe.mjs --api=http://localhost:3000 --web=http://localhost:5173`. Let the surface progress markers print live (`▶ auth` → `▶ input` → `▶ websocket` → `▶ deps` → `▶ manual`). Catch the summary line `critical: 0  high: 24  ...` on camera.
2. Cut to VS Code showing `shipshape/security/raw-prod/verification.md` — scroll past the 12 `✓ [ok]` lines verifying production.
3. Briefly show `git log --oneline shipshape/08-security` — the headline commit chain (`1361c54` probe + 2 fixes → `9cdf809` brief-gap closures → `176ff29` Fix #3 → `e85cfa0` Fix #4 + #5).

**Say:**
> "Security: the brief added an eighth category requiring a runnable probe tool and at least two verified vulnerability fixes. The probe lives at `shipshape/security/probe.mjs` — one command, five surfaces, zero external runtime dependencies. Running it on the audit baseline surfaced four critical findings. Two were WebSocket process-crash paths — any authenticated user could DoS the entire API server with one oversized or malformed frame. The `ws` library was emitting an unhandled `error` event that escalated to `uncaughtException` and crashed the Node process. The other two were transitive critical CVEs that `pnpm audit` flagged in `fast-xml-parser` and `protobufjs`. Five verified fixes total: WS error listeners close the DoS, `pnpm.overrides` patches the CVEs, a global Express error handler ends a body-parser stack-trace leak, a WS Origin allow-list closes the cross-site WebSocket hijack vector, and a per-account login lockout closes the distributed credential-stuffing gap. **Critical findings: 4 → 0. All 454 unit tests still pass.** Same probe against the live Render deploy — 12 of 12 production checks `ok`."

---

### [3:05–3:35] Discipline: one branch per category, no `--no-verify`

**On screen:** `git branch -a | grep shipshape` output, then `git log --oneline shipshape/audit..shipshape/03-api-perf`.

**Say:**
> "Each improvement lives on its own branch off `shipshape/audit` — eight branches, one per category — so a reviewer can `git diff shipshape/audit shipshape/03-api-perf` and see only the API-perf change. No cross-category mixing. Pre-commit hooks ran clean on every commit — I never used `git commit --no-verify`, which the project's `CLAUDE.md` explicitly forbids. When the `check-empty-tests.sh` hook was itself buggy and rejected legitimate tests, I fixed the hook and documented it as a Cat-6 finding rather than bypassing it."

---

### [3:35–4:05] Honest hedges

**On screen:** scroll to the "Honest hedges" section of `shipshape/SUBMISSION.md`.

**Say:**
> "Two honest hedges. One: seed volume is around 250 documents instead of the brief's stated 500-plus — most categories aren't volume-sensitive but two specific Cat 3 numbers would look more dramatic at 500. Two: the `/login` route still has a missing `<main>` landmark in Lighthouse — out of scope for the contrast fix, called out as a documented follow-up. The earlier Terraform and Docker prod-mirror hedges both closed yesterday — `terraform apply` ran end-to-end against real Render, Vercel, and Neon APIs and the prod-mirror `docker compose up --build` ran clean with all five Cat 8 protections verified in the production code path. Both evidence files are in `shipshape/security/raw-prod/`. I'd rather flag the residuals than pretend everything is clean."

---

### [4:05–4:25] Close

**On screen:** browser at `https://ship-henna.vercel.app` showing the live deploy login page.

**Say:**
> "Live at `ship-henna.vercel.app`, code at `github.com/tylerxia8/ship`. Reviewer entry point is `shipshape/SUBMISSION.md` — that file deep-links into the audit report, all eight improvement docs, the security probe, the discoveries, and the production-verification artifact. Thanks."

---

## Editing notes

- **Cut anything that doesn't change the screen.** Long voice-overs on a static screen feel longer than they are.
- **Keep cursor movements deliberate.** Pre-position before recording each scene; don't fish for buttons mid-narration.
- **No background music.** It competes with the voice and adds nothing.
- **Title card at the start (optional, 2s):** "ShipShape — Tyler Xia — 7 audit categories, 7 measured fixes." Helps reviewers know they're in the right video.

---

## What NOT to include

- Don't read the AI cost analysis on camera. It's a separate written deliverable.
- Don't walk through every category. Four headlines (Cat 3 / 4 / 7 / 8) + the discipline section is enough to convey what's interesting; reviewers can read the docs for Cat 1 / 2 / 5 / 6.
- Don't apologize for the audio quality unless it's genuinely unintelligible. Just record again if it is.
- Don't try to demo a feature in the deployed app. The audit is the deliverable; user-flow demos are scope creep for this format.
- For Cat 8: don't try to live-reproduce the WS process-crash on camera. The before-fix repro requires running the older audit-baseline branch, which means stopping the dev server, checking out `shipshape/audit`, starting it again — three context switches that eat 90 seconds. Show the probe report instead; let the artifact carry the proof.
