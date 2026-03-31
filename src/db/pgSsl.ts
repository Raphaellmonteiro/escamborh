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

function migrationOrDatabaseUrlDisablesSsl(): boolean {
  const urls = [process.env.DATABASE_URL, process.env.DATABASE_MIGRATION_URL].filter(
    (u): u is string => Boolean(u && String(u).trim())
  );
  return urls.some((u) => u.toLowerCase().includes('sslmode=disable'));
}

/**
 * Dev: SSL desligado (Postgres local).
 * Produção: TLS ativo com `rejectUnauthorized: false` por padrão (Railway, Neon, Supabase etc. —
 * cadeia com certificado intermediário que o Node não ancora sem CA explícita).
 * Com `DB_SSL_CA` (PEM ou caminho), usa verificação estrita (`rejectUnauthorized: true`) + CA.
 * `sslmode=disable` em DATABASE_URL ou DATABASE_MIGRATION_URL desliga SSL (ex.: túnel local).
 */
export function resolveNodePgSslConfig(): NodePgSslOption {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  if (migrationOrDatabaseUrlDisablesSsl()) {
    return false;
  }

  const ca = loadDbSslCa();
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }

  return { rejectUnauthorized: false };
}
