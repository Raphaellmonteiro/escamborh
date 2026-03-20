export type ComandaExtrasInput = {
  taxa_servico_ativa?: boolean | number | string | null;
  taxa_servico_percentual?: number | string | null;
  couvert_ativo?: boolean | number | string | null;
  couvert_valor_unitario?: number | string | null;
  couvert_quantidade_pessoas?: number | string | null;
};

type MesaFinanceOverrides = {
  valor_taxa_servico?: unknown;
  valor_couvert?: unknown;
  total_extras?: unknown;
  total_amount?: unknown;
};

export type MesaFinanceSnapshot = {
  subtotal: number;
  taxaServicoAtiva: boolean;
  taxaServicoPercentual: number;
  couvertAtivo: boolean;
  couvertValorUnitario: number;
  couvertQuantidadePessoas: number;
  valorTaxaServico: number;
  valorCouvert: number;
  totalExtras: number;
  total: number;
  extras: { name: string; value: number }[];
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(normalized)) return false;

  return fallback;
}

function formatPercentLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

export function normalizeComandaExtras(input: ComandaExtrasInput = {}) {
  return {
    taxa_servico_ativa: toFlag(input.taxa_servico_ativa, true) ? 1 : 0,
    taxa_servico_percentual: Math.max(0, toNumber(input.taxa_servico_percentual, 10)),
    couvert_ativo: toFlag(input.couvert_ativo, false) ? 1 : 0,
    couvert_valor_unitario: Math.max(0, toNumber(input.couvert_valor_unitario, 15)),
    couvert_quantidade_pessoas: Math.max(1, Math.round(toNumber(input.couvert_quantidade_pessoas, 1))),
  };
}

export function buildMesaFinanceSnapshot(
  comanda: ComandaExtrasInput | null | undefined,
  subtotalInput: unknown,
  overrides: MesaFinanceOverrides = {}
): MesaFinanceSnapshot {
  const extrasConfig = normalizeComandaExtras(comanda || {});
  const subtotal = Math.max(0, toNumber(subtotalInput, 0));
  const percentualLabel = formatPercentLabel(extrasConfig.taxa_servico_percentual);
  const computedValorTaxaServico = extrasConfig.taxa_servico_ativa
    ? subtotal * (extrasConfig.taxa_servico_percentual / 100)
    : 0;
  const computedValorCouvert = extrasConfig.couvert_ativo
    ? extrasConfig.couvert_valor_unitario * extrasConfig.couvert_quantidade_pessoas
    : 0;
  const valorTaxaServico =
    overrides.valor_taxa_servico === undefined || overrides.valor_taxa_servico === null
      ? computedValorTaxaServico
      : Math.max(0, toNumber(overrides.valor_taxa_servico, computedValorTaxaServico));
  const valorCouvert =
    overrides.valor_couvert === undefined || overrides.valor_couvert === null
      ? computedValorCouvert
      : Math.max(0, toNumber(overrides.valor_couvert, computedValorCouvert));
  const totalExtras =
    overrides.total_extras === undefined || overrides.total_extras === null
      ? valorTaxaServico + valorCouvert
      : Math.max(0, toNumber(overrides.total_extras, valorTaxaServico + valorCouvert));
  const total =
    overrides.total_amount === undefined || overrides.total_amount === null
      ? subtotal + totalExtras
      : Math.max(0, toNumber(overrides.total_amount, subtotal + totalExtras));
  const extras: { name: string; value: number }[] = [];

  if (valorTaxaServico > 0) {
    extras.push({
      name: `Taxa de Serviço (${percentualLabel}%)`,
      value: valorTaxaServico,
    });
  }

  if (valorCouvert > 0) {
    extras.push({
      name: `Couvert Artístico (${extrasConfig.couvert_quantidade_pessoas} pessoa${extrasConfig.couvert_quantidade_pessoas > 1 ? 's' : ''})`,
      value: valorCouvert,
    });
  }

  return {
    subtotal,
    taxaServicoAtiva: extrasConfig.taxa_servico_ativa === 1,
    taxaServicoPercentual: extrasConfig.taxa_servico_percentual,
    couvertAtivo: extrasConfig.couvert_ativo === 1,
    couvertValorUnitario: extrasConfig.couvert_valor_unitario,
    couvertQuantidadePessoas: extrasConfig.couvert_quantidade_pessoas,
    valorTaxaServico,
    valorCouvert,
    totalExtras,
    total,
    extras,
  };
}

export function buildMesaReceiptTotals(snapshot: MesaFinanceSnapshot) {
  return [
    ...(snapshot.total !== snapshot.subtotal ? [{ label: 'Subtotal', valor: snapshot.subtotal }] : []),
    ...snapshot.extras.map((extra) => ({ label: extra.name, valor: extra.value })),
    { label: 'Total', valor: snapshot.total, destaque: true },
  ];
}

export function buildMesaComandaPayload(comanda: any, itens: any[]) {
  const normalizedItems = itens.map((item: any) => ({
    ...item,
    quantity: Number(item.quantity || 0),
    price_at_time: Number(item.price_at_time || 0),
  }));
  const subtotal = normalizedItems.reduce(
    (acc: number, item: any) => acc + Number(item.quantity) * Number(item.price_at_time),
    0
  );
  const totals = buildMesaFinanceSnapshot(comanda, subtotal);

  return {
    ...comanda,
    taxa_servico_ativa: totals.taxaServicoAtiva ? 1 : 0,
    taxa_servico_percentual: totals.taxaServicoPercentual,
    couvert_ativo: totals.couvertAtivo ? 1 : 0,
    couvert_valor_unitario: totals.couvertValorUnitario,
    couvert_quantidade_pessoas: totals.couvertQuantidadePessoas,
    subtotal,
    valor_taxa_servico: totals.valorTaxaServico,
    valor_couvert: totals.valorCouvert,
    total_extras: totals.totalExtras,
    total_com_extras: totals.total,
    itens: normalizedItems,
  };
}
