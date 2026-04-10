export type PixProviderName = 'mercado_pago';

export type CreatePixProviderPaymentInput = {
  tenantId: number;
  orderId: number;
  amount: number;
  accessToken: string;
  externalReference: string;
  description: string;
  payerName?: string | null;
  payerEmail?: string | null;
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

export { createMercadoPagoPixPayment, getMercadoPagoPixPaymentStatus };

export async function getPaymentStatus(
  input: GetPixProviderPaymentStatusInput
): Promise<GetPixProviderPaymentStatusResult> {
  switch (input.provider) {
    case 'mercado_pago':
      return getMercadoPagoPixPaymentStatus(input);
    default:
      throw new Error(`Provider de pagamento nao suportado: ${input.provider}`);
  }
}
