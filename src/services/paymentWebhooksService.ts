import { createHmac, timingSafeEqual } from 'node:crypto';
import { q1 } from '../db';
import { confirmOrderPayment } from './ordersService';
import {
  getPaymentByExternalId,
  getTenantPaymentProviderConfig,
  updatePaymentStatus,
} from './paymentsService';
import { logError, logInfo } from '../utils/logger';

type MercadoPagoWebhookPayload = {
  action?: unknown;
  type?: unknown;
  topic?: unknown;
  data?: {
    id?: unknown;
  } | null;
  id?: unknown;
};

type MercadoPagoWebhookHeaders = {
  xSignature?: unknown;
  xRequestId?: unknown;
};

type MercadoPagoPaymentResponse = {
  id?: unknown;
  status?: unknown;
  external_reference?: unknown;
  date_approved?: unknown;
  date_last_updated?: unknown;
};

type OrderLookupRow = {
  id: number | string;
  tenant_id: number | string;
  pagamento_status?: string | null;
};

type PaymentLookupRow = {
  id: number;
  tenant_id: number;
  order_id: number;
  status: string;
};

export type ProcessMercadoPagoWebhookInput = {
  payload: unknown;
  queryDataId?: unknown;
  headers?: MercadoPagoWebhookHeaders;
};

export type ProcessMercadoPagoWebhookResult = {
  received: true;
  matched: boolean;
  paymentUpdated: boolean;
  orderUpdated: boolean;
  alreadyPaid: boolean;
  externalId: string | null;
  ignoredReason?: string;
};

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function extractMercadoPagoEventType(payload: MercadoPagoWebhookPayload) {
  return normalizeOptionalText(payload.type) || normalizeOptionalText(payload.topic);
}

function extractMercadoPagoExternalId(payload: MercadoPagoWebhookPayload, queryDataId?: unknown) {
  return (
    normalizeOptionalText(queryDataId) ||
    normalizeOptionalText(payload.data?.id) ||
    normalizeOptionalText(payload.id)
  );
}

function isMercadoPagoPaymentEvent(payload: MercadoPagoWebhookPayload) {
  const eventType = extractMercadoPagoEventType(payload);
  const action = normalizeOptionalText(payload.action);

  return eventType === 'payment' || Boolean(action?.startsWith('payment.'));
}

function parseMercadoPagoSignature(value: string | null) {
  if (!value) return null;

  const pairs = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) return acc;

      const key = entry.slice(0, separatorIndex).trim();
      const currentValue = entry.slice(separatorIndex + 1).trim();

      if (key) {
        acc[key] = currentValue;
      }

      return acc;
    }, {});

  const ts = normalizeOptionalText(pairs.ts);
  const v1 = normalizeOptionalText(pairs.v1);

  if (!ts || !v1) return null;

  return { ts, v1 };
}

function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left.trim().toLowerCase(), 'utf8');
  const rightBuffer = Buffer.from(right.trim().toLowerCase(), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function validateMercadoPagoSignature(input: {
  secret?: string | null;
  externalId: string;
  headers?: MercadoPagoWebhookHeaders;
}) {
  const secret = normalizeOptionalText(input.secret);
  if (!secret) return;

  const signature = parseMercadoPagoSignature(
    normalizeOptionalText(input.headers?.xSignature)
  );
  const requestId = normalizeOptionalText(input.headers?.xRequestId);

  if (!signature || !requestId) {
    throw new Error('Assinatura do webhook invalida');
  }

  const manifest = `id:${input.externalId.toLowerCase()};request-id:${requestId};ts:${signature.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  if (!secureStringEqual(signature.v1, expected)) {
    throw new Error('Assinatura do webhook invalida');
  }
}

function isExternalPaymentPaid(status: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'approved' || normalized === 'paid';
}

function isOrderPaid(status: string | null | undefined) {
  return String(status || '').trim().toLowerCase() === 'pago';
}

function getMercadoPagoAccessTokenFromEnv() {
  return (
    normalizeOptionalText(process.env.MERCADO_PAGO_ACCESS_TOKEN) ||
    normalizeOptionalText(process.env.ACCESS_TOKEN)
  );
}

function getMercadoPagoWebhookSecretFromEnv() {
  return normalizeOptionalText(process.env.MERCADO_PAGO_WEBHOOK_SECRET);
}

async function resolveMercadoPagoAccessToken(input: {
  tenantId?: number | null;
}) {
  if (input.tenantId) {
    const providerConfig = await getTenantPaymentProviderConfig(input.tenantId);

    if (providerConfig.provider === 'mercado_pago' && providerConfig.accessToken) {
      return providerConfig.accessToken;
    }
  }

  return getMercadoPagoAccessTokenFromEnv();
}

async function resolveMercadoPagoWebhookSecret(input: {
  tenantId?: number | null;
}) {
  if (input.tenantId) {
    const providerConfig = await getTenantPaymentProviderConfig(input.tenantId);

    if (providerConfig.provider === 'mercado_pago' && providerConfig.webhookSecret) {
      return providerConfig.webhookSecret;
    }
  }

  return getMercadoPagoWebhookSecretFromEnv();
}

async function fetchMercadoPagoPayment(input: {
  paymentId: string;
  accessToken: string;
}): Promise<MercadoPagoPaymentResponse | null> {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(input.paymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as MercadoPagoPaymentResponse | null;
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

async function findOrderByExternalReference(
  externalReference: string
): Promise<OrderLookupRow | null> {
  const byOrderNumber = await q1<OrderLookupRow>(
    'SELECT id, tenant_id, pagamento_status FROM pedidos WHERE order_number=?',
    [externalReference]
  );

  if (byOrderNumber) {
    return byOrderNumber;
  }

  const fallbackMatch = /^pedido-(\d+)-(\d+)$/i.exec(externalReference);
  if (!fallbackMatch) {
    return null;
  }

  return q1<OrderLookupRow>(
    'SELECT id, tenant_id, pagamento_status FROM pedidos WHERE tenant_id=? AND id=?',
    [Number(fallbackMatch[1]), Number(fallbackMatch[2])]
  );
}

async function findPaymentByExternalReference(
  externalReference: string
): Promise<PaymentLookupRow | null> {
  return q1<PaymentLookupRow>(
    `SELECT id, tenant_id, order_id, status
     FROM pedido_pagamentos
     WHERE external_reference=? AND LOWER(method)='pix'
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [externalReference]
  );
}

export async function processMercadoPagoPaymentWebhook(
  input: ProcessMercadoPagoWebhookInput
): Promise<ProcessMercadoPagoWebhookResult> {
  let externalId: string | null = null;

  try {
    const payload =
      input.payload && typeof input.payload === 'object'
        ? (input.payload as MercadoPagoWebhookPayload)
        : null;

    if (!payload) {
      return {
        received: true,
        matched: false,
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: false,
        externalId: null,
        ignoredReason: 'payload_invalido',
      };
    }

    if (!isMercadoPagoPaymentEvent(payload)) {
      return {
        received: true,
        matched: false,
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: false,
        externalId: null,
        ignoredReason: 'evento_ignorado',
      };
    }

    externalId = extractMercadoPagoExternalId(payload, input.queryDataId);

    logInfo('paymentWebhooksService.processMercadoPagoPaymentWebhook.received', {
      externalId,
      queryDataId: normalizeOptionalText(input.queryDataId),
      eventType: extractMercadoPagoEventType(payload),
      action: normalizeOptionalText(payload.action),
    });

    if (!externalId) {
      return {
        received: true,
        matched: false,
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: false,
        externalId: null,
        ignoredReason: 'pagamento_invalido',
      };
    }

    const localPayment = await getPaymentByExternalId({
      externalId,
      provider: 'mercado_pago',
    });

    validateMercadoPagoSignature({
      secret: await resolveMercadoPagoWebhookSecret({
        tenantId: localPayment?.tenant_id ?? null,
      }),
      externalId,
      headers: input.headers,
    });

    const accessToken = await resolveMercadoPagoAccessToken({
      tenantId: localPayment?.tenant_id ?? null,
    });

    if (!accessToken) {
      return {
        received: true,
        matched: false,
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: false,
        externalId,
        ignoredReason: 'access_token_nao_configurado',
      };
    }

    const mercadoPagoPayment = await fetchMercadoPagoPayment({
      paymentId: externalId,
      accessToken,
    });

    if (!mercadoPagoPayment) {
      return {
        received: true,
        matched: false,
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: false,
        externalId,
        ignoredReason: 'pagamento_nao_encontrado',
      };
    }

    const externalStatus = normalizeOptionalText(mercadoPagoPayment.status);
    const externalReference = normalizeOptionalText(mercadoPagoPayment.external_reference);
    const paidAt =
      normalizeOptionalText(mercadoPagoPayment.date_approved) ||
      normalizeOptionalText(mercadoPagoPayment.date_last_updated) ||
      new Date().toISOString();

    if (!isExternalPaymentPaid(externalStatus)) {
      return {
        received: true,
        matched: Boolean(localPayment) || Boolean(externalReference),
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: String(localPayment?.status || '').trim().toLowerCase() === 'paid',
        externalId,
        ignoredReason: 'status_nao_aprovado',
      };
    }

    if (!externalReference) {
      logError(
        'paymentWebhooksService.processMercadoPagoPaymentWebhook.missingExternalReference',
        new Error('Pagamento aprovado sem external_reference'),
        {
          externalId,
          externalStatus,
        }
      );

      return {
        received: true,
        matched: Boolean(localPayment),
        paymentUpdated: false,
        orderUpdated: false,
        alreadyPaid: String(localPayment?.status || '').trim().toLowerCase() === 'paid',
        externalId,
        ignoredReason: 'external_reference_ausente',
      };
    }

    const matchedPayment =
      localPayment ||
      (await findPaymentByExternalReference(externalReference));

    let paymentUpdated = false;
    if (matchedPayment && String(matchedPayment.status || '').trim().toLowerCase() !== 'paid') {
      await updatePaymentStatus({
        id: matchedPayment.id,
        tenant_id: matchedPayment.tenant_id,
        status: 'paid',
        paid_at: paidAt,
        external_reference: externalReference,
      });
      paymentUpdated = true;
    }

    if (matchedPayment) {
      logInfo('paymentWebhooksService.processMercadoPagoPaymentWebhook.paymentFound', {
        externalId,
        externalReference,
        paymentId: matchedPayment.id,
        orderId: matchedPayment.order_id,
        tenantId: matchedPayment.tenant_id,
        paymentUpdated,
      });
    }

    const order =
      (await findOrderByExternalReference(externalReference)) ||
      (matchedPayment
        ? await q1<OrderLookupRow>(
            'SELECT id, tenant_id, pagamento_status FROM pedidos WHERE id=? AND tenant_id=?',
            [matchedPayment.order_id, matchedPayment.tenant_id]
          )
        : null);

    if (!order) {
      logError(
        'paymentWebhooksService.processMercadoPagoPaymentWebhook.orderNotFound',
        new Error('Pedido nao encontrado para pagamento aprovado'),
        {
          externalId,
          externalReference,
          paymentId: matchedPayment?.id ?? null,
        }
      );

      return {
        received: true,
        matched: false,
        paymentUpdated,
        orderUpdated: false,
        alreadyPaid: false,
        externalId,
        ignoredReason: 'pedido_nao_encontrado',
      };
    }

    const alreadyPaid = isOrderPaid(order.pagamento_status);

    if (!alreadyPaid) {
      await confirmOrderPayment({
        orderId: Number(order.id),
        tenantId: Number(order.tenant_id),
        emitWhatsAppPaymentConfirmed: true,
        source: 'paymentWebhooksService.processMercadoPagoPaymentWebhook',
      });
    }

    logInfo('paymentWebhooksService.processMercadoPagoPaymentWebhook.orderUpdated', {
      externalId,
      externalReference,
      orderId: Number(order.id),
      tenantId: Number(order.tenant_id),
      paymentUpdated,
      orderUpdated: !alreadyPaid,
      alreadyPaid,
    });

    return {
      received: true,
      matched: true,
      paymentUpdated,
      orderUpdated: !alreadyPaid,
      alreadyPaid,
      externalId,
    };
  } catch (error) {
    logError('paymentWebhooksService.processMercadoPagoPaymentWebhook', error, {
      externalId,
      queryDataId: input.queryDataId,
    });
    throw error;
  }
}
