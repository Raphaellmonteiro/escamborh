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

function buildMarks(p: CardapioPdfProduct, mode: CardapioPdfMode): string {
  const parts: string[] = [];
  if (Number(p.destaque) > 0) parts.push('<span class="mark" title="Destaque">⭐</span>');
  if (validPromo(p)) {
    if (mode === 'modern') {
      parts.push('<span class="mark mark--promo" title="Promoção">PROMOÇÃO</span>');
    } else {
      parts.push('<span class="mark" title="Promoção">🏷</span>');
    }
  }
  if (Number(p.mais_vendido) > 0) parts.push('<span class="mark" title="Mais vendidos">🏆</span>');
  if (parts.length === 0) return '';
  return `<span class="marks">${parts.join('')}</span>`;
}

function buildModernItem(p: CardapioPdfProduct): string {
  const marks = buildMarks(p, 'modern');
  const desc = (p.descricao || '').trim();
  const promo = validPromo(p);
  const orig = Number(p.preco_original);
  const priceBlock = promo
    ? `<div class="price-col">
         <span class="price">${escapeHtml(fmtPrecoCardapio(Number(p.price)))}</span>
         <span class="price-old">${escapeHtml(fmtPrecoCardapio(orig))}</span>
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
  const marks = buildMarks(p, 'simple');
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
        <p class="qr-title">Peça online</p>
        <p class="qr-sub">Aponte a câmera</p>
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
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const dateStrCompact = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
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
  .price{font-weight:700;color:#ea1d2c;white-space:nowrap;text-align:right;min-width:5.5rem}
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

  const dateLine = includeDate
    ? `<p class="hero-date"><span class="hero-date-label">Atualizado</span> ${escapeHtml(dateStrCompact)}</p>`
    : '';

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

  const watermark = logoResolved
    ? `<div class="wm" aria-hidden="true"><img src="${escapeHtml(logoResolved)}" alt="" /></div>`
    : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>${escapeHtml(estabelecimentoNome)} — Cardápio</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Ubuntu,sans-serif;margin:0;padding:0;color:#0f172a;font-size:14px;background:#f4f6f8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .doc{position:relative;max-width:640px;margin:0 auto;padding:40px 36px 52px;min-height:100vh}
  .doc-accent{position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:0 3px 3px 0;background:linear-gradient(180deg,#a02331 0%,#ea1d2c 45%,#e5e5e7 100%);opacity:.55}
  .wm{position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);width:min(320px,72vw);pointer-events:none;z-index:0}
  .wm img{display:block;width:100%;height:auto;object-fit:contain;opacity:.055;filter:grayscale(1)}
  .sheet{position:relative;z-index:1}
  .hero{display:flex;align-items:center;gap:20px;margin-bottom:40px;padding:22px 20px 26px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.05)}
  .brand-logo{flex-shrink:0;width:76px;height:76px;border-radius:16px;overflow:hidden;background:#f8fafc;display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0}
  .brand-logo img{width:100%;height:100%;object-fit:contain}
  .brand-fallback{font-size:28px;font-weight:900;color:#64748b}
  .hero-text{min-width:0;flex:1}
  .hero-title{font-size:27px;font-weight:900;letter-spacing:-0.03em;margin:0;line-height:1.12;color:#0f172a}
  .hero-tagline{margin:6px 0 0;font-size:12px;font-weight:700;color:#ea1d2c;text-transform:uppercase;letter-spacing:.04em}
  .hero-date{margin:10px 0 0;font-size:10px;color:#94a3b8;font-weight:500;line-height:1.4}
  .hero-date-label{color:#94a3b8;margin-right:4px;font-weight:600}
  .cat{margin-top:40px}
  .cat:first-of-type{margin-top:4px}
  .cat-title{display:inline-block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;color:#334155;margin:0 0 16px;padding:9px 16px;background:#eef2f6;border:1px solid #e2e8f0;border-radius:10px}
  .cat-body{display:flex;flex-direction:column;gap:14px}
  .dish{padding:18px 16px;background:#fff;border:1px solid #e8ecf1;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .dish-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px 20px}
  .dish-main{min-width:0;flex:1;display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 10px}
  .marks{display:inline-flex;gap:6px;flex-shrink:0;align-items:center;padding-top:2px}
  .mark{font-size:13px;line-height:1}
  .mark--promo{font-size:8px;font-weight:800;letter-spacing:.06em;color:#fff;background:#ea1d2c;padding:4px 8px;border-radius:5px;line-height:1;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .dish-name{font-size:16px;font-weight:900;margin:0;letter-spacing:-0.02em;line-height:1.3;color:#0f172a;flex:1;min-width:0}
  .dish-desc{margin:10px 0 0;font-size:11px;color:#64748b;line-height:1.45;font-weight:400;max-width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .price-col{flex-shrink:0;text-align:right;align-self:flex-start;min-width:7rem;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-start;gap:3px}
  .price{font-size:18px;font-weight:900;color:#ea1d2c;font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.15}
  .price-old{font-size:10px;color:#94a3b8;text-decoration:line-through;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .foot-qr{margin-top:52px;padding:28px 20px;background:#fff;border-radius:14px;border:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap}
  .qr-wrap{flex-shrink:0}
  .qr-img{display:block;width:120px;height:120px}
  .qr-copy{text-align:left;max-width:280px}
  .qr-title{margin:0;font-size:15px;font-weight:800;color:#0f172a}
  .qr-sub{margin:4px 0 0;font-size:12px;font-weight:600;color:#475569}
  .qr-url{margin:8px 0 0;font-size:9px;color:#94a3b8;word-break:break-all;line-height:1.35}
  @media print{
    body{background:#fff}
    .doc{padding:20px 22px 36px}
    .doc-accent{opacity:.45}
    .wm img{opacity:.04}
    .hero,.dish,.foot-qr{box-shadow:none}
    .foot-qr{break-inside:avoid}
    .cat{break-inside:avoid}
    .dish{break-inside:avoid}
  }
</style></head><body>
<div class="doc">
  <div class="doc-accent" aria-hidden="true"></div>
  ${watermark}
  <div class="sheet">
<header class="hero">
  ${headerLogo}
  <div class="hero-text">
    <h1 class="hero-title">${escapeHtml(estabelecimentoNome)}</h1>
    <p class="hero-tagline">Cardápio</p>
    ${dateLine}
  </div>
</header>
${sections}
${footer}
  </div>
</div>
${autoPrint ? '<script>window.onload=function(){window.print()}</script>' : ''}
</body></html>`;
}