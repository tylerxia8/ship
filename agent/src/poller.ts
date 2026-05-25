/**
 * Proactive poller — runs the graph against active sprints without a user
 * present. This is the "agent pushes" half of FleetGraph (the other half
 * being on-demand chat).
 *
 * Loop:
 *   - Every config.scheduler.pollIntervalMs (default 60s), wake up
 *   - List workspaces (TODO: pluralize when multi-workspace; for MVP we
 *     poll all workspaces the service-account user has access to)
 *   - For each active sprint, check last_run_at in an in-memory map
 *   - If older than config.scheduler.perScopeCooldownMs (default 4 min),
 *     fire one graph run with the sprint as scope
 *
 * Per-scope cooldown enforces the 4-min cadence specified in
 * FLEETGRAPH.md § Trigger Model: poll every minute, but run any given
 * sprint at most once per 4-minute window. Gives the 5-min SLA a
 * 1-minute margin.
 *
 * For MVP this poller is started by index.ts only when
 * FLEETGRAPH_POLLER_ENABLED=true. Set to true on the deployed Render
 * service; leave false locally during dev so we don't constantly hammer
 * Anthropic during smoke testing.
 */

import { fleetGraph } from './graph.js';
import { listActiveSprints, listDocuments } from './ship-client.js';
import { config } from './config.js';
import type { Context } from './state.js';

interface ScopeRunRecord {
  lastRunAt: number;
  lastFindingHash: string | null;
}

const scopeHistory = new Map<string, ScopeRunRecord>();
let timer: NodeJS.Timeout | null = null;

export function startPoller(): void {
  if (timer) {
    console.warn('[poller] already running');
    return;
  }

  console.log(
    `[poller] starting — interval ${config.scheduler.pollIntervalMs}ms, ` +
      `per-scope cooldown ${config.scheduler.perScopeCooldownMs}ms`,
  );

  // Run once immediately on start so a deploy doesn't have to wait one
  // interval before producing any signal.
  void tick();

  timer = setInterval(() => {
    void tick();
  }, config.scheduler.pollIntervalMs);
}

export function stopPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[poller] stopped');
  }
}

async function tick(): Promise<void> {
  const tickStart = Date.now();
  let workspacesScanned = 0;
  let sprintsConsidered = 0;
  let sprintsRun = 0;
  let errors = 0;

  try {
    // Enumerate workspaces this service account can see. For MVP we don't
    // have a /api/workspaces public list endpoint that's auth-callable from
    // the service account, so we list documents WHERE document_type='sprint'
    // and group by workspace_id implicitly. Future: a proper /workspaces
    // endpoint.
    //
    // For now we just hardcode-discover from listActiveSprints with no
    // workspace filter — Ship API may or may not respect the absent filter.
    // Real prod path: agent service knows its assigned workspace from env.
    const targetWorkspaceId = process.env.FLEETGRAPH_TARGET_WORKSPACE_ID;
    if (!targetWorkspaceId) {
      // No target configured — silent skip. Don't error so a missing env
      // var doesn't crash the loop in dev.
      return;
    }

    workspacesScanned = 1;

    const sprints = await listActiveSprints(targetWorkspaceId);
    sprintsConsidered = sprints.length;

    const now = Date.now();

    for (const sprint of sprints) {
      const history = scopeHistory.get(sprint.id);
      if (history && now - history.lastRunAt < config.scheduler.perScopeCooldownMs) {
        continue; // Cooldown not elapsed
      }

      try {
        const context: Context = {
          scopeType: 'sprint',
          scopeId: sprint.id,
          workspaceId: targetWorkspaceId,
          userId: null,
          mode: 'proactive',
        };
        const result = await fleetGraph.invoke(
          { context },
          { configurable: { thread_id: `proactive-${sprint.id}` } },
        );
        scopeHistory.set(sprint.id, {
          lastRunAt: now,
          lastFindingHash: result.reasoning?.findingHash ?? null,
        });
        sprintsRun++;
      } catch (err) {
        errors++;
        console.error(`[poller] sprint ${sprint.id} run failed:`, (err as Error).message);
        // Still record an attempt so we don't hot-loop on a broken sprint
        scopeHistory.set(sprint.id, { lastRunAt: now, lastFindingHash: null });
      }
    }
  } catch (err) {
    errors++;
    console.error('[poller] tick error:', (err as Error).message);
  }

  const elapsed = Date.now() - tickStart;
  if (sprintsRun > 0 || errors > 0) {
    console.log(
      `[poller] tick complete in ${elapsed}ms — workspaces=${workspacesScanned} ` +
        `sprints_considered=${sprintsConsidered} sprints_run=${sprintsRun} errors=${errors}`,
    );
  }
}

// Suppress unused-import noise: listDocuments is here for future multi-
// workspace discovery; keeping the import documents the eventual shape.
void listDocuments;
