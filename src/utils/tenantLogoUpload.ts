import fs from 'fs';
import path from 'path';
import { q1 } from '../db';
import { shouldResolveTenantLogoFromDiskFallback } from '../services/imageUploadPolicy';
import { UPLOADS_ROOT } from '../uploadsRoot';

export function getTenantLogoDir(): string {
  return path.join(UPLOADS_ROOT, 'logo');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Legacy: `logo_{tenantId}.ext`
 * Novo: `logo_{tenantId}_{random}.ext`
 */
export function isTenantLogoBasename(tenantId: number | string, basename: string): boolean {
  const id = String(tenantId);
  if (basename.startsWith(`logo_${id}_`)) return true;
  return new RegExp(`^logo_${escapeRegex(id)}\\.[^.]+$`).test(basename);
}

export function listTenantLogoFiles(tenantId: number | string): string[] {
  const dir = getTenantLogoDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => isTenantLogoBasename(tenantId, f));
}

/**
 * URL pública do logo: coluna `clientes.logo_url` (Cloudinary, S3 ou `/uploads/logo/...`).
 * Se vazia, em dev ou com escape hatch de volume, ainda pode inferir o arquivo mais recente em disco (legado).
 */
export async function resolveTenantLogoPublicUrl(
  tenantId: number | string | undefined | null
): Promise<string | null> {
  if (tenantId === undefined || tenantId === null) return null;
  const row = await q1<{ logo_url: string | null }>('SELECT logo_url FROM clientes WHERE id=?', [tenantId]);
  const fromDb = String(row?.logo_url || '').trim();
  if (fromDb) return fromDb;

  if (!shouldResolveTenantLogoFromDiskFallback()) return null;

  const files = listTenantLogoFiles(tenantId);
  if (files.length === 0) return null;
  const dir = getTenantLogoDir();
  const scored = files.map((f) => {
    try {
      return { f, m: fs.statSync(path.join(dir, f)).mtimeMs };
    } catch {
      return { f, m: 0 };
    }
  });
  scored.sort((a, b) => b.m - a.m);
  return `/uploads/logo/${scored[0].f}`;
}

/** Remove todos os logos do tenant exceto `keepBasename` (após upload bem-sucedido). */
export function unlinkTenantLogosExcept(tenantId: number | string, keepBasename: string): void {
  const dir = getTenantLogoDir();
  if (!fs.existsSync(dir)) return;
  for (const f of listTenantLogoFiles(tenantId)) {
    if (f === keepBasename) continue;
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* ignore */
    }
  }
}

export function unlinkAllTenantLogos(tenantId: number | string): void {
  const dir = getTenantLogoDir();
  if (!fs.existsSync(dir)) return;
  for (const f of listTenantLogoFiles(tenantId)) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* ignore */
    }
  }
}
