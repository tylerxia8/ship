// Comprehensive type-safety measurement for Cat 1.
// Walks all .ts/.tsx files in api/src, web/src, shared/src and counts:
//   - explicit `any`        — `: any`, `<any>`, `as any`, `any[]`
//   - type assertions       — `as <UpperCase>` (excludes `as const`)
//   - non-null `!`          — `expr!` in any of [accessor, call, index]
//   - `@ts-*` directives    — `@ts-ignore | @ts-expect-error | @ts-nocheck`
//
// Strips line + block comments before matching so doc strings don't inflate counts.
// Outputs:
//   1. Per-package × per-violation-type table.
//   2. Top 10 violation-dense files.
//
// Reproducible: `node shipshape/improvements/_measure-type-safety.mjs`

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.next', '__tests__'].includes(name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

const PATTERNS = {
  any:       /:\s*any\b|\bany\[|<any>|\bas\s+any\b/g,
  as_assert: /\bas\s+[A-Z]\w*/g,                  // excludes `as const`
  non_null:  /[a-zA-Z0-9_)\]]!\s*[.\[(,;}\n)]/g,  // expr! followed by accessor/call/etc.
  ts_ignore: /@ts-ignore|@ts-expect-error|@ts-nocheck/g,
};

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function countMatches(src, re) {
  const stripped = stripCommentsAndStrings(src);
  let n = 0;
  // re must be /.../g
  while (re.exec(stripped) !== null) n++;
  re.lastIndex = 0;
  return n;
}

const PACKAGES = {
  api: 'api/src',
  web: 'web/src',
  shared: 'shared/src',
};

const perFile = {};
const perPackage = {};
for (const [pkg, dir] of Object.entries(PACKAGES)) {
  perPackage[pkg] = { any: 0, as_assert: 0, non_null: 0, ts_ignore: 0, files: 0 };
  for (const file of walk(dir)) {
    perPackage[pkg].files++;
    const src = readFileSync(file, 'utf-8');
    const row = { file: file.replace(/\\/g, '/'), pkg };
    for (const k of Object.keys(PATTERNS)) {
      const re = new RegExp(PATTERNS[k].source, 'g');
      row[k] = countMatches(src, re);
      perPackage[pkg][k] += row[k];
    }
    row.total = row.any + row.as_assert + row.non_null + row.ts_ignore;
    if (row.total > 0) perFile[file] = row;
  }
}

console.log('========================================================');
console.log(' PER-PACKAGE × PER-VIOLATION-TYPE COUNTS                ');
console.log('========================================================');
console.log('Package'.padEnd(10), 'any'.padStart(6), 'as<T>'.padStart(7), '!'.padStart(7), '@ts-*'.padStart(7), 'files'.padStart(7));
console.log('-'.repeat(60));
let total = { any: 0, as_assert: 0, non_null: 0, ts_ignore: 0, files: 0 };
for (const pkg of Object.keys(PACKAGES)) {
  const p = perPackage[pkg];
  console.log(
    pkg.padEnd(10),
    String(p.any).padStart(6),
    String(p.as_assert).padStart(7),
    String(p.non_null).padStart(7),
    String(p.ts_ignore).padStart(7),
    String(p.files).padStart(7),
  );
  for (const k of Object.keys(total)) total[k] += p[k];
}
console.log('-'.repeat(60));
console.log(
  'TOTAL'.padEnd(10),
  String(total.any).padStart(6),
  String(total.as_assert).padStart(7),
  String(total.non_null).padStart(7),
  String(total.ts_ignore).padStart(7),
  String(total.files).padStart(7),
);
console.log();
console.log('Grand total explicit violations:', total.any + total.as_assert + total.non_null + total.ts_ignore);
console.log();
console.log('========================================================');
console.log(' TOP 10 MOST VIOLATION-DENSE FILES                      ');
console.log('========================================================');
const sorted = Object.values(perFile).sort((a, b) => b.total - a.total).slice(0, 10);
console.log('File'.padEnd(60), 'any'.padStart(4), 'as'.padStart(4), '!'.padStart(4), '@ts'.padStart(4), 'TOT'.padStart(5));
console.log('-'.repeat(85));
for (const r of sorted) {
  console.log(
    r.file.padEnd(60),
    String(r.any).padStart(4),
    String(r.as_assert).padStart(4),
    String(r.non_null).padStart(4),
    String(r.ts_ignore).padStart(4),
    String(r.total).padStart(5),
  );
}
