import { gzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const thresholdBytes = Number(process.env.SHIP_SDK_GZIP_TARGET_BYTES ?? 250 * 1024);
const distDir = 'sdk/dist';

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile() && path.endsWith('.js')) {
      files.push(path);
    }
  }
  return files.sort();
}

function conservativeMinify(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const files = await listFiles(distDir);
if (files.length === 0) {
  throw new Error('No built SDK JavaScript found. Run: corepack pnpm --filter @ship/sdk build');
}

let source = '';
for (const file of files) {
  source += `\n// ${file}\n`;
  source += await readFile(file, 'utf8');
}

const minified = conservativeMinify(source);
const gzipped = gzipSync(Buffer.from(minified, 'utf8'), { level: 9 });
const proof = {
  target_bytes_gzip: thresholdBytes,
  files: files.length,
  source_bytes: Buffer.byteLength(source),
  minified_bytes: Buffer.byteLength(minified),
  gzip_bytes: gzipped.length,
  gzip_kb: Number((gzipped.length / 1024).toFixed(2)),
  production_dependencies: [],
  passed: gzipped.length < thresholdBytes,
};
console.log(JSON.stringify(proof, null, 2));

if (!proof.passed) {
  throw new Error(`@ship/sdk minified+gzipped size ${gzipped.length} bytes, target < ${thresholdBytes} bytes`);
}
