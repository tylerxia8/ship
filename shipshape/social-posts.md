# ShipShape — Social Post Drafts

Three drafts each for X and LinkedIn. Pick one or remix. All tag @GauntletAI.

---

## X (Twitter) — choose one

### Draft A (concrete numbers, dev audience)

> 6 days inside a U.S. Treasury codebase (60k LOC TS, Express + React + Postgres). Audited 7 categories, shipped 7 measured fixes.
>
> Headlines:
> • `/api/auth/me` P99: 1575ms → 73ms (−95%)
> • Initial bundle: 589 KB gz → 219 KB gz (−63%)
> • 46 a11y contrast violations → 0
> • my-work flow: 4 queries → 2
>
> Biggest lesson: the audit *itself* found a bigger win than any single fix — `web/tsconfig.json` didn't extend the strict root config, hiding 102 real undefined-access bugs.
>
> Diagnosis before treatment. Always.
>
> @GauntletAI #ShipShape

### Draft B (one big finding, narrative)

> Auditing a U.S. Treasury app last week. The README had a "WCAG 2.1 AA Compliant" badge.
>
> Ran `@axe-core/playwright` against 12 routes.
>
> 46 color-contrast violations across 5 routes. The badge was wrong.
>
> Three root causes: a brand-color token doing double duty as background + text, alpha-modifier opacity miscalculation, and one `opacity-40` wrapper.
>
> Fixed all 46. Lighthouse 96 → 100 on the lowest-scoring pages.
>
> Lesson: badges expire. Measure. @GauntletAI

### Draft C (process / philosophy, short)

> Just shipped a 7-category audit + improvement project on a 60k-line gov codebase.
>
> One rule kept me out of trouble: every fix lives on its own branch off the audit base. `git diff audit category-N` shows exactly one change set.
>
> No `--no-verify`. When the pre-commit hook itself was buggy, I fixed the hook, not bypassed it.
>
> Discipline is a feature.
>
> @GauntletAI #ShipShape

---

## LinkedIn — choose one

### Draft A (full narrative, ~250 words — best for LinkedIn audience)

I just wrapped a six-day audit + improvement sprint on a U.S. Treasury open-source codebase called Ship — about 60,000 lines of TypeScript across an Express API, a React/Vite frontend, and Postgres.

The brief was unusual: produce a written audit report with baseline measurements across seven categories *before* touching any code. Diagnosis before treatment. Then ship measurable improvements, one branch per category, with reproducible before/after numbers.

Some headline results:

• **API latency:** `/api/auth/me` P99 dropped from 1,575 ms to 73 ms at 50 concurrent connections (−95%). The cause wasn't query speed — it was a pg connection pool sized at `max=10` that queued 40 of every 50 requests.

• **Initial bundle size:** 589 KB gz → 219 KB gz (−63%). Three lazy-loads (emoji-picker, highlight.js, diff-match-patch) on routes that don't need them.

• **Accessibility:** 46 color-contrast violations across five routes — directly contradicting the README's "WCAG 2.1 AA Compliant" badge. Cleared all 46.

The deepest lesson wasn't any single fix — it was that **the audit phase found more value than the fix phase.** Reading the four `tsconfig.json` files in parallel surfaced that `web/tsconfig.json` didn't extend the strict root config, silently hiding 102 real undefined-access bugs. No tool flagged this; it took looking at the inheritance chain.

I wrote up the three patterns I'd carry to future projects in a separate discoveries doc — tree invariants in the DB, not the app; conditional CSRF middleware as a structural separation of concerns; depth-bounded recursion in PL/pgSQL.

Full submission, branches, and raw measurement output: <link to fork>

Thanks @GauntletAI for the structure — the "audit before fix" hard gate forced better thinking than I would have done left to my own devices.

#ShipShape #Engineering #CodeAudit #Accessibility

### Draft B (shorter — ~120 words)

Six days. One U.S. Treasury codebase. Seven measured improvements.

The brief required a full written audit — methodology, baselines, severities, raw data — before any fix. That structure changed how I worked. Half the value came from the diagnosis: reading four `tsconfig.json` files in parallel surfaced 102 hidden undefined-access bugs that strict mode would have caught if `web` had inherited from the root config.

Headlines after the fixes landed:
• API P99: 1575 ms → 73 ms (−95%)
• Initial JS bundle: 589 KB → 219 KB gz (−63%)
• A11y contrast violations: 46 → 0

Every category on its own branch off the audit base. No `--no-verify`. Reproducible commands in every doc.

Diagnosis before treatment. Always.

Full write-up + branches: <link>
@GauntletAI #ShipShape

### Draft C (lesson-focused — ~150 words, no specific numbers in the lede)

Counterintuitive thing I learned doing a 7-category audit of a 60k-line government codebase last week:

**The most valuable improvements weren't the ones the brief told me to look for.**

The brief listed seven categories — type safety, bundle size, API perf, DB queries, test coverage, runtime errors, accessibility. Each had a target ("−20% P95 on two endpoints", "+10 Lighthouse points", etc.).

But the single biggest finding wasn't on any target list. It was a one-line `tsconfig.json` inheritance gap — the web package didn't extend the strict root config, silently hiding 102 real undefined-access bugs.

No automated tool surfaced this. It took reading all four tsconfig files in parallel and noticing the diff.

Lesson: targets are floors, not ceilings. The audit phase exists so you can *find what the targets missed.*

Full submission + branches: <link>
@GauntletAI #ShipShape #CodeAudit

---

## Posting checklist

- [ ] Replace `<link>` placeholders with the actual fork URL.
- [ ] X version: ensure under 280 chars per tweet; thread if longer.
- [ ] LinkedIn: post during weekday business hours (US Eastern 8–10 AM is highest reach).
- [ ] Both platforms: tag @GauntletAI (or `@gauntlet_ai` on X depending on handle — verify before posting).
- [ ] Consider attaching one image: a side-by-side Lighthouse score screenshot, or the autocannon before/after compare. Either gives a visual scroll-stopper. Lighthouse 96→100 is the most legible at thumbnail size.
- [ ] If posting LinkedIn Draft A or B, you can add the fork's `shipshape/SUBMISSION.md` link in the comments rather than the body — LinkedIn deprioritises posts with external links in the body.

---

## What NOT to do

- Don't post until the deployed app is live, so the link in the post actually works.
- Don't overclaim. Use "−95%" not "100× faster" — the latter is technically true (1575/73 ≈ 21×) but invites pushback.
- Don't post the AI cost number. It's a deliverable for the brief, not a social-media artifact.
- Don't tag the U.S. Treasury account directly. The fork is your work, not an official statement.
