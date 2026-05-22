/**
 * Dependency vulnerability probe — pnpm audit + per-advisory dependency-chain
 * capture. See probe-types.d.mts for shared shapes.
 *
 * NOTE: this module does not take ProbeConfig because dependency scanning is
 * workspace-global, not target-specific. It always runs against the repo root.
 */
import type { ProbeResult } from '../probe-types.d.mts';

/**
 * Runs `corepack pnpm audit --json` (with fallback to `pnpm audit` and
 * `npx pnpm audit`), parses the advisory list, buckets by severity, and
 * shells out to `corepack pnpm why <pkg>` per advisory to capture the
 * dependency chain. Each finding's `evidence` field includes:
 *  - module: vulnerable package name
 *  - vulnerable_versions / patched_versions
 *  - consumingWorkspace: which workspace pkg root depends on it
 *  - dependencyChains: up to 5 paths from a workspace to the vuln
 *  - auditPathsField: raw paths from pnpm audit if present
 *  - url: advisory link or references
 *
 * Severity mapping: critical → critical, high → high, moderate → medium,
 * low → low, info → info.
 */
export function runDepsProbe(): Promise<ProbeResult>;
