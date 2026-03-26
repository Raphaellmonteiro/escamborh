import type { PoolClient } from 'pg';
import { pool } from './pool';

type Queryable = Pick<PoolClient, 'query'>;

export { pool };

export function isDatabaseConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toUpperCase()
      : '';

  return (
    [
      'connection terminated due to connection timeout',
      'connection terminated unexpectedly',
      'terminating connection',
      'connection timeout',
      'timeout expired',
      'could not connect',
      'econnrefused',
      'etimedout',
      'socket hang up',
    ].some((snippet) => message.includes(snippet)) ||
    ['08000', '08001', '08003', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)
  );
}

export function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function query<T = any>(sql: string, params: unknown[] = []) {
  return pool.query<T>(toPg(sql), params);
}

export async function q1<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function qAll<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await query<T>(sql, params);
  return rows;
}

export async function qRun<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await query<T>(sql, params);
  return rows;
}

export async function qInsert(sql: string, params: unknown[] = []): Promise<number | bigint> {
  const { rows } = await query<{ id: number | bigint }>(`${sql} RETURNING id`, params);
  return rows[0]?.id;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function txQuery<T = any>(client: Queryable, sql: string, params: unknown[] = []) {
  return client.query<T>(toPg(sql), params);
}

export function txQ1<T = any>(client: Queryable, sql: string, params: unknown[] = []) {
  return txQuery<T>(client, sql, params).then((result) => result.rows[0] ?? null);
}

export function txQAll<T = any>(client: Queryable, sql: string, params: unknown[] = []) {
  return txQuery<T>(client, sql, params).then((result) => result.rows);
}

export function txRun<T = any>(client: Queryable, sql: string, params: unknown[] = []) {
  return txQuery<T>(client, sql, params).then((result) => result.rows);
}

export function txInsert(client: Queryable, sql: string, params: unknown[] = []) {
  return txQuery<{ id: number | bigint }>(client, `${sql} RETURNING id`, params).then(
    (result) => result.rows[0]?.id
  );
}
