import { q1 } from '../db';
import type { OrderPaymentRecord } from '../types/order';
import { AppError } from '../utils/errors';
import { confirmOrderPayment } from './ordersService';
import { getPaymentStatus } from './payments/providers';
import {
  getPaymentByExternalId,
  getPaymentByOrderId,
  getTenantPaymentProviderConfig,
  updatePaymentStatus,
} from './paymentsService';

export type RevalidatePixPaymentResult = {
  matched: boolean;
  paymentUpdated: boolean;
  orderUpdated: boolean;
  alreadyPaid: boolean;
  externalId: string | null;
  externalStatus: string | null;
  internalStatus: string | null;
  paidAt: string | null;
  orderId: number | null;
  paymentId: number | null;
};

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function isExternalPaymentPaid(status: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'approved' || normalized === 'paid';
}

function isPixPayment(payment: OrderPaymentRecord) {
  return String(payment.method || '').trim().toLowerCase() === 'pix';
}

async function finalizePaidPixPayment(
  payment: OrderPaymentRecord,
  paidStatus: string | null,
  alreadyPaid: boolean,
  paidAt: string
): Promise<RevalidatePixPaymentResult> {
  let paymentUpdated = false;

  if (!alreadyPaid) {
    await updatePaymentStatus({
      id: payment.id,
      tenant_id: payment.tenant_id,
      status: 'paid',
      paid_at: paidAt,
    });
    paymentUpdated = true;
  }

  const orderBefore = await q1<{ pagamento_status?: string | null }>(
    'SELECT pagamento_status FROM pedidos WHERE id=? AND tenant_id=?',
    [payment.order_id, payment.tenant_id]
  );

  const orderWasPaid =
    String(orderBefore?.pagamento_status || '').trim().toLowerCase() === 'pago';

  if (!orderWasPaid) {
    await confirmOrderPayment({
      orderId: payment.order_id,
      tenantId: payment.tenant_id,
      emitWhatsAppPaymentConfirmed: true,
      source: 'pixPaymentRevalidationService.finalizePaidPixPayment',
    });
  }

  return {
    matched: true,
    paymentUpdated,
    orderUpdated: !orderWasPaid,
    alreadyPaid,
    externalId: normalizeOptionalText(payment.external_id),
    externalStatus: paidStatus,
    internalStatus: normalizeOptionalText(payment.status),
    paidAt,
    orderId: payment.order_id,
    paymentId: payment.id,
  };
}

async function revalidatePixPaymentRecord(
  payment: OrderPaymentRecord
): Promise<RevalidatePixPaymentResult> {
  const externalId = normalizeOptionalText(payment.external_id);
  const provider = normalizeOptionalText(payment.provider);
  const internalStatus = normalizeOptionalText(payment.status);

  if (!externalId) {
    throw new AppError('Pagamento PIX sem external_id para revalidacao', 400);
  }

  if (provider !== 'mercado_pago') {
    throw new AppError('Provider PIX nao suportado para revalidacao', 400);
  }

  const providerConfig = await getTenantPaymentProviderConfig(payment.tenant_id);
  const alreadyPaid = internalStatus === 'paid';

  if (isExternalPaymentPaid(internalStatus)) {
    return finalizePaidPixPayment(
      payment,
      internalStatus,
      alreadyPaid,
      normalizeOptionalText(payment.paid_at) || new Date().toISOString()
    );
  }

  if (providerConfig.provider !== 'mercado_pago' || !providerConfig.accessToken) {
    throw new AppError('Configuracao do Mercado Pago nao encontrada para o tenant', 400);
  }

  const providerPayment = await getPaymentStatus({
    provider: 'mercado_pago',
    externalId,
    accessToken: providerConfig.accessToken,
    sandbox: providerConfig.sandbox,
  });

  const externalStatus = normalizeOptionalText(providerPayment.status);

  if (!isExternalPaymentPaid(externalStatus)) {
    return {
      matched: true,
      paymentUpdated: false,
      orderUpdated: false,
      alreadyPaid,
      externalId,
      externalStatus,
      internalStatus,
      paidAt: payment.paid_at ?? normalizeOptionalText(providerPayment.paid_at),
      orderId: payment.order_id,
      paymentId: payment.id,
    };
  }

  const paidAt =
    normalizeOptionalText(providerPayment.paid_at) ||
    normalizeOptionalText(payment.paid_at) ||
    new Date().toISOString();

  return finalizePaidPixPayment(payment, externalStatus, alreadyPaid, paidAt);
}

export async function revalidatePixPaymentByExternalId(input: {
  externalId: string;
  provider?: string | null;
}): Promise<RevalidatePixPaymentResult> {
  const externalId = normalizeOptionalText(input.externalId);

  if (!externalId) {
    throw new AppError('External ID invalido', 400);
  }

  const payment = await getPaymentByExternalId({
    externalId,
    provider: normalizeOptionalText(input.provider) || 'mercado_pago',
  });

  if (!payment) {
    return {
      matched: false,
      paymentUpdated: false,
      orderUpdated: false,
      alreadyPaid: false,
      externalId,
      externalStatus: null,
      internalStatus: null,
      paidAt: null,
      orderId: null,
      paymentId: null,
    };
  }

  return revalidatePixPaymentRecord(payment);
}

export async function revalidatePixPaymentByOrder(input: {
  orderId: number | string;
  tenantId: number | string;
}): Promise<RevalidatePixPaymentResult> {
  const payments = await getPaymentByOrderId({
    orderId: input.orderId,
    tenantId: input.tenantId,
  });

  const payment =
    payments.find((item) => isPixPayment(item) && normalizeOptionalText(item.external_id)) || null;

  if (!payment) {
    throw new AppError('Pagamento PIX com external_id nao encontrado para este pedido', 404);
  }

  return revalidatePixPaymentRecord(payment);
}
