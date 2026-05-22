// Report writer: produces report.json (machine-readable) + report.md (human-readable).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEVERITY_EMOJI = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
  info: '🔵',
  ok: '🟢',
};

export function writeReport(findings, meta, outDir) {
  const json = { ...meta, findings };
  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(json, null, 2));

  const md = [];
  md.push('# ShipShape Security Probe Report');
  md.push('');
  md.push(`- **Target API:** \`${meta.target.api}\``);
  md.push(`- **Target Web:** \`${meta.target.web}\``);
  md.push(`- **Scanned at:** ${meta.scannedAt}`);
  md.push(`- **Probe version:** ${meta.probeVersion}`);
  md.push('');

  // Summary table
  const bySev = (sev) => findings.filter(f => f.severity === sev);
  md.push('## Summary');
  md.push('');
  md.push('| Severity | Count |');
  md.push('|---|---:|');
  for (const sev of ['critical', 'high', 'medium', 'low', 'info', 'ok']) {
    md.push(`| ${SEVERITY_EMOJI[sev]} ${sev} | ${bySev(sev).length} |`);
  }
  md.push('');

  // Findings by surface
  const surfaces = [...new Set(findings.map(f => f.surface))];
  for (const surface of surfaces) {
    md.push(`## ${surface}`);
    md.push('');
    const grp = findings.filter(f => f.surface === surface);
    for (const f of grp) {
      md.push(`### ${SEVERITY_EMOJI[f.severity]} ${f.title}`);
      md.push('');
      md.push(`- **ID:** \`${f.id}\``);
      md.push(`- **Severity:** ${f.severity}`);
      if (f.cwe) md.push(`- **CWE:** ${f.cwe}`);
      if (f.cve) md.push(`- **CVE:** ${f.cve}`);
      md.push('');
      md.push(f.description);
      md.push('');
      if (f.reproduction && f.reproduction.length) {
        md.push('**Reproduction:**');
        for (let i = 0; i < f.reproduction.length; i++) {
          md.push(`${i + 1}. ${f.reproduction[i]}`);
        }
        md.push('');
      }
      if (f.evidence) {
        md.push('**Evidence:**');
        md.push('```');
        md.push(typeof f.evidence === 'string' ? f.evidence : JSON.stringify(f.evidence, null, 2));
        md.push('```');
        md.push('');
      }
      if (f.remediation) {
        md.push(`**Remediation:** ${f.remediation}`);
        md.push('');
      }
    }
  }

  writeFileSync(resolve(outDir, 'report.md'), md.join('\n'));
}
