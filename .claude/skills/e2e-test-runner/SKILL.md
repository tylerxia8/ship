# E2E Test Runner

Run Playwright E2E tests without crashing Claude Code via stdout flood. Wraps `pnpm test:e2e` with background execution, live progress streaming from the JSONL reporter Ship already configures, and compact per-failure reporting.

## Trigger

- User types `/e2e-test-runner` (with optional Playwright args)
- User asks to run E2E tests, verify a branch with Playwright, or re-run failed E2E tests
- After non-trivial backend or frontend changes that need end-to-end verification

**Never run `pnpm test:e2e` directly without this skill.** The default reporter prints ~10 lines per test × 600+ tests; the output payload alone blows past the context budget. Ship's [e2e/progress-reporter.ts](../../../e2e/progress-reporter.ts) writes progress to disk specifically so this skill can read it instead.

## Files the reporter writes (already exist, no setup needed)

| Path | Format | Use |
|---|---|---|
| `test-results/summary.json` | `{total, passed, failed, skipped, pending, ts}` | Live counters — atomically updated on every test end |
| `test-results/progress.jsonl` | One `{test, title, status, ts, duration?}` per line | Append-only timeline; tail for live status |
| `test-results/errors/{spec}__{title}.log` | Plain text error + stack | One file per failure — read these instead of stdout |

Treat these as the source of truth. The bg task's stdout file is mostly useful for the final "N passed (Xs)" line.

## Workflow

### 1. Preflight

```bash
docker info >/dev/null 2>&1 || { echo "Docker not running — testcontainers need it"; exit 1; }
ls ~/Library/Caches/ms-playwright/chromium_headless_shell-* >/dev/null 2>&1 \
  || pnpm exec playwright install chromium
rm -rf test-results/progress.jsonl test-results/summary.json test-results/errors
mkdir -p test-results
```

Skip the install check if you know it's fresh — but the missing-browser failure mode is silent in the JSON summary (every test "fails" with the same browser-launch error) and easy to misread as a code regression. The 1s check is worth it.

### 2. Run in background

Use `Bash` with `run_in_background: true`. Pass user args through verbatim:

```bash
pnpm test:e2e <user args>
```

Tight memory? Add `PLAYWRIGHT_WORKERS=2` (or lower) — the config calculates workers from free RAM, but the calculation runs once at startup. If `free` < 2GB after other processes are up, the auto count is too high. The first symptom is the test runner printing `⚠️  Low memory (0.1GB). Consider reducing workers.` in the bg output.

### 3. Arm a Monitor on summary.json

```bash
prev=""
elapsed=0
while [ $elapsed -lt 1700 ]; do
  if [ -f test-results/summary.json ]; then
    cur=$(jq -c '{p:.passed,f:.failed,s:.skipped,r:.pending,t:.total}' test-results/summary.json 2>/dev/null)
    if [ -n "$cur" ] && [ "$cur" != "$prev" ]; then
      echo "$(date +%H:%M:%S) $cur"
      prev="$cur"
      pending=$(jq -r '.pending' test-results/summary.json 2>/dev/null)
      total=$(jq -r '.total' test-results/summary.json 2>/dev/null)
      if [ "$pending" = "0" ] && [ -n "$total" ] && [ "$total" != "0" ]; then
        echo "ALL_DONE"
        break
      fi
    fi
  fi
  sleep 10
  elapsed=$((elapsed + 10))
done
```

Set `timeout_ms` to ~2× expected run time (1,800,000 ms = 30 min covers a full suite locally; use 600,000 ms for a 3-spec subset). The loop emits one event per counter change and exits on `pending == 0`.

Use Monitor for the live stream, not Bash polling — Bash with sleep chains is blocked by the harness, and the Monitor's per-event notifications let the user follow along without you re-rendering.

### 4. Wait for the bg notification

The harness notifies when the bg task exits. **That is the authoritative "done" signal — not the Monitor's `ALL_DONE`.** Playwright's reporters can still be writing files after the last test ends; the Monitor may exit on `pending=0` while the html report is still being generated.

Do not poll. Do not sleep. Let the notification fire.

### 5. Report results

On bg completion, read `summary.json` for the final counts. Then:

**If `failed == 0`:** report `N/N passed in <duration>`, done. Pull duration from the last line of the bg output file (Playwright prints `38 passed (38.3s)` at the end).

**If `failed > 0`:** list the failures. Read filenames from `test-results/errors/`:

```bash
ls test-results/errors/
```

For each error log: print the test file + title + first 5 lines of the log (the error message — usually enough to identify root cause). Don't dump full stacks; the user can `cat test-results/errors/<file>` on demand.

**Look for shared root causes.** If every failure starts with the same error string (missing browser binary, DB connection refused, port in use), grep the first line of every log — that's one fix, not N fixes. Surface it as such: "All 38 failures share the same root cause: `<line>`." Otherwise the user reads 38 identical paragraphs.

```bash
head -1 test-results/errors/*.log 2>/dev/null | grep -v '^==>' | sort -u | head -5
```

If `sort -u` collapses to one line and the count matches `failed`, that's a shared-cause situation. Report it that way.

### 6. Iterate

After failures, the user can re-invoke with `--last-failed` — Playwright tracks which specs failed in `.last-run.json` and re-runs only those:

```
/e2e-test-runner --last-failed
```

Same workflow, no special handling needed. The skill just passes the flag through.

## Common pitfalls

- **Docker not running.** Testcontainers will hang on the first worker setup; the bg task eventually times out without writing a single line to summary.json. Always preflight Docker.
- **Stale `.last-run.json` from a different worktree.** Playwright stores it under `test-results/` — if you ran tests on master last and switched to a feature branch, `--last-failed` may re-run irrelevant specs. Delete it explicitly if the spec list looks wrong.
- **Worktree without `pnpm install`.** Worktrees don't share `node_modules`; if `@playwright/test` isn't installed, the runner fails before the reporter is loaded — no summary.json gets written. Run [`/ship-worktree-preflight`](../ship-worktree-preflight/SKILL.md) first if unsure.
- **Reading stdout instead of summary.json.** The bg output file contains the line reporter's progress markers (`[N/M]`), which is fine for verification, but the real source of truth is `summary.json` (atomic, structured, fast). Prefer it.
- **Forgetting to reset between runs.** Without the `rm -rf test-results/{progress.jsonl,summary.json,errors}` step in Preflight, the Monitor's counter check (`pending == 0`) may trip immediately on the *previous* run's leftover summary, and the failure log dump will mix old and new errors.

## What this skill deliberately doesn't do

- **It doesn't auto-bisect failures.** If 5 specs failed, you get 5 error summaries; deciding which to fix first is the user's call.
- **It doesn't filter retries.** Playwright config has `retries: 1` locally; if a test fails once and passes on retry, the summary reports it as `passed`. Look at the bg output for `(retries)` lines if flake matters.
- **It doesn't manage Docker.** If Docker is down, the skill exits with a clear message — it doesn't try to start it.
- **It doesn't trigger `pnpm dev`.** Playwright uses its own testcontainer-backed servers per worker. Running `pnpm dev` alongside is fine but unnecessary.
