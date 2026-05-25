/**
 * List all workspaces in the local DB. No auth needed — just DATABASE_URL.
 * Used by setup flows that need to look up a workspace ID.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx api/scripts/list-workspaces.ts
 *
 * Output:
 *   Tab-separated rows: id, name, slug
 */

import pg from 'pg';
const { Pool } = pg;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    // Local dev usually doesn't have SSL; production Aurora/Neon does.
    // Try SSL first; fall back gracefully isn't worth it for a dev script.
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM workspaces ORDER BY name`,
    );

    if (result.rows.length === 0) {
      console.log('No workspaces found. Run `pnpm db:seed` to seed dev data.');
      return;
    }

    console.log('');
    console.log('Workspaces:');
    console.log('');
    for (const ws of result.rows) {
      console.log(`  ${ws.id}\t${ws.name}`);
    }
    console.log('');
    console.log(`${result.rows.length} workspace(s) total.`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
