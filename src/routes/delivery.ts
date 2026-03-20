// src/routes/delivery.ts — rotas autenticadas do painel delivery
import { Router, Request } from 'express';
import { q1, qAll, qRun, qInsert, withTx, txQ1, txQAll, txRun, txInsert } from '../db';

const TZ = 'America/Sao_Paulo';
const ACTIVE_CUSTOMER_DAYS = 30;
const INACTIVE_CUSTOMER_DAYS = 60;

function isCanceledOrder(order?: { status?: string | null; cancelado_at?: string | null } | null) {
  return Boolean(order?.cancelado_at) || String(order?.status || '').trim().toLowerCase() === 'cancelado';
}

function buildNotCanceledOrderClause(alias?: string) {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}cancelado_at IS NULL AND LOWER(COALESCE(${prefix}status,'')) <> 'cancelado'`;
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function classifyCustomerActivity(totalValidOrders: number, daysWithoutPurchase: number | null) {
  if (totalValidOrders <= 0 || daysWithoutPurchase === null) return 'sem_compra';
  if (daysWithoutPurchase <= ACTIVE_CUSTOMER_DAYS) return 'ativo';
  if (daysWithoutPurchase <= INACTIVE_CUSTOMER_DAYS) return 'em_risco';
  return 'inativo';
}

async function findOrCreateDeliveryCustomerFromOrder(input: {
  tenantId: number;
  nome?: unknown;
  telefone?: unknown;
  origemCadastro: string;
}) {
  const telefone = normalizePhone(input.telefone);
  const nome = String(input.nome || '').trim();

  if (!telefone) return null;

  const existing = await q1(
    'SELECT id, nome, origem_cadastro FROM delivery_clientes WHERE tenant_id=? AND telefone=?',
    [input.tenantId, telefone]
  );

  if (existing) {
    if ((!existing.nome || !String(existing.nome).trim()) && nome) {
      await qRun('UPDATE delivery_clientes SET nome=? WHERE id=? AND tenant_id=?', [nome, existing.id, input.tenantId]);
    }

    if (!existing.origem_cadastro || !String(existing.origem_cadastro).trim()) {
      await qRun('UPDATE delivery_clientes SET origem_cadastro=? WHERE id=? AND tenant_id=?', [input.origemCadastro, existing.id, input.tenantId]);
    }

    return Number(existing.id);
  }

  if (!nome) return null;

  const createdId = await qInsert(
    `INSERT INTO delivery_clientes
      (tenant_id, nome, telefone, origem_cadastro, primeira_compra_at, ultima_compra_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [input.tenantId, nome, telefone, input.origemCadastro]
  );

  return Number(createdId);
}

async function touchDeliveryCustomerPurchase(params: {
  clienteId: number;
  tenantId: number;
  origemCadastro?: string | null;
}) {
  await qRun(
    `UPDATE delivery_clientes
     SET primeira_compra_at = COALESCE(primeira_compra_at, NOW()),
         ultima_compra_at = NOW(),
         origem_cadastro = CASE
           WHEN (origem_cadastro IS NULL OR BTRIM(origem_cadastro) = '')
             AND COALESCE(?, '') <> ''
           THEN ?
           ELSE COALESCE(origem_cadastro, 'delivery_online')
         END
     WHERE id=? AND tenant_id=?`,
    [
      params.origemCadastro || null,
      params.origemCadastro || null,
      params.clienteId,
      params.tenantId,
    ]
  );
}

export function createDeliveryRouter() {
  const router = Router();

  router.get('/config', async (req: Request, res) => {
    try {
      const row = await q1('SELECT delivery_ativo, delivery_config FROM clientes WHERE id=?', [req.tenantId]);
      const cfg = row?.delivery_config ? JSON.parse(row.delivery_config) : {};
      res.json({ ativo: !!row?.delivery_ativo, ...cfg });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/config', async (req: Request, res) => {
    try {
      const { ativo, ...rest } = req.body;
      await qRun('UPDATE clientes SET delivery_ativo=?, delivery_config=? WHERE id=?', [ativo?1:0, JSON.stringify(rest), req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.get('/pedidos', async (req: Request, res) => {
    try {
      const { status, limit = 100 } = req.query;
      let q = `SELECT p.*, dc.nome as motoboy_nome,
        (SELECT STRING_AGG(pr.name || ' x' || ip.quantity::text, ', ')
         FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
        FROM pedidos p LEFT JOIN delivery_motoboys dc ON dc.id=p.motoboy_id AND dc.tenant_id=p.tenant_id
        WHERE p.tenant_id=? AND p.canal='delivery'`;
      const params: any[] = [req.tenantId];

      if (status) {
        const statusList = String(status).split(',');
        const mapped: string[] = [];
        
        // Mapeia os status que a tela pede para os status reais do Banco de Dados
        for (const s of statusList) {
          const tr = s.trim();
          mapped.push(tr);
          if (tr === 'Recebido') mapped.push('Criado', 'Pedido Recebido');
          if (tr === 'Pronto') mapped.push('Pronto para Entrega');
          if (tr === 'Em Rota') mapped.push('Saiu para Entrega');
        }
        
        const uniqueStatus = [...new Set(mapped)];
        const placeholders = uniqueStatus.map(() => '?').join(',');
        q += ` AND p.status IN (${placeholders})`;
        params.push(...uniqueStatus);
      }
      q += ' ORDER BY p.created_at DESC LIMIT ?'; params.push(Number(limit));

      const rows = await qAll(q, params);
      res.json(rows.map((p: any) => ({
        ...p,
        total_amount: Number(p.total_amount || 0),
        taxa_entrega: Number(p.taxa_entrega || 0)
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/pedidos/:id/status', async (req: Request, res) => {
    try {
      const order = await q1('SELECT status, cancelado_at, canal FROM pedidos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (isCanceledOrder(order)) return res.status(400).json({ error: 'Pedido cancelado nao pode voltar ao fluxo operacional' });
      if (String(order.canal || '').trim().toLowerCase() !== 'delivery') {
        return res.status(400).json({ error: 'Este fluxo aceita apenas pedidos de delivery' });
      }

      const { status, motoboy_id } = req.body;
      const updates: string[] = ['status=?'];
      const params: any[] = [status];
      if (motoboy_id) { updates.push('motoboy_id=?'); params.push(motoboy_id); }
      if (status === 'Saiu para Entrega') { updates.push('saiu_entrega_at=NOW()'); }
      if (status === 'Entregue')          { updates.push('entregue_at=NOW()'); }
      params.push(req.params.id, req.tenantId);
      await qRun(`UPDATE pedidos SET ${updates.join(',')} WHERE id=? AND tenant_id=?`, params);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/pedidos/:id/pagamento', async (req: Request, res) => {
    try {
      const order = await q1('SELECT status, cancelado_at FROM pedidos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (isCanceledOrder(order)) return res.status(400).json({ error: 'Pedido cancelado nao pode ter pagamento alterado aqui' });

      await qRun('UPDATE pedidos SET pagamento_status=? WHERE id=? AND tenant_id=?', [req.body.pagamento_status, req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/motoboys', async (req: Request, res) => {
    try {
      const funcMotoboys = await qAll("SELECT id,nome,telefone FROM funcionarios WHERE tenant_id=? AND status='ativo' AND LOWER(cargo) LIKE '%motoboy%'", [req.tenantId]);
      if (funcMotoboys.length > 0) {
        for (const f of funcMotoboys) {
          await qRun(
            `INSERT INTO delivery_motoboys (tenant_id, nome, telefone, ativo) VALUES (?,?,?,1) ON CONFLICT(tenant_id, nome) DO UPDATE SET ativo=1, telefone=EXCLUDED.telefone`,
            [req.tenantId, f.nome, f.telefone||null]
          );
        }
      }
      res.json(await qAll('SELECT * FROM delivery_motoboys WHERE tenant_id=? AND ativo=1 ORDER BY nome', [req.tenantId]));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/motoboys/relatorio', async (req: Request, res) => {
    try {
      const { month, year, inicio, fim } = req.query;
      let dataInicio: string, dataFim: string;
      if (month && year) {
        const m = String(month).padStart(2, '0'), y = String(year);
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        dataInicio = `${y}-${m}-01`; dataFim = `${y}-${m}-${String(lastDay).padStart(2,'0')}`;
      } else {
        dataInicio = String(inicio || '1900-01-01'); dataFim = String(fim || '2100-12-31');
      }
      const cfgRow = await q1('SELECT delivery_config FROM clientes WHERE id=?', [req.tenantId]);
      const cfg = cfgRow?.delivery_config ? JSON.parse(cfgRow.delivery_config) : {};
      const valorPorEntrega = Number(cfg.valor_por_entrega) || 0;
      const rows = await qAll(
        `SELECT m.id, m.nome, COUNT(p.id) as total_entregas,
          COALESCE(AVG(CASE WHEN p.saiu_entrega_at IS NOT NULL AND p.entregue_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (p.entregue_at - p.saiu_entrega_at))/60 END),0) as tempo_medio_min
         FROM delivery_motoboys m
         LEFT JOIN pedidos p ON p.motoboy_id=m.id AND p.tenant_id=m.tenant_id
           AND p.status='Entregue' AND (p.entregue_at AT TIME ZONE '${TZ}')::date BETWEEN ? AND ?
         WHERE m.tenant_id=? GROUP BY m.id ORDER BY total_entregas DESC`,
        [dataInicio, dataFim, req.tenantId]
      );
      res.json(rows.map((r: any) => ({ ...r, valor_por_entrega: valorPorEntrega, total_a_pagar: r.total_entregas * valorPorEntrega })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.get('/dashboard', async (req: Request, res) => {
    try {
      // Usamos a data do banco (Postgres) para evitar diferença de fuso horário com o Node.js
      const notCanceledOrderClause = buildNotCanceledOrderClause();
      const [pedidosHoje, emPreparo, emRota, ticketMedio, topMotoboy] = await Promise.all([
        q1(`SELECT COUNT(*) as n, COALESCE(SUM(total_amount),0) as fat FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`, [req.tenantId]),
        q1(`SELECT COUNT(*) as n FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND status IN ('Criado','Pedido Recebido','Em Preparo')`, [req.tenantId]),
        q1(`SELECT COUNT(*) as n FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND status='Saiu para Entrega'`, [req.tenantId]),
        q1(`SELECT COALESCE(AVG(total_amount),0) as v FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`, [req.tenantId]),
        q1(`SELECT m.nome, COUNT(p.id) as entregas FROM delivery_motoboys m JOIN pedidos p ON p.motoboy_id=m.id AND p.tenant_id=m.tenant_id WHERE m.tenant_id=? AND p.cancelado_at IS NULL AND LOWER(COALESCE(p.status,'')) <> 'cancelado' AND (p.entregue_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date GROUP BY m.id ORDER BY entregas DESC LIMIT 1`, [req.tenantId]),
      ]);

      // Conversão obrigatória para Number porque o Postgres retorna SUM/COUNT como String
      res.json({
        pedidos_hoje: Number(pedidosHoje?.n || 0),
        faturamento_hoje: Number(pedidosHoje?.fat || 0),
        em_preparo: Number(emPreparo?.n || 0),
        em_rota: Number(emRota?.n || 0),
        ticket_medio: Number(ticketMedio?.v || 0),
        top_motoboy: topMotoboy || null
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.get('/clientes', async (req: Request, res) => {
    try {
      const { search } = req.query;
      const notCanceledOrderClauseSummary = buildNotCanceledOrderClause('p');
      let summaryQuery = `
        SELECT c.*,
          metrics.total_pedidos,
          metrics.total_pedidos_validos,
          metrics.total_gasto,
          COALESCE(c.primeira_compra_at, metrics.primeira_compra_at) as primeira_compra_at_calc,
          COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) as ultima_compra_at_calc,
          CASE
            WHEN COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) IS NULL THEN NULL
            ELSE FLOOR(
              EXTRACT(
                EPOCH FROM (
                  (NOW() AT TIME ZONE '${TZ}')
                  - (COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) AT TIME ZONE '${TZ}')
                )
              ) / 86400
            )::int
          END as dias_sem_comprar
        FROM delivery_clientes c
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE ${notCanceledOrderClauseSummary}) as total_pedidos_validos,
            COALESCE(SUM(CASE WHEN ${notCanceledOrderClauseSummary} THEN total_amount ELSE 0 END), 0) as total_gasto,
            MIN(created_at) FILTER (WHERE ${notCanceledOrderClauseSummary}) as primeira_compra_at,
            MAX(created_at) FILTER (WHERE ${notCanceledOrderClauseSummary}) as ultima_compra_at
          FROM pedidos p
          WHERE p.delivery_cliente_id = c.id
            AND p.tenant_id = c.tenant_id
        ) metrics ON TRUE
        WHERE c.tenant_id=?
      `;
      const summaryParams: any[] = [req.tenantId];
      if (search) {
        summaryQuery += ' AND (c.nome ILIKE ? OR c.telefone ILIKE ? OR COALESCE(c.email, \'\') ILIKE ? OR COALESCE(c.observacoes, \'\') ILIKE ?)';
        const term = `%${search}%`;
        summaryParams.push(term, term, term, term);
      }
      summaryQuery += ' ORDER BY COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) DESC NULLS LAST, c.nome ASC LIMIT 200';
      const summaryRows = await qAll(summaryQuery, summaryParams);
      return res.json(summaryRows.map((row: any) => {
        const totalPedidos = Number(row.total_pedidos || 0);
        const totalPedidosValidos = Number(row.total_pedidos_validos || 0);
        const diasSemComprar = row.dias_sem_comprar === null || row.dias_sem_comprar === undefined
          ? null
          : Number(row.dias_sem_comprar);
        const ultimaCompraAt = row.ultima_compra_at_calc || null;

        return {
          ...row,
          total_pedidos: totalPedidos,
          total_pedidos_validos: totalPedidosValidos,
          total_gasto: Number(row.total_gasto || 0),
          primeira_compra_at: row.primeira_compra_at_calc || null,
          ultima_compra_at: ultimaCompraAt,
          ultimo_pedido: ultimaCompraAt,
          dias_sem_comprar: diasSemComprar,
          cliente_recorrente: totalPedidosValidos >= 3,
          status_atividade: classifyCustomerActivity(totalPedidosValidos, diasSemComprar),
          sem_historico: totalPedidos <= 0,
        };
      }));
      // Adicionamos as subqueries para puxar o Total Gasto (ignorando cancelados) e o Último Pedido
      const notCanceledOrderClause = buildNotCanceledOrderClause('p');
      let q = `
        SELECT c.*,
          (SELECT COUNT(*) FROM pedidos p WHERE p.delivery_cliente_id = c.id AND p.tenant_id = c.tenant_id) as total_pedidos,
          (SELECT COALESCE(SUM(total_amount), 0) FROM pedidos p WHERE p.delivery_cliente_id = c.id AND p.tenant_id = c.tenant_id AND ${notCanceledOrderClause}) as total_gasto,
          (SELECT MAX(created_at) FROM pedidos p WHERE p.delivery_cliente_id = c.id AND p.tenant_id = c.tenant_id) as ultimo_pedido
        FROM delivery_clientes c
        WHERE c.tenant_id=?
      `;
      const params: any[] = [req.tenantId];
      if (search) { 
        q += ' AND (c.nome ILIKE ? OR c.telefone ILIKE ?)'; 
        const t=`%${search}%`; params.push(t,t); 
      }
      q += ' ORDER BY c.nome ASC LIMIT 200';
      const rows = await qAll(q, params);
      
      // Converte os valores financeiros para Number (exigência do Postgres)
      res.json(rows.map((r: any) => ({ 
        ...r, 
        total_pedidos: Number(r.total_pedidos || 0),
        total_gasto: Number(r.total_gasto || 0),
        ultimo_pedido: r.ultimo_pedido || null
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/clientes/resumo', async (req: Request, res) => {
    try {
      const { search } = req.query;
      const notCanceledOrderClause = buildNotCanceledOrderClause('p');
      let q = `
        SELECT c.*,
          metrics.total_pedidos,
          metrics.total_pedidos_validos,
          metrics.total_gasto,
          COALESCE(c.primeira_compra_at, metrics.primeira_compra_at) as primeira_compra_at_calc,
          COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) as ultima_compra_at_calc,
          CASE
            WHEN COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) IS NULL THEN NULL
            ELSE FLOOR(
              EXTRACT(
                EPOCH FROM (
                  (NOW() AT TIME ZONE '${TZ}')
                  - (COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) AT TIME ZONE '${TZ}')
                )
              ) / 86400
            )::int
          END as dias_sem_comprar
        FROM delivery_clientes c
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE ${notCanceledOrderClause}) as total_pedidos_validos,
            COALESCE(SUM(CASE WHEN ${notCanceledOrderClause} THEN total_amount ELSE 0 END), 0) as total_gasto,
            MIN(created_at) FILTER (WHERE ${notCanceledOrderClause}) as primeira_compra_at,
            MAX(created_at) FILTER (WHERE ${notCanceledOrderClause}) as ultima_compra_at
          FROM pedidos p
          WHERE p.delivery_cliente_id = c.id
            AND p.tenant_id = c.tenant_id
        ) metrics ON TRUE
        WHERE c.tenant_id=?
      `;
      const params: any[] = [req.tenantId];
      if (search) {
        q += ' AND (c.nome ILIKE ? OR c.telefone ILIKE ? OR COALESCE(c.email, \'\') ILIKE ? OR COALESCE(c.observacoes, \'\') ILIKE ?)';
        const t = `%${search}%`;
        params.push(t, t, t, t);
      }
      q += ' ORDER BY COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) DESC NULLS LAST, c.nome ASC LIMIT 200';
      const rows = await qAll(q, params);

      res.json(rows.map((r: any) => {
        const totalPedidos = Number(r.total_pedidos || 0);
        const totalPedidosValidos = Number(r.total_pedidos_validos || 0);
        const diasSemComprar = r.dias_sem_comprar === null || r.dias_sem_comprar === undefined
          ? null
          : Number(r.dias_sem_comprar);
        const ultimaCompraAt = r.ultima_compra_at_calc || null;

        return {
          ...r,
          total_pedidos: totalPedidos,
          total_pedidos_validos: totalPedidosValidos,
          total_gasto: Number(r.total_gasto || 0),
          primeira_compra_at: r.primeira_compra_at_calc || null,
          ultima_compra_at: ultimaCompraAt,
          ultimo_pedido: ultimaCompraAt,
          dias_sem_comprar: diasSemComprar,
          cliente_recorrente: totalPedidosValidos >= 3,
          status_atividade: classifyCustomerActivity(totalPedidosValidos, diasSemComprar),
          sem_historico: totalPedidos <= 0,
        };
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/clientes/:id/resumo', async (req: Request, res) => {
    try {
      const current = await q1(
        'SELECT id, nome, email, origem_cadastro, observacoes FROM delivery_clientes WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      if (!current) return res.status(404).json({ error: 'Cliente nao encontrado' });

      const nome = typeof req.body.nome === 'string' && req.body.nome.trim()
        ? req.body.nome.trim()
        : current.nome;
      const email = req.body.email === undefined
        ? current.email
        : (String(req.body.email || '').trim() || null);
      const origemCadastroInput = req.body.origem_cadastro === undefined
        ? current.origem_cadastro
        : String(req.body.origem_cadastro || '').trim();
      const origemCadastro = origemCadastroInput || current.origem_cadastro || 'delivery_online';
      const observacoes = req.body.observacoes === undefined
        ? current.observacoes
        : (String(req.body.observacoes || '').trim() || null);

      await qRun(
        `UPDATE delivery_clientes
         SET nome=?, email=?, origem_cadastro=?, observacoes=?
         WHERE id=? AND tenant_id=?`,
        [nome, email, origemCadastro, observacoes, req.params.id, req.tenantId]
      );

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/clientes/:id/pedidos', async (req: Request, res) => {
    try {
      res.json(await qAll(
        `SELECT p.*, (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ') FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
         FROM pedidos p WHERE p.tenant_id=? AND p.delivery_cliente_id=? ORDER BY p.created_at DESC LIMIT 50`,
        [req.tenantId, req.params.id]
      ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/pedidos', async (req: Request, res) => {
    try {
      const { items, cliente_nome, cliente_tel, endereco, pagamento_tipo, total_amount, taxa_entrega, observation } = req.body;
      const clienteTelNormalizado = normalizePhone(cliente_tel);
      const deliveryClienteId = await findOrCreateDeliveryCustomerFromOrder({
        tenantId: Number(req.tenantId),
        nome: cliente_nome,
        telefone: clienteTelNormalizado,
        origemCadastro: 'pedido_manual',
      });
      
      const dateObj = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const y = String(dateObj.getFullYear()).slice(-2);
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const prefix = `D${y}${m}${d}`;

      const todayCount = await q1(`SELECT COUNT(*) as c FROM pedidos WHERE tenant_id=? AND order_number LIKE ?`, [req.tenantId, `${prefix}-%`]);
      const n = Number(todayCount?.c||0)+1;
      const on = `${prefix}-${String(n).padStart(3,'0')}`;

      const orderId = await qInsert(
        `INSERT INTO pedidos (order_number,total_amount,taxa_entrega,observation,tenant_id,canal,cliente_nome,cliente_tel,endereco,pagamento_tipo,pagamento_status,status,delivery_cliente_id) VALUES (?,?,?,?,?,'delivery',?,?,?,?,?,?,?)`,
        [on, total_amount, taxa_entrega||0, observation||null, req.tenantId, cliente_nome||null, clienteTelNormalizado||null, endereco||null, pagamento_tipo||'dinheiro', pagamento_tipo==='pix'?'aguardando_confirmacao':'pendente', 'Pedido Recebido', deliveryClienteId]
      );
      for (const item of (items||[])) {
        await qRun('INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,?,?,?)',
          [orderId, item.product_id, item.quantity, 'Delivery', item.price_at_time, req.tenantId]);
      }
      if (deliveryClienteId) {
        await touchDeliveryCustomerPurchase({
          clienteId: Number(deliveryClienteId),
          tenantId: Number(req.tenantId),
          origemCadastro: 'pedido_manual',
        });
      }
      res.json({ success: true, orderId, orderNumber: on });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/cupons', async (req: Request, res) => {
    try { res.json(await qAll('SELECT * FROM delivery_cupons WHERE tenant_id=? ORDER BY created_at DESC', [req.tenantId])); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/cupons', async (req: Request, res) => {
    try {
      const { codigo, tipo, valor, min_pedido, limite_uso, validade } = req.body;
      if (!codigo?.trim() || !tipo) return res.status(400).json({ error: 'codigo e tipo obrigatórios' });
      const id = await qInsert('INSERT INTO delivery_cupons (tenant_id,codigo,tipo,valor,min_pedido,limite_uso,validade) VALUES (?,?,?,?,?,?,?)',
        [req.tenantId, String(codigo).toUpperCase().trim(), tipo, valor||0, min_pedido||0, limite_uso||null, validade||null]);
      res.json({ success: true, id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/cupons/:id', async (req: Request, res) => {
    try {
      await qRun('UPDATE delivery_cupons SET ativo=? WHERE id=? AND tenant_id=?', [req.body.ativo?1:0, req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/cupons/:id', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM delivery_cupons WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  // ── Relatório ───────────────────────────────────────────────
// ── Relatório ─────────────────────────────────────────────────────────────
  router.get('/relatorio', async (req: Request, res) => {
    try {
      const { periodo = 'hoje' } = req.query;
      
      // Limpa a string para evitar erros se o Front mandar "7 dias" ou "7_dias"
      let pKey = String(periodo).toLowerCase().replace(/ /g, '').replace('_', '');
      if (pKey === '7dias') pKey = '7d';
      if (pKey === '30dias') pKey = '30d';
      if (pKey === 'estemes') pKey = 'mes';

      const periodoMap: Record<string, string> = {
        hoje: `(created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`,
        '7d': `(created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'`,
        '30d': `(created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '29 days'`,
        mes: `DATE_TRUNC('month', created_at AT TIME ZONE '${TZ}') = DATE_TRUNC('month', NOW() AT TIME ZONE '${TZ}')`,
      };
      const dateCond = periodoMap[pKey] || periodoMap.hoje;
      const dateCondP = dateCond.replace(/created_at/g, 'p.created_at');

      const baseFilter = `tenant_id=? AND canal='delivery' AND ${dateCond}`;
      const baseFilterP = `p.tenant_id=? AND p.canal='delivery' AND ${dateCondP}`;
      const notCanceledCondition = buildNotCanceledOrderClause();
      const operationalFilter = `${baseFilter} AND ${notCanceledCondition}`;
      const operationalFilterP = `${baseFilterP} AND ${buildNotCanceledOrderClause('p')}`;
      const canceledCondition = `LOWER(COALESCE(status,'')) = 'cancelado' OR cancelado_at IS NOT NULL`;
      const deliveredOperationalCondition = `status='Entregue' AND ${notCanceledCondition}`;

      const [stats, porDia, porHora, topProdutos, porPagamento] = await Promise.all([
        q1(
          `SELECT SUM(CASE WHEN ${notCanceledCondition} THEN 1 ELSE 0 END) as total_pedidos,
                  COALESCE(SUM(CASE WHEN ${notCanceledCondition} THEN total_amount ELSE 0 END),0) as faturamento_total,
                  COALESCE(AVG(CASE WHEN ${notCanceledCondition} THEN total_amount END),0) as ticket_medio,
                  COUNT(DISTINCT CASE WHEN ${notCanceledCondition} THEN delivery_cliente_id END) as clientes_unicos,
                  SUM(CASE WHEN ${deliveredOperationalCondition} THEN 1 ELSE 0 END) as entregues,
                  SUM(CASE WHEN ${canceledCondition} THEN 1 ELSE 0 END) as cancelados
           FROM pedidos WHERE ${baseFilter}`,
          [req.tenantId]
        ),
        qAll(
          `SELECT TO_CHAR((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') as dia,
                  COUNT(*) as pedidos, COALESCE(SUM(total_amount),0) as faturamento
           FROM pedidos WHERE ${operationalFilter} GROUP BY 1 ORDER BY 1 ASC`,
          [req.tenantId]
        ),
        qAll(
          `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}') as hora, COUNT(*) as pedidos
           FROM pedidos WHERE ${operationalFilter} GROUP BY 1 ORDER BY 1 ASC`,
          [req.tenantId]
        ),
        qAll(
          `SELECT pr.name, SUM(ip.quantity) as qtd, SUM(ip.quantity*ip.price_at_time) as receita
           FROM itens_pedido ip
           JOIN produtos pr ON pr.id=ip.product_id
           JOIN pedidos p ON p.id=ip.order_id
           WHERE ${operationalFilterP}
           GROUP BY pr.id, pr.name ORDER BY qtd DESC LIMIT 10`,
          [req.tenantId]
        ),
        qAll(
          `SELECT pagamento_tipo, COUNT(*) as qtd, COALESCE(SUM(total_amount),0) as total
           FROM pedidos WHERE ${operationalFilter} AND pagamento_tipo IS NOT NULL
           GROUP BY 1`,
          [req.tenantId]
        ),
      ]);

      // Envia a estrutura exata que o DeliveryScreen.tsx espera!
      res.json({ 
        resumo: {
          total_pedidos: Number(stats?.total_pedidos || 0),
          faturamento_total: Number(stats?.faturamento_total || 0),
          ticket_medio: Number(stats?.ticket_medio || 0),
          clientes_unicos: Number(stats?.clientes_unicos || 0),
          entregues: Number(stats?.entregues || 0),
          cancelados: Number(stats?.cancelados || 0),
        },
        porDia: porDia.map((d:any) => ({ ...d, pedidos: Number(d.pedidos), faturamento: Number(d.faturamento) })), 
        porHora: porHora.map((h:any) => ({ ...h, hora: Number(h.hora), pedidos: Number(h.pedidos) })), 
        topProdutos: topProdutos.map((p:any) => ({ ...p, qtd: Number(p.qtd), receita: Number(p.receita) })), 
        porPagamento: porPagamento.map((p:any) => ({ ...p, qtd: Number(p.qtd), total: Number(p.total) })) 
      });
    } catch (e: any) { 
      console.error('Erro no relatorio:', e);
      res.status(500).json({ error: e.message }); 
    }
  });

  return router;
}
