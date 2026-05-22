/**
 * Report writer — aggregates Findings into JSON + Markdown outputs.
 * See probe-types.d.mts for shared shapes.
 */
import type { Finding, ProbeReport } from './probe-types.d.mts';

/**
 * Writes report.json (machine-readable, fits ProbeReport shape) and
 * report.md (human-readable, grouped by surface and severity-sorted) to
 * the given output directory.
 *
 * @param findings All findings produced by every probe module.
 * @param meta Run metadata — api URL, web URL, timestamp, duration.
 * @param outDir Absolute path; created if missing.
 * @returns Severity counts, matching the counts field in ProbeReport.
 */
export function writeReport(
  findings: Finding[],
  meta: ProbeReport['meta'],
  outDir: string,
): ProbeReport['counts'];
