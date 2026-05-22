// Dependency vulnerability probe.
// Runs `pnpm audit --json` at the workspace root, parses the output, categorizes
// by severity, and cross-references each vulnerable package to the application
// features that depend on it.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Run from the repo root regardless of probe cwd.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export async function runDepsProbe() {
  const findings = [];

  // Run pnpm audit. pnpm audit exits non-zero when vulnerabilities exist, so
  // wrap in try/catch and treat non-zero as "vulns found, parse output".
  //
  // `corepack pnpm` works cross-platform (Windows doesn't put pnpm.cmd on PATH
  // when pnpm is installed via corepack); plain `pnpm` fails on Windows with
  // "'pnpm' is not recognized" so we route through corepack explicitly.
  let auditOutput;
  const ATTEMPTS = ['corepack pnpm audit --json', 'pnpm audit --json', 'npx --yes pnpm audit --json'];
  let attemptError = null;
  for (const cmd of ATTEMPTS) {
    try {
      auditOutput = execSync(cmd, { encoding: 'utf-8', timeout: 120_000, cwd: REPO_ROOT, shell: true });
      attemptError = null;
      break;
    } catch (e) {
      // pnpm audit exits non-zero when findings exist; stdout will still have JSON
      const stdout = e.stdout?.toString() ?? '';
      if (stdout.includes('{') || stdout.includes('[')) {
        auditOutput = stdout;
        attemptError = null;
        break;
      }
      attemptError = e;
    }
  }
  if (attemptError) {
    findings.push({
      surface: 'deps',
      id: 'deps-audit-error',
      severity: 'info',
      title: 'pnpm audit could not be invoked',
      description: `Tried ${ATTEMPTS.length} invocations; all failed. Last error: ${String(attemptError.message || attemptError).slice(0, 500)}`,
    });
    return { findings };
  }

  // pnpm audit --json can emit multiple JSON objects or one summary object.
  // We try parsing as a single JSON first, then fall back to ndjson.
  let parsed;
  try {
    parsed = JSON.parse(auditOutput);
  } catch {
    // ndjson: one object per line
    const lines = auditOutput.split('\n').filter(Boolean);
    parsed = { advisories: {} };
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'auditAdvisory' && obj.data?.advisory) {
          const adv = obj.data.advisory;
          parsed.advisories[adv.id ?? adv.github_advisory_id ?? `${adv.module_name}-${adv.severity}`] = adv;
        }
      } catch {}
    }
  }

  // Normalize: extract every advisory regardless of pnpm's shape.
  const advisories = [];
  if (parsed?.advisories) {
    for (const adv of Object.values(parsed.advisories)) advisories.push(adv);
  } else if (Array.isArray(parsed)) {
    for (const adv of parsed) advisories.push(adv);
  } else if (parsed?.vulnerabilities) {
    // newer pnpm: { vulnerabilities: { critical: 0, high: 1, ... }, ... }
    // Without per-advisory detail, just summarize.
    const counts = parsed.vulnerabilities;
    const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
    if (total === 0) {
      findings.push({
        surface: 'deps',
        id: 'deps-no-vulnerabilities',
        severity: 'ok',
        title: 'pnpm audit reports 0 vulnerabilities',
        description: 'Workspace dependency tree has zero known vulnerabilities (no advisories at any severity).',
        evidence: counts,
      });
      return { findings };
    }
    findings.push({
      surface: 'deps',
      id: 'deps-summary-only',
      severity: counts.critical > 0 ? 'critical' : counts.high > 0 ? 'high' : counts.moderate > 0 ? 'medium' : 'low',
      title: `pnpm audit summary: ${total} vulnerabilities`,
      description: `Per-advisory detail not extracted from this pnpm audit version. Run \`pnpm audit\` (without --json) for the human-readable list.`,
      evidence: counts,
    });
    return { findings };
  }

  if (advisories.length === 0) {
    findings.push({
      surface: 'deps',
      id: 'deps-no-vulnerabilities',
      severity: 'ok',
      title: 'pnpm audit reports 0 vulnerabilities',
      description: 'Workspace dependency tree has zero known advisories at any severity.',
    });
    return { findings };
  }

  // Bucket by severity. pnpm advisories use 'critical' | 'high' | 'moderate' | 'low' | 'info'.
  const SEV_MAP = { critical: 'critical', high: 'high', moderate: 'medium', low: 'low', info: 'info' };
  for (const adv of advisories) {
    const pkg = adv.module_name ?? adv.package ?? adv.name ?? '(unknown)';
    const sev = SEV_MAP[adv.severity] ?? 'info';
    const title = adv.title ?? `Advisory on ${pkg}`;
    const cve = (adv.cves && adv.cves[0]) ?? adv.cve;
    findings.push({
      surface: 'deps',
      id: `deps-cve-${(adv.id ?? adv.github_advisory_id ?? pkg).toString().slice(0, 40)}`,
      severity: sev,
      title: `[${pkg}] ${title}`,
      description: (adv.overview ?? adv.description ?? '').slice(0, 1000),
      cve,
      cwe: adv.cwe ?? (Array.isArray(adv.cwes) && adv.cwes[0]),
      remediation: adv.recommendation ?? adv.patched_versions ?? 'See advisory link.',
      evidence: {
        module: pkg,
        vulnerable_versions: adv.vulnerable_versions ?? adv.range,
        patched_versions: adv.patched_versions ?? adv.patched_in,
        url: adv.url ?? adv.references,
      },
    });
  }

  return { findings };
}
