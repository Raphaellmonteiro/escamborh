import { AppError } from '../utils/errors';
import {
  createInstance as createEvolutionInstance,
  connectInstance,
  getConnectionState,
  sendText,
  type EvolutionApiResponse,
} from './evolutionClient';
import {
  createInstanceRecord,
  getInstanceByTenant,
  updateInstanceStatus,
  type WhatsAppInstanceRecord,
} from '../repositories/whatsappRepository';

type TenantId = number | string;
type UnknownRecord = Record<string, unknown>;

export type GenerateQrCodeResult = {
  qrcode: unknown | null;
  pairingCode: string | null;
  raw: unknown;
  status: number;
};

export type WhatsAppStatusResult = {
  state: string;
  connected: boolean;
  raw: unknown;
  status: number;
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

async function requireTenantInstance(tenantId: TenantId): Promise<WhatsAppInstanceRecord> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const instance = await getInstanceByTenant(normalizedTenantId);

  if (!instance) {
    throw new AppError('Instancia WhatsApp nao encontrada para este tenant', 404);
  }

  return instance;
}

export async function createWhatsAppInstance(tenantId: TenantId) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const instanceName = `tenant_${normalizedTenantId}_${Date.now()}`;

  try {
    await createEvolutionInstance(instanceName);
  } catch (error) {
    throw buildEvolutionError('criar a instancia WhatsApp', error);
  }

  await createInstanceRecord({
    tenantId: normalizedTenantId,
    instanceName,
  });

  return instanceName;
}

export async function generateQrCode(tenantId: TenantId): Promise<GenerateQrCodeResult> {
  const instance = await requireTenantInstance(tenantId);

  let response: EvolutionApiResponse<unknown>;

  try {
    response = await connectInstance(instance.instanceName);
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
  const instance = await requireTenantInstance(tenantId);

  let response: EvolutionApiResponse<unknown>;

  try {
    response = await getConnectionState(instance.instanceName);
  } catch (error) {
    throw buildEvolutionError('consultar o status da instancia WhatsApp', error);
  }

  const state = extractConnectionState(response.data);
  const connected = state.toLowerCase() === 'open';

  await updateInstanceStatus({
    instanceName: instance.instanceName,
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
  generateQrCode,
  getStatus,
  sendMessage,
};
