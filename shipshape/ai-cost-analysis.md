# ShipShape — AI Cost & Tool Effectiveness Analysis

**Window:** 2026-05-18 → 2026-05-24 (audit + 6-day improvement sprint)
**Primary tool:** Claude Code (CLI) using Claude Opus 4.7 (1M context window) and Claude Sonnet 4.6 for delegated subagent work.

---

## Dev spend

| Bucket | Estimate | Source |
|---|---:|---|
| Claude Code (Opus 4.7, 1M ctx) — primary driver | **$ _<insert from Anthropic Console_> ** | Anthropic Console → Usage tab → filter to this date range. The single largest line item; expect this to dominate. |
| Claude Code subagents (Sonnet 4.6) — Explore, Plan, parallel general-purpose agents | $ _<insert>_ | Same dashboard. Subagent calls are billed separately from main session. |
| Claude.ai web (chat) — none used this project | $0 | I deliberately kept everything in CLI for tool/context continuity. |
| ChatGPT / other LLM | $0 | Not used. |
| **Total AI spend** | **$ _<sum>_** | |

To compute your actual figure: Anthropic Console → API Keys & Usage → Usage → filter by date range `2026-05-18` to `2026-05-24` and by model (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). Subagent token spend is broken out per model.

A reasonable rough order of magnitude for a 6-day intensive audit-plus-fix sprint with extensive 1M-context conversations and ~20 parallel subagent tasks is **$60–$150** for solo work — the actual figure depends heavily on how many cache hits the conversation had (the prompt cache materially cuts cost on long sessions).

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
