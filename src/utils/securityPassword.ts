import { q1 } from '../db';
import { AppError } from './errors';

export type SecurityPasswordType = 'admin' | 'caixa';

type ValidateSecurityPasswordInput = {
  tenantId: number | string;
  userId?: number;
  password: string;
  type: SecurityPasswordType;
  requiredMessage?: string;
  invalidMessage?: string;
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

  if (normalizedPassword !== (row.password_value || '123321')) {
    throw new AppError(invalidMessage, 403, 'SECURITY_PASSWORD_INVALID');
  }

  return true;
}
