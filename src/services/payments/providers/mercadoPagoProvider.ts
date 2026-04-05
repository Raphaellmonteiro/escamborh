import { AppError } from '../../../utils/errors';
import { logError, logInfo } from '../../../utils/logger';
import type {
  CreatePixProviderPaymentInput,
  CreatePixProviderPaymentResult,
  GetPixProviderPaymentStatusInput,
  GetPixProviderPaymentStatusResult,
} from './index';

const MERCADO_PAGO_API_BASE_URL = 'https://api.mercadopago.com';
const DEFAULT_PIX_EXPIRATION_MINUTES = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function buildDefaultPayerEmail(input: CreatePixProviderPaymentInput) {
  return `pedido-${input.tenantId}-${input.orderId}@example.com`;
}

function normalizeOptionalEmail(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  return EMAIL_REGEX.test(normalized) ? normalized.toLowerCase() : null;
}

function buildPixExpirationIso(rawExpiresAt?: string | null) {
  const provided = normalizeOptionalText(rawExpiresAt);
  if (provided) return provided;

  const expiresAt = new Date(Date.now() + (DEFAULT_PIX_EXPIRATION_MINUTES * 60 * 1000));
  return expiresAt.toISOString();
}

function maskSecret(value: string | null) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  if (normalized.length <= 8) return '[REDACTED]';
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

function maskEmail(value: string | null) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const [localPart, domainPart] = normalized.split('@');
  if (!localPart || !domainPart) return '[INVALID_EMAIL]';
  if (localPart.length <= 2) return `***@${domainPart}`;
  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function buildMercadoPagoResponseLog(
  payload: any,
  status: number,
  responseText: string
) {
  const transactionData = payload?.point_of_interaction?.transaction_data ?? {};
  const causes = Array.isArray(payload?.cause)
    ? payload.cause.map((item: any) => ({
        code: normalizeOptionalText(item?.code),
        description: normalizeOptionalText(item?.description),
        data: normalizeOptionalText(item?.data),
      }))
    : [];

  return {
    status,
    id: normalizeOptionalText(payload?.id),
    status_text: normalizeOptionalText(payload?.status),
    status_detail: normalizeOptionalText(payload?.status_detail),
    external_reference: normalizeOptionalText(payload?.external_reference),
    date_of_expiration: normalizeOptionalText(payload?.date_of_expiration),
    transaction_amount:
      typeof payload?.transaction_amount === 'number'
        ? payload.transaction_amount
        : null,
    live_mode:
      typeof payload?.live_mode === 'boolean' ? payload.live_mode : null,
    payer: {
      email_preview: maskEmail(normalizeOptionalText(payload?.payer?.email)),
    },
    pix: {
      qr_code_present: Boolean(normalizeOptionalText(transactionData?.qr_code)),
      qr_code_base64_present: Boolean(
        normalizeOptionalText(transactionData?.qr_code_base64)
      ),
    },
    error: normalizeOptionalText(payload?.error),
    message: normalizeOptionalText(payload?.message),
    causes,
    raw_response_preview: payload
      ? null
      : normalizeOptionalText(responseText)?.slice(0, 500) || null,
  };
}

function buildMercadoPagoApiErrorMessage(
  payload: any,
  responseText: string,
  status: number
) {
  const causes = Array.isArray(payload?.cause)
    ? payload.cause
        .map((item: any) => {
          const code = normalizeOptionalText(item?.code);
          const description = normalizeOptionalText(item?.description);
          const data = normalizeOptionalText(item?.data);
          return [code, description, data].filter(Boolean).join(' | ');
        })
        .filter(Boolean)
    : [];

  const details = [
    normalizeOptionalText(payload?.message),
    normalizeOptionalText(payload?.error),
    ...causes,
  ].filter(Boolean);

  if (details.length > 0) {
    return details.join(' || ');
  }

  return normalizeOptionalText(responseText) || `HTTP ${status}`;
}

export async function createMercadoPagoPixPayment(
  input: CreatePixProviderPaymentInput
): Promise<CreatePixProviderPaymentResult> {
  const accessToken = normalizeOptionalText(input.accessToken);
  if (!accessToken) {
    throw new AppError('Access token do Mercado Pago nao configurado', 400);
  }

  const rawProvidedPayerEmail = normalizeOptionalText(input.payerEmail);
  const providedPayerEmail = normalizeOptionalEmail(input.payerEmail);
  const payerEmail = providedPayerEmail || buildDefaultPayerEmail(input);
  const invalidProvidedPayerEmail = Boolean(
    rawProvidedPayerEmail && !providedPayerEmail
  );
  const payerName = normalizeOptionalText(input.payerName) || 'Cliente';
  const expiresAt = buildPixExpirationIso(input.expiresAt);
  const idempotencyKey = `${input.tenantId}-${input.orderId}-pix`;
  const requestBody = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: input.description,
    payment_method_id: 'pix',
    external_reference: input.externalReference,
    date_of_expiration: expiresAt,
    payer: {
      email: payerEmail,
      first_name: payerName.slice(0, 120),
    },
  };

  const response = await fetch(`${MERCADO_PAGO_API_BASE_URL}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let payload: any = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  const responseLog = buildMercadoPagoResponseLog(
    payload,
    response.status,
    responseText
  );

  if (!response.ok) {
    const apiMessage = buildMercadoPagoApiErrorMessage(payload, responseText, response.status);

    logError(
      'mercadoPagoProvider.createPixPayment',
      new Error(`Mercado Pago /v1/payments retornou HTTP ${response.status}`),
      {
        tenantId: input.tenantId,
        orderId: input.orderId,
        environment: input.sandbox ? 'teste' : 'producao',
        provider: 'mercado_pago',
        authorization_bearer_preview: accessToken ? `Bearer ${maskSecret(accessToken)}` : null,
        hasAuthorizationBearer: Boolean(accessToken),
        headers: {
          content_type: 'application/json',
          x_idempotency_key: idempotencyKey,
        },
        request: {
          transaction_amount: requestBody.transaction_amount,
          payment_method_id: requestBody.payment_method_id,
          external_reference: requestBody.external_reference,
          date_of_expiration: requestBody.date_of_expiration,
          payer: {
            email_preview: maskEmail(requestBody.payer.email),
            first_name: requestBody.payer.first_name,
            used_fallback_email: !providedPayerEmail,
            invalid_provided_email: invalidProvidedPayerEmail,
          },
        },
        response: responseLog,
      }
    );

    throw new AppError(`Falha ao gerar Pix no Mercado Pago (HTTP ${response.status}): ${apiMessage}`, 502);
  }

  const transactionData = payload?.point_of_interaction?.transaction_data ?? {};
  const externalId = normalizeOptionalText(payload?.id);
  const qrCodeText = normalizeOptionalText(transactionData?.qr_code);

  logInfo('mercadoPagoProvider.createPixPayment.response', {
    tenantId: input.tenantId,
    orderId: input.orderId,
    environment: input.sandbox ? 'teste' : 'producao',
    provider: 'mercado_pago',
    request: {
      transaction_amount: requestBody.transaction_amount,
      payment_method_id: requestBody.payment_method_id,
      external_reference: requestBody.external_reference,
      date_of_expiration: requestBody.date_of_expiration,
      payer: {
        email_preview: maskEmail(requestBody.payer.email),
        first_name: requestBody.payer.first_name,
        used_fallback_email: !providedPayerEmail,
        invalid_provided_email: invalidProvidedPayerEmail,
      },
    },
    response: responseLog,
  });

  if (!externalId || !qrCodeText) {
    logError(
      'mercadoPagoProvider.createPixPayment.invalidSuccessPayload',
      new Error('Mercado Pago nao retornou dados suficientes do Pix'),
      {
        tenantId: input.tenantId,
        orderId: input.orderId,
        environment: input.sandbox ? 'teste' : 'producao',
        provider: 'mercado_pago',
        response: responseLog,
      }
    );
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
