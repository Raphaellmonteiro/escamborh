import { q1 } from '../db';

type TenantWhatsAppConfigRow = {
  tenant_id?: number | string;
  whatsapp_enabled?: number | boolean | string | null;
  provider?: string | null;
  provider_config_json?: string | null;
  whatsapp_number?: string | null;
  instance_name?: string | null;
  channel_identifier?: string | null;
  updated_at?: string | Date | null;
};

type JsonRecord = Record<string, unknown>;

export type TenantWhatsAppConnectionConfig = {
  tenantId: number;
  whatsappEnabled: boolean;
  provider: string | null;
  providerConfigJson: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  instanceName: string | null;
  whatsappNumber: string | null;
  channelIdentifier: string | null;
  updatedAt: string | null;
};

export type TenantWhatsAppConnectionSafeConfig = {
  tenantId: number;
  whatsappEnabled: boolean;
  provider: string | null;
  instanceName: string | null;
  whatsappNumber: string | null;
  channelIdentifier: string | null;
  hasBaseUrl: boolean;
  hasApiKey: boolean;
  updatedAt: string | null;
};

function normalizeTenantId(value: number | string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('tenantId invalido');
  }

  return parsed;
}

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeProviderName(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  const provider = normalized.toLowerCase().replace(/[\s-]+/g, '_');
  if (provider === 'evolution') return 'evolution_api';
  return provider;
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

function parseProviderConfigJson(rawValue: string | null | undefined) {
  const raw = normalizeOptionalText(rawValue);
  if (!raw) return {} as JsonRecord;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
  } catch {
    return {} as JsonRecord;
  }

  return {} as JsonRecord;
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

function normalizeUpdatedAt(value: string | Date | null | undefined) {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return normalizeOptionalText(value);
  }

  return parsed.toISOString();
}

export function isEvolutionConnectionProvider(provider: string | null) {
  return provider === 'evolution_api';
}

export async function getTenantWhatsAppConnectionConfig(
  tenantId: number | string
): Promise<TenantWhatsAppConnectionConfig | null> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const row = await q1<TenantWhatsAppConfigRow>(
    `SELECT tenant_id,
            whatsapp_enabled,
            provider,
            provider_config_json,
            whatsapp_number,
            instance_name,
            channel_identifier,
            updated_at
       FROM tenant_whatsapp_config
      WHERE tenant_id=?`,
    [normalizedTenantId]
  );

  if (!row) {
    return null;
  }

  const provider = normalizeProviderName(row.provider);
  const providerConfigJson = normalizeOptionalText(row.provider_config_json);
  const providerConfig = parseProviderConfigJson(providerConfigJson);
  const instanceName =
    normalizeOptionalText(row.instance_name) ||
    getConfigValueText(providerConfig, ['instance', 'instance_name', 'instanceName']);
  const whatsappNumber =
    normalizeOptionalText(row.whatsapp_number) ||
    getConfigValueText(providerConfig, ['phone_number', 'display_number', 'whatsapp_number']);
  const channelIdentifier =
    normalizeOptionalText(row.channel_identifier) ||
    getConfigValueText(providerConfig, ['channel_id', 'channel_identifier']) ||
    instanceName;

  return {
    tenantId: normalizedTenantId,
    whatsappEnabled: toBool(row.whatsapp_enabled, false),
    provider,
    providerConfigJson,
    baseUrl: getConfigValueText(providerConfig, ['base_url', 'baseUrl', 'url', 'api_url']),
    apiKey: getConfigValueText(providerConfig, ['apikey', 'api_key', 'apiKey', 'token']),
    instanceName,
    whatsappNumber,
    channelIdentifier,
    updatedAt: normalizeUpdatedAt(row.updated_at),
  };
}

export function sanitizeTenantWhatsAppConnectionConfigForClient(
  config: TenantWhatsAppConnectionConfig | null
): TenantWhatsAppConnectionSafeConfig | null {
  if (!config) {
    return null;
  }

  return {
    tenantId: config.tenantId,
    whatsappEnabled: config.whatsappEnabled,
    provider: config.provider,
    instanceName: config.instanceName,
    whatsappNumber: config.whatsappNumber,
    channelIdentifier: config.channelIdentifier,
    hasBaseUrl: Boolean(config.baseUrl),
    hasApiKey: Boolean(config.apiKey),
    updatedAt: config.updatedAt,
  };
}
