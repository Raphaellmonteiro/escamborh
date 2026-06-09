import { timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/** Valores gravados com bcrypt começam com $2a$, $2b$, $2y$ (bcryptjs usa $2a$). */
export function isStoredSecurityPasswordBcrypt(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith('$2');
}

export function hashPlainSecurityPassword(plain: string): string {
  return bcrypt.hashSync(String(plain || '').trim(), BCRYPT_ROUNDS);
}

export type VerifyStoredSecurityPasswordResult =
  | { ok: false }
  | { ok: true; rehashToBcrypt: boolean };

/**
 * Compara a senha informada com o valor no banco.
 * - Se estiver em bcrypt, usa bcrypt.compareSync.
 * - Se for legado em texto puro, compara com timingSafeEqual e sinaliza rehash.
 */
export function verifyStoredSecurityPassword(
  storedRaw: string | null | undefined,
  plainInput: string
): VerifyStoredSecurityPasswordResult {
  const plain = String(plainInput || '').trim();
  const stored = String(storedRaw ?? '').trim();
  if (!plain || !stored) {
    return { ok: false };
  }

  if (isStoredSecurityPasswordBcrypt(stored)) {
    try {
      if (bcrypt.compareSync(plain, stored)) {
        return { ok: true, rehashToBcrypt: false };
      }
    } catch {
      return { ok: false };
    }
    return { ok: false };
  }

  const a = Buffer.from(plain, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) {
    return { ok: false };
  }
  try {
    if (!timingSafeEqual(a, b)) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
  return { ok: true, rehashToBcrypt: true };
}

/** Perfil / avisos: vazio ou senha legada fraca conhecida. */
export function subsenhaPerfilPrecisaAtencao(stored: string | null | undefined): boolean {
  const s = String(stored ?? '').trim();
  if (!s) return true;
  if (!isStoredSecurityPasswordBcrypt(s) && s === '123321') return true;
  return false;
}
