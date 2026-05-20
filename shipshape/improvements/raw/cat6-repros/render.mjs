// Render before/after terminal screenshots for the 3 Cat 6 fixes via
// Puppeteer + a styled-HTML "terminal" template.
//
// Why HTML→PNG instead of a real terminal capture: the BEFORE state requires
// the old code path (without the global error handler). Rather than checkout
// shipshape/audit + restart the API + run curl + capture (which crashes the
// in-flight dev session), we render the actual committed HTTP exchanges as
// styled HTML. The text content is verbatim from:
//   - audit/raw/malformed/issues-post.txt  (before)
//   - cat6-repros/repro.txt                (after, captured live today)
// Reproducible: `node shipshape/improvements/raw/cat6-repros/render.mjs`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find Chrome — prefer the OS-installed one for reproducibility on Windows.
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
import { existsSync } from 'node:fs';
const chromePath = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chromePath) {
  console.error('No Chrome found. Install Chrome or set PUPPETEER_EXECUTABLE_PATH.');
  process.exit(1);
}

const fixes = [
  {
    id: 'fix1',
    title: 'Fix 1 — Stack-trace leak on malformed JSON body',
    cmd: `curl -si -X POST -H "Content-Type: application/json" \\\n     -d "this is not JSON" \\\n     http://localhost:3000/api/issues`,
    before: `HTTP/1.1 400 Bad Request
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title></head>
<body>
<pre>SyntaxError: Unexpected token 't', "this is not JSON" is not valid JSON
    at JSON.parse (<anonymous>)
    at createStrictSyntaxError (C:\\Users\\tyler\\ship\\node_modules\\.pnpm
       \\body-parser@1.20.4\\node_modules\\body-parser\\lib\\types\\json.js:169:10)
    at parse  (C:\\…\\node_modules\\body-parser\\lib\\types\\json.js:86:15)
    ...stack continues, leaking file paths + library versions...
</pre>
</body>
</html>`,
    after: `HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Content-Length: 96

{"success":false,"error":{"code":"VALIDATION_ERROR",
  "message":"Request body is not valid JSON"}}`,
    impact: 'Any JSON client doing await response.json() now succeeds. Server-side log still has the full stack for debugging — client never sees it.',
  },
  {
    id: 'fix2',
    title: 'Fix 2 — HTML 404 → JSON 404 for unmatched /api/* routes',
    cmd: `curl -si http://localhost:3000/api/this-route-does-not-exist`,
    before: `HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title></head>
<body>
<pre>Cannot GET /api/this-route-does-not-exist</pre>
</body>
</html>`,
    after: `HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"success":false,"error":{"code":"NOT_FOUND",
  "message":"No route for GET /api/this-route-does-not-exist"}}`,
    impact: 'Client error-handling branches on { error.code === "NOT_FOUND" } now work. Message echoes method + path so log analysis is straightforward.',
  },
  {
    id: 'fix3',
    title: 'Fix 3 — PayloadTooLarge HTML 413 → JSON 413 (silent autosave data loss)',
    cmd: `# Build a 12 MB JSON body (over 10 MB cap):
node -e "process.stdout.write(JSON.stringify({blob:'a'.repeat(12*1024*1024)}))" > big.json
curl -si -X POST -H "Content-Type: application/json" \\\n     --data-binary @big.json \\\n     http://localhost:3000/api/issues`,
    before: `HTTP/1.1 413 Payload Too Large
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title></head>
<body>
<pre>PayloadTooLargeError: request entity too large
    at readStream (…\\raw-body\\index.js:163:17)
    at getRawBody (…\\raw-body\\index.js:116:12)
    at read (…\\body-parser\\lib\\read.js:79:3)
    ...stack continues...
</pre>
</body>
</html>`,
    after: `HTTP/1.1 413 Payload Too Large
Content-Type: application/json; charset=utf-8

{"success":false,"error":{"code":"VALIDATION_ERROR",
  "message":"Request body exceeds size limit"}}`,
    impact: 'Autosave failure path can now distinguish "too large" from "network error" and surface the actual cause. Before: client.json() crashes, optimistic UI doesn\'t revert, user thinks edit saved when it silently did not = data loss.',
  },
];

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render(fix) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { background: #0d0d0d; color: #e0e0e0; font-family: 'Cascadia Mono', 'Consolas', 'SF Mono', monospace; margin: 0; padding: 24px; font-size: 13px; line-height: 1.55; }
  h1 { color: #f5f5f5; font-size: 18px; font-weight: 600; margin: 0 0 12px; font-family: Inter, system-ui, sans-serif; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: Inter, sans-serif; font-weight: 600; }
  .pill-before { background: #4a1d1d; color: #fca5a5; }
  .pill-after  { background: #1d3b1d; color: #86efac; }
  .cmd { background: #161616; padding: 10px 14px; border-left: 3px solid #4a90e2; margin: 8px 0 18px; white-space: pre; overflow-x: auto; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .box { background: #161616; padding: 12px 14px; border-radius: 6px; }
  .box h2 { font-size: 12px; font-weight: 600; margin: 0 0 8px; color: #aaa; font-family: Inter, sans-serif; }
  .box pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
  .box.before { border-left: 3px solid #ef4444; }
  .box.after  { border-left: 3px solid #22c55e; }
  .impact { background: #1a1f2e; border-left: 3px solid #4a90e2; padding: 10px 14px; font-family: Inter, sans-serif; font-size: 12px; line-height: 1.5; color: #cbd5e1; }
  .impact strong { color: #f5f5f5; }
  .stack-leak { color: #fca5a5; }
  .json-ok    { color: #86efac; }
  </style></head><body>
  <h1>${escapeHtml(fix.title)}</h1>
  <div class="cmd">$ ${escapeHtml(fix.cmd)}</div>
  <div class="row">
    <div class="box before">
      <h2><span class="pill pill-before">BEFORE</span> &nbsp; audit baseline (commit 076a183)</h2>
      <pre class="stack-leak">${escapeHtml(fix.before)}</pre>
    </div>
    <div class="box after">
      <h2><span class="pill pill-after">AFTER</span> &nbsp; shipshape/06-runtime-errors (live today)</h2>
      <pre class="json-ok">${escapeHtml(fix.after)}</pre>
    </div>
  </div>
  <div class="impact"><strong>Impact:</strong> ${escapeHtml(fix.impact)}</div>
  </body></html>`;
}

// puppeteer-core ships chrome via CDP; we drive an installed Chrome.
import('puppeteer-core').then(async ({ default: puppeteer }) => {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    args: ['--headless=new', '--no-sandbox'],
  });
  try {
    for (const fix of fixes) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
      await page.setContent(render(fix), { waitUntil: 'networkidle0' });
      const out = resolve(__dirname, `${fix.id}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log('Wrote ' + out);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
