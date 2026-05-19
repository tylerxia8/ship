# ShipShape — Demo Video Script (3–5 min)

**Target length:** 4:00 (gives buffer to land at 3:30–5:00 with light editing)
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
3. **Have these git commands ready to paste:**
   - `git log --oneline shipshape/audit..shipshape/03-api-perf` (shows the API-perf branch's commits)
   - `git diff --stat shipshape/audit shipshape/03-api-perf -- 'api/src/**'` (file-by-file change)
4. **Practice run.** Read the script aloud once before recording. Time it — aim for 4:00.

---

## Scene-by-scene

### [0:00–0:20] Cold open — what this is

**On screen:** SUBMISSION.md scrolled to the "Results — all 7 categories" table.

**Say:**
> "I'm Tyler Xia. For the past 6 days I audited a U.S. Treasury project-management app called Ship — about 60,000 lines of TypeScript across an Express API, a React/Vite frontend, and Postgres — and shipped seven measured improvements across the categories the brief defined. This video walks through the audit findings and the headline result for each category. Everything you see is reproducible — the commands are in the docs and the raw measurement output is committed under `shipshape/audit/raw/` and `shipshape/improvements/raw/`."

---

### [0:20–0:45] The audit gate

**On screen:** `shipshape/audit/GATE_CHECKLIST.md` (the 1-page index).

**Say:**
> "Before any fix, the brief required a written audit covering methodology, baseline numbers, weaknesses, and severity ranking for all seven categories. That's in `AUDIT_REPORT.md` — 450 lines — and there's a one-page checklist that maps each category to where those four components live. Diagnosis comes before treatment. The audit branch contains zero production-code changes except a single measurement instrumentation flag in `app.ts` that bypasses the dev rate limiter so load tests reflect handler latency, not 429 responses."

---

### [0:45–2:30] Three headline results

For each category, ~30 seconds. Show the before number, then the after number, then *one* sentence on the root cause.

#### Cat 3 — API perf (0:45–1:15)

**On screen:** terminal showing `cat shipshape/improvements/raw/perf-after-v2/_summary.txt` (or open the file in VS Code).

**Say:**
> "API: `/api/auth/me` had a P99 of **1575 milliseconds at 50 concurrent connections** — over a second and a half for a 377-byte response. Root cause: the pg connection pool was set to `max=10`, so 40 of the 50 requests queued for a pool slot. Bumping the pool to `max=20` (verified `max=50` regressed because Postgres went CPU-bound) and stripping the TipTap `content` blob out of the `/api/issues` list response cut that P99 to **73 milliseconds — a 95% reduction.** All measured with `autocannon`, three runs averaged."

#### Cat 4 — DB queries (1:15–1:50)

**On screen:** `shipshape/improvements/raw/db-after/explain-combined.txt` showing the EXPLAIN ANALYZE for the consolidated query.

**Say:**
> "DB queries: the `/api/dashboard/my-work` endpoint fired four separate Postgres queries — workspace, issues, projects, sprints — for one page render. Collapsed those into a single SQL `UNION ALL` with a discriminator column and a typed JS dispatch on the client side. **Four queries to two — a 50% reduction.** Then on a separate `shipshape/04b-functional-indexes` branch I added partial B-tree indexes on `properties->>'state'` and `properties->>'assignee_id'` and the planner switched from a Seq Scan to a Bitmap Index Scan on the issues-by-state query — textbook plan change documented in the improvement doc."

#### Cat 7 — Accessibility (1:50–2:30)

**On screen:** Lighthouse before/after dashboard reports side-by-side. Highlight `dashboard.report.html` showing 96 → 100.

**Say:**
> "Accessibility: 46 nodes failing the `color-contrast` rule across 5 of the 12 audited routes — a direct contradiction of the README's WCAG 2.1 AA badge. Three root causes: an `accent` color token that worked as a button background but failed as text on dark, `text-muted/50` alpha modifiers that crossed the contrast line, and an `opacity-40` wrapper on future-week standup rows. Cleared all 46 with two automated sweeps and one manual fix. Cross-checked with Lighthouse — the two lowest-scoring routes both went **from 96 to 100.**"

---

### [2:30–3:15] Discipline: one branch per category, no `--no-verify`

**On screen:** `git branch -a | grep shipshape` output, then `git log --oneline shipshape/audit..shipshape/03-api-perf`.

**Say:**
> "Each improvement lives on its own branch off `shipshape/audit`, so a reviewer can `git diff shipshape/audit shipshape/03-api-perf` and see only the API-perf change. No cross-category mixing. Pre-commit hooks ran clean on every commit — I never used `git commit --no-verify`, which the project's `CLAUDE.md` explicitly forbids. When the `check-empty-tests.sh` hook was itself buggy and rejected legitimate tests, I fixed the hook and documented it as a Cat-6 finding rather than bypassing it. That's commit `db106d1`."

---

### [3:15–3:45] Honest hedges

**On screen:** scroll to the "Honest framing — what this does not claim" section of any improvement doc; pick `07-accessibility-v2-lighthouse.md`.

**Say:**
> "Two honest hedges. One: the `/api/issues` endpoint regressed slightly at higher seed volume because the response is still 256 KB without pagination — adding `LIMIT`/cursor pagination is the right next step and is called out in the follow-up list. Two: the `/login` route still has a missing `<main>` landmark in Lighthouse — out of scope for the contrast fix, called out as a documented follow-up. I'd rather flag the residual than pretend it's clean."

---

### [3:45–4:00] Close

**On screen:** browser at the deployed URL (or, if recording before deploy, the SUBMISSION.md top page).

**Say:**
> "Everything is at `<deployed URL>`; the submission entry point is `shipshape/SUBMISSION.md`. Thanks."

---

## Editing notes

- **Cut anything that doesn't change the screen.** Long voice-overs on a static screen feel longer than they are.
- **Keep cursor movements deliberate.** Pre-position before recording each scene; don't fish for buttons mid-narration.
- **No background music.** It competes with the voice and adds nothing.
- **Title card at the start (optional, 2s):** "ShipShape — Tyler Xia — 7 audit categories, 7 measured fixes." Helps reviewers know they're in the right video.

---

## What NOT to include

- Don't read the AI cost analysis on camera. It's a separate written deliverable.
- Don't walk through every category. Three headlines + the discipline section is enough to convey what's interesting; reviewers can read the docs.
- Don't apologize for the audio quality unless it's genuinely unintelligible. Just record again if it is.
- Don't try to demo a feature in the deployed app. The audit is the deliverable; user-flow demos are scope creep for this format.
