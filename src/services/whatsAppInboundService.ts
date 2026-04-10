import { q1, qRun, qAll } from '../db';
import { getInstanceByName } from '../repositories/whatsappRepository';
import { logError, logInfo } from '../utils/logger';
import {
  findDeliveryZoneByBairro,
  MENSAGEM_ENTREGA_FORA_DA_AREA,
  normalizeBairroForZonaMatch,
} from '../utils/deliveryBairroZona';
import {
  resolveConfiguredWhatsAppNumbersFromProviderConfigJson,
  sendWhatsAppMessage,
} from './whatsAppSenderService';
import {
  getTenantWhatsAppConnectionConfig,
  type TenantWhatsAppConnectionConfig,
} from './tenantWhatsAppConfigService';
import { whatsAppChatbotService } from './whatsAppChatbotService';

type TenantWhatsAppConfigRow = {
  tenant_id?: number | string;
  whatsapp_enabled?: number | boolean | string | null;
  provider?: string | null;
  provider_config_json?: string | null;
  whatsapp_number?: string | null;
};

type TenantInboundAutoReplyRow = {
  id: number | string;
  usuario?: string | null;
  nome_estabelecimento?: string | null;
  delivery_ativo?: number | boolean | string | null;
  delivery_config?: string | null;
  pix_enabled?: number | boolean | string | null;
};

type PaymentMethodRow = {
  method?: string | null;
};

type OrderStatusLookupRow = {
  id: number | string;
  order_number?: string | null;
  status?: string | null;
  cliente_tel?: string | null;
};

type JsonRecord = Record<string, unknown>;
type ProviderConfigRecord = Record<string, unknown>;

type SimpleInboundIntent =
  | 'saudacao'
  | 'cardapio'
  | 'pix'
  | 'pagamento'
  | 'entrega'
  | 'bairro'
  | 'taxa_entrega'
  | 'zona_entrega'
  | 'status_pedido'
  | 'atendente';

type DeliveryZoneInfo = {
  nome: string;
  taxa: number;
};

type RegisterInboundWhatsAppMessagesInput = {
  tenantId: number | string;
  payload: unknown;
  webhookEventName?: string | null;
};

type NormalizedInboundWhatsAppMessage = {
  tenant_id: number;
  provider: string;
  customer_phone: string;
  customer_name: string | null;
  message_text: string;
  provider_message_id: string | null;
  created_at: string;
  payload_json: string;
};

type SavedInboundWhatsAppMessage = NormalizedInboundWhatsAppMessage & {
  id: number;
};

type WhatsAppHumanHandoffRow = {
  id: number | string;
  human_handoff_active?: number | boolean | string | null;
  handoff_reason?: string | null;
  handoff_created_at?: string | null;
};

export type RegisterInboundWhatsAppMessagesResult = {
  accepted: boolean;
  reason: string | null;
  provider: string | null;
  savedCount: number;
  ignoredCount: number;
};

const HUMAN_HANDOFF_TTL_HOURS = 4;
const EVOLUTION_SUPPORTED_INBOUND_EVENTS = new Set(['messages.upsert', 'message.upsert']);

const HUMAN_HANDOFF_KEYWORDS = [
  'cancelar',
  'cancelamento',
  'reclamacao',
  'problema',
  'erro',
  'humano',
  'pessoa',
] as const;

const BASIC_AUTO_REPLY_INTENTS = new Set<SimpleInboundIntent>([
  'saudacao',
  'cardapio',
  'pix',
  'pagamento',
  'entrega',
  'bairro',
  'taxa_entrega',
  'zona_entrega',
]);

function getRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeTextForMatch(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: number | string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeProviderName(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  return normalized.toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeWhatsAppPhone(rawValue: unknown) {
  const base = normalizeOptionalText(rawValue);
  if (!base) return null;

  const withoutJid = base.split('@')[0];
  const digits = withoutJid.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length < 10) return null;
  return digits;
}

function isEvolutionLidIdentifier(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return normalized.includes('@lid');
}

function isTrustedBrazilWhatsAppPhone(value: string | null) {
  if (!value) return false;
  return value.startsWith('55') && (value.length === 12 || value.length === 13);
}

function normalizeTimestamp(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1e12 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }

  const text = String(value).trim();
  if (!text) return new Date().toISOString();

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      const millis = text.length <= 10 ? numeric * 1000 : numeric;
      return new Date(millis).toISOString();
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ invalid_payload: true });
  }
}

function getFirstName(value: string | null) {
  const firstName = String(value || '').trim().split(/\s+/)[0];
  return firstName || null;
}

function getGreeting(name: string | null) {
  const firstName = getFirstName(name);
  return firstName ? `Ola, ${firstName}!` : 'Ola!';
}

function maskPhone(rawPhone: string | null) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits || null;
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

function summarizeText(value: unknown, maxLength = 180) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function extractPayloadEventName(payload: unknown) {
  const root = getRecord(payload);
  return normalizeOptionalText(root?.event ?? root?.type ?? root?.webhookType);
}

function normalizeWebhookEventName(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  return normalized
    .toLowerCase()
    .replace(/[\s/_-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function resolveInboundEventName(webhookEventName: unknown, payload: unknown) {
  return (
    normalizeWebhookEventName(webhookEventName) ||
    normalizeWebhookEventName(extractPayloadEventName(payload))
  );
}

function isSupportedEvolutionInboundEvent(eventName: string | null) {
  return !eventName || EVOLUTION_SUPPORTED_INBOUND_EVENTS.has(eventName);
}

function resolveTenantIdFromInstanceName(instanceName: string) {
  const match = /^tenant_(\d+)_/i.exec(instanceName);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveTenantContext(
  routeTenantIdValue: number | string,
  payload: unknown
) {
  const routeTenantId = parsePositiveInt(routeTenantIdValue);
  const root = getRecord(payload);
  const instance = normalizeOptionalText(root?.instance);
  const instanceRecord = instance ? await getInstanceByName(instance).catch(() => null) : null;
  const payloadTenantId = instance
    ? instanceRecord?.tenantId ?? resolveTenantIdFromInstanceName(instance)
    : null;

  if (routeTenantId && payloadTenantId && routeTenantId !== payloadTenantId) {
    return {
      tenantId: null,
      routeTenantId,
      payloadTenantId,
      instance,
      conflict: true,
    };
  }

  return {
    tenantId: routeTenantId ?? payloadTenantId,
    routeTenantId,
    payloadTenantId,
    instance,
    conflict: false,
  };
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasStandaloneKeyword(text: string, keyword: string) {
  if (!keyword.includes(' ')) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}(?=[^a-z0-9]|$)`, 'i').test(text);
  }

  return text.includes(keyword);
}

function isBasicAutoReplyIntent(intent: SimpleInboundIntent | null) {
  return !!intent && BASIC_AUTO_REPLY_INTENTS.has(intent);
}

function shouldBypassKeywordErroActiveHandoff(input: {
  activeReason: string | null;
  currentReason: string | null;
  intent: SimpleInboundIntent | null;
}) {
  return (
    input.activeReason === 'keyword_erro' &&
    !input.currentReason &&
    isBasicAutoReplyIntent(input.intent)
  );
}

function parseDateMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function resolveHumanHandoffReason(messageText: string, intent: SimpleInboundIntent | null) {
  if (intent === 'atendente') {
    return 'intent_atendente';
  }

  const normalized = normalizeTextForMatch(messageText);
  if (!normalized) return null;

  const matchedKeyword = HUMAN_HANDOFF_KEYWORDS.find((keyword) =>
    hasStandaloneKeyword(normalized, keyword)
  );
  return matchedKeyword ? `keyword_${matchedKeyword}` : null;
}

function classifySimpleIntent(messageText: string): SimpleInboundIntent | null {
  const normalized = normalizeTextForMatch(messageText);
  if (!normalized) return null;

  if (
    includesAny(normalized, [
      'atendente',
      'humano',
      'pessoa',
      'suporte',
      'falar com alguem',
      'falar com atendente',
      'falar com humano',
      'gerente',
    ])
  ) {
    return 'atendente';
  }

  if (
    includesAny(normalized, [
      'status',
      'rastre',
      'rastreamento',
      'acompanh',
      'andamento',
      'onde esta',
      'onde ta',
      'numero do pedido',
      'numero pedido',
    ]) ||
    /\b[a-z]\d{6}-\d{2,4}\b/i.test(normalized)
  ) {
    return 'status_pedido';
  }

  if (
    includesAny(normalized, [
      'taxa de entrega',
      'taxa entrega',
      'frete',
      'valor da entrega',
      'valor entrega',
      'quanto custa entregar',
      'quanto fica a entrega',
      'quanto fica entrega',
    ])
  ) {
    return 'taxa_entrega';
  }

  if (
    includesAny(normalized, [
      'bairros atendidos',
      'bairro atendido',
      'zonas de entrega',
      'zonas entrega',
      'zonas atendidas',
      'regioes atendidas',
      'regioes de entrega',
      'area de entrega',
      'areas de entrega',
    ])
  ) {
    return 'zona_entrega';
  }

  if (
    includesAny(normalized, [
      'bairro',
      'regiao',
      'zona',
      'entrega em',
      'entrega no',
      'entrega na',
      'atende no',
      'atende na',
      'atende em',
      'entregam no',
      'entregam na',
      'entregam em',
    ]) ||
    /\b(?:atende|atendem|entrega|entregam)\s+(?:no|na|em|para|pro|pra)\b/.test(normalized)
  ) {
    return 'bairro';
  }

  if (includesAny(normalized, ['entrega', 'delivery'])) {
    return 'entrega';
  }

  if (
    includesAny(normalized, [
      'cardapio',
      'menu',
      'catalogo',
      'catologo',
      'catalogo online',
      'pedido',
      'pedir',
      'comprar',
      'compra',
      'lanche',
      'lanches',
      'preco',
      'precos',
      'valor',
      'valores',
      'quanto custa',
    ])
  ) {
    return 'cardapio';
  }

  if (includesAny(normalized, ['pix', 'qr code', 'qrcode', 'copia e cola', 'copiaecola'])) {
    return 'pix';
  }

  if (
    includesAny(normalized, [
      'pagamento',
      'pagar',
      'pagam',
      'cartao',
      'credito',
      'debito',
      'dinheiro',
      'forma de pagamento',
      'formas de pagamento',
    ])
  ) {
    return 'pagamento';
  }

  if (
    includesAny(normalized, [
      'oi',
      'ola',
      'olá',
      'bom dia',
      'boa tarde',
      'boa noite',
      'e ai',
      'eae',
      'opa',
    ])
  ) {
    return 'saudacao';
  }

  return null;
}

function resolvePublicBaseUrl() {
  const explicit =
    normalizeOptionalText(process.env.FLOWPDV_PUBLIC_URL) ||
    normalizeOptionalText(process.env.RAILWAY_PUBLIC_DOMAIN);

  if (explicit) {
    const withProtocol = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
    return withProtocol.replace(/\/+$/, '');
  }

  const fromAllowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOptionalText(item))
    .find((item) => item);

  if (fromAllowedOrigins) {
    return fromAllowedOrigins.replace(/\/+$/, '');
  }

  return `http://localhost:${normalizeOptionalText(process.env.PORT) || '3001'}`;
}

function normalizeOptionalHttpUrl(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveTenantCardapioUrl(tenant: TenantInboundAutoReplyRow) {
  const publicBaseUrl = resolvePublicBaseUrl();
  const deliveryEnabled = toBool(tenant.delivery_ativo, false);
  if (!deliveryEnabled) return null;

  const deliveryConfig = parseDeliveryConfig(tenant.delivery_config);
  const shortCardapioUrl = normalizeOptionalHttpUrl(deliveryConfig.cardapio_link_curto);
  if (shortCardapioUrl) {
    return shortCardapioUrl;
  }

  const slug = normalizeOptionalText(tenant.usuario);

  return slug
    ? `${publicBaseUrl}/delivery/${encodeURIComponent(slug)}`
    : null;
}

function buildStorefrontAutoReplyMessage(input: {
  greeting: string;
  tenant: TenantInboundAutoReplyRow;
  fallbackMessage?: string;
}) {
  const cardapioUrl = resolveTenantCardapioUrl(input.tenant);
  if (cardapioUrl) {
    return `${input.greeting} Para pedir, acesse nosso cardapio: ${cardapioUrl}`;
  }

  return (
    input.fallbackMessage ||
    `${input.greeting} Posso te ajudar com pedidos, cardapio e entrega por aqui.`
  );
}

function normalizePaymentMethodKey(value: unknown) {
  return normalizeTextForMatch(value).replace(/\s+/g, '_');
}

function formatPaymentMethodLabel(rawValue: string) {
  const key = normalizePaymentMethodKey(rawValue);

  if (key.includes('pix')) return 'Pix';
  if (key.includes('dinheiro')) return 'Dinheiro';
  if (key.includes('debito')) return 'Cartao de debito';
  if (key.includes('credito')) return 'Cartao de credito';
  if (key.includes('cartao')) return 'Cartao';

  const normalized = normalizeOptionalText(rawValue);
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatPaymentMethodsList(methods: string[]) {
  if (methods.length === 0) return 'Dinheiro e cartao';
  if (methods.length === 1) return methods[0];
  if (methods.length === 2) return `${methods[0]} e ${methods[1]}`;
  return `${methods.slice(0, -1).join(', ')} e ${methods[methods.length - 1]}`;
}

function formatCurrencyBrl(value: unknown) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeAmount);
}

function parseDeliveryConfig(rawConfig?: unknown) {
  if (!rawConfig) return {} as JsonRecord;

  if (typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
    return rawConfig as JsonRecord;
  }

  const normalized = normalizeOptionalText(rawConfig);
  if (!normalized) return {} as JsonRecord;

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
  } catch {
    return {} as JsonRecord;
  }

  return {} as JsonRecord;
}

function parseDeliveryFeeValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveTenantDeliveryZones(tenant: TenantInboundAutoReplyRow) {
  const deliveryConfig = parseDeliveryConfig(tenant.delivery_config);
  const defaultFee = parseDeliveryFeeValue(deliveryConfig.taxa_entrega);
  const rawZones = Array.isArray(deliveryConfig.zonas_entrega) ? deliveryConfig.zonas_entrega : [];

  const zones = rawZones
    .map((zone) => {
      const zoneRecord = getRecord(zone);
      const nome = normalizeOptionalText(zoneRecord?.nome);
      if (!nome) return null;

      return {
        nome,
        taxa: parseDeliveryFeeValue(zoneRecord?.taxa),
      } satisfies DeliveryZoneInfo;
    })
    .filter((zone): zone is DeliveryZoneInfo => zone !== null);

  return {
    defaultFee,
    zones,
  };
}

function formatDeliveryZonesList(zones: DeliveryZoneInfo[]) {
  if (zones.length === 0) return '';
  return zones
    .map((zone) => `${zone.nome} (${formatCurrencyBrl(zone.taxa)})`)
    .join(', ');
}

function findMentionedDeliveryZone(zones: DeliveryZoneInfo[], messageText: string) {
  const normalizedMessage = normalizeBairroForZonaMatch(messageText);
  if (!normalizedMessage) return null;

  let bestMatch: DeliveryZoneInfo | null = null;
  let bestMatchLength = 0;

  for (const zone of zones) {
    const normalizedZone = normalizeBairroForZonaMatch(zone.nome);
    if (!normalizedZone || normalizedZone.length < 3) continue;
    if (!normalizedMessage.includes(normalizedZone)) continue;

    if (normalizedZone.length > bestMatchLength) {
      bestMatch = zone;
      bestMatchLength = normalizedZone.length;
    }
  }

  return bestMatch;
}

function sanitizeDeliveryAreaSnippet(value: unknown) {
  const normalized = String(value || '')
    .replace(/^[\s:;,.\-]+/g, '')
    .replace(/[\s:;,.\-!?]+$/g, '')
    .trim();

  if (!normalized || normalized.length < 2) return null;
  return normalized;
}

function extractRequestedDeliveryArea(
  messageText: string,
  zones: DeliveryZoneInfo[]
): { bairro: string | null; zone: DeliveryZoneInfo | null } {
  const directZone = findMentionedDeliveryZone(zones, messageText);
  if (directZone) {
    return {
      bairro: directZone.nome,
      zone: directZone,
    };
  }

  const patterns = [
    /\bbairro\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})$/i,
    /\b(?:zona|regiao|região)\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})$/i,
    /\b(?:entrega(?:m)?|atende(?:m)?|frete|taxa(?:\s+de\s+entrega)?|valor(?:\s+da\s+entrega)?)\s+(?:no|na|em|para|pro|pra)\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})[?!. ]*$/i,
    /\b(?:no|na|em)\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})\s+(?:tem|ha|possui)\s+(?:entrega|frete)\b/i,
  ];

  for (const pattern of patterns) {
    const matched = messageText.match(pattern);
    const bairro = sanitizeDeliveryAreaSnippet(matched?.[1]);
    if (!bairro) continue;

    return {
      bairro,
      zone: findDeliveryZoneByBairro(zones, bairro),
    };
  }

  return {
    bairro: null,
    zone: null,
  };
}

function buildDeliveryAutoReplyMessage(input: {
  intent: Extract<
    SimpleInboundIntent,
    'entrega' | 'bairro' | 'taxa_entrega' | 'zona_entrega'
  >;
  greeting: string;
  tenant: TenantInboundAutoReplyRow;
  messageText: string;
}) {
  const deliveryEnabled = toBool(input.tenant.delivery_ativo, false);
  if (!deliveryEnabled) {
    return `${input.greeting} No momento nao estamos com entrega ativa. Se preferir, voce pode retirar no local.`;
  }

  const { defaultFee, zones } = resolveTenantDeliveryZones(input.tenant);
  const { bairro, zone } = extractRequestedDeliveryArea(input.messageText, zones);
  const zonesList = formatDeliveryZonesList(zones);
  const retiradaHint = ' Se preferir, voce tambem pode retirar no local.';

  if (input.intent === 'bairro' || (input.intent === 'entrega' && bairro)) {
    if (zone) {
      return `${input.greeting} Sim, atendemos ${zone.nome}. A taxa de entrega para essa regiao e ${formatCurrencyBrl(zone.taxa)}.`;
    }

    if (bairro && zones.length > 0) {
      const coverageText = zonesList ? ` Bairros atendidos: ${zonesList}.` : '';
      return `${input.greeting} Ainda nao fazemos entrega para ${bairro}. ${MENSAGEM_ENTREGA_FORA_DA_AREA}${coverageText}`;
    }

    if (zones.length > 0) {
      return `${input.greeting} Informe o bairro para eu confirmar a entrega. Hoje atendemos: ${zonesList}.${retiradaHint}`;
    }

    return `${input.greeting} Informe o bairro para eu confirmar a entrega. A taxa atual e ${formatCurrencyBrl(defaultFee)}.${retiradaHint}`;
  }

  if (input.intent === 'taxa_entrega') {
    if (zone) {
      return `${input.greeting} A taxa de entrega para ${zone.nome} e ${formatCurrencyBrl(zone.taxa)}.`;
    }

    if (bairro && zones.length > 0) {
      return `${input.greeting} Ainda nao temos entrega para ${bairro}. ${MENSAGEM_ENTREGA_FORA_DA_AREA}`;
    }

    if (zones.length > 0) {
      return `${input.greeting} As taxas de entrega por bairro/zona sao: ${zonesList}.${retiradaHint}`;
    }

    return `${input.greeting} Nossa taxa de entrega atual e ${formatCurrencyBrl(defaultFee)}.${retiradaHint}`;
  }

  if (input.intent === 'zona_entrega') {
    if (zones.length > 0) {
      return `${input.greeting} Atendemos os seguintes bairros/zonas: ${zonesList}.${retiradaHint}`;
    }

    return `${input.greeting} Fazemos entrega com taxa atual de ${formatCurrencyBrl(defaultFee)}. Para confirmar sua regiao, envie o bairro.${retiradaHint}`;
  }

  if (zone) {
    return `${input.greeting} Sim, atendemos ${zone.nome}. A taxa de entrega para essa regiao e ${formatCurrencyBrl(zone.taxa)}.`;
  }

  if (zones.length > 0) {
    return `${input.greeting} Fazemos entrega nos seguintes bairros/zonas: ${zonesList}.${retiradaHint}`;
  }

  return `${input.greeting} Fazemos entrega. A taxa atual e ${formatCurrencyBrl(defaultFee)}.${retiradaHint}`;
}

function extractOrderNumberFromText(messageText: string) {
  const explicitFlowPattern = messageText.match(/\b([A-Za-z]\d{6}-\d{2,4})\b/);
  if (explicitFlowPattern?.[1]) {
    return explicitFlowPattern[1].toUpperCase();
  }

  const genericPattern = messageText.match(/(?:pedido|numero|n[úu]mero|#)\s*[:#-]?\s*([A-Za-z0-9-]{3,})/i);
  if (!genericPattern?.[1]) return null;

  const value = genericPattern[1].toUpperCase();
  if (value.replace(/[^0-9]/g, '').length < 3) return null;
  return value;
}

function buildPhoneCandidates(rawPhone: string | null) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return [] as string[];

  const values = new Set<string>();
  values.add(digits);

  if (digits.startsWith('55') && digits.length > 11) {
    values.add(digits.slice(2));
  }

  if (digits.length >= 11) {
    values.add(digits.slice(-11));
  }

  if (digits.length >= 10) {
    values.add(digits.slice(-10));
  }

  return Array.from(values).filter((value) => value.length >= 10);
}

function phonesMatch(left: string | null, right: string | null) {
  const leftCandidates = buildPhoneCandidates(left);
  const rightCandidates = new Set(buildPhoneCandidates(right));
  return leftCandidates.some((candidate) => rightCandidates.has(candidate));
}

async function resolveTenantPaymentMethods(
  tenantId: number,
  tenant: TenantInboundAutoReplyRow
) {
  const rows = await qAll<PaymentMethodRow>(
    `SELECT DISTINCT method
     FROM (
       SELECT LOWER(BTRIM(method)) AS method
       FROM pagamentos
       WHERE tenant_id=?
         AND method IS NOT NULL
         AND BTRIM(method) <> ''
       UNION
       SELECT LOWER(BTRIM(pagamento_tipo)) AS method
       FROM pedidos
       WHERE tenant_id=?
         AND pagamento_tipo IS NOT NULL
         AND BTRIM(pagamento_tipo) <> ''
     ) methods
     WHERE method IS NOT NULL
     ORDER BY method`,
    [tenantId, tenantId]
  );

  const labels = Array.from(
    new Set(
      rows
        .map((row) => formatPaymentMethodLabel(row.method || ''))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (labels.length > 0) {
    return labels;
  }

  const fallbackMethods = new Set<string>(['Dinheiro', 'Cartao de debito', 'Cartao de credito']);
  const deliveryConfig = parseDeliveryConfig(tenant.delivery_config);

  if (
    toBool(tenant.pix_enabled, false) ||
    normalizeOptionalText(deliveryConfig.pix_chave) ||
    normalizeOptionalText(deliveryConfig.pix_payload_estatico)
  ) {
    fallbackMethods.add('Pix');
  }

  return Array.from(fallbackMethods);
}

async function updateInboundMessageAutomation(
  inboundMessageId: number,
  update: {
    intent?: SimpleInboundIntent | null;
    autoReplyText?: string | null;
    autoReplyStatus?: string | null;
    autoReplyError?: string | null;
    autoReplyProvider?: string | null;
    autoReplyExternalId?: string | null;
    markAttempted?: boolean;
    markSent?: boolean;
  }
) {
  await qRun(
    `UPDATE whatsapp_inbound_messages
     SET intent=?,
         auto_reply_text=?,
         auto_reply_status=?,
         auto_reply_error=?,
         auto_reply_provider=?,
         auto_reply_external_id=?,
         auto_reply_attempted_at=CASE WHEN ?=1 THEN NOW() ELSE auto_reply_attempted_at END,
         auto_reply_sent_at=CASE WHEN ?=1 THEN NOW() ELSE auto_reply_sent_at END
     WHERE id=?`,
    [
      update.intent || null,
      update.autoReplyText || null,
      update.autoReplyStatus || null,
      update.autoReplyError || null,
      update.autoReplyProvider || null,
      update.autoReplyExternalId || null,
      update.markAttempted ? 1 : 0,
      update.markSent ? 1 : 0,
      inboundMessageId,
    ]
  );
}

async function insertHumanHandoffLog(input: {
  tenantId: number;
  customerPhone: string;
  reason: string;
  inboundMessageId: number;
}) {
  await qRun(
    `INSERT INTO system_logs (tenant_id, usuario_nome, cargo, acao, detalhes)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      'Sistema',
      'automacao',
      'WHATSAPP_HUMAN_HANDOFF',
      JSON.stringify({
        customer_phone: input.customerPhone,
        handoff_reason: input.reason,
        inbound_message_id: input.inboundMessageId,
        ttl_hours: HUMAN_HANDOFF_TTL_HOURS,
        created_at: new Date().toISOString(),
      }),
    ]
  );
}

async function activateHumanHandoff(input: {
  tenantId: number;
  customerPhone: string;
  reason: string;
  inboundMessageId: number;
}) {
  await qRun(
    `INSERT INTO whatsapp_human_handoffs
      (tenant_id, customer_phone, human_handoff_active, handoff_reason, handoff_created_at, updated_at)
     VALUES (?, ?, 1, ?, NOW(), NOW())
     ON CONFLICT (tenant_id, customer_phone)
     DO UPDATE
       SET human_handoff_active=1,
           handoff_reason=EXCLUDED.handoff_reason,
           handoff_created_at=NOW(),
           updated_at=NOW()`,
    [input.tenantId, input.customerPhone, input.reason]
  );

  await insertHumanHandoffLog(input);
}

async function getActiveHumanHandoff(tenantId: number, customerPhone: string) {
  const handoff = await q1<WhatsAppHumanHandoffRow>(
    `SELECT id, human_handoff_active, handoff_reason, handoff_created_at
     FROM whatsapp_human_handoffs
     WHERE tenant_id=? AND customer_phone=?
     LIMIT 1`,
    [tenantId, customerPhone]
  );

  if (!handoff || !toBool(handoff.human_handoff_active, false)) {
    return null;
  }

  const createdAtMs = parseDateMs(handoff.handoff_created_at);
  const maxAgeMs = HUMAN_HANDOFF_TTL_HOURS * 60 * 60 * 1000;
  if (!createdAtMs || Date.now() - createdAtMs > maxAgeMs) {
    await qRun(
      `UPDATE whatsapp_human_handoffs
       SET human_handoff_active=0,
           updated_at=NOW()
       WHERE tenant_id=? AND customer_phone=?`,
      [tenantId, customerPhone]
    );
    return null;
  }

  return {
    reason: normalizeOptionalText(handoff.handoff_reason),
    createdAt: handoff.handoff_created_at || null,
  };
}

async function findOrderStatusForInboundMessage(input: {
  tenantId: number;
  customerPhone: string;
  messageText: string;
}) {
  const orderNumber = extractOrderNumberFromText(input.messageText);
  if (!orderNumber) return null;

  const order = await q1<OrderStatusLookupRow>(
    `SELECT id, order_number, status, cliente_tel
     FROM pedidos
     WHERE tenant_id=?
       AND UPPER(COALESCE(order_number, ''))=?
     ORDER BY id DESC
     LIMIT 1`,
    [input.tenantId, orderNumber]
  );

  if (!order) return null;
  if (!phonesMatch(order.cliente_tel || null, input.customerPhone)) return null;

  return {
    orderNumber: normalizeOptionalText(order.order_number) || orderNumber,
    status: normalizeOptionalText(order.status) || 'em andamento',
  };
}

async function buildAutoReplyMessage(input: {
  intent: SimpleInboundIntent;
  tenantId: number;
  tenant: TenantInboundAutoReplyRow;
  message: SavedInboundWhatsAppMessage;
  paymentMethods: string[];
}) {
  const tenantName =
    normalizeOptionalText(input.tenant.nome_estabelecimento) || 'nossa loja';
  const greeting = getGreeting(input.message.customer_name);
  const paymentMethodsLabel = formatPaymentMethodsList(input.paymentMethods);

  switch (input.intent) {
    case 'saudacao':
      return buildStorefrontAutoReplyMessage({
        greeting,
        tenant: input.tenant,
        fallbackMessage: `${greeting} Bem-vindo(a) a ${tenantName}. Como podemos ajudar?`,
      });
    case 'entrega':
      return buildStorefrontAutoReplyMessage({
        greeting,
        tenant: input.tenant,
      });
    case 'bairro':
    case 'taxa_entrega':
    case 'zona_entrega':
      return buildDeliveryAutoReplyMessage({
        intent: input.intent,
        greeting,
        tenant: input.tenant,
        messageText: input.message.message_text,
      });
    case 'cardapio':
      return buildStorefrontAutoReplyMessage({
        greeting,
        tenant: input.tenant,
        fallbackMessage: `${greeting} Nosso cardapio online nao esta disponivel no momento.`,
      });
    case 'pix':
      return `${greeting} Aceitamos ${paymentMethodsLabel}. Se preferir Pix, podemos seguir por essa forma de pagamento.`;
    case 'pagamento':
      return `${greeting} As formas de pagamento aceitas sao: ${paymentMethodsLabel}.`;
    case 'status_pedido': {
      const orderStatus = await findOrderStatusForInboundMessage({
        tenantId: input.tenantId,
        customerPhone: input.message.customer_phone,
        messageText: input.message.message_text,
      });

      if (orderStatus) {
        return `${greeting} O pedido #${orderStatus.orderNumber} esta com status: ${orderStatus.status}.`;
      }

      return `${greeting} Me informe o numero do pedido para eu consultar o status por aqui.`;
    }
    case 'atendente':
      return `${greeting} Vamos encaminhar sua mensagem para um atendente humano e retornamos por aqui assim que possivel.`;
    default:
      return null;
  }
}

async function processInboundAutoReply(input: {
  tenantId: number;
  config: TenantWhatsAppConfigRow;
  tenant: TenantInboundAutoReplyRow;
  paymentMethods: string[];
  message: SavedInboundWhatsAppMessage;
}) {
  const intent = classifySimpleIntent(input.message.message_text);
  const handoffReason = resolveHumanHandoffReason(input.message.message_text, intent);
  const shouldActivateHumanHandoff = Boolean(handoffReason);

  logInfo('whatsAppInboundService.message.received', {
    tenantId: input.tenantId,
    inboundMessageId: input.message.id,
    phone: input.message.customer_phone,
    text: summarizeText(input.message.message_text),
    intent,
    provider: input.message.provider,
  });

  if (shouldActivateHumanHandoff) {
    await activateHumanHandoff({
      tenantId: input.tenantId,
      customerPhone: input.message.customer_phone,
      reason: handoffReason!,
      inboundMessageId: input.message.id,
    });

    await updateInboundMessageAutomation(input.message.id, {
      intent: intent || 'atendente',
      autoReplyStatus: 'blocked_human_handoff',
      autoReplyError: null,
    });

    logInfo('whatsAppInboundService.humanHandoff.activated', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent: intent || 'atendente',
      handoffReason,
      recipient: maskPhone(input.message.customer_phone),
      ttlHours: HUMAN_HANDOFF_TTL_HOURS,
    });
    return;
  }

  const activeHandoff = await getActiveHumanHandoff(
    input.tenantId,
    input.message.customer_phone
  );

  const shouldBypassActiveHandoff =
    !!activeHandoff &&
    shouldBypassKeywordErroActiveHandoff({
      activeReason: activeHandoff.reason,
      currentReason: handoffReason,
      intent,
    });

  if (shouldBypassActiveHandoff) {
    logInfo('whatsAppInboundService.autoReply.bypassedKeywordErroHandoff', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
      handoffReason: activeHandoff?.reason,
      handoffCreatedAt: activeHandoff?.createdAt,
      recipient: maskPhone(input.message.customer_phone),
    });
  } else if (activeHandoff) {
    await updateInboundMessageAutomation(input.message.id, {
      intent,
      autoReplyStatus: 'blocked_human_handoff_active',
      autoReplyError: null,
    });

    logInfo('whatsAppInboundService.autoReply.blockedByHumanHandoff', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
      handoffReason: activeHandoff.reason,
      handoffCreatedAt: activeHandoff.createdAt,
      recipient: maskPhone(input.message.customer_phone),
    });
    return;
  }

  let chatbotReplyMessage: string | null = null;
  let chatbotReplySource: 'keyword' | 'groq' | 'none' = 'none';
  let chatbotReason: string | null = null;

  try {
    const chatbotResult = await whatsAppChatbotService.processChatbotMessage({
      tenantId: input.tenantId,
      messageText: input.message.message_text,
      customerName: input.message.customer_name,
      customerPhone: input.message.customer_phone,
      allowAiFallback: true,
      paymentMethods: input.paymentMethods,
    });

    chatbotReplyMessage = normalizeOptionalText(chatbotResult.replyText);
    chatbotReplySource = chatbotResult.replySource;
    chatbotReason = chatbotResult.reason;
  } catch (error) {
    logError('whatsAppInboundService.chatbot.process', error, {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
      provider: normalizeProviderName(input.config.provider),
      recipient: maskPhone(input.message.customer_phone),
    });
  }

  if (chatbotReplyMessage) {
    try {
      const sendResult = await sendWhatsAppMessage({
        provider: input.config.provider || null,
        providerConfigJson: input.config.provider_config_json || null,
        to: input.message.customer_phone,
        message: chatbotReplyMessage,
      });

      await updateInboundMessageAutomation(input.message.id, {
        intent,
        autoReplyText: chatbotReplyMessage,
        autoReplyStatus: 'sent',
        autoReplyProvider: sendResult.provider,
        autoReplyExternalId: sendResult.externalId,
        autoReplyError: null,
        markAttempted: true,
        markSent: true,
      });

      logInfo('whatsAppInboundService.chatbot.sent', {
        tenantId: input.tenantId,
        inboundMessageId: input.message.id,
        phone: input.message.customer_phone,
        text: summarizeText(input.message.message_text),
        intent,
        chatbotReplySource,
        chatbotReason,
        provider: sendResult.provider,
        recipient: maskPhone(input.message.customer_phone),
      });

      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await updateInboundMessageAutomation(input.message.id, {
        intent,
        autoReplyText: chatbotReplyMessage,
        autoReplyStatus: 'error',
        autoReplyProvider: normalizeProviderName(input.config.provider),
        autoReplyExternalId: null,
        autoReplyError: errorMessage,
        markAttempted: true,
        markSent: false,
      });

      logError('whatsAppInboundService.chatbot.send', error, {
        tenantId: input.tenantId,
        inboundMessageId: input.message.id,
        phone: input.message.customer_phone,
        text: summarizeText(input.message.message_text),
        intent,
        chatbotReplySource,
        chatbotReason,
        provider: normalizeProviderName(input.config.provider),
        recipient: maskPhone(input.message.customer_phone),
      });
      return;
    }
  }

  if (!chatbotReplyMessage && chatbotReason && chatbotReason !== 'chatbot_not_configured' && chatbotReason !== 'chatbot_disabled') {
    logInfo('whatsAppInboundService.chatbot.noReply', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
      chatbotReplySource,
      chatbotReason,
      recipient: maskPhone(input.message.customer_phone),
    });
  }

  if (!intent) {
    logInfo('whatsAppInboundService.autoReply.fallbackNoIntent', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent: null,
    });
  }

  const replyMessage = intent
    ? await buildAutoReplyMessage({
        intent,
        tenantId: input.tenantId,
        tenant: input.tenant,
        message: input.message,
        paymentMethods: input.paymentMethods,
      })
    : buildStorefrontAutoReplyMessage({
        greeting: getGreeting(input.message.customer_name),
        tenant: input.tenant,
      });

  if (!replyMessage) {
    await updateInboundMessageAutomation(input.message.id, {
      intent,
      autoReplyStatus: 'ignored_no_reply',
    });

    logInfo('whatsAppInboundService.autoReply.ignoredNoReply', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
    });
    return;
  }

  try {
    const sendResult = await sendWhatsAppMessage({
      provider: input.config.provider || null,
      providerConfigJson: input.config.provider_config_json || null,
      to: input.message.customer_phone,
      message: replyMessage,
    });

    await updateInboundMessageAutomation(input.message.id, {
      intent,
      autoReplyText: replyMessage,
      autoReplyStatus: 'sent',
      autoReplyProvider: sendResult.provider,
      autoReplyExternalId: sendResult.externalId,
      autoReplyError: null,
      markAttempted: true,
      markSent: true,
    });

    logInfo('whatsAppInboundService.autoReply.sent', {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
      provider: sendResult.provider,
      recipient: maskPhone(input.message.customer_phone),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await updateInboundMessageAutomation(input.message.id, {
      intent,
      autoReplyText: replyMessage,
      autoReplyStatus: 'error',
      autoReplyProvider: normalizeProviderName(input.config.provider),
      autoReplyExternalId: null,
      autoReplyError: errorMessage,
      markAttempted: true,
      markSent: false,
    });

    logError('whatsAppInboundService.autoReply.send', error, {
      tenantId: input.tenantId,
      inboundMessageId: input.message.id,
      phone: input.message.customer_phone,
      text: summarizeText(input.message.message_text),
      intent,
      provider: normalizeProviderName(input.config.provider),
      recipient: maskPhone(input.message.customer_phone),
    });
  }
}

function extractTextFromMessageNode(value: unknown): string | null {
  const message = getRecord(value);
  if (!message) return null;

  return (
    normalizeOptionalText(message.conversation) ||
    normalizeOptionalText(getRecord(message.text)?.body) ||
    normalizeOptionalText(message.text) ||
    normalizeOptionalText(getRecord(message.extendedTextMessage)?.text) ||
    normalizeOptionalText(getRecord(message.imageMessage)?.caption) ||
    normalizeOptionalText(getRecord(message.videoMessage)?.caption) ||
    normalizeOptionalText(getRecord(message.documentMessage)?.caption) ||
    normalizeOptionalText(getRecord(message.buttonsResponseMessage)?.selectedDisplayText) ||
    normalizeOptionalText(getRecord(message.listResponseMessage)?.title)
  );
}

function isIgnoredEvolutionJid(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return (
    isEvolutionLidIdentifier(normalized) ||
    normalized.endsWith('@g.us') ||
    normalized === 'status@broadcast' ||
    normalized.endsWith('@newsletter')
  );
}

function normalizeEvolutionCustomerPhoneCandidate(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  if (isIgnoredEvolutionJid(normalized)) return null;

  const lowered = normalized.toLowerCase();
  if (lowered.includes('@') && !lowered.endsWith('@s.whatsapp.net') && !lowered.endsWith('@c.us')) {
    return null;
  }

  const phone = normalizeWhatsAppPhone(normalized);
  return isTrustedBrazilWhatsAppPhone(phone) ? phone : null;
}

function resolveConfiguredInboundInstanceNumbers(config?: TenantWhatsAppConfigRow | null) {
  const configuredInstanceNumbers = resolveConfiguredWhatsAppNumbersFromProviderConfigJson(
    config?.provider_config_json
  );
  const configuredWhatsAppNumber = normalizeWhatsAppPhone(config?.whatsapp_number);

  if (configuredWhatsAppNumber) {
    configuredInstanceNumbers.add(configuredWhatsAppNumber);
  }

  return configuredInstanceNumbers;
}

function mapTenantConnectionConfigToInboundRow(
  config: TenantWhatsAppConnectionConfig
): TenantWhatsAppConfigRow {
  return {
    tenant_id: config.tenantId,
    whatsapp_enabled: config.whatsappEnabled,
    provider: config.provider,
    provider_config_json: config.providerConfigJson,
    whatsapp_number: config.whatsappNumber,
  };
}

function parseProviderConfigRecord(rawValue: string | null | undefined) {
  const raw = normalizeOptionalText(rawValue);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as ProviderConfigRecord;
  } catch {
    return null;
  }
}

function getProviderConfigText(config: ProviderConfigRecord | null, keys: string[]) {
  if (!config) return null;

  for (const key of keys) {
    const value = normalizeOptionalText(config[key]);
    if (value) return value;
  }

  return null;
}

function buildProviderUrl(baseUrl: string, endpoint: string) {
  const safeBaseUrl = baseUrl.replace(/\/+$/, '');
  const safeEndpoint = endpoint.replace(/^\/+/, '');
  return `${safeBaseUrl}/${safeEndpoint}`;
}

const EVOLUTION_PHONE_CANDIDATE_KEYS = [
  'participant',
  'participantAlt',
  'participantPn',
  'participantLid',
  'participantPhone',
  'participantWaId',
  'participantNumber',
  'participantNumberId',
  'sender',
  'senderAlt',
  'senderJid',
  'senderPn',
  'senderPhone',
  'senderNumber',
  'senderWaId',
  'senderWid',
  'senderLid',
  'senderNumberId',
  'from',
  'fromJid',
  'fromPn',
  'fromPhone',
  'fromWaId',
  'fromNumber',
  'fromNumberId',
  'user',
  'userJid',
  'userPn',
  'userPhone',
  'userWaId',
  'userWid',
  'phone',
  'phoneNumber',
  'phone_number',
  'waId',
  'wa_id',
  'jid',
  'jidAlt',
  'author',
  'ownerPn',
  'ownerPhone',
  'ownerWaId',
  'remoteJid',
  'remoteJidAlt',
];

const EVOLUTION_NESTED_PHONE_RECORD_KEYS = new Set([
  'sender',
  'participant',
  'from',
  'author',
  'contact',
  'chat',
  'user',
  'key',
]);

const EVOLUTION_PHONE_FIELD_PRIORITIES: Record<string, number> = {
  participantPn: 0,
  participantPhone: 0,
  participantWaId: 0,
  participantNumber: 0,
  participantNumberId: 0,
  senderPn: 1,
  senderPhone: 1,
  senderNumber: 1,
  senderWaId: 1,
  senderWid: 1,
  senderNumberId: 1,
  fromPn: 2,
  fromPhone: 2,
  fromWaId: 2,
  fromNumber: 2,
  fromNumberId: 2,
  userPn: 3,
  userPhone: 3,
  userWaId: 3,
  userWid: 3,
  participant: 4,
  participantAlt: 4,
  sender: 4,
  senderAlt: 4,
  senderJid: 4,
  from: 4,
  fromJid: 4,
  user: 5,
  userJid: 5,
  author: 5,
  jid: 6,
  jidAlt: 6,
  remoteJid: 7,
  remoteJidAlt: 7,
  phone: 8,
  phoneNumber: 8,
  phone_number: 8,
  waId: 8,
  wa_id: 8,
  ownerPn: 9,
  ownerPhone: 9,
  ownerWaId: 9,
};

const EVOLUTION_SCOPED_PHONE_FIELD_PRIORITIES: Record<
  string,
  { phoneLike: number; jidLike: number }
> = {
  participant: { phoneLike: 0, jidLike: 4 },
  participantAlt: { phoneLike: 0, jidLike: 4 },
  sender: { phoneLike: 1, jidLike: 4 },
  senderAlt: { phoneLike: 1, jidLike: 4 },
  from: { phoneLike: 2, jidLike: 4 },
  user: { phoneLike: 3, jidLike: 5 },
  author: { phoneLike: 3, jidLike: 5 },
  contact: { phoneLike: 4, jidLike: 6 },
};

const EVOLUTION_GENERIC_PHONE_LIKE_FIELDS = new Set([
  'phone',
  'phoneNumber',
  'phone_number',
  'waId',
  'wa_id',
]);

const EVOLUTION_GENERIC_JID_LIKE_FIELDS = new Set(['jid', 'jidAlt']);

type EvolutionCustomerPhoneUnresolvedReason =
  | 'customer_phone_unresolved_instance_number_blocked'
  | 'customer_phone_unresolved_weak_envelope_candidate_discarded'
  | 'customer_phone_unresolved_only_ignored_jids'
  | 'customer_phone_unresolved_no_candidate_fields'
  | 'customer_phone_unresolved_no_trusted_candidate';

type EvolutionPhoneFieldMatch = {
  field: string;
  phone: string;
};

type EvolutionCustomerPhoneResolution = {
  phone: string | null;
  blockedConfiguredMatches: EvolutionPhoneFieldMatch[];
  discardedWeakEnvelopeMatches: EvolutionPhoneFieldMatch[];
  unresolvedReason: EvolutionCustomerPhoneUnresolvedReason | null;
};

type EvolutionContactLookupResolution = {
  lid: string | null;
  phone: string | null;
  sourcePath: string | null;
  lookupStatus:
    | 'not_attempted'
    | 'config_unavailable'
    | 'not_found'
    | 'resolved'
    | 'ambiguous_match_discarded'
    | 'request_failed';
};

const EVOLUTION_DIAGNOSTIC_NAME_FIELD_KEYS = [
  'pushName',
  'notifyName',
  'verifiedName',
  'displayName',
  'senderName',
] as const;

const EVOLUTION_DIAGNOSTIC_FIELD_KEYS = [
  ...new Set<string>([...EVOLUTION_PHONE_CANDIDATE_KEYS, ...EVOLUTION_DIAGNOSTIC_NAME_FIELD_KEYS]),
];

function maskDiagnosticText(rawValue: string | null) {
  const normalized = normalizeOptionalText(rawValue);
  if (!normalized) return null;
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

function maskEvolutionDiagnosticValue(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  const [localPart, ...domainParts] = normalized.split('@');
  const domainPart = domainParts.join('@');
  const normalizedPhone = normalizeWhatsAppPhone(normalized);
  const maskedPhone = normalizedPhone ? maskPhone(normalizedPhone) : null;

  if (domainPart) {
    return `${maskedPhone || maskDiagnosticText(localPart)}@${domainPart}`;
  }

  if (maskedPhone) return maskedPhone;
  return maskDiagnosticText(normalized);
}

function classifyEvolutionDiagnosticValue(
  value: unknown,
  configuredInstanceNumbers = new Set<string>()
) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  if (isEvolutionLidIdentifier(normalized)) {
    return 'present_lid';
  }

  const normalizedPhone = normalizeWhatsAppPhone(normalized);
  if (normalizedPhone && configuredInstanceNumbers.has(normalizedPhone)) {
    return 'present_instance_number';
  }

  if (normalizeEvolutionCustomerPhoneCandidate(normalized)) {
    return 'present_valid_br_phone';
  }

  return 'present_untrusted_format';
}

function buildEvolutionDiagnosticEntry(
  scope: string,
  path: string,
  field: string,
  value: unknown,
  configuredInstanceNumbers = new Set<string>()
) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  return {
    scope,
    path,
    field,
    valueMasked: maskEvolutionDiagnosticValue(normalized),
    classification: classifyEvolutionDiagnosticValue(normalized, configuredInstanceNumbers),
  };
}

function collectEvolutionDiagnosticEntriesFromRecord(
  record: JsonRecord | null,
  scope: string,
  path: string,
  configuredInstanceNumbers = new Set<string>()
) {
  if (!record) return [] as Array<ReturnType<typeof buildEvolutionDiagnosticEntry>>;

  return EVOLUTION_DIAGNOSTIC_FIELD_KEYS
    .map((field) =>
      buildEvolutionDiagnosticEntry(
        scope,
        path,
        field,
        record[field],
        configuredInstanceNumbers
      )
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function summarizeEvolutionUnresolvedPhoneDiagnostic(
  payload: unknown,
  configuredInstanceNumbers = new Set<string>()
) {
  const root = getRecord(payload);
  const dataArray = getArray(root?.data);
  const dataRecord = getRecord(root?.data) || getRecord(dataArray[0]);
  const contexts = extractEvolutionCandidateContexts(root);
  const primaryContext = contexts[0] || null;
  const primaryItem = primaryContext?.item || dataRecord || root || null;
  const keyRecord =
    getRecord(primaryItem?.key) || getRecord(dataRecord?.key) || getRecord(root?.key);
  const messageRecord =
    getRecord(primaryItem?.message) || getRecord(dataRecord?.message) || getRecord(root?.message);
  const contextInfoRecords = [
    { path: 'item.contextInfo', record: getRecord(primaryItem?.contextInfo) },
    { path: 'message.contextInfo', record: getRecord(messageRecord?.contextInfo) },
    { path: 'data.contextInfo', record: getRecord(dataRecord?.contextInfo) },
    { path: 'root.contextInfo', record: getRecord(root?.contextInfo) },
  ];
  const messageNestedEntries = messageRecord
    ? Object.entries(messageRecord).flatMap(([entryKey, entryValue]) => {
        const entryRecord = getRecord(entryValue);
        if (!entryRecord) return [];

        return collectEvolutionDiagnosticEntriesFromRecord(
          entryRecord,
          'message.*',
          `message.${entryKey}`,
          configuredInstanceNumbers
        );
      })
    : [];
  const contextInfoEntries = contextInfoRecords.flatMap(({ path, record }) =>
    collectEvolutionDiagnosticEntriesFromRecord(
      record,
      'contextInfo',
      path,
      configuredInstanceNumbers
    )
  );
  const entries = [
    ...collectEvolutionDiagnosticEntriesFromRecord(
      root,
      'root',
      'root',
      configuredInstanceNumbers
    ),
    ...collectEvolutionDiagnosticEntriesFromRecord(
      dataRecord,
      'data',
      Array.isArray(root?.data) ? 'data[0]' : 'data',
      configuredInstanceNumbers
    ),
    ...collectEvolutionDiagnosticEntriesFromRecord(
      keyRecord,
      'key',
      keyRecord === getRecord(primaryItem?.key) ? 'item.key' : keyRecord === getRecord(dataRecord?.key) ? 'data.key' : 'root.key',
      configuredInstanceNumbers
    ),
    ...collectEvolutionDiagnosticEntriesFromRecord(
      messageRecord,
      'message',
      messageRecord === getRecord(primaryItem?.message)
        ? 'item.message'
        : messageRecord === getRecord(dataRecord?.message)
          ? 'data.message'
          : 'root.message',
      configuredInstanceNumbers
    ),
    ...messageNestedEntries,
    ...contextInfoEntries,
  ];

  const filterEntries = (predicate: (entry: (typeof entries)[number]) => boolean) =>
    entries.filter(predicate);
  const byFieldName = (fieldNames: string[]) =>
    filterEntries((entry) => fieldNames.includes(entry.field));

  return {
    configuredInstanceNumbers: Array.from(configuredInstanceNumbers).map((value) =>
      maskPhone(value)
    ),
    scopes: {
      root: filterEntries((entry) => entry.scope === 'root'),
      data: filterEntries((entry) => entry.scope === 'data'),
      key: filterEntries((entry) => entry.scope === 'key'),
      message: filterEntries((entry) => entry.scope === 'message'),
      messageNested: filterEntries((entry) => entry.scope === 'message.*'),
      contextInfo: filterEntries((entry) => entry.scope === 'contextInfo'),
    },
    fieldFamilies: {
      participant: filterEntries((entry) => entry.field.startsWith('participant')),
      sender: filterEntries((entry) => entry.field.startsWith('sender')),
      waId: byFieldName(['waId', 'wa_id']),
      phone: byFieldName(['phone', 'phoneNumber', 'phone_number']),
      jid: byFieldName(['jid', 'jidAlt', 'remoteJid', 'remoteJidAlt']),
      displayNames: byFieldName(['pushName', 'notifyName', 'verifiedName', 'displayName']),
    },
  };
}

function getEvolutionFieldCandidates(record: JsonRecord | null, prefix: string) {
  if (!record) return [] as Array<[field: string, value: unknown]>;

  return EVOLUTION_PHONE_CANDIDATE_KEYS.map((field) => [
    `${prefix}.${field}`,
    record[field],
  ] as [field: string, value: unknown]);
}

function getEvolutionMessageCandidates(messageNode: unknown, prefix: string) {
  const message = getRecord(messageNode);
  if (!message) return [] as Array<[field: string, value: unknown]>;

  const candidates = [
    ...getEvolutionFieldCandidates(message, prefix),
    ...getEvolutionFieldCandidates(getRecord(message.contextInfo), `${prefix}.contextInfo`),
  ];

  for (const [entryKey, entryValue] of Object.entries(message)) {
    const entryRecord = getRecord(entryValue);
    if (!entryRecord) continue;

    candidates.push(...getEvolutionFieldCandidates(entryRecord, `${prefix}.${entryKey}`));
    candidates.push(
      ...getEvolutionFieldCandidates(
        getRecord(entryRecord.contextInfo),
        `${prefix}.${entryKey}.contextInfo`
      )
    );
  }

  return candidates;
}

function getEvolutionNestedPhoneCandidates(
  record: JsonRecord | null,
  prefix: string,
  depth = 0
) {
  if (!record || depth > 1) return [] as Array<[field: string, value: unknown]>;

  const candidates: Array<[field: string, value: unknown]> = [];

  for (const [entryKey, entryValue] of Object.entries(record)) {
    const entryRecord = getRecord(entryValue);
    if (!entryRecord) continue;

    if (EVOLUTION_NESTED_PHONE_RECORD_KEYS.has(entryKey)) {
      candidates.push(...getEvolutionFieldCandidates(entryRecord, `${prefix}.${entryKey}`));
      candidates.push(
        ...getEvolutionFieldCandidates(
          getRecord(entryRecord.contextInfo),
          `${prefix}.${entryKey}.contextInfo`
        )
      );
    }

    candidates.push(...getEvolutionNestedPhoneCandidates(entryRecord, `${prefix}.${entryKey}`, depth + 1));
  }

  return candidates;
}

function getEvolutionPhoneCandidates(item: JsonRecord, envelope?: JsonRecord | null) {
  const key = getRecord(item.key);
  const contextInfo = getRecord(item.contextInfo);
  const message = getRecord(item.message);
  const envelopeKey = getRecord(envelope?.key);
  const envelopeContextInfo = getRecord(envelope?.contextInfo);
  const envelopeMessage = getRecord(envelope?.message);

  return [
    ...getEvolutionFieldCandidates(key, 'key'),
    ...getEvolutionFieldCandidates(item, 'item'),
    ...getEvolutionFieldCandidates(contextInfo, 'contextInfo'),
    ...getEvolutionNestedPhoneCandidates(item, 'item'),
    ...getEvolutionMessageCandidates(message, 'message'),
    ...getEvolutionFieldCandidates(envelopeKey, 'envelope.key'),
    ...getEvolutionFieldCandidates(envelope || null, 'envelope'),
    ...getEvolutionFieldCandidates(envelopeContextInfo, 'envelope.contextInfo'),
    ...getEvolutionNestedPhoneCandidates(envelope || null, 'envelope'),
    ...getEvolutionMessageCandidates(envelopeMessage, 'envelope.message'),
  ] as Array<[field: string, value: unknown]>;
}

function getEvolutionPhoneCandidatePriority(field: string) {
  const segments = field.split('.');
  const baseField = segments[segments.length - 1] || field;
  const parentField = segments.length > 1 ? segments[segments.length - 2] : null;

  if (parentField) {
    const scopedPriorities = EVOLUTION_SCOPED_PHONE_FIELD_PRIORITIES[parentField];
    if (scopedPriorities) {
      if (EVOLUTION_GENERIC_PHONE_LIKE_FIELDS.has(baseField)) {
        return scopedPriorities.phoneLike;
      }
      if (EVOLUTION_GENERIC_JID_LIKE_FIELDS.has(baseField)) {
        return scopedPriorities.jidLike;
      }
    }
  }

  return EVOLUTION_PHONE_FIELD_PRIORITIES[baseField] ?? 50;
}

function isWeakEvolutionEnvelopePhoneCandidate(field: string) {
  return (
    field.startsWith('envelope.') &&
    !field.startsWith('envelope.key.') &&
    !field.startsWith('envelope.message.') &&
    !field.startsWith('envelope.contextInfo.')
  );
}

function resolveEvolutionCustomerName(item: JsonRecord, envelope?: JsonRecord | null) {
  return (
    normalizeOptionalText(item.pushName) ||
    normalizeOptionalText(item.senderName) ||
    normalizeOptionalText(item.notifyName) ||
    normalizeOptionalText(envelope?.pushName) ||
    normalizeOptionalText(envelope?.senderName) ||
    normalizeOptionalText(envelope?.notifyName)
  );
}

function summarizeEvolutionPhoneCandidateFields(item: JsonRecord, envelope?: JsonRecord | null) {
  return [...new Set(
    getEvolutionPhoneCandidates(item, envelope)
      .filter(([, value]) => normalizeOptionalText(value))
      .map(([field, value]) => {
        const normalized = normalizeOptionalText(value);
        if (!normalized) return field;
        if (isEvolutionLidIdentifier(normalized)) return `${field}:lid`;
        if (normalizeEvolutionCustomerPhoneCandidate(normalized)) return `${field}:phone`;
        if (normalized.includes('@')) return `${field}:jid`;
        return `${field}:present`;
      })
  )];
}

function summarizeEvolutionPhoneResolutionCandidates(
  item: JsonRecord,
  envelope?: JsonRecord | null,
  configuredInstanceNumbers = new Set<string>()
) {
  return [
    ...new Set(
      getEvolutionPhoneCandidates(item, envelope)
        .map(([field, value], index) => ({ field, value, index }))
        .sort((left, right) => {
          const priorityDiff =
            getEvolutionPhoneCandidatePriority(left.field) -
            getEvolutionPhoneCandidatePriority(right.field);
          return priorityDiff !== 0 ? priorityDiff : left.index - right.index;
        })
        .map(({ field, value }) => {
          const normalized = normalizeOptionalText(value);
          if (!normalized) return null;
          if (isEvolutionLidIdentifier(normalized)) return `${field}:lid`;
          if (isIgnoredEvolutionJid(normalized)) return `${field}:ignored_jid`;

          const phone = normalizeEvolutionCustomerPhoneCandidate(normalized);
          if (phone && configuredInstanceNumbers.has(phone)) {
            return `${field}:configured_instance`;
          }
          if (phone && isWeakEvolutionEnvelopePhoneCandidate(field)) {
            return `${field}:weak_envelope_phone`;
          }
          if (phone) return `${field}:phone`;
          if (normalized.includes('@')) return `${field}:jid`;
          return `${field}:present`;
        })
        .filter((value): value is string => Boolean(value))
    ),
  ];
}

function getEvolutionLidCandidates(item: JsonRecord, envelope?: JsonRecord | null) {
  return [
    ...new Set(
      getEvolutionPhoneCandidates(item, envelope)
        .map(([field, value], index) => ({ field, value, index }))
        .sort((left, right) => {
          const priorityDiff =
            getEvolutionPhoneCandidatePriority(left.field) -
            getEvolutionPhoneCandidatePriority(right.field);
          return priorityDiff !== 0 ? priorityDiff : left.index - right.index;
        })
        .map(({ value }) => normalizeOptionalText(value))
        .filter((value): value is string => Boolean(value) && isEvolutionLidIdentifier(value))
    ),
  ];
}

const EVOLUTION_CONTACT_LOOKUP_ID_KEYS = [
  'id',
  'jid',
  'remoteJid',
  'lid',
  'contactId',
  'contactJid',
] as const;

function collectEvolutionLookupPhoneCandidates(
  value: unknown,
  configuredInstanceNumbers = new Set<string>(),
  path = 'root',
  depth = 0
): Array<{ path: string; phone: string }> {
  if (depth > 5 || value === undefined || value === null) return [];

  const directPhone = normalizeEvolutionCustomerPhoneCandidate(value);
  if (directPhone && !configuredInstanceNumbers.has(directPhone)) {
    return [{ path, phone: directPhone }];
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).flatMap((entry, index) =>
      collectEvolutionLookupPhoneCandidates(
        entry,
        configuredInstanceNumbers,
        `${path}[${index}]`,
        depth + 1
      )
    );
  }

  const record = getRecord(value);
  if (!record) return [];

  return Object.entries(record).flatMap(([entryKey, entryValue]) =>
    collectEvolutionLookupPhoneCandidates(
      entryValue,
      configuredInstanceNumbers,
      `${path}.${entryKey}`,
      depth + 1
    )
  );
}

function collectExactEvolutionContactLookupMatches(
  value: unknown,
  lid: string,
  path = 'root',
  depth = 0
): Array<{ path: string; record: JsonRecord }> {
  if (depth > 5 || value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return value.slice(0, 20).flatMap((entry, index) =>
      collectExactEvolutionContactLookupMatches(entry, lid, `${path}[${index}]`, depth + 1)
    );
  }

  const record = getRecord(value);
  if (!record) return [];

  const hasExactIdMatch = EVOLUTION_CONTACT_LOOKUP_ID_KEYS.some(
    (key) => normalizeOptionalText(record[key]) === lid
  );
  const nestedMatches = Object.entries(record).flatMap(([entryKey, entryValue]) =>
    collectExactEvolutionContactLookupMatches(entryValue, lid, `${path}.${entryKey}`, depth + 1)
  );

  return hasExactIdMatch ? [{ path, record }, ...nestedMatches] : nestedMatches;
}

function resolveExactEvolutionLookupPhoneCandidate(
  value: unknown,
  lid: string,
  configuredInstanceNumbers = new Set<string>()
) {
  const exactMatches = collectExactEvolutionContactLookupMatches(value, lid);
  if (exactMatches.length !== 1) {
    return {
      status: exactMatches.length > 1 ? 'ambiguous_match_discarded' : 'not_found',
      candidate: null,
    } as const;
  }

  const [match] = exactMatches;
  const phoneCandidates = [
    ...new Map(
      collectEvolutionLookupPhoneCandidates(match.record, configuredInstanceNumbers).map(
        (candidate) => [candidate.phone, candidate]
      )
    ).values(),
  ];

  if (phoneCandidates.length !== 1) {
    return {
      status: phoneCandidates.length > 1 ? 'ambiguous_match_discarded' : 'not_found',
      candidate: null,
    } as const;
  }

  return {
    status: 'resolved',
    candidate: {
      path: `${match.path}.${phoneCandidates[0].path.replace(/^root\./, '')}`.replace(/\.root\./g, '.'),
      phone: phoneCandidates[0].phone,
    },
  } as const;
}

async function tryResolveEvolutionPhoneFromContactLookup(
  item: JsonRecord,
  envelope: JsonRecord | null | undefined,
  providerConfigJson: string | null | undefined,
  configuredInstanceNumbers = new Set<string>()
): Promise<EvolutionContactLookupResolution> {
  const lid = getEvolutionLidCandidates(item, envelope)[0] || null;
  if (!lid) {
    return {
      lid: null,
      phone: null,
      sourcePath: null,
      lookupStatus: 'not_attempted',
    };
  }

  const providerConfig = parseProviderConfigRecord(providerConfigJson);
  const baseUrl = getProviderConfigText(providerConfig, [
    'base_url',
    'baseUrl',
    'url',
    'api_url',
    'endpoint_url',
  ]);
  const instanceName = getProviderConfigText(providerConfig, [
    'instance',
    'instance_name',
    'instanceName',
  ]);
  const apiKey = getProviderConfigText(providerConfig, ['apikey', 'api_key', 'apiKey', 'token']);

  if (!baseUrl || !instanceName || !apiKey) {
    return {
      lid,
      phone: null,
      sourcePath: null,
      lookupStatus: 'config_unavailable',
    };
  }

  try {
    const response = await fetch(
      buildProviderUrl(baseUrl, `chat/findContacts/${encodeURIComponent(instanceName)}`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: safeJsonStringify({
          where: {
            id: lid,
          },
        }),
      }
    );
    const rawBody = await response.text();
    const responseBody = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
      return {
        lid,
        phone: null,
        sourcePath: null,
        lookupStatus: 'request_failed',
      };
    }

    const resolvedCandidate = resolveExactEvolutionLookupPhoneCandidate(
      responseBody,
      lid,
      configuredInstanceNumbers
    );

    return {
      lid,
      phone: resolvedCandidate.candidate?.phone || null,
      sourcePath: resolvedCandidate.candidate?.path || null,
      lookupStatus: resolvedCandidate.status,
    };
  } catch {
    return {
      lid,
      phone: null,
      sourcePath: null,
      lookupStatus: 'request_failed',
    };
  }
}

function resolveEvolutionCustomerPhone(
  item: JsonRecord,
  envelope?: JsonRecord | null,
  configuredInstanceNumbers = new Set<string>()
): EvolutionCustomerPhoneResolution {
  const blockedConfiguredMatches = new Map<string, string>();
  const discardedWeakEnvelopeMatches = new Map<string, string>();
  let presentCandidateCount = 0;
  let ignoredJidCandidateCount = 0;
  const candidates = getEvolutionPhoneCandidates(item, envelope)
    .map(([field, value], index) => ({ field, value, index }))
    .sort((left, right) => {
      const priorityDiff =
        getEvolutionPhoneCandidatePriority(left.field) -
        getEvolutionPhoneCandidatePriority(right.field);
      return priorityDiff !== 0 ? priorityDiff : left.index - right.index;
    });

  for (const { field, value } of candidates) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) continue;

    presentCandidateCount += 1;
    if (isIgnoredEvolutionJid(normalized)) {
      ignoredJidCandidateCount += 1;
      continue;
    }

    const phone = normalizeEvolutionCustomerPhoneCandidate(value);
    if (!phone) continue;
    if (configuredInstanceNumbers.has(phone)) {
      blockedConfiguredMatches.set(field, phone);
      continue;
    }
    if (isWeakEvolutionEnvelopePhoneCandidate(field)) {
      discardedWeakEnvelopeMatches.set(field, phone);
      continue;
    }

    return {
      phone,
      blockedConfiguredMatches: Array.from(blockedConfiguredMatches, ([fieldName, blockedPhone]) => ({
        field: fieldName,
        phone: blockedPhone,
      })),
      discardedWeakEnvelopeMatches: Array.from(
        discardedWeakEnvelopeMatches,
        ([fieldName, discardedPhone]) => ({
          field: fieldName,
          phone: discardedPhone,
        })
      ),
      unresolvedReason: null,
    };
  }

  let unresolvedReason: EvolutionCustomerPhoneUnresolvedReason;
  if (blockedConfiguredMatches.size > 0) {
    unresolvedReason = 'customer_phone_unresolved_instance_number_blocked';
  } else if (discardedWeakEnvelopeMatches.size > 0) {
    unresolvedReason = 'customer_phone_unresolved_weak_envelope_candidate_discarded';
  } else if (presentCandidateCount === 0) {
    unresolvedReason = 'customer_phone_unresolved_no_candidate_fields';
  } else if (ignoredJidCandidateCount === presentCandidateCount) {
    unresolvedReason = 'customer_phone_unresolved_only_ignored_jids';
  } else {
    unresolvedReason = 'customer_phone_unresolved_no_trusted_candidate';
  }

  return {
    phone: null,
    blockedConfiguredMatches: Array.from(blockedConfiguredMatches, ([fieldName, blockedPhone]) => ({
      field: fieldName,
      phone: blockedPhone,
    })),
    discardedWeakEnvelopeMatches: Array.from(
      discardedWeakEnvelopeMatches,
      ([fieldName, discardedPhone]) => ({
        field: fieldName,
        phone: discardedPhone,
      })
    ),
    unresolvedReason,
  };
}

type EvolutionExtractionAnalysis = {
  messages: NormalizedInboundWhatsAppMessage[];
  supportedMessageCount: number;
  unresolvedPhoneCount: number;
  unresolvedReasonCounts: Partial<Record<EvolutionCustomerPhoneUnresolvedReason, number>>;
};

function mapEvolutionUnresolvedReasonToInboundReason(
  reason: EvolutionCustomerPhoneUnresolvedReason
) {
  switch (reason) {
    case 'customer_phone_unresolved_instance_number_blocked':
      return 'supported_message_phone_unresolved_instance_number_blocked';
    case 'customer_phone_unresolved_weak_envelope_candidate_discarded':
      return 'supported_message_phone_unresolved_weak_envelope_candidate_discarded';
    case 'customer_phone_unresolved_only_ignored_jids':
      return 'supported_message_phone_unresolved_only_ignored_jids';
    case 'customer_phone_unresolved_no_candidate_fields':
      return 'supported_message_phone_unresolved_no_candidate_fields';
    case 'customer_phone_unresolved_no_trusted_candidate':
    default:
      return 'supported_message_phone_unresolved_no_trusted_candidate';
  }
}

function resolveEvolutionNoMessagesReason(analysis: EvolutionExtractionAnalysis | null) {
  if (!analysis || analysis.supportedMessageCount === 0 || analysis.unresolvedPhoneCount === 0) {
    return null;
  }

  const unresolvedReasons = Object.entries(analysis.unresolvedReasonCounts).filter(
    ([, count]) => Number(count) > 0
  );
  if (unresolvedReasons.length !== 1) {
    return 'supported_message_phone_unresolved';
  }

  return mapEvolutionUnresolvedReasonToInboundReason(
    unresolvedReasons[0][0] as EvolutionCustomerPhoneUnresolvedReason
  );
}

function extractEvolutionFallbackText(messageNode: unknown) {
  const message = getRecord(messageNode);
  if (!message) return null;

  if (getRecord(message.imageMessage)) return '[imagem recebida]';
  if (getRecord(message.videoMessage)) return '[video recebido]';
  if (getRecord(message.documentMessage)) return '[documento recebido]';
  if (getRecord(message.audioMessage)) return '[audio recebido]';
  if (getRecord(message.stickerMessage)) return '[figurinha recebida]';
  if (getRecord(message.locationMessage) || getRecord(message.liveLocationMessage)) {
    return '[localizacao recebida]';
  }
  if (getRecord(message.contactMessage) || getRecord(message.contactsArrayMessage)) {
    return '[contato recebido]';
  }
  if (normalizeOptionalText(message.mediaUrl)) return '[midia recebida]';

  return null;
}

function hasEvolutionDirectMessageShape(value: JsonRecord | null) {
  if (!value) return false;

  return Boolean(
    getRecord(value.key) ||
      getRecord(value.message) ||
      normalizeOptionalText(
        value.remoteJid ??
          value.participant ??
          value.sender ??
          value.from ??
          value.id ??
          value.messageId
      ) ||
      normalizeOptionalText(value.body) ||
      normalizeOptionalText(value.text) ||
      extractTextFromMessageNode(value) ||
      extractEvolutionFallbackText(value)
  );
}

function extractEvolutionCandidateContexts(root: JsonRecord | null) {
  if (!root) return [] as Array<{ item: JsonRecord; envelope: JsonRecord | null }>;

  const contexts: Array<{ item: JsonRecord; envelope: JsonRecord | null }> = [];

  const pushMessages = (container: JsonRecord) => {
    const messages = getArray(container.messages)
      .map((message) => getRecord(message))
      .filter((message): message is JsonRecord => message !== null);

    if (messages.length === 0) return false;

    for (const message of messages) {
      contexts.push({
        item: message,
        envelope: container,
      });
    }

    return true;
  };

  const dataCandidates = getArray(root.data)
    .map((item) => getRecord(item))
    .filter((item): item is JsonRecord => item !== null);

  if (dataCandidates.length > 0) {
    for (const candidate of dataCandidates) {
      if (pushMessages(candidate)) continue;
      if (hasEvolutionDirectMessageShape(candidate)) {
        contexts.push({
          item: candidate,
          envelope: root,
        });
        continue;
      }

      contexts.push({
        item: candidate,
        envelope: root,
      });
    }

    return contexts;
  }

  const dataRecord = getRecord(root.data);
  if (dataRecord) {
    if (pushMessages(dataRecord)) {
      return contexts;
    }
    if (hasEvolutionDirectMessageShape(dataRecord)) {
      contexts.push({
        item: dataRecord,
        envelope: root,
      });
      return contexts;
    }

    contexts.push({
      item: dataRecord,
      envelope: root,
    });
    return contexts;
  }

  if (pushMessages(root)) {
    return contexts;
  }
  if (hasEvolutionDirectMessageShape(root)) {
    contexts.push({
      item: root,
      envelope: null,
    });
    return contexts;
  }

  contexts.push({
    item: root,
    envelope: null,
  });

  return contexts;
}

function summarizeEvolutionPayloadShape(payload: unknown) {
  const root = getRecord(payload);
  const data = getRecord(root?.data);
  const dataArray = getArray(root?.data);
  const firstDataItem = getRecord(dataArray[0]);
  const messages = getArray(data?.messages ?? firstDataItem?.messages ?? root?.messages);
  const firstMessage = getRecord(messages[0]);
  const firstMessageKey = getRecord(firstMessage?.key);
  const firstMessageContent = getRecord(firstMessage?.message);
  const firstEnvelope = data ?? firstDataItem ?? root ?? null;
  const firstCandidateItem = firstMessage ?? firstDataItem ?? data ?? root ?? null;

  return {
    rootKeys: root ? Object.keys(root).slice(0, 12) : [],
    dataType: Array.isArray(root?.data) ? 'array' : typeof root?.data,
    dataKeys: data ? Object.keys(data).slice(0, 12) : [],
    dataArrayCount: dataArray.length,
    firstDataItemKeys: firstDataItem ? Object.keys(firstDataItem).slice(0, 12) : [],
    messagesCount: messages.length,
    firstMessageKeys: firstMessage ? Object.keys(firstMessage).slice(0, 12) : [],
    firstMessageKeyKeys: firstMessageKey ? Object.keys(firstMessageKey).slice(0, 12) : [],
    firstMessageContentKeys: firstMessageContent
      ? Object.keys(firstMessageContent).slice(0, 12)
      : [],
    remoteJid: normalizeOptionalText(
      firstMessageKey?.remoteJid ??
        firstMessage?.remoteJid ??
        getRecord(data?.key)?.remoteJid ??
        data?.remoteJid ??
        getRecord(firstDataItem?.key)?.remoteJid ??
        firstDataItem?.remoteJid
    ),
    fromMe: toBool(
      firstMessage?.fromMe ??
        firstMessageKey?.fromMe ??
        data?.fromMe ??
        getRecord(data?.key)?.fromMe ??
        firstDataItem?.fromMe ??
        getRecord(firstDataItem?.key)?.fromMe,
      false
    ),
    pushNamePresent: Boolean(
      normalizeOptionalText(
        firstMessage?.pushName ??
          firstMessage?.senderName ??
          firstMessage?.notifyName ??
          data?.pushName ??
          data?.senderName ??
          firstDataItem?.pushName ??
          firstDataItem?.senderName
      )
    ),
    candidateFields:
      firstCandidateItem && firstEnvelope
        ? summarizeEvolutionPhoneCandidateFields(firstCandidateItem, firstEnvelope)
        : [],
  };
}

async function analyzeEvolutionMessages(
  tenantId: number,
  provider: string,
  payload: unknown,
  payloadJson: string,
  providerConfigJson: string | null | undefined,
  configuredInstanceNumbers = new Set<string>()
): Promise<EvolutionExtractionAnalysis> {
  const root = getRecord(payload);
  const candidates = extractEvolutionCandidateContexts(root);
  const messages: NormalizedInboundWhatsAppMessage[] = [];
  let supportedMessageCount = 0;
  let unresolvedPhoneCount = 0;
  const unresolvedReasonCounts: Partial<
    Record<EvolutionCustomerPhoneUnresolvedReason, number>
  > = {};
  const contactLookupCache = new Map<string, Promise<EvolutionContactLookupResolution>>();

  for (const { item, envelope } of candidates) {
    const key = getRecord(item.key);
    const envelopeKey = getRecord(envelope?.key);
    const fromMe = toBool(item.fromMe ?? key?.fromMe ?? envelope?.fromMe ?? envelopeKey?.fromMe, false);
    if (fromMe) continue;

    const messageText =
      extractTextFromMessageNode(item.message) ||
      extractTextFromMessageNode(item) ||
      normalizeOptionalText(item.body) ||
      normalizeOptionalText(item.text) ||
      extractTextFromMessageNode(envelope?.message) ||
      extractTextFromMessageNode(envelope) ||
      normalizeOptionalText(envelope?.body) ||
      normalizeOptionalText(envelope?.text) ||
      extractEvolutionFallbackText(item.message) ||
      extractEvolutionFallbackText(item) ||
      extractEvolutionFallbackText(envelope?.message) ||
      extractEvolutionFallbackText(envelope);
    if (!messageText) continue;

    supportedMessageCount += 1;
    const customerName = resolveEvolutionCustomerName(item, envelope);
    const phoneResolution = resolveEvolutionCustomerPhone(
      item,
      envelope,
      configuredInstanceNumbers
    );
    let phone = phoneResolution.phone;
    let contactLookupResolution: EvolutionContactLookupResolution | null = null;

    if (!phone) {
      const lid = getEvolutionLidCandidates(item, envelope)[0] || null;
      if (lid) {
        const cachedLookup =
          contactLookupCache.get(lid) ||
          tryResolveEvolutionPhoneFromContactLookup(
            item,
            envelope,
            providerConfigJson,
            configuredInstanceNumbers
          );
        contactLookupCache.set(lid, cachedLookup);
        contactLookupResolution = await cachedLookup;
        if (contactLookupResolution.phone) {
          phone = contactLookupResolution.phone;
        }
      }
    }

    if (!phone) {
      unresolvedPhoneCount += 1;
      if (phoneResolution.unresolvedReason) {
        unresolvedReasonCounts[phoneResolution.unresolvedReason] =
          (unresolvedReasonCounts[phoneResolution.unresolvedReason] || 0) + 1;
      }
      logInfo('whatsAppInboundService.evolutionPhoneUnresolved', {
        tenantId,
        provider,
        reason: phoneResolution.unresolvedReason || 'customer_phone_unresolved',
        resolvedCustomerName: customerName,
        customerPhoneResolved: false,
        messageId:
          normalizeOptionalText(key?.id) ||
          normalizeOptionalText(item.id) ||
          normalizeOptionalText(item.messageId) ||
          normalizeOptionalText(envelopeKey?.id) ||
          normalizeOptionalText(envelope?.id) ||
          normalizeOptionalText(envelope?.messageId),
        text: summarizeText(messageText),
        candidateFields: summarizeEvolutionPhoneCandidateFields(item, envelope),
        candidateResolution: summarizeEvolutionPhoneResolutionCandidates(
          item,
          envelope,
          configuredInstanceNumbers
        ),
        blockedInstanceNumberCandidates: phoneResolution.blockedConfiguredMatches.map(
          ({ field, phone: blockedPhone }) => `${field}:${maskPhone(blockedPhone)}`
        ),
        discardedWeakEnvelopeCandidates: phoneResolution.discardedWeakEnvelopeMatches.map(
          ({ field, phone: discardedPhone }) => `${field}:${maskPhone(discardedPhone)}`
        ),
        auxiliaryContactLookup:
          contactLookupResolution && contactLookupResolution.lookupStatus !== 'not_attempted'
            ? {
                lid: maskEvolutionDiagnosticValue(contactLookupResolution.lid),
                phoneMasked: maskPhone(contactLookupResolution.phone),
                sourcePath: contactLookupResolution.sourcePath,
                status: contactLookupResolution.lookupStatus,
              }
            : undefined,
        configuredInstanceNumbers: Array.from(configuredInstanceNumbers).map((value) =>
          maskPhone(value)
        ),
        payloadShape: summarizeEvolutionPayloadShape(payload),
      });

      continue;
    }

    if (contactLookupResolution?.phone) {
      logInfo('whatsAppInboundService.evolutionPhoneResolvedByContactLookup', {
        tenantId,
        provider,
        resolvedCustomerName: customerName,
        messageId:
          normalizeOptionalText(key?.id) ||
          normalizeOptionalText(item.id) ||
          normalizeOptionalText(item.messageId) ||
          normalizeOptionalText(envelopeKey?.id) ||
          normalizeOptionalText(envelope?.id) ||
          normalizeOptionalText(envelope?.messageId),
        lid: maskEvolutionDiagnosticValue(contactLookupResolution.lid),
        phoneMasked: maskPhone(contactLookupResolution.phone),
        sourcePath: contactLookupResolution.sourcePath,
      });
    }

    messages.push({
      tenant_id: tenantId,
      provider,
      customer_phone: phone,
      customer_name: customerName,
      message_text: messageText,
      provider_message_id:
        normalizeOptionalText(key?.id) ||
        normalizeOptionalText(item.id) ||
        normalizeOptionalText(item.messageId) ||
        normalizeOptionalText(envelopeKey?.id) ||
        normalizeOptionalText(envelope?.id) ||
        normalizeOptionalText(envelope?.messageId),
      created_at: normalizeTimestamp(
        item.messageTimestamp ??
          item.timestamp ??
          item.createdAt ??
          item.date_time ??
          envelope?.messageTimestamp ??
          envelope?.timestamp ??
          envelope?.createdAt ??
          envelope?.date_time ??
          root?.createdAt ??
          root?.date_time
      ),
      payload_json: payloadJson,
    } satisfies NormalizedInboundWhatsAppMessage);
  }

  return {
    messages,
    supportedMessageCount,
    unresolvedPhoneCount,
    unresolvedReasonCounts,
  };
}

function extractEvolutionMessages(
  tenantId: number,
  provider: string,
  payload: unknown,
  payloadJson: string,
  providerConfigJson: string | null | undefined,
  configuredInstanceNumbers = new Set<string>()
): Promise<NormalizedInboundWhatsAppMessage[]> {
  return analyzeEvolutionMessages(
    tenantId,
    provider,
    payload,
    payloadJson,
    providerConfigJson,
    configuredInstanceNumbers
  ).then((analysis) => analysis.messages);
}

async function extractInboundMessages(
  tenantId: number,
  provider: string,
  payload: unknown,
  providerConfigJson?: string | null
): Promise<NormalizedInboundWhatsAppMessage[]> {
  const payloadJson = safeJsonStringify(payload);
  const configuredInstanceNumbers = resolveConfiguredWhatsAppNumbersFromProviderConfigJson(
    providerConfigJson
  );

  if (provider === 'evolution' || provider === 'evolution_api') {
    return extractEvolutionMessages(
      tenantId,
      provider,
      payload,
      payloadJson,
      providerConfigJson,
      configuredInstanceNumbers
    );
  }

  if (provider === 'meta' || provider === 'meta_cloud_api' || provider === 'whatsapp_cloud_api') {
    return Promise.resolve(extractMetaMessages(tenantId, provider, payload, payloadJson));
  }

  return Promise.resolve(extractGenericMessages(tenantId, provider, payload, payloadJson));
}

function extractMetaMessages(
  tenantId: number,
  provider: string,
  payload: unknown,
  payloadJson: string
): NormalizedInboundWhatsAppMessage[] {
  const root = getRecord(payload);
  const entries = getArray(root?.entry);
  const messages: NormalizedInboundWhatsAppMessage[] = [];

  for (const entry of entries) {
    const entryRecord = getRecord(entry);
    for (const change of getArray(entryRecord?.changes)) {
      const value = getRecord(getRecord(change)?.value);
      const contacts = getArray(value?.contacts).map((item) => getRecord(item));
      const firstContact = contacts.find(Boolean) || null;

      for (const message of getArray(value?.messages)) {
        const messageRecord = getRecord(message);
        if (!messageRecord) continue;

        const phone = normalizeWhatsAppPhone(
          messageRecord.from ?? firstContact?.wa_id
        );
        const messageText =
          normalizeOptionalText(getRecord(messageRecord.text)?.body) ||
          extractTextFromMessageNode(messageRecord) ||
          normalizeOptionalText(messageRecord.body);

        if (!phone || !messageText) continue;

        messages.push({
          tenant_id: tenantId,
          provider,
          customer_phone: phone,
          customer_name: normalizeOptionalText(getRecord(firstContact?.profile)?.name),
          message_text: messageText,
          provider_message_id: normalizeOptionalText(messageRecord.id),
          created_at: normalizeTimestamp(messageRecord.timestamp),
          payload_json: payloadJson,
        });
      }
    }
  }

  return messages;
}

function extractGenericMessages(
  tenantId: number,
  provider: string,
  payload: unknown,
  payloadJson: string
): NormalizedInboundWhatsAppMessage[] {
  const root = getRecord(payload);
  if (!root) return [];

  const directPhone = normalizeWhatsAppPhone(
    root.customer_phone ??
      root.phone ??
      root.from ??
      root.sender ??
      root.remoteJid ??
      getRecord(root.contact)?.phone
  );
  const directText =
    normalizeOptionalText(root.message_text) ||
    normalizeOptionalText(root.body) ||
    normalizeOptionalText(root.text) ||
    extractTextFromMessageNode(root.message) ||
    extractTextFromMessageNode(root);

  if (!directPhone || !directText) return [];

  return [
    {
      tenant_id: tenantId,
      provider,
      customer_phone: directPhone,
      customer_name:
        normalizeOptionalText(root.customer_name) ||
        normalizeOptionalText(root.name) ||
        normalizeOptionalText(root.sender_name) ||
        normalizeOptionalText(getRecord(root.contact)?.name),
      message_text: directText,
      provider_message_id:
        normalizeOptionalText(root.provider_message_id) ||
        normalizeOptionalText(root.message_id) ||
        normalizeOptionalText(root.id),
      created_at: normalizeTimestamp(
        root.created_at ?? root.timestamp ?? root.date_time ?? root.date
      ),
      payload_json: payloadJson,
    },
  ];
}

async function insertInboundMessage(message: NormalizedInboundWhatsAppMessage) {
  if (message.provider_message_id) {
    const existing = await q1<{ id: number }>(
      `SELECT id
       FROM whatsapp_inbound_messages
       WHERE tenant_id=?
         AND provider=?
         AND provider_message_id=?`,
      [message.tenant_id, message.provider, message.provider_message_id]
    );

    if (existing) {
      return null;
    }
  }

  const inserted = await q1<{ id: number }>(
    `INSERT INTO whatsapp_inbound_messages
      (tenant_id, provider, provider_message_id, customer_phone, customer_name, message_text, payload_json, created_at, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     RETURNING id`,
    [
      message.tenant_id,
      message.provider,
      message.provider_message_id,
      message.customer_phone,
      message.customer_name,
      message.message_text,
      message.payload_json,
      message.created_at,
    ]
  );

  return inserted?.id ? Number(inserted.id) : null;
}

export async function registerInboundWhatsAppMessages(
  input: RegisterInboundWhatsAppMessagesInput
): Promise<RegisterInboundWhatsAppMessagesResult> {
  const resolvedTenant = await resolveTenantContext(input.tenantId, input.payload);
  const tenantId = resolvedTenant.tenantId;
  const eventName = resolveInboundEventName(input.webhookEventName, input.payload);

  if (resolvedTenant.conflict) {
    logInfo('whatsAppInboundService.tenantResolved', {
      tenantId: input.tenantId,
      resolvedTenantId: null,
      routeTenantId: resolvedTenant.routeTenantId,
      payloadTenantId: resolvedTenant.payloadTenantId,
      instance: resolvedTenant.instance,
      webhookEventName: eventName,
      payloadEvent: extractPayloadEventName(input.payload),
      accepted: false,
      reason: 'tenant_id_conflict',
    });
    return {
      accepted: false,
      reason: 'tenant_id_conflict',
      provider: null,
      savedCount: 0,
      ignoredCount: 0,
    };
  }

  if (!tenantId) {
    logInfo('whatsAppInboundService.tenantResolved', {
      tenantId: input.tenantId,
      resolvedTenantId: null,
      routeTenantId: resolvedTenant.routeTenantId,
      payloadTenantId: resolvedTenant.payloadTenantId,
      instance: resolvedTenant.instance,
      webhookEventName: eventName,
      payloadEvent: extractPayloadEventName(input.payload),
      accepted: false,
      reason: 'invalid_tenant_id',
    });
    return {
      accepted: false,
      reason: 'invalid_tenant_id',
      provider: null,
      savedCount: 0,
      ignoredCount: 0,
    };
  }

  const connectionConfig = await getTenantWhatsAppConnectionConfig(tenantId);
  const config = connectionConfig ? mapTenantConnectionConfigToInboundRow(connectionConfig) : null;

  if (!config) {
    logInfo('whatsAppInboundService.tenantResolved', {
      tenantId,
      resolvedTenantId: tenantId,
      routeTenantId: resolvedTenant.routeTenantId,
      payloadTenantId: resolvedTenant.payloadTenantId,
      instance: resolvedTenant.instance,
      webhookEventName: eventName,
      payloadEvent: extractPayloadEventName(input.payload),
      accepted: false,
      reason: 'tenant_whatsapp_config_not_found',
    });
    return {
      accepted: false,
      reason: 'tenant_whatsapp_config_not_found',
      provider: null,
      savedCount: 0,
      ignoredCount: 0,
    };
  }

  if (!toBool(config.whatsapp_enabled, false)) {
    logInfo('whatsAppInboundService.tenantResolved', {
      tenantId,
      resolvedTenantId: tenantId,
      routeTenantId: resolvedTenant.routeTenantId,
      payloadTenantId: resolvedTenant.payloadTenantId,
      instance: resolvedTenant.instance,
      webhookEventName: eventName,
      payloadEvent: extractPayloadEventName(input.payload),
      provider: normalizeProviderName(config.provider),
      providerConfigPresent: Boolean(normalizeOptionalText(config.provider_config_json)),
      accepted: false,
      reason: 'whatsapp_disabled',
    });
    return {
      accepted: false,
      reason: 'whatsapp_disabled',
      provider: normalizeProviderName(config.provider),
      savedCount: 0,
      ignoredCount: 0,
    };
  }

  const provider = normalizeProviderName(config.provider) || 'generic_http';
  if (
    (provider === 'evolution' || provider === 'evolution_api') &&
    !isSupportedEvolutionInboundEvent(eventName)
  ) {
    logInfo('whatsAppInboundService.eventIgnored', {
      tenantId,
      routeTenantId: resolvedTenant.routeTenantId,
      payloadTenantId: resolvedTenant.payloadTenantId,
      instance: resolvedTenant.instance,
      webhookEventName: eventName,
      payloadEvent: extractPayloadEventName(input.payload),
      provider,
      reason: 'unsupported_evolution_event',
    });
    return {
      accepted: true,
      reason: 'unsupported_evolution_event',
      provider,
      savedCount: 0,
      ignoredCount: 0,
    };
  }

  const tenant = await q1<TenantInboundAutoReplyRow>(
    `SELECT c.id,
            c.usuario,
            c.nome_estabelecimento,
            c.delivery_ativo,
            c.delivery_config,
            COALESCE(tpc.pix_enabled, 0) AS pix_enabled
     FROM clientes c
     LEFT JOIN tenant_pix_config tpc
       ON tpc.tenant_id = c.id
     WHERE c.id=?`,
    [tenantId]
  );
  const configuredInboundInstanceNumbers = resolveConfiguredInboundInstanceNumbers(config);
  const evolutionAnalysis =
    provider === 'evolution' || provider === 'evolution_api'
      ? await analyzeEvolutionMessages(
          tenantId,
          provider,
          input.payload,
          safeJsonStringify(input.payload),
          config.provider_config_json,
          configuredInboundInstanceNumbers
        )
      : null;
  const inboundMessages =
    evolutionAnalysis?.messages ??
    (await extractInboundMessages(
      tenantId,
      provider,
      input.payload,
      config.provider_config_json
    ));

  logInfo('whatsAppInboundService.tenantResolved', {
    tenantId,
    resolvedTenantId: tenantId,
    routeTenantId: resolvedTenant.routeTenantId,
    payloadTenantId: resolvedTenant.payloadTenantId,
    instance: resolvedTenant.instance,
    webhookEventName: eventName,
    payloadEvent: extractPayloadEventName(input.payload),
    provider,
    providerConfigPresent: Boolean(normalizeOptionalText(config.provider_config_json)),
    tenantFound: Boolean(tenant),
    accepted: true,
    extractedMessages: inboundMessages.length,
  });

  if (inboundMessages.length === 0) {
    const noMessagesReason =
      resolveEvolutionNoMessagesReason(evolutionAnalysis) || 'no_supported_messages_found';
    const unresolvedPhoneDiagnostic =
      (provider === 'evolution' || provider === 'evolution_api') &&
      noMessagesReason.startsWith('supported_message_phone_unresolved')
        ? summarizeEvolutionUnresolvedPhoneDiagnostic(
            input.payload,
            configuredInboundInstanceNumbers
          )
        : undefined;
    const unresolvedPhoneDiagnosticJson = unresolvedPhoneDiagnostic
      ? safeJsonStringify(unresolvedPhoneDiagnostic)
      : undefined;

    logInfo('whatsAppInboundService.noSupportedMessages', {
      tenantId,
      routeTenantId: resolvedTenant.routeTenantId,
      payloadTenantId: resolvedTenant.payloadTenantId,
      instance: resolvedTenant.instance,
      provider,
      webhookEventName: eventName,
      payloadEvent: extractPayloadEventName(input.payload),
      payloadShape:
        provider === 'evolution' || provider === 'evolution_api'
          ? summarizeEvolutionPayloadShape(input.payload)
          : undefined,
      supportedMessageCount: evolutionAnalysis?.supportedMessageCount,
      unresolvedPhoneCount: evolutionAnalysis?.unresolvedPhoneCount,
      unresolvedReasonCounts: evolutionAnalysis?.unresolvedReasonCounts,
      unresolvedPhoneDiagnostic,
      unresolvedPhoneDiagnosticJson,
      reason: noMessagesReason,
    });
    return {
      accepted: true,
      reason: noMessagesReason,
      provider,
      savedCount: 0,
      ignoredCount: 0,
    };
  }

  let savedCount = 0;
  let ignoredCount = 0;
  const paymentMethods = tenant
    ? await resolveTenantPaymentMethods(tenantId, tenant)
    : ['Dinheiro', 'Cartao'];

  for (const message of inboundMessages) {
    let insertedId: number | null = null;

    try {
      insertedId = await insertInboundMessage(message);
      if (!insertedId) {
        ignoredCount += 1;
        continue;
      }

      savedCount += 1;

      if (!tenant) {
        await updateInboundMessageAutomation(insertedId, {
          intent: null,
          autoReplyStatus: 'ignored_tenant_not_found',
        });
        continue;
      }

      await processInboundAutoReply({
        tenantId,
        config,
        tenant,
        paymentMethods,
        message: {
          ...message,
          id: insertedId,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (insertedId) {
        try {
          await updateInboundMessageAutomation(insertedId, {
            intent: null,
            autoReplyStatus: 'error_processing',
            autoReplyError: errorMessage,
          });
        } catch (updateError) {
          logError('whatsAppInboundService.message.process.updateFailure', updateError, {
            tenantId,
            inboundMessageId: insertedId,
            provider: message.provider,
            providerMessageId: message.provider_message_id,
            recipient: maskPhone(message.customer_phone),
          });
        }
      }

      logError('whatsAppInboundService.message.process', error, {
        tenantId,
        inboundMessageId: insertedId,
        provider: message.provider,
        providerMessageId: message.provider_message_id,
        recipient: maskPhone(message.customer_phone),
        text: summarizeText(message.message_text),
      });
    }
  }

  return {
    accepted: true,
    reason: null,
    provider,
    savedCount,
    ignoredCount,
  };
}
