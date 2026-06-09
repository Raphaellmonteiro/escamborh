import { logError, logInfo } from '../utils/logger';
import { revalidatePixPaymentByExternalId } from './pixPaymentRevalidationService';

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function extractTxidsFromPayload(payload: unknown): string[] {
  if (!payload) return [];

  if (typeof payload === 'string') {
    const txid = normalizeOptionalText(payload);
    return txid ? [txid] : [];
  }

  if (Array.isArray(payload)) {
    return payload
      .flatMap((item) => extractTxidsFromPayload(item))
      .filter(Boolean);
  }

  if (typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;

  const direct = normalizeOptionalText(record.txid);
  if (direct) return [direct];

  const pix = record.pix;
  if (Array.isArray(pix)) {
    const txids = pix
      .map((item) =>
        item && typeof item === 'object'
          ? normalizeOptionalText((item as any).txid)
          : null
      )
      .filter((value): value is string => Boolean(value));
    if (txids.length > 0) return txids;
  }

  const dataTxid = normalizeOptionalText((record.data as any)?.txid);
  if (dataTxid) return [dataTxid];

  const nested = [
    (record.cobranca as any)?.txid,
    (record.cob as any)?.txid,
    (record.payment as any)?.txid,
  ]
    .map(normalizeOptionalText)
    .filter((value): value is string => Boolean(value));

  return nested;
}

export type ProcessItauPixWebhookInput = {
  payload: unknown;
  path: string;
  method: string;
};

export type ProcessItauPixWebhookResult = {
  received: true;
  txids: string[];
  revalidated: number;
  matched: number;
};

export async function processItauPixWebhook(
  input: ProcessItauPixWebhookInput
): Promise<ProcessItauPixWebhookResult> {
  const txids = Array.from(new Set(extractTxidsFromPayload(input.payload))).slice(0, 20);

  logInfo('itauPaymentWebhooksService.received', {
    path: input.path,
    method: input.method,
    txidsCount: txids.length,
  });

  let revalidated = 0;
  let matched = 0;

  for (const txid of txids) {
    try {
      const result = await revalidatePixPaymentByExternalId({
        externalId: txid,
        provider: 'itau',
      });
      revalidated += 1;
      if (result.matched) matched += 1;
    } catch (error) {
      logError('itauPaymentWebhooksService.revalidate', error, { txid });
    }
  }

  return {
    received: true,
    txids,
    revalidated,
    matched,
  };
}

