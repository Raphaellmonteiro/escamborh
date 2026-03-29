import { Pool } from 'pg';

/** Limite do pooler Supabase em Session mode = pool_size do projeto; acima disso → MaxClientsInSessionMode. */
function resolvePoolMax(): number {
  const raw = process.env.PG_POOL_MAX ?? process.env.DATABASE_POOL_MAX;
  const parsed = raw !== undefined ? Number.parseInt(String(raw).trim(), 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1) return Math.min(parsed, 50);
  return 6;
}

const poolMax = resolvePoolMax();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: false
      }
    : false,
});

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});
