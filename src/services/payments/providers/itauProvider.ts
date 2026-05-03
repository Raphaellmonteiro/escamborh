import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { AppError } from '../../../utils/errors';
import { logError, logInfo } from '../../../utils/logger';
import type {
  CreatePixProviderPaymentResult,
  GetPixProviderPaymentStatusResult,
} from './index';

type ItauTlsConfig = {
  certPem: string | null;
  keyPem: string | null;
  caPem: string | null;
};

export type ItauProviderConfig = {
  clientId: string | null;
  clientSecret: string | null;
  pixKey: string | null;
  sandbox: boolean;
  apiBaseUrl?: string | null;
  tokenUrl?: string | null;
  tls?: Partial<ItauTlsConfig> | null;
};

export type CreateItauPixPaymentInput = {
  tenantId: number;
  orderId: number;
  amount: number;
  externalReference: string;
  description: string;
  payerName?: string | null;
  payerDocument?: string | null;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
  config: ItauProviderConfig;
};

export type GetItauPixPaymentStatusInput = {
  externalId: string;
  config: ItauProviderConfig;
};

type ItauOauthTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
};

type ItauCobResponse = {
  status?: unknown;
  calendario?: { criacao?: unknown; expiracao?: unknown } | null;
  pix?: Array<{ horario?: unknown }> | null;
};

type ItauQrCodeResponse = {
  pix_link?: unknown;
  emv?: unknown;
  imagem_base64?: unknown;
};

const ITAU_DEFAULT_SANDBOX_API_BASE_URL =
  'https://devportal.itau.com.br/sandboxapi/pix_recebimentos_ext_v2/v2';
const ITAU_DEFAULT_PROD_API_BASE_URL = 'https://secure.api.itau/pix_recebimentos/v2';
const ITAU_DEFAULT_SANDBOX_TOKEN_URL = 'https://api.itau.com.br/sandbox/api/oauth/token';
const ITAU_DEFAULT_PROD_TOKEN_URL = 'https://sts.itau.com.br/api/oauth/token';

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeOptionalUrl(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function readFileIfExists(pathOrPem: string) {
  try {
    if (pathOrPem.includes('\n') || pathOrPem.includes('-----BEGIN')) {
      return pathOrPem;
    }
    if (fs.existsSync(pathOrPem)) {
      return fs.readFileSync(pathOrPem, 'utf8');
    }
  } catch {
    // ignore
  }
  return pathOrPem;
}

function normalizeTlsConfig(input?: Partial<ItauTlsConfig> | null): ItauTlsConfig {
  return {
    certPem: normalizeOptionalText(input?.certPem),
    keyPem: normalizeOptionalText(input?.keyPem),
    caPem: normalizeOptionalText(input?.caPem),
  };
}

function resolveApiBaseUrl(config: ItauProviderConfig) {
  return (
    normalizeOptionalUrl(config.apiBaseUrl) ||
    (config.sandbox ? ITAU_DEFAULT_SANDBOX_API_BASE_URL : ITAU_DEFAULT_PROD_API_BASE_URL)
  );
}

function resolveTokenUrl(config: ItauProviderConfig) {
  return (
    normalizeOptionalUrl(config.tokenUrl) ||
    (config.sandbox ? ITAU_DEFAULT_SANDBOX_TOKEN_URL : ITAU_DEFAULT_PROD_TOKEN_URL)
  );
}

async function getUndici(): Promise<{
  fetch: typeof fetch;
  Agent: any;
}> {
  try {
    const mod = (await import('undici')) as any;
    return { fetch: mod.fetch, Agent: mod.Agent };
  } catch (error) {
    throw new AppError(
      'Dependencia ausente para integrar com Itaú (instale undici)',
      500
    );
  }
}

function buildItauDispatcher(config: ItauProviderConfig) {
  const tls = normalizeTlsConfig(config.tls ?? null);
  const certPem = tls.certPem ? readFileIfExists(tls.certPem) : null;
  const keyPem = tls.keyPem ? readFileIfExists(tls.keyPem) : null;
  const caPem = tls.caPem ? readFileIfExists(tls.caPem) : null;

  // Sandbox do Itaú normalmente não exige mTLS. Produção exige.
  if (!config.sandbox && (!certPem || !keyPem)) {
    throw new AppError(
      'Certificado TLS do Itaú não configurado (cert/key) para produção',
      400
    );
  }

  if (!certPem || !keyPem) {
    return null;
  }

  return { certPem, keyPem, caPem };
}

async function itauFetchJson(input: {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string | null;
  config: ItauProviderConfig;
}): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const { fetch, Agent } = await getUndici();

  const dispatcherTls = buildItauDispatcher(input.config);
  const dispatcher = dispatcherTls
    ? new Agent({
        connect: {
          cert: dispatcherTls.certPem,
          key: dispatcherTls.keyPem,
          ca: dispatcherTls.caPem ?? undefined,
        },
      })
    : undefined;

  const correlationId = randomUUID();
  const baseHeaders: Record<string, string> = {
    'x-itau-flowID': 'flowpdv',
    'x-itau-correlationID': correlationId,
    ...(input.headers ?? {}),
  };

  const response = await fetch(input.url, {
    method: input.method,
    headers: baseHeaders,
    body: input.body ?? undefined,
    dispatcher,
  } as any);

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { ok: response.ok, status: response.status, json, text };
}

async function getItauAccessToken(config: ItauProviderConfig): Promise<string> {
  const clientId = normalizeOptionalText(config.clientId);
  const clientSecret = normalizeOptionalText(config.clientSecret);
  if (!clientId || !clientSecret) {
    throw new AppError('client_id/client_secret do Itaú não configurados', 400);
  }

  const tokenUrl = resolveTokenUrl(config);
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);

  const response = await itauFetchJson({
    url: tokenUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    config,
  });

  const payload = response.json as ItauOauthTokenResponse | null;
  const token = normalizeOptionalText(payload?.access_token);

  if (!response.ok || !token) {
    logError(
      'itauProvider.getAccessToken',
      new Error(`Itaú token retornou HTTP ${response.status}`),
      {
        sandbox: config.sandbox,
        tokenUrl,
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        response: {
          status: response.status,
          body_preview: normalizeOptionalText(response.text)?.slice(0, 800) ?? null,
        },
      }
    );

    throw new AppError(
      `Falha ao autenticar no Itaú (HTTP ${response.status})`,
      502
    );
  }

  return token;
}

export async function testItauAuthentication(config: ItauProviderConfig): Promise<void> {
  void (await getItauAccessToken(config));
}

function parseExpiresInSeconds(expiresAtIso: string | null) {
  if (!expiresAtIso) return null;
  const ms = Date.parse(expiresAtIso);
  if (!Number.isFinite(ms)) return null;
  const diff = Math.floor((ms - Date.now()) / 1000);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return diff;
}

function generateItauTxid(input: { tenantId: number; orderId: number; idempotencyKey?: string | null }) {
  const seed = normalizeOptionalText(input.idempotencyKey) || `${input.tenantId}:${input.orderId}:pix`;
  const digest = createHash('sha256').update(seed).digest('hex'); // 64 chars
  // txid dinâmico: 26..35 alfanumérico. Hex é permitido.
  return `fp${digest.slice(0, 32)}`; // 34 chars
}

function mapItauCobStatusToInternal(status: string | null) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'CONCLUIDA') return 'paid';
  if (normalized === 'ATIVA') return 'pending';
  if (normalized.startsWith('REMOVIDA')) return 'cancelled';
  return normalized ? normalized.toLowerCase() : 'pending';
}

function extractPaidAtFromCob(payload: ItauCobResponse | null) {
  const pix = Array.isArray(payload?.pix) ? payload!.pix : [];
  const last = pix.length > 0 ? pix[pix.length - 1] : null;
  return normalizeOptionalText(last?.horario);
}

export async function createItauPixPayment(
  input: CreateItauPixPaymentInput
): Promise<CreatePixProviderPaymentResult> {
  const apiBaseUrl = resolveApiBaseUrl(input.config);
  const pixKey = normalizeOptionalText(input.config.pixKey);

  if (!pixKey) {
    throw new AppError('Chave Pix (DICT) do Itaú não configurada', 400);
  }

  const txid = generateItauTxid({
    tenantId: input.tenantId,
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const expiresInSeconds =
    parseExpiresInSeconds(normalizeOptionalText(input.expiresAt)) ?? 30 * 60;
  const resolvedExpiresAt =
    normalizeOptionalText(input.expiresAt) ||
    new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const accessToken = await getItauAccessToken(input.config);

  const cobBody = {
    calendario: { expiracao: String(expiresInSeconds) },
    valor: { original: Number(input.amount).toFixed(2) },
    chave: pixKey,
    solicitacaoPagador: String(input.description || '').slice(0, 140),
    ...(normalizeOptionalText(input.payerName)
      ? { devedor: { nome: String(input.payerName).slice(0, 200) } }
      : {}),
  };

  const cobResponse = await itauFetchJson({
    url: `${apiBaseUrl}/cob/${encodeURIComponent(txid)}`,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cobBody),
    config: input.config,
  });

  if (!cobResponse.ok) {
    logError(
      'itauProvider.createPixPayment.putCob',
      new Error(`Itaú PUT /cob/{txid} retornou HTTP ${cobResponse.status}`),
      {
        tenantId: input.tenantId,
        orderId: input.orderId,
        txid,
        sandbox: input.config.sandbox,
        apiBaseUrl,
        response: {
          status: cobResponse.status,
          body_preview: normalizeOptionalText(cobResponse.text)?.slice(0, 1000) ?? null,
        },
      }
    );
    throw new AppError(
      `Falha ao criar cobrança Pix no Itaú (HTTP ${cobResponse.status})`,
      502
    );
  }

  const qrResponse = await itauFetchJson({
    url: `${apiBaseUrl}/cob/${encodeURIComponent(txid)}/qrcode`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    config: input.config,
  });

  if (!qrResponse.ok) {
    logError(
      'itauProvider.createPixPayment.getQrCode',
      new Error(`Itaú GET /cob/{txid}/qrcode retornou HTTP ${qrResponse.status}`),
      {
        tenantId: input.tenantId,
        orderId: input.orderId,
        txid,
        sandbox: input.config.sandbox,
        apiBaseUrl,
        response: {
          status: qrResponse.status,
          body_preview: normalizeOptionalText(qrResponse.text)?.slice(0, 1000) ?? null,
        },
      }
    );
    throw new AppError(
      `Cobrança criada, mas falhou ao obter QR Code no Itaú (HTTP ${qrResponse.status})`,
      502
    );
  }

  const qrPayload = (qrResponse.json || null) as ItauQrCodeResponse | null;
  const emv = normalizeOptionalText(qrPayload?.emv);
  const imgBase64 = normalizeOptionalText(qrPayload?.imagem_base64);

  if (!emv || !imgBase64) {
    throw new AppError('Itaú não retornou EMV/QR code base64', 502);
  }

  logInfo('itauProvider.createPixPayment.success', {
    tenantId: input.tenantId,
    orderId: input.orderId,
    txid,
    sandbox: input.config.sandbox,
    apiBaseUrl,
  });

  return {
    provider: 'itau',
    external_id: txid,
    external_reference: normalizeOptionalText(input.externalReference) || null,
    status: 'pending',
    qr_code_text: emv,
    qr_code_base64: imgBase64,
    expires_at: resolvedExpiresAt,
    metadata: {
      api: 'itau_pix_recebimentos',
      sandbox: Boolean(input.config.sandbox),
      pix_link: normalizeOptionalText(qrPayload?.pix_link),
    },
  };
}

export async function getItauPixPaymentStatus(
  input: GetItauPixPaymentStatusInput
): Promise<GetPixProviderPaymentStatusResult> {
  const txid = normalizeOptionalText(input.externalId);
  if (!txid) {
    throw new AppError('External ID do pagamento inválido', 400);
  }

  const apiBaseUrl = resolveApiBaseUrl(input.config);
  const accessToken = await getItauAccessToken(input.config);

  const response = await itauFetchJson({
    url: `${apiBaseUrl}/cob/${encodeURIComponent(txid)}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    config: input.config,
  });

  if (!response.ok) {
    throw new AppError(
      `Falha ao consultar cobrança no Itaú (HTTP ${response.status})`,
      502
    );
  }

  const cob = (response.json || null) as ItauCobResponse | null;
  const externalStatus = normalizeOptionalText(cob?.status);
  const paidAt = extractPaidAtFromCob(cob);

  return {
    provider: 'itau',
    external_id: txid,
    status: mapItauCobStatusToInternal(externalStatus),
    paid_at: paidAt,
    metadata: {
      api: 'itau_pix_recebimentos',
      raw_status: externalStatus,
      sandbox: Boolean(input.config.sandbox),
    },
  };
}

export async function ensureItauWebhookRegistered(input: {
  config: ItauProviderConfig;
  webhookBaseUrl: string;
}): Promise<{ ok: boolean; message: string }> {
  const pixKey = normalizeOptionalText(input.config.pixKey);
  if (!pixKey) {
    return { ok: false, message: 'pix_key ausente para registrar webhook' };
  }

  const apiBaseUrl = resolveApiBaseUrl(input.config);
  const accessToken = await getItauAccessToken(input.config);
  const webhookUrl = `${input.webhookBaseUrl.replace(/\/+$/, '')}`;

  const response = await itauFetchJson({
    url: `${apiBaseUrl}/webhook/${encodeURIComponent(pixKey)}`,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ webhookUrl }),
    config: input.config,
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `Falha ao registrar webhook no Itaú (HTTP ${response.status})`,
    };
  }

  return { ok: true, message: 'Webhook registrado/atualizado no Itaú.' };
}
