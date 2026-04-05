import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/errors';
import { revalidatePixPaymentByExternalId } from './pixPaymentRevalidationService';

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
    throw new AppError('Assinatura do webhook invalida', 401);
  }

  const manifest = `id:${input.externalId.toLowerCase()};request-id:${requestId};ts:${signature.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  if (!secureStringEqual(signature.v1, expected)) {
    throw new AppError('Assinatura do webhook invalida', 401);
  }
}

function isExternalPaymentPaid(status: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'approved' || normalized === 'paid';
}

export async function processMercadoPagoPaymentWebhook(
  input: ProcessMercadoPagoWebhookInput
): Promise<ProcessMercadoPagoWebhookResult> {
  const payload =
    input.payload && typeof input.payload === 'object'
      ? (input.payload as MercadoPagoWebhookPayload)
      : null;

  if (!payload) {
    throw new AppError('Payload do webhook invalido', 400);
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

  const externalId = extractMercadoPagoExternalId(payload, input.queryDataId);

  if (!externalId) {
    throw new AppError('Payload do webhook sem data.id', 400);
  }

  validateMercadoPagoSignature({
    secret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
    externalId,
    headers: input.headers,
  });

  const result = await revalidatePixPaymentByExternalId({
    externalId,
    provider: 'mercado_pago',
  });

  if (!result.matched) {
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

  if (!isExternalPaymentPaid(result.externalStatus)) {
    return {
      received: true,
      matched: true,
      paymentUpdated: false,
      orderUpdated: false,
      alreadyPaid: result.alreadyPaid,
      externalId,
      ignoredReason: 'status_nao_aprovado',
    };
  }

  return {
    received: true,
    matched: true,
    paymentUpdated: result.paymentUpdated,
    orderUpdated: result.orderUpdated,
    alreadyPaid: result.alreadyPaid,
    externalId,
  };
}
