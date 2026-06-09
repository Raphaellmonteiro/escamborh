import { normalizeCardapioOnlineBannerSlots } from './deliveryCardapioBannerSlots';

/**
 * Converte o valor vindo do Postgres (`TEXT` ou `jsonb`) em objeto de configuração.
 * Com `jsonb`, o driver `pg` já devolve objeto — `JSON.parse` direto quebra ou,
 * pior, `String(obj)` → `"[object Object]"` invalida o parse e zera a config no merge.
 */
export function coerceDeliveryConfigRow(raw: unknown): Record<string, any> {
  if (raw == null) return {};

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, any>) };
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    return coerceDeliveryConfigRow(raw.toString('utf8'));
  }

  if (typeof raw !== 'string') return {};

  const t = raw.trim();
  if (!t) return {};

  try {
    let cur: unknown = JSON.parse(t);
    if (typeof cur === 'string') {
      const inner = cur.trim();
      if (inner.startsWith('{') && inner.endsWith('}')) {
        try {
          cur = JSON.parse(inner);
        } catch {
          /* mantém string */
        }
      }
    }
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      return { ...(cur as Record<string, any>) };
    }
    return {};
  } catch {
    return {};
  }
}

/** Garante `cardapio_online_banner_urls` como tupla de 4 strings no objeto persistido. */
export function applyNormalizedBannerSlots(cfg: Record<string, any>): void {
  const src =
    cfg.cardapio_online_banner_urls != null
      ? cfg.cardapio_online_banner_urls
      : cfg.cardapio_banner_slots;
  cfg.cardapio_online_banner_urls = [...normalizeCardapioOnlineBannerSlots(src)];
}

/**
 * Merge do PUT /api/delivery/config: não apaga chaves ausentes; mescla `automation` em profundidade;
 * `cardapio_online_banner_urls: null` não limpa banners já salvos.
 */
export function mergeDeliveryConfigClientPut(existing: Record<string, any>, rest: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...existing };

  for (const [k, v] of Object.entries(rest)) {
    if (k === 'cardapio_online_banner_urls' && v == null) continue;
    if (k === 'automation' && v != null && typeof v === 'object' && !Array.isArray(v)) {
      const prev =
        merged.automation != null && typeof merged.automation === 'object' && !Array.isArray(merged.automation)
          ? (merged.automation as Record<string, any>)
          : {};
      merged.automation = { ...prev, ...(v as Record<string, any>) };
      continue;
    }
    merged[k] = v;
  }

  applyNormalizedBannerSlots(merged);
  return merged;
}
