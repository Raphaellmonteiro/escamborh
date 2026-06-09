/**
 * Normalização e casamento de bairro com `delivery_config.zonas_entrega` (Configuração > Delivery > Zonas).
 * Usado no checkout público e no cardápio para manter a mesma regra no cliente e no servidor.
 */

export const MENSAGEM_ENTREGA_FORA_DA_AREA =
  'Ainda não fazemos entrega para essa região. Confira o bairro informado ou escolha retirada no local.';

/** Tamanho mínimo do trecho mais curto para permitir match por inclusão (evita ruído com 1–2 letras). */
const MIN_LEN_SUBSTRING_MATCH = 3;

/**
 * Normaliza o texto do bairro (ou nome da zona) para comparação:
 * trim, minúsculas, remove acentos, troca pontuação por espaço, colapsa espaços,
 * remove prefixo comum "bairro ", trata NBSP como espaço.
 */
export function normalizeBairroForZonaMatch(value?: string | null): string {
  let s = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!s) return '';
  s = s.toLowerCase();
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  s = s.replace(/[.,;:!?'"_\-–—/\\|()[\]{}]+/gu, ' ');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const prefix = 'bairro ';
  if (s.startsWith(prefix)) s = s.slice(prefix.length).trim();
  return s;
}

/**
 * Chaves de comparação derivadas do texto informado (CEP, digitação do cliente, etc.).
 * Inclui o texto completo e, se houver vírgula, o trecho antes dela — ex.: "Feitosa, Maceió" → também "feitosa".
 */
export function bairroMatchCandidates(value?: string | null): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const keys = new Set<string>();
  const full = normalizeBairroForZonaMatch(raw);
  if (full) keys.add(full);
  const commaIdx = raw.indexOf(',');
  if (commaIdx !== -1) {
    const head = normalizeBairroForZonaMatch(raw.slice(0, commaIdx));
    if (head) keys.add(head);
  }
  return [...keys];
}

/**
 * Compara dois textos já normalizados (zona vs bairro):
 * igualdade, ou inclusão em qualquer direção, com piso de tamanho no trecho mais curto.
 */
export function deliveryBairroZonaMatch(keyZona: string, keyBairro: string): boolean {
  const z = keyZona.trim();
  const b = keyBairro.trim();
  if (!z || !b) return false;
  if (z === b) return true;
  const shorter = z.length <= b.length ? z : b;
  const longer = z.length <= b.length ? b : z;
  if (shorter.length < MIN_LEN_SUBSTRING_MATCH) return false;
  return longer.includes(shorter);
}

function zonaMatchKeys(nomeZona: string): string[] {
  return bairroMatchCandidates(nomeZona);
}

/**
 * Encontra zona compatível com o bairro informado (igualdade normalizada e inclusão parcial simétrica).
 */
export function findDeliveryZoneByBairro<T extends { nome: string }>(
  zonas: T[],
  bairro?: string | null
): T | null {
  const list = zonas.filter((z) => String(z?.nome ?? '').trim());
  const bairroKeys = bairroMatchCandidates(bairro);
  if (bairroKeys.length === 0) return null;

  for (const zona of list) {
    const zonaKeys = zonaMatchKeys(zona.nome);
    for (const keyZ of zonaKeys) {
      if (!keyZ) continue;
      for (const keyB of bairroKeys) {
        if (deliveryBairroZonaMatch(keyZ, keyB)) return zona;
      }
    }
  }
  return null;
}
