import path from 'path';
import { normalizeProductPhotoPublicUrl } from './productPhotoUrl';

/** Caminho absoluto no disco para arquivo em `uploads/` (exclusão segura; evita path traversal). */
export function resolveProductUploadDiskPath(raw: string | null | undefined): string | null {
  const url = normalizeProductPhotoPublicUrl(raw);
  if (!url || !(url === '/uploads' || url.startsWith('/uploads/'))) return null;
  const parts = url.slice(1).split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'uploads') return null;
  const full = path.resolve(process.cwd(), ...parts);
  const root = path.resolve(process.cwd(), 'uploads');
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}
