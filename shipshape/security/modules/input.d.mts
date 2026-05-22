/**
 * Input-validation probe — XSS, SQL injection, oversized input on user-facing
 * write surfaces. See probe-types.d.mts for shared shapes.
 */
import type { ProbeConfig, ProbeResult } from '../probe-types.d.mts';

/**
 * Runs the input probe against the configured API. Checks:
 *  - Stored XSS (5 payloads) in POST /api/issues title
 *  - Time-based SQL injection (4 payloads) via response-time delta
 *  - Oversized input (10 KB / 100 KB / 1 MB) on title fields
 *  - XSS-shaped input across additional user-facing fields:
 *      POST /api/documents title, content (TipTap text node)
 *      POST /api/projects title
 *  - Reflected XSS in /api/search/mentions
 */
export function runInputProbe(config: ProbeConfig): Promise<ProbeResult>;
