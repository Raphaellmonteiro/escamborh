type ProviderConfigRecord = Record<string, unknown>;

export type SendWhatsAppMessageInput = {
  provider?: string | null;
  providerConfigJson?: string | null;
  to: string;
  message: string;
  mediaUrl?: string | null;
};

export type SendWhatsAppMessageResult = {
  provider: string;
  recipient: string;
  responseStatus: number;
  externalId: string | null;
  providerResponse: unknown;
};

type HttpRequestConfig = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
};

type EvolutionLidLookupStatus =
  | 'resolved'
  | 'config_unavailable'
  | 'not_found'
  | 'ambiguous_match_discarded'
  | 'request_failed';

const CONFIGURED_WHATSAPP_NUMBER_KEYS = [
  'phone_number',
  'display_number',
  'whatsapp_number',
  'business_phone',
  'business_phone_number',
  'sender_number',
  'sender_phone',
  'instance_phone',
  'instance_number',
  'wa_id',
  'instance',
  'instance_name',
  'instanceName',
] as const;

const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 15000;
const EVOLUTION_CONTACT_LOOKUP_ID_KEYS = [
  'id',
  'jid',
  'remoteJid',
  'lid',
  'contactId',
  'contactJid',
] as const;

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeProviderName(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  return normalized
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function parsePositiveTimeoutMs(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? Math.trunc(parsed) : fallback;
}

function ensureHttpUrl(value: string, fieldName: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`${fieldName} deve usar http ou https`);
    }
    return parsed.toString();
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `${fieldName} invalida: ${error.message}`
        : `${fieldName} invalida`
    );
  }
}

function parseProviderConfigJson(rawValue: string | null | undefined): ProviderConfigRecord {
  const raw = normalizeOptionalText(rawValue);
  if (!raw) {
    throw new Error('provider_config_json nao configurado');
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('provider_config_json deve ser um objeto');
    }
    return parsed as ProviderConfigRecord;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `provider_config_json invalido: ${error.message}`
        : 'provider_config_json invalido'
    );
  }
}

function getConfigText(config: ProviderConfigRecord, keys: string[]) {
  for (const key of keys) {
    const value = normalizeOptionalText(config[key]);
    if (value) return value;
  }
  return null;
}

function getConfigRecord(config: ProviderConfigRecord, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as ProviderConfigRecord;
    }
  }
  return null;
}

function normalizeHeaders(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, string>;
  }

  return Object.entries(value as ProviderConfigRecord).reduce<Record<string, string>>((acc, [key, currentValue]) => {
    const normalizedValue = normalizeOptionalText(currentValue);
    if (normalizedValue) {
      acc[key] = normalizedValue;
    }
    return acc;
  }, {});
}

function isLidIdentifier(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return normalized.includes('@lid');
}

function hasTrustedWhatsAppRecipientShape(value: string) {
  if (isLidIdentifier(value)) return false;

  if (value.includes('@')) {
    const [localPart, domain] = value.split('@', 2);
    if (!localPart || !/^[+\d\s().-]+$/.test(localPart)) return false;

    const normalizedDomain = String(domain || '').trim().toLowerCase();
    return normalizedDomain === 's.whatsapp.net' || normalizedDomain === 'c.us';
  }

  return /^[+\d\s().-]+$/.test(value);
}

function isEvolutionProvider(provider: string) {
  return provider === 'evolution' || provider === 'evolution_api';
}

function normalizeTrustedBrazilDigits(digits: string) {
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return null;
}

function normalizeBrazilWhatsAppNumber(rawValue: unknown) {
  const normalized = normalizeOptionalText(rawValue);
  if (!normalized) {
    throw new Error('Telefone do cliente nao encontrado para envio via WhatsApp');
  }
  if (isLidIdentifier(normalized)) {
    throw new Error('Envio bloqueado: recipient derivado de identificador @lid');
  }
  if (!hasTrustedWhatsAppRecipientShape(normalized)) {
    throw new Error('Envio bloqueado: recipient sem numero confiavel para envio via WhatsApp');
  }

  const digits = normalized.split('@')[0].replace(/\D/g, '');
  if (!digits) {
    throw new Error('Telefone do cliente nao encontrado para envio via WhatsApp');
  }

  const trustedNumber = normalizeTrustedBrazilDigits(digits);
  if (!trustedNumber) {
    throw new Error('Telefone do cliente invalido para envio via WhatsApp');
  }

  return trustedNumber;
}

function tryNormalizeBrazilWhatsAppNumber(rawValue: unknown) {
  const normalized = normalizeOptionalText(rawValue);
  if (!normalized || !hasTrustedWhatsAppRecipientShape(normalized)) return null;

  const digits = normalized.split('@')[0].replace(/\D/g, '');
  if (!digits) return null;

  return normalizeTrustedBrazilDigits(digits);
}

function normalizeConfiguredWhatsAppNumber(rawValue: unknown) {
  const normalized = normalizeOptionalText(rawValue);
  if (!normalized) return null;
  if (!/^[+\d\s().-]+(?:@[a-z0-9.-]+)?$/i.test(normalized)) return null;

  return tryNormalizeBrazilWhatsAppNumber(normalized);
}

function collectConfiguredWhatsAppNumberCandidates(
  config: ProviderConfigRecord,
  depth = 0
): unknown[] {
  const candidates = CONFIGURED_WHATSAPP_NUMBER_KEYS.map((key) => config[key]);
  if (depth >= 2) return candidates;

  for (const value of Object.values(config)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    candidates.push(...collectConfiguredWhatsAppNumberCandidates(value as ProviderConfigRecord, depth + 1));
  }

  return candidates;
}

function resolveConfiguredWhatsAppNumbers(config: ProviderConfigRecord) {
  return new Set(
    collectConfiguredWhatsAppNumberCandidates(config)
      .map((candidate) => normalizeConfiguredWhatsAppNumber(candidate))
      .filter((candidate): candidate is string => Boolean(candidate))
  );
}

export function resolveConfiguredWhatsAppNumbersFromProviderConfigJson(
  rawValue: string | null | undefined
) {
  const raw = normalizeOptionalText(rawValue);
  if (!raw) return new Set<string>();

  try {
    return resolveConfiguredWhatsAppNumbers(parseProviderConfigJson(raw));
  } catch {
    return new Set<string>();
  }
}

function buildUrl(baseUrl: string, endpoint?: string | null) {
  const safeBaseUrl = baseUrl.replace(/\/+$/, '');
  const safeEndpoint = String(endpoint || '').trim();

  if (!safeEndpoint) return ensureHttpUrl(safeBaseUrl, 'URL do provider');
  if (/^https?:\/\//i.test(safeEndpoint)) return ensureHttpUrl(safeEndpoint, 'URL do provider');

  return ensureHttpUrl(
    `${safeBaseUrl}/${safeEndpoint.replace(/^\/+/, '')}`,
    'URL do provider'
  );
}

function truncateText(value: unknown, maxLength = 600) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseResponseBody(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return truncateText(trimmed, 1200);
  }
}

function collectExactEvolutionContactLookupMatches(
  value: unknown,
  lid: string,
  depth = 0
): ProviderConfigRecord[] {
  if (depth > 5 || value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return value.slice(0, 20).flatMap((entry) =>
      collectExactEvolutionContactLookupMatches(entry, lid, depth + 1)
    );
  }

  if (!value || typeof value !== 'object') return [];

  const record = value as ProviderConfigRecord;
  const hasExactIdMatch = EVOLUTION_CONTACT_LOOKUP_ID_KEYS.some(
    (key) => normalizeOptionalText(record[key]) === lid
  );
  const nestedMatches = Object.values(record).flatMap((entryValue) =>
    collectExactEvolutionContactLookupMatches(entryValue, lid, depth + 1)
  );

  return hasExactIdMatch ? [record, ...nestedMatches] : nestedMatches;
}

function collectEvolutionLookupPhoneCandidates(
  value: unknown,
  configuredWhatsAppNumbers: Set<string>,
  depth = 0
): string[] {
  if (depth > 5 || value === undefined || value === null) return [];

  const directPhone = tryNormalizeBrazilWhatsAppNumber(value);
  if (directPhone && !configuredWhatsAppNumbers.has(directPhone)) {
    return [directPhone];
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).flatMap((entry) =>
      collectEvolutionLookupPhoneCandidates(entry, configuredWhatsAppNumbers, depth + 1)
    );
  }

  if (!value || typeof value !== 'object') return [];

  return Object.values(value as ProviderConfigRecord).flatMap((entryValue) =>
    collectEvolutionLookupPhoneCandidates(entryValue, configuredWhatsAppNumbers, depth + 1)
  );
}

function resolveEvolutionLookupPhoneCandidate(
  lookupResponse: unknown,
  lid: string,
  configuredWhatsAppNumbers: Set<string>
): { phone: string | null; status: EvolutionLidLookupStatus } {
  const exactMatches = collectExactEvolutionContactLookupMatches(lookupResponse, lid);
  if (exactMatches.length !== 1) {
    return {
      phone: null,
      status: exactMatches.length > 1 ? 'ambiguous_match_discarded' : 'not_found',
    };
  }

  const uniquePhones = [
    ...new Set(
      collectEvolutionLookupPhoneCandidates(exactMatches[0], configuredWhatsAppNumbers)
    ),
  ];

  if (uniquePhones.length !== 1) {
    return {
      phone: null,
      status: uniquePhones.length > 1 ? 'ambiguous_match_discarded' : 'not_found',
    };
  }

  return {
    phone: uniquePhones[0],
    status: 'resolved',
  };
}

async function fetchWithTimeout(
  requestConfig: HttpRequestConfig,
  timeoutMs: number,
  timeoutMessage: string
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(requestConfig.url, {
      method: requestConfig.method,
      headers: requestConfig.headers,
      body: requestConfig.body ? JSON.stringify(requestConfig.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildEvolutionContactLookupRequest(
  config: ProviderConfigRecord,
  recipientLid: string
): HttpRequestConfig {
  const baseUrl =
    getConfigText(config, ['base_url', 'baseUrl', 'url', 'api_url']) ||
    (() => {
      throw new Error('provider_config_json sem base_url para evolution_api');
    })();

  const instance =
    getConfigText(config, ['instance', 'instance_name', 'instanceName']) ||
    (() => {
      throw new Error('provider_config_json sem instance para evolution_api');
    })();

  const apiKey =
    getConfigText(config, ['apikey', 'api_key', 'apiKey', 'token']) ||
    (() => {
      throw new Error('provider_config_json sem apikey para evolution_api');
    })();

  return {
    url: buildUrl(baseUrl, `chat/findContacts/${encodeURIComponent(instance)}`),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: {
      where: {
        id: recipientLid,
      },
    },
  };
}

async function resolveEvolutionRecipientFromLid(
  config: ProviderConfigRecord,
  recipientLid: string,
  configuredWhatsAppNumbers: Set<string>,
  timeoutMs: number
): Promise<{ phone: string | null; status: EvolutionLidLookupStatus }> {
  let requestConfig: HttpRequestConfig;

  try {
    requestConfig = buildEvolutionContactLookupRequest(config, recipientLid);
  } catch {
    return {
      phone: null,
      status: 'config_unavailable',
    };
  }

  try {
    const response = await fetchWithTimeout(
      requestConfig,
      timeoutMs,
      `Timeout ao resolver recipient @lid no provider evolution_api apos ${timeoutMs}ms`
    );
    const rawResponseText = await response.text().catch(() => '');
    const lookupResponse = parseResponseBody(rawResponseText);

    if (!response.ok) {
      return {
        phone: null,
        status: 'request_failed',
      };
    }

    return resolveEvolutionLookupPhoneCandidate(
      lookupResponse,
      recipientLid,
      configuredWhatsAppNumbers
    );
  } catch {
    return {
      phone: null,
      status: 'request_failed',
    };
  }
}

function buildLidResolutionError(status: EvolutionLidLookupStatus) {
  switch (status) {
    case 'config_unavailable':
      return 'Envio bloqueado: recipient @lid sem configuracao suficiente para resolver telefone real';
    case 'request_failed':
      return 'Envio bloqueado: recipient @lid nao resolvido; lookup Evolution falhou';
    case 'ambiguous_match_discarded':
      return 'Envio bloqueado: recipient @lid nao resolvido; lookup Evolution retornou multiplos telefones';
    case 'not_found':
    default:
      return 'Envio bloqueado: recipient @lid nao resolvido para telefone real';
  }
}

async function resolveRecipientForSend(
  provider: string,
  config: ProviderConfigRecord,
  rawRecipient: string,
  configuredWhatsAppNumbers: Set<string>,
  timeoutMs: number
) {
  const normalized = normalizeOptionalText(rawRecipient);
  if (!normalized) {
    throw new Error('Telefone do cliente nao encontrado para envio via WhatsApp');
  }

  if (!isLidIdentifier(normalized)) {
    return normalizeBrazilWhatsAppNumber(normalized);
  }

  if (!isEvolutionProvider(provider)) {
    throw new Error('Envio bloqueado: recipient derivado de identificador @lid');
  }

  const lookupResult = await resolveEvolutionRecipientFromLid(
    config,
    normalized,
    configuredWhatsAppNumbers,
    timeoutMs
  );
  if (!lookupResult.phone) {
    throw new Error(buildLidResolutionError(lookupResult.status));
  }

  return normalizeBrazilWhatsAppNumber(lookupResult.phone);
}

function buildEvolutionApiRequest(config: ProviderConfigRecord, recipient: string, message: string): HttpRequestConfig {
  const baseUrl =
    getConfigText(config, ['base_url', 'baseUrl', 'url', 'api_url']) ||
    (() => {
      throw new Error('provider_config_json sem base_url para evolution_api');
    })();

  const instance =
    getConfigText(config, ['instance', 'instance_name', 'instanceName']) ||
    (() => {
      throw new Error('provider_config_json sem instance para evolution_api');
    })();

  const apiKey =
    getConfigText(config, ['apikey', 'api_key', 'apiKey', 'token']) ||
    (() => {
      throw new Error('provider_config_json sem apikey para evolution_api');
    })();

  return {
    url: buildUrl(baseUrl, getConfigText(config, ['endpoint']) || `message/sendText/${encodeURIComponent(instance)}`),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: {
      number: recipient,
      text: message,
    },
  };
}

function buildEvolutionMediaApiRequest(
  config: ProviderConfigRecord,
  recipient: string,
  mediaUrl: string,
  caption?: string | null
): HttpRequestConfig {
  const baseUrl =
    getConfigText(config, ['base_url', 'baseUrl', 'url', 'api_url']) ||
    (() => {
      throw new Error('provider_config_json sem base_url para evolution_api');
    })();

  const instance =
    getConfigText(config, ['instance', 'instance_name', 'instanceName']) ||
    (() => {
      throw new Error('provider_config_json sem instance para evolution_api');
    })();

  const apiKey =
    getConfigText(config, ['apikey', 'api_key', 'apiKey', 'token']) ||
    (() => {
      throw new Error('provider_config_json sem apikey para evolution_api');
    })();

  const endpoint =
    getConfigText(config, ['media_endpoint', 'send_media_endpoint']) ||
    `message/sendMedia/${encodeURIComponent(instance)}`;
  const payload: Record<string, unknown> = {
    number: recipient,
    mediatype: 'image',
    media: mediaUrl,
  };
  const normalizedCaption = normalizeOptionalText(caption);
  if (normalizedCaption) payload.caption = normalizedCaption;

  return {
    url: buildUrl(baseUrl, endpoint),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: payload,
  };
}

function buildGenericHttpRequest(
  provider: string,
  config: ProviderConfigRecord,
  recipient: string,
  message: string
): HttpRequestConfig {
  const baseUrl =
    getConfigText(config, ['base_url', 'baseUrl', 'url', 'api_url', 'endpoint_url']) ||
    (() => {
      throw new Error(`provider_config_json sem URL para o provider ${provider}`);
    })();

  const headers = normalizeHeaders(getConfigRecord(config, ['headers']));
  const bearerToken = getConfigText(config, ['access_token', 'accessToken', 'token']);
  const apiKey = getConfigText(config, ['apikey', 'api_key', 'apiKey']);
  const apiKeyHeader = getConfigText(config, ['api_key_header', 'apiKeyHeader']) || 'apikey';
  const method = (getConfigText(config, ['method', 'http_method']) || 'POST').toUpperCase();
  const payloadTemplate = getConfigRecord(config, ['payload_template', 'body', 'body_template']) || {};
  const recipientField =
    getConfigText(config, ['recipient_field', 'to_field', 'phone_field', 'number_field']) || 'to';
  const messageField =
    getConfigText(config, ['message_field', 'text_field', 'body_field']) || 'message';

  if (!headers.Authorization && bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (!headers[apiKeyHeader] && apiKey) {
    headers[apiKeyHeader] = apiKey;
  }

  if (!headers['Content-Type'] && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  return {
    url: buildUrl(baseUrl, getConfigText(config, ['endpoint', 'path'])),
    method,
    headers,
    body:
      method === 'GET'
        ? undefined
        : {
            ...payloadTemplate,
            [recipientField]: recipient,
            [messageField]: message,
          },
  };
}

function resolveHttpRequestConfig(
  provider: string,
  config: ProviderConfigRecord,
  recipient: string,
  message: string
) {
  if (isEvolutionProvider(provider)) {
    return buildEvolutionApiRequest(config, recipient, message);
  }

  return buildGenericHttpRequest(provider, config, recipient, message);
}

function resolveProviderRequestTimeoutMs(config: ProviderConfigRecord) {
  return parsePositiveTimeoutMs(
    getConfigText(config, ['timeout_ms', 'timeoutMs', 'request_timeout_ms', 'requestTimeoutMs']),
    parsePositiveTimeoutMs(
      process.env.WHATSAPP_PROVIDER_TIMEOUT_MS,
      DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS
    )
  );
}

async function performProviderRequest(
  provider: string,
  requestConfig: HttpRequestConfig,
  timeoutMs: number
) {
  const response = await fetchWithTimeout(
    requestConfig,
    timeoutMs,
    `Timeout ao aguardar resposta do provider ${provider} apos ${timeoutMs}ms`
  );

  const rawResponseText = await response.text().catch(() => '');
  const providerResponse = parseResponseBody(rawResponseText);

  if (!response.ok) {
    throw new Error(
      `Falha no provider ${provider}: HTTP ${response.status} - ${truncateText(providerResponse || rawResponseText, 400) || 'sem resposta'}`
    );
  }

  const responseRecord =
    providerResponse && typeof providerResponse === 'object' && !Array.isArray(providerResponse)
      ? (providerResponse as ProviderConfigRecord)
      : null;
  const externalId = getConfigText(responseRecord || {}, [
    'id',
    'messageId',
    'message_id',
    'external_id',
  ]);

  return {
    responseStatus: response.status,
    externalId,
    providerResponse,
  };
}

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput
): Promise<SendWhatsAppMessageResult> {
  const provider = normalizeProviderName(input.provider) || 'generic_http';
  const config = parseProviderConfigJson(input.providerConfigJson);
  const configuredWhatsAppNumbers = resolveConfiguredWhatsAppNumbers(config);
  const timeoutMs = resolveProviderRequestTimeoutMs(config);
  const recipient = await resolveRecipientForSend(
    provider,
    config,
    input.to,
    configuredWhatsAppNumbers,
    timeoutMs
  );

  if (configuredWhatsAppNumbers.has(recipient)) {
    throw new Error('Envio bloqueado: recipient igual ao numero da instancia configurada');
  }

  const requestConfig = resolveHttpRequestConfig(provider, config, recipient, input.message);
  const requestResult = await performProviderRequest(provider, requestConfig, timeoutMs);

  return {
    provider,
    recipient,
    responseStatus: requestResult.responseStatus,
    externalId: requestResult.externalId,
    providerResponse: requestResult.providerResponse,
  };
}

export async function sendWhatsAppMediaMessage(
  input: Omit<SendWhatsAppMessageInput, 'message' | 'mediaUrl'> & {
    mediaUrl: string;
    caption?: string | null;
  }
): Promise<SendWhatsAppMessageResult> {
  const provider = normalizeProviderName(input.provider) || 'generic_http';
  const config = parseProviderConfigJson(input.providerConfigJson);
  const configuredWhatsAppNumbers = resolveConfiguredWhatsAppNumbers(config);
  const timeoutMs = resolveProviderRequestTimeoutMs(config);
  const recipient = await resolveRecipientForSend(
    provider,
    config,
    input.to,
    configuredWhatsAppNumbers,
    timeoutMs
  );

  if (configuredWhatsAppNumbers.has(recipient)) {
    throw new Error('Envio bloqueado: recipient igual ao numero da instancia configurada');
  }

  const rawMediaUrl = normalizeOptionalText(input.mediaUrl);
  if (!rawMediaUrl) {
    throw new Error('mediaUrl obrigatoria');
  }
  const normalizedMediaUrl = ensureHttpUrl(rawMediaUrl, 'URL da imagem');

  if (!isEvolutionProvider(provider)) {
    throw new Error(`Provider ${provider} nao suporta envio de imagem neste fluxo`);
  }

  const requestConfig = buildEvolutionMediaApiRequest(
    config,
    recipient,
    normalizedMediaUrl,
    input.caption
  );
  const requestResult = await performProviderRequest(provider, requestConfig, timeoutMs);

  return {
    provider,
    recipient,
    responseStatus: requestResult.responseStatus,
    externalId: requestResult.externalId,
    providerResponse: requestResult.providerResponse,
  };
}
