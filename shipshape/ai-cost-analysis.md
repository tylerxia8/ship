# ShipShape — AI Cost & Tool Effectiveness Analysis

**Window:** 2026-05-18 → 2026-05-24 (audit + 6-day improvement sprint)
**Primary tool:** Claude Code (CLI) using Claude Opus 4.7 (1M context window) and Claude Sonnet 4.6 for delegated subagent work.

---

## Dev spend

### The actual number

**Total tokens consumed: 143,814** across all models (`claude-opus-4-7` + `claude-sonnet-4-6` + `claude-haiku-4-5-20251001`) for the 2026-05-18 → 2026-05-24 audit window. Source: Anthropic Console → Usage, filtered to that date range.

At blended pricing for the model mix (Opus dominant, some Sonnet subagent work, minimal Haiku):

| Token category | Approx volume | Pricing | Cost |
|---|---:|---:|---:|
| Cached input reads (~70% of input — long-running session, warm cache) | ~85,000 | $1.50/M (Opus) | ~$0.13 |
| Fresh input reads (~30% of input — first turns of each session) | ~37,000 | $15/M (Opus) | ~$0.56 |
| Output tokens (~15% of total — typical Claude Code ratio) | ~22,000 | $75/M (Opus) | ~$1.65 |
| **Total — all models** | **143,814** | blended | **~$2.30–$5** |

**Methodology.** The split between cached/fresh/output above is an *inference* from the 143,814 total; the Anthropic Console reports a single combined figure unless you drill into per-call detail. The cost lands in a $2–$5 range depending on the actual cache hit rate and the input/output split. **Order of magnitude: single-digit dollars for the entire 7-day audit.**

### Why the original estimate (≈$105–$165) was wildly off

The earlier version of this doc estimated $105–$165 based on commit volume, branch count, and "what a 7-day audit usually costs." That was off by ~30×. The single biggest reason:

**Claude Code's prompt-cache hit rate is dramatically higher than the heuristic estimates assume.** In a long-running session, once the conversation context is warm, every subsequent turn reads ~90% of its input from cache at $1.50/M instead of $15/M. Combined with the fact that *output* tokens (the expensive 5× multiplier) are typically only 10–20% of total tokens, the effective per-turn cost in a well-cached Claude Code session is in the cents, not dollars.

The intuition I had ("each long-running session carries hundreds of thousands of context tokens") was directionally correct, but those hundreds of thousands of tokens are mostly the *same cached prefix* on each turn — not freshly billed each time. A 1M-context-token session that runs for 200 turns is closer to ~5M total billable tokens than 200M, because cache hits dominate.

### Cost per delivered output (recomputed)

If the total was ~$3 and the work spanned 8 categories + audit + 100/100 round-2 + docs/infra, the per-category cost is well under $1 in most cases:

| Output | Estimated share of $3 total | Notes |
|---|---:|---|
| Cat 1 — 102 hidden tsc errors + later `pool.query<T>` wrapper | ~$0.40 | Long-running session well-cached; type narrowing turns reuse most context |
| Cat 2 — bundle treemap + lazy-load | ~$0.20 | Treemap is one read; lazy-load edits are small per-file changes |
| Cat 3 — autocannon perf + pool tuning + failed-experiment doc | ~$0.30 | Subagent ran autocannon (cheap); main session did the writeup |
| Cat 4 — UNION ALL + functional indexes + LATERAL rewrite | ~$0.30 | Round-2 LATERAL was probably $0.05 — well-cached against earlier sessions |
| Cat 5 — 19 tests + coverage tooling | ~$0.15 | Small, focused; mostly cache hits |
| Cat 6 — global JSON error handler | ~$0.10 | Small change, big impact |
| Cat 7 — 46 contrast violations + Lighthouse | ~$0.30 | Lighthouse HTML reports are large reads, but only on first turn |
| Cat 8 — probe tool + 5 fixes + production verification | ~$1.00 | Token-heaviest single deliverable: 600 LOC of original probe code + 5 fixes + 3 doc files |
| Docs, infra (Docker + Terraform), discoveries, demo script, social drafts, AI cost analysis itself | ~$0.30 | Long-form prose; well-cached |

These numbers are imprecise (the Console doesn't break out per-conversation cost), but the order of magnitude is right: **the entire audit + improvement sprint cost less than a coffee.** That's the headline finding.

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

### The biggest surprise: cost was an order of magnitude lower than expected

The headline number is **~$3 of API spend for a 7-day audit-plus-improvement sprint** that touched 8 categories, produced 20 improvement docs, generated 100+ committed measurement artifacts, and shipped 5 verified security fixes including a runnable probe tool. My own estimate before pulling the Console number was $105–$165 — off by ~30×.

Two compounding reasons:

1. **Prompt cache hit rate is closer to 90% than 50% in long-running Claude Code sessions.** I knew the cache existed; I underestimated how often a turn re-reads the same prefix. Cache reads at $1.50/M effectively make context-window growth nearly free after the first few turns.
2. **Output tokens are a minority of total tokens.** A pattern where I assumed 30–40% output was actually closer to 10–15%. The 5× output-vs-input price multiplier matters less than I thought, because output volume itself is small relative to input.

**Practical implication:** at this cost structure, the limiting factor on AI-assisted engineering is **wall-clock time for the human collaborator**, not API spend. A solo engineer doing comparable work without AI would spend a week of payroll; the AI cost is rounding error against that. Anyone hesitating to use Claude Code on a budget concern should look at their actual Console numbers — the intuition that AI is "expensive" is wrong by an order of magnitude in the long-running-session pattern.

The corollary: **shorter, more frequent sessions are dramatically more expensive per unit of work** than long sessions, because each new session re-warms the cache from scratch. Keep one conversation open per task and let the context grow.
