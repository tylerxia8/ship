// Pass 2 sweep: replace the existing `const userId = req.userId!;` /
// `const workspaceId = req.workspaceId!;` declarations with one
// `const { userId, workspaceId } = authCtx(req);`. This catches the handlers
// that pass 1 skipped (those already had a local declaration).
//
// Strategy is per-file:
//   1. Find consecutive declaration lines like:
//        const userId = req.userId!;
//        const workspaceId = req.workspaceId!;
//      (in either order, possibly with whitespace).
//   2. Replace with: const { userId, workspaceId } = authCtx(req);
//   3. If only one is declared locally, replace that single line with:
//        const { userId } = authCtx(req);  (or workspaceId)
//
// Also ensures the file imports authCtx.

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'api/src/routes/weeks.ts',
  'api/src/routes/issues.ts',
  'api/src/routes/team.ts',
  'api/src/routes/projects.ts',
  'api/src/routes/programs.ts',
  'api/src/routes/standups.ts',
  'api/src/routes/dashboard.ts',
  'api/src/routes/comments.ts',
  'api/src/routes/weekly-plans.ts',
  'api/src/routes/admin.ts',
  'api/src/routes/api-tokens.ts',
  'api/src/routes/iterations.ts',
  'api/src/routes/workspaces.ts',
  'api/src/routes/backlinks.ts',
  'api/src/routes/accountability.ts',
  'api/src/routes/activity.ts',
  'api/src/routes/documents.ts',
  'api/src/routes/search.ts',
];

let totalBangsRemoved = 0;
let totalSitesTouched = 0;

for (const file of FILES) {
  let src;
  try { src = readFileSync(file, 'utf-8'); } catch { continue; }
  const before = src;

  // Match `const userId = req.userId!;` followed (optionally) by
  // `const workspaceId = req.workspaceId!;` on consecutive lines.
  // The reverse order also.
  const patternUidThenWid = /(\s*)const\s+userId\s*=\s*req\.userId!;\s*\n(\s*)const\s+workspaceId\s*=\s*req\.workspaceId!;/g;
  const patternWidThenUid = /(\s*)const\s+workspaceId\s*=\s*req\.workspaceId!;\s*\n(\s*)const\s+userId\s*=\s*req\.userId!;/g;
  const patternUidOnly = /(\s*)const\s+userId\s*=\s*req\.userId!;/g;
  const patternWidOnly = /(\s*)const\s+workspaceId\s*=\s*req\.workspaceId!;/g;

  src = src.replace(patternUidThenWid, (_m, indent1) => {
    totalBangsRemoved += 2; totalSitesTouched++;
    return `${indent1}const { userId, workspaceId } = authCtx(req);`;
  });
  src = src.replace(patternWidThenUid, (_m, indent1) => {
    totalBangsRemoved += 2; totalSitesTouched++;
    return `${indent1}const { userId, workspaceId } = authCtx(req);`;
  });
  // Remaining single-line declarations after the paired pass
  src = src.replace(patternUidOnly, (_m, indent) => {
    totalBangsRemoved += 1; totalSitesTouched++;
    return `${indent}const { userId } = authCtx(req);`;
  });
  src = src.replace(patternWidOnly, (_m, indent) => {
    totalBangsRemoved += 1; totalSitesTouched++;
    return `${indent}const { workspaceId } = authCtx(req);`;
  });

  if (src !== before) {
    // Ensure authCtx import
    if (!/from\s+['"][^'"]*auth-context/.test(src)) {
      const importRe = /^import\b.*?;\s*$/gm;
      let lastImportEnd = 0;
      let m;
      while ((m = importRe.exec(src)) !== null) lastImportEnd = m.index + m[0].length;
      src = src.slice(0, lastImportEnd) + `\nimport { authCtx } from '../middleware/auth-context.js';` + src.slice(lastImportEnd);
    }
    writeFileSync(file, src);
    console.log(`UPDATED ${file}`);
  }
}

console.log('---');
console.log(`Declaration sites touched: ${totalSitesTouched}`);
console.log(`! removed (counting each old declaration as 1): ${totalBangsRemoved}`);
