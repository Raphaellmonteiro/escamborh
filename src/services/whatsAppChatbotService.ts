import { q1, qAll, qRun } from '../db'
import { coerceDeliveryConfigRow } from '../utils/deliveryConfigPersist'
import {
  findDeliveryZoneByBairro,
  MENSAGEM_ENTREGA_FORA_DA_AREA,
  normalizeBairroForZonaMatch,
} from '../utils/deliveryBairroZona'
import { AppError } from '../utils/errors'
import { logError } from '../utils/logger'
import { callAIProvider, type AIProviderAdapterResult } from './aiProviderAdapter'
import {
  loadMenuContextForAI,
  buildSystemPromptWithMenu,
} from './whatsAppMenuContextService'

type JsonRecord = Record<string, unknown>

type TenantChatbotConfigRow = {
  tenant_id: number | string
  chatbot_enabled: number | boolean | string | null
  provider: string | null
  model: string | null
  system_prompt: string | null
  provider_config_json: string | null
  created_at: string
  updated_at: string
}

type TenantChatbotContextRow = {
  id: number | string
  usuario?: string | null
  nome_estabelecimento?: string | null
  whatsapp?: string | null
  delivery_ativo?: number | boolean | string | null
  delivery_config?: unknown
  pix_enabled?: number | boolean | string | null
}

type PaymentMethodRow = {
  method?: string | null
}

type OrderStatusLookupRow = {
  order_number?: string | null
  status?: string | null
  cliente_tel?: string | null
}

type DeliveryZoneInfo = {
  nome: string
  taxa: number
}

export type ChatbotKeywordIntent =
  | 'saudacao'
  | 'cardapio'
  | 'pix'
  | 'pagamento'
  | 'entrega'
  | 'bairro'
  | 'taxa_entrega'
  | 'zona_entrega'
  | 'status_pedido'
  | 'atendente'

export type TenantChatbotConfigRecord = {
  tenant_id: number
  chatbot_enabled: boolean
  provider: string
  model: string | null
  system_prompt: string | null
  provider_config_json: string | null
  created_at: string
  updated_at: string
}

export type TenantChatbotRuntimeContext = {
  tenantId: number
  tenantName: string | null
  slug: string | null
  whatsapp: string | null
  deliveryEnabled: boolean
  deliveryConfig: JsonRecord
  pixEnabled: boolean
}

export type UpsertTenantChatbotConfigInput = {
  tenant_id: number | string
  chatbot_enabled?: boolean | number | string | null
  provider?: string | null
  model?: string | null
  system_prompt?: string | null
  provider_config_json?: string | Record<string, unknown> | null
}

export type BuildChatbotKeywordReplyInput = {
  intent: ChatbotKeywordIntent
  tenantId: number
  messageText: string
  customerName?: string | null
  customerPhone?: string | null
  context: TenantChatbotRuntimeContext
  paymentMethods?: string[] | null
}

export type GroqFallbackReplyInput = {
  tenantId: number | string
  messageText: string
  customerName?: string | null
  config: TenantChatbotConfigRecord
  context?: TenantChatbotRuntimeContext | null
  paymentMethods?: string[] | null
}

export type GroqFallbackReplyResult = AIProviderAdapterResult

export type ProcessChatbotMessageInput = {
  tenantId: number | string
  messageText: string
  customerName?: string | null
  customerPhone?: string | null
  allowAiFallback?: boolean
  ignoreDisabled?: boolean
  config?: TenantChatbotConfigRecord | null
  context?: TenantChatbotRuntimeContext | null
  paymentMethods?: string[] | null
}

export type ProcessChatbotMessageReason =
  | 'keyword_match'
  | 'ai_reply'
  | 'groq_reply'
  | 'chatbot_not_configured'
  | 'chatbot_disabled'
  | 'no_intent_match'
  | 'provider_not_supported'
  | 'groq_not_configured'
  | 'ai_not_configured'
  | 'groq_error'
  | 'ai_error'

export type ProcessChatbotMessageResult = {
  tenantId: number
  chatbotEnabled: boolean
  provider: string | null
  model: string | null
  intent: ChatbotKeywordIntent | null
  replySource: 'keyword' | 'groq' | 'none'
  replyText: string | null
  handoffRequested: boolean
  usedAiFallback: boolean
  reason: ProcessChatbotMessageReason
  error: string | null
}

export const DEFAULT_TENANT_CHATBOT_CONFIG = {
  chatbot_enabled: false,
  provider: 'groq',
  model: null as string | null,
  system_prompt: null as string | null,
  provider_config_json: null as string | null,
}

export const CHATBOT_PROVIDER_SECRET_PLACEHOLDER = '__FLOWPDV_REDACTED__'

const SENSITIVE_PROVIDER_CONFIG_KEYS = new Set([
  'api_key',
  'apikey',
  'token',
  'access_token',
  'authorization',
  'secret',
])

function parseTenantId(value: number | string) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('Tenant invalido', 400)
  }

  return parsed
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null

  const normalized = String(value).trim()
  return normalized || null
}

function normalizeRequiredMessage(value: unknown) {
  const normalized = normalizeOptionalText(value)

  if (!normalized) {
    throw new AppError('messageText obrigatoria', 400)
  }

  return normalized
}

function toBool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false

  return fallback
}

function normalizeProviderName(value: unknown) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) return DEFAULT_TENANT_CHATBOT_CONFIG.provider

  const provider = normalized.toLowerCase().replace(/[\s-]+/g, '_')
  if (provider === 'groq_api' || provider === 'groqcloud') return 'groq'
  return provider
}

function normalizeConfigKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .trim()
}

function isSensitiveProviderConfigKey(key: string) {
  const normalized = normalizeConfigKey(key)
  return (
    SENSITIVE_PROVIDER_CONFIG_KEYS.has(normalized) ||
    normalized.endsWith('_token') ||
    normalized.includes('secret')
  )
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseProviderConfigObject(
  value: unknown,
  options: { strict?: boolean } = {}
): JsonRecord | null {
  if (value === undefined || value === null) return null

  if (isPlainRecord(value)) {
    return { ...(value as JsonRecord) }
  }

  const normalized = normalizeOptionalText(value)
  if (!normalized) return null

  try {
    const parsed = JSON.parse(normalized) as unknown
    if (isPlainRecord(parsed)) {
      return { ...(parsed as JsonRecord) }
    }

    if (options.strict) {
      throw new Error('provider_config_json deve ser um objeto')
    }
  } catch (error) {
    if (options.strict) {
      throw new AppError(
        error instanceof Error && error.message
          ? `provider_config_json invalido: ${error.message}`
          : 'provider_config_json invalido',
        400
      )
    }

    return null
  }

  if (options.strict) {
    throw new AppError('provider_config_json invalido', 400)
  }

  return null
}

function stringifyProviderConfigObject(value: JsonRecord | null) {
  if (!value || Object.keys(value).length === 0) return null

  try {
    return JSON.stringify(value)
  } catch {
    throw new AppError('provider_config_json invalido', 400)
  }
}

function preserveMissingSensitiveProviderConfig(
  current: JsonRecord | null,
  next: JsonRecord | null
): JsonRecord | null {
  const output = next ? { ...next } : {}

  if (!current) {
    return Object.keys(output).length > 0 ? output : null
  }

  for (const [key, currentValue] of Object.entries(current)) {
    if (isSensitiveProviderConfigKey(key)) {
      const nextValue = output[key]
      const normalizedNextValue = normalizeOptionalText(nextValue)

      if (
        nextValue === undefined ||
        nextValue === null ||
        !normalizedNextValue ||
        normalizedNextValue === CHATBOT_PROVIDER_SECRET_PLACEHOLDER
      ) {
        output[key] = currentValue
      }
      continue
    }

    if (!isPlainRecord(currentValue)) continue

    const nextValue = output[key]
    const mergedChild = preserveMissingSensitiveProviderConfig(
      currentValue as JsonRecord,
      isPlainRecord(nextValue) ? (nextValue as JsonRecord) : null
    )

    if (mergedChild && Object.keys(mergedChild).length > 0) {
      output[key] = mergedChild
    }
  }

  return Object.keys(output).length > 0 ? output : null
}

function redactSensitiveProviderConfig(value: JsonRecord | null): JsonRecord | null {
  if (!value) return null

  const output: JsonRecord = {}

  for (const [key, currentValue] of Object.entries(value)) {
    if (isSensitiveProviderConfigKey(key)) {
      output[key] = CHATBOT_PROVIDER_SECRET_PLACEHOLDER
      continue
    }

    if (isPlainRecord(currentValue)) {
      output[key] = redactSensitiveProviderConfig(currentValue as JsonRecord)
      continue
    }

    output[key] = currentValue
  }

  return output
}

function normalizeTextForMatch(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function normalizeProviderConfigJson(value: unknown) {
  return stringifyProviderConfigObject(parseProviderConfigObject(value, { strict: true }))
}

export function redactChatbotProviderConfigJsonForClient(
  rawValue: string | null | undefined
) {
  return stringifyProviderConfigObject(
    redactSensitiveProviderConfig(parseProviderConfigObject(rawValue))
  )
}

export function mergeChatbotProviderConfigJsonPreservingSecrets(
  currentRawValue: string | null | undefined,
  nextValue: unknown
) {
  return stringifyProviderConfigObject(
    preserveMissingSensitiveProviderConfig(
      parseProviderConfigObject(currentRawValue),
      parseProviderConfigObject(nextValue, { strict: true })
    )
  )
}

export function sanitizeTenantChatbotConfigForClient(
  config: TenantChatbotConfigRecord | null
): TenantChatbotConfigRecord | null {
  if (!config) return null

  return {
    ...config,
    provider_config_json: redactChatbotProviderConfigJsonForClient(config.provider_config_json),
  }
}

function mapTenantChatbotConfigRow(row: TenantChatbotConfigRow): TenantChatbotConfigRecord {
  return {
    tenant_id: Number(row.tenant_id),
    chatbot_enabled: toBool(row.chatbot_enabled, DEFAULT_TENANT_CHATBOT_CONFIG.chatbot_enabled),
    provider: normalizeProviderName(row.provider),
    model: normalizeOptionalText(row.model),
    system_prompt: normalizeOptionalText(row.system_prompt),
    provider_config_json: normalizeOptionalText(row.provider_config_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function getFirstName(value: string | null | undefined) {
  const firstName = String(value || '').trim().split(/\s+/)[0]
  return firstName || null
}

function getGreeting(name: string | null | undefined) {
  const firstName = getFirstName(name)
  return firstName ? `Ola, ${firstName}!` : 'Ola!'
}

function normalizeOptionalHttpUrl(value: unknown) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) return null

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    return parsed.toString()
  } catch {
    return null
  }
}

function resolvePublicBaseUrl() {
  const explicit =
    normalizeOptionalText(process.env.FLOWPDV_WHATSAPP_CARDAPIO_URL) ||
    normalizeOptionalText(process.env.FLOWPDV_PUBLIC_URL) ||
    normalizeOptionalText(process.env.APP_URL) ||
    normalizeOptionalText(process.env.RAILWAY_PUBLIC_DOMAIN)

  if (explicit) {
    const withProtocol = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`
    return withProtocol.replace(/\/+$/, '')
  }

  const fromAllowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOptionalText(item))
    .find((item): item is string => Boolean(item))

  if (fromAllowedOrigins) {
    return fromAllowedOrigins.replace(/\/+$/, '')
  }

  return `http://localhost:${normalizeOptionalText(process.env.PORT) || '3001'}`
}

function resolveTenantCardapioUrl(context: TenantChatbotRuntimeContext) {
  if (!context.deliveryEnabled) return null

  const shortCardapioUrl = normalizeOptionalHttpUrl(context.deliveryConfig.cardapio_link_curto)
  if (shortCardapioUrl) {
    return shortCardapioUrl
  }

  return context.slug
    ? `${resolvePublicBaseUrl()}/delivery/${encodeURIComponent(context.slug)}`
    : null
}

function formatCurrencyBrl(value: unknown) {
  const amount = Number(value)
  const safeAmount = Number.isFinite(amount) ? amount : 0

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeAmount)
}

function normalizePaymentMethodKey(value: unknown) {
  return normalizeTextForMatch(value).replace(/\s+/g, '_')
}

function formatPaymentMethodLabel(rawValue: string) {
  const key = normalizePaymentMethodKey(rawValue)

  if (key.includes('pix')) return 'Pix'
  if (key.includes('dinheiro')) return 'Dinheiro'
  if (key.includes('debito')) return 'Cartao de debito'
  if (key.includes('credito')) return 'Cartao de credito'
  if (key.includes('cartao')) return 'Cartao'

  const normalized = normalizeOptionalText(rawValue)
  if (!normalized) return null

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatPaymentMethodsList(methods: string[]) {
  if (methods.length === 0) return 'Dinheiro e cartao'
  if (methods.length === 1) return methods[0]
  if (methods.length === 2) return `${methods[0]} e ${methods[1]}`
  return `${methods.slice(0, -1).join(', ')} e ${methods[methods.length - 1]}`
}

function parseDeliveryFeeValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveTenantDeliveryZones(context: TenantChatbotRuntimeContext) {
  const defaultFee = parseDeliveryFeeValue(context.deliveryConfig.taxa_entrega)
  const rawZones = Array.isArray(context.deliveryConfig.zonas_entrega)
    ? context.deliveryConfig.zonas_entrega
    : []

  const zones = rawZones
    .map((zone) => {
      if (!zone || typeof zone !== 'object' || Array.isArray(zone)) {
        return null
      }

      const record = zone as JsonRecord
      const nome = normalizeOptionalText(record.nome)
      if (!nome) return null

      return {
        nome,
        taxa: parseDeliveryFeeValue(record.taxa),
      } satisfies DeliveryZoneInfo
    })
    .filter((zone): zone is DeliveryZoneInfo => zone !== null)

  return {
    defaultFee,
    zones,
  }
}

function formatDeliveryZonesList(zones: DeliveryZoneInfo[]) {
  if (zones.length === 0) return ''

  return zones
    .map((zone) => `${zone.nome} (${formatCurrencyBrl(zone.taxa)})`)
    .join(', ')
}

function findMentionedDeliveryZone(zones: DeliveryZoneInfo[], messageText: string) {
  const normalizedMessage = normalizeBairroForZonaMatch(messageText)
  if (!normalizedMessage) return null

  let bestMatch: DeliveryZoneInfo | null = null
  let bestMatchLength = 0

  for (const zone of zones) {
    const normalizedZone = normalizeBairroForZonaMatch(zone.nome)
    if (!normalizedZone || normalizedZone.length < 3) continue
    if (!normalizedMessage.includes(normalizedZone)) continue

    if (normalizedZone.length > bestMatchLength) {
      bestMatch = zone
      bestMatchLength = normalizedZone.length
    }
  }

  return bestMatch
}

function sanitizeDeliveryAreaSnippet(value: unknown) {
  const normalized = String(value || '')
    .replace(/^[\s:;,.\-]+/g, '')
    .replace(/[\s:;,.\-!?]+$/g, '')
    .trim()

  if (!normalized || normalized.length < 2) return null
  return normalized
}

function extractRequestedDeliveryArea(
  messageText: string,
  zones: DeliveryZoneInfo[]
): { bairro: string | null; zone: DeliveryZoneInfo | null } {
  const directZone = findMentionedDeliveryZone(zones, messageText)
  if (directZone) {
    return {
      bairro: directZone.nome,
      zone: directZone,
    }
  }

  const patterns = [
    /\bbairro\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})$/i,
    /\b(?:zona|regiao|regiao)\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})$/i,
    /\b(?:entrega(?:m)?|atende(?:m)?|frete|taxa(?:\s+de\s+entrega)?|valor(?:\s+da\s+entrega)?)\s+(?:no|na|em|para|pro|pra)\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})[?!. ]*$/i,
    /\b(?:no|na|em)\s+([a-z0-9\u00c0-\u017f\s'/-]{2,})\s+(?:tem|ha|possui)\s+(?:entrega|frete)\b/i,
  ]

  for (const pattern of patterns) {
    const matched = messageText.match(pattern)
    const bairro = sanitizeDeliveryAreaSnippet(matched?.[1])
    if (!bairro) continue

    return {
      bairro,
      zone: findDeliveryZoneByBairro(zones, bairro),
    }
  }

  return {
    bairro: null,
    zone: null,
  }
}

function buildStorefrontReply(input: {
  greeting: string
  context: TenantChatbotRuntimeContext
  fallbackMessage?: string
}) {
  const cardapioUrl = resolveTenantCardapioUrl(input.context)
  if (cardapioUrl) {
    return `${input.greeting} Para pedir, acesse nosso cardapio: ${cardapioUrl}`
  }

  return (
    input.fallbackMessage ||
    `${input.greeting} Posso te ajudar com pedidos, cardapio e entrega por aqui.`
  )
}

function buildDeliveryReply(input: {
  intent: Extract<ChatbotKeywordIntent, 'entrega' | 'bairro' | 'taxa_entrega' | 'zona_entrega'>
  greeting: string
  context: TenantChatbotRuntimeContext
  messageText: string
}) {
  if (!input.context.deliveryEnabled) {
    return `${input.greeting} No momento nao estamos com entrega ativa. Se preferir, voce pode retirar no local.`
  }

  const { defaultFee, zones } = resolveTenantDeliveryZones(input.context)
  const { bairro, zone } = extractRequestedDeliveryArea(input.messageText, zones)
  const zonesList = formatDeliveryZonesList(zones)
  const retiradaHint = ' Se preferir, voce tambem pode retirar no local.'

  if (input.intent === 'bairro' || (input.intent === 'entrega' && bairro)) {
    if (zone) {
      return `${input.greeting} Sim, atendemos ${zone.nome}. A taxa de entrega para essa regiao e ${formatCurrencyBrl(zone.taxa)}.`
    }

    if (bairro && zones.length > 0) {
      const coverageText = zonesList ? ` Bairros atendidos: ${zonesList}.` : ''
      return `${input.greeting} Ainda nao fazemos entrega para ${bairro}. ${MENSAGEM_ENTREGA_FORA_DA_AREA}${coverageText}`
    }

    if (zones.length > 0) {
      return `${input.greeting} Informe o bairro para eu confirmar a entrega. Hoje atendemos: ${zonesList}.${retiradaHint}`
    }

    return `${input.greeting} Informe o bairro para eu confirmar a entrega. A taxa atual e ${formatCurrencyBrl(defaultFee)}.${retiradaHint}`
  }

  if (input.intent === 'taxa_entrega') {
    if (zone) {
      return `${input.greeting} A taxa de entrega para ${zone.nome} e ${formatCurrencyBrl(zone.taxa)}.`
    }

    if (bairro && zones.length > 0) {
      return `${input.greeting} Ainda nao temos entrega para ${bairro}. ${MENSAGEM_ENTREGA_FORA_DA_AREA}`
    }

    if (zones.length > 0) {
      return `${input.greeting} As taxas de entrega por bairro/zona sao: ${zonesList}.${retiradaHint}`
    }

    return `${input.greeting} Nossa taxa de entrega atual e ${formatCurrencyBrl(defaultFee)}.${retiradaHint}`
  }

  if (input.intent === 'zona_entrega') {
    if (zones.length > 0) {
      return `${input.greeting} Atendemos os seguintes bairros/zonas: ${zonesList}.${retiradaHint}`
    }

    return `${input.greeting} Fazemos entrega com taxa atual de ${formatCurrencyBrl(defaultFee)}. Para confirmar sua regiao, envie o bairro.${retiradaHint}`
  }

  if (zone) {
    return `${input.greeting} Sim, atendemos ${zone.nome}. A taxa de entrega para essa regiao e ${formatCurrencyBrl(zone.taxa)}.`
  }

  if (zones.length > 0) {
    return `${input.greeting} Fazemos entrega nos seguintes bairros/zonas: ${zonesList}.${retiradaHint}`
  }

  return `${input.greeting} Fazemos entrega. A taxa atual e ${formatCurrencyBrl(defaultFee)}.${retiradaHint}`
}

function extractOrderNumberFromText(messageText: string) {
  const explicitFlowPattern = messageText.match(/\b([A-Za-z]\d{6}-\d{2,4})\b/)
  if (explicitFlowPattern?.[1]) {
    return explicitFlowPattern[1].toUpperCase()
  }

  const genericPattern = messageText.match(
    /(?:pedido|numero|n[uú]mero|#)\s*[:#-]?\s*([A-Za-z0-9-]{3,})/i
  )
  if (!genericPattern?.[1]) return null

  const value = genericPattern[1].toUpperCase()
  if (value.replace(/[^0-9]/g, '').length < 3) return null
  return value
}

function buildPhoneCandidates(rawPhone: string | null) {
  const digits = String(rawPhone || '').replace(/\D/g, '')
  if (!digits) return [] as string[]

  const values = new Set<string>()
  values.add(digits)

  if (digits.startsWith('55') && digits.length > 11) {
    values.add(digits.slice(2))
  }

  if (digits.length >= 11) {
    values.add(digits.slice(-11))
  }

  if (digits.length >= 10) {
    values.add(digits.slice(-10))
  }

  return Array.from(values).filter((value) => value.length >= 10)
}

function phonesMatch(left: string | null, right: string | null) {
  const leftCandidates = buildPhoneCandidates(left)
  const rightCandidates = new Set(buildPhoneCandidates(right))
  return leftCandidates.some((candidate) => rightCandidates.has(candidate))
}

function buildDefaultGroqSystemPrompt(context: TenantChatbotRuntimeContext) {
  const tenantName = context.tenantName || 'a loja'
  const cardapioUrl = resolveTenantCardapioUrl(context)
  const { defaultFee, zones } = resolveTenantDeliveryZones(context)

  const contextLines = [
    `Voce e o assistente virtual de WhatsApp do estabelecimento ${tenantName}.`,
    'Responda sempre em pt-BR, de forma breve, clara e educada.',
    'Nao invente informacoes. Quando nao souber algo operacional, oriente o cliente a aguardar um atendente humano.',
    `Delivery ativo: ${context.deliveryEnabled ? 'sim' : 'nao'}.`,
    `Cardapio online: ${cardapioUrl || 'nao configurado'}.`,
    `WhatsApp da loja: ${context.whatsapp || 'nao informado'}.`,
    `Taxa padrao de entrega: ${formatCurrencyBrl(defaultFee)}.`,
  ]

  if (zones.length > 0) {
    contextLines.push(
      `Bairros/zonas atendidos: ${zones
        .map((zone) => `${zone.nome} (${formatCurrencyBrl(zone.taxa)})`)
        .join(', ')}.`
    )
  }

  return contextLines.join(' ')
}

function buildGroqUserPrompt(input: {
  context: TenantChatbotRuntimeContext
  messageText: string
  customerName?: string | null
  paymentMethods: string[]
}) {
  const paymentMethodsLabel = formatPaymentMethodsList(input.paymentMethods)
  const cardapioUrl = resolveTenantCardapioUrl(input.context)

  return [
    `Cliente: ${input.customerName || 'nao informado'}`,
    `Mensagem: ${input.messageText}`,
    `Formas de pagamento conhecidas: ${paymentMethodsLabel}`,
    `Pix habilitado: ${input.context.pixEnabled ? 'sim' : 'nao'}`,
    `Link do cardapio: ${cardapioUrl || 'nao configurado'}`,
  ].join('\n')
}

async function findOrderStatusForChatbot(input: {
  tenantId: number
  messageText: string
  customerPhone?: string | null
}) {
  const orderNumber = extractOrderNumberFromText(input.messageText)
  if (!orderNumber) return null

  const order = await q1<OrderStatusLookupRow>(
    `SELECT order_number, status, cliente_tel
     FROM pedidos
     WHERE tenant_id=?
       AND UPPER(BTRIM(order_number))=?
     LIMIT 1`,
    [input.tenantId, orderNumber]
  )

  if (!order) return null

  if (input.customerPhone && !phonesMatch(order.cliente_tel || null, input.customerPhone)) {
    return null
  }

  return {
    orderNumber: normalizeOptionalText(order.order_number) || orderNumber,
    status: normalizeOptionalText(order.status) || 'em andamento',
  }
}

export function classifyChatbotKeywordIntent(messageText: string): ChatbotKeywordIntent | null {
  const normalized = normalizeTextForMatch(messageText)
  if (!normalized) return null

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
    return 'atendente'
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
    return 'status_pedido'
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
    return 'taxa_entrega'
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
    return 'zona_entrega'
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
    return 'bairro'
  }

  if (includesAny(normalized, ['entrega', 'delivery'])) {
    return 'entrega'
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
    return 'cardapio'
  }

  if (includesAny(normalized, ['pix', 'qr code', 'qrcode', 'copia e cola', 'copiaecola'])) {
    return 'pix'
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
    return 'pagamento'
  }

  if (
    includesAny(normalized, [
      'oi',
      'ola',
      'bom dia',
      'boa tarde',
      'boa noite',
      'e ai',
      'eae',
      'opa',
    ])
  ) {
    return 'saudacao'
  }

  return null
}

export async function getTenantChatbotConfig(
  tenantId: number | string
): Promise<TenantChatbotConfigRecord | null> {
  const parsedTenantId = parseTenantId(tenantId)

  const row = await q1<TenantChatbotConfigRow>(
    `SELECT tenant_id,
            chatbot_enabled,
            provider,
            model,
            system_prompt,
            provider_config_json,
            created_at,
            updated_at
     FROM tenant_whatsapp_chatbot_config
     WHERE tenant_id=?`,
    [parsedTenantId]
  )

  return row ? mapTenantChatbotConfigRow(row) : null
}

export async function upsertTenantChatbotConfig(
  input: UpsertTenantChatbotConfigInput
): Promise<TenantChatbotConfigRecord> {
  const tenantId = parseTenantId(input.tenant_id)
  const current = await getTenantChatbotConfig(tenantId)

  const chatbotEnabled =
    input.chatbot_enabled === undefined
      ? current?.chatbot_enabled ?? DEFAULT_TENANT_CHATBOT_CONFIG.chatbot_enabled
      : toBool(input.chatbot_enabled, DEFAULT_TENANT_CHATBOT_CONFIG.chatbot_enabled)

  const provider =
    input.provider === undefined
      ? current?.provider ?? DEFAULT_TENANT_CHATBOT_CONFIG.provider
      : normalizeProviderName(input.provider)

  const model =
    input.model === undefined
      ? current?.model ?? DEFAULT_TENANT_CHATBOT_CONFIG.model
      : normalizeOptionalText(input.model)

  const systemPrompt =
    input.system_prompt === undefined
      ? current?.system_prompt ?? DEFAULT_TENANT_CHATBOT_CONFIG.system_prompt
      : normalizeOptionalText(input.system_prompt)

  const providerConfigJson =
    input.provider_config_json === undefined
      ? current?.provider_config_json ?? DEFAULT_TENANT_CHATBOT_CONFIG.provider_config_json
      : mergeChatbotProviderConfigJsonPreservingSecrets(
          current?.provider_config_json ?? null,
          input.provider_config_json
        )

  const row = await q1<TenantChatbotConfigRow>(
    `INSERT INTO tenant_whatsapp_chatbot_config (
       tenant_id,
       chatbot_enabled,
       provider,
       model,
       system_prompt,
       provider_config_json,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE
     SET chatbot_enabled=EXCLUDED.chatbot_enabled,
         provider=EXCLUDED.provider,
         model=EXCLUDED.model,
         system_prompt=EXCLUDED.system_prompt,
         provider_config_json=EXCLUDED.provider_config_json,
         updated_at=NOW()
     RETURNING tenant_id,
               chatbot_enabled,
               provider,
               model,
               system_prompt,
               provider_config_json,
               created_at,
               updated_at`,
    [
      tenantId,
      chatbotEnabled ? 1 : 0,
      provider,
      model,
      systemPrompt,
      providerConfigJson,
    ]
  )

  if (!row) {
    throw new AppError('Falha ao salvar configuracao do chatbot do tenant', 500)
  }

  return mapTenantChatbotConfigRow(row)
}

export async function loadTenantChatbotRuntimeContext(
  tenantId: number | string
): Promise<TenantChatbotRuntimeContext | null> {
  const parsedTenantId = parseTenantId(tenantId)

  const row = await q1<TenantChatbotContextRow>(
    `SELECT c.id,
            c.usuario,
            c.nome_estabelecimento,
            c.whatsapp,
            c.delivery_ativo,
            c.delivery_config,
            COALESCE(tpc.pix_enabled, 0) AS pix_enabled
     FROM clientes c
     LEFT JOIN tenant_pix_config tpc
       ON tpc.tenant_id = c.id
     WHERE c.id=?`,
    [parsedTenantId]
  )

  if (!row) return null

  return {
    tenantId: parsedTenantId,
    tenantName: normalizeOptionalText(row.nome_estabelecimento),
    slug: normalizeOptionalText(row.usuario),
    whatsapp: normalizeOptionalText(row.whatsapp),
    deliveryEnabled: toBool(row.delivery_ativo, false),
    deliveryConfig: coerceDeliveryConfigRow(row.delivery_config),
    pixEnabled: toBool(row.pix_enabled, false),
  }
}

export async function loadTenantChatbotPaymentMethods(
  tenantId: number | string,
  context?: TenantChatbotRuntimeContext | null
) {
  const parsedTenantId = parseTenantId(tenantId)

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
    [parsedTenantId, parsedTenantId]
  )

  const labels = Array.from(
    new Set(
      rows
        .map((row) => formatPaymentMethodLabel(row.method || ''))
        .filter((value): value is string => Boolean(value))
    )
  )

  if (labels.length > 0) {
    return labels
  }

  const fallbackMethods = new Set<string>([
    'Dinheiro',
    'Cartao de debito',
    'Cartao de credito',
  ])

  if (
    context?.pixEnabled ||
    normalizeOptionalText(context?.deliveryConfig.pix_chave) ||
    normalizeOptionalText(context?.deliveryConfig.pix_payload_estatico)
  ) {
    fallbackMethods.add('Pix')
  }

  return Array.from(fallbackMethods)
}

export async function buildChatbotKeywordReply(
  input: BuildChatbotKeywordReplyInput
): Promise<string> {
  const tenantName = input.context.tenantName || 'nossa loja'
  const greeting = getGreeting(input.customerName)
  const paymentMethods =
    input.paymentMethods && input.paymentMethods.length > 0
      ? input.paymentMethods
      : await loadTenantChatbotPaymentMethods(input.tenantId, input.context)
  const paymentMethodsLabel = formatPaymentMethodsList(paymentMethods)

  switch (input.intent) {
    case 'saudacao':
      return buildStorefrontReply({
        greeting,
        context: input.context,
        fallbackMessage: `${greeting} Bem-vindo(a) a ${tenantName}. Como podemos ajudar?`,
      })

    case 'entrega':
      return buildStorefrontReply({
        greeting,
        context: input.context,
      })

    case 'bairro':
    case 'taxa_entrega':
    case 'zona_entrega':
      return buildDeliveryReply({
        intent: input.intent,
        greeting,
        context: input.context,
        messageText: input.messageText,
      })

    case 'cardapio':
      return buildStorefrontReply({
        greeting,
        context: input.context,
        fallbackMessage: `${greeting} Nosso cardapio online nao esta disponivel no momento.`,
      })

    case 'pix':
      return `${greeting} Aceitamos ${paymentMethodsLabel}. Se preferir Pix, podemos seguir por essa forma de pagamento.`

    case 'pagamento':
      return `${greeting} As formas de pagamento aceitas sao: ${paymentMethodsLabel}.`

    case 'status_pedido': {
      const orderStatus = await findOrderStatusForChatbot({
        tenantId: input.tenantId,
        customerPhone: input.customerPhone,
        messageText: input.messageText,
      })

      if (orderStatus) {
        return `${greeting} O pedido #${orderStatus.orderNumber} esta com status: ${orderStatus.status}.`
      }

      return `${greeting} Me informe o numero do pedido para eu consultar o status por aqui.`
    }

    case 'atendente':
      return `${greeting} Vamos encaminhar sua mensagem para um atendente humano e retornamos por aqui assim que possivel.`
  }
}

export async function generateGroqFallbackReply(
  input: GroqFallbackReplyInput
): Promise<GroqFallbackReplyResult> {
  const tenantId = parseTenantId(input.tenantId)
  const messageText = normalizeRequiredMessage(input.messageText)
  const provider = normalizeProviderName(input.config.provider)

  const context =
    input.context || (await loadTenantChatbotRuntimeContext(tenantId))

  if (!context) {
    throw new AppError('Tenant nao encontrado para processar o chatbot', 404)
  }

  const paymentMethods =
    input.paymentMethods && input.paymentMethods.length > 0
      ? input.paymentMethods
      : await loadTenantChatbotPaymentMethods(tenantId, context)

  // Fase 2c: injeta o cardápio completo abaixo do system_prompt do dono
  const basePrompt =
    normalizeOptionalText(input.config.system_prompt) ||
    buildDefaultGroqSystemPrompt(context)

  let systemPrompt = basePrompt
  try {
    const menu = await loadMenuContextForAI(tenantId)
    systemPrompt = buildSystemPromptWithMenu(basePrompt, menu)
  } catch (menuError) {
    // cardápio indisponível não bloqueia a resposta
    logError('chatbotService.generateGroqFallbackReply.loadMenu', menuError, { tenantId })
  }

  // Fase 2d: provider agnóstico — usa callAIProvider para qualquer provider
  return callAIProvider({
    provider,
    model: input.config.model,
    providerConfigJson: input.config.provider_config_json,
    systemPrompt,
    userPrompt: buildGroqUserPrompt({
      context,
      customerName: input.customerName,
      messageText,
      paymentMethods,
    }),
  })
}

export async function processChatbotMessage(
  input: ProcessChatbotMessageInput
): Promise<ProcessChatbotMessageResult> {
  const tenantId = parseTenantId(input.tenantId)
  const messageText = normalizeRequiredMessage(input.messageText)
  const config =
    input.config !== undefined
      ? input.config
      : input.ignoreDisabled
        ? null
        : await getTenantChatbotConfig(tenantId)
  const chatbotEnabled = input.ignoreDisabled
    ? true
    : config
      ? config.chatbot_enabled
      : false
  const provider = config ? normalizeProviderName(config.provider) : null
  const intent = classifyChatbotKeywordIntent(messageText)

  if (!config && !input.ignoreDisabled) {
    return {
      tenantId,
      chatbotEnabled: false,
      provider: null,
      model: null,
      intent,
      replySource: 'none',
      replyText: null,
      handoffRequested: intent === 'atendente',
      usedAiFallback: false,
      reason: 'chatbot_not_configured',
      error: null,
    }
  }

  if (!chatbotEnabled) {
    return {
      tenantId,
      chatbotEnabled: false,
      provider,
      model: config?.model || null,
      intent,
      replySource: 'none',
      replyText: null,
      handoffRequested: intent === 'atendente',
      usedAiFallback: false,
      reason: 'chatbot_disabled',
      error: null,
    }
  }

  const context =
    input.context || (await loadTenantChatbotRuntimeContext(tenantId))

  if (!context) {
    throw new AppError('Tenant nao encontrado para processar o chatbot', 404)
  }

  if (intent) {
    const replyText = await buildChatbotKeywordReply({
      intent,
      tenantId,
      messageText,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      context,
      paymentMethods: input.paymentMethods,
    })

    return {
      tenantId,
      chatbotEnabled: true,
      provider: provider || DEFAULT_TENANT_CHATBOT_CONFIG.provider,
      model: config?.model || null,
      intent,
      replySource: 'keyword',
      replyText,
      handoffRequested: intent === 'atendente',
      usedAiFallback: false,
      reason: 'keyword_match',
      error: null,
    }
  }

  if (!input.allowAiFallback) {
    return {
      tenantId,
      chatbotEnabled: true,
      provider: provider || DEFAULT_TENANT_CHATBOT_CONFIG.provider,
      model: config?.model || null,
      intent: null,
      replySource: 'none',
      replyText: null,
      handoffRequested: false,
      usedAiFallback: false,
      reason: 'no_intent_match',
      error: null,
    }
  }

  if (!config) {
    return {
      tenantId,
      chatbotEnabled: true,
      provider: provider || DEFAULT_TENANT_CHATBOT_CONFIG.provider,
      model: null,
      intent: null,
      replySource: 'none',
      replyText: null,
      handoffRequested: false,
      usedAiFallback: true,
      reason: 'ai_not_configured',
      error: 'Configuracao do chatbot nao encontrada',
    }
  }

  try {
    const aiReply = await generateGroqFallbackReply({
      tenantId,
      messageText,
      customerName: input.customerName,
      config,
      context,
      paymentMethods: input.paymentMethods,
    })

    return {
      tenantId,
      chatbotEnabled: true,
      provider: aiReply.provider,
      model: aiReply.model,
      intent: null,
      replySource: 'groq',
      replyText: aiReply.replyText,
      handoffRequested: false,
      usedAiFallback: true,
      reason: 'ai_reply',
      error: null,
    }
  } catch (error) {
    logError('chatbotService.processChatbotMessage.aiFallback', error, {
      tenantId,
      provider,
      model: config.model,
    })

    return {
      tenantId,
      chatbotEnabled: true,
      provider,
      model: config.model || null,
      intent: null,
      replySource: 'none',
      replyText: null,
      handoffRequested: false,
      usedAiFallback: true,
      reason:
        error instanceof AppError && error.statusCode === 400
          ? 'ai_not_configured'
          : 'ai_error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const whatsAppChatbotService = {
  getTenantChatbotConfig,
  upsertTenantChatbotConfig,
  loadTenantChatbotRuntimeContext,
  loadTenantChatbotPaymentMethods,
  classifyChatbotKeywordIntent,
  buildChatbotKeywordReply,
  generateGroqFallbackReply,
  processChatbotMessage,
}
