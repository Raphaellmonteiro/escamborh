/**
 * HTML para impressão / PDF do cardápio (janela + window.print).
 * Dois modos: simples (legado) e moderno (layout comercial).
 */

export type CardapioPdfMode = 'simple' | 'modern';

export interface CardapioPdfProduct {
  name: string;
  price: number;
  category: string;
  active: number;
  descricao?: string | null;
  destaque?: number;
  em_promocao?: number;
  preco_original?: number | null;
  ordem?: number;
  mais_vendido?: number;
}

export interface BuildCardapioPdfHtmlParams {
  mode: CardapioPdfMode;
  products: CardapioPdfProduct[];
  estabelecimentoNome: string;
  logoUrl?: string | null;
  /** Ex.: https://seudominio.com */
  origin: string;
  deliverySlug?: string | null;
  /** Só afeta o modo moderno */
  includeDate?: boolean;
  /** Se false, não chama window.print ao carregar (útil para preview estático) */
  autoPrint?: boolean;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtPrecoCardapio(v: number): string {
  return `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function validPromo(p: CardapioPdfProduct): boolean {
  if (!p.em_promocao) return false;
  const orig = Number(p.preco_original);
  const cur = Number(p.price);
  return Number.isFinite(orig) && orig > cur;
}

/** Prioridade: destaque → promoção válida → demais; depois ordem e nome. */
export function sortCardapioProducts(products: CardapioPdfProduct[]): CardapioPdfProduct[] {
  const tier = (p: CardapioPdfProduct) => {
    if (Number(p.destaque) > 0) return 0;
    if (validPromo(p)) return 1;
    return 2;
  };
  return [...products].sort((a, b) => {
    const td = tier(a) - tier(b);
    if (td !== 0) return td;
    const oa = Number(a.ordem) || 0;
    const ob = Number(b.ordem) || 0;
    if (oa !== ob) return oa - ob;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
  });
}

function resolveAssetUrl(origin: string, url: string | null | undefined): string | null {
  if (!url || !String(url).trim()) return null;
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = origin.replace(/\/$/, '');
  const path = u.startsWith('/') ? u : `/${u}`;
  return `${base}${path}`;
}

function buildMarks(p: CardapioPdfProduct): string {
  const parts: string[] = [];
  if (Number(p.destaque) > 0) parts.push('<span class="mark" title="Destaque">⭐</span>');
  if (validPromo(p)) parts.push('<span class="mark" title="Promoção">🏷</span>');
  if (Number(p.mais_vendido) > 0) parts.push('<span class="mark" title="Mais vendidos">🏆</span>');
  if (parts.length === 0) return '';
  return `<span class="marks">${parts.join('')}</span>`;
}

function buildModernItem(p: CardapioPdfProduct): string {
  const marks = buildMarks(p);
  const desc = (p.descricao || '').trim();
  const promo = validPromo(p);
  const orig = Number(p.preco_original);
  const priceBlock = promo
    ? `<div class="price-col">
         <span class="price-old">${escapeHtml(fmtPrecoCardapio(orig))}</span>
         <span class="price">${escapeHtml(fmtPrecoCardapio(Number(p.price)))}</span>
       </div>`
    : `<div class="price-col"><span class="price">${escapeHtml(fmtPrecoCardapio(Number(p.price)))}</span></div>`;

  return `
    <article class="dish">
      <div class="dish-top">
        <div class="dish-main">
          ${marks}
          <h3 class="dish-name">${escapeHtml(p.name)}</h3>
        </div>
        ${priceBlock}
      </div>
      ${desc ? `<p class="dish-desc">${escapeHtml(desc)}</p>` : ''}
    </article>`;
}

function buildSimpleItem(p: CardapioPdfProduct): string {
  const marks = buildMarks(p);
  const desc = (p.descricao || '').trim();
  return `
    <div class="item">
      <div class="item-body">
        <div class="name-line">${marks}${marks ? ' ' : ''}<span class="name">${escapeHtml(p.name)}</span></div>
        ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
      </div>
      <div class="price">${escapeHtml(fmtPrecoCardapio(Number(p.price)))}</div>
    </div>`;
}

function buildFooterQr(origin: string, slug: string | null | undefined): string {
  const s = (slug || '').trim();
  if (!s) return '';
  const url = `${origin.replace(/\/$/, '')}/delivery/${encodeURIComponent(s)}`;
  const qrSrc = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=200&dark=000000&light=ffffff&margin=2`;
  return `
    <footer class="foot-qr">
      <div class="qr-wrap">
        <img class="qr-img" src="${escapeHtml(qrSrc)}" alt="QR Code delivery" width="120" height="120" />
      </div>
      <div class="qr-copy">
        <p class="qr-title">Peça online pelo QR Code</p>
        <p class="qr-url">${escapeHtml(url)}</p>
      </div>
    </footer>`;
}

export function buildCardapioPdfHtml(params: BuildCardapioPdfHtmlParams): string {
  const {
    mode,
    products,
    estabelecimentoNome,
    logoUrl,
    origin,
    deliverySlug,
    includeDate = true,
    autoPrint = true,
  } = params;

  const active = products.filter((p) => Number(p.active) === 1);
  const sorted = sortCardapioProducts(active);
  const cats = [...new Set(sorted.map((p) => p.category || 'Geral'))];

  const logoResolved = resolveAssetUrl(origin, logoUrl);
  const dateStr = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  if (mode === 'simple') {
    const body = cats
      .map((cat) => {
        const items = sorted.filter((p) => p.category === cat).map(buildSimpleItem).join('');
        return `<h2>${escapeHtml(cat)}</h2>${items}`;
      })
      .join('');

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>${escapeHtml(estabelecimentoNome)} — Cardápio</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111;font-size:12px;max-width:720px;margin:0 auto}
  h1{font-size:22px;font-weight:900;margin-bottom:4px}
  h2{font-size:14px;font-weight:700;color:#555;margin:22px 0 10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e4e4e7;padding-bottom:4px}
  .item{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:10px 0;border-bottom:1px solid #f4f4f5}
  .item-body{min-width:0;flex:1}
  .name-line{display:flex;align-items:center;flex-wrap:wrap;gap:4px}
  .name{font-weight:600;font-size:13px}
  .marks{display:inline-flex;gap:4px;font-size:11px}
  .price{font-weight:700;color:#16a34a;white-space:nowrap;text-align:right;min-width:5.5rem}
  .desc{font-size:10px;color:#888;margin-top:4px;line-height:1.4}
  .sub{color:#888;font-size:11px;margin-bottom:18px}
  @media print{body{padding:16px}}
</style></head><body>
<h1>${escapeHtml(estabelecimentoNome)}</h1>
<p class="sub">Gerado em ${escapeHtml(dateStr)}</p>
    ${body}
${autoPrint ? '<script>window.onload=function(){window.print()}</script>' : ''}
</body></html>`;
  }

  const headerLogo = logoResolved
    ? `<div class="brand-logo"><img src="${escapeHtml(logoResolved)}" alt="" /></div>`
    : `<div class="brand-logo brand-fallback">${escapeHtml((estabelecimentoNome || 'F').slice(0, 1).toUpperCase())}</div>`;

  const dateLine = includeDate ? `<p class="hero-date">${escapeHtml(dateStr)}</p>` : '';

  const sections = cats
    .map((cat) => {
      const dishes = sorted.filter((p) => p.category === cat).map(buildModernItem).join('');
      return `
        <section class="cat">
          <h2 class="cat-title">${escapeHtml(cat)}</h2>
          <div class="cat-body">${dishes}</div>
        </section>`;
    })
    .join('');

  const footer = buildFooterQr(origin, deliverySlug);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>${escapeHtml(estabelecimentoNome)} — Cardápio</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Ubuntu,sans-serif;margin:0;padding:40px 36px 48px;color:#0f172a;font-size:14px;background:#fff;max-width:640px;margin-left:auto;margin-right:auto}
  .hero{display:flex;align-items:center;gap:20px;margin-bottom:36px;padding-bottom:28px;border-bottom:1px solid #e2e8f0}
  .brand-logo{flex-shrink:0;width:72px;height:72px;border-radius:16px;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center}
  .brand-logo img{width:100%;height:100%;object-fit:contain}
  .brand-fallback{font-size:28px;font-weight:900;color:#64748b}
  .hero-text{min-width:0;flex:1}
  .hero-title{font-size:26px;font-weight:900;letter-spacing:-0.02em;margin:0;line-height:1.15}
  .hero-date{margin:8px 0 0;font-size:12px;color:#64748b;font-weight:500}
  .cat{margin-top:32px}
  .cat:first-of-type{margin-top:8px}
  .cat-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:#64748b;margin:0 0 14px;padding-bottom:10px;border-bottom:3px solid #0f172a}
  .dish{padding:16px 0;border-bottom:1px solid #f1f5f9}
  .dish:last-child{border-bottom:none}
  .dish-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
  .dish-main{min-width:0;flex:1;display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px}
  .marks{display:inline-flex;gap:6px;flex-shrink:0}
  .mark{font-size:13px;line-height:1}
  .dish-name{display:inline;font-size:16px;font-weight:800;margin:0;letter-spacing:-0.02em;line-height:1.35;flex:1;min-width:0}
  .dish-desc{margin:8px 0 0;font-size:11px;color:#64748b;line-height:1.5;font-weight:400;max-width:42em}
  .price-col{flex-shrink:0;text-align:right;min-width:6.5rem}
  .price{display:block;font-size:16px;font-weight:800;color:#0d9488;font-variant-numeric:tabular-nums;white-space:nowrap}
  .price-old{display:block;font-size:11px;color:#94a3b8;text-decoration:line-through;font-weight:600;margin-bottom:2px;font-variant-numeric:tabular-nums}
  .foot-qr{margin-top:48px;padding-top:28px;border-top:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap}
  .qr-wrap{flex-shrink:0}
  .qr-img{display:block;width:120px;height:120px}
  .qr-copy{text-align:left;max-width:280px}
  .qr-title{margin:0;font-size:14px;font-weight:800;color:#0f172a}
  .qr-url{margin:6px 0 0;font-size:10px;color:#64748b;word-break:break-all;line-height:1.4}
  @media print{
    body{padding:20px 24px 32px}
    .foot-qr{break-inside:avoid}
    .cat{break-inside:avoid}
  }
</style></head><body>
<header class="hero">
  ${headerLogo}
  <div class="hero-text">
    <h1 class="hero-title">${escapeHtml(estabelecimentoNome)}</h1>
    ${dateLine}
  </div>
</header>
${sections}
${footer}
${autoPrint ? '<script>window.onload=function(){window.print()}</script>' : ''}
</body></html>`;
}
