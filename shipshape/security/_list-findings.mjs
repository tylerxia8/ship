// Quick local helper: print the report's findings by severity.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const reportPath = process.argv[2] ?? resolve(here, 'raw', 'report.json');
const j = JSON.parse(readFileSync(reportPath, 'utf-8'));
const want = (process.argv[3] ?? 'critical,high').split(',');
const findings = j.findings.filter(f => want.includes(f.severity));
for (const f of findings) {
  console.log(`${f.severity.toUpperCase().padEnd(8)} | ${(f.cve || '-').padEnd(20)} | ${(f.title || '').slice(0, 120)}`);
}
console.log(`\nTotal: ${findings.length} of ${j.findings.length} findings.`);
