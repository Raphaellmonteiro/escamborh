/**
 * Lista produtos cujo photo_url no banco não corresponde a arquivo existente em disco.
 * URLs remotas (ex.: Cloudinary, S3 público) não têm arquivo local — aparecem como "remoto".
 * Uso: npx tsx scripts/check-product-photos.ts
 * Requer DATABASE_URL (ou DATABASE_MIGRATION_URL). Caminhos usam UPLOADS_ROOT (cwd/uploads).
 */
import 'dotenv/config';
import fs from 'fs';
import { Client } from 'pg';
import { resolveMigrationConnectionString } from '../src/db';
import { resolveNodePgSslConfig } from '../src/db/pgSsl';
import { resolveProductUploadDiskPath } from '../src/utils/productPhotoFs';
import { normalizeProductPhotoPublicUrl } from '../src/utils/productPhotoUrl';

async function main() {
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

    const emptyNorm: { id: number; tenant_id: number; name: string; raw: string }[] = [];
    const remoteUrls: { id: number; tenant_id: number; name: string; raw: string }[] = [];
    const noDiskPath: { id: number; tenant_id: number; name: string; raw: string }[] = [];
    const missingFile: { id: number; tenant_id: number; name: string; raw: string; disk: string }[] = [];

    for (const row of rows) {
      const raw = String(row.photo_url || '').trim();
      const norm = normalizeProductPhotoPublicUrl(raw);
      if (!norm) {
        emptyNorm.push({ id: row.id, tenant_id: row.tenant_id, name: row.name, raw });
        continue;
      }
      const disk = resolveProductUploadDiskPath(raw);
      if (!disk) {
        if (/^https?:\/\//i.test(norm)) {
          remoteUrls.push({ id: row.id, tenant_id: row.tenant_id, name: row.name, raw });
        } else {
          noDiskPath.push({ id: row.id, tenant_id: row.tenant_id, name: row.name, raw });
        }
        continue;
      }
      if (!fs.existsSync(disk)) {
        missingFile.push({ id: row.id, tenant_id: row.tenant_id, name: row.name, raw, disk });
      }
    }

    console.log(`Total com photo_url preenchido: ${rows.length}`);
    console.log(`URL inválida / não normalizável: ${emptyNorm.length}`);
    console.log(`URL remota (sem arquivo local esperado): ${remoteUrls.length}`);
    console.log(`Path local fora de uploads/ ou inválido: ${noDiskPath.length}`);
    console.log(`Arquivo ausente no disco (/uploads/...): ${missingFile.length}`);
    if (emptyNorm.length) {
      console.log('\n--- Inválidas / não normalizáveis (amostra até 20) ---');
      emptyNorm.slice(0, 20).forEach((r) => console.log(`tenant=${r.tenant_id} id=${r.id} name=${r.name} raw=${JSON.stringify(r.raw)}`));
    }
    if (noDiskPath.length) {
      console.log('\n--- Path não resolvido (amostra até 20) ---');
      noDiskPath.slice(0, 20).forEach((r) => console.log(`tenant=${r.tenant_id} id=${r.id} raw=${JSON.stringify(r.raw)}`));
    }
    if (missingFile.length) {
      console.log('\n--- Arquivo não existe (amostra até 50) ---');
      missingFile.slice(0, 50).forEach((r) =>
        console.log(`tenant=${r.tenant_id} id=${r.id} url=${r.raw} esperado=${r.disk}`)
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
