// src/utils/logger.ts
type LogMeta = Record<string, unknown>;

const SENSITIVE_KEYS = new Set([
  'senha',
  'subsenha',
  'password',
  'token',
  'authorization',
  'jwt',
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, currentValue] of Object.entries(input)) {
      output[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : sanitize(currentValue);
    }

    return output;
  }

  return value;
}

export function logError(context: string, error: unknown, meta: LogMeta = {}) {
  const timestamp = new Date().toISOString();
  const safeMeta = sanitize(meta);

  if (error instanceof Error) {
    console.error({
      level: 'error',
      timestamp,
      context,
      message: error.message,
      stack: error.stack,
      meta: safeMeta,
    });
    return;
  }

  console.error({
    level: 'error',
    timestamp,
    context,
    message: String(error),
    meta: safeMeta,
  });
}
