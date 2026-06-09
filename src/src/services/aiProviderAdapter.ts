/**
 * aiProviderAdapter.ts
 *
 * Fase 2d — Provider agnóstico para o chatbot.
 *
 * Suporta qualquer API no formato OpenAI Chat Completions:
 *   - Groq         (groq)
 *   - OpenAI       (openai)
 *   - Anthropic*   (anthropic)   *via proxy OpenAI-compatible
 *   - Mistral      (mistral)
 *   - Together AI  (together)
 *   - Qualquer outra API com /v1/chat/completions
 *
 * Para adicionar um novo provider: adicione a entrada em PROVIDER_DEFAULTS.
 * Não é necessário tocar em mais nenhum arquivo.
 *
 * Rota no sistema:
 *   whatsAppInboundService → whatsAppChatbotService → aiProviderAdapter → provider externo
 */

import { AppError } from '../utils/errors';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

export type AIProviderAdapterInput = {
  /** Nome do provider: 'groq', 'openai', 'mistral', etc. */
  provider: string;
  /** model configurado pelo dono (ex: 'gpt-4o-mini', 'llama-3.3-70b') */
  model?: string | null;
  /** JSON string com api_key, base_url, temperature, max_tokens, etc. */
  providerConfigJson?: string | null;
  systemPrompt: string;
  userPrompt: string;
};

export type AIProviderAdapterResult = {
  provider: string;
  model: string;
  replyText: string;
  externalId: string | null;
  status: number;
};

type ResolvedProviderConfig = {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
};

// ─── Defaults por provider ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Para cada provider: URL base e modelo padrão.
 * Todos usam o formato OpenAI /v1/chat/completions.
 */
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; envKey?: string }> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    envKey: 'GROQ_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    envKey: 'MISTRAL_API_KEY',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3-8b-chat-hf',
    envKey: 'TOGETHER_API_KEY',
  },
  // Adicione outros providers aqui sem tocar no resto do código
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function parseJsonObject(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...(value as JsonRecord) };
  const s = normalizeOptionalText(value);
  if (!s) return {};
  try {
    const parsed = JSON.parse(s) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(parsed as JsonRecord) };
    }
  } catch { /* ignore */ }
  return {};
}

function getConfigText(config: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const v = normalizeOptionalText(config[key]);
    if (v) return v;
  }
  return null;
}

function getConfigNumber(config: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const v = Number(config[key]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function normalizeProviderName(value: unknown): string {
  const s = normalizeOptionalText(value);
  if (!s) return 'groq';
  const normalized = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'groq_api' || normalized === 'groqcloud') return 'groq';
  if (normalized === 'openai_api') return 'openai';
  return normalized;
}

function resolveApiKeyFromEnv(providerName: string): string | null {
  const defaults = PROVIDER_DEFAULTS[providerName];
  if (!defaults?.envKey) return null;
  return normalizeOptionalText(process.env[defaults.envKey]);
}

// ─── Resolve config do provider ──────────────────────────────────────────────

function resolveProviderConfig(input: AIProviderAdapterInput): ResolvedProviderConfig {
  const providerName = normalizeProviderName(input.provider);
  const defaults = PROVIDER_DEFAULTS[providerName] ?? PROVIDER_DEFAULTS.groq;
  const cfg = parseJsonObject(input.providerConfigJson);

  const apiKey =
    getConfigText(cfg, ['api_key', 'apiKey', 'token', 'access_token', 'accessToken']) ||
    resolveApiKeyFromEnv(providerName);

  const baseUrl =
    getConfigText(cfg, ['base_url', 'baseUrl', 'url', 'api_url']) ||
    normalizeOptionalText(process.env[`${providerName.toUpperCase()}_BASE_URL`]) ||
    defaults.baseUrl;

  const endpoint =
    getConfigText(cfg, ['endpoint', 'path']) ||
    'chat/completions';

  const fullUrl = `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

  const model =
    normalizeOptionalText(input.model) ||
    getConfigText(cfg, ['model']) ||
    normalizeOptionalText(process.env[`${providerName.toUpperCase()}_MODEL`]) ||
    defaults.model;

  const temperature = getConfigNumber(cfg, ['temperature']) ?? undefined;
  const maxTokens = getConfigNumber(cfg, ['max_tokens', 'maxTokens', 'max_completion_tokens']) ?? undefined;

  const timeoutMs =
    getConfigNumber(cfg, ['timeout_ms', 'timeoutMs', 'request_timeout_ms']) ??
    DEFAULT_TIMEOUT_MS;

  return { apiKey, baseUrl: fullUrl, model, temperature, maxTokens, timeoutMs };
}

// ─── Chamada à API ────────────────────────────────────────────────────────────

type ChatCompletionsResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string | null } | null }>;
  error?: { message?: string | null } | string | null;
  message?: string | null;
};

function extractReplyText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as ChatCompletionsResponse;
  return normalizeOptionalText(r.choices?.[0]?.message?.content);
}

function extractErrorMessage(raw: unknown, status: number): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object') {
    const r = raw as ChatCompletionsResponse;
    if (typeof r.error === 'string' && r.error.trim()) return r.error;
    if (r.error && typeof r.error === 'object') {
      const msg = normalizeOptionalText(r.error.message);
      if (msg) return msg;
    }
    const msg = normalizeOptionalText(r.message);
    if (msg) return msg;
  }
  return `Provider retornou HTTP ${status}`;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Envia uma mensagem para qualquer provider de IA compatível com OpenAI Chat Completions.
 * Lança AppError em caso de falha configurável ou de rede.
 */
export async function callAIProvider(
  input: AIProviderAdapterInput
): Promise<AIProviderAdapterResult> {
  const providerName = normalizeProviderName(input.provider);
  const systemPrompt = normalizeOptionalText(input.systemPrompt);
  const userPrompt = normalizeOptionalText(input.userPrompt);

  if (!systemPrompt) throw new AppError('Prompt de sistema nao configurado', 400);
  if (!userPrompt) throw new AppError('Prompt do usuario nao configurado', 400);

  const config = resolveProviderConfig(input);

  if (!config.apiKey) {
    throw new AppError(
      `Chave de API do provider "${providerName}" nao configurada. Configure em Integrações → IA ou defina a variavel de ambiente.`,
      400
    );
  }

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
  };

  let response: Response;
  try {
    response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new AppError(
        `Tempo limite ao consultar o provider "${providerName}" apos ${config.timeoutMs}ms`,
        504
      );
    }
    throw error;
  }

  const rawText = await response.text();
  let raw: unknown;
  try { raw = rawText.trim() ? JSON.parse(rawText) : null; } catch { raw = rawText; }

  if (!response.ok) {
    throw new AppError(extractErrorMessage(raw, response.status), 502);
  }

  const replyText = extractReplyText(raw);
  if (!replyText) {
    throw new AppError(`Provider "${providerName}" retornou resposta vazia`, 502);
  }

  return {
    provider: providerName,
    model: config.model,
    replyText,
    externalId:
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? normalizeOptionalText((raw as ChatCompletionsResponse).id)
        : null,
    status: response.status,
  };
}
