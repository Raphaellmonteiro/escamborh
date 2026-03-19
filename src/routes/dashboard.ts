// src/routes/dashboard.ts
import { Router, Request } from 'express';
import { q1, qAll, qRun, qInsert } from '../db';

const TZ = 'America/Sao_Paulo';

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
    params.push(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    return {
      clause: `WHERE tenant_id=? AND ${dateExpr}::date = ?`,
      params,
    };
  }

  if (month && year) {
    params.push(String(month).padStart(2,'0'), String(year));
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
        q1(`SELECT COALESCE(SUM(amount),0) as v FROM despesas ${expensesFilter.clause}`, expensesFilter.params)
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
        productSales: []
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caixa', async (req: Request, res) => {
    const today = new Date().toLocaleString("en-US", { timeZone: TZ }).split(',')[0];
    const d = new Date(today);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    
    let caixa = await q1("SELECT * FROM caixa WHERE data=? AND status='aberto' AND tenant_id=?", [dateStr, req.tenantId]);
    if (!caixa) {
      const u = await q1("SELECT * FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data DESC LIMIT 1", [req.tenantId]);
      if (u) caixa = u;
    }
    if (!caixa) return res.json({ status: 'fechado' });

    const pd = await q1(`SELECT COALESCE(SUM(amount_paid),0) as total FROM pagamentos WHERE (created_at AT TIME ZONE '${TZ}')::date=? AND tenant_id=?`, [caixa.data, req.tenantId]);
    const dd = await q1(`SELECT COALESCE(SUM(amount),0) as total FROM despesas WHERE (created_at AT TIME ZONE '${TZ}')::date=? AND tenant_id=?`, [caixa.data, req.tenantId]);
    
    res.json({ 
      ...caixa, 
      total_vendas: Number(pd?.total || 0), 
      total_despesas: Number(dd?.total || 0) 
    });
  });

  router.post('/abrir-caixa', async (req: Request, res) => {
    const { fundo_inicial, observacao } = req.body;
    const today = new Date().toLocaleString("en-US", { timeZone: TZ }).split(',')[0];
    const d = new Date(today);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    
    const ex = await q1("SELECT * FROM caixa WHERE data=? AND status='aberto' AND tenant_id=?", [dateStr, req.tenantId]);
    if (ex) return res.status(400).json({ success: false, message: 'Já existe um caixa aberto hoje.' });
    await qRun('INSERT INTO caixa (data,fundo_inicial,observacao,status,tenant_id) VALUES (?,?,?,\'aberto\',?)',
      [dateStr, fundo_inicial, observacao, req.tenantId]);
    res.json({ success: true });
  });

  router.post('/fechar-caixa', async (req: Request, res) => {
    const { valor_contado, observacao } = req.body;
    const today = new Date().toLocaleString("en-US", { timeZone: TZ }).split(',')[0];
    const d = new Date(today);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const caixa = await q1("SELECT * FROM caixa WHERE data=? AND status='aberto' AND tenant_id=?", [dateStr, req.tenantId]);
    if (!caixa) return res.status(400).json({ success: false, message: 'Nenhum caixa aberto encontrado.' });
    
    const vd = await q1(
      `SELECT COALESCE(SUM(amount_paid-change_given),0) as total FROM pagamentos WHERE method='Dinheiro' AND (created_at AT TIME ZONE '${TZ}')::date=? AND tenant_id=?`,
      [dateStr, req.tenantId]
    );
    const totalVD = Number(vd?.total || 0);
    const fundo = Number(caixa.fundo_inicial || 0);
    
    await qRun("UPDATE caixa SET valor_contado=?,status='fechado',observacao=?,closed_at=NOW() WHERE id=? AND tenant_id=?",
      [valor_contado, observacao||caixa.observacao, caixa.id, req.tenantId]);
      
    res.json({ success: true, total_vendas_dinheiro: totalVD, total_esperado: fundo + totalVD, diferenca: valor_contado - (fundo + totalVD) });
  });

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
      total_vendas_dinheiro: Number(h.total_vendas_dinheiro || 0)
    })));
  });

  return router;
}
