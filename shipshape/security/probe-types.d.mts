/**
 * Shared type declarations for the ShipShape security probe.
 *
 * The probe runs as plain ES modules (.mjs) because Node 24 executes them
 * natively with no build step — that's the "boring technology" principle.
 * These .d.mts companions give TS consumers and reviewers a typed contract
 * without forcing the runtime through a compiler.
 *
 * Run a typecheck pass with:
 *   pnpm dlx tsc --noEmit -p shipshape/security
 */

/**
 * Severity rubric — mirrors shipshape/audit/AUDIT_REPORT.md § Severity rubric.
 *
 * `ok` is a POSITIVE finding (a surface was actively tested and behaved
 * correctly). It is NOT the absence of a finding. Surfaces that aren't
 * tested get no finding at all, so the `ok` count is a real signal.
 *
 * `info` is for measurement metadata or environmental observations that
 * don't represent a problem (e.g., "could not log in, authenticated tests
 * skipped").
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'ok';

/**
 * Which probe module produced this finding. The five surfaces correspond to
 * the brief's required surfaces; the manual-* group is the manual-review
 * module's CORS/CSP/secrets/ratelimit/error-verbosity sub-surfaces.
 */
export type Surface =
  | 'auth'
  | 'input'
  | 'websocket'
  | 'deps'
  | 'manual-cors'
  | 'manual-csp'
  | 'manual-secrets'
  | 'manual-ratelimit'
  | 'manual-error-verbosity';

/**
 * One security finding. Every finding has a stable `id`, a severity, and a
 * one-line `title`. Higher-severity findings also carry CWE/CVE refs and
 * structured `evidence` so a reviewer can reproduce.
 */
export interface Finding {
  /** Module that produced this finding. */
  surface: Surface;
  /** Stable kebab-case slug. Used for diffing before/after probe runs. */
  id: string;
  severity: Severity;
  /** One-line headline; appears verbatim in report.md. */
  title: string;
  /** Multi-paragraph context. May be omitted for `ok` findings. */
  description?: string;
  /** Common Weakness Enumeration ID, e.g. "CWE-20 (Improper Input Validation)". */
  cwe?: string;
  /** Common Vulnerabilities and Exposures ID, e.g. "CVE-2026-25896". */
  cve?: string;
  /** Recommended remediation. Free-form prose. */
  remediation?: string;
  /** Reproduction steps; freeform array of commands or descriptions. */
  reproduction?: string[];
  /**
   * Structured evidence (whatever the probe captured — HTTP response shapes,
   * WebSocket close codes, audit JSON, etc.). Intentionally typed as
   * `unknown` because each probe defines its own evidence shape.
   */
  evidence?: unknown;
}

/**
 * Result returned by every probe module. A module that errored may also
 * include an `error` field; the orchestrator continues running other modules.
 */
export interface ProbeResult {
  findings: Finding[];
  error?: string;
}

/**
 * Per-run configuration passed into every probe module.
 *
 * The auth probe is the only module that accepts the optional member
 * credentials; the others read api/web/email/password.
 */
export interface ProbeConfig {
  /** Base URL of the API (e.g., http://localhost:3000 or https://ship-api.../). */
  api: string;
  /** Base URL of the web frontend. Used by CSP/CORS probes. */
  web: string;
  /** Email of an admin account (or any account) used for authenticated probes. */
  email: string;
  /** Plaintext password matching `email`. */
  password: string;
  /**
   * Optional member-tier credentials. When supplied, the auth probe runs
   * horizontal privilege-escalation tests; otherwise only vertical
   * (admin → admin) tests run.
   */
  memberEmail?: string | null;
  memberPassword?: string | null;
  /**
   * If true, attempt to clean up test data the probe created (issues,
   * documents). Read-only otherwise.
   */
  cleanup: boolean;
  /** Directory where report.json + report.md get written. */
  outDir: string;
}

/**
 * Severity counts produced by report.mjs after aggregating findings.
 */
export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  ok: number;
}

/**
 * Top-level shape of report.json (the machine-readable output).
 */
export interface ProbeReport {
  meta: {
    api: string;
    web: string;
    runAt: string; // ISO 8601 timestamp
    durationMs: number;
  };
  counts: SeverityCounts;
  findings: Finding[];
}
