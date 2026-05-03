export type PixProviderName = 'mercado_pago' | 'itau';

export type CreatePixProviderPaymentInput = {
  tenantId: number;
  orderId: number;
  amount: number;
  accessToken: string;
  apiKey?: string | null;
  pixKey?: string | null;
  itauTlsCertPem?: string | null;
  itauTlsKeyPem?: string | null;
  itauTlsCaPem?: string | null;
  itauApiBaseUrl?: string | null;
  itauTokenUrl?: string | null;
  externalReference: string;
  description: string;
  payerName?: string | null;
  payerEmail?: string | null;
  payerDocument?: string | null;
  sandbox?: boolean;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
};

export type CreatePixProviderPaymentResult = {
  provider: PixProviderName;
  external_id: string | null;
  external_reference: string | null;
  status: string;
  qr_code_text: string | null;
  qr_code_base64: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
};

export type GetPixProviderPaymentStatusInput = {
  provider: PixProviderName;
  externalId: string;
  accessToken: string;
  apiKey?: string | null;
  pixKey?: string | null;
  itauTlsCertPem?: string | null;
  itauTlsKeyPem?: string | null;
  itauTlsCaPem?: string | null;
  itauApiBaseUrl?: string | null;
  itauTokenUrl?: string | null;
  sandbox?: boolean;
};

export type GetPixProviderPaymentStatusResult = {
  provider: PixProviderName;
  external_id: string;
  status: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown>;
};

import {
  createMercadoPagoPixPayment,
  getMercadoPagoPixPaymentStatus,
} from './mercadoPagoProvider';
import { getItauPixPaymentStatus } from './itauProvider';

export { createMercadoPagoPixPayment, getMercadoPagoPixPaymentStatus };
export {
  createItauPixPayment,
  getItauPixPaymentStatus,
  ensureItauWebhookRegistered,
  testItauAuthentication,
} from './itauProvider';

export async function getPaymentStatus(
  input: GetPixProviderPaymentStatusInput
): Promise<GetPixProviderPaymentStatusResult> {
  switch (input.provider) {
    case 'mercado_pago':
      return getMercadoPagoPixPaymentStatus(input);
    case 'itau':
      return getItauPixPaymentStatus({
        externalId: input.externalId,
        config: {
          clientId: input.apiKey ?? null,
          clientSecret: input.accessToken,
          pixKey: input.pixKey ?? null,
          sandbox: Boolean(input.sandbox),
          apiBaseUrl: input.itauApiBaseUrl ?? null,
          tokenUrl: input.itauTokenUrl ?? null,
          tls: {
            certPem: input.itauTlsCertPem ?? null,
            keyPem: input.itauTlsKeyPem ?? null,
            caPem: input.itauTlsCaPem ?? null,
          },
        },
      });
    default:
      throw new Error(`Provider de pagamento nao suportado: ${input.provider}`);
  }
}
