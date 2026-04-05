import { q1, qAll, qInsert, qRun } from '../db';
import type {
  CreateOrderPaymentInput,
  OrderPaymentRecord,
  PaymentProvider,
  UpdateOrderPaymentStatusInput,
} from '../types/order';
import { AppError } from '../utils/errors';
import { coerceDeliveryConfigRow } from '../utils/deliveryConfigPersist';
import {
  createMercadoPagoPixPayment,
  type CreatePixProviderPaymentResult,
} from './payments/providers';
import { getTenantPixConfig } from './tenantPixConfigService';

type TenantId = number | string;

type OrderPaymentRow = {
  id: number | string;
  tenant_id: number | string;
  order_id: number | string;
  method: string;
  provider?: string | null;
  status: string;
  amount: number | string;
  external_id?: string | null;
  external_reference?: string | null;
  qr_code_text?: string | null;
  qr_code_image_base64?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type TenantPaymentConfigRow = {
  delivery_config?: unknown;
};

type TenantPaymentProviderConfig = {
  enabled: boolean;
  provider: PaymentProvider | null;
  accessToken: string | null;
  webhookSecret: string | null;
  sandbox: boolean;
};

export type CreatePixPaymentInput = {
  tenant_id: number | string;
  order_id: number | string;
  amount: number;
  customer_name?: string | null;
  customer_email?: string | null;
  external_reference?: string | null;
  description?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreatePixPaymentResult = {
  payment: OrderPaymentRecord;
  provider: PaymentProvider | null;
  external_id: string | null;
  external_reference: string | null;
  status: string;
  qr_code_text: string | null;
  qr_code_base64: string | null;
  expires_at: string | null;
};

type TenantPixFlowMode = 'manual' | 'automatic';

function ensureTenantId(tenantId: TenantId) {
  if (tenantId === null || tenantId === undefined || tenantId === '') {
    throw new AppError('Tenant invalido', 400);
  }
}

function parsePositiveId(value: number | string, label: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${label} invalido`, 400);
  }

  return parsed;
}

function normalizeRequiredText(value: unknown, label: string) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new AppError(`${label} invalido`, 400);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeProviderName(rawValue: unknown): PaymentProvider | null {
  const normalized = String(rawValue ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!normalized) return null;
  if (normalized === 'mercadopago') return 'mercado_pago';
  return normalized as PaymentProvider;
}

function normalizeAmount(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError('Valor de pagamento invalido', 400);
  }

  return amount;
}

function mapOrderPaymentRow(row: OrderPaymentRow): OrderPaymentRecord {
  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    order_id: Number(row.order_id),
    method: row.method,
    provider: row.provider ?? null,
    status: row.status,
    amount: Number(row.amount || 0),
    external_id: row.external_id ?? null,
    external_reference: row.external_reference ?? null,
    qr_code_text: row.qr_code_text ?? null,
    qr_code_image_base64: row.qr_code_image_base64 ?? null,
    paid_at: row.paid_at ?? null,
    expires_at: row.expires_at ?? null,
    metadata_json: row.metadata_json ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureOrderExistsForTenant(orderId: number, tenantId: number) {
  const order = await q1<{ id: number }>(
    'SELECT id FROM pedidos WHERE id=? AND tenant_id=?',
    [orderId, tenantId]
  );

  if (!order) {
    throw new AppError('Pedido nao encontrado', 404);
  }
}

async function getLatestPixPaymentByOrder(input: {
  orderId: number;
  tenantId: number;
}): Promise<OrderPaymentRecord | null> {
  const row = await q1<OrderPaymentRow>(
    `SELECT id, tenant_id, order_id, method, provider, status, amount, external_id,
            external_reference, qr_code_text, qr_code_image_base64, paid_at,
            expires_at, metadata_json, created_at, updated_at
     FROM pedido_pagamentos
     WHERE order_id=? AND tenant_id=? AND LOWER(method)='pix'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [input.orderId, input.tenantId]
  );

  return row ? mapOrderPaymentRow(row) : null;
}

export async function getTenantPaymentProviderConfig(
  tenantId: number
): Promise<TenantPaymentProviderConfig> {
  const row = await q1<TenantPaymentConfigRow>(
    'SELECT delivery_config FROM clientes WHERE id=?',
    [tenantId]
  );

  const config = coerceDeliveryConfigRow(row?.delivery_config ?? null);

  return {
    enabled: Boolean(config.provider_enabled),
    provider: normalizeProviderName(config.payment_provider),
    accessToken: normalizeOptionalText(config.access_token),
    webhookSecret: normalizeOptionalText(config.webhook_secret),
    sandbox: Boolean(config.provider_sandbox),
  };
}

function mapPixResultFromPayment(payment: OrderPaymentRecord): CreatePixPaymentResult {
  return {
    payment,
    provider: payment.provider ?? null,
    external_id: payment.external_id ?? null,
    external_reference: payment.external_reference ?? null,
    status: payment.status,
    qr_code_text: payment.qr_code_text ?? null,
    qr_code_base64: payment.qr_code_image_base64 ?? null,
    expires_at: payment.expires_at ?? null,
  };
}

async function resolveTenantPixFlow(tenantId: number): Promise<{
  shouldAttemptAutomaticPix: boolean;
  mode: TenantPixFlowMode;
}> {
  const tenantPixConfig = await getTenantPixConfig(tenantId);

  if (!tenantPixConfig) {
    return {
      shouldAttemptAutomaticPix: true,
      mode: 'manual',
    };
  }

  if (!tenantPixConfig.pix_enabled) {
    return {
      shouldAttemptAutomaticPix: false,
      mode: 'manual',
    };
  }

  if (tenantPixConfig.pix_mode === 'automatic') {
    return {
      shouldAttemptAutomaticPix: false,
      mode: 'automatic',
    };
  }

  return {
    shouldAttemptAutomaticPix: false,
    mode: 'manual',
  };
}

export async function createOrderPayment(
  input: CreateOrderPaymentInput
): Promise<OrderPaymentRecord> {
  ensureTenantId(input.tenant_id);

  const tenantId = parsePositiveId(input.tenant_id, 'Tenant');
  const orderId = parsePositiveId(input.order_id, 'Pedido');
  const method = normalizeRequiredText(input.method, 'Metodo de pagamento');
  const status = normalizeRequiredText(input.status ?? 'pending', 'Status de pagamento');
  const amount = normalizeAmount(input.amount);

  await ensureOrderExistsForTenant(orderId, tenantId);

  const createdId = await qInsert(
    `INSERT INTO pedido_pagamentos
      (tenant_id, order_id, method, provider, status, amount, external_id,
       external_reference, qr_code_text, qr_code_image_base64, paid_at,
       expires_at, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      tenantId,
      orderId,
      method,
      normalizeOptionalText(input.provider),
      status,
      amount,
      normalizeOptionalText(input.external_id),
      normalizeOptionalText(input.external_reference),
      normalizeOptionalText(input.qr_code_text),
      normalizeOptionalText(input.qr_code_image_base64),
      normalizeOptionalText(input.paid_at),
      normalizeOptionalText(input.expires_at),
      normalizeOptionalText(input.metadata_json),
    ]
  );

  const created = await getPaymentById({
    id: Number(createdId),
    tenantId,
  });

  if (!created) {
    throw new AppError('Falha ao carregar pagamento criado', 500);
  }

  return created;
}

export async function getPaymentByExternalId(input: {
  externalId: string;
  provider?: PaymentProvider | null;
}): Promise<OrderPaymentRecord | null> {
  const externalId = normalizeRequiredText(input.externalId, 'External ID');
  const provider = normalizeOptionalText(input.provider);

  const params: unknown[] = [externalId];
  let sql =
    `SELECT id, tenant_id, order_id, method, provider, status, amount, external_id,
            external_reference, qr_code_text, qr_code_image_base64, paid_at,
            expires_at, metadata_json, created_at, updated_at
     FROM pedido_pagamentos
     WHERE external_id=?`;

  if (provider) {
    sql += ' AND provider=?';
    params.push(provider);
  }

  sql += ' ORDER BY updated_at DESC, id DESC LIMIT 1';

  const row = await q1<OrderPaymentRow>(sql, params);

  return row ? mapOrderPaymentRow(row) : null;
}

export async function getPaymentById(input: {
  id: number | string;
  tenantId: TenantId;
}): Promise<OrderPaymentRecord | null> {
  ensureTenantId(input.tenantId);

  const id = parsePositiveId(input.id, 'Pagamento');
  const tenantId = parsePositiveId(input.tenantId, 'Tenant');

  const row = await q1<OrderPaymentRow>(
    `SELECT id, tenant_id, order_id, method, provider, status, amount, external_id,
            external_reference, qr_code_text, qr_code_image_base64, paid_at,
            expires_at, metadata_json, created_at, updated_at
     FROM pedido_pagamentos
     WHERE id=? AND tenant_id=?`,
    [id, tenantId]
  );

  return row ? mapOrderPaymentRow(row) : null;
}

export async function getPaymentByOrderId(input: {
  orderId: number | string;
  tenantId: TenantId;
}): Promise<OrderPaymentRecord[]> {
  ensureTenantId(input.tenantId);

  const orderId = parsePositiveId(input.orderId, 'Pedido');
  const tenantId = parsePositiveId(input.tenantId, 'Tenant');

  const rows = await qAll<OrderPaymentRow>(
    `SELECT id, tenant_id, order_id, method, provider, status, amount, external_id,
            external_reference, qr_code_text, qr_code_image_base64, paid_at,
            expires_at, metadata_json, created_at, updated_at
     FROM pedido_pagamentos
     WHERE order_id=? AND tenant_id=?
     ORDER BY created_at DESC, id DESC`,
    [orderId, tenantId]
  );

  return rows.map(mapOrderPaymentRow);
}

export async function updatePaymentStatus(
  input: UpdateOrderPaymentStatusInput
): Promise<OrderPaymentRecord | null> {
  ensureTenantId(input.tenant_id);

  const id = parsePositiveId(input.id, 'Pagamento');
  const tenantId = parsePositiveId(input.tenant_id, 'Tenant');
  const status = normalizeRequiredText(input.status, 'Status de pagamento');

  const row = await q1<OrderPaymentRow>(
    `UPDATE pedido_pagamentos
     SET status=?,
         paid_at=COALESCE(?, paid_at),
         expires_at=COALESCE(?, expires_at),
         external_id=COALESCE(?, external_id),
         external_reference=COALESCE(?, external_reference),
         qr_code_text=COALESCE(?, qr_code_text),
         qr_code_image_base64=COALESCE(?, qr_code_image_base64),
         metadata_json=COALESCE(?, metadata_json),
         updated_at=NOW()
     WHERE id=? AND tenant_id=?
     RETURNING id, tenant_id, order_id, method, provider, status, amount, external_id,
               external_reference, qr_code_text, qr_code_image_base64, paid_at,
               expires_at, metadata_json, created_at, updated_at`,
    [
      status,
      normalizeOptionalText(input.paid_at),
      normalizeOptionalText(input.expires_at),
      normalizeOptionalText(input.external_id),
      normalizeOptionalText(input.external_reference),
      normalizeOptionalText(input.qr_code_text),
      normalizeOptionalText(input.qr_code_image_base64),
      normalizeOptionalText(input.metadata_json),
      id,
      tenantId,
    ]
  );

  return row ? mapOrderPaymentRow(row) : null;
}

export async function createPixPayment(
  input: CreatePixPaymentInput
): Promise<CreatePixPaymentResult | null> {
  ensureTenantId(input.tenant_id);

  const tenantId = parsePositiveId(input.tenant_id, 'Tenant');
  const orderId = parsePositiveId(input.order_id, 'Pedido');
  const amount = normalizeAmount(input.amount);
  const pixFlow = await resolveTenantPixFlow(tenantId);

  await ensureOrderExistsForTenant(orderId, tenantId);

  const existingPayment = await getLatestPixPaymentByOrder({
    orderId,
    tenantId,
  });

  if (existingPayment?.external_id || existingPayment?.qr_code_text) {
    if (existingPayment.external_reference) {
      await qRun(
        'UPDATE pedidos SET pix_external_reference=COALESCE(?, pix_external_reference) WHERE id=? AND tenant_id=?',
        [existingPayment.external_reference, orderId, tenantId]
      );
    }
    return mapPixResultFromPayment(existingPayment);
  }

  if (!pixFlow.shouldAttemptAutomaticPix) {
    // Branch reservado para integracao futura do PIX automatico por tenant.
    return null;
  }

  const providerConfig = await getTenantPaymentProviderConfig(tenantId);

  if (!providerConfig.enabled || !providerConfig.provider) {
    return null;
  }

  let providerResult: CreatePixProviderPaymentResult;

  if (providerConfig.provider === 'mercado_pago') {
    providerResult = await createMercadoPagoPixPayment({
      tenantId,
      orderId,
      amount,
      accessToken: providerConfig.accessToken || '',
      externalReference:
        normalizeOptionalText(input.external_reference) || `pedido-${tenantId}-${orderId}`,
      description:
        normalizeOptionalText(input.description) || `Pedido #${orderId} - FlowPDV`,
      payerName: normalizeOptionalText(input.customer_name),
      payerEmail: normalizeOptionalText(input.customer_email),
      sandbox: providerConfig.sandbox,
      expiresAt: normalizeOptionalText(input.expires_at),
    });
  } else {
    throw new AppError(`Provider de pagamento nao suportado: ${providerConfig.provider}`, 400);
  }

  const metadata = {
    ...(input.metadata ?? {}),
    ...(providerResult.metadata ?? {}),
  };

  const payment = await createOrderPayment({
    tenant_id: tenantId,
    order_id: orderId,
    method: 'pix',
    provider: providerResult.provider,
    status: providerResult.status || 'pending',
    amount,
    external_id: providerResult.external_id,
    external_reference: providerResult.external_reference,
    qr_code_text: providerResult.qr_code_text,
    qr_code_image_base64: providerResult.qr_code_base64,
    expires_at: providerResult.expires_at,
    metadata_json: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
  });

  if (providerResult.external_id) {
    await qRun(
      `UPDATE pedidos
       SET pix_txid=COALESCE(?, pix_txid),
           pix_external_reference=COALESCE(?, pix_external_reference)
       WHERE id=? AND tenant_id=?`,
      [providerResult.external_id, providerResult.external_reference, orderId, tenantId]
    );
  } else if (providerResult.external_reference) {
    await qRun(
      'UPDATE pedidos SET pix_external_reference=COALESCE(?, pix_external_reference) WHERE id=? AND tenant_id=?',
      [providerResult.external_reference, orderId, tenantId]
    );
  }

  return {
    payment,
    provider: providerResult.provider,
    external_id: providerResult.external_id,
    external_reference: providerResult.external_reference,
    status: payment.status,
    qr_code_text: payment.qr_code_text ?? null,
    qr_code_base64: payment.qr_code_image_base64 ?? null,
    expires_at: payment.expires_at ?? null,
  };
}
