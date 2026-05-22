# ShipShape — AI Cost & Tool Effectiveness Analysis

**Window:** 2026-05-18 → 2026-05-24 (audit + 6-day improvement sprint)
**Primary tool:** Claude Code (CLI) using Claude Opus 4.7 (1M context window) and Claude Sonnet 4.6 for delegated subagent work.

---

## Dev spend

**Methodology.** The exact figures come from Anthropic Console → Usage → date range `2026-05-18` to `2026-05-24`, filtered by model (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). The table below uses an **estimate** based on observable session signals; the user-verified actuals replace these numbers when pulled.

| Bucket | Estimate | Source |
|---|---:|---|
| Claude Code (Opus 4.7, 1M ctx) — primary driver | **~$90–$130** | Bulk of session: 8 long-running Claude Code conversations across the 7-day window, each carrying 100k–500k tokens of context. Heavy cache use (most input is cache reads at $1.50/M, not fresh reads at $15/M) keeps this from being 5× higher. |
| Claude Code subagents (Sonnet 4.6) — Explore, Plan, parallel measurement | ~$15–$30 | Cats 3/4/6/7 measurement ran via four parallel Sonnet subagents during the audit phase; Cat 8 manual review used Explore subagents to grep CSP/secrets/rate-limit code paths. Sonnet's 5× cheaper than Opus per token, so this stays small even with ~20 invocations. |
| Claude Haiku 4.5 — none material this project | ~$0–$5 | Haiku didn't come up much. A few short status-line / build-validator calls. |
| Claude.ai web (chat) — none used this project | $0 | Deliberately kept everything in Claude Code CLI for tool + context continuity. |
| ChatGPT / other LLM | $0 | Not used. |
| **Total AI spend (estimated)** | **~$105–$165** | |

**To replace the estimate with the actual figure:** open https://console.anthropic.com/settings/usage, set the date range filter to `2026-05-18` → `2026-05-24`, sum the per-model rows, and swap the numbers in. The estimate's confidence interval is ±50%; actuals could land anywhere in $60–$220 depending on cache hit rate.

### What the estimate is anchored to

Observable signals from this session:

| Signal | Value | Why it matters for cost |
|---|---:|---|
| Commits across `shipshape/*` branches in the date range | **139** | Each commit represents ~3–10 turns of agent work; ~700–1,400 turns total |
| Branches touched | **22** | Captures the breadth of the work; correlates with conversation volume |
| Lines inserted across raw measurement artifacts + improvement docs | **~375,000** | Heavy artifact volume (autocannon JSON × 60, axe JSON × 12, Lighthouse HTML × 7, probe reports × 4) — these dominate the line count but are cheap to generate (one tool call writes the whole file) |
| Improvement docs written | **20** (8 primary + 7 measurement + 5 supplementary) | The most token-expensive output per file — long-form prose with code blocks |
| Long-running sessions in 1M-context mode | **~8** | Each carries hundreds of thousands of context tokens; cache hit rate determines whether this is $5 or $50 per session |

The biggest single multiplier on cost is **cache hit rate**. In Claude Code's long-running sessions, after the first few turns the cache is warm and input tokens read at 10× cheaper than fresh. A session that cached well costs ~$3–$8; the same session with poor caching could be $30–$80. My sessions cached well — I tended to keep one conversation per category running for the whole improvement pass — so the estimate above sits at the lower end of what an audit-plus-fix sprint of this scope could cost.

### Cost per delivered output (rough)

| Output | Estimated cost | Notes |
|---|---:|---|
| Cat 1 — 102 hidden tsc errors → 0 | $10–$15 | Mostly Opus narrowing types one file at a time + a few Sonnet sweeps for `text-muted/{N}` |
| Cat 3 — autocannon perf measurement + pool tuning | $8–$12 | Subagent ran autocannon; main session did the failed-experiment writeup |
| Cat 4 — UNION ALL + functional indexes + LATERAL rewrite | $10–$15 | The LATERAL round-2 portion was ~$2 on top of the original $8–$13 |
| Cat 7 — 46 → 0 contrast, Lighthouse cross-check | $10–$15 | Heavy on token volume because Lighthouse HTML reports are large reads |
| Cat 8 — probe tool + 5 fixes + production verification | $25–$40 | The probe is 600 LOC of original code + 5 fixes + 3 doc files (08-security, MANUAL_REVIEW, README) — token-heaviest single deliverable |
| 100/100 round-2 depth pass (Cat 1 + 5 + 8 + 4 follow-ups) | $5–$10 | Smaller scope, well-cached against earlier sessions |
| Docs, infra, deploy, discoveries, demo script, social drafts | $20–$30 | Long-form prose dominates; subagents helped here |

---

## Reflection — was AI effective for codebase comprehension?

### Where AI was decisive

1. **Day-1 orientation in 4 hours instead of 2 days.** The 4-hour Codebase Orientation Checklist [shipshape/orientation.md](orientation.md) was produced by having Claude read `docs/`, `schema.sql`, `package.json` files, and major route files in parallel, then synthesize. It took roughly 90 minutes wall-clock — I'd estimate 1.5–2 days solo. The "TL;DR mental model in 6 bullets" section at the top of that doc was right enough to stand up unchanged when I returned to it on day 6.

2. **Finding the hidden Cat-1 win.** The audit's headline Type-Safety finding — "102 hidden tsc errors across 22 files when web's tsconfig aligns with root's strict superset" — surfaced by having Claude diff all four `tsconfig.json` files in parallel and notice that `web/tsconfig.json` doesn't extend root. A human would catch this eventually; Claude caught it in the first 10 minutes of Cat-1 scan. I wouldn't have looked there.

3. **Parallel subagent measurement.** Cats 3, 4, 6, 7 measurements ran simultaneously via four parallel Sonnet subagents — autocannon perf, EXPLAIN ANALYZE, malformed-input probe, axe-core scan. This compressed maybe 4 hours of sequential measurement into ~50 minutes wall-clock. One collision happened (a dashboard.ts edit was committed twice to slightly different branches and required cleanup), documented honestly in the architectural-defense file.

### Where AI stumbled and I had to override

1. **Pool-size tuning over-corrected.** Claude's first reflex on the `pg.Pool` saturation finding was "bump max from 10 to 50." That regressed list endpoints — Postgres became CPU-bound at 50 concurrent multi-query handlers. The fix to `max=20` came from me reading the autocannon retry results and asking why latency *got worse*, not from Claude noticing. Pattern: AI is good at applying a known mitigation; it's less good at noticing that the mitigation made things worse.

2. **Cosmetic vs. correctness.** Claude initially proposed a single-token fix for the contrast finding (`accent: '#005ea2'` → `'#4a90e2'`). That would have broken white-on-accent buttons (3.29:1 fail). The two-token solution (`accent` for backgrounds, `accent-bright` for text-on-dark) only emerged after I pushed back. Pattern: AI defaults to the smallest diff, sometimes at the cost of correctness elsewhere.

3. **Windows-path gotchas.** Multiple sessions hit the same issue (`/tmp` doesn't exist for Node on Windows, `npx.ps1` blocked by execution policy, tsx wrapper script fails when invoked through `node`). Each was solved in ~5 minutes but adds up. Claude doesn't proactively check for Windows compatibility unless prompted. Pattern: cross-platform code paths still need explicit "we're on Windows" context.

### What I'd carry forward

- **One long Claude-Code session per category** beats multiple short ones because the 1M context window preserves the diagnostic chain (audit finding → root cause → fix candidate → verification).
- **Subagents for measurement, main session for synthesis.** Measurement work is parallelizable and bounded; synthesis (writing improvement docs, deciding tradeoffs) belongs in the main session where the full context lives.
- **Force the AI to commit dated artifacts.** Whenever I let Claude track "current state" only in conversation, the state drifted. The fix was committing every diagnostic output to `shipshape/audit/raw/` so we could re-anchor. Memory/conversation state ≠ ground truth — files are.
- **Pre-commit hooks are AI safety nets.** The `comply opensource` and `check-empty-tests.sh` hooks caught two cases where Claude proposed a change that would have failed CI. They paid for themselves several times over. The one that *was* buggy (`check-empty-tests.sh`'s brace-tracking) I fixed and documented as a Cat-6 finding rather than bypassing — that's the right move under CLAUDE.md's "no `--no-verify`" rule.

### Bottom line

For *codebase comprehension specifically*, AI was a clear force multiplier — closer to a 3-5× speed-up than a 2× one, with the largest gains in the read-and-summarize phase and the smallest gains in correctness-judgment edge cases. The collaboration worked best when I treated Claude as a fast, tireless junior who needs explicit "we're on Windows" / "pool tuning is non-monotonic" / "make sure the new accent token doesn't break the old call sites" context, rather than as an oracle.
