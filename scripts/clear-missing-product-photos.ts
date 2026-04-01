/**
 * Zera `photo_url` em produtos cujo arquivo não existe (disco) e cuja URL é local `/uploads/...`.
 * URLs absolutas (S3/CDN) não são alteradas — use apenas após migrar ou em ambiente só disco.
 *
 * Uso:
 *   npx tsx scripts/clear-missing-product-photos.ts        # dry-run (padrão)
 *   npx tsx scripts/clear-missing-product-photos.ts --apply
 */
import 'dotenv/config';
import fs from 'fs';
import { Client } from 'pg';
import { resolveMigrationConnectionString } from '../src/db';
import { resolveNodePgSslConfig } from '../src/db/pgSsl';
import { resolveProductUploadDiskPath } from '../src/utils/productPhotoFs';
import { normalizeProductPhotoPublicUrl } from '../src/utils/productPhotoUrl';

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new Client({
    connectionString: resolveMigrationConnectionString(),
    connectionTimeoutMillis: 30000,
    ssl: resolveNodePgSslConfig(),
  });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: number; tenant_id: number; name: string; photo_url: string | null }>(
      'SELECT id, tenant_id, name, photo_url FROM produtos WHERE photo_url IS NOT NULL AND TRIM(photo_url) <> \'\' ORDER BY tenant_id, id'
    );

    const toClear: { id: number; tenant_id: number; name: string; raw: string }[] = [];

    for (const row of rows) {
      const raw = String(row.photo_url || '').trim();
      const norm = normalizeProductPhotoPublicUrl(raw);
      if (!norm) continue;
      if (/^https?:\/\//i.test(norm)) continue;
      const disk = resolveProductUploadDiskPath(raw);
      if (!disk) continue;
      if (!fs.existsSync(disk)) {
        toClear.push({ id: row.id, tenant_id: row.tenant_id, name: row.name, raw });
      }
    }

    console.log(`Produtos com /uploads/... e arquivo ausente: ${toClear.length} (${apply ? 'APLICANDO' : 'dry-run'})`);
    toClear.slice(0, 30).forEach((r) => console.log(`  tenant=${r.tenant_id} id=${r.id} ${r.name}`));
    if (toClear.length > 30) console.log(`  ... e mais ${toClear.length - 30}`);

    if (apply && toClear.length > 0) {
      for (const r of toClear) {
        await client.query('UPDATE produtos SET photo_url = NULL WHERE id = $1 AND tenant_id = $2', [r.id, r.tenant_id]);
      }
      console.log('photo_url limpo para esses registros.');
    } else if (!apply && toClear.length > 0) {
      console.log('Execute com --apply para gravar NULL em photo_url.');
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
