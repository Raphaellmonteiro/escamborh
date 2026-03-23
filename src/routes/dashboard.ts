// src/routes/dashboard.ts
import { Router, Request } from 'express';
import { q1, qAll, qRun } from '../db';

const TZ = 'America/Sao_Paulo';

function getTodayDateInTimeZone() {
  const today = new Date().toLocaleString('en-US', { timeZone: TZ }).split(',')[0];
  const date = new Date(today);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildPeriodFilter(req: Request, column = 'created_at') {
  const { day, month, year, range } = req.query;
  const dateExpr = `(${column} AT TIME ZONE '${TZ}')`;
  const params: any[] = [req.tenantId];

  if (range === 'today') {
    return {
      clause: `WHERE tenant_id=? AND ${dateExpr}::date = (NOW() AT TIME ZONE '${TZ}')::date`,
      params,
    };
  }

  if (range === 'week') {
    return {
      clause: `WHERE tenant_id=? AND ${dateExpr}::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'`,
      params,
    };
  }

  if (range === 'month') {
    return {
      clause: `WHERE tenant_id=? AND TO_CHAR(${dateExpr},'MM')=TO_CHAR(NOW() AT TIME ZONE '${TZ}','MM') AND TO_CHAR(${dateExpr},'YYYY')=TO_CHAR(NOW() AT TIME ZONE '${TZ}','YYYY')`,
      params,
    };
  }

  if (range === 'all') {
    return {
      clause: `WHERE tenant_id=?`,
      params,
    };
  }

  if (day && month && year) {
    params.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    return {
      clause: `WHERE tenant_id=? AND ${dateExpr}::date = ?`,
      params,
    };
  }

  if (month && year) {
    params.push(String(month).padStart(2, '0'), String(year));
    return {
      clause: `WHERE tenant_id=? AND TO_CHAR(${dateExpr},'MM')=? AND TO_CHAR(${dateExpr},'YYYY')=?`,
      params,
    };
  }

  if (year) {
    params.push(String(year));
    return {
      clause: `WHERE tenant_id=? AND TO_CHAR(${dateExpr},'YYYY')=?`,
      params,
    };
  }

  return {
    clause: `WHERE tenant_id=? AND ${dateExpr}::date = (NOW() AT TIME ZONE '${TZ}')::date`,
    params,
  };
}

async function getOpenCaixa(req: Request) {
  const dateStr = getTodayDateInTimeZone();
  let caixa = await q1("SELECT * FROM caixa WHERE data=? AND status='aberto' AND tenant_id=?", [dateStr, req.tenantId]);

  if (!caixa) {
    caixa = await q1("SELECT * FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data DESC LIMIT 1", [req.tenantId]);
  }

  return caixa;
}

export function createDashboardRouter() {
  const router = Router();

  router.get('/stats', async (req: Request, res) => {
    try {
      const ordersFilter = buildPeriodFilter(req, 'created_at');
      const refundsFilter = buildPeriodFilter(req, 'reembolsado_at');
      const expensesFilter = buildPeriodFilter(req, 'created_at');
      const activeOrdersClause = `${ordersFilter.clause} AND status != 'Cancelado'`;

      const [today, week, monthTotal, filteredTotal, refundedTotal, totalExpenses] = await Promise.all([
        q1(`SELECT COUNT(*) as pedidos, COALESCE(SUM(total_amount),0) as faturamento FROM pedidos WHERE tenant_id=? AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date AND status != 'Cancelado'`, [req.tenantId]),
        q1(`SELECT COUNT(*) as pedidos, COALESCE(SUM(total_amount),0) as faturamento FROM pedidos WHERE tenant_id=? AND (created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days' AND status != 'Cancelado'`, [req.tenantId]),
        q1(`SELECT COUNT(*) as pedidos, COALESCE(SUM(total_amount),0) as faturamento FROM pedidos WHERE tenant_id=? AND TO_CHAR(created_at AT TIME ZONE '${TZ}','MM')=TO_CHAR(NOW() AT TIME ZONE '${TZ}','MM') AND TO_CHAR(created_at AT TIME ZONE '${TZ}','YYYY')=TO_CHAR(NOW() AT TIME ZONE '${TZ}','YYYY') AND status != 'Cancelado'`, [req.tenantId]),
        q1(`SELECT COUNT(*) as pedidos, COALESCE(SUM(total_amount),0) as faturamento FROM pedidos ${activeOrdersClause}`, ordersFilter.params),
        q1(
          `SELECT COALESCE(SUM(valor_reembolsado),0) as total
           FROM pedidos
           ${refundsFilter.clause}
             AND COALESCE(reembolso_status,'nenhum') != 'nenhum'
             AND COALESCE(valor_reembolsado,0) > 0`,
          refundsFilter.params
        ),
        q1(`SELECT COALESCE(SUM(amount),0) as v FROM despesas ${expensesFilter.clause}`, expensesFilter.params),
      ]);

      const totalPedidos = Number(filteredTotal?.pedidos || 0);
      const receitaOperacional = Number(filteredTotal?.faturamento || 0);
      const totalRefunded = Number(refundedTotal?.total || 0);
      const netRevenue = receitaOperacional - totalRefunded;
      const totalExpensesValue = Number(totalExpenses?.v || 0);

      res.json({
        hoje: { pedidos: Number(today?.pedidos || 0), faturamento: Number(today?.faturamento || 0) },
        semana: { pedidos: Number(week?.pedidos || 0), faturamento: Number(week?.faturamento || 0) },
        mes: { pedidos: Number(monthTotal?.pedidos || 0), faturamento: Number(monthTotal?.faturamento || 0) },
        totalFiltrado: { pedidos: totalPedidos, faturamento: receitaOperacional },
        despesas: totalExpensesValue,
        today: Number(today?.faturamento || 0),
        week: Number(week?.faturamento || 0),
        month: Number(monthTotal?.faturamento || 0),
        filteredTotal: receitaOperacional,
        totalPedidos,
        ticketMedio: totalPedidos > 0 ? receitaOperacional / totalPedidos : 0,
        totalExpenses: totalExpensesValue,
        totalRefunded,
        netRevenue,
        totalRepassesPagos: 0,
        productSales: [],
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/weekly', async (req: Request, res) => {
    try {
      const rows = await qAll(
        `SELECT
           TO_CHAR((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') as dia,
           COUNT(*) as pedidos,
           COALESCE(SUM(total_amount),0) as total
         FROM pedidos
         WHERE tenant_id=?
           AND status != 'Cancelado'
           AND (created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'
         GROUP BY 1
         ORDER BY 1 ASC`,
        [req.tenantId]
      );

      const rowMap = new Map(
        rows.map((row: any) => [
          row.dia,
          {
            pedidos: Number(row.pedidos || 0),
            total: Number(row.total || 0),
          },
        ])
      );

      const baseDate = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
      baseDate.setHours(0, 0, 0, 0);

      const result = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() - (6 - index));

        const dia = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const row = rowMap.get(dia);

        return {
          dia,
          label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
          pedidos: row?.pedidos ?? 0,
          total: row?.total ?? 0,
        };
      });

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/cash-report', async (req: Request, res) => {
    try {
      const paymentsFilter = buildPeriodFilter(req, 'created_at');
      const totals = await q1(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN LOWER(COALESCE(method,'')) = 'dinheiro'
               THEN amount_paid - COALESCE(change_given,0)
               ELSE amount_paid
             END
           ),0) as total,
           COALESCE(SUM(
             CASE
               WHEN LOWER(COALESCE(method,'')) = 'dinheiro'
               THEN amount_paid - COALESCE(change_given,0)
               ELSE 0
             END
           ),0) as cash,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(method,'')) = 'pix' THEN amount_paid ELSE 0 END),0) as pix,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(method,'')) IN ('debito','débito') THEN amount_paid ELSE 0 END),0) as debit,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(method,'')) IN ('credito','crédito') THEN amount_paid ELSE 0 END),0) as credit
         FROM pagamentos
         ${paymentsFilter.clause}`,
        paymentsFilter.params
      );

      res.json({
        total: Number(totals?.total || 0),
        cash: Number(totals?.cash || 0),
        pix: Number(totals?.pix || 0),
        debit: Number(totals?.debit || 0),
        credit: Number(totals?.credit || 0),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const getCaixaHandler = async (req: Request, res: any) => {
    const caixa = await getOpenCaixa(req);
    if (!caixa) return res.json({ status: 'fechado' });

    const pd = await q1(`SELECT COALESCE(SUM(amount_paid),0) as total FROM pagamentos WHERE (created_at AT TIME ZONE '${TZ}')::date=? AND tenant_id=?`, [caixa.data, req.tenantId]);
    const dd = await q1(`SELECT COALESCE(SUM(amount),0) as total FROM despesas WHERE (created_at AT TIME ZONE '${TZ}')::date=? AND tenant_id=?`, [caixa.data, req.tenantId]);

    return res.json({
      ...caixa,
      total_vendas: Number(pd?.total || 0),
      total_despesas: Number(dd?.total || 0),
    });
  };

  router.get('/caixa', getCaixaHandler);
  router.get('/hoje', getCaixaHandler);

  const openCaixaHandler = async (req: Request, res: any) => {
    const { fundo_inicial, observacao } = req.body;
    const dateStr = getTodayDateInTimeZone();

    const ex = await q1("SELECT * FROM caixa WHERE data=? AND status='aberto' AND tenant_id=?", [dateStr, req.tenantId]);
    if (ex) return res.status(400).json({ success: false, message: 'Ja existe um caixa aberto hoje.' });

    await qRun(
      "INSERT INTO caixa (data,fundo_inicial,observacao,status,tenant_id) VALUES (?,?,?,'aberto',?)",
      [dateStr, fundo_inicial, observacao, req.tenantId]
    );

    return res.json({ success: true });
  };

  router.post('/abrir-caixa', openCaixaHandler);
  router.post('/abrir', openCaixaHandler);

  const closeCaixaHandler = async (req: Request, res: any) => {
    const { valor_contado, observacao } = req.body;

    const caixa = await getOpenCaixa(req);
    if (!caixa) return res.status(400).json({ success: false, message: 'Nenhum caixa aberto encontrado.' });

    const vd = await q1(
      `SELECT COALESCE(SUM(amount_paid-change_given),0) as total
       FROM pagamentos
       WHERE method='Dinheiro' AND (created_at AT TIME ZONE '${TZ}')::date=? AND tenant_id=?`,
      [caixa.data, req.tenantId]
    );
    const totalVD = Number(vd?.total || 0);
    const fundo = Number(caixa.fundo_inicial || 0);

    await qRun(
      "UPDATE caixa SET valor_contado=?,status='fechado',observacao=?,closed_at=NOW() WHERE id=? AND tenant_id=?",
      [valor_contado, observacao || caixa.observacao, caixa.id, req.tenantId]
    );

    return res.json({
      success: true,
      total_vendas_dinheiro: totalVD,
      total_esperado: fundo + totalVD,
      diferenca: valor_contado - (fundo + totalVD),
    });
  };

  router.post('/fechar-caixa', closeCaixaHandler);
  router.post('/fechar', closeCaixaHandler);

  router.get('/historico', async (req: Request, res) => {
    const history = await qAll(
      `SELECT c.*, (SELECT COALESCE(SUM(amount_paid-change_given),0) FROM pagamentos WHERE method='Dinheiro' AND (created_at AT TIME ZONE '${TZ}')::date::text=c.data AND tenant_id=c.tenant_id) as total_vendas_dinheiro
       FROM caixa c WHERE c.tenant_id=? ORDER BY c.data DESC LIMIT 30`,
      [req.tenantId]
    );

    res.json(history.map((h: any) => ({
      ...h,
      fundo_inicial: Number(h.fundo_inicial || 0),
      valor_contado: Number(h.valor_contado || 0),
      total_vendas_dinheiro: Number(h.total_vendas_dinheiro || 0),
    })));
  });

  return router;
}
