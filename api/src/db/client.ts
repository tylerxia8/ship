import pg from 'pg';
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
  max: isProduction ? 30 : 20,
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Fail fast if can't connect in 2 seconds
  maxUses: 7500, // Recycle connections after 7500 queries to prevent memory leaks
  // DDoS protection: Terminate queries running longer than 30 seconds
  statement_timeout: 30000, // 30 seconds max query duration
});

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

export { pool };
