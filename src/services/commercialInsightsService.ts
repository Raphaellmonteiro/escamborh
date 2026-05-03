import { q1 } from '../db';
import { type PlanFeature } from '../config/planFeatures';
import { buildValidOrderSqlClause } from './orderValiditySql';

const TZ = 'America/Sao_Paulo';

export type CommercialInsightSeverity = 'positive' | 'negative' | 'neutral';

export type CommercialInsight = {
  id: string;
  title: string;
  text: string;
  severity: CommercialInsightSeverity;
  actionHint?: string | null;
};

export type CommercialInsightsSnapshot = {
  date: string; // YYYY-MM-DD (TZ local)
  insights: CommercialInsight[];
  meta: {
    faturamentoHoje: number;
    faturamentoOntem: number;
    faturamentoSemanaPassadaMesmoDia: number;
    pedidosHoje: number;
    pedidosOntem: number;
    pedidosSemanaPassadaMesmoDia: number;
    ticketMedioHoje: number;
    ticketMedioOntem: number;
    ticketMedioSemanaPassadaMesmoDia: number;
    produtoTopHoje: { name: string; quantity: number } | null;
    produtoQuedaSemana: { name: string; atual: number; anterior: number } | null;
    produtoFracoSemana: { name: string; atual: number; anterior: number } | null;
    clientesInativos7: number;
    clientesInativos15: number;
    clientesInativos30: number;
    clientesTotal: number;
  };
};

function currentLocalDateYmd(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function shiftYmd(baseYmd: string, deltaDays: number): string {
  const [y, m, d] = baseYmd.split('-').map((n) => Number(n));
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatPct(value: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value);
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computePctChange(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function classifyDeltaPct(deltaPct: number | null, neutralBandPct = 0.75): CommercialInsightSeverity {
  if (deltaPct === null) return 'neutral';
  if (Math.abs(deltaPct) < neutralBandPct) return 'neutral';
  return deltaPct >= 0 ? 'positive' : 'negative';
}

function buildFaturamentoComparisonText(params: {
  faturamentoHoje: number;
  faturamentoBase: number;
  labelBase: string;
}): { text: string; severity: CommercialInsightSeverity } {
  const pct = computePctChange(params.faturamentoHoje, params.faturamentoBase);
  const severity = classifyDeltaPct(pct, 1);

  if (pct === null) {
    if (params.faturamentoBase <= 0 && params.faturamentoHoje > 0) {
      return {
        text: `Seu faturamento hoje saiu do zero em relação a ${params.labelBase}.`,
        severity: 'positive',
      };
    }
    if (params.faturamentoBase <= 0 && params.faturamentoHoje <= 0) {
      return {
        text: `Seu faturamento hoje ainda está zerado (comparação com ${params.labelBase} indisponível).`,
        severity: 'neutral',
      };
    }
    return {
      text: `Seu faturamento hoje está ${formatMoney(params.faturamentoHoje)} (comparação com ${params.labelBase} indisponível).`,
      severity: 'neutral',
    };
  }

  const dir = pct >= 0 ? 'acima' : 'abaixo';
  return {
    text: `Seu faturamento hoje está ${formatPct(Math.abs(pct))}% ${dir} de ${params.labelBase}.`,
    severity,
  };
}

function buildTicketComparisonText(params: {
  ticketHoje: number;
  ticketBase: number;
  labelBase: string;
}): { text: string; severity: CommercialInsightSeverity } {
  const delta = params.ticketHoje - params.ticketBase;

  if (!Number.isFinite(delta)) {
    return { text: `Ticket médio hoje: ${formatMoney(params.ticketHoje)}.`, severity: 'neutral' };
  }

  const abs = Math.abs(delta);
  const severity: CommercialInsightSeverity =
    abs < 0.01 ? 'neutral' : delta >= 0 ? 'positive' : 'negative';

  if (abs < 0.01) {
    return {
      text: `Seu ticket médio ficou estável em relação a ${params.labelBase}.`,
      severity: 'neutral',
    };
  }

  const dir = delta >= 0 ? 'subiu' : 'caiu';
  return {
    text: `O ticket médio ${dir} ${formatMoney(abs)} em relação a ${params.labelBase}.`,
    severity,
  };
}

async function getDayOrderTotals(tenantId: number, dateYmd: string): Promise<{ pedidos: number; faturamento: number }> {
  const valid = buildValidOrderSqlClause('p');
  const row = await q1<{ pedidos: number | string; faturamento: number | string }>(
    `SELECT
       COUNT(*) FILTER (WHERE ${valid})::int AS pedidos,
       COALESCE(SUM(CASE WHEN ${valid} THEN COALESCE(p.total_amount, 0) ELSE 0 END), 0)::float AS faturamento
     FROM pedidos p
     WHERE p.tenant_id=?
       AND (p.created_at AT TIME ZONE '${TZ}')::date = ?::date`,
    [tenantId, dateYmd]
  );

  const pedidos = safeNumber(row?.pedidos);
  const faturamento = safeNumber(row?.faturamento);
  return { pedidos, faturamento };
}

async function getTopProductToday(tenantId: number, dateYmd: string): Promise<{ name: string; quantity: number } | null> {
  const valid = buildValidOrderSqlClause('p');
  const row = await q1<{ name: string | null; quantity: number | string }>(
    `SELECT
       COALESCE(pr.name, 'Produto') AS name,
       COALESCE(SUM(ip.quantity), 0)::float AS quantity
     FROM itens_pedido ip
     INNER JOIN pedidos p ON p.id = ip.order_id AND p.tenant_id = ip.tenant_id
     LEFT JOIN produtos pr ON pr.id = ip.product_id AND pr.tenant_id = ip.tenant_id
     WHERE ip.tenant_id=?
       AND (${valid})
       AND (p.created_at AT TIME ZONE '${TZ}')::date = ?::date
     GROUP BY ip.product_id, COALESCE(pr.name, 'Produto')
     ORDER BY COALESCE(SUM(ip.quantity), 0) DESC
     LIMIT 1`,
    [tenantId, dateYmd]
  );

  const quantity = safeNumber(row?.quantity);
  const name = String(row?.name || '').trim();
  if (!name || quantity <= 0) return null;
  return { name, quantity };
}

async function getWeeklyProductDrop(tenantId: number): Promise<{
  name: string;
  atual: number;
  anterior: number;
} | null> {
  const valid = buildValidOrderSqlClause('p');
  const row = await q1<{
    name: string | null;
    atual: number | string | null;
    anterior: number | string | null;
  }>(
    `WITH base AS (
       SELECT
         ip.product_id,
         COALESCE(pr.name, 'Produto') AS name,
         SUM(
           CASE
             WHEN (p.created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'
             THEN COALESCE(ip.quantity, 0)
             ELSE 0
           END
         )::float AS atual,
         SUM(
           CASE
             WHEN (p.created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '13 days'
              AND (p.created_at AT TIME ZONE '${TZ}')::date <  (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'
             THEN COALESCE(ip.quantity, 0)
             ELSE 0
           END
         )::float AS anterior
       FROM itens_pedido ip
       INNER JOIN pedidos p ON p.id = ip.order_id AND p.tenant_id = ip.tenant_id
       LEFT JOIN produtos pr ON pr.id = ip.product_id AND pr.tenant_id = ip.tenant_id
       WHERE ip.tenant_id=?
         AND (${valid})
         AND (p.created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '13 days'
       GROUP BY ip.product_id, COALESCE(pr.name, 'Produto')
     )
     SELECT name, atual, anterior
     FROM base
     WHERE anterior >= 5 AND atual < anterior
     ORDER BY (anterior - atual) DESC, anterior DESC
     LIMIT 1`,
    [tenantId]
  );

  const atual = safeNumber(row?.atual);
  const anterior = safeNumber(row?.anterior);
  const name = String(row?.name || '').trim();
  if (!name || anterior <= 0 || atual >= anterior) return null;
  return { name, atual, anterior };
}

async function getWeeklyWeakProduct(tenantId: number): Promise<{
  name: string;
  atual: number;
  anterior: number;
} | null> {
  const valid = buildValidOrderSqlClause('p');
  const row = await q1<{
    name: string | null;
    atual: number | string | null;
    anterior: number | string | null;
  }>(
    `WITH base AS (
       SELECT
         ip.product_id,
         COALESCE(pr.name, 'Produto') AS name,
         SUM(
           CASE
             WHEN (p.created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'
             THEN COALESCE(ip.quantity, 0)
             ELSE 0
           END
         )::float AS atual,
         SUM(
           CASE
             WHEN (p.created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '30 days'
              AND (p.created_at AT TIME ZONE '${TZ}')::date <  (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'
             THEN COALESCE(ip.quantity, 0)
             ELSE 0
           END
         )::float AS anterior
       FROM itens_pedido ip
       INNER JOIN pedidos p ON p.id = ip.order_id AND p.tenant_id = ip.tenant_id
       LEFT JOIN produtos pr ON pr.id = ip.product_id AND pr.tenant_id = ip.tenant_id
       WHERE ip.tenant_id=?
         AND (${valid})
         AND (p.created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '30 days'
       GROUP BY ip.product_id, COALESCE(pr.name, 'Produto')
     )
     SELECT name, atual, anterior
     FROM base
     WHERE anterior >= 8 AND atual <= 1
     ORDER BY (anterior - atual) DESC, anterior DESC
     LIMIT 1`,
    [tenantId]
  );

  const atual = safeNumber(row?.atual);
  const anterior = safeNumber(row?.anterior);
  const name = String(row?.name || '').trim();
  if (!name || anterior <= 0) return null;
  return { name, atual, anterior };
}

async function getInactiveCustomerCounts(tenantId: number): Promise<{
  total: number;
  inactive7: number;
  inactive15: number;
  inactive30: number;
}> {
  const row = await q1<{
    total: number | string | null;
    inactive7: number | string | null;
    inactive15: number | string | null;
    inactive30: number | string | null;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ultima_compra_at IS NOT NULL AND ultima_compra_at < NOW() - INTERVAL '7 days')::int AS inactive7,
       COUNT(*) FILTER (WHERE ultima_compra_at IS NOT NULL AND ultima_compra_at < NOW() - INTERVAL '15 days')::int AS inactive15,
       COUNT(*) FILTER (WHERE ultima_compra_at IS NOT NULL AND ultima_compra_at < NOW() - INTERVAL '30 days')::int AS inactive30
     FROM delivery_clientes
     WHERE tenant_id=?
       AND COALESCE(ativo, 1) = 1`,
    [tenantId]
  );

  return {
    total: safeNumber(row?.total),
    inactive7: safeNumber(row?.inactive7),
    inactive15: safeNumber(row?.inactive15),
    inactive30: safeNumber(row?.inactive30),
  };
}

function buildActionHint(input: {
  faturamentoHoje: number;
  faturamentoOntem: number;
  ticketHoje: number;
  ticketOntem: number;
  produtoTopHoje: { name: string; quantity: number } | null;
  clientesInativos15: number;
}): string {
  const faturamentoDeltaPct = computePctChange(input.faturamentoHoje, input.faturamentoOntem);
  const ticketDelta = input.ticketHoje - input.ticketOntem;

  if (faturamentoDeltaPct !== null && faturamentoDeltaPct <= -5) {
    const top = input.produtoTopHoje?.name ? `Destaque "${input.produtoTopHoje.name}" no balcão e no delivery.` : 'Destaque seus itens mais vendidos.';
    const reativar =
      input.clientesInativos15 > 0
        ? `Reative clientes sem compra recente (15+ dias: ${input.clientesInativos15}).`
        : 'Reative clientes sem compra recente com uma oferta simples.';
    return `${reativar} ${top}`;
  }

  if (ticketDelta <= -2) {
    return 'Teste combos simples ou adicionais para recuperar o ticket médio (ex.: bebida + acompanhamento).';
  }

  if (faturamentoDeltaPct !== null && faturamentoDeltaPct >= 8) {
    return 'Aproveite o bom dia: mantenha o destaque dos itens campeões e ofereça adicionais no caixa.';
  }

  return 'Acompanhe os campeões do dia e ajuste o destaque do cardápio/PDV para aumentar conversão.';
}

function hasFeature(features: PlanFeature[] | null | undefined, feature: PlanFeature): boolean {
  return Array.isArray(features) && features.includes(feature);
}

export async function getCommercialInsightsSnapshot(input: {
  tenantId: number;
  features?: PlanFeature[];
}): Promise<CommercialInsightsSnapshot> {
  const today = currentLocalDateYmd();
  const yesterday = shiftYmd(today, -1);
  const lastWeek = shiftYmd(today, -7);

  const [
    hoje,
    ontem,
    semanaPassada,
    produtoTopHoje,
    produtoQuedaSemana,
    produtoFracoSemana,
    inativos,
  ] = await Promise.all([
    getDayOrderTotals(input.tenantId, today),
    getDayOrderTotals(input.tenantId, yesterday),
    getDayOrderTotals(input.tenantId, lastWeek),
    getTopProductToday(input.tenantId, today),
    getWeeklyProductDrop(input.tenantId),
    getWeeklyWeakProduct(input.tenantId),
    getInactiveCustomerCounts(input.tenantId).catch(() => ({
      total: 0,
      inactive7: 0,
      inactive15: 0,
      inactive30: 0,
    })),
  ]);

  const ticketHoje = hoje.pedidos > 0 ? hoje.faturamento / hoje.pedidos : 0;
  const ticketOntem = ontem.pedidos > 0 ? ontem.faturamento / ontem.pedidos : 0;
  const ticketSemanaPassada = semanaPassada.pedidos > 0 ? semanaPassada.faturamento / semanaPassada.pedidos : 0;

  const faturamentoVsOntem = buildFaturamentoComparisonText({
    faturamentoHoje: hoje.faturamento,
    faturamentoBase: ontem.faturamento,
    labelBase: 'ontem',
  });

  const faturamentoVsSemanaPassada = buildFaturamentoComparisonText({
    faturamentoHoje: hoje.faturamento,
    faturamentoBase: semanaPassada.faturamento,
    labelBase: 'a última semana (mesmo dia)',
  });

  const pedidosDeltaPct = computePctChange(hoje.pedidos, ontem.pedidos);
  const pedidosSeverity = classifyDeltaPct(pedidosDeltaPct, 2);
  const pedidosText =
    pedidosDeltaPct === null
      ? `Hoje você tem ${hoje.pedidos} pedido(s).`
      : `Você tem ${hoje.pedidos} pedido(s) hoje (${formatPct(Math.abs(pedidosDeltaPct))}% ${pedidosDeltaPct >= 0 ? 'acima' : 'abaixo'} de ontem).`;

  const ticketVsOntem = buildTicketComparisonText({
    ticketHoje,
    ticketBase: ticketOntem,
    labelBase: 'ontem',
  });

  const inactiveBaseText =
    inativos.inactive7 > 0 || inativos.inactive15 > 0 || inativos.inactive30 > 0
      ? `${inativos.inactive7} cliente(s) 7+ dias, ${inativos.inactive15} cliente(s) 15+ dias e ${inativos.inactive30} cliente(s) 30+ dias sem comprar.`
      : 'Nenhum cliente inativo relevante encontrado (com última compra registrada).';

  const inactiveSeverity: CommercialInsightSeverity =
    inativos.inactive30 > 0 ? 'negative' : inativos.inactive15 > 0 ? 'neutral' : 'neutral';

  const actionHint = buildActionHint({
    faturamentoHoje: hoje.faturamento,
    faturamentoOntem: ontem.faturamento,
    ticketHoje,
    ticketOntem,
    produtoTopHoje,
    clientesInativos15: inativos.inactive15,
  });

  const insights: CommercialInsight[] = [
    {
      id: 'faturamento_vs_ontem',
      title: 'Faturamento (hoje vs ontem)',
      text: faturamentoVsOntem.text,
      severity: faturamentoVsOntem.severity,
      actionHint: actionHint,
    },
    {
      id: 'faturamento_vs_semana',
      title: 'Faturamento (mesmo dia da semana)',
      text: faturamentoVsSemanaPassada.text,
      severity: faturamentoVsSemanaPassada.severity,
    },
    {
      id: 'pedidos_ticket',
      title: 'Pedidos e ticket médio',
      text: `${pedidosText} Ticket médio hoje: ${formatMoney(ticketHoje)}. ${ticketVsOntem.text}`,
      severity: ticketVsOntem.severity === 'negative' ? 'negative' : pedidosSeverity,
    },
  ];

  if (produtoTopHoje) {
    insights.push({
      id: 'produto_top_hoje',
      title: 'Produto campeão do dia',
      text: `${produtoTopHoje.name} foi o item mais vendido hoje.`,
      severity: 'positive',
      actionHint: 'Mantenha esse item em destaque (foto, descrição e recomendação no caixa).',
    });
  }

  if (produtoQuedaSemana) {
    insights.push({
      id: 'produto_queda_semana',
      title: 'Produto em queda (7 dias)',
      text: `${produtoQuedaSemana.name} caiu na semana (de ${Math.round(produtoQuedaSemana.anterior)} para ${Math.round(produtoQuedaSemana.atual)} unidades).`,
      severity: 'neutral',
      actionHint: 'Reavalie destaque, preço ou faça uma oferta simples por 48h para testar reação.',
    });
  } else if (produtoFracoSemana) {
    insights.push({
      id: 'produto_fraco_semana',
      title: 'Produto com baixa saída',
      text: `${produtoFracoSemana.name} quase não saiu nos últimos 7 dias.`,
      severity: 'neutral',
      actionHint: 'Teste reposicionar no cardápio ou criar um combo simples para aumentar saída.',
    });
  }

  if (hasFeature(input.features, 'delivery') || hasFeature(input.features, 'delivery_public')) {
    insights.push({
      id: 'clientes_inativos',
      title: 'Clientes inativos',
      text: inactiveBaseText,
      severity: inactiveSeverity,
      actionHint: 'Faça uma ação rápida: cupom simples + mensagem curta para reativar.',
    });
  } else if (inativos.total > 0) {
    insights.push({
      id: 'clientes_inativos',
      title: 'Clientes inativos',
      text: inactiveBaseText,
      severity: inactiveSeverity,
      actionHint: 'Reative clientes recorrentes com uma oferta simples e lembrete no balcão.',
    });
  }

  return {
    date: today,
    insights,
    meta: {
      faturamentoHoje: hoje.faturamento,
      faturamentoOntem: ontem.faturamento,
      faturamentoSemanaPassadaMesmoDia: semanaPassada.faturamento,
      pedidosHoje: hoje.pedidos,
      pedidosOntem: ontem.pedidos,
      pedidosSemanaPassadaMesmoDia: semanaPassada.pedidos,
      ticketMedioHoje: ticketHoje,
      ticketMedioOntem: ticketOntem,
      ticketMedioSemanaPassadaMesmoDia: ticketSemanaPassada,
      produtoTopHoje,
      produtoQuedaSemana,
      produtoFracoSemana,
      clientesInativos7: inativos.inactive7,
      clientesInativos15: inativos.inactive15,
      clientesInativos30: inativos.inactive30,
      clientesTotal: inativos.total,
    },
  };
}

