/**
 * Diagnóstico de URLs de imagem no banco (legado vs Cloudinary vs outras HTTPS).
 * Uso: npx tsx scripts/audit-image-urls.ts
 * Requer DATABASE_URL ou DATABASE_MIGRATION_URL.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { resolveMigrationConnectionString } from '../src/db';
import { resolveNodePgSslConfig } from '../src/db/pgSsl';

function classifyUrl(raw: string | null | undefined): 'empty' | 'relative_uploads' | 'cloudinary' | 'other_https' | 'other' {
  const s = String(raw ?? '').trim();
  if (!s) return 'empty';
  const n = s.replace(/\\/g, '/');
  if (n.startsWith('/uploads') || /^uploads\//i.test(n)) return 'relative_uploads';
  if (/^https?:\/\//i.test(s)) {
    try {
      const host = new URL(s).hostname.toLowerCase();
      if (host === 'res.cloudinary.com') return 'cloudinary';
      return 'other_https';
    } catch {
      return 'other';
    }
  }
  return 'other';
}

async function main() {
  const client = new Client({
    connectionString: resolveMigrationConnectionString(),
    connectionTimeoutMillis: 30000,
    ssl: resolveNodePgSslConfig(),
  });
  await client.connect();
  try {
    console.log('--- produtos.photo_url ---');
    const produtos = await client.query<{ photo_url: string | null }>(
      `SELECT photo_url FROM produtos WHERE photo_url IS NOT NULL AND TRIM(photo_url) <> ''`
    );
    tally('produtos', produtos.rows.map((r) => r.photo_url));

    console.log('\n--- clientes.logo_url ---');
    const logos = await client.query<{ logo_url: string | null }>(
      `SELECT logo_url FROM clientes WHERE logo_url IS NOT NULL AND TRIM(logo_url) <> ''`
    );
    tally('clientes.logo_url', logos.rows.map((r) => r.logo_url));

    console.log('\n--- funcionarios.foto_url ---');
    const rh = await client.query<{ foto_url: string | null }>(
      `SELECT foto_url FROM funcionarios WHERE foto_url IS NOT NULL AND TRIM(foto_url) <> ''`
    );
    tally('funcionarios.foto_url', rh.rows.map((r) => r.foto_url));

    console.log('\n--- delivery_config (JSON): cardapio_online_logo_url + banner slots ---');
    const cfgRows = await client.query<{ delivery_config: string | null }>(
      `SELECT delivery_config FROM clientes WHERE delivery_config IS NOT NULL AND TRIM(delivery_config::text) <> ''`
    );
    const deliveryUrls: string[] = [];
    for (const row of cfgRows.rows) {
      let obj: unknown;
      try {
        obj = JSON.parse(String(row.delivery_config));
      } catch {
        continue;
      }
      if (!obj || typeof obj !== 'object') continue;
      const c = obj as Record<string, unknown>;
      const logo = c.cardapio_online_logo_url;
      if (typeof logo === 'string' && logo.trim()) deliveryUrls.push(logo);
      const banners = c.cardapio_online_banner_urls ?? c.cardapio_banner_slots;
      if (Array.isArray(banners)) {
        for (const u of banners) {
          if (typeof u === 'string' && u.trim()) deliveryUrls.push(u);
        }
      }
    }
    tally('delivery_config (URLs)', deliveryUrls);
  } finally {
    await client.end();
  }
}

function tally(label: string, urls: (string | null | undefined)[]) {
  const counts = {
    empty: 0,
    relative_uploads: 0,
    cloudinary: 0,
    other_https: 0,
    other: 0,
  };
  for (const u of urls) {
    counts[classifyUrl(u)]++;
  }
  const total = urls.length;
  console.log(`${label}: total=${total}`);
  console.log(
    `  /uploads ou relativo local: ${counts.relative_uploads} | Cloudinary: ${counts.cloudinary} | outras HTTPS: ${counts.other_https} | outro: ${counts.other}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
