// Regras centralizadas por tipo de contrato (RH). Sem dependências de DB.

export type TipoContrato = 'fixo' | 'diarista' | 'evento';

const ALLOWED: TipoContrato[] = ['fixo', 'diarista', 'evento'];

export function normalizeTipoContrato(raw: string | null | undefined): TipoContrato {
  const s = String(raw || 'fixo')
    .trim()
    .toLowerCase();
  if (s === 'diarista' || s === 'evento') return s;
  return 'fixo';
}

export function isFixo(tipo: TipoContrato): boolean {
  return tipo === 'fixo';
}

export function isDiarista(tipo: TipoContrato): boolean {
  return tipo === 'diarista';
}

export function isEvento(tipo: TipoContrato): boolean {
  return tipo === 'evento';
}

export function assertTipoContratoApi(value: unknown): value is TipoContrato {
  return typeof value === 'string' && (ALLOWED as string[]).includes(value);
}

/** Folha mensal CLT completa (INSS, descontos padrão, suplemento gerencial). */
export function usesTraditionalMonthlyPayroll(tipo: TipoContrato): boolean {
  return isFixo(tipo);
}

/** Benefícios / 13º / férias automáticos na folha gerencial. */
export function usesManagerialPayrollSupplement(tipo: TipoContrato): boolean {
  return isFixo(tipo);
}

/** Criação automática de períodos aquisitivos de férias. */
export function usesAutoFeriasPeriods(tipo: TipoContrato): boolean {
  return isFixo(tipo);
}

/** Cálculo automático / upsert anual de 13º. */
export function usesAutoDecimoTerceiro(tipo: TipoContrato): boolean {
  return isFixo(tipo);
}

export function hourBankApplicable(tipo: TipoContrato): boolean {
  return isFixo(tipo) || isDiarista(tipo);
}

export function hourBankVisibleInUi(tipo: TipoContrato): boolean {
  return isFixo(tipo);
}
