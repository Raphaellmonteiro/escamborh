import { q1, qRun } from '../db';
import { AppError } from './errors';
import { hashPlainSecurityPassword, verifyStoredSecurityPassword } from './securityPasswordStorage';

export type SecurityPasswordType = 'admin' | 'caixa';

type ValidateSecurityPasswordInput = {
  tenantId: number | string;
  userId?: number;
  password: string;
  type: SecurityPasswordType;
  requiredMessage?: string;
  invalidMessage?: string;
  notConfiguredMessage?: string;
  unauthenticatedMessage?: string;
  userNotFoundMessage?: string;
};

function getPasswordColumn(type: SecurityPasswordType) {
  return type === 'admin' ? 'senha_admin' : 'senha_caixa';
}

export async function validateSecurityPassword({
  tenantId,
  userId,
  password,
  type,
  requiredMessage = 'Senha de segurança obrigatória',
  invalidMessage = 'Senha de segurança inválida',
  notConfiguredMessage,
  unauthenticatedMessage = 'Usuário não autenticado',
  userNotFoundMessage = 'Usuário não encontrado',
}: ValidateSecurityPasswordInput) {
  const normalizedPassword = String(password || '').trim();

  if (!normalizedPassword) {
    throw new AppError(requiredMessage, 400, 'SECURITY_PASSWORD_REQUIRED');
  }

  if (!userId) {
    throw new AppError(unauthenticatedMessage, 401, 'AUTH_UNAUTHENTICATED');
  }

  const column = getPasswordColumn(type);
  const row = await q1<{ password_value?: string | null }>(
    `SELECT c.${column} AS password_value
     FROM usuarios u
     INNER JOIN clientes c
       ON c.id=? AND (u.cliente_id=c.id OR c.usuario=u.username)
     WHERE u.id=?
     LIMIT 1`,
    [tenantId, userId]
  );

  if (!row) {
    throw new AppError(userNotFoundMessage, 404, 'AUTH_USER_NOT_FOUND');
  }

  const stored = String(row.password_value ?? '').trim();
  if (!stored) {
    const fallback =
      type === 'admin'
        ? 'A senha de administrador não está configurada neste estabelecimento. Defina-a em Configurações (Estabelecimento) antes de continuar.'
        : 'A senha de caixa não está configurada neste estabelecimento. Defina-a em Configurações (Estabelecimento) antes de continuar.';
    throw new AppError(notConfiguredMessage ?? fallback, 400, 'SECURITY_PASSWORD_NOT_CONFIGURED');
  }

  const verified = verifyStoredSecurityPassword(row.password_value, normalizedPassword);
  if (!verified.ok) {
    throw new AppError(invalidMessage, 403, 'SECURITY_PASSWORD_INVALID');
  }

  if (verified.rehashToBcrypt) {
    const hashed = hashPlainSecurityPassword(normalizedPassword);
    await qRun(`UPDATE clientes SET ${column}=? WHERE id=?`, [hashed, tenantId]);
  }

  return true;
}
