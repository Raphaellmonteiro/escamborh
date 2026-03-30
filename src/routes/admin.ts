// src/routes/admin.ts — painel administrativo FlowPDV
import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q1, qAll, qRun, qInsert, withTx, txInsert, txRun, txQ1 } from '../db';
import { loginRateLimiter, authenticateAdmin, ADMIN_SECRET, JWT_SECRET } from '../middleware';
import { logError } from '../utils/logger';
import { generatePublicId } from '../utils/publicIds';
import { notifyTenantOrderStreams } from '../sse';
import { coerceDeliveryConfigRow } from '../utils/deliveryConfigPersist';
import { getPlanFeatures, type PaidTenantPlan, type PlanFeature } from '../config/planFeatures';
import { normalizeProductProductionInput } from '../utils/preparation';

const TZ = 'America/Sao_Paulo';
const ADMIN_PLAN_OPTIONS = ['basico', 'basico_delivery', 'completo'] as const;
type AdminManagedPlan = (typeof ADMIN_PLAN_OPTIONS)[number];
type ApprovalPlanContext = {
  storedPlan: AdminManagedPlan;
  effectivePlan: PaidTenantPlan;
  features: PlanFeature[];
  trialDays: number;
  trialActive: boolean;
  trialWindow: ReturnType<typeof buildTrialWindow>;
};

function getTodayDateInTimeZone(): string {
  const today = new Date().toLocaleString('en-US', { timeZone: TZ }).split(',')[0];
  const date = new Date(today);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeAdminPlan(rawPlan?: unknown): AdminManagedPlan {
  const plan = String(rawPlan || '').trim().toLowerCase();
  if (ADMIN_PLAN_OPTIONS.includes(plan as AdminManagedPlan)) {
    return plan as AdminManagedPlan;
  }
  return 'completo';
}

function parseTrialDays(rawValue: unknown, fallback = 7): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(365, Math.floor(parsed)));
}

/** COUNT(*) no pg pode vir como string ou bigint; normaliza para número JSON-safe. */
function sqlCount(row: { c?: unknown } | null | undefined): number {
  const v = row?.c;
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildTrialWindow(days: number) {
  if (days <= 0) {
    return {
      trialInicio: null,
      trialFim: null,
      vencimento: null,
    };
  }

  const trialInicio = new Date();
  const trialFim = new Date(trialInicio);
  trialFim.setDate(trialFim.getDate() + days);

  return {
    trialInicio: trialInicio.toISOString(),
    trialFim: trialFim.toISOString(),
    vencimento: trialFim.toISOString(),
  };
}

function buildApprovalPlanContext(rawPlan: unknown, rawTrialDays: unknown): ApprovalPlanContext {
  const storedPlan = normalizeAdminPlan(rawPlan);
  const trialDays = parseTrialDays(rawTrialDays, 7);
  const trialWindow = buildTrialWindow(trialDays);
  const trialActive = trialDays > 0;
  const effectivePlan: PaidTenantPlan = trialActive ? 'completo' : storedPlan;

  return {
    storedPlan,
    effectivePlan,
    features: getPlanFeatures(effectivePlan),
    trialDays,
    trialActive,
    trialWindow,
  };
}

async function buildUniqueTenantUsername(
  client: Parameters<typeof txQ1>[0],
  rawEmail: unknown
): Promise<string> {
  const email = String(rawEmail || '').trim().toLowerCase();
  const emailBase = email.includes('@') ? email.split('@')[0] : email;
  const normalizedBase = emailBase.replace(/[^a-z0-9]/g, '') || 'cliente';

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? normalizedBase : `${normalizedBase}${suffix + 1}`;
    const existing = await txQ1<{ username?: string | null; usuario?: string | null }>(
      client,
      `SELECT username, NULL::text AS usuario FROM usuarios WHERE username=?
       UNION ALL
       SELECT NULL::text AS username, usuario FROM clientes WHERE usuario=?
       LIMIT 1`,
      [candidate, candidate]
    );

    if (!existing) return candidate;
  }

  throw new Error('Nao foi possivel gerar um usuario unico para a solicitacao');
}

type DiagnosticProblem = {
  id: string;
  category: 'caixa' | 'pedidos' | 'estoque';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  action: string;
  data: Record<string, unknown>;
};

async function runDiagnostics(tenantIdFilter?: number): Promise<{ tenant_id: number; nome_estabelecimento: string; problems: DiagnosticProblem[] }[]> {
  const tenants = await qAll<{ id: number; nome_estabelecimento: string }>(
    tenantIdFilter
      ? 'SELECT id, nome_estabelecimento FROM clientes WHERE id=?'
      : 'SELECT id, nome_estabelecimento FROM clientes ORDER BY nome_estabelecimento ASC',
    tenantIdFilter ? [tenantIdFilter] : []
  );
  const todayStr = getTodayDateInTimeZone();
  const result: { tenant_id: number; nome_estabelecimento: string; problems: DiagnosticProblem[] }[] = [];

  for (const t of tenants) {
    const tenantId = t.id;
    const problems: DiagnosticProblem[] = [];

    // 1. Caixa
    const caixasAbertos = await qAll<{ id: number; data: string }>(
      "SELECT id, data FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data ASC",
      [tenantId]
    );
    if (caixasAbertos.length > 1) {
      problems.push({
        id: 'caixa_multiplos',
        category: 'caixa',
        severity: 'high',
        title: 'Mais de um caixa aberto',
        description: `${caixasAbertos.length} caixas abertos: ${caixasAbertos.map((c) => `#${c.id} (${c.data})`).join(', ')}`,
        action: 'force_close',
        data: { caixa_ids: caixasAbertos.map((c) => c.id), tenant_id: tenantId },
      });
    }
    if (caixasAbertos.length >= 1) {
      const caixaDiaAnterior = caixasAbertos.find((c) => c.data !== todayStr);
      if (caixaDiaAnterior) {
        problems.push({
          id: 'caixa_dia_anterior',
          category: 'caixa',
          severity: 'medium',
          title: 'Caixa aberto em dia anterior',
          description: `Caixa #${caixaDiaAnterior.id} aberto em ${caixaDiaAnterior.data}, ainda não fechado`,
          action: 'force_close',
          data: { caixa_id: caixaDiaAnterior.id, tenant_id: tenantId },
        });
      }
    }

    // 2. Pedidos
    const pedidosTravados = await qAll<{ id: number; order_number: string; status: string; created_at: string }>(
      `SELECT id, order_number, status, created_at FROM pedidos
       WHERE tenant_id=? AND status IN ('Criado','Pedido Recebido','Em Preparo','Pronto','Pronto para Entrega','Saiu para Entrega','Aguardando confirmação')
       AND created_at < NOW() - INTERVAL '24 hours'
       AND cancelado_at IS NULL`,
      [tenantId]
    );
    for (const p of pedidosTravados) {
      problems.push({
        id: 'pedidos_travados',
        category: 'pedidos',
        severity: 'medium',
        title: 'Pedido travado há mais de 24h',
        description: `Pedido #${p.order_number || p.id} (${p.status}) desde ${new Date(p.created_at).toLocaleString('pt-BR')}`,
        action: 'fix_status',
        data: { tenant_id: tenantId, order_id: p.id, order_number: p.order_number, current_status: p.status },
      });
    }
    const pedidosSemFinal = await qAll<{ id: number; order_number: string; status: string }>(
      `SELECT id, order_number, status FROM pedidos
       WHERE tenant_id=? AND status NOT IN ('Concluído', 'Entregue', 'Cancelado', 'cancelado')
       AND cancelado_at IS NULL
       AND created_at < NOW() - INTERVAL '7 days'
       LIMIT 20`,
      [tenantId]
    );
    for (const p of pedidosSemFinal) {
      problems.push({
        id: 'pedidos_sem_status_final',
        category: 'pedidos',
        severity: 'low',
        title: 'Pedido antigo sem status final',
        description: `Pedido #${p.order_number || p.id} (${p.status}) há mais de 7 dias`,
        action: 'fix_status',
        data: { tenant_id: tenantId, order_id: p.id, order_number: p.order_number, current_status: p.status },
      });
    }

    // 3. Estoque — produtos ativos sem vínculo
    const produtosSemVinculo = await qAll<{ id: number; name: string }>(
      `SELECT p.id, p.name FROM produtos p
       WHERE p.tenant_id=? AND COALESCE(p.active, 1) = 1
       AND NOT EXISTS (SELECT 1 FROM produto_ingrediente pi WHERE pi.product_id=p.id AND pi.tenant_id=p.tenant_id)
       AND NOT EXISTS (
         SELECT 1 FROM produto_variacoes_vendaveis pv
         WHERE pv.produto_id=p.id AND pv.tenant_id=p.tenant_id AND pv.ingrediente_id IS NOT NULL AND pv.ingrediente_id > 0
       )
       ORDER BY p.name ASC
       LIMIT 50`,
      [tenantId]
    );
    if (produtosSemVinculo.length > 0) {
      problems.push({
        id: 'produtos_sem_vinculo',
        category: 'estoque',
        severity: 'low',
        title: 'Produtos ativos sem vínculo de estoque',
        description: `${produtosSemVinculo.length} produto(s): ${produtosSemVinculo.slice(0, 3).map((pr) => pr.name).join(', ')}${produtosSemVinculo.length > 3 ? '...' : ''}`,
        action: 'fix_links',
        data: { tenant_id: tenantId, count: produtosSemVinculo.length, product_ids: produtosSemVinculo.map((pr) => pr.id) },
      });
    }

    result.push({ tenant_id: tenantId, nome_estabelecimento: t.nome_estabelecimento, problems });
  }
  return result;
}

export function createAdminRouter() {
  const router = Router();

  const ADMIN_USER     = process.env.ADMIN_USER     || 'admin@dev';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-admin-password';

  // POST /api/admin/login
  router.post('/admin/login', loginRateLimiter, (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === ADMIN_USER && senha === ADMIN_PASSWORD) {
      const token = jwt.sign({ role: 'admin' }, ADMIN_SECRET, { expiresIn: '8h' });
      return res.json({ success: true, token });
    }
    res.status(401).json({ success: false, message: 'Credenciais inválidas' });
  });

  // Todas as rotas abaixo são protegidas por authenticateAdmin
  const admin = Router();
  admin.use(authenticateAdmin);

  admin.get('/solicitacoes', async (_req, res) => {
    try { res.json(await qAll('SELECT * FROM solicitacoes ORDER BY created_at DESC', [])); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.post('/solicitacoes/:id/aprovar', async (req, res) => {
    try {
      const sol = await q1('SELECT * FROM solicitacoes WHERE id=?', [req.params.id]);
      if (!sol) return res.status(404).json({ success: false });
      const segmentoFinal = req.body?.segmento || sol.segmento || 'Restaurante/Food';
      const approvalPlan = buildApprovalPlanContext(req.body?.plano, req.body?.trial_dias);
      const senha   = Math.random().toString(36).slice(-8);
      const hash    = bcrypt.hashSync(senha, 10);

      const result = await withTx(async (client) => {
        const usuario = await buildUniqueTenantUsername(client, sol.email);
        const initialProductProduction = normalizeProductProductionInput(
          { production_type: 'kitchen' },
          { name: 'Produto Exemplo', category: 'Geral' }
        );

        const cid = await txInsert(client,
          `INSERT INTO clientes (solicitacao_id,nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,usuario,senha,status,vencimento,segmento,plano,trial_inicio,trial_fim) VALUES (?,?,?,?,?,?,?,?,?,?,?,'ativo',?,?,?,?,?)`,
          [
            sol.id,
            sol.nome_estabelecimento,
            sol.razao_social,
            sol.documento_tipo,
            sol.documento_numero,
            sol.nome_responsavel,
            sol.email,
            sol.whatsapp,
            sol.cidade,
            usuario,
            hash,
            approvalPlan.trialWindow.vencimento,
            segmentoFinal,
            approvalPlan.storedPlan,
            approvalPlan.trialWindow.trialInicio,
            approvalPlan.trialWindow.trialFim,
          ]
        );
        await txRun(client, "UPDATE solicitacoes SET status='aprovado', segmento=? WHERE id=?", [segmentoFinal, sol.id]);
        await txRun(client,
          `INSERT INTO usuarios (username,password,cargo,nome,cliente_id,ativo,token_version) VALUES (?,?,'dono',?,?,1,1)
           ON CONFLICT(username) DO UPDATE SET password=EXCLUDED.password,cargo='dono',nome=EXCLUDED.nome,cliente_id=EXCLUDED.cliente_id,ativo=1`,
          [usuario, hash, sol.nome_responsavel, cid]
        );
        await txRun(
          client,
          "INSERT INTO produtos (public_id,name,price,category,active,requires_preparation,production_type,tenant_id) VALUES (?, 'Produto Exemplo',10.00,'Geral',1,?,?,?)",
          [
            generatePublicId('prd'),
            initialProductProduction.requiresPreparation,
            initialProductProduction.productionType,
            cid,
          ]
        );

        return { clienteId: cid, usuario };
      });
      res.json({
        success: true,
        cliente_id: result.clienteId,
        usuario: result.usuario,
        senha,
        segmento: segmentoFinal,
        plano: approvalPlan.storedPlan,
        plan_type: approvalPlan.storedPlan,
        plan_features: approvalPlan.features,
        trial_ativo: approvalPlan.trialActive,
        trial_dias: approvalPlan.trialDays,
        trial_inicio: approvalPlan.trialWindow.trialInicio,
        trial_fim: approvalPlan.trialWindow.trialFim,
        vencimento: approvalPlan.trialWindow.vencimento,
      });
    } catch (e: any) {
      console.error('[admin.aprovarSolicitacao] erro ao aprovar solicitacao:', {
        solicitacaoId: req.params.id,
        message: e?.message || e,
      });
      res.status(500).json({ success: false, error: e.message });
    }
  });

  admin.post('/solicitacoes/:id/recusar', async (req, res) => {
    try {
      await qRun("UPDATE solicitacoes SET status='recusado' WHERE id=?", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/clientes', async (_req, res) => {
    try {
      const now = new Date();
      const lista = await qAll('SELECT * FROM clientes ORDER BY created_at DESC', []);
      res.json(lista.map((c: any) => {
        const td = c.vencimento ? new Date(c.vencimento) : c.trial_fim ? new Date(c.trial_fim) : null;
        return { ...c, dias_restantes: td ? Math.ceil((td.getTime()-now.getTime())/86400000) : null };
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.put('/clientes/:id', async (req, res) => {
    try {
      const {
        nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,
        plano,valor_plano,vencimento,status,segmento,trial_inicio,trial_fim,
      } = req.body;
      const planoFinal = normalizeAdminPlan(plano);
      const ant = await q1('SELECT vencimento,plano FROM clientes WHERE id=?', [req.params.id]);
      await qRun(
        `UPDATE clientes SET nome_estabelecimento=?,razao_social=?,documento_tipo=?,documento_numero=?,nome_responsavel=?,email=?,whatsapp=?,cidade=?,plano=?,valor_plano=?,vencimento=?,status=?,segmento=?,trial_inicio=?,trial_fim=? WHERE id=?`,
        [
          nome_estabelecimento,
          razao_social,
          documento_tipo,
          documento_numero,
          nome_responsavel,
          email,
          whatsapp,
          cidade,
          planoFinal,
          valor_plano,
          vencimento || null,
          status,
          segmento || 'Restaurante/Food',
          trial_inicio || null,
          trial_fim || null,
          req.params.id,
        ]
      );
      if (vencimento !== ant?.vencimento || planoFinal !== ant?.plano)
        await qRun('INSERT INTO renovacoes (cliente_id,plano,valor,vencimento_anterior,novo_vencimento) VALUES (?,?,?,?,?)',
          [req.params.id,planoFinal,valor_plano,ant?.vencimento,vencimento]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.put('/clientes/:id/senha', async (req, res) => {
    try {
      const { nova_senha, senha_admin, senha_caixa } = req.body;
      if (nova_senha?.trim()) await qRun('UPDATE usuarios SET password=? WHERE cliente_id=?', [bcrypt.hashSync(nova_senha,10), req.params.id]);
      if (senha_admin) await qRun('UPDATE clientes SET senha_admin=? WHERE id=?', [senha_admin, req.params.id]);
      if (senha_caixa) await qRun('UPDATE clientes SET senha_caixa=? WHERE id=?', [senha_caixa, req.params.id]);
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Erro ao atualizar senhas' }); }
  });

  admin.delete('/clientes/:id', async (req, res) => {
    try {
      const c = await q1('SELECT usuario FROM clientes WHERE id=?', [req.params.id]);
      await withTx(async (client) => {
        for (const t of ['itens_pedido','pagamentos','estoque_movimentacoes']) await txRun(client, `DELETE FROM ${t} WHERE tenant_id=?`, [req.params.id]);
        for (const t of ['pedidos','produtos','ingredientes','despesas','caixa']) await txRun(client, `DELETE FROM ${t} WHERE tenant_id=?`, [req.params.id]);
        await txRun(client, 'DELETE FROM renovacoes WHERE cliente_id=?', [req.params.id]);
        if (c) await txRun(client, 'DELETE FROM usuarios WHERE username=?', [c.usuario]);
        await txRun(client, 'DELETE FROM clientes WHERE id=?', [req.params.id]);
      });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.post('/clientes/:id/disconnect', async (req, res) => {
    try {
      const c = await q1('SELECT usuario FROM clientes WHERE id=?', [req.params.id]);
      if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
      await qRun('UPDATE usuarios SET token_version=token_version+1 WHERE username=?', [c.usuario]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.post('/clientes/:id/bloquear', async (req, res) => {
    try {
      await qRun("UPDATE clientes SET status='bloqueado' WHERE id=?", [req.params.id]);
      const c = await q1('SELECT usuario FROM clientes WHERE id=?', [req.params.id]);
      if (c) await qRun('UPDATE usuarios SET ativo=0 WHERE username=?', [c.usuario]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.post('/clientes/:id/desbloquear', async (req, res) => {
    try {
      const { dias_extras } = req.body;
      const d = new Date(); d.setDate(d.getDate()+(dias_extras||7));
      await qRun("UPDATE clientes SET status='ativo', vencimento=? WHERE id=?", [d.toISOString(), req.params.id]);
      const c = await q1('SELECT usuario FROM clientes WHERE id=?', [req.params.id]);
      if (c) await qRun('UPDATE usuarios SET ativo=1 WHERE username=?', [c.usuario]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.post('/clientes/:id/estender', async (req, res) => {
    try {
      const { dias } = req.body;
      const c = await q1('SELECT * FROM clientes WHERE id=?', [req.params.id]);
      if (!c) return res.status(404).json({ success: false });
      const base = (c.vencimento && new Date(c.vencimento) > new Date()) ? new Date(c.vencimento) : new Date();
      base.setDate(base.getDate()+(dias||7));
      await qRun("UPDATE clientes SET vencimento=?,status='ativo' WHERE id=?", [base.toISOString(), req.params.id]);
      res.json({ success: true, novo_vencimento: base.toISOString() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/financeiro', async (_req, res) => {
    try {
      const TZ = 'America/Sao_Paulo';
      const [mrr, ativos, proxVenc, fatMensal, pagantes] = await Promise.all([
        q1("SELECT SUM(valor_plano) as total FROM clientes WHERE status='ativo' AND (trial_fim IS NULL OR trial_fim < NOW())", []),
        q1("SELECT COUNT(*) as total FROM clientes WHERE status='ativo' AND (trial_fim IS NULL OR trial_fim < NOW())", []),
        qAll(`SELECT nome_estabelecimento,plano,valor_plano,vencimento,whatsapp,
               EXTRACT(DAY FROM (vencimento - NOW())) as dias
               FROM clientes WHERE status='ativo' AND vencimento IS NOT NULL
               AND vencimento <= NOW() + INTERVAL '7 days' ORDER BY vencimento ASC`, []),
        qAll(`SELECT TO_CHAR(data_pagamento AT TIME ZONE '${TZ}', 'MM/YYYY') as mes, SUM(valor) as total
              FROM renovacoes GROUP BY mes ORDER BY MIN(data_pagamento) DESC LIMIT 6`, []),
        qAll("SELECT nome_estabelecimento,plano,valor_plano,vencimento,ultimo_acesso FROM clientes WHERE (trial_fim IS NULL OR trial_fim < NOW()) ORDER BY vencimento ASC", []),
      ]);
      res.json({
        mrr: mrr?.total||0, arr: (mrr?.total||0)*12,
        clientes_pagantes: ativos?.total||0,
        ticket_medio: ativos?.total ? (mrr?.total/ativos?.total) : 0,
        proximos_vencimentos: proxVenc, faturamento_mensal: fatMensal, todos_pagantes: pagantes,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/dashboard', async (_req, res) => {
    try {
      const [total, ativos, bloqueados, pendentes, expirados] = await Promise.all([
        q1('SELECT COUNT(*) as c FROM clientes', []),
        q1("SELECT COUNT(*) as c FROM clientes WHERE status='ativo'", []),
        q1("SELECT COUNT(*) as c FROM clientes WHERE status='bloqueado'", []),
        q1("SELECT COUNT(*) as c FROM solicitacoes WHERE status='pendente'", []),
        q1("SELECT COUNT(*) as c FROM clientes WHERE status='ativo' AND vencimento IS NOT NULL AND vencimento<NOW()", []),
      ]);
      res.json({
        total: sqlCount(total),
        ativos: sqlCount(ativos),
        bloqueados: sqlCount(bloqueados),
        pendentes: sqlCount(pendentes),
        expirados: sqlCount(expirados),
      });
    } catch (e: any) {
      logError('admin.dashboard', e, {
        route: '/api/admin/dashboard',
        code: e?.code,
        detail: e?.detail,
      });
      res.status(500).json({ error: e?.message || 'Erro ao carregar dashboard admin' });
    }
  });

  admin.get('/clientes/:id/usuarios', async (req, res) => {
    try {
      const u = await qAll('SELECT id,username,nome,cargo,permissoes,ativo FROM usuarios WHERE cliente_id=? ORDER BY nome ASC', [req.params.id]);
      res.json(u.map((x: any) => ({ ...x, permissoes: x.permissoes ? JSON.parse(x.permissoes) : null })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.put('/clientes/:id/usuarios/:uid/senha', async (req, res) => {
    try {
      const { senha } = req.body;
      if (!senha) return res.status(400).json({ error: 'Senha obrigatória' });
      await qRun('UPDATE usuarios SET password=? WHERE id=? AND cliente_id=?', [await bcrypt.hash(senha,10), req.params.uid, req.params.id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.patch('/clientes/:id/usuarios/:uid/toggle', async (req, res) => {
    try {
      const u = await q1('SELECT ativo FROM usuarios WHERE id=? AND cliente_id=?', [req.params.uid, req.params.id]);
      if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
      await qRun('UPDATE usuarios SET ativo=? WHERE id=? AND cliente_id=?', [u.ativo?0:1, req.params.uid, req.params.id]);
      res.json({ success: true, ativo: !u.ativo });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Motor de ações administrativas críticas ─────────────────────────────
  type ActionContext = { tenantId: number; payload?: Record<string, unknown>; reason: string };
  type ActionHandler = (ctx: ActionContext) => Promise<Record<string, unknown>>;

  async function logAdminAction(tenantId: number, action: string, detalhes: string) {
    await qRun(
      'INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
      [tenantId, 'Admin', 'admin', `ADMIN_ACTION_${action}`, detalhes]
    );
  }

  async function resetCaixaState(tenantId: number, reason: string) {
    const caixasAbertos = await qAll<{ id: number; data: string; observacao?: string | null }>(
      "SELECT id, data, observacao FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data ASC",
      [tenantId]
    );

    if (caixasAbertos.length === 0) {
      await logAdminAction(
        tenantId,
        'reset_caixa',
        `Reset de caixa solicitado sem caixas abertos. Motivo: ${reason}`
      );

      return {
        reset_count: 0,
        caixas_ids: [],
        status: 'fechado',
      };
    }

    await withTx(async (client) => {
      for (const caixa of caixasAbertos) {
        const observacoes = [caixa.observacao || '', `[Reset admin: ${reason}]`].filter(Boolean);
        await txRun(
          client,
          "UPDATE caixa SET status='fechado', closed_at=COALESCE(closed_at, NOW()), valor_contado=COALESCE(valor_contado,0), observacao=? WHERE id=? AND tenant_id=?",
          [observacoes.join(' '), caixa.id, tenantId]
        );
      }
    });

    await logAdminAction(
      tenantId,
      'reset_caixa',
      `Reset de caixa concluiu ${caixasAbertos.length} fechamento(s) administrativo(s): ${caixasAbertos.map((caixa) => `#${caixa.id} (${caixa.data})`).join(', ')}. Motivo: ${reason}`
    );

    return {
      reset_count: caixasAbertos.length,
      caixas_ids: caixasAbertos.map((caixa) => caixa.id),
      status: 'fechado',
    };
  }

  const actionHandlers: Record<string, ActionHandler> = {
    async login_as_cliente({ tenantId, reason }) {
      const cliente = await q1<{ id: number; usuario: string; nome_estabelecimento: string; status: string }>(
        'SELECT id, usuario, nome_estabelecimento, status FROM clientes WHERE id=?',
        [tenantId]
      );
      if (!cliente) throw new Error('Cliente não encontrado');
      if (cliente.status !== 'ativo') throw new Error('Cliente bloqueado ou inativo');

      const user = await q1<{ id: number; username: string; token_version: number }>(
        'SELECT id, username, token_version FROM usuarios WHERE username=? LIMIT 1',
        [cliente.usuario]
      );
      if (!user) throw new Error('Usuário do cliente não encontrado');

      const token = jwt.sign(
        { id: user.id, username: user.username, token_version: user.token_version || 1 },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      await logAdminAction(
        tenantId,
        'login_as_cliente',
        `Admin logou como cliente "${cliente.nome_estabelecimento}" (usuario=${cliente.usuario}). Motivo: ${reason}`
      );

      return { token, usuario: cliente.usuario, nome_estabelecimento: cliente.nome_estabelecimento };
    },

    async open_caixa({ tenantId, payload, reason }) {
      const dateStr = getTodayDateInTimeZone();
      const ex = await q1("SELECT * FROM caixa WHERE data=? AND status='aberto' AND tenant_id=?", [dateStr, tenantId]);
      if (ex) throw new Error('Já existe um caixa aberto hoje.');

      const fundoInicial = Number(payload?.fundo_inicial ?? 0);
      const observacao = String(payload?.observacao ?? '').trim();

      await qRun(
        "INSERT INTO caixa (data,fundo_inicial,observacao,status,tenant_id) VALUES (?,?,?,'aberto',?)",
        [dateStr, fundoInicial, observacao || null, tenantId]
      );

      await logAdminAction(
        tenantId,
        'open_caixa',
        `Caixa aberto para ${dateStr}. Fundo: R$ ${fundoInicial.toFixed(2)}. Motivo: ${reason}`
      );

      return { data: dateStr, fundo_inicial: fundoInicial };
    },

    async force_close_caixa({ tenantId, payload, reason }) {
      const caixaId = payload?.caixa_id ? Number(payload.caixa_id) : undefined;
      const valorContado = payload?.valor_contado != null ? Number(payload.valor_contado) : 0;
      const observacaoPayload = String(payload?.observacao ?? '').trim();

      let caixa: { id: number; data: string; observacao?: string | null } | null;
      if (caixaId) {
        caixa = await q1('SELECT id, data, observacao FROM caixa WHERE id=? AND tenant_id=? AND status=?', [caixaId, tenantId, 'aberto']);
      } else {
        caixa = await q1("SELECT id, data, observacao FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data ASC LIMIT 1", [tenantId]);
      }
      if (!caixa) throw new Error('Nenhum caixa aberto encontrado');

      const parts: string[] = [caixa.observacao || '', observacaoPayload, `[Admin: ${reason}]`].filter(Boolean);
      const observacaoFinal = parts.join(' ');

      await qRun(
        "UPDATE caixa SET status='fechado', closed_at=NOW(), valor_contado=?, observacao=? WHERE id=? AND tenant_id=?",
        [valorContado, observacaoFinal, caixa.id, tenantId]
      );

      await logAdminAction(
        tenantId,
        'force_close_caixa',
        `Caixa #${caixa.id} (${caixa.data}) fechado. Valor contado: R$ ${valorContado.toFixed(2)}. Motivo: ${reason}`
      );

      return { caixa_id: caixa.id, data: caixa.data, valor_contado: valorContado };
    },

    async reset_caixa({ tenantId, reason }) {
      return resetCaixaState(tenantId, reason);
    },

    async reset_caixa_state({ tenantId, reason }) {
      return resetCaixaState(tenantId, reason);
    },

    async force_cancel_order({ tenantId, payload, reason }) {
      const orderId = Number(payload?.order_id);
      if (!orderId) throw new Error('order_id obrigatório no payload');

      const pedido = await q1<{ id: number; order_number: string; status: string; cancelado_at: string | null }>(
        'SELECT id, order_number, status, cancelado_at FROM pedidos WHERE id=? AND tenant_id=?',
        [orderId, tenantId]
      );
      if (!pedido) throw new Error('Pedido não encontrado');
      if (pedido.cancelado_at) throw new Error('Pedido já cancelado');

      await qRun(
        `UPDATE pedidos SET status='Cancelado', cancelado_at=NOW(), cancelamento_motivo=?, cancelado_por=NULL WHERE id=? AND tenant_id=?`,
        [reason, orderId, tenantId]
      );
      notifyTenantOrderStreams(tenantId, 'status', { orderId });

      await logAdminAction(
        tenantId,
        'force_cancel_order',
        `Pedido #${pedido.order_number || orderId} cancelado. Motivo: ${reason}`
      );

      return { order_id: orderId, order_number: pedido.order_number };
    },

    async ver_logs_sistema({ tenantId, payload, reason }) {
      const limite = Math.min(Math.max(1, Number(payload?.limite) || 200), 500);

      const logs = await qAll<{
        id: number;
        tenant_id: number;
        usuario_nome: string;
        cargo: string;
        acao: string;
        detalhes: string | null;
        created_at: string;
      }>(
        'SELECT id, tenant_id, usuario_nome, cargo, acao, detalhes, created_at FROM system_logs WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?',
        [tenantId, limite]
      );

      await logAdminAction(
        tenantId,
        'ver_logs_sistema',
        `Admin consultou ${logs.length} logs. Motivo: ${reason}`
      );

      return { logs: logs.map((l) => ({ ...l, created_at: l.created_at })) };
    },

    async clear_sessions({ tenantId, reason }) {
      const updated = await qAll<{ id: number }>(
        'UPDATE usuarios SET token_version=COALESCE(token_version,1)+1 WHERE cliente_id=? RETURNING id',
        [tenantId]
      );
      const count = updated.length;

      await logAdminAction(
        tenantId,
        'clear_sessions',
        `Sessões invalidadas para todos os usuários do tenant (${count} afetados). Motivo: ${reason}`
      );

      return { users_affected: count };
    },

    async force_pix_check({ tenantId, payload, reason }) {
      const orderId = Number(payload?.order_id);
      if (!orderId) throw new Error('order_id obrigatório no payload');

      const pedido = await q1<{ id: number; order_number: string; pagamento_tipo: string; pagamento_status: string }>(
        'SELECT id, order_number, pagamento_tipo, pagamento_status FROM pedidos WHERE id=? AND tenant_id=?',
        [orderId, tenantId]
      );
      if (!pedido) throw new Error('Pedido não encontrado');
      if (pedido.pagamento_tipo !== 'pix') throw new Error('Pedido não é pagamento PIX');
      if (pedido.pagamento_status === 'pago') throw new Error('Pedido já está pago');

      await qRun(
        "UPDATE pedidos SET pagamento_status='pago' WHERE id=? AND tenant_id=?",
        [orderId, tenantId]
      );
      notifyTenantOrderStreams(tenantId, 'status', { orderId });

      await logAdminAction(
        tenantId,
        'force_pix_check',
        `Pedido #${pedido.order_number || orderId} PIX marcado como pago. Motivo: ${reason}`
      );

      return { order_id: orderId, order_number: pedido.order_number };
    },

    async recalculate_stock({ tenantId, reason }) {
      const cliente = await q1<{ id: number }>('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) throw new Error('Cliente não encontrado');

      const rows = await qAll<{ id: number; total_entrada: number; total_saida: number }>(
        `SELECT i.id,
          COALESCE((SELECT SUM(quantidade) FROM estoque_movimentacoes WHERE ingrediente_id=i.id AND tipo='entrada' AND tenant_id=i.tenant_id),0)::numeric as total_entrada,
          COALESCE((SELECT SUM(quantidade) FROM estoque_movimentacoes WHERE ingrediente_id=i.id AND tipo='saida' AND tenant_id=i.tenant_id),0)::numeric as total_saida
         FROM ingredientes i WHERE i.tenant_id=?`,
        [tenantId]
      );

      let updated = 0;
      for (const r of rows) {
        const novoEstoque = Math.max(0, Number(r.total_entrada || 0) - Number(r.total_saida || 0));
        await qRun('UPDATE ingredientes SET estoque_atual=? WHERE id=? AND tenant_id=?', [novoEstoque, r.id, tenantId]);
        updated++;
      }

      await logAdminAction(
        tenantId,
        'recalculate_stock',
        `${updated} ingrediente(s) reprocessados pelo histórico de movimentações (entradas - saídas). Motivo: ${reason}`
      );

      return { ingredientes_atualizados: updated };
    },

    async delivery_enable({ tenantId, reason }) {
      const cliente = await q1<{ id: number }>('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) throw new Error('Cliente não encontrado');
      await qRun('UPDATE clientes SET delivery_ativo=1 WHERE id=?', [tenantId]);
      await logAdminAction(tenantId, 'delivery_enable', `Delivery ativado para o tenant. Motivo: ${reason}`);
      return { ativo: true };
    },

    async delivery_disable({ tenantId, reason }) {
      const cliente = await q1<{ id: number }>('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) throw new Error('Cliente não encontrado');
      await qRun('UPDATE clientes SET delivery_ativo=0 WHERE id=?', [tenantId]);
      await logAdminAction(tenantId, 'delivery_disable', `Delivery desativado para o tenant. Motivo: ${reason}`);
      return { ativo: false };
    },
  };

  admin.post('/actions', async (req: Request, res) => {
    try {
      const { action, tenant_id, payload, reason } = req.body;
      const tenantId = Number(tenant_id);
      const reasonStr = String(reason || '').trim();

      if (!action || typeof action !== 'string') {
        return res.status(400).json({ success: false, error: 'action obrigatório' });
      }
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'tenant_id obrigatório' });
      }
      if (reasonStr.length < 10) {
        return res.status(400).json({ success: false, error: 'reason obrigatório (mínimo 10 caracteres)' });
      }

      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) {
        return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
      }

      const handler = actionHandlers[action];
      if (!handler) {
        return res.status(400).json({ success: false, error: `Ação não reconhecida: ${action}` });
      }

      const result = await handler({
        tenantId,
        payload: payload && typeof payload === 'object' ? payload : undefined,
        reason: reasonStr,
      });

      res.json({ success: true, ...result });
    } catch (e: any) {
      logError('admin.actions', e, {
        route: '/api/admin/actions',
        action: req.body?.action,
        tenantId: req.body?.tenant_id,
        code: e?.code,
        detail: e?.detail,
      });
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // ─── Diagnósticos e ações administrativas ─────────────────────────────────
  admin.get('/diagnostics', async (req: Request, res) => {
    try {
      const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : undefined;
      const tenants = await runDiagnostics(tenantId);
      res.json({ tenants });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.post('/caixa/force-close', async (req, res) => {
    try {
      const { tenant_id, caixa_id } = req.body;
      const tenantId = Number(tenant_id);
      if (!tenantId) return res.status(400).json({ success: false, error: 'tenant_id obrigatório' });

      let caixa: { id: number; data: string } | null;
      if (caixa_id) {
        caixa = await q1('SELECT id, data FROM caixa WHERE id=? AND tenant_id=? AND status=?', [caixa_id, tenantId, 'aberto']);
      } else {
        caixa = await q1("SELECT id, data FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data ASC LIMIT 1", [tenantId]);
      }
      if (!caixa) return res.status(400).json({ success: false, error: 'Nenhum caixa aberto encontrado' });

      await qRun(
        "UPDATE caixa SET status='fechado', closed_at=NOW(), valor_contado=COALESCE(valor_contado,0), observacao=COALESCE(observacao,'') || ' [Fechamento admin]' WHERE id=? AND tenant_id=?",
        [caixa.id, tenantId]
      );
      await qRun('INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
        [tenantId, 'Admin', 'admin', 'ADMIN_FORCE_CLOSE_CAIXA', `Caixa #${caixa.id} (data ${caixa.data}) fechado pelo painel admin`]);
      res.json({ success: true, caixa_id: caixa.id });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  admin.post('/caixa/reset', async (req, res) => {
    try {
      const tenantId = Number(req.body?.tenant_id);
      const reason = String(req.body?.reason || '').trim();

      if (!tenantId) return res.status(400).json({ success: false, error: 'tenant_id obrigatorio' });
      if (reason.length < 10) {
        return res.status(400).json({ success: false, error: 'reason obrigatorio (minimo 10 caracteres)' });
      }

      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ success: false, error: 'Cliente nao encontrado' });

      const result = await resetCaixaState(tenantId, reason);
      res.json({ success: true, ...result });
    } catch (e: any) {
      logError('admin.caixa.reset', e, {
        route: '/api/admin/caixa/reset',
        tenantId: req.body?.tenant_id,
        code: e?.code,
        detail: e?.detail,
      });
      res.status(500).json({ success: false, error: e?.message || 'Erro ao resetar caixa' });
    }
  });

  admin.post('/pedidos/fix-status', async (req, res) => {
    try {
      const { tenant_id, order_id, new_status } = req.body;
      const tenantId = Number(tenant_id);
      const orderId = Number(order_id);
      const status = String(new_status || 'Concluído').trim();
      const allowed = ['Concluído', 'Entregue', 'Cancelado', 'cancelado'];
      if (!tenantId || !orderId) return res.status(400).json({ success: false, error: 'tenant_id e order_id obrigatórios' });
      if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'new_status deve ser Concluído, Entregue ou Cancelado' });

      const pedido = await q1<{ id: number; order_number: string; status: string; cancelado_at: string | null }>('SELECT id, order_number, status, cancelado_at FROM pedidos WHERE id=? AND tenant_id=?', [orderId, tenantId]);
      if (!pedido) return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
      if (pedido.cancelado_at) return res.status(400).json({ success: false, error: 'Pedido já cancelado' });

      await qRun('UPDATE pedidos SET status=? WHERE id=? AND tenant_id=?', [status, orderId, tenantId]);
      notifyTenantOrderStreams(tenantId, 'status', { orderId });
      await qRun('INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
        [tenantId, 'Admin', 'admin', 'ADMIN_FIX_PEDIDO_STATUS', `Pedido #${pedido.order_number || orderId} alterado de "${pedido.status}" para "${status}"`]);
      res.json({ success: true, order_id: orderId, new_status: status });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  admin.post('/estoque/fix-links', async (_req, res) => {
    res.json({ success: true, message: 'Ação em desenvolvimento. Use a tela de Estoque para vincular produtos a ingredientes.' });
  });

  // ─── Dados operacionais por tenant (para painel individual) ───────────────────
  admin.get('/tenant/:id/pedidos', async (req: Request, res) => {
    try {
      const tenantId = Number(req.params.id);
      if (!tenantId) return res.status(400).json({ error: 'tenant_id inválido' });
      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 100);
      const rows = await qAll(
        `SELECT id, order_number, status, canal, total_amount, pagamento_tipo, pagamento_status, created_at, cancelado_at
         FROM pedidos WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?`,
        [tenantId, limit]
      );
      res.json(rows.map((p: any) => ({
        ...p,
        total_amount: Number(p.total_amount || 0),
        created_at: p.created_at,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/tenant/:id/pedidos/:orderId', async (req: Request, res) => {
    try {
      const tenantId = Number(req.params.id);
      const orderId = Number(req.params.orderId);
      if (!tenantId || !orderId) return res.status(400).json({ error: 'tenant_id ou pedido inválido' });
      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const pedido = await q1(
        `SELECT id, order_number, status, canal, total_amount, pagamento_tipo, pagamento_status,
                observation, created_at, cancelado_at, tipo_retirada, tenant_id
         FROM pedidos WHERE id=? AND tenant_id=?`,
        [orderId, tenantId]
      );
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

      const itens = await qAll(
        `SELECT ip.id, ip.product_id, ip.quantity, ip.type, ip.price_at_time, ip.variation_id,
                COALESCE(p.name, 'Produto') AS product_name
         FROM itens_pedido ip
         LEFT JOIN produtos p ON p.id = ip.product_id AND p.tenant_id = ip.tenant_id
         WHERE ip.order_id=? AND ip.tenant_id=?
         ORDER BY ip.id ASC`,
        [orderId, tenantId]
      );

      const pagamentos = await qAll(
        `SELECT id, method, amount_paid, change_given, created_at
         FROM pagamentos WHERE order_id=? AND tenant_id=? ORDER BY id ASC`,
        [orderId, tenantId]
      );

      res.json({
        pedido: {
          ...(pedido as object),
          total_amount: Number((pedido as any).total_amount || 0),
        },
        itens: (itens || []).map((r: any) => ({
          ...r,
          quantity: Number(r.quantity || 0),
          price_at_time: Number(r.price_at_time || 0),
        })),
        pagamentos: (pagamentos || []).map((r: any) => ({
          ...r,
          amount_paid: Number(r.amount_paid || 0),
          change_given: Number(r.change_given || 0),
        })),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/tenant/:id/caixa', async (req: Request, res) => {
    try {
      const tenantId = Number(req.params.id);
      if (!tenantId) return res.status(400).json({ error: 'tenant_id inválido' });
      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const caixasAbertos = await qAll(
        "SELECT id, data, fundo_inicial, status FROM caixa WHERE status='aberto' AND tenant_id=? ORDER BY data ASC",
        [tenantId]
      );
      const ultimoFechado = await q1(
        `SELECT id, data, valor_contado, closed_at FROM caixa WHERE status='fechado' AND tenant_id=? ORDER BY closed_at DESC LIMIT 1`,
        [tenantId]
      );
      res.json({
        caixas_abertos: caixasAbertos,
        status: caixasAbertos.length > 0 ? 'aberto' : 'fechado',
        ultimo_fechado: ultimoFechado,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/tenant/:id/estoque', async (req: Request, res) => {
    try {
      const tenantId = Number(req.params.id);
      if (!tenantId) return res.status(400).json({ error: 'tenant_id inválido' });
      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const [resumo, abaixoMinimo, produtosSemVinculo] = await Promise.all([
        q1(`SELECT COUNT(*) as total_ingredientes, COALESCE(SUM(estoque_atual),0) as total_estoque FROM ingredientes WHERE tenant_id=?`, [tenantId]),
        qAll(`SELECT id, nome, estoque_atual, estoque_minimo FROM ingredientes WHERE tenant_id=? AND estoque_minimo>0 AND estoque_atual<estoque_minimo ORDER BY estoque_atual ASC LIMIT 20`, [tenantId]),
        qAll(`SELECT p.id, p.name FROM produtos p WHERE p.tenant_id=? AND COALESCE(p.active, 1) = 1
          AND NOT EXISTS (SELECT 1 FROM produto_ingrediente pi WHERE pi.product_id=p.id AND pi.tenant_id=p.tenant_id)
          AND NOT EXISTS (SELECT 1 FROM produto_variacoes_vendaveis pv WHERE pv.produto_id=p.id AND pv.tenant_id=p.tenant_id AND pv.ingrediente_id IS NOT NULL AND pv.ingrediente_id > 0)
          ORDER BY p.name ASC LIMIT 50`, [tenantId]),
      ]);
      res.json({
        total_ingredientes: Number(resumo?.total_ingredientes || 0),
        total_estoque: Number(resumo?.total_estoque || 0),
        abaixo_minimo: abaixoMinimo || [],
        produtos_sem_vinculo: produtosSemVinculo || [],
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  admin.get('/tenant/:id/logs', async (req: Request, res) => {
    try {
      const tenantId = Number(req.params.id);
      const limit = Math.min(Math.max(10, Number(req.query.limit) || 15), 20);
      if (!tenantId) return res.status(400).json({ error: 'tenant_id inválido' });
      const cliente = await q1('SELECT id FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const logs = await qAll<{
        id: number;
        tenant_id: number;
        usuario_nome: string;
        cargo: string;
        acao: string;
        detalhes: string | null;
        created_at: string;
      }>(
        'SELECT id, tenant_id, usuario_nome, cargo, acao, detalhes, created_at FROM system_logs WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?',
        [tenantId, limit]
      );
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  admin.get('/tenant/:id/delivery', async (req: Request, res) => {
    try {
      const tenantId = Number(req.params.id);
      if (!tenantId) return res.status(400).json({ error: 'tenant_id inválido' });
      const cliente = await q1('SELECT id, delivery_ativo, delivery_config FROM clientes WHERE id=?', [tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const cfg = coerceDeliveryConfigRow((cliente as any).delivery_config ?? null);
      const todayStr = getTodayDateInTimeZone();
      const notCanceled = "cancelado_at IS NULL AND LOWER(COALESCE(status,'')) <> 'cancelado'";

      const [pedidosHoje, emPreparo, emRota, motoboys] = await Promise.all([
        q1(`SELECT COUNT(*) as n, COALESCE(SUM(total_amount),0) as fat FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceled} AND (created_at AT TIME ZONE '${TZ}')::date=?`, [tenantId, todayStr]),
        q1(`SELECT COUNT(*) as n FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceled} AND status IN ('Criado','Pedido Recebido','Em Preparo')`, [tenantId]),
        q1(`SELECT COUNT(*) as n FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceled} AND status='Saiu para Entrega'`, [tenantId]),
        qAll('SELECT id, nome, telefone, ativo FROM delivery_motoboys WHERE tenant_id=? ORDER BY nome', [tenantId]),
      ]);

      res.json({
        ativo: !!((cliente as any).delivery_ativo),
        config: cfg,
        pedidos_hoje: Number(pedidosHoje?.n || 0),
        faturamento_hoje: Number(pedidosHoje?.fat || 0),
        em_preparo: Number(emPreparo?.n || 0),
        em_rota: Number(emRota?.n || 0),
        motoboys: motoboys || [],
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Monta /api/admin/* com proteção
  router.use('/admin', admin);
  return router;
}
