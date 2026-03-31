import fs from 'fs';
import path from 'path';

/**
 * CA para verificação TLS do Postgres em produção (RDS, etc.).
 * - Caminho absoluto ou relativo ao cwd
 * - Ou conteúdo PEM (quando contém BEGIN CERTIFICATE / BEGIN TRUSTED)
 */
function loadDbSslCa(): string | undefined {
  const raw = process.env.DB_SSL_CA?.trim();
  if (!raw) return undefined;
  if (raw.includes('BEGIN CERTIFICATE') || raw.includes('BEGIN TRUSTED')) return raw;
  const resolved = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    console.warn('[pg ssl] DB_SSL_CA não pôde ser lido:', resolved);
    return undefined;
  }
}

export type NodePgSslOption = false | { rejectUnauthorized: boolean; ca?: string };

/**
 * Dev: SSL desligado (Postgres local).
 * Produção: verify peer (rejectUnauthorized: true); CA opcional via DB_SSL_CA.
 * sslmode=disable na URL desliga SSL mesmo em produção (ex.: túnel local para o banco).
 */
export function resolveNodePgSslConfig(): NodePgSslOption {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  const url = (process.env.DATABASE_URL || '').toLowerCase();
  if (url.includes('sslmode=disable')) {
    return false;
  }

  const ca = loadDbSslCa();
  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}
