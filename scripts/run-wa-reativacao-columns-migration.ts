import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { resolveMigrationConnectionString } from '../src/db';
import { resolveNodePgSslConfig } from '../src/db/pgSsl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const sqlPath = path.join(__dirname, 'sql', '2026-04-29_delivery_clientes_whatsapp_reativacao.sql');
  const sql = await readFile(sqlPath, 'utf8');

  const client = new Client({
    connectionString: resolveMigrationConnectionString(),
    connectionTimeoutMillis: 30000,
    ssl: resolveNodePgSslConfig(),
  });

  await client.connect();

  try {
    const envInfo = await client.query<{
      database_name: string;
      current_schema: string;
      search_path: string;
    }>(
      `SELECT current_database() AS database_name,
              current_schema() AS current_schema,
              current_setting('search_path') AS search_path`
    );

    const info = envInfo.rows[0];
    console.log(
      `[wa-reativacao:migration] database=${info?.database_name} schema=${info?.current_schema} search_path=${info?.search_path}`
    );

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[wa-reativacao:migration] OK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[wa-reativacao:migration] failed', error);
    process.exit(1);
  });
