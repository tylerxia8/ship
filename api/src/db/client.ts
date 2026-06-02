import pg from 'pg';
import type { QueryResultRow } from 'pg';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables before creating pool
config({ path: join(__dirname, '../../.env.local') });
config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';

// Pool sizing: the original dev cap of max=10 saturated at moderate
// concurrency. The audit saw /api/auth/me P99 jump from 41 ms at c=25 to
// 1575 ms at c=50 purely because 40 of the 50 in-flight requests sat
// queued waiting for a pool slot.
//
// Bumping to 20 is the sweet spot empirically — large enough to clear
// the slot queue under moderate load, small enough that Postgres itself
// doesn't saturate on multi-query endpoints. A larger bump to 50 was
// tried and made my-work regress 18× because Postgres ran out of CPU
// servicing 50 concurrent multi-query handlers. 20 is the largest value
// that didn't cause that regression in the after-state autocannon sweep.
//
// Prod gets 30: the EB instance has more CPU and Aurora handles more
// concurrent connections than a dev Postgres on a developer laptop.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: isProduction ? 30 : 20,
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Fail fast if can't connect in 2 seconds
  maxUses: 7500, // Recycle connections after 7500 queries to prevent memory leaks
  // DDoS protection: Terminate queries running longer than 30 seconds
  statement_timeout: 30000, // 30 seconds max query duration
});

// SHIPSHAPE CAT-4 INSTRUMENTATION (opt-in via env, no overhead when off).
// When QUERY_LOG points at a file path, every pool.query call appends one
// tab-separated line with timestamp, duration_ms, and the first 200 chars
// of the SQL. Used only by the Cat 4 measurement script; production sets
// no QUERY_LOG so this path is unreachable.
//
// Lives behind a top-level `if` (no top-level await) so module evaluation
// stays synchronous for every importer.
if (process.env.QUERY_LOG) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  const filePath = process.env.QUERY_LOG;
  const originalQuery = pool.query.bind(pool);
  // @ts-expect-error — replacing overloaded method with a single signature
  pool.query = async (...args: unknown[]) => {
    const start = Date.now();
    try {
      // @ts-expect-error — passthrough
      const result = await originalQuery(...args);
      const dt = Date.now() - start;
      const sql = String((args[0] as { text?: string })?.text ?? args[0] ?? '').replace(/\s+/g, ' ').slice(0, 220);
      fs.appendFileSync(filePath, `${new Date().toISOString()}\t${dt}\t${sql}\n`);
      return result;
    } catch (err) {
      const dt = Date.now() - start;
      const sql = String((args[0] as { text?: string })?.text ?? args[0] ?? '').replace(/\s+/g, ' ').slice(0, 220);
      fs.appendFileSync(filePath, `${new Date().toISOString()}\tERR-${dt}\t${sql}\n`);
      throw err;
    }
  };
  console.log(`[query-log] writing to ${filePath}`);
}

// Graceful shutdown - close pool connections on process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  console.log('Database pool closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  await pool.end();
  console.log('Database pool closed');
  process.exit(0);
});

/**
 * Typed query helpers — eliminate the `as Row[]` casts and `.rows[0]!`
 * non-null assertions that were ~hundreds across the route layer.
 *
 * The audit's hypothesis ("this single change eliminates hundreds of `as`
 * casts") rests on the observation that every `pool.query(sql, params)`
 * returns `QueryResult<QueryResultRow>` whose `.rows` is `QueryResultRow[]`
 * — a permissive `{ [column: string]: any }`. Adding the generic at the
 * helper level lets callers say what shape they expect once, and get
 * narrowed `.name`, `.id`, etc. from there forward.
 *
 * Two helpers because the two access patterns are different:
 *   query<T>     — returns the row array (use for lists; empty array if no rows)
 *   queryOne<T>  — returns the first row or null (use for "find by id" lookups)
 *
 * Both delegate to the same underlying `pool.query` so any pg behavior
 * (parameterization, transactions, errors) is preserved. The wrappers
 * are added, not substituted — existing `pool.query` call sites continue
 * to work; new code should prefer these.
 */

/**
 * Run a query and return the rows array, typed as T[].
 *
 * @example
 *   interface UserRow { id: string; email: string; name: string; }
 *   const users = await query<UserRow>('SELECT id, email, name FROM users WHERE workspace_id = $1', [wid]);
 *   // users is UserRow[]; users[0]?.email is string | undefined
 */
async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown as unknown[]);
  return result.rows;
}

/**
 * Run a query and return the first row or null. Use for unique lookups.
 *
 * @example
 *   const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
 *   if (!user) { return res.status(404).json(...); }
 *   // user is UserRow (narrowed by the null-check above)
 */
async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<T | null> {
  const result = await pool.query<T>(text, params as unknown as unknown[]);
  return result.rows[0] ?? null;
}

export { pool, query, queryOne };
export type { QueryResultRow };
