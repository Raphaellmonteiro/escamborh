import { q1, qAll, qInsert, qRun } from '../db';
import { type PlanFeature } from '../config/planFeatures';
import { getTenantPlanContext } from './tenantPlan';
import { getCommercialInsightsSnapshot } from './commercialInsightsService';

const TZ = 'America/Sao_Paulo';
const SYSTEM_ALERT_KEY_PREFIX = 'sys:';
const BASELINE_WINDOW_DAYS = 14;

type AlertType = 'alerta' | 'oportunidade' | 'parabens' | 'atencao';
type AlertPriority = 1 | 2 | 3;

type DeterministicAlert = {
  chave: string;
  tipo: AlertType;
  titulo: string;
  mensagem: string;
  acao?: string | null;
  acao_rota?: string | null;
  prioridade: AlertPriority;
};

type SyncStatus = 'inserted' | 'updated';

type OpenCaixaRow = {
  id: number | string;
  data: string;
};

type LogAggregateRow = {
  total: number | string | null;
  latest_at?: string | null;
};

type StuckOrderRow = {
  order_number: string;
  status: string;
  age_minutes: number | string | null;
};

type DailyMetricTodayRow = {
  total_today: number | string | null;
  value_today: number | string | null;
};

type DailyMetricBaselineRow = {
  avg_daily: number | string | null;
};

type NamedCountRow = {
  nome?: string | null;
  name?: string | null;
  total_count?: number | string | null;
};

type OrderNumberRow = {
  order_number: string;
};

type ActiveAlertRow = {
  id: number | string;
  chave: string | null;
};

type ExistingAlertRow = {
  id: number | string;
};

export type RefreshDeterministicAlertsResult = {
  active: number;
  inserted: number;
  updated: number;
  expired: number;
};

function currentLocalDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
}

function formatDateTime(value?: string | null) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatNames(values: Array<string | null | undefined>, limit = 3) {
  const names = values.map((value) => String(value || '').trim()).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} e mais ${names.length - limit}`;
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatNumber(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function createAlert(input: Omit<DeterministicAlert, 'chave'> & { chave: string }): DeterministicAlert {
  return {
    ...input,
    chave: `${SYSTEM_ALERT_KEY_PREFIX}${input.chave}`,
  };
}

function pctChange(current: number, baseline: number): number | null {
  const c = Number(current);
  const b = Number(baseline);
  if (!Number.isFinite(c) || !Number.isFinite(b)) return null;
  if (b <= 0) return null;
  return ((c - b) / b) * 100;
}

async function buildCommercialAlerts(tenantId: number, features: PlanFeature[]): Promise<DeterministicAlert[]> {
  const snapshot = await getCommercialInsightsSnapshot({ tenantId, features });
  const m = snapshot.meta;

  const deltaPct = pctChange(m.faturamentoHoje, m.faturamentoOntem);
  const ticketDelta = m.ticketMedioHoje - m.ticketMedioOntem;

  const severityKind =
    deltaPct !== null && deltaPct <= -12 ? 'atencao' : deltaPct !== null && deltaPct <= -5 ? 'alerta' : deltaPct !== null && deltaPct >= 10 ? 'parabens' : 'oportunidade';
  const prioridade: AlertPriority =
    severityKind === 'atencao' ? 3 : severityKind === 'alerta' ? 2 : 1;

  const headlineParts: string[] = [];
  headlineParts.push(`Faturamento hoje: ${formatMoney(m.faturamentoHoje)}`);
  if (deltaPct !== null) {
    headlineParts.push(`${deltaPct >= 0 ? '+' : ''}${formatNumber(deltaPct)}% vs ontem`);
  }

  const pedidosDelta = m.pedidosHoje - m.pedidosOntem;
  const pedidosPart = `Pedidos: ${m.pedidosHoje}${Number.isFinite(pedidosDelta) && pedidosDelta !== 0 ? ` (${pedidosDelta >= 0 ? '+' : ''}${pedidosDelta})` : ''}`;
  headlineParts.push(pedidosPart);

  headlineParts.push(`Ticket: ${formatMoney(m.ticketMedioHoje)}${Number.isFinite(ticketDelta) && Math.abs(ticketDelta) >= 0.01 ? ` (${ticketDelta >= 0 ? '+' : '-'}${formatMoney(Math.abs(ticketDelta))})` : ''}`);

  if (m.produtoTopHoje?.name) {
    headlineParts.push(`Top: ${m.produtoTopHoje.name}`);
  }

  const inativos15 = Number(m.clientesInativos15 || 0);
  if (inativos15 > 0) {
    headlineParts.push(`Inativos 15+d: ${inativos15}`);
  }

  const actionHint = snapshot.insights.find((i) => i.id === 'faturamento_vs_ontem')?.actionHint || null;
  const mensagem = `${headlineParts.join(' • ')}${actionHint ? `\nAção: ${actionHint}` : ''}`;

  return [
    createAlert({
      chave: `comercial:digest:${snapshot.date}`,
      tipo: severityKind as AlertType,
      prioridade,
      titulo: 'Resumo comercial de hoje',
      mensagem,
      acao: 'Ver dashboard',
      acao_rota: '/dashboard',
    }),
  ];
}

function getStuckThresholdMinutes(status: string) {
  switch (normalizeText(status)) {
    case 'criado':
    case 'pedido recebido':
    case 'aguardando confirmacao':
      return 15;
    case 'em preparo':
      return 45;
    case 'pronto':
    case 'pronto para entrega':
      return 30;
    case 'saiu para entrega':
      return 60;
    default:
      return 30;
  }
}

function shouldTriggerVolumeAlert(todayCount: number, avgDaily: number, minimumCount: number) {
  if (todayCount < minimumCount) return false;

  const threshold = Math.max(
    minimumCount,
    Math.ceil(avgDaily * 1.5),
    Math.floor(avgDaily) + 2
  );

  return todayCount >= threshold;
}

async function getDailyOrderMetric(input: {
  tenantId: number;
  dateColumn: 'cancelado_at' | 'reembolsado_at';
  extraWhere: string;
  valueExpression: string;
}) {
  const today = await q1<DailyMetricTodayRow>(
    `SELECT
       COUNT(*)::int AS total_today,
       COALESCE(SUM(${input.valueExpression}), 0)::float AS value_today
     FROM pedidos
     WHERE tenant_id=?
       AND ${input.dateColumn} IS NOT NULL
       ${input.extraWhere}
       AND (${input.dateColumn} AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`,
    [input.tenantId]
  );

  const baseline = await q1<DailyMetricBaselineRow>(
    `WITH dias AS (
       SELECT generate_series(
         ((NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '${BASELINE_WINDOW_DAYS} days')::date,
         ((NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '1 day')::date,
         INTERVAL '1 day'
       )::date AS dia
     ),
     eventos AS (
       SELECT
         (${input.dateColumn} AT TIME ZONE '${TZ}')::date AS dia,
         COUNT(*)::int AS total
       FROM pedidos
       WHERE tenant_id=?
         AND ${input.dateColumn} IS NOT NULL
         ${input.extraWhere}
         AND (${input.dateColumn} AT TIME ZONE '${TZ}')::date >= ((NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '${BASELINE_WINDOW_DAYS} days')::date
         AND (${input.dateColumn} AT TIME ZONE '${TZ}')::date < (NOW() AT TIME ZONE '${TZ}')::date
       GROUP BY 1
     )
     SELECT COALESCE(AVG(COALESCE(eventos.total, 0)), 0)::float AS avg_daily
     FROM dias
     LEFT JOIN eventos USING (dia)`,
    [input.tenantId]
  );

  return {
    totalToday: Number(today?.total_today || 0),
    valueToday: Number(today?.value_today || 0),
    avgDaily: Number(baseline?.avg_daily || 0),
  };
}

async function buildCashAlerts(tenantId: number): Promise<DeterministicAlert[]> {
  const [openCaixas, resetAgg] = await Promise.all([
    qAll<OpenCaixaRow>(
      `SELECT id, data
       FROM caixa
       WHERE tenant_id=? AND status='aberto'
       ORDER BY data ASC, id ASC`,
      [tenantId]
    ),
    q1<LogAggregateRow>(
      `SELECT
         COUNT(*)::int AS total,
         MAX(created_at) AS latest_at
       FROM system_logs
       WHERE tenant_id=?
         AND acao='ADMIN_ACTION_reset_caixa'
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [tenantId]
    ),
  ]);

  const alerts: DeterministicAlert[] = [];
  const today = currentLocalDate();
  const caixasDiaAnterior = openCaixas.filter((caixa) => String(caixa.data || '') < today);

  if (caixasDiaAnterior.length > 0) {
    alerts.push(
      createAlert({
        chave: 'caixa:aberto-dia-anterior',
        tipo: 'atencao',
        prioridade: 3,
        titulo: `${caixasDiaAnterior.length} caixa(s) aberto(s) de dia anterior`,
        mensagem: `Existem caixas ainda abertos de ${formatNames(caixasDiaAnterior.map((caixa) => caixa.data), 2)}. Revise e feche para evitar distorcao no fechamento.`,
        acao: 'Ver caixa',
        acao_rota: '/finance',
      })
    );
  }

  if (openCaixas.length > 1) {
    alerts.push(
      createAlert({
        chave: 'caixa:multiplos-abertos',
        tipo: 'atencao',
        prioridade: 3,
        titulo: `${openCaixas.length} caixas abertos ao mesmo tempo`,
        mensagem: `Foram encontrados varios caixas abertos: ${formatNames(openCaixas.map((caixa) => `#${caixa.id} (${caixa.data})`), 3)}.`,
        acao: 'Ver caixa',
        acao_rota: '/finance',
      })
    );
  }

  if (!openCaixas.some((caixa) => String(caixa.data || '') === today)) {
    alerts.push(
      createAlert({
        chave: 'caixa:nao-aberto-hoje',
        tipo: 'alerta',
        prioridade: 2,
        titulo: 'Caixa nao aberto hoje',
        mensagem: `Nao existe caixa aberto para ${today}. Se a operacao ja comecou, abra o caixa para manter vendas e fechamento consistentes.`,
        acao: 'Abrir caixa',
        acao_rota: '/finance',
      })
    );
  }

  const resetCount = Number(resetAgg?.total || 0);
  if (resetCount > 0) {
    const latestAt = formatDateTime(resetAgg?.latest_at || null);
    alerts.push(
      createAlert({
        chave: 'caixa:reset-admin-recente',
        tipo: 'alerta',
        prioridade: 2,
        titulo: 'Reset administrativo de caixa recente',
        mensagem: latestAt
          ? `${resetCount} reset(s) administrativo(s) de caixa nas ultimas 24h. Ultimo registro em ${latestAt}.`
          : `${resetCount} reset(s) administrativo(s) de caixa nas ultimas 24h.`,
        acao: 'Ver caixa',
        acao_rota: '/finance',
      })
    );
  }

  return alerts;
}

async function buildOperationalAlerts(tenantId: number): Promise<DeterministicAlert[]> {
  const [
    orderRows,
    automationEventAgg,
    automationLogAgg,
    automationOrderNumbers,
    cancelStats,
    refundStats,
  ] = await Promise.all([
    qAll<StuckOrderRow>(
      `SELECT
         order_number,
         status,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)::int AS age_minutes
       FROM pedidos
       WHERE tenant_id=?
         AND cancelado_at IS NULL
         AND LOWER(COALESCE(status, '')) NOT IN ('cancelado', 'concluido', 'concluído', 'entregue')
       ORDER BY created_at ASC, id ASC`,
      [tenantId]
    ),
    q1<LogAggregateRow>(
      `SELECT
         COUNT(*)::int AS total,
         MAX(created_at) AS latest_at
       FROM pedido_eventos
       WHERE tenant_id=?
         AND tipo='AUTOMATION_COZINHA_FALHA'
         AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`,
      [tenantId]
    ),
    q1<LogAggregateRow>(
      `SELECT
         COUNT(*)::int AS total,
         MAX(created_at) AS latest_at
       FROM system_logs
       WHERE tenant_id=?
         AND acao='AUTOMATION_COZINHA_FALHA'
         AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`,
      [tenantId]
    ),
    qAll<OrderNumberRow>(
      `SELECT DISTINCT p.order_number
       FROM pedido_eventos pe
       JOIN pedidos p ON p.id=pe.pedido_id AND p.tenant_id=pe.tenant_id
       WHERE pe.tenant_id=?
         AND pe.tipo='AUTOMATION_COZINHA_FALHA'
         AND (pe.created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date
       ORDER BY p.order_number DESC
       LIMIT 3`,
      [tenantId]
    ),
    getDailyOrderMetric({
      tenantId,
      dateColumn: 'cancelado_at',
      extraWhere: '',
      valueExpression: '0',
    }),
    getDailyOrderMetric({
      tenantId,
      dateColumn: 'reembolsado_at',
      extraWhere: `AND COALESCE(reembolso_status, 'nenhum') <> 'nenhum' AND COALESCE(valor_reembolsado, 0) > 0`,
      valueExpression: 'valor_reembolsado',
    }),
  ]);

  const alerts: DeterministicAlert[] = [];
  const pedidosTravados = orderRows
    .map((row) => ({
      ...row,
      ageMinutes: Number(row.age_minutes || 0),
    }))
    .filter((row) => row.ageMinutes >= getStuckThresholdMinutes(row.status));

  if (pedidosTravados.length > 0) {
    const oldest = pedidosTravados[0];
    alerts.push(
      createAlert({
        chave: 'operacao:pedidos-travados',
        tipo: 'atencao',
        prioridade: 3,
        titulo: `${pedidosTravados.length} pedido(s) travado(s) na operacao`,
        mensagem: `Pedidos presos por tempo excessivo em um mesmo status. Mais antigo: #${oldest.order_number} em "${oldest.status}" ha ${formatMinutes(oldest.ageMinutes)}.`,
        acao: 'Ver pedidos',
        acao_rota: '/orders',
      })
    );
  }

  const automationFailureCount =
    Number(automationEventAgg?.total || 0) + Number(automationLogAgg?.total || 0);
  if (automationFailureCount > 0) {
    const latestEventAt = automationEventAgg?.latest_at || null;
    const latestLogAt = automationLogAgg?.latest_at || null;
    const latestAt =
      latestEventAt && latestLogAt
        ? new Date(latestEventAt) > new Date(latestLogAt)
          ? latestEventAt
          : latestLogAt
        : latestEventAt || latestLogAt;

    alerts.push(
      createAlert({
        chave: 'operacao:falha-impressao-automacao',
        tipo: 'atencao',
        prioridade: 3,
        titulo: `${automationFailureCount} falha(s) de impressao/automacao hoje`,
        mensagem: `Falhas registradas na automacao operacional${automationOrderNumbers.length ? ` em pedidos ${formatNames(automationOrderNumbers.map((row) => `#${row.order_number}`), 3)}` : ''}${latestAt ? ` ate ${formatDateTime(latestAt)}` : ''}.`,
        acao: 'Ver pedidos',
        acao_rota: '/orders',
      })
    );
  }

  if (shouldTriggerVolumeAlert(cancelStats.totalToday, cancelStats.avgDaily, 3)) {
    alerts.push(
      createAlert({
        chave: 'operacao:cancelamentos-acima-normal',
        tipo: 'alerta',
        prioridade: 2,
        titulo: 'Cancelamentos acima do normal hoje',
        mensagem: `Hoje ja houve ${cancelStats.totalToday} cancelamento(s). Media diaria dos ultimos ${BASELINE_WINDOW_DAYS} dias: ${formatNumber(cancelStats.avgDaily)}.`,
        acao: 'Ver pedidos',
        acao_rota: '/orders',
      })
    );
  }

  if (shouldTriggerVolumeAlert(refundStats.totalToday, refundStats.avgDaily, 2)) {
    alerts.push(
      createAlert({
        chave: 'operacao:reembolsos-acima-normal',
        tipo: 'alerta',
        prioridade: 2,
        titulo: 'Reembolsos acima do normal hoje',
        mensagem: `Hoje ja houve ${refundStats.totalToday} reembolso(s), somando ${formatMoney(refundStats.valueToday)}. Media diaria recente: ${formatNumber(refundStats.avgDaily)}.`,
        acao: 'Ver pedidos',
        acao_rota: '/orders',
      })
    );
  }

  return alerts;
}

async function buildStockAlerts(tenantId: number): Promise<DeterministicAlert[]> {
  const [abaixoMinimoRows, zeradoRows, produtosSemVinculoRows] = await Promise.all([
    qAll<NamedCountRow>(
      `SELECT
         nome,
         COUNT(*) OVER() AS total_count
       FROM ingredientes
       WHERE tenant_id=?
         AND estoque_minimo > 0
         AND estoque_atual > 0
         AND estoque_atual < estoque_minimo
       ORDER BY estoque_atual ASC, nome ASC
       LIMIT 5`,
      [tenantId]
    ),
    qAll<NamedCountRow>(
      `SELECT
         nome,
         COUNT(*) OVER() AS total_count
       FROM ingredientes
       WHERE tenant_id=?
         AND estoque_atual <= 0
       ORDER BY nome ASC
       LIMIT 5`,
      [tenantId]
    ),
    qAll<NamedCountRow>(
      `SELECT
         p.name,
         COUNT(*) OVER() AS total_count
       FROM produtos p
       WHERE p.tenant_id=?
         AND COALESCE(p.active, 1) = 1
         AND NOT EXISTS (
           SELECT 1
           FROM produto_ingrediente pi
           WHERE pi.product_id=p.id
             AND pi.tenant_id=p.tenant_id
         )
         AND NOT EXISTS (
           SELECT 1
           FROM ingredientes i
           WHERE i.tenant_id=p.tenant_id
             AND p.codigo_barras IS NOT NULL
             AND i.codigo_barras IS NOT NULL
             AND UPPER(REGEXP_REPLACE(BTRIM(i.codigo_barras), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(BTRIM(p.codigo_barras), '\\s+', '', 'g'))
         )
         AND NOT EXISTS (
           SELECT 1
           FROM produto_variacoes_vendaveis pv
           WHERE pv.produto_id=p.id
             AND pv.tenant_id=p.tenant_id
             AND COALESCE(pv.ativo, 1) = 1
             AND (
               (pv.ingrediente_id IS NOT NULL AND pv.ingrediente_id > 0)
               OR (
                 pv.codigo_barras IS NOT NULL
                 AND EXISTS (
                   SELECT 1
                   FROM ingredientes i2
                   WHERE i2.tenant_id=pv.tenant_id
                     AND i2.codigo_barras IS NOT NULL
                     AND UPPER(REGEXP_REPLACE(BTRIM(i2.codigo_barras), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(BTRIM(pv.codigo_barras), '\\s+', '', 'g'))
                 )
               )
             )
         )
       ORDER BY p.name ASC
       LIMIT 5`,
      [tenantId]
    ),
  ]);

  const alerts: DeterministicAlert[] = [];
  const abaixoMinimoCount = Number(abaixoMinimoRows[0]?.total_count || 0);
  const zeradoCount = Number(zeradoRows[0]?.total_count || 0);
  const produtosSemVinculoCount = Number(produtosSemVinculoRows[0]?.total_count || 0);

  if (abaixoMinimoCount > 0) {
    alerts.push(
      createAlert({
        chave: 'estoque:abaixo-minimo',
        tipo: 'alerta',
        prioridade: 2,
        titulo: `${abaixoMinimoCount} item(ns) abaixo do estoque minimo`,
        mensagem: `Itens abaixo do minimo: ${formatNames(abaixoMinimoRows.map((row) => row.nome), 4)}.`,
        acao: 'Ver estoque',
        acao_rota: '/estoque',
      })
    );
  }

  if (zeradoCount > 0) {
    alerts.push(
      createAlert({
        chave: 'estoque:item-zerado',
        tipo: 'atencao',
        prioridade: 3,
        titulo: `${zeradoCount} item(ns) zerado(s) no estoque`,
        mensagem: `Itens sem saldo: ${formatNames(zeradoRows.map((row) => row.nome), 4)}.`,
        acao: 'Ver estoque',
        acao_rota: '/estoque',
      })
    );
  }

  if (produtosSemVinculoCount > 0) {
    alerts.push(
      createAlert({
        chave: 'estoque:produto-sem-vinculo',
        tipo: 'alerta',
        prioridade: 2,
        titulo: `${produtosSemVinculoCount} produto(s) ativo(s) sem vinculo de estoque`,
        mensagem: `Produtos ativos sem ficha tecnica ou vinculo explicito de estoque: ${formatNames(produtosSemVinculoRows.map((row) => row.name), 4)}.`,
        acao: 'Ver estoque',
        acao_rota: '/estoque',
      })
    );
  }

  return alerts;
}

/** Expira outras linhas ativas com a mesma chave; mantém um único registro canônico (maior id). */
async function expireDuplicateActiveAlerts(tenantId: number, chave: string, keepId: number) {
  const kid = Number(keepId);
  if (!chave || !Number.isInteger(kid) || kid <= 0) return;
  await qRun(
    `UPDATE ai_avisos SET expira_em = NOW()
     WHERE tenant_id = ?
       AND chave = ?
       AND id <> ?
       AND (expira_em IS NULL OR expira_em > NOW())`,
    [tenantId, chave, kid]
  );
}

async function applyAlertUpdate(
  tenantId: number,
  alert: DeterministicAlert,
  rowId: number | string
) {
  await qRun(
    `UPDATE ai_avisos
     SET tipo=?,
         titulo=?,
         mensagem=?,
         acao=?,
         acao_rota=?,
         prioridade=?,
         expira_em=NULL
     WHERE id=? AND tenant_id=?`,
    [
      alert.tipo,
      alert.titulo,
      alert.mensagem,
      alert.acao || null,
      alert.acao_rota || null,
      alert.prioridade,
      rowId,
      tenantId,
    ]
  );
}

/**
 * Remove duplicatas ativas de alertas determinísticos (sys:*) por tenant/chave.
 * Mantém o registro com maior id (mais recente); demais recebem expira_em.
 */
async function dedupeActiveSystemAlertsForTenant(tenantId: number) {
  await qRun(
    `WITH dups AS (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY tenant_id, chave
                ORDER BY id DESC
              ) AS rn
       FROM ai_avisos
       WHERE tenant_id = ?
         AND chave IS NOT NULL
         AND chave LIKE 'sys:%'
         AND (expira_em IS NULL OR expira_em > NOW())
     )
     UPDATE ai_avisos a
     SET expira_em = NOW()
     FROM dups d
     WHERE a.id = d.id AND d.rn > 1`,
    [tenantId]
  );
}

async function upsertAlert(tenantId: number, alert: DeterministicAlert): Promise<SyncStatus> {
  const existing = await q1<ExistingAlertRow>(
    `SELECT id
     FROM ai_avisos
     WHERE tenant_id=?
       AND chave=?
       AND (expira_em IS NULL OR expira_em > NOW())
     ORDER BY id DESC
     LIMIT 1`,
    [tenantId, alert.chave]
  );

  if (existing) {
    await applyAlertUpdate(tenantId, alert, existing.id);
    await expireDuplicateActiveAlerts(tenantId, alert.chave, Number(existing.id));
    return 'updated';
  }

  try {
    const newId = await qInsert(
      `INSERT INTO ai_avisos
        (tenant_id, tipo, titulo, mensagem, acao, acao_rota, prioridade, chave)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        tenantId,
        alert.tipo,
        alert.titulo,
        alert.mensagem,
        alert.acao || null,
        alert.acao_rota || null,
        alert.prioridade,
        alert.chave,
      ]
    );
    if (newId != null) {
      await expireDuplicateActiveAlerts(tenantId, alert.chave, Number(newId));
    }
    return 'inserted';
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code?: string }).code) : '';
    if (code !== '23505') throw e;
    const winner = await q1<ExistingAlertRow>(
      `SELECT id
       FROM ai_avisos
       WHERE tenant_id=?
         AND chave=?
         AND (expira_em IS NULL OR expira_em > NOW())
       ORDER BY id DESC
       LIMIT 1`,
      [tenantId, alert.chave]
    );
    if (!winner) throw e;
    await applyAlertUpdate(tenantId, alert, winner.id);
    await expireDuplicateActiveAlerts(tenantId, alert.chave, Number(winner.id));
    return 'updated';
  }
}

async function expireInactiveAlerts(tenantId: number, activeKeys: Set<string>) {
  const activeRows = await qAll<ActiveAlertRow>(
    `SELECT id, chave
     FROM ai_avisos
     WHERE tenant_id=?
       AND chave LIKE ?
       AND (expira_em IS NULL OR expira_em > NOW())`,
    [tenantId, `${SYSTEM_ALERT_KEY_PREFIX}%`]
  );

  const idsToExpire = activeRows
    .filter((row) => !activeKeys.has(String(row.chave || '')))
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (idsToExpire.length === 0) {
    return 0;
  }

  await qRun(
    `UPDATE ai_avisos
     SET expira_em=NOW()
     WHERE tenant_id=?
       AND id IN (${idsToExpire.map(() => '?').join(',')})`,
    [tenantId, ...idsToExpire]
  );

  return idsToExpire.length;
}

export async function refreshDeterministicAlerts(tenantId: number): Promise<RefreshDeterministicAlertsResult> {
  const plan = await getTenantPlanContext(tenantId);
  const features = plan.features;

  const builders: Array<{
    scope: string;
    fn: () => Promise<DeterministicAlert[]>;
  }> = [
    { scope: 'comercial', fn: () => buildCommercialAlerts(tenantId, features) },
  ];

  if (features.includes('ai')) {
    builders.push({ scope: 'caixa', fn: () => buildCashAlerts(tenantId) });
    builders.push({ scope: 'operacao', fn: () => buildOperationalAlerts(tenantId) });
    if (features.includes('estoque')) {
      builders.push({ scope: 'estoque', fn: () => buildStockAlerts(tenantId) });
    }
  }

  const settled = await Promise.allSettled(builders.map((b) => b.fn()));

  const alerts = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const scope = builders[index]?.scope || 'desconhecido';
    console.error(`[alerts] falha ao gerar alertas de ${scope}:`, result.reason);
    return [];
  });

  let inserted = 0;
  let updated = 0;

  for (const alert of alerts) {
    const status = await upsertAlert(tenantId, alert);
    if (status === 'inserted') inserted += 1;
    if (status === 'updated') updated += 1;
  }

  const expired = await expireInactiveAlerts(
    tenantId,
    new Set(alerts.map((alert) => alert.chave))
  );

  await dedupeActiveSystemAlertsForTenant(tenantId);

  return {
    active: alerts.length,
    inserted,
    updated,
    expired,
  };
}
