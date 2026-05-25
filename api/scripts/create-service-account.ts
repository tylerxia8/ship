/**
 * Create a service-account user + issue an api_tokens entry for it.
 *
 * Service accounts are users.is_service_account=true rows that authenticate
 * via the existing Bearer-token middleware (api/src/middleware/auth.ts).
 * The bot's "API key" is just an api_tokens row, same flow human-issued
 * tokens go through. The flag distinguishes bots in audit logs and excludes
 * them from human-directory views.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx api/scripts/create-service-account.ts \
 *     <email> "<name>" <workspaceIdOrSlug>
 *
 * Example:
 *   npx tsx api/scripts/create-service-account.ts \
 *     fleetgraph@ship.local "FleetGraph Agent" 9c08...
 *
 * Output:
 *   - Creates/updates the user row (idempotent on email)
 *   - Creates a NEW api_tokens entry every run (so re-running rotates)
 *   - Prints the plain-text token ONCE — capture it, we only store the hash
 */

import crypto from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;

function generateToken(): string {
  // 32 random bytes → 64-char hex. Prefix lets log greps spot service tokens.
  return `ship_sa_${crypto.randomBytes(32).toString('hex')}`;
}

function hashToken(token: string): string {
  // SHA-256 — matches the rest of Ship's api_tokens hashing pattern. bcrypt
  // would be overkill for high-entropy random bytes.
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function main(): Promise<void> {
  const [email, name, workspaceArg] = process.argv.slice(2);
  if (!email || !name || !workspaceArg) {
    console.error('Usage: create-service-account.ts <email> <name> <workspaceIdOrSlug>');
    console.error('Example: create-service-account.ts fleetgraph@ship.local "FleetGraph Agent" 9c08...');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    // Local dev Postgres doesn't have SSL; production Aurora/Neon does.
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    // Resolve workspace — accept UUID or name (workspaces table has no slug column)
    const wsLookup = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM workspaces
       WHERE id::text = $1 OR name ILIKE $1
       LIMIT 1`,
      [workspaceArg],
    );

    if (wsLookup.rows.length === 0) {
      console.error(`ERROR: workspace "${workspaceArg}" not found`);
      process.exit(1);
    }
    const workspace = wsLookup.rows[0];
    if (!workspace) throw new Error('unreachable — guarded above');

    // Upsert the service-account user. password_hash stays NULL (forbidden
    // by the migration-039 check constraint for service accounts).
    const userResult = await pool.query<{ id: string; email: string }>(
      `
      INSERT INTO users (email, name, is_service_account, password_hash, is_super_admin)
      VALUES ($1, $2, TRUE, NULL, FALSE)
      ON CONFLICT (email)
        DO UPDATE SET
          name = EXCLUDED.name,
          is_service_account = TRUE
      RETURNING id, email
      `,
      [email, name],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error('upsert returned no row');

    // Ensure workspace membership (admin role so it can read all docs)
    await pool.query(
      `
      INSERT INTO workspace_memberships (user_id, workspace_id, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role
      `,
      [user.id, workspace.id],
    );

    // Issue a fresh api_tokens row. Re-running this script rotates the key.
    const tokenName = `service-account-${Date.now()}`;
    const plainToken = generateToken();
    const tokenHash = hashToken(plainToken);
    const tokenPrefix = plainToken.slice(0, 12);

    const tokenResult = await pool.query<{ id: string }>(
      `
      INSERT INTO api_tokens (user_id, workspace_id, name, token_hash, token_prefix, expires_at)
      VALUES ($1, $2, $3, $4, $5, NULL)
      RETURNING id
      `,
      [user.id, workspace.id, tokenName, tokenHash, tokenPrefix],
    );

    console.log('\n✅ Service account ready:');
    console.log(`   user_id:     ${user.id}`);
    console.log(`   email:       ${user.email}`);
    console.log(`   workspace:   ${workspace.name} (${workspace.id})`);
    console.log(`   token_id:    ${tokenResult.rows[0]?.id ?? '(?)'}`);
    console.log(`   token_name:  ${tokenName}`);
    console.log('');
    console.log('🔑 API token (copy NOW — not stored in plaintext, only the SHA-256 hash):');
    console.log('');
    console.log(`   ${plainToken}`);
    console.log('');
    console.log('Send as: Authorization: Bearer <token>');
    console.log('Set as: SHIP_SERVICE_ACCOUNT_KEY in agent service env');
    console.log('Rotate: re-run this script (creates a fresh api_tokens row)');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
