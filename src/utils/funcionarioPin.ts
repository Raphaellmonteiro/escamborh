import { qRun } from '../db';
import { extractCpfDigits, maskCpfDigits } from './funcionarioCpf';
import { decryptFuncionarioCpfStored } from './funcionarioCpfCrypto';
import { hashPlainSecurityPassword, verifyStoredSecurityPassword } from './securityPasswordStorage';

export type SanitizeFuncionarioOptions = {
  /** Inclui `cpf` com 11 dígitos (sem máscara). Usar só em endpoint dedicado à edição. */
  includeCpfCompleto?: boolean;
};

/**
 * Sanitização de linha `funcionarios` para JSON: remove `pin`, não expõe `cpf` salvo com
 * `includeCpfCompleto`, acrescenta `cpf_mascarado` (ver `maskCpfDigits` em funcionarioCpf).
 */
export function sanitizeFuncionarioRowForClient(
  row: Record<string, unknown> | null | undefined,
  options?: SanitizeFuncionarioOptions
) {
  if (row == null) return row;
  const { pin, cpf, ...rest } = row;
  const cpfPlain = decryptFuncionarioCpfStored(cpf == null ? null : String(cpf));
  const cpfDigits = extractCpfDigits(cpfPlain ?? '');
  const cpf_mascarado = maskCpfDigits(cpfDigits.length ? cpfDigits : null);
  const base: Record<string, unknown> = {
    ...rest,
    pin_configurado: !!String(pin ?? '').trim(),
    cpf_mascarado,
  };
  if (options?.includeCpfCompleto && cpfDigits.length === 11) {
    base.cpf = cpfDigits;
  }
  return base;
}

export async function verifyEmployeePinAndRehashIfLegacy(
  storedPin: string | null | undefined,
  inputPin: string,
  funcionarioId: number,
  tenantId: number
): Promise<boolean> {
  const result = verifyStoredSecurityPassword(storedPin, inputPin);
  if (!result.ok) return false;
  if (result.rehashToBcrypt) {
    await qRun('UPDATE funcionarios SET pin=? WHERE id=? AND tenant_id=?', [
      hashPlainSecurityPassword(inputPin),
      funcionarioId,
      tenantId,
    ]);
  }
  return true;
}
