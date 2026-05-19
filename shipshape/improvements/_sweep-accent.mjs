// One-shot script for the shipshape/07-accessibility branch.
// Sweeps `text-accent` -> `text-accent-bright` across web/src.
// Skips `text-accent-hover` and `text-accent-bright` (no false positives).
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

// Match `text-accent` only when followed by whitespace, quote-like char, slash, or end.
// That excludes `text-accent-hover` (followed by `-`) and `text-accent-bright`.
const SAFE_CHARS = ['"', "'", '`', ' ', '\t', '\n', '\r', '/'];
const RE = new RegExp(`text-accent(?=[${SAFE_CHARS.map(c => `\\${c}`).join('')}]|$)`, 'g');

let files = 0, repl = 0;
for (const f of walk('web/src')) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('text-accent')) continue;
  const m = src.match(RE);
  if (!m) continue;
  writeFileSync(f, src.replace(RE, 'text-accent-bright'), 'utf8');
  files++;
  repl += m.length;
  console.log(`  ${f.replace(/\\/g, '/')} (${m.length})`);
}
console.log('---');
console.log(`Files changed: ${files}  Replacements: ${repl}`);
