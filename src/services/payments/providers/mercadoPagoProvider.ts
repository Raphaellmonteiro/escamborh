import { AppError } from '../../../utils/errors';
import type {
  CreatePixProviderPaymentInput,
  CreatePixProviderPaymentResult,
  GetPixProviderPaymentStatusInput,
  GetPixProviderPaymentStatusResult,
} from './index';

const MERCADO_PAGO_API_BASE_URL = 'https://api.mercadopago.com';
const DEFAULT_PIX_EXPIRATION_MINUTES = 30;

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function buildDefaultPayerEmail(input: CreatePixProviderPaymentInput) {
  return `pedido-${input.tenantId}-${input.orderId}@flowpdv.local`;
}

function buildPixExpirationIso(rawExpiresAt?: string | null) {
  const provided = normalizeOptionalText(rawExpiresAt);
  if (provided) return provided;

  const expiresAt = new Date(Date.now() + (DEFAULT_PIX_EXPIRATION_MINUTES * 60 * 1000));
  return expiresAt.toISOString();
}

export async function createMercadoPagoPixPayment(
  input: CreatePixProviderPaymentInput
): Promise<CreatePixProviderPaymentResult> {
  const accessToken = normalizeOptionalText(input.accessToken);
  if (!accessToken) {
    throw new AppError('Access token do Mercado Pago nao configurado', 400);
  }

  const payerEmail = normalizeOptionalText(input.payerEmail) || buildDefaultPayerEmail(input);
  const payerName = normalizeOptionalText(input.payerName) || 'Cliente';
  const expiresAt = buildPixExpirationIso(input.expiresAt);

  const response = await fetch(`${MERCADO_PAGO_API_BASE_URL}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${input.tenantId}-${input.orderId}-pix`,
    },
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description,
      payment_method_id: 'pix',
      external_reference: input.externalReference,
      date_of_expiration: expiresAt,
      payer: {
        email: payerEmail,
        first_name: payerName.slice(0, 120),
      },
    }),
  });

  const responseText = await response.text();
  let payload: any = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage =
      normalizeOptionalText(payload?.message) ||
      normalizeOptionalText(payload?.error) ||
      normalizeOptionalText(responseText) ||
      `HTTP ${response.status}`;

    throw new AppError(`Falha ao gerar Pix no Mercado Pago: ${apiMessage}`, 502);
  }

  const transactionData = payload?.point_of_interaction?.transaction_data ?? {};
  const externalId = normalizeOptionalText(payload?.id);
  const qrCodeText = normalizeOptionalText(transactionData?.qr_code);

  if (!externalId || !qrCodeText) {
    throw new AppError('Mercado Pago nao retornou dados suficientes do Pix', 502);
  }

  return {
    provider: 'mercado_pago',
    external_id: externalId,
    external_reference: normalizeOptionalText(payload?.external_reference) || input.externalReference,
    status: normalizeOptionalText(payload?.status) || 'pending',
    qr_code_text: qrCodeText,
    qr_code_base64: normalizeOptionalText(transactionData?.qr_code_base64),
    expires_at: normalizeOptionalText(payload?.date_of_expiration) || expiresAt,
    metadata: {
      api: 'mercado_pago',
      live_mode: Boolean(payload?.live_mode),
      sandbox: Boolean(input.sandbox),
    },
  };
}

export async function getMercadoPagoPixPaymentStatus(
  input: GetPixProviderPaymentStatusInput
): Promise<GetPixProviderPaymentStatusResult> {
  const accessToken = normalizeOptionalText(input.accessToken);
  const externalId = normalizeOptionalText(input.externalId);

  if (!accessToken) {
    throw new AppError('Access token do Mercado Pago nao configurado', 400);
  }

  if (!externalId) {
    throw new AppError('External ID do pagamento invalido', 400);
  }

  const response = await fetch(
    `${MERCADO_PAGO_API_BASE_URL}/v1/payments/${encodeURIComponent(externalId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const responseText = await response.text();
  let payload: any = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage =
      normalizeOptionalText(payload?.message) ||
      normalizeOptionalText(payload?.error) ||
      normalizeOptionalText(responseText) ||
      `HTTP ${response.status}`;

    throw new AppError(`Falha ao consultar pagamento no Mercado Pago: ${apiMessage}`, 502);
  }

  return {
    provider: 'mercado_pago',
    external_id: externalId,
    status: normalizeOptionalText(payload?.status),
    paid_at:
      normalizeOptionalText(payload?.date_approved) ||
      normalizeOptionalText(payload?.date_last_updated),
    metadata: {
      api: 'mercado_pago',
      live_mode: Boolean(payload?.live_mode),
      sandbox: Boolean(input.sandbox),
    },
  };
}
