import { q1 } from '../db';
import { AppError } from '../utils/errors';

type TenantPixConfigRow = {
  tenant_id: number | string;
  pix_enabled: number | boolean | string | null;
  pix_mode: string | null;
  provider: string | null;
  provider_config_json: string | null;
  auto_confirm: number | boolean | string | null;
  created_at: string;
  updated_at: string;
};

export type TenantPixMode = 'manual' | 'automatic' | string;

export type TenantPixConfigRecord = {
  tenant_id: number;
  pix_enabled: boolean;
  pix_mode: TenantPixMode;
  provider: string | null;
  provider_config_json: string | null;
  auto_confirm: boolean;
  created_at: string;
  updated_at: string;
};

export type UpsertTenantPixConfigInput = {
  tenant_id: number | string;
  pix_enabled?: boolean | number | string | null;
  pix_mode?: TenantPixMode | null;
  provider?: string | null;
  provider_config_json?: string | Record<string, unknown> | null;
  auto_confirm?: boolean | number | string | null;
};

export const DEFAULT_TENANT_PIX_CONFIG = {
  pix_enabled: false,
  pix_mode: 'manual' as TenantPixMode,
  provider: null,
  provider_config_json: null,
  auto_confirm: false,
};

function parseTenantId(value: number | string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('Tenant invalido', 400);
  }

  return parsed;
}

function toBool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false;

  return fallback;
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizePixMode(value: unknown): TenantPixMode {
  const normalized = String(value ?? DEFAULT_TENANT_PIX_CONFIG.pix_mode)
    .trim()
    .toLowerCase();

  if (!normalized) return DEFAULT_TENANT_PIX_CONFIG.pix_mode;
  if (normalized === 'automatico') return 'automatic';
  if (normalized === 'manual') return 'manual';
  if (normalized === 'automatic') return 'automatic';
  return normalized;
}

function normalizeProvider(value: unknown) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toLowerCase().replace(/[\s-]+/g, '_') : null;
}

function normalizeProviderConfigJson(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    throw new AppError('provider_config_json invalido', 400);
  }
}

function mapTenantPixConfigRow(row: TenantPixConfigRow): TenantPixConfigRecord {
  return {
    tenant_id: Number(row.tenant_id),
    pix_enabled: toBool(row.pix_enabled, false),
    pix_mode: normalizePixMode(row.pix_mode),
    provider: normalizeProvider(row.provider),
    provider_config_json: normalizeProviderConfigJson(row.provider_config_json),
    auto_confirm: toBool(row.auto_confirm, false),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getTenantPixConfig(
  tenantId: number | string
): Promise<TenantPixConfigRecord | null> {
  const parsedTenantId = parseTenantId(tenantId);

  const row = await q1<TenantPixConfigRow>(
    `SELECT tenant_id, pix_enabled, pix_mode, provider, provider_config_json,
            auto_confirm, created_at, updated_at
     FROM tenant_pix_config
     WHERE tenant_id=?`,
    [parsedTenantId]
  );

  return row ? mapTenantPixConfigRow(row) : null;
}

export async function upsertTenantPixConfig(
  input: UpsertTenantPixConfigInput
): Promise<TenantPixConfigRecord> {
  const tenantId = parseTenantId(input.tenant_id);
  const pixEnabled = toBool(input.pix_enabled, DEFAULT_TENANT_PIX_CONFIG.pix_enabled);
  const pixMode = normalizePixMode(input.pix_mode);
  const provider = normalizeProvider(input.provider);
  const providerConfigJson = normalizeProviderConfigJson(input.provider_config_json);
  const autoConfirm = toBool(input.auto_confirm, DEFAULT_TENANT_PIX_CONFIG.auto_confirm);

  const row = await q1<TenantPixConfigRow>(
    `INSERT INTO tenant_pix_config (
       tenant_id, pix_enabled, pix_mode, provider, provider_config_json, auto_confirm, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE
     SET pix_enabled=EXCLUDED.pix_enabled,
         pix_mode=EXCLUDED.pix_mode,
         provider=EXCLUDED.provider,
         provider_config_json=EXCLUDED.provider_config_json,
         auto_confirm=EXCLUDED.auto_confirm,
         updated_at=NOW()
     RETURNING tenant_id, pix_enabled, pix_mode, provider, provider_config_json,
               auto_confirm, created_at, updated_at`,
    [tenantId, pixEnabled ? 1 : 0, pixMode, provider, providerConfigJson, autoConfirm ? 1 : 0]
  );

  if (!row) {
    throw new AppError('Falha ao salvar configuracao PIX do tenant', 500);
  }

  return mapTenantPixConfigRow(row);
}
