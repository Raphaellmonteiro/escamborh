import { AppError } from '../utils/errors';
import {
  createInstance as createEvolutionInstance,
  connectInstance,
  getConnectionState,
  sendText,
  type EvolutionApiClientConfig,
  type EvolutionApiResponse,
} from './evolutionClient';
import {
  createInstanceRecord,
  getInstanceByTenant,
  updateInstanceStatus,
  type WhatsAppInstanceRecord,
} from '../repositories/whatsappRepository';
import {
  getTenantWhatsAppConnectionConfig,
  isEvolutionConnectionProvider,
  persistTenantWhatsAppInstanceName,
  sanitizeTenantWhatsAppConnectionConfigForClient,
  type TenantWhatsAppConnectionConfig,
} from './tenantWhatsAppConfigService';

type TenantId = number | string;
type UnknownRecord = Record<string, unknown>;

export type GenerateQrCodeResult = {
  qrcode: unknown | null;
  pairingCode: string | null;
  raw: unknown;
  status: number;
};

export type CreateWhatsAppInstanceResult = {
  instanceName: string;
  created: boolean;
  alreadyExisted: boolean;
};

export type WhatsAppStatusResult = {
  state: string;
  connected: boolean;
  raw: unknown;
  status: number;
};

export type WhatsAppConnectionInfoResult = {
  source: 'tenant_whatsapp_config' | 'legacy';
  configured: boolean;
  whatsapp_enabled: boolean;
  provider: string | null;
  supported: boolean;
  instance_name: string | null;
  active_number: string | null;
  channel_identifier: string | null;
  has_base_url: boolean;
  has_api_key: boolean;
  updated_at: string | null;
  status: {
    state: string | null;
    connected: boolean;
    source: 'provider' | 'database' | 'unavailable';
    http_status: number | null;
  };
};

type TenantConnectionContext = {
  tenantId: number;
  tenantConfig: TenantWhatsAppConnectionConfig | null;
  instanceRecord: WhatsAppInstanceRecord | null;
  provider: string | null;
  instanceName: string | null;
  evolutionClientConfig?: EvolutionApiClientConfig;
};

function normalizeTenantId(value: TenantId) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('tenantId invalido', 400);
  }

  return parsed;
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new AppError(`${fieldName} obrigatorio`, 400);
  }

  return normalized;
}

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function toNonEmptyString(value: unknown) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function findValueByKeys(source: unknown, keys: string[], visited = new Set<unknown>()): unknown | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  if (visited.has(source)) {
    return null;
  }

  visited.add(source);

  if (Array.isArray(source)) {
    for (const item of source) {
      const found = findValueByKeys(item, keys, visited);
      if (found !== null) {
        return found;
      }
    }

    return null;
  }

  const record = source as UnknownRecord;
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, value] of Object.entries(record)) {
    if (normalizedKeys.has(key.toLowerCase()) && value !== undefined && value !== null) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    const found = findValueByKeys(value, keys, visited);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function findStringByKeys(source: unknown, keys: string[]) {
  const value = findValueByKeys(source, keys);
  return toNonEmptyString(value);
}

function extractQrCodeValue(data: unknown) {
  const qrcodeValue =
    findValueByKeys(data, ['qrcode', 'qrCode', 'base64']) ??
    (() => {
      const qr = findValueByKeys(data, ['qr']);
      const qrRecord = toRecord(qr);
      if (!qrRecord) {
        return qr;
      }

      return qrRecord.base64 ?? qrRecord.qrcode ?? qrRecord.qrCode ?? qr;
    })();

  return qrcodeValue ?? null;
}

function extractConnectionState(data: unknown) {
  return (
    findStringByKeys(data, ['connectionState']) ??
    findStringByKeys(data, ['state']) ??
    findStringByKeys(data, ['status']) ??
    'unknown'
  );
}

function buildEvolutionError(action: string, error: unknown) {
  const message = error instanceof Error && error.message ? error.message : `Falha ao ${action}`;
  return new AppError(message, 502);
}

function buildTenantInstanceName(tenantId: number) {
  return `tenant_${tenantId}_whatsapp`;
}

function isEvolutionInstanceAlreadyExistsError(error: unknown) {
  const message =
    error instanceof Error && error.message ? error.message.trim().toLowerCase() : '';

  if (!message) {
    return false;
  }

  return (
    message.includes('already exists') ||
    message.includes('already exist') ||
    message.includes('instance already') ||
    message.includes('duplicate') ||
    message.includes('ja existe') ||
    message.includes('já existe')
  );
}

function resolveContextProvider(
  tenantConfig: TenantWhatsAppConnectionConfig | null,
  instanceRecord: WhatsAppInstanceRecord | null
) {
  if (tenantConfig?.provider) {
    return tenantConfig.provider;
  }

  if (tenantConfig?.instanceName || tenantConfig?.baseUrl || tenantConfig?.apiKey) {
    return 'evolution_api';
  }

  if (instanceRecord?.instanceName) {
    return 'evolution_api';
  }

  return null;
}

function assertSupportedConnectionProvider(provider: string | null) {
  if (!provider || isEvolutionConnectionProvider(provider)) {
    return;
  }

  throw new AppError('Provider WhatsApp nao suportado no fluxo de conexao atual', 409);
}

async function resolveTenantConnectionContext(tenantId: TenantId): Promise<TenantConnectionContext> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const [tenantConfig, instanceRecord] = await Promise.all([
    getTenantWhatsAppConnectionConfig(normalizedTenantId),
    getInstanceByTenant(normalizedTenantId),
  ]);
  const provider = resolveContextProvider(tenantConfig, instanceRecord);

  return {
    tenantId: normalizedTenantId,
    tenantConfig,
    instanceRecord,
    provider,
    instanceName: tenantConfig?.instanceName || instanceRecord?.instanceName || null,
    evolutionClientConfig: tenantConfig
      ? {
          baseUrl: tenantConfig.baseUrl,
          apiKey: tenantConfig.apiKey,
        }
      : undefined,
  };
}

function requireConnectionInstanceName(context: TenantConnectionContext) {
  if (context.instanceName) {
    return context.instanceName;
  }

  if (context.tenantConfig) {
    throw new AppError('instance_name nao configurado em tenant_whatsapp_config para este tenant', 400);
  }

  throw new AppError('Instancia WhatsApp nao encontrada para este tenant', 404);
}

async function persistInstanceRecordIfNeeded(tenantId: number, instanceName: string) {
  try {
    await createInstanceRecord({
      tenantId,
      instanceName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'instanceName ja cadastrado') {
      return;
    }

    throw error;
  }
}

async function persistProvisionedInstance(tenantId: number, instanceName: string) {
  await persistInstanceRecordIfNeeded(tenantId, instanceName);
  await persistTenantWhatsAppInstanceName(tenantId, instanceName);
}

async function requireTenantInstance(tenantId: TenantId): Promise<WhatsAppInstanceRecord> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const instance = await getInstanceByTenant(normalizedTenantId);

  if (!instance) {
    throw new AppError('Instancia WhatsApp nao encontrada para este tenant', 404);
  }

  return instance;
}

export async function createWhatsAppInstance(
  tenantId: TenantId
): Promise<CreateWhatsAppInstanceResult> {
  const context = await resolveTenantConnectionContext(tenantId);
  assertSupportedConnectionProvider(context.provider);
  const instanceName = context.instanceName || buildTenantInstanceName(context.tenantId);
  let alreadyExisted = false;

  try {
    await createEvolutionInstance(instanceName, context.evolutionClientConfig);
  } catch (error) {
    if (!isEvolutionInstanceAlreadyExistsError(error)) {
      throw buildEvolutionError('criar a instancia WhatsApp', error);
    }

    alreadyExisted = true;
  }

  await persistProvisionedInstance(context.tenantId, instanceName);

  return {
    instanceName,
    created: !alreadyExisted,
    alreadyExisted,
  };
}

export async function generateQrCode(tenantId: TenantId): Promise<GenerateQrCodeResult> {
  let context = await resolveTenantConnectionContext(tenantId);
  assertSupportedConnectionProvider(context.provider);

  if (!context.instanceName && isEvolutionConnectionProvider(context.provider)) {
    await createWhatsAppInstance(context.tenantId);
    context = await resolveTenantConnectionContext(context.tenantId);
  }

  const instanceName = requireConnectionInstanceName(context);

  let response: EvolutionApiResponse<unknown>;

  try {
    response = await connectInstance(instanceName, context.evolutionClientConfig);
  } catch (error) {
    throw buildEvolutionError('gerar o QR Code da instancia WhatsApp', error);
  }

  return {
    qrcode: extractQrCodeValue(response.data),
    pairingCode: findStringByKeys(response.data, ['pairingCode', 'pairing_code']),
    raw: response.data,
    status: response.status,
  };
}

export async function getStatus(tenantId: TenantId): Promise<WhatsAppStatusResult> {
  let context = await resolveTenantConnectionContext(tenantId);
  assertSupportedConnectionProvider(context.provider);

  if (!context.instanceName && isEvolutionConnectionProvider(context.provider)) {
    await createWhatsAppInstance(context.tenantId);
    context = await resolveTenantConnectionContext(context.tenantId);
  }

  const instanceName = requireConnectionInstanceName(context);

  let response: EvolutionApiResponse<unknown>;

  try {
    response = await getConnectionState(instanceName, context.evolutionClientConfig);
  } catch (error) {
    throw buildEvolutionError('consultar o status da instancia WhatsApp', error);
  }

  const state = extractConnectionState(response.data);
  const connected = state.toLowerCase() === 'open';

  await persistInstanceRecordIfNeeded(context.tenantId, instanceName);
  await updateInstanceStatus({
    instanceName,
    status: state,
    connected,
  });

  return {
    state,
    connected,
    raw: response.data,
    status: response.status,
  };
}

export async function getConnectionInfo(tenantId: TenantId): Promise<WhatsAppConnectionInfoResult> {
  const context = await resolveTenantConnectionContext(tenantId);
  const safeTenantConfig = sanitizeTenantWhatsAppConnectionConfigForClient(context.tenantConfig);
  const configured = Boolean(
    context.instanceRecord ||
      context.instanceName ||
      context.provider ||
      safeTenantConfig?.hasBaseUrl ||
      safeTenantConfig?.hasApiKey
  );
  const baseResult: WhatsAppConnectionInfoResult = {
    source: context.tenantConfig ? 'tenant_whatsapp_config' : 'legacy',
    configured,
    whatsapp_enabled: safeTenantConfig?.whatsappEnabled ?? false,
    provider: context.provider,
    supported: !context.provider || isEvolutionConnectionProvider(context.provider),
    instance_name: context.instanceName,
    active_number: safeTenantConfig?.whatsappNumber ?? null,
    channel_identifier:
      safeTenantConfig?.channelIdentifier ?? context.instanceName ?? null,
    has_base_url: safeTenantConfig?.hasBaseUrl ?? false,
    has_api_key: safeTenantConfig?.hasApiKey ?? false,
    updated_at: safeTenantConfig?.updatedAt ?? null,
    status: {
      state: context.instanceRecord?.status ?? null,
      connected: Boolean(context.instanceRecord?.connected),
      source: context.instanceRecord ? 'database' : 'unavailable',
      http_status: null,
    },
  };

  if (!baseResult.supported || !context.instanceName) {
    return baseResult;
  }

  try {
    const response = await getConnectionState(context.instanceName, context.evolutionClientConfig);
    const state = extractConnectionState(response.data);
    const connected = state.toLowerCase() === 'open';

    if (context.instanceRecord) {
      await updateInstanceStatus({
        instanceName: context.instanceName,
        status: state,
        connected,
      });
    }

    return {
      ...baseResult,
      status: {
        state,
        connected,
        source: 'provider',
        http_status: response.status,
      },
    };
  } catch {
    return baseResult;
  }
}

export async function sendMessage<TData = unknown>(
  tenantId: TenantId,
  number: string,
  text: string
): Promise<EvolutionApiResponse<TData>> {
  const instance = await requireTenantInstance(tenantId);
  const normalizedNumber = normalizeRequiredText(number, 'number');
  const normalizedText = normalizeRequiredText(text, 'text');

  try {
    return (await sendText<TData>(
      instance.instanceName,
      normalizedNumber,
      normalizedText
    )) as EvolutionApiResponse<TData>;
  } catch (error) {
    throw buildEvolutionError('enviar mensagem pela instancia WhatsApp', error);
  }
}

export const whatsappService = {
  createWhatsAppInstance,
  getConnectionInfo,
  generateQrCode,
  getStatus,
  sendMessage,
};
