/**
 * Normaliza `photo_url` de produto para uso em `<img src>` no browser.
 * URLs sem barra inicial (ex.: `uploads/x.jpg`) quebram em rotas aninhadas como `/delivery/:slug`
 * porque o browser resolve em relação ao path atual.
 * URLs absolutas antigas para `/uploads/...` em outro host são reduzidas ao path.
 */
export function normalizeProductPhotoPublicUrl(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\\/g, '/');

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const p = collapseSlashes(u.pathname || '/') || '/';
      if (p === '/uploads' || p.startsWith('/uploads/')) {
        s = p + (u.search || '');
      } else {
        return s;
      }
    } catch {
      return null;
    }
  } else if (s.startsWith('//')) {
    try {
      const u = new URL(`http:${s}`);
      const p = collapseSlashes(u.pathname || '/') || '/';
      if (p === '/uploads' || p.startsWith('/uploads/')) {
        s = p + (u.search || '');
      } else {
        return `https:${s}`;
      }
    } catch {
      return null;
    }
  }

  if (s.startsWith('./')) s = s.slice(1);
  if (!s.startsWith('/')) {
    if (s.startsWith('uploads/')) s = `/${s}`;
    else return null;
  }

  return collapseSlashes(s);
}

function collapseSlashes(p: string): string {
  return p.replace(/\/+/g, '/');
}
