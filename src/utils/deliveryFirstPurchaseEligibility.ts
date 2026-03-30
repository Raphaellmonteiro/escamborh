/**
 * Elegibilidade antifraude para desconto de "primeira compra" no delivery público.
 *
 * Pedido válido para histórico (não conta cancelado; considera canais do cardápio online):
 * - cancelado_at IS NULL
 * - status textual diferente de "cancelado" (case-insensitive)
 * - canal ∈ { delivery, retirada }
 *
 * Não inclui balcão/mesa: o benefício é do fluxo online; evita negar desconto por telefone
 * reutilizado em venda presencial sem relação com o cardápio.
 */

export const PRIMEIRA_COMPRA_CANAIS_HISTORICO = ['delivery', 'retirada'] as const;

/** Trecho SQL reutilizável (alias da tabela deve ser `p`). */
export const PRIMEIRA_COMPRA_PEDIDO_VALIDO_SQL = `
  p.cancelado_at IS NULL
  AND LOWER(TRIM(COALESCE(p.status, ''))) <> 'cancelado'
  AND (p.canal = 'delivery' OR p.canal = 'retirada')
`.replace(/\s+/g, ' ').trim();

export function isPedidoValidoParaHistoricoPrimeiraCompra(row: {
  cancelado_at?: unknown;
  status?: unknown;
  canal?: unknown;
}): boolean {
  if (row.cancelado_at != null) return false;
  const st = String(row.status || '').trim().toLowerCase();
  if (st === 'cancelado') return false;
  const canal = String(row.canal || '').trim().toLowerCase();
  return canal === 'delivery' || canal === 'retirada';
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function squashSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Dígitos com código do país opcional; adequado a telefones salvos no FlowPDV (só dígitos). */
export function normalizeBrazilDeliveryPhoneDigits(input: string | null | undefined): string {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d;
}

const LOG_TIPO_CANON: Record<string, string> = {
  r: 'rua',
  'r.': 'rua',
  rua: 'rua',
  av: 'avenida',
  'av.': 'avenida',
  avn: 'avenida',
  'avn.': 'avenida',
  avenida: 'avenida',
  trav: 'travessa',
  'trav.': 'travessa',
  tv: 'travessa',
  'tv.': 'travessa',
  travessa: 'travessa',
  al: 'alameda',
  'al.': 'alameda',
  alameda: 'alameda',
  pc: 'praca',
  'pc.': 'praca',
  pç: 'praca',
  'pç.': 'praca',
  praca: 'praca',
  praça: 'praca',
  rod: 'rodovia',
  'rod.': 'rodovia',
  rodovia: 'rodovia',
  est: 'estrada',
  'est.': 'estrada',
  estrada: 'estrada',
  conj: 'conjunto',
  'conj.': 'conjunto',
  conjunto: 'conjunto',
  via: 'via',
  'via.': 'via',
  vq: 'via',
  'vq.': 'via',
};

function expandLeadingLogradouroTipo(s: string): string {
  const parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return s;
  const rawFirst = parts[0].toLowerCase();
  const key = rawFirst.endsWith('.') ? rawFirst.slice(0, -1) : rawFirst;
  const key2 = parts[0].toLowerCase();
  const canon = LOG_TIPO_CANON[key] || LOG_TIPO_CANON[key2] || LOG_TIPO_CANON[rawFirst];
  if (!canon) return s;
  const rest = parts.slice(1).join(' ');
  return squashSpaces([canon, rest].filter(Boolean).join(' '));
}

/** Número: ignora rótulos nº/numero; preserva alfanuméricos (ex. 12A, bloco). */
export function normalizeNumeroEnderecoAntiFraud(raw: string | null | undefined): string {
  let s = stripDiacritics(String(raw || '')).toLowerCase();
  s = s.replace(/\b(n|no|nº|n°|num|numero|nr|nro)\b\.?/gi, ' ');
  s = s.replace(/[^\da-z]/gi, '');
  if (/^(sn|semnumero)$/.test(s)) return 'sn';
  return s;
}

function normalizeLogradouroAntiFraud(raw: string | null | undefined): string {
  let s = stripDiacritics(String(raw || '').trim()).toLowerCase();
  s = s.replace(/[.,;:'"!?_]+/g, ' ');
  s = s.replace(/[\-–—]+/g, ' ');
  s = squashSpaces(s);
  s = expandLeadingLogradouroTipo(s);
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return squashSpaces(s);
}

function normalizeBairroAntiFraud(raw: string | null | undefined): string {
  let s = stripDiacritics(String(raw || '').trim()).toLowerCase();
  s = s.replace(/['´`^~]+/g, '');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return squashSpaces(s);
}

/**
 * Assinatura estável para comparação antifraude (logradouro + número + bairro).
 * Complemento, referência e label não entram. Retorna null se faltar base mínima.
 */
export function buildDeliveryAddressAntiFraudSignature(parts: {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
}): string | null {
  const log = normalizeLogradouroAntiFraud(parts.logradouro);
  const num = normalizeNumeroEnderecoAntiFraud(parts.numero);
  const bai = normalizeBairroAntiFraud(parts.bairro);
  if (!log || !num || !bai) return null;
  return `${log}|${num}|${bai}`;
}

/**
 * Interpreta texto gerado por `formatSavedDeliveryAddress` no backend
 * (logradouro + número, Compl, Bairro:, Ref).
 */
export function parseFormattedDeliveryEnderecoPedido(text: string | null | undefined): {
  logradouro: string;
  numero: string;
  bairro: string;
} | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const chunks = raw.split(/\s*-\s*/).map((c) => c.trim()).filter(Boolean);
  if (!chunks.length) return null;

  let bairro = '';
  const rest: string[] = [];
  for (const c of chunks) {
    const bm = c.match(/^bairro:\s*(.+)$/i);
    if (bm) {
      bairro = bm[1].trim();
      continue;
    }
    if (/^compl:/i.test(c) || /^ref:/i.test(c)) continue;
    rest.push(c);
  }

  const head = rest[0] || '';
  if (!head) return null;

  const comma = head.lastIndexOf(',');
  let logradouro: string;
  let numero: string;
  if (comma > 0) {
    logradouro = head.slice(0, comma).trim();
    numero = head.slice(comma + 1).trim();
  } else {
    const m = head.match(/^(.+?)\s+(\d+[a-z]?|[a-z]?\d+)$/i);
    if (m) {
      logradouro = m[1].trim();
      numero = m[2].trim();
    } else {
      return null;
    }
  }

  if (!logradouro || !numero || !bairro) return null;
  return { logradouro, numero, bairro };
}

export function signatureFromPedidoEnderecoFields(row: {
  endereco?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
}): string | null {
  if (row.logradouro != null && String(row.logradouro).trim()) {
    return buildDeliveryAddressAntiFraudSignature({
      logradouro: row.logradouro,
      numero: row.numero,
      bairro: row.bairro,
    });
  }
  const parsed = parseFormattedDeliveryEnderecoPedido(row.endereco);
  if (!parsed) return null;
  return buildDeliveryAddressAntiFraudSignature(parsed);
}
