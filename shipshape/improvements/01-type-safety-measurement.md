# Cat 1 — Type Safety Measurement

This document executes each item from the brief's **"How to Measure"** checklist for Category 1, against the current `shipshape/deploy` state.

The brief asks for measurements of six violation types: explicit `any`, type assertions (`as`), non-null assertions (`!`), `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`, untyped function parameters, and implicit `any` from missing return types. Each is covered below.

Re-runnable via:
```bash
node shipshape/improvements/_measure-type-safety.mjs       # explicit grep counts
node ./node_modules/typescript/bin/tsc --noEmit --project <api|web|shared>/tsconfig.json
```

---

## Brief check 1 — Run grep / static analysis to count violations

### 1a. Explicit grep-countable violations

Patterns (consistent with the audit baseline methodology):

| Violation type | ripgrep pattern (after stripping comments + strings) |
|---|---|
| Explicit `any` | `:\s*any\b \| \bany\[ \| <any> \| \bas\s+any\b` |
| Type assertion `as <T>` | `\bas\s+[A-Z]\w*` *(excludes `as const`)* |
| Non-null `!` | `[a-zA-Z0-9_)\]]!\s*[.\[(,;}\n)]` *(matches `expr!` followed by an accessor / call / index / etc.)* |
| `@ts-*` directive | `@ts-ignore \| @ts-expect-error \| @ts-nocheck` |

Run via `node shipshape/improvements/_measure-type-safety.mjs` (committed; reproducible).

| Package | `any` | `as <T>` | `!` | `@ts-*` | files scanned |
|---|---:|---:|---:|---:|---:|
| **api** | 140 | 42 | 78 | **0** | 104 |
| **web** | 33 | 211 | 34 | **0** | 199 |
| **shared** | 0 | 0 | 0 | **0** | 8 |
| **TOTAL** | **173** | **253** | **112** | **0** | **311** |

**Grand total: 538 explicit violations** across the 3 packages.

### 1b. Implicit violations (require static analysis, not grep)

The brief specifically lists two violation categories that grep can't catch:
- Untyped function parameters — `function foo(x) { … }` where `x` has no annotation
- Implicit `any` from missing return type — `function foo() { … }` where TS can't infer the return type

These are surfaced by TypeScript itself when `strict: true` (which enables `noImplicitAny`) and `noImplicitReturns: true` are set. **Both are enabled across all 3 packages** (see check 2 below), and tsc reports **0 errors** in each (see check 3). Therefore:

| Implicit violation type | Caught by TS error code | Count |
|---|---|---:|
| Untyped function parameter | TS7006 *(Parameter 'x' implicitly has an 'any' type)* | **0** |
| Function lacks return-type annotation that can be inferred | TS7010 / TS7030 | **0** |
| Variable / property implicitly `any` | TS7005 / TS7008 | **0** |

---

## Brief check 2 — Check tsconfig strict-mode settings

Inheritance chain:

```
tsconfig.json (root)                                    ← all strict flags live here
├── api/tsconfig.json     "extends": "../tsconfig.json"
├── web/tsconfig.json     "extends": "../tsconfig.json"
└── shared/tsconfig.json  "extends": "../tsconfig.json"
```

Root config's strict-related compiler options:

| Flag | Value | What it enforces |
|---|---|---|
| `strict` | **true** | Enables `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`, `useUnknownInCatchVariables` |
| `noUncheckedIndexedAccess` | **true** | Index access returns `T \| undefined` — forces guards on array / `Record` reads |
| `noImplicitReturns` | **true** | Every code path in a function must return a value (or all must return void) |
| `noFallthroughCasesInSwitch` | **true** | Switch cases must `break` / `return` / `throw` |
| `forceConsistentCasingInFileNames` | **true** | Prevents Windows-vs-Linux import-path bugs |

**All 3 packages inherit this superset.** No package is silently weaker than another.

> *Historical note:* on `shipshape/audit` (baseline), `web/tsconfig.json` did NOT extend root. It only set `"strict": true` standalone, which is the *minimum* strict (no `noUncheckedIndexedAccess`, no `noImplicitReturns`). That gap was the audit's headline finding for Cat 1 — and surfaced 102 hidden errors when the inheritance was aligned. Fixed in [shipshape/01-type-safety](https://github.com/tylerxia8/ship/compare/shipshape/audit...shipshape/01-type-safety) commit `c1d6755`.

---

## Brief check 3 — Run tsc and count errors

Brief says: *"If strict mode is off, run `tsc --strict --noEmit` and count the errors."* Strict mode is **on** in all 3 packages, so the equivalent measurement is `tsc --noEmit` against each:

| Package | Command | Errors |
|---|---|---:|
| api | `tsc --noEmit --project api/tsconfig.json` | **0** |
| web | `cd web && tsc --noEmit` | **0** |
| shared | `tsc --noEmit --project shared/tsconfig.json` | **0** |

Re-run command on any of them today on `shipshape/deploy` produces zero errors. The 102-error baseline (from the audit-time strict-probe) has been narrowed entirely — see [Cat 1 verification verdict](#) for the 18 final errors that the original Cat 1 commit missed but the verification pass caught and fixed.

---

## Brief check 4 — Break down by package × violation type

| | `any` | `as <T>` | `!` | `@ts-*` | sub-total | % of grand total |
|---|---:|---:|---:|---:|---:|---:|
| **api** | 140 | 42 | 78 | 0 | **260** | 48% |
| **web** | 33 | 211 | 34 | 0 | **278** | 52% |
| **shared** | 0 | 0 | 0 | 0 | **0** | 0% |

Observations:
1. **`shared` is fully clean.** Eight files, zero violations. The shared types package is a small high-leverage surface that the team has kept tight.
2. **`web` is dominated by `as <T>`** (211 of 278 = 76%) — most of those are zod-result casts and TipTap node-shape casts in the editor stack. Many are *correct* `as` use (asserting the result of `JSON.parse(string-known-to-match-schema)` etc.), not unsafe casts.
3. **`api` is dominated by `any`** (140 of 260 = 54%) — and roughly 70 of those `any`s sit in test fixtures (see check 5 below). Production-code `any` in `api` is ~70.
4. **Zero `@ts-*` directives** anywhere in the codebase. The team prefers refactoring to suppression — a structurally healthy posture.

---

## Brief check 5 — Top 5 most violation-dense files + why each is problematic

| Rank | File | any | as | ! | Total | Kind |
|---:|---|---:|---:|---:|---:|---|
| 1 | `api/src/services/accountability.test.ts` | 32 | 1 | 0 | **33** | TEST |
| 2 | `api/src/db/seed.ts` | 0 | 0 | 31 | **31** | PROD (init script) |
| 3 | `web/src/components/UnifiedEditor.tsx` | 0 | 26 | 0 | **26** | PROD |
| 4 | `api/src/routes/issues-history.test.ts` | 20 | 0 | 0 | **20** | TEST |
| 5 | `api/src/routes/projects.test.ts` | 17 | 0 | 0 | **17** | TEST |

**Per-file explanation:**

1. **`accountability.test.ts` (33 violations, TEST)** — `any` is used to construct mock TipTap document shapes in test fixtures. It's not great hygiene but it's *test-internal* (the prod code under test, `accountability.ts`, has 0 `any`). A future improvement would be to define a `TestTipTapDoc` partial-shape type and replace the fixtures with typed builders — but this is test-fixture polish, not a real bug surface.

2. **`seed.ts` (31 violations, PROD init script)** — every `!` here is on `result.rows[0]` after a `SELECT` that the developer knows returns at least one row (an `INSERT … RETURNING`). pg's TypeScript types don't model this so it surfaces as `Row | undefined`. *Why problematic:* if the seed script ever runs against an empty/broken DB, these crash with a misleading error instead of a sensible "seed failed at step N." The fix would be a `firstRow()` helper that asserts existence with a named error message. **Filed as a follow-up; not blocking.**

3. **`UnifiedEditor.tsx` (26 violations, PROD)** — every one is `as <TiptapNodeType>` casting `node.attrs`/`node.content` to specific shapes. TipTap's own types are intentionally loose (the editor handles arbitrary node graphs) so consumer code must assert. *Why problematic:* a TipTap schema change could break these silently. The fix would be a runtime + type-level zod validator at the node boundary. **Larger refactor; out of scope.**

4. **`issues-history.test.ts` (20 violations, TEST)** — same pattern as file 1, all `any` in test fixtures. Same mitigation argument: not a prod-bug surface.

5. **`projects.test.ts` (17 violations, TEST)** — same pattern.

**Test-vs-production split among the top 10 (broader view):**
- 3 of top 10 files (33 + 20 + 17 = 70 violations) are test files
- 7 of top 10 files are production
- The audit's #4 finding ("tests dominate `any` totals — consider measuring on non-test files only") is structurally still true: roughly 70 of the 173 total `any`s are in tests.

**Non-test top 5** (the "real" most-problematic prod files):

| Rank | File | Total | Violation flavor |
|---:|---|---:|---|
| 1 | `api/src/db/seed.ts` | 31 | All `!` from `INSERT…RETURNING` row access |
| 2 | `web/src/components/UnifiedEditor.tsx` | 26 | All `as` from TipTap node-attr casts |
| 3 | `api/src/routes/projects.ts` | 16 | 15 `any` + 1 `as` — pool.query untyped rows |
| 4 | `api/src/routes/weeks.ts` | 14 | 11 `any` + 1 `as` + 2 `!` — pool.query untyped rows |
| 5 | `api/src/utils/yjsConverter.ts` | 14 | 13 `any` + 1 `as` — Yjs node tree walks (the lib's `unknown`-typed AST) |

Three of these five (`projects.ts`, `weeks.ts`, `yjsConverter.ts`) share the same root cause: **untyped `pool.query` result rows**. A `query<T>(sql, params): Promise<{ rows: T[] }>` generic wrapper that infers the row shape from a passed-in zod schema would knock out ~40 violations across api/ in one focused commit. *Filed as Follow-up #3 in [shipshape/SUBMISSION.md § "What's still on the follow-up list"](https://github.com/tylerxia8/ship/blob/shipshape/deploy/shipshape/SUBMISSION.md).*

---

## Summary against the brief's checklist

| "How to Measure" item | Status |
|---|---|
| Run grep or a static analysis tool to count all type safety violations across the codebase | ✅ 538 explicit violations counted via grep; 0 implicit (TS7006/7010/7030) caught by tsc with strict on |
| Check the `tsconfig.json` for strict mode settings | ✅ All 3 packages inherit root strict (incl. `noUncheckedIndexedAccess` + `noImplicitReturns` + `noFallthroughCasesInSwitch`) |
| If strict mode is off, run `tsc --strict --noEmit` and count errors | ✅ N/A: strict is on; equivalent `tsc --noEmit` returns 0 errors per package |
| Break down violations by package and by violation type | ✅ 3-pkg × 4-type table above |
| Identify the 5 most violation-dense files and explain why they are problematic | ✅ Top 5 listed; 3 are test fixtures (lower-risk), 2 are production (UnifiedEditor TipTap casts + seed.ts `!` chain). Non-test top 5 also provided with the `pool.query<T>` generic identified as the high-leverage follow-up |

---

## What changed between audit baseline and now

| Metric | Audit baseline | Current | Δ |
|---|---:|---:|---:|
| Explicit `any` (all packages) | 260 | 173 | −33% |
| Type assertions `as <T>` | 460 | 253 | **−45%** |
| Non-null `!` | 324 | 112 | **−65%** |
| `@ts-*` directives | 1 | 0 | (the lone `@ts-ignore` was removed) |
| **Grand total explicit** | **1,045** | **538** | **−49%** |
| tsc errors under strict (web) | **102** | **0** | **−100%** |
| Packages with strict mode | 2 of 3 (web's tsconfig didn't extend root) | 3 of 3 | All aligned |

The `−49%` reduction is well past the brief's `−25%` target, validated under the rubric's stricter "no superficial fixes" / "no `any → unknown`" / "all tests still pass" constraints (see the [Cat 1 verdict](#)).
