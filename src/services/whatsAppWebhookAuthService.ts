import { timingSafeEqual } from 'node:crypto';
import { q1 } from '../db';

type TenantWhatsAppWebhookConfigRow = {
  tenant_id?: number | string;
  whatsapp_enabled?: number | boolean | string | null;
  provider?: string | null;
  provider_config_json?: string | null;
};

type JsonRecord = Record<string, unknown>;

type SecretCandidate = {
  source: string;
  value: string;
};

export type TenantWhatsAppWebhookAuthConfig = {
  provider: string | null;
  whatsappEnabled: boolean;
  providerConfigJson: string | null;
};

export type WhatsAppWebhookAuthResult = {
  allowed: boolean;
  enforced: boolean;
  reason:
    | 'validated'
    | 'invalid_tenant_id'
    | 'tenant_whatsapp_config_not_found'
    | 'whatsapp_disabled'
    | 'auth_not_configured'
    | 'missing_auth_secret'
    | 'invalid_auth_secret';
  provider: string | null;
  matchedIncomingSource: string | null;
  matchedExpectedSource: string | null;
  incomingAuthSources: string[];
  expectedAuthSources: string[];
};

type EvaluateWhatsAppWebhookAuthInput = {
  config: TenantWhatsAppWebhookAuthConfig | null;
  headers?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  payload?: unknown;
};

const EXPLICIT_WEBHOOK_SECRET_KEYS = [
  'webhook_secret',
  'webhookSecret',
  'inbound_webhook_secret',
  'inboundWebhookSecret',
  'verify_token',
  'verifyToken',
  'signature_secret',
  'signatureSecret',
  'secret',
] as const;

const EVOLUTION_PROVIDER_SECRET_KEYS = ['apikey', 'api_key', 'apiKey', 'token'] as const;

const PAYLOAD_SECRET_KEYS = [
  'apikey',
  'api_key',
  'apiKey',
  'token',
  'webhook_secret',
  'webhookSecret',
  'verify_token',
  'verifyToken',
  'signature',
  'secret',
] as const;

const QUERY_SECRET_KEYS = [
  'apikey',
  'api_key',
  'apiKey',
  'token',
  'webhook_secret',
  'webhookSecret',
  'verify_token',
  'verifyToken',
  'signature',
  'secret',
] as const;

const HEADER_SECRET_CANDIDATES = [
  { header: 'apikey', source: 'header.apikey' },
  { header: 'x-api-key', source: 'header.x-api-key' },
  { header: 'x-webhook-secret', source: 'header.x-webhook-secret' },
  { header: 'x-whatsapp-secret', source: 'header.x-whatsapp-secret' },
  { header: 'x-signature', source: 'header.x-signature' },
  { header: 'x-whatsapp-signature', source: 'header.x-whatsapp-signature' },
] as const;

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeProviderName(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  return normalized.toLowerCase().replace(/[\s-]+/g, '_');
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

function getRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function parseProviderConfigJson(rawValue: string | null | undefined) {
  const raw = normalizeOptionalText(rawValue);
  if (!raw) return {} as JsonRecord;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return getRecord(parsed) || ({} as JsonRecord);
  } catch {
    return {} as JsonRecord;
  }
}

function getConfigValueText(record: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const normalized = normalizeOptionalText(record[key]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function dedupeCandidates(candidates: SecretCandidate[]) {
  const seen = new Set<string>();
  const output: SecretCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.source}::${candidate.value}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(candidate);
  }

  return output;
}

function normalizeHeaderValue(value: unknown) {
  if (Array.isArray(value)) {
    return normalizeHeaderValue(value[0]);
  }

  return normalizeOptionalText(value);
}

function stripBearerPrefix(value: string | null) {
  if (!value) return null;

  const match = /^bearer\s+(.+)$/i.exec(value);
  return normalizeOptionalText(match?.[1] ?? null);
}

function extractPayloadSecretCandidates(payload: unknown) {
  const root = getRecord(payload);
  if (!root) return [] as SecretCandidate[];

  const candidates: SecretCandidate[] = [];

  for (const key of PAYLOAD_SECRET_KEYS) {
    const value = normalizeOptionalText(root[key]);
    if (value) {
      candidates.push({
        source: `payload.${key}`,
        value,
      });
    }
  }

  const authorization = normalizeOptionalText(root.authorization);
  if (authorization) {
    candidates.push({
      source: 'payload.authorization',
      value: authorization,
    });

    const bearer = stripBearerPrefix(authorization);
    if (bearer) {
      candidates.push({
        source: 'payload.authorization_bearer',
        value: bearer,
      });
    }
  }

  return dedupeCandidates(candidates);
}

function extractHeaderSecretCandidates(headers?: Record<string, unknown> | null) {
  if (!headers) return [] as SecretCandidate[];

  const normalizedHeaders = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    const normalizedValue = normalizeHeaderValue(value);
    if (normalizedValue) {
      normalizedHeaders.set(key.toLowerCase(), normalizedValue);
    }
  }

  const candidates: SecretCandidate[] = [];

  for (const entry of HEADER_SECRET_CANDIDATES) {
    const value = normalizedHeaders.get(entry.header);
    if (!value) continue;

    candidates.push({
      source: entry.source,
      value,
    });
  }

  const authorization = normalizedHeaders.get('authorization') || null;
  if (authorization) {
    candidates.push({
      source: 'header.authorization',
      value: authorization,
    });

    const bearer = stripBearerPrefix(authorization);
    if (bearer) {
      candidates.push({
        source: 'header.authorization_bearer',
        value: bearer,
      });
    }
  }

  return dedupeCandidates(candidates);
}

function extractQuerySecretCandidates(query?: Record<string, unknown> | null) {
  if (!query) return [] as SecretCandidate[];

  const candidates: SecretCandidate[] = [];

  for (const key of QUERY_SECRET_KEYS) {
    const value = normalizeHeaderValue(query[key]);
    if (value) {
      candidates.push({
        source: `query.${key}`,
        value,
      });
    }
  }

  const authorization = normalizeHeaderValue(query.authorization);
  if (authorization) {
    candidates.push({
      source: 'query.authorization',
      value: authorization,
    });

    const bearer = stripBearerPrefix(authorization);
    if (bearer) {
      candidates.push({
        source: 'query.authorization_bearer',
        value: bearer,
      });
    }
  }

  return dedupeCandidates(candidates);
}

function resolveExpectedSecretCandidates(config: TenantWhatsAppWebhookAuthConfig) {
  const providerConfig = parseProviderConfigJson(config.providerConfigJson);
  const candidates: SecretCandidate[] = [];

  for (const key of EXPLICIT_WEBHOOK_SECRET_KEYS) {
    const value = getConfigValueText(providerConfig, [key]);
    if (!value) continue;

    candidates.push({
      source: `provider_config.${key}`,
      value,
    });
  }

  if (config.provider === 'evolution' || config.provider === 'evolution_api') {
    for (const key of EVOLUTION_PROVIDER_SECRET_KEYS) {
      const value = getConfigValueText(providerConfig, [key]);
      if (!value) continue;

      candidates.push({
        source: `provider_config.${key}`,
        value,
      });
    }
  }

  return dedupeCandidates(candidates);
}

export function evaluateWhatsAppInboundWebhookAuth(
  input: EvaluateWhatsAppWebhookAuthInput
): WhatsAppWebhookAuthResult {
  const provider = input.config?.provider || null;

  if (!input.config) {
    return {
      allowed: true,
      enforced: false,
      reason: 'tenant_whatsapp_config_not_found',
      provider,
      matchedIncomingSource: null,
      matchedExpectedSource: null,
      incomingAuthSources: [],
      expectedAuthSources: [],
    };
  }

  if (!input.config.whatsappEnabled) {
    return {
      allowed: true,
      enforced: false,
      reason: 'whatsapp_disabled',
      provider,
      matchedIncomingSource: null,
      matchedExpectedSource: null,
      incomingAuthSources: [],
      expectedAuthSources: [],
    };
  }

  const expectedSecrets = resolveExpectedSecretCandidates(input.config);
  if (expectedSecrets.length === 0) {
    return {
      allowed: true,
      enforced: false,
      reason: 'auth_not_configured',
      provider,
      matchedIncomingSource: null,
      matchedExpectedSource: null,
      incomingAuthSources: [],
      expectedAuthSources: [],
    };
  }

  const incomingSecrets = dedupeCandidates([
    ...extractHeaderSecretCandidates(input.headers),
    ...extractQuerySecretCandidates(input.query),
    ...extractPayloadSecretCandidates(input.payload),
  ]);

  if (incomingSecrets.length === 0) {
    return {
      allowed: false,
      enforced: true,
      reason: 'missing_auth_secret',
      provider,
      matchedIncomingSource: null,
      matchedExpectedSource: null,
      incomingAuthSources: [],
      expectedAuthSources: expectedSecrets.map((candidate) => candidate.source),
    };
  }

  for (const expected of expectedSecrets) {
    for (const incoming of incomingSecrets) {
      if (!secureStringEqual(incoming.value, expected.value)) {
        continue;
      }

      return {
        allowed: true,
        enforced: true,
        reason: 'validated',
        provider,
        matchedIncomingSource: incoming.source,
        matchedExpectedSource: expected.source,
        incomingAuthSources: incomingSecrets.map((candidate) => candidate.source),
        expectedAuthSources: expectedSecrets.map((candidate) => candidate.source),
      };
    }
  }

  return {
    allowed: false,
    enforced: true,
    reason: 'invalid_auth_secret',
    provider,
    matchedIncomingSource: null,
    matchedExpectedSource: null,
    incomingAuthSources: incomingSecrets.map((candidate) => candidate.source),
    expectedAuthSources: expectedSecrets.map((candidate) => candidate.source),
  };
}

export async function validateInboundWhatsAppWebhookAuth(input: {
  tenantId: number | string;
  headers?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  payload?: unknown;
}): Promise<WhatsAppWebhookAuthResult> {
  const normalizedTenantId = parsePositiveInt(input.tenantId);
  if (!normalizedTenantId) {
    return {
      allowed: false,
      enforced: false,
      reason: 'invalid_tenant_id',
      provider: null,
      matchedIncomingSource: null,
      matchedExpectedSource: null,
      incomingAuthSources: [],
      expectedAuthSources: [],
    };
  }

  const row = await q1<TenantWhatsAppWebhookConfigRow>(
    `SELECT tenant_id, whatsapp_enabled, provider, provider_config_json
     FROM tenant_whatsapp_config
     WHERE tenant_id=?`,
    [normalizedTenantId]
  );

  const config = row
    ? {
        provider: normalizeProviderName(row.provider),
        whatsappEnabled: toBool(row.whatsapp_enabled, false),
        providerConfigJson: normalizeOptionalText(row.provider_config_json),
      }
    : null;

  return evaluateWhatsAppInboundWebhookAuth({
    config,
    headers: input.headers,
    query: input.query,
    payload: input.payload,
  });
}
