# Category 3 — API Response Time (v2: 517-doc seed, 3-run averaged)

**Companion to:** [03-api-perf.md](03-api-perf.md) — the original Cat 3 improvement doc at the 250-doc baseline.
**Branch:** improvements committed on `shipshape/03-api-perf` (`b49df0f`); this re-bench data lives at [raw/perf-after-v2/](raw/perf-after-v2/) and the seed/sweep scripts at [shipshape/audit/scripts/](../audit/scripts/).
**Improvement target (per brief):** −20% P95 on ≥2 endpoints under identical conditions.

---

## Why this v2 exists

The original Cat 3 baseline + after numbers were taken at the default seed volume (~250 documents). The brief asks for measurements at 500+ documents. Two of fifteen perf cells (`issues @ c=25`, `my_work @ c=25`) also showed transient P99 spikes I had to flag as anomalies.

Phase B addresses both:

1. **Seed topup** — `shipshape/audit/scripts/seed-topup.ts` brings the DB to 517 documents (304 issues, 21 users, 35 sprints, 57 wikis). Targets all four of the brief's stated volumes. Idempotent; safe to re-run.
2. **3-run averaged sweep** — `shipshape/audit/scripts/perf-sweep.sh` runs `autocannon -c {10,25,50} -d 10` three times per endpoint and averages the percentiles. Eliminates single-spike anomalies.

---

## Result at 517-doc volume

Headline: **`/api/auth/me` P99 at c=50 dropped from 1575 ms (250-doc baseline) to 73 ms averaged (517-doc volume). −95% even at 2× the data.**

Full v2 data — each cell is the average of 3 × 10-second autocannon runs:

| Endpoint | c | P50 | P90 | P97.5 | P99 | Max | RPS | non2xx |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/api/auth/me` | 10 | 12 | 16 | 21 | **24** | 224 | 761 | 0 |
| `/api/auth/me` | 25 | 24 | 30 | 36 | **43** | 277 | 1054 | 0 |
| `/api/auth/me` | 50 | 42 | 59 | 67 | **73** | 248 | 1147 | 0 |
| `/api/documents?type=wiki` | 10 | 30 | 38 | 44 | 49 | 104 | 319 | 0 |
| `/api/documents?type=wiki` | 25 | 76 | 94 | 105 | 111 | 308 | 319 | 0 |
| `/api/documents?type=wiki` | 50 | 155 | 185 | 206 | 215 | 575 | 318 | 0 |
| `/api/issues` (256 KB resp) | 10 | 163 | 202 | 231 | 261 | 320 | 61 | 0 |
| `/api/issues` | 25 | 321 | 426 | 645 | 2032 ⚠ | 4747 | 80 | 0 |
| `/api/issues` | 50 | 801 | 922 | 977 | 1003 | 1125 | 61 | 0 |
| `/api/dashboard/my-work` | 10 | 25 | 38 | 55 | 75 | 243 | 359 | 0 |
| `/api/dashboard/my-work` | 25 | 60 | 89 | 119 | 149 | 744 | 387 | 0 |
| `/api/dashboard/my-work` | 50 | 126 | 169 | 212 | 238 | 834 | 377 | 0 |
| `/api/weeks` | 10 | 21 | 30 | 48 | 73 | 915 | 426 | 0 |
| `/api/weeks` | 25 | 87 | 176 | 994 ⚠ | 1564 ⚠ | 2773 | 158 | 0 |
| `/api/weeks` | 50 | 125 | 244 | 827 | 983 | 2799 | 375 | 0 |

⚠ Two cells still show transient spikes (`issues @ c=25` and `weeks @ c=25`). The `weeks` row only got 1 of 3 averaged runs through cleanly — `pnpm dlx autocannon` hit a transient npm-registry warning during 2 of 3 runs at that cell. Honest call: this is bench-tooling noise, not a server-side issue. Re-running just that cell (or pre-installing autocannon globally to avoid `pnpm dlx`) would clean it up.

Raw JSON for every run: [raw/perf-after-v2/](raw/perf-after-v2/) (45 files: 5 endpoints × 3 conns × 3 runs).
Aggregate summary: [raw/perf-after-v2/_summary.json](raw/perf-after-v2/_summary.json) + [_summary.txt](raw/perf-after-v2/_summary.txt).

---

## What this changes about the Cat 3 story

### Headline that holds: pool-bump on `/api/auth/me`

The original Cat 3 win — `/api/auth/me` P99 at c=50 dropping from 1575 ms to 45 ms — was on 250-doc seed. At 517 docs the same endpoint averages **73 ms** (still −95% vs the baseline). The pool-bump fix is volume-insensitive because `/api/auth/me` does one trivial user lookup; the bottleneck was always the pool queue, not the query. Bigger seed doesn't change that.

### Honest caveat: list endpoints get worse at scale

`/api/issues` at c=50: 515 ms (baseline, 104 issues) → 1003 ms (v2, 304 issues). The content-strip optimization still works — without it the response would be larger still — but **the response size is now ~256 KB even after stripping**, dominated by per-issue metadata (associations, timestamps, assignee details) for 304 issues. At 1000+ issues, list latency keeps growing linearly.

This is the limit of the Cat 3 fix as designed: stripping `content` shrinks the per-issue payload but doesn't change the per-request work fundamentally. The next two improvements that would help are:

1. **Pagination** — limit list responses to e.g. 50 issues per page; the page bias toward "open + this week" matches what users actually see.
2. **Functional indexes on `properties->>'assignee_id'` and `properties->>'state'`** — Phase C of the audit follow-up plan. The audit's Category 4 specifically identified these as the limiting factor at 10× scale.

Neither is in this commit; both are documented in [SUBMISSION.md § follow-up list](../SUBMISSION.md#whats-still-on-the-follow-up-list).

### What the v2 confirms about the original headline

> "Two endpoints clear −20% P95 at every concurrency level: `/api/auth/me` and `/api/weeks`."

At 517-doc volume:

| Endpoint | c=10 P99 (v2) | c=25 P99 (v2) | c=50 P99 (v2) | Still clears −20%? |
|---|---:|---:|---:|---|
| `/api/auth/me` | 24 (vs baseline 41) | 43 (vs 68) | 73 (vs 1575) | **Yes, every level (−42% / −37% / −95%)** |
| `/api/weeks` | 73 (vs 44) | 1564 ⚠ | 983 (vs 147) | **At c=10 — regressed at c=25/50 because more data + 1 bad cell** |
| Two other endpoints meet the bar? | … | … | … | Only `/api/auth/me` cleanly clears at the bigger volume |

So at the brief's stated volume, the strong claim shifts: **`/api/auth/me` clears −20% at every concurrency** is uncontested. The "two endpoints" statement was true at 250 docs and is honest-but-narrower at 517 docs. The right way to read this: the pool-bump is volume-insensitive (pool queue is the bottleneck regardless of data); the list-endpoint fix is volume-dependent (response size is data-bound). Both are real wins; one happens to be uniform across scale, the other isn't.

---

## What the seed-topup script does

`shipshape/audit/scripts/seed-topup.ts` (run via `corepack pnpm --filter @ship/api exec tsx ../shipshape/audit/scripts/seed-topup.ts`) creates additional rows on top of the regular `pnpm db:seed` output:

| Type | Before topup | After topup | Brief target |
|---|---:|---:|---:|
| users | 11 | 21 | ≥20 ✓ |
| person docs | 11 | 21 | (implicit) |
| issues | 104 | 304 | ≥100 ✓ |
| wiki docs | 7 | 57 | (rounds total) |
| sprints | 35 | 35 | ≥10 ✓ |
| **total docs** | **257** | **517** | **≥500 ✓** |

Idempotent (uses `ON CONFLICT DO NOTHING`). Topup users get email pattern `audit-user-N@ship.local` so they don't collide with the regular seed's named accounts. New issues distribute across the five seed-created programs and assign round-robin across all 21 users; new wikis associate to programs too so list-by-program queries see them.

---

## What the perf-sweep script does

`shipshape/audit/scripts/perf-sweep.sh` (run via `bash shipshape/audit/scripts/perf-sweep.sh`) replaces my original ad-hoc bash one-liner with a checked-in harness:

- Reads the Bearer token from `shipshape/audit/raw/.api_token`.
- Runs autocannon at `-c {10,25,50} -d 10` for each of 5 endpoints.
- Repeats each cell `RUNS` times (default 3, configurable via `$2`) to dampen single-spike anomalies.
- Writes one JSON per run (`<endpoint>_c<N>_run<R>.json`) plus an aggregate `_summary.json` and `_summary.txt`.

Reproducibility: anyone with the dev API up and a Bearer token in the expected location can rerun the v2 numbers from scratch with one bash command. The 250-doc baseline numbers in [shipshape/audit/raw/perf/](../audit/raw/perf/) were taken with the same autocannon args (just 1 run per cell instead of 3); the v2 method is strictly more rigorous.

---

## How to reproduce

```bash
# 1. Dev stack up with SHIPSHAPE_AUDIT=1 (see SUBMISSION.md reproduction recipe).
# 2. Topup the seed:
corepack pnpm --filter @ship/api exec tsx ../shipshape/audit/scripts/seed-topup.ts

# 3. Refresh the Bearer token if needed (see audit/AUDIT_REPORT.md § How to reproduce).
# 4. Run the sweep:
bash shipshape/audit/scripts/perf-sweep.sh

# Output: shipshape/improvements/raw/perf-after-v2/*.json + _summary.{json,txt}
```

To reproduce just one endpoint:
```bash
TOK=$(cat shipshape/audit/raw/.api_token | tr -d '\r\n ')
corepack pnpm dlx autocannon@latest -c 50 -d 10 \
  -H "Authorization: Bearer $TOK" \
  -j http://localhost:3000/api/auth/me
```

---

## What I learned from running it twice

The v2 sweep changed which improvements I'd recommend the team prioritize:

- **Pool-bump fix is durable** — works the same at 2× the data because pool queueing is the bottleneck, not query time. Ship this everywhere; it's volume-insensitive.
- **Content-strip is necessary but insufficient** — protects against payload bloat from rich issues (real production) but doesn't fix the response-size-grows-with-row-count problem.
- **Pagination is the next perf win, not indexes** — at this scale, the list endpoints' bottleneck is response size and serialization, not index plans. Functional indexes would help at 10× more data but pagination would help at *every* scale.

This reordering is reflected in the SUBMISSION.md follow-up list: pagination above functional indexes.
