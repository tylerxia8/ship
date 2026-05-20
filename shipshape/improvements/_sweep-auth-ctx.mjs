// Sweep req.userId!/req.workspaceId! → authCtx(req) destructure
// Reads a list of files, finds each `router.<verb>(..., async (req, res) => {`
// handler body, and if that body uses req.userId!/req.workspaceId!:
//   - inserts `  const { userId, workspaceId } = authCtx(req);` after the `{`
//   - replaces `req.userId!` → `userId` and `req.workspaceId!` → `workspaceId`
// Also ensures the file imports `authCtx` from '../middleware/auth-context.js'.
//
// Designed to be safe-by-pattern: only matches handlers that explicitly use
// `req.userId!` or `req.workspaceId!` inside their body. Other handlers
// (public, helper functions) are untouched.

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
  'api/src/routes/feedback.ts',
  'api/src/routes/backlinks.ts',
  'api/src/routes/accountability.ts',
  'api/src/routes/activity.ts',
  'api/src/routes/documents.ts',
  'api/src/routes/search.ts',
  'api/src/routes/files.ts',
];

let totalBangsRemoved = 0;
let totalHandlersTouched = 0;

for (const file of FILES) {
  let src;
  try {
    src = readFileSync(file, 'utf-8');
  } catch (e) {
    console.log(`SKIP ${file}: not found`);
    continue;
  }
  const before = src;

  // Find all handler blocks. A handler is `async (req: Request, res: Response): Promise<void> => {`
  // or `async (req: Request, res: Response) => {` or `async (req, res) => {`.
  // We need to identify the matching close `}` to scope the replacement to ONE handler.
  // Approach: walk char-by-char tracking brace depth.

  const handlerStartRe = /async\s*\(\s*req\s*(?::\s*[A-Z]\w*)?\s*,\s*res\s*(?::\s*[A-Z]\w*)?\s*(?::\s*Promise<\w+>)?\s*\)\s*(?::\s*Promise<\w+>)?\s*=>\s*\{/g;

  let result = '';
  let cursor = 0;
  let match;

  while ((match = handlerStartRe.exec(src)) !== null) {
    const openIdx = match.index + match[0].length; // points just AFTER the `{`
    // Walk forward, tracking braces, to find the matching close `}`.
    let depth = 1;
    let i = openIdx;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      // Skip string literals (rough — doesn't handle nested template exprs perfectly)
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === '\\') i++; // escaped char
          i++;
        }
        i++;
        continue;
      }
      if (ch === '`') {
        // template literal — walk until matching back-tick, handling ${...}
        i++;
        while (i < src.length && src[i] !== '`') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '$' && src[i + 1] === '{') {
            // skip ${...} expression
            let exprDepth = 1;
            i += 2;
            while (i < src.length && exprDepth > 0) {
              if (src[i] === '{') exprDepth++;
              else if (src[i] === '}') exprDepth--;
              i++;
            }
            continue;
          }
          i++;
        }
        i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') {
        // line comment
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '*') {
        // block comment
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth === 0) break;
      i++;
    }
    const closeIdx = i; // points at the matching `}`

    const body = src.slice(openIdx, closeIdx);
    const usesUid = /\breq\.userId!/.test(body);
    const usesWid = /\breq\.workspaceId!/.test(body);

    if (!usesUid && !usesWid) continue; // nothing to do for this handler

    // Skip handlers that ALREADY have a local `const userId = ...` or
    // `const workspaceId = ...`. Adding our destructure would either
    // collide (Cannot redeclare) or self-reference (used before declaration).
    const hasLocalUid = /\b(?:const|let|var)\s+userId\b/.test(body);
    const hasLocalWid = /\b(?:const|let|var)\s+workspaceId\b/.test(body);
    if ((usesUid && hasLocalUid) || (usesWid && hasLocalWid)) {
      // Mixed case — bail this handler. Cleanup of pre-existing local
      // bindings is a separate, manual refactor.
      continue;
    }

    // Build the destructure line
    let destructure;
    if (usesUid && usesWid) destructure = '\n    const { userId, workspaceId } = authCtx(req);';
    else if (usesUid)       destructure = '\n    const { userId } = authCtx(req);';
    else                    destructure = '\n    const { workspaceId } = authCtx(req);';

    // Rewrite body: replace !  variants
    let newBody = body
      .replace(/\breq\.userId!/g, 'userId')
      .replace(/\breq\.workspaceId!/g, 'workspaceId');

    // Count `!`s actually removed in this handler
    const removed = (body.match(/\breq\.(userId|workspaceId)!/g) || []).length;
    totalBangsRemoved += removed;
    totalHandlersTouched++;

    // Insert destructure right after the `{`, before the body
    const newChunk = src.slice(cursor, openIdx) + destructure + newBody;
    result += newChunk;
    cursor = closeIdx;
  }
  // Append the tail
  result += src.slice(cursor);

  if (result !== before) {
    // Ensure import for authCtx
    if (!/from\s+['"][^'"]*auth-context/.test(result)) {
      // Insert after the last `import` statement
      const importRe = /^import\b.*?;\s*$/gm;
      let lastImportEnd = 0;
      let m;
      while ((m = importRe.exec(result)) !== null) {
        lastImportEnd = m.index + m[0].length;
      }
      const importLine = `\nimport { authCtx } from '../middleware/auth-context.js';`;
      result = result.slice(0, lastImportEnd) + importLine + result.slice(lastImportEnd);
    }
    writeFileSync(file, result);
    console.log(`UPDATED ${file}`);
  } else {
    console.log(`SKIP ${file}: no handlers matched`);
  }
}

console.log('---');
console.log(`Handlers touched: ${totalHandlersTouched}`);
console.log(`Non-null assertions removed: ${totalBangsRemoved}`);
