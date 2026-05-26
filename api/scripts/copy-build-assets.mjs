import { cp, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const assets = [
  ['src/db/schema.sql', 'dist/db/schema.sql'],
  ['src/db/migrations', 'dist/db/migrations'],
];

for (const [from, to] of assets) {
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}
