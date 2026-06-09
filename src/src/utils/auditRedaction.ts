const FULL_REDACT_KEYS = new Set([
  'password',
  'pass',
  'pwd',
  'senha',
  'nova_senha',
  'senha_admin',
  'senha_caixa',
  'subsenha',
  'pin',
  'token',
  'authorization',
  'secret',
  'api_key',
  'apikey',
  'cvv',
  'cvc',
  'clientetoken',
  'bearer',
]);

const PII_MASK_KEYS = new Set([
  'email',
  'emails',
  'telefone',
  'telefones',
  'phone',
  'phones',
  'whatsapp',
  'cpf',
  'documento',
  'documento_numero',
  'customer_email',
  'customer_phone',
  'cliente_email',
  'cliente_tel',
  'cliente_telefone',
]);

const EMAIL_REGEX = /\b([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})\b/gi;
const CPF_REGEX = /(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;
const PHONE_REGEX = /(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}(?!\d)/g;
const BEARER_REGEX = /\bBearer\s+\S+/gi;
const JWT_REGEX = /\b[A-Za-z0-9\-_]{6,}\.[A-Za-z0-9\-_]{6,}\.[A-Za-z0-9\-_+/=]{6,}\b/g;

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function onlyDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

function maskEmail(value: string): string {
  const [localPart, domain] = value.split('@');
  if (!domain) return '[EMAIL]';
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible || '*'}***@${domain}`;
}

function maskCpf(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return '***.***.***-**';
  return `***.***.***-${digits.slice(-2)}`;
}

function maskPhone(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length < 8) return '[PHONE]';
  return `***${digits.slice(-4)}`;
}

function maskPiiString(value: string, keyHint?: string | null): string {
  const normalizedKey = keyHint ? normalizeKey(keyHint) : null;

  if (normalizedKey === 'email' || normalizedKey === 'customer_email' || normalizedKey === 'cliente_email') {
    return maskEmail(value);
  }

  if (
    normalizedKey === 'cpf' ||
    normalizedKey === 'documento' ||
    normalizedKey === 'documento_numero'
  ) {
    return maskCpf(value);
  }

  if (
    normalizedKey === 'telefone' ||
    normalizedKey === 'telefones' ||
    normalizedKey === 'phone' ||
    normalizedKey === 'phones' ||
    normalizedKey === 'whatsapp' ||
    normalizedKey === 'customer_phone' ||
    normalizedKey === 'cliente_tel' ||
    normalizedKey === 'cliente_telefone'
  ) {
    return maskPhone(value);
  }

  return redactAuditText(value);
}

function redactScalar(value: unknown, keyHint?: string | null): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const normalizedKey = keyHint ? normalizeKey(keyHint) : null;
    if (
      normalizedKey &&
      (FULL_REDACT_KEYS.has(normalizedKey) ||
        normalizedKey.includes('password') ||
        normalizedKey.includes('senha') ||
        normalizedKey.endsWith('_token'))
    ) {
      return '[REDACTED]';
    }
    if (normalizedKey && PII_MASK_KEYS.has(normalizedKey)) {
      return maskPiiString(value, normalizedKey);
    }
    return redactAuditText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function redactAuditText(value: string | null | undefined): string | null {
  if (value == null) return null;

  return String(value)
    .replace(BEARER_REGEX, 'Bearer [REDACTED]')
    .replace(EMAIL_REGEX, (match) => maskEmail(match))
    .replace(PHONE_REGEX, (match) => maskPhone(match))
    .replace(CPF_REGEX, (match) => maskCpf(match))
    .replace(JWT_REGEX, '[TOKEN]');
}

export function redactAuditValue<T = unknown>(value: T, keyHint?: string | null): T {
  const scalar = redactScalar(value, keyHint);
  if (scalar !== value) return scalar as T;

  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item)) as T;
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, currentValue] of Object.entries(value)) {
      output[key] = redactAuditValue(currentValue, key);
    }
    return output as T;
  }

  if (typeof value === 'object') return '[Object]' as T;
  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (!deepEqual(left[i], right[i])) return false;
    }
    return true;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }

  return false;
}

type DiffNode = {
  before?: unknown;
  after?: unknown;
};

function buildRawDiff(before: unknown, after: unknown): DiffNode | null {
  if (deepEqual(before, after)) return null;

  if (isPlainObject(before) && isPlainObject(after)) {
    const beforeOut: Record<string, unknown> = {};
    const afterOut: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of keys) {
      const childDiff = buildRawDiff(before[key], after[key]);
      if (!childDiff) continue;
      if (childDiff.before !== undefined) beforeOut[key] = childDiff.before;
      if (childDiff.after !== undefined) afterOut[key] = childDiff.after;
    }

    return {
      before: Object.keys(beforeOut).length ? beforeOut : undefined,
      after: Object.keys(afterOut).length ? afterOut : undefined,
    };
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    return { before, after };
  }

  return { before, after };
}

export function buildRedactedAuditDiff(before: unknown, after: unknown): {
  before: Record<string, unknown> | unknown[] | string | number | boolean | null;
  after: Record<string, unknown> | unknown[] | string | number | boolean | null;
} {
  const rawDiff = buildRawDiff(before, after);
  if (!rawDiff) {
    return { before: null, after: null };
  }

  return {
    before:
      rawDiff.before === undefined
        ? null
        : (redactAuditValue(rawDiff.before) as Record<string, unknown> | unknown[] | string | number | boolean),
    after:
      rawDiff.after === undefined
        ? null
        : (redactAuditValue(rawDiff.after) as Record<string, unknown> | unknown[] | string | number | boolean),
  };
}
