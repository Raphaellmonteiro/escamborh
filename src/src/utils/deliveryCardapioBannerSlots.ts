/**
 * Normaliza os 4 slots de banner do cardápio online (índices 0–3 → slots visuais 1–4).
 * Aceita array, objeto legado com chaves "0".."3", ou string JSON.
 */
export function normalizeCardapioOnlineBannerSlots(raw: unknown): [string, string, string, string] {
  const out: [string, string, string, string] = ['', '', '', ''];
  if (raw === undefined || raw === null) return out;

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return out;
    try {
      return normalizeCardapioOnlineBannerSlots(JSON.parse(t));
    } catch {
      out[0] = t;
      return out;
    }
  }

  if (Array.isArray(raw)) {
    for (let i = 0; i < 4; i++) {
      const s = raw[i];
      out[i] = typeof s === 'string' ? s.trim() : '';
    }
    return out;
  }

  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (let i = 0; i < 4; i++) {
      const s = o[String(i)] ?? (o as Record<number, unknown>)[i];
      out[i] = typeof s === 'string' ? s.trim() : '';
    }
    return out;
  }

  return out;
}
