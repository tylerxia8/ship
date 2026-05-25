/**
 * Smoke test the Ship API client end-to-end with the service-account token.
 * Confirms:
 *   - Auth (Bearer token validates against api_tokens)
 *   - List documents (returns real Ship docs, not 401/403)
 *   - List active sprints (workspace_id filter works)
 *
 * Run:
 *   SHIP_SERVICE_ACCOUNT_KEY=ship_sa_... LANGSMITH_API_KEY=... \
 *     ANTHROPIC_API_KEY=... pnpm --filter @ship/agent exec tsx src/scripts/smoke-ship.ts
 */

import { listDocuments, listActiveSprints, ping, ShipApiError } from '../ship-client.js';
import { config } from '../config.js';

async function main(): Promise<void> {
  const workspaceId = process.env.SMOKE_WORKSPACE_ID;
  if (!workspaceId) {
    console.error('SMOKE_WORKSPACE_ID env var required for this test');
    process.exit(1);
  }

  console.log('[smoke-ship] config:');
  console.log(`  ship api: ${config.ship.apiBaseUrl}`);
  console.log(`  workspace: ${workspaceId}`);
  console.log(`  token prefix: ${config.ship.serviceAccountKey.slice(0, 12)}...`);
  console.log('');

  console.log('▶ ping');
  const p = await ping();
  console.log('  →', p);
  console.log('');

  console.log('▶ list all documents in workspace');
  try {
    const docs = await listDocuments({ workspaceId });
    console.log(`  → ${docs.length} documents`);
    if (docs.length > 0) {
      const byType: Record<string, number> = {};
      for (const d of docs) {
        byType[d.document_type] = (byType[d.document_type] ?? 0) + 1;
      }
      console.log('  → by document_type:', byType);
      console.log('  → first doc:', { id: docs[0]?.id, title: docs[0]?.title, type: docs[0]?.document_type });
    }
  } catch (err) {
    if (err instanceof ShipApiError) {
      console.error('  ✗ Ship API error:', err.status, err.message);
      console.error('    body:', JSON.stringify(err.body, null, 2));
    } else {
      console.error('  ✗', err);
    }
    process.exit(1);
  }
  console.log('');

  console.log('▶ list active sprints in workspace');
  try {
    const sprints = await listActiveSprints(workspaceId);
    console.log(`  → ${sprints.length} active sprint(s)`);
    for (const s of sprints.slice(0, 5)) {
      console.log(`  → ${s.id}  ${s.title}  (updated ${s.updated_at})`);
    }
  } catch (err) {
    if (err instanceof ShipApiError) {
      console.error('  ✗ Ship API error:', err.status, err.message);
    } else {
      console.error('  ✗', err);
    }
    process.exit(1);
  }
  console.log('');

  console.log('[smoke-ship] ✅ all checks passed');
}

main().catch((err) => {
  console.error('[smoke-ship] FAILED:', err);
  process.exit(1);
});
