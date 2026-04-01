/**
 * Normalização e casamento de bairro com `delivery_config.zonas_entrega` (Configuração > Delivery > Zonas).
 * Usado no checkout público e no cardápio para manter a mesma regra no cliente e no servidor.
 */

export const MENSAGEM_ENTREGA_FORA_DA_AREA =
  'Ainda não fazemos entrega para essa região. Confira o bairro informado ou escolha retirada no local.';

/**
 * Normaliza o texto do bairro para comparação com o nome da zona:
 * trim, minúsculas, remove acentos, troca pontuação por espaço, colapsa espaços,
 * remove prefixo comum "bairro ".
 */
export function normalizeBairroForZonaMatch(value?: string | null): string {
  let s = String(value ?? '').trim();
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
 * Encontra zona compatível com o bairro informado (exato normalizado, depois inclusão parcial).
 */
export function findDeliveryZoneByBairro<T extends { nome: string }>(
  zonas: T[],
  bairro?: string | null
): T | null {
  const list = zonas.filter((z) => String(z?.nome ?? '').trim());
  const keyB = normalizeBairroForZonaMatch(bairro);
  if (!keyB) return null;

  for (const zona of list) {
    const keyZ = normalizeBairroForZonaMatch(zona.nome);
    if (keyZ && keyZ === keyB) return zona;
  }
  for (const zona of list) {
    const keyZ = normalizeBairroForZonaMatch(zona.nome);
    if (!keyZ) continue;
    if (keyB.includes(keyZ) || keyZ.includes(keyB)) return zona;
  }
  return null;
}
