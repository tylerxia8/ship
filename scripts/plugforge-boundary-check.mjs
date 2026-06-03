import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|mjs)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);
}

function usesSetTimeoutWait(source) {
  return /new\s+Promise\s*\([^)]*setTimeout/.test(source)
    || /\bsetTimeout\s*\([^,]+,\s*(?:1000|4_000|4000|16_000|16000)/.test(source);
}

const failures = [];

for (const file of await walk(join(repoRoot, 'integrations'))) {
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  for (const specifier of importSpecifiers(source)) {
    if (specifier.includes('api/src') || /^(\.\.\/)+api(?:\/|$)/.test(specifier)) {
      failures.push(`${relativeFile} imports API source (${specifier}); integrations must import @ship/sdk/public packages only.`);
    }
  }
}

for (const file of await walk(join(repoRoot, 'api/src/platform'))) {
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  for (const specifier of importSpecifiers(source)) {
    if (/^(\.\.\/)+routes(?:\/|$)/.test(specifier)) {
      failures.push(`${relativeFile} imports internal route handler (${specifier}); public /api/v1 must stay separate.`);
    }
  }
}

for (const file of await walk(join(repoRoot, 'api/src/platform'))) {
  const relativeFile = relative(repoRoot, file).replaceAll('\\', '/');
  if (!/test\.[cm]?[jt]sx?$/.test(relativeFile)) continue;
  const source = await readFile(file, 'utf8');
  if (relativeFile.includes('platform.test.ts')) continue;
  if (usesSetTimeoutWait(source)) {
    failures.push(`${relativeFile} appears to use setTimeout waits in webhook/platform tests; inject a deterministic clock instead.`);
  }
}

if (failures.length > 0) {
  console.error('Plugforge boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Plugforge boundary check passed');
