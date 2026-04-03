import crypto, { createHash, randomBytes } from 'crypto';
import { extractCpfDigits } from './funcionarioCpf';

const PREFIX = 'fpdv.cpf.v1:';

function resolveAes256Key(): Buffer | null {
  const raw = process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === 32) return b64;
  } catch {
    /* ignore */
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function isFuncionarioCpfEncryptedPayload(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Valor a persistir em `funcionarios.cpf`: ciphertext com prefixo se a chave existir;
 * senão mantém texto legado (apenas dígitos ou null).
 */
export function encryptFuncionarioCpfForStorage(plainDigits11: string | null): string | null {
  if (plainDigits11 == null || plainDigits11 === '') return null;
  const key = resolveAes256Key();
  if (!key) return plainDigits11;
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainDigits11, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, enc, tag]).toString('base64url');
}

/**
 * Recupera apenas os dígitos do CPF a partir do que está no banco (criptografado ou legado).
 * Sem chave e payload criptografado → null (máscara não revela dados).
 */
export function decryptFuncionarioCpfStored(stored: string | null | undefined): string | null {
  if (stored == null || String(stored).trim() === '') return null;
  const s = String(stored);
  if (!isFuncionarioCpfEncryptedPayload(s)) {
    const d = extractCpfDigits(s);
    return d.length ? d : null;
  }
  const key = resolveAes256Key();
  if (!key) return null;
  const b64 = s.slice(PREFIX.length);
  let combined: Buffer;
  try {
    combined = Buffer.from(b64, 'base64url');
  } catch {
    return null;
  }
  if (combined.length < 12 + 16 + 1) return null;
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(combined.length - 16);
  const data = combined.subarray(12, combined.length - 16);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return plain || null;
  } catch {
    return null;
  }
}

/**
 * Em UPDATE sem troca de CPF: mantém ciphertext; se ainda estiver em texto puro válido (11 dígitos)
 * e houver chave, regrava criptografado (migração sob demanda).
 */
export function ensureFuncionarioCpfStoredForm(storedFromDb: string | null): string | null {
  if (storedFromDb == null || String(storedFromDb).trim() === '') return null;
  const s = String(storedFromDb);
  if (isFuncionarioCpfEncryptedPayload(s)) return s;
  const digits = extractCpfDigits(s);
  if (digits.length === 11) return encryptFuncionarioCpfForStorage(digits);
  return s;
}
