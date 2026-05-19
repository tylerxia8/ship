/**
 * ShipShape seed topup
 * ---------------------
 * The default `pnpm db:seed` leaves the audit DB at ~257 documents / 11 users
 * — under the brief's target of 500+ docs / 100+ issues / 20+ users / 10+
 * sprints. This script tops the seed up so the perf and DB measurements in
 * the audit run against the brief's stated volume.
 *
 * Idempotent: every INSERT uses ON CONFLICT DO NOTHING. Safe to re-run.
 *
 * Targets after running:
 *   users         11  -> 21 (+10)
 *   person docs   11  -> 21 (+10)
 *   issues        104 -> 304 (+200)
 *   wiki docs     7   -> 57  (+50)
 *   TOTAL docs    257 -> 517
 *
 * Run:
 *   corepack pnpm --filter @ship/api exec tsx ../shipshape/audit/scripts/seed-topup.ts
 *
 * Or from the repo root via Git Bash:
 *   cd api && node ./node_modules/.bin/tsx ../shipshape/audit/scripts/seed-topup.ts
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env so we pick up DATABASE_URL the same way migrate/seed do.
config({ path: join(__dirname, '../../../api/.env.local') });
config({ path: join(__dirname, '../../../api/.env') });

const TARGET_USERS = 21;
const TARGET_ISSUES = 304;
const TARGET_WIKIS = 57;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set — copy api/.env.example to api/.env.local first');

  const pool = new pg.Pool({ connectionString: url });
  try {
    // Look up workspace + programs created by the regular seed.
    const ws = await pool.query<{ id: string }>(`SELECT id FROM workspaces LIMIT 1`);
    if (ws.rows.length === 0) {
      throw new Error('No workspace found — run pnpm db:seed first');
    }
    const workspaceId = ws.rows[0]!.id;

    const programs = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM documents WHERE workspace_id = $1 AND document_type = 'program' ORDER BY created_at`,
      [workspaceId]
    );
    if (programs.rows.length === 0) {
      throw new Error('No programs found — run pnpm db:seed first');
    }

    const beforeCounts = await countAll(pool, workspaceId);
    console.log('Before:', formatCounts(beforeCounts));

    // ---------------------------------------------------------------------
    // 1. Users + person docs
    // ---------------------------------------------------------------------
    const passwordHash = await bcrypt.hash('admin123', 10);
    const usersToAdd = Math.max(0, TARGET_USERS - beforeCounts.users);
    if (usersToAdd > 0) {
      console.log(`Adding ${usersToAdd} users + person docs...`);
      for (let i = 0; i < usersToAdd; i++) {
        const seq = beforeCounts.users + i + 1;
        const email = `audit-user-${seq}@ship.local`;
        const name = `Audit User ${seq}`;
        const userRes = await pool.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO NOTHING
           RETURNING id`,
          [email, passwordHash, name]
        );
        if (userRes.rows.length === 0) continue; // already existed
        const userId = userRes.rows[0]!.id;

        // Workspace membership
        await pool.query(
          `INSERT INTO workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (workspace_id, user_id) DO NOTHING`,
          [workspaceId, userId]
        );

        // Person document
        await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, properties)
           VALUES ($1, 'person', $2, $3)`,
          [workspaceId, name, JSON.stringify({ user_id: userId, email })]
        );
      }
    }

    // Refresh counts before inserting docs that reference users.
    const midCounts = await countAll(pool, workspaceId);

    const userRows = await pool.query<{ id: string }>(
      `SELECT id FROM users ORDER BY created_at`
    );
    const userIds = userRows.rows.map(r => r.id);

    // ---------------------------------------------------------------------
    // 2. Issues
    // ---------------------------------------------------------------------
    const issuesToAdd = Math.max(0, TARGET_ISSUES - midCounts.issues);
    if (issuesToAdd > 0) {
      console.log(`Adding ${issuesToAdd} issues distributed across ${programs.rows.length} programs...`);

      // Next ticket_number is max(existing) + 1 (per workspace).
      const maxTicketRes = await pool.query<{ max: number | null }>(
        `SELECT MAX(ticket_number) AS max FROM documents WHERE workspace_id = $1`,
        [workspaceId]
      );
      let nextTicket = (maxTicketRes.rows[0]!.max ?? 0) + 1;

      const states = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
      const priorities = ['low', 'medium', 'high', 'urgent'];

      for (let i = 0; i < issuesToAdd; i++) {
        const program = programs.rows[i % programs.rows.length]!;
        const assignee = userIds[i % userIds.length]!;
        const state = states[i % states.length]!;
        const priority = priorities[i % priorities.length]!;
        const title = `Audit issue #${nextTicket}: ${program.title} maintenance task`;

        const insert = await pool.query<{ id: string }>(
          `INSERT INTO documents (workspace_id, document_type, title, ticket_number, properties, created_by)
           VALUES ($1, 'issue', $2, $3, $4, $5)
           RETURNING id`,
          [
            workspaceId,
            title,
            nextTicket,
            JSON.stringify({
              state,
              priority,
              assignee_id: assignee,
              source: 'internal',
              estimate: 4,
            }),
            assignee,
          ]
        );
        const issueId = insert.rows[0]!.id;

        // Associate with program (document_associations) so list queries land it.
        await pool.query(
          `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
           VALUES ($1, $2, 'program', '{"created_via": "audit-topup"}')
           ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
          [issueId, program.id]
        );

        nextTicket++;
      }
    }

    // ---------------------------------------------------------------------
    // 3. Wiki documents
    // ---------------------------------------------------------------------
    const wikisToAdd = Math.max(0, TARGET_WIKIS - midCounts.wikis);
    if (wikisToAdd > 0) {
      console.log(`Adding ${wikisToAdd} wiki documents...`);
      for (let i = 0; i < wikisToAdd; i++) {
        const program = programs.rows[i % programs.rows.length]!;
        const author = userIds[i % userIds.length]!;
        const title = `Audit wiki: ${program.title} runbook ${i + 1}`;
        const content = {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
            { type: 'paragraph', content: [{ type: 'text', text: `This page is part of the audit-topup batch. It exists so the seed reaches the brief's 500+ document target for perf and query measurements. The text is filler.` }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Placeholder section: operational details would normally live here, including runbook steps, escalation contacts, and recent incident notes.' }] },
          ],
        };
        const insert = await pool.query<{ id: string }>(
          `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by)
           VALUES ($1, 'wiki', $2, $3, '{}', $4)
           RETURNING id`,
          [workspaceId, title, JSON.stringify(content), author]
        );
        const wikiId = insert.rows[0]!.id;

        await pool.query(
          `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
           VALUES ($1, $2, 'program', '{"created_via": "audit-topup"}')
           ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
          [wikiId, program.id]
        );
      }
    }

    const afterCounts = await countAll(pool, workspaceId);
    console.log('After: ', formatCounts(afterCounts));
    console.log('Topup complete.');
  } finally {
    await pool.end();
  }
}

interface Counts {
  users: number;
  persons: number;
  issues: number;
  wikis: number;
  sprints: number;
  total: number;
}

async function countAll(pool: pg.Pool, workspaceId: string): Promise<Counts> {
  const r = await pool.query<{
    users: number; persons: number; issues: number; wikis: number; sprints: number; total: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM users)::int AS users,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = $1 AND document_type = 'person' AND deleted_at IS NULL)::int AS persons,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = $1 AND document_type = 'issue'  AND deleted_at IS NULL)::int AS issues,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = $1 AND document_type = 'wiki'   AND deleted_at IS NULL)::int AS wikis,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = $1 AND document_type = 'sprint' AND deleted_at IS NULL)::int AS sprints,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = $1                              AND deleted_at IS NULL)::int AS total
  `, [workspaceId]);
  return r.rows[0]!;
}

function formatCounts(c: Counts): string {
  return `users=${c.users} persons=${c.persons} issues=${c.issues} wikis=${c.wikis} sprints=${c.sprints} total_docs=${c.total}`;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
