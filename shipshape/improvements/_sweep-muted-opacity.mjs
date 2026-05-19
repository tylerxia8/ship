// One-shot script for the shipshape/07-accessibility branch.
// Strips the /50 and /60 alpha modifiers from `text-muted` so it renders at
// full 5.1:1 contrast against the dark background. Alpha-multiplied muted
// text fell below WCAG AA in the audit baseline.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const TARGETS = [/text-muted\/50\b/g, /text-muted\/60\b/g];

let files = 0, repl = 0;
for (const f of walk('web/src')) {
  let src = readFileSync(f, 'utf8');
  if (!/text-muted\/(50|60)\b/.test(src)) continue;
  let changed = false;
  for (const re of TARGETS) {
    const m = src.match(re);
    if (m) { src = src.replace(re, 'text-muted'); repl += m.length; changed = true; }
  }
  if (changed) {
    writeFileSync(f, src, 'utf8');
    files++;
    console.log(`  ${f.replace(/\\/g, '/')}`);
  }
}
console.log('---');
console.log(`Files changed: ${files}  Replacements: ${repl}`);
