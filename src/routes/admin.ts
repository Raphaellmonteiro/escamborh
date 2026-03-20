// src/routes/admin.ts — painel administrativo FlowPDV
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q1, qAll, qRun, qInsert, withTx, txInsert, txRun } from '../db';
import { loginRateLimiter, authenticateAdmin, ADMIN_SECRET } from '../middleware';
import { generatePublicId } from '../utils/publicIds';

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
      const usuario = sol.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const senha   = Math.random().toString(36).slice(-8);
      const hash    = bcrypt.hashSync(senha, 10);
      const venc    = new Date(); venc.setDate(venc.getDate() + 7);

      const clienteId = await withTx(async (client) => {
        const cid = await txInsert(client,
          `INSERT INTO clientes (nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,usuario,senha,status,vencimento,segmento) VALUES (?,?,?,?,?,?,?,?,?,?,'ativo',?,?)`,
          [sol.nome_estabelecimento,sol.razao_social,sol.documento_tipo,sol.documento_numero,sol.nome_responsavel,sol.email,sol.whatsapp,sol.cidade,usuario,hash,venc.toISOString(),segmentoFinal]
        );
        await txRun(client, "UPDATE solicitacoes SET status='aprovado', segmento=? WHERE id=?", [segmentoFinal, sol.id]);
        await txRun(client,
          `INSERT INTO usuarios (username,password,cargo,nome,cliente_id,ativo,token_version) VALUES (?,?,'dono',?,?,1,1)
           ON CONFLICT(username) DO UPDATE SET password=EXCLUDED.password,cargo='dono',nome=EXCLUDED.nome,cliente_id=EXCLUDED.cliente_id,ativo=1`,
          [usuario, hash, sol.nome_responsavel, cid]
        );
        await txRun(client, "INSERT INTO produtos (public_id,name,price,category,active,tenant_id) VALUES (?, 'Produto Exemplo',10.00,'Geral',1,?)", [generatePublicId('prd'), cid]);
        return cid;
      });
      res.json({ success: true, usuario, senha, vencimento: venc.toISOString(), segmento: segmentoFinal });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
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
      const { nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,plano,valor_plano,vencimento,status,segmento } = req.body;
      const ant = await q1('SELECT vencimento,plano FROM clientes WHERE id=?', [req.params.id]);
      await qRun(
        `UPDATE clientes SET nome_estabelecimento=?,razao_social=?,documento_tipo=?,documento_numero=?,nome_responsavel=?,email=?,whatsapp=?,cidade=?,plano=?,valor_plano=?,vencimento=?,status=?,segmento=? WHERE id=?`,
        [nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,plano,valor_plano,vencimento,status,segmento||'Restaurante/Food',req.params.id]
      );
      if (vencimento !== ant?.vencimento || plano !== ant?.plano)
        await qRun('INSERT INTO renovacoes (cliente_id,plano,valor,vencimento_anterior,novo_vencimento) VALUES (?,?,?,?,?)',
          [req.params.id,plano,valor_plano,ant?.vencimento,vencimento]);
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
        q1("SELECT SUM(valor_plano) as total FROM clientes WHERE status='ativo' AND plano!='trial'", []),
        q1("SELECT COUNT(*) as total FROM clientes WHERE status='ativo' AND plano!='trial'", []),
        qAll(`SELECT nome_estabelecimento,plano,valor_plano,vencimento,whatsapp,
               EXTRACT(DAY FROM (vencimento - NOW())) as dias
               FROM clientes WHERE status='ativo' AND vencimento IS NOT NULL
               AND vencimento <= NOW() + INTERVAL '7 days' ORDER BY vencimento ASC`, []),
        qAll(`SELECT TO_CHAR(data_pagamento AT TIME ZONE '${TZ}', 'MM/YYYY') as mes, SUM(valor) as total
              FROM renovacoes GROUP BY mes ORDER BY MIN(data_pagamento) DESC LIMIT 6`, []),
        qAll("SELECT nome_estabelecimento,plano,valor_plano,vencimento,ultimo_acesso FROM clientes WHERE plano!='trial' ORDER BY vencimento ASC", []),
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
        total: total?.c||0, ativos: ativos?.c||0, bloqueados: bloqueados?.c||0,
        pendentes: pendentes?.c||0, expirados: expirados?.c||0,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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

  // Monta /api/admin/* com proteção
  router.use('/admin', admin);
  return router;
}
