/**
 * Auth probe — exercises authentication / session / authorization surfaces.
 * See probe-types.d.mts for shared shapes.
 */
import type { ProbeConfig, ProbeResult } from '../probe-types.d.mts';

/**
 * Runs the auth probe against the configured API. Checks:
 *  - Unauthenticated route access on 9 protected paths
 *  - Session token entropy and format
 *  - Logout invalidation
 *  - Malformed-cookie rejection
 *  - Session-timeout configuration sanity (SESSION_TIMEOUT_MS bounds)
 *  - Vertical privilege escalation (super-admin → admin route returns 200)
 *  - Horizontal privilege escalation (member → admin route returns 401/403)
 *    — only run when `memberEmail` + `memberPassword` are supplied.
 */
export function runAuthProbe(config: ProbeConfig): Promise<ProbeResult>;
