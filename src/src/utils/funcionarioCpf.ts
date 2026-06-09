/** Apenas dígitos do valor informado (CPF). */
export function extractCpfDigits(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\D/g, '');
}

function isValidCpfCheckDigits(d: string): boolean {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

/**
 * Normaliza CPF para persistência: somente dígitos, 11 posições, dígitos verificadores válidos.
 * Vazio / só máscara → null (campo opcional).
 */
export function normalizeFuncionarioCpfForStorage(
  value: unknown
): { ok: true; digits: string | null } | { ok: false; error: string } {
  const digits = extractCpfDigits(value);
  if (digits.length === 0) return { ok: true, digits: null };
  if (digits.length !== 11) {
    return {
      ok: false,
      error: 'CPF inválido: informe exatamente 11 dígitos ou deixe em branco.',
    };
  }
  if (!isValidCpfCheckDigits(digits)) {
    return { ok: false, error: 'CPF inválido: dígitos verificadores incorretos.' };
  }
  return { ok: true, digits };
}

/**
 * Máscara para listagens e respostas: só os 2 últimos dígitos visíveis (`***.***.***-XX`).
 * Valor legado com tamanho ≠ 11 após extrair dígitos → placeholder genérico.
 */
export function maskCpfDigits(digits: string | null | undefined): string | null {
  const d = extractCpfDigits(digits ?? '');
  if (d.length === 0) return null;
  if (d.length !== 11) return '***.***.***-**';
  return `***.***.***-${d.slice(9, 11)}`;
}
