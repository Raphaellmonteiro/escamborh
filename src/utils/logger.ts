import { redactAuditText, redactAuditValue } from './auditRedaction';

type LogMeta = Record<string, unknown>;

function sanitize(value: unknown): unknown {
  return redactAuditValue(value);
}

export function logError(context: string, error: unknown, meta: LogMeta = {}) {
  const timestamp = new Date().toISOString();
  const safeMeta = sanitize(meta);

  if (error instanceof Error) {
    console.error({
      level: 'error',
      timestamp,
      context,
      message: redactAuditText(error.message),
      stack: redactAuditText(error.stack),
      meta: safeMeta,
    });
    return;
  }

  console.error({
    level: 'error',
    timestamp,
    context,
    message: redactAuditText(String(error)),
    meta: safeMeta,
  });
}

export function logInfo(context: string, meta: LogMeta = {}) {
  const timestamp = new Date().toISOString();
  const safeMeta = sanitize(meta);

  console.info({
    level: 'info',
    timestamp,
    context,
    meta: safeMeta,
  });
}
