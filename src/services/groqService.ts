import { AppError } from '../utils/errors'

type JsonRecord = Record<string, unknown>

type GroqConfigInput = {
  model?: string | null
  providerConfigJson?: string | null
}

type GroqConfig = {
  apiKey: string | null
  url: string
  model: string
  temperature?: number
  maxTokens?: number
}

type GroqResponsePayload = {
  id?: string
  choices?: Array<{
    message?: {
      content?: string | null
    } | null
  }>
  error?: {
    message?: string | null
  } | string | null
  message?: string | null
}

export type GroqChatReplyInput = {
  config: GroqConfigInput
  systemPrompt: string
  userPrompt: string
}

export type GroqChatReplyResult = {
  provider: 'groq'
  status: number
  model: string
  replyText: string
  externalId: string | null
  raw: unknown
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null

  const normalized = String(value).trim()
  return normalized || null
}

function parseJsonObject(value: unknown) {
  if (!value) return {} as JsonRecord

  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as JsonRecord) }
  }

  const normalized = normalizeOptionalText(value)
  if (!normalized) return {} as JsonRecord

  try {
    const parsed = JSON.parse(normalized) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(parsed as JsonRecord) }
    }
  } catch {
    return {} as JsonRecord
  }

  return {} as JsonRecord
}

function getConfigText(config: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = normalizeOptionalText(config[key])
    if (value) return value
  }

  return null
}

function getConfigNumber(config: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = Number(config[key])
    if (Number.isFinite(value)) return value
  }

  return null
}

function buildUrl(baseUrl: string, endpoint: string) {
  const safeBaseUrl = baseUrl.replace(/\/+$/, '')
  const safeEndpoint = endpoint.trim()

  if (!safeEndpoint) return safeBaseUrl
  if (/^https?:\/\//i.test(safeEndpoint)) return safeEndpoint

  return `${safeBaseUrl}/${safeEndpoint.replace(/^\/+/, '')}`
}

function parseResponseBody(rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

export function resolveGroqConfig(config: GroqConfigInput) {
  const providerConfig = parseJsonObject(config.providerConfigJson)
  const apiKey =
    getConfigText(providerConfig, ['api_key', 'apiKey', 'token', 'access_token', 'accessToken']) ||
    normalizeOptionalText(process.env.GROQ_API_KEY)

  const baseUrl =
    getConfigText(providerConfig, ['base_url', 'baseUrl', 'url', 'api_url']) ||
    normalizeOptionalText(process.env.GROQ_BASE_URL) ||
    normalizeOptionalText(process.env.GROQ_API_URL) ||
    'https://api.groq.com/openai/v1'

  const endpoint =
    getConfigText(providerConfig, ['endpoint', 'path']) ||
    'chat/completions'

  const model =
    normalizeOptionalText(config.model) ||
    getConfigText(providerConfig, ['model']) ||
    normalizeOptionalText(process.env.GROQ_MODEL) ||
    'llama-3.1-8b-instant'

  const temperature = getConfigNumber(providerConfig, ['temperature'])
  const maxTokens = getConfigNumber(providerConfig, [
    'max_tokens',
    'maxTokens',
    'max_completion_tokens',
  ])

  return {
    apiKey,
    url: buildUrl(baseUrl, endpoint),
    model,
    temperature: temperature ?? undefined,
    maxTokens: maxTokens ?? undefined,
  } satisfies GroqConfig
}

function resolveGroqErrorMessage(payload: unknown, status: number) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const record = payload as GroqResponsePayload

    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error
    }

    if (record.error && typeof record.error === 'object') {
      const message = normalizeOptionalText(record.error.message)
      if (message) return message
    }

    const message = normalizeOptionalText(record.message)
    if (message) return message
  }

  return `Groq retornou HTTP ${status}`
}

function extractGroqReplyText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null

  const response = payload as GroqResponsePayload
  const content = response.choices?.[0]?.message?.content
  return normalizeOptionalText(content)
}

export async function generateGroqReply(
  input: GroqChatReplyInput
): Promise<GroqChatReplyResult> {
  const systemPrompt = normalizeOptionalText(input.systemPrompt)
  const userPrompt = normalizeOptionalText(input.userPrompt)

  if (!systemPrompt) {
    throw new AppError('Prompt de sistema da Groq nao configurado', 400)
  }

  if (!userPrompt) {
    throw new AppError('Prompt da mensagem para Groq nao configurado', 400)
  }

  const groqConfig = resolveGroqConfig(input.config)

  if (!groqConfig.apiKey) {
    throw new AppError('Chave da IA Groq nao configurada', 400)
  }

  const payload = {
    model: groqConfig.model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    temperature: groqConfig.temperature,
    max_tokens: groqConfig.maxTokens,
  }

  const response = await fetch(groqConfig.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const rawText = await response.text()
  const raw = parseResponseBody(rawText)

  if (!response.ok) {
    throw new AppError(resolveGroqErrorMessage(raw, response.status), 502)
  }

  const replyText = extractGroqReplyText(raw)
  if (!replyText) {
    throw new AppError('Groq retornou resposta vazia', 502)
  }

  return {
    provider: 'groq',
    status: response.status,
    model: groqConfig.model,
    replyText,
    externalId:
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? normalizeOptionalText((raw as GroqResponsePayload).id)
        : null,
    raw,
  }
}
