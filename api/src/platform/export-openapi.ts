import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { publicOpenApiDocument } from './openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = join(__dirname, '../../../docs/openapi.json');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(publicOpenApiDocument, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
