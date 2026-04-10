import { q1, qRun } from '../db';
import { getInstanceByTenant } from '../repositories/whatsappRepository';

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

type TenantLegacyDeliveryTransportRow = {
  delivery_config?: string | null;
  whatsapp?: string | null;
};

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

type EvolutionTransportSnapshot = {
  provider: string | null;
  providerConfigJson: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  instanceName: string | null;
  whatsappNumber: string | null;
  channelIdentifier: string | null;
  transportHinted: boolean;
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

function setConfigValueText(record: JsonRecord, key: string, value: string | null) {
  if (value) {
    record[key] = value;
    return;
  }

  delete record[key];
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

function resolveStoredConnectionProvider(config: {
  provider: string | null;
  instanceName: string | null;
  baseUrl: string | null;
  apiKey: string | null;
}) {
  if (config.provider) {
    return config.provider;
  }

  if (config.instanceName || config.baseUrl || config.apiKey) {
    return 'evolution_api';
  }

  return null;
}

function hasEvolutionTransportHints(snapshot: {
  baseUrl: string | null;
  apiKey: string | null;
  instanceName: string | null;
}) {
  return Boolean(
    snapshot.baseUrl ||
      snapshot.apiKey ||
      snapshot.instanceName
  );
}

function buildEvolutionProviderConfigJson(
  currentRawValue: string | null | undefined,
  input: {
    baseUrl: string | null;
    apiKey: string | null;
    instanceName: string | null;
    whatsappNumber: string | null;
    channelIdentifier: string | null;
  }
) {
  const next = parseProviderConfigJson(currentRawValue);

  setConfigValueText(next, 'base_url', input.baseUrl);
  setConfigValueText(next, 'apikey', input.apiKey);
  setConfigValueText(next, 'instance', input.instanceName);
  setConfigValueText(next, 'instance_name', input.instanceName);
  setConfigValueText(next, 'phone_number', input.whatsappNumber);
  setConfigValueText(next, 'display_number', input.whatsappNumber);
  setConfigValueText(next, 'channel_id', input.channelIdentifier);

  return Object.keys(next).length > 0 ? JSON.stringify(next) : null;
}

function mapTenantRowToConnectionConfig(
  tenantId: number,
  row: TenantWhatsAppConfigRow
): TenantWhatsAppConnectionConfig {
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
    tenantId,
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

function shouldAttemptLegacyTransportBackfill(config: TenantWhatsAppConnectionConfig | null) {
  if (!config) {
    return true;
  }

  if (config.provider && !isEvolutionConnectionProvider(config.provider)) {
    return false;
  }

  const resolvedProvider = resolveStoredConnectionProvider(config);
  const hasTransport =
    Boolean(resolvedProvider) ||
    hasEvolutionTransportHints({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      instanceName: config.instanceName,
    });

  if (!hasTransport) {
    return true;
  }

  return !config.instanceName;
}

function resolveLegacyDeliveryTransport(
  row: TenantLegacyDeliveryTransportRow | null
): EvolutionTransportSnapshot | null {
  if (!row) {
    return null;
  }

  const deliveryConfig = parseProviderConfigJson(row.delivery_config);
  const baseUrl = getConfigValueText(deliveryConfig, ['evolution_url']);
  const apiKey = getConfigValueText(deliveryConfig, ['evolution_token']);
  const instanceName = getConfigValueText(deliveryConfig, ['evolution_instance']);
  const whatsappNumber =
    getConfigValueText(deliveryConfig, ['evolution_phone_number', 'whatsapp']) ||
    normalizeOptionalText(row.whatsapp);
  const channelIdentifier =
    getConfigValueText(deliveryConfig, ['evolution_channel_id']) || instanceName;
  const transportHinted = hasEvolutionTransportHints({
    baseUrl,
    apiKey,
    instanceName,
  });
  const provider = transportHinted ? 'evolution_api' : null;
  const providerConfigJson = provider
    ? buildEvolutionProviderConfigJson(null, {
        baseUrl,
        apiKey,
        instanceName,
        whatsappNumber,
        channelIdentifier,
      })
    : null;

  return {
    provider,
    providerConfigJson,
    baseUrl,
    apiKey,
    instanceName,
    whatsappNumber,
    channelIdentifier,
    transportHinted,
  };
}

function mergeConnectionConfigWithLegacyTransport(
  tenantId: number,
  current: TenantWhatsAppConnectionConfig | null,
  legacy: EvolutionTransportSnapshot | null
): TenantWhatsAppConnectionConfig | null {
  if (current?.provider && !isEvolutionConnectionProvider(current.provider)) {
    return current;
  }

  if (!current && !legacy?.transportHinted) {
    return null;
  }

  if (!legacy?.transportHinted) {
    return current;
  }

  const provider =
    current?.provider ||
    resolveStoredConnectionProvider({
      provider: legacy.provider,
      instanceName: legacy.instanceName,
      baseUrl: legacy.baseUrl,
      apiKey: legacy.apiKey,
    });
  const baseUrl = current?.baseUrl || legacy.baseUrl;
  const apiKey = current?.apiKey || legacy.apiKey;
  const instanceName = current?.instanceName || legacy.instanceName;
  const whatsappNumber = current?.whatsappNumber || legacy.whatsappNumber;
  const channelIdentifier =
    current?.channelIdentifier || legacy.channelIdentifier || instanceName;
  const providerConfigJson =
    provider && isEvolutionConnectionProvider(provider)
      ? buildEvolutionProviderConfigJson(current?.providerConfigJson ?? null, {
          baseUrl,
          apiKey,
          instanceName,
          whatsappNumber,
          channelIdentifier,
        })
      : current?.providerConfigJson ?? legacy.providerConfigJson;

  return {
    tenantId,
    whatsappEnabled: current?.whatsappEnabled ?? false,
    provider,
    providerConfigJson,
    baseUrl,
    apiKey,
    instanceName,
    whatsappNumber,
    channelIdentifier,
    updatedAt: current?.updatedAt ?? null,
  };
}

function shouldAttemptInstanceRecordBackfill(config: TenantWhatsAppConnectionConfig | null) {
  if (!config) {
    return false;
  }

  if (config.provider && !isEvolutionConnectionProvider(config.provider)) {
    return false;
  }

  return !config.instanceName;
}

function mergeConnectionConfigWithInstanceRecord(
  current: TenantWhatsAppConnectionConfig | null,
  instanceRecord: { instanceName: string } | null
): TenantWhatsAppConnectionConfig | null {
  if (!current) {
    return null;
  }

  if (current.provider && !isEvolutionConnectionProvider(current.provider)) {
    return current;
  }

  const instanceName = normalizeOptionalText(instanceRecord?.instanceName);
  if (!instanceName || current.instanceName) {
    return current;
  }

  const provider =
    current.provider ||
    resolveStoredConnectionProvider({
      provider: null,
      instanceName,
      baseUrl: current.baseUrl,
      apiKey: current.apiKey,
    });
  const channelIdentifier = current.channelIdentifier || instanceName;
  const providerConfigJson =
    provider && isEvolutionConnectionProvider(provider)
      ? buildEvolutionProviderConfigJson(current.providerConfigJson, {
          baseUrl: current.baseUrl,
          apiKey: current.apiKey,
          instanceName,
          whatsappNumber: current.whatsappNumber,
          channelIdentifier,
        })
      : current.providerConfigJson;

  return {
    ...current,
    provider,
    providerConfigJson,
    instanceName,
    channelIdentifier,
  };
}

function hasBackfillDiff(
  current: TenantWhatsAppConnectionConfig | null,
  next: TenantWhatsAppConnectionConfig | null
) {
  if (!next) {
    return false;
  }

  if (!current) {
    return Boolean(
      next.provider ||
        next.providerConfigJson ||
        next.instanceName ||
        next.baseUrl ||
        next.apiKey ||
        next.channelIdentifier
    );
  }

  return (
    current.provider !== next.provider ||
    current.providerConfigJson !== next.providerConfigJson ||
    current.whatsappNumber !== next.whatsappNumber ||
    current.instanceName !== next.instanceName ||
    current.channelIdentifier !== next.channelIdentifier
  );
}

async function persistTenantWhatsAppConnectionConfig(
  config: TenantWhatsAppConnectionConfig
) {
  await qRun(
    `INSERT INTO tenant_whatsapp_config (
        tenant_id,
        whatsapp_enabled,
        provider,
        provider_config_json,
        whatsapp_number,
        instance_name,
        channel_identifier,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        whatsapp_enabled=EXCLUDED.whatsapp_enabled,
        provider=EXCLUDED.provider,
        provider_config_json=EXCLUDED.provider_config_json,
        whatsapp_number=EXCLUDED.whatsapp_number,
        instance_name=EXCLUDED.instance_name,
        channel_identifier=EXCLUDED.channel_identifier,
        updated_at=NOW()`,
    [
      config.tenantId,
      config.whatsappEnabled ? 1 : 0,
      config.provider,
      config.providerConfigJson,
      config.whatsappNumber,
      config.instanceName,
      config.channelIdentifier,
    ]
  );
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

  const storedConfig = row ? mapTenantRowToConnectionConfig(normalizedTenantId, row) : null;
  let config = storedConfig;

  if (shouldAttemptLegacyTransportBackfill(config)) {
    const legacyRow = await q1<TenantLegacyDeliveryTransportRow>(
      `SELECT delivery_config, whatsapp
         FROM clientes
        WHERE id=?`,
      [normalizedTenantId]
    );
    config = mergeConnectionConfigWithLegacyTransport(
      normalizedTenantId,
      config,
      resolveLegacyDeliveryTransport(legacyRow)
    );
  }

  if (shouldAttemptInstanceRecordBackfill(config)) {
    const instanceRecord = await getInstanceByTenant(normalizedTenantId);
    config = mergeConnectionConfigWithInstanceRecord(config, instanceRecord);
  }

  if (hasBackfillDiff(storedConfig, config)) {
    await persistTenantWhatsAppConnectionConfig(config as TenantWhatsAppConnectionConfig);
    config = {
      ...(config as TenantWhatsAppConnectionConfig),
      updatedAt: new Date().toISOString(),
    };
  }

  return config;
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
