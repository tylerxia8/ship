/**
 * Manual-review probe — CORS, CSP, secrets-in-bundle, rate limiting, error
 * verbosity. The brief explicitly asks for each of these areas; the probe
 * automates what it can and MANUAL_REVIEW.md captures what it can't.
 *
 * See probe-types.d.mts for shared shapes.
 */
import type { ProbeConfig, ProbeResult } from '../probe-types.d.mts';

/**
 * Runs the manual-review probe. Emits findings under five sub-surfaces:
 *   manual-cors   — preflight from evil.example.com rejected
 *   manual-csp    — header presence + 'unsafe-eval' / wildcard scan
 *   manual-secrets — scans web/dist for AWS keys, GitHub PATs, PEM keys,
 *                    DATABASE_URL, SESSION_SECRET literal
 *   manual-ratelimit — 12 failed login attempts; expect HTTP 429
 *   manual-error-verbosity — 3 error shapes (malformed JSON, 404 path,
 *                    1MB body); expect sanitized JSON envelopes,
 *                    never an HTML stack trace
 */
export function runManualReview(config: ProbeConfig): Promise<ProbeResult>;
