// src/routes/barbearia.ts — módulo Barbearia/Salão
import { Router, Request } from 'express';
import { q1, qAll, qRun, qInsert } from '../db';

export function createBarberRouter() {
  const router = Router();

  // ── Clientes ───────────────────────────────────────────────────────────────
  const clienteSelectBase = (where: string) => `
    SELECT bc.*,
      (SELECT COUNT(*) FROM assinatura_clientes ac WHERE ac.cliente_id=bc.id AND ac.status='ativa' AND ac.tenant_id=bc.tenant_id AND ac.data_vencimento>=CURRENT_DATE::text) as tem_assinatura,
      (SELECT ap.nome FROM assinatura_clientes ac JOIN assinatura_planos ap ON ap.id=ac.plano_id WHERE ac.cliente_id=bc.id AND ac.status='ativa' AND ac.tenant_id=bc.tenant_id AND ac.data_vencimento>=CURRENT_DATE::text LIMIT 1) as plano_nome
    FROM barber_clientes bc WHERE bc.tenant_id=? ${where} ORDER BY bc.nome`;

  router.get('/clientes', async (req: Request, res) => {
    try {
      const { q } = req.query;
      if (q) {
        const t=`%${q}%`;
        return res.json(await qAll(clienteSelectBase('AND (bc.nome ILIKE ? OR bc.cpf ILIKE ? OR bc.telefone ILIKE ?)'), [req.tenantId,t,t,t]));
      }
      res.json(await qAll(clienteSelectBase(''), [req.tenantId]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.get('/clientes/:id', async (req: Request, res) => {
    try {
      const c = await q1('SELECT * FROM barber_clientes WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!c) return res.status(404).json({ error:'Não encontrado' });
      const [historico, assinatura, cartoes] = await Promise.all([
        qAll(`SELECT a.id,a.servico_nome,a.data,a.hora,a.valor,COALESCE(bf.nome,a.barbeiro) AS barbeiro FROM agendamentos a LEFT JOIN barber_funcionarios bf ON bf.id=a.funcionario_id WHERE a.cliente_id=? AND a.tenant_id=? AND a.status='concluido' ORDER BY a.data DESC, a.hora DESC LIMIT 20`, [req.params.id, req.tenantId]),
        q1(`SELECT ac.*,ap.nome AS plano_nome,ap.valor_mensal FROM assinatura_clientes ac JOIN assinatura_planos ap ON ap.id=ac.plano_id WHERE ac.cliente_id=? AND ac.tenant_id=? AND ac.status='ativa' ORDER BY ac.data_vencimento DESC LIMIT 1`, [req.params.id, req.tenantId]),
        qAll(`SELECT fc.*,fr.nome AS regra_nome,fr.meta FROM fidelidade_cartoes fc JOIN fidelidade_regras fr ON fr.id=fc.regra_id WHERE fc.cliente_id=? AND fc.tenant_id=?`, [req.params.id, req.tenantId]),
      ]);
      res.json({ ...c, total_cortes: historico.length, historico, assinatura:assinatura||null, cartoes });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/clientes', async (req: Request, res) => {
    try {
      const { nome, cpf, telefone, email, data_nascimento, observacoes } = req.body;
      if (!nome) return res.status(400).json({ error:'Nome obrigatório' });
      const id = await qInsert('INSERT INTO barber_clientes (nome,cpf,telefone,email,data_nascimento,observacoes,tenant_id) VALUES (?,?,?,?,?,?,?)',
        [nome, cpf||null, telefone||null, email||null, data_nascimento||null, observacoes||null, req.tenantId]);
      res.json({ success:true, id });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.put('/clientes/:id', async (req: Request, res) => {
    try {
      const { nome, cpf, telefone, email, data_nascimento, observacoes } = req.body;
      await qRun('UPDATE barber_clientes SET nome=?,cpf=?,telefone=?,email=?,data_nascimento=?,observacoes=? WHERE id=? AND tenant_id=?',
        [nome, cpf||null, telefone||null, email||null, data_nascimento||null, observacoes||null, req.params.id, req.tenantId]);
      res.json({ success:true });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/clientes/:id', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM barber_clientes WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success:true });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Agendamentos ───────────────────────────────────────────────────────────
  router.get('/agendamentos', async (req: Request, res) => {
    try {
      const { data, status } = req.query;
      let sql = `SELECT a.*, bc.telefone as cliente_telefone FROM agendamentos a LEFT JOIN barber_clientes bc ON bc.id=a.cliente_id WHERE a.tenant_id=?`;
      const p: any[] = [req.tenantId];
      if (data) { sql+=' AND a.data=?'; p.push(data); }
      if (status) { sql+=' AND a.status=?'; p.push(status); }
      res.json(await qAll(sql+' ORDER BY a.data ASC, a.hora ASC', p));
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/agendamentos', async (req: Request, res) => {
    try {
      const { cliente_id, cliente_nome, produto_id, servico_nome, barbeiro, data, hora, observacao, valor, funcionario_id } = req.body;
      if (!data||!hora||!servico_nome) return res.status(400).json({ error:'Data, hora e serviço são obrigatórios' });
      const id = await qInsert('INSERT INTO agendamentos (cliente_id,cliente_nome,produto_id,servico_nome,barbeiro,funcionario_id,data,hora,observacao,valor,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [cliente_id||null, cliente_nome||'Cliente', produto_id||null, servico_nome, barbeiro||'Qualquer', funcionario_id||null, data, hora, observacao||null, parseFloat(valor)||0, req.tenantId]);
      res.json({ success:true, id });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.patch('/agendamentos/:id', async (req: Request, res) => {
    try {
      const { status, cliente_nome, servico_nome, barbeiro, funcionario_id, data, hora, observacao, valor } = req.body;
      const ag = await q1('SELECT * FROM agendamentos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!ag) return res.status(404).json({ error:'Não encontrado' });
      await qRun(
        `UPDATE agendamentos SET status=COALESCE(?,status),cliente_nome=COALESCE(?,cliente_nome),servico_nome=COALESCE(?,servico_nome),barbeiro=COALESCE(?,barbeiro),funcionario_id=COALESCE(?,funcionario_id),data=COALESCE(?,data),hora=COALESCE(?,hora),observacao=COALESCE(?,observacao),valor=COALESCE(?,valor) WHERE id=? AND tenant_id=?`,
        [status??null,cliente_nome??null,servico_nome??null,barbeiro??null,funcionario_id!==undefined?(funcionario_id||null):null,data??null,hora??null,observacao??null,valor!==undefined?(parseFloat(valor)||0):null,req.params.id,req.tenantId]
      );

      // Fidelidade ao concluir
      let fidelidade_ganhou = false, fidelidade_cliente = '';
      if (status==='concluido' && ag.status!=='concluido' && ag.fidelidade_computada===0 && ag.cliente_id) {
        await qRun('UPDATE agendamentos SET fidelidade_computada=1 WHERE id=?', [req.params.id]);
        const regras = await qAll('SELECT * FROM fidelidade_regras WHERE tenant_id=? AND ativo=1', [req.tenantId]);
        for (const r of regras) {
          let c = await q1('SELECT * FROM fidelidade_cartoes WHERE cliente_id=? AND regra_id=? AND tenant_id=?', [ag.cliente_id, r.id, req.tenantId]);
          if (!c) {
            const cid = await qInsert('INSERT INTO fidelidade_cartoes (cliente_id,regra_id,contagem,total_ganhos,tenant_id) VALUES (?,?,0,0,?)', [ag.cliente_id, r.id, req.tenantId]);
            c = { id: cid, contagem:0, total_ganhos:0 };
          }
          const nova = (c.contagem||0)+1;
          if (nova>=r.meta) {
            fidelidade_ganhou=true;
            const cli = await q1('SELECT nome FROM barber_clientes WHERE id=?', [ag.cliente_id]);
            fidelidade_cliente=cli?.nome||'Cliente';
            await qRun('UPDATE fidelidade_cartoes SET contagem=0,total_ganhos=total_ganhos+1 WHERE id=?', [c.id]);
            await qRun('INSERT INTO fidelidade_usos (cartao_id,cliente_id,regra_id,servico_nome,ganhou,tenant_id) VALUES (?,?,?,?,1,?)',
              [c.id,ag.cliente_id,r.id,ag.servico_nome||'Serviço',req.tenantId]);
          } else {
            await qRun('UPDATE fidelidade_cartoes SET contagem=? WHERE id=?', [nova,c.id]);
          }
        }
      }
      res.json({ success:true, fidelidade_ganhou, fidelidade_cliente });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/agendamentos/:id', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM agendamentos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success:true });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Fidelidade ─────────────────────────────────────────────────────────────
  router.get('/fidelidade/regras', async (req: Request, res) => {
    res.json(await qAll('SELECT * FROM fidelidade_regras WHERE tenant_id=? ORDER BY nome', [req.tenantId]));
  });
  router.post('/fidelidade/regras', async (req: Request, res) => {
    const { nome, meta, descricao } = req.body;
    const id = await qInsert('INSERT INTO fidelidade_regras (nome,meta,descricao,tenant_id) VALUES (?,?,?,?)', [nome, meta||10, descricao||null, req.tenantId]);
    res.json({ success:true, id });
  });
  router.put('/fidelidade/regras/:id', async (req: Request, res) => {
    const { nome, meta, descricao, ativo } = req.body;
    await qRun('UPDATE fidelidade_regras SET nome=?,meta=?,descricao=?,ativo=? WHERE id=? AND tenant_id=?',
      [nome, meta, descricao||null, ativo!==undefined?ativo:1, req.params.id, req.tenantId]);
    res.json({ success:true });
  });
  router.delete('/fidelidade/regras/:id', async (req: Request, res) => {
    await qRun('DELETE FROM fidelidade_regras WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ success:true });
  });

  router.post('/fidelidade/uso', async (req: Request, res) => {
    try {
      const { cliente_id, regra_id, servico_nome } = req.body;
      const [ex, r] = await Promise.all([
        q1('SELECT * FROM fidelidade_cartoes WHERE cliente_id=? AND regra_id=? AND tenant_id=?', [cliente_id, regra_id, req.tenantId]),
        q1('SELECT * FROM fidelidade_regras WHERE id=? AND tenant_id=?', [regra_id, req.tenantId]),
      ]);
      if (!r) return res.status(404).json({ error:'Regra não encontrada' });
      let nova = (ex?.contagem||0)+1; let ganhou=false; let ganhos=ex?.total_ganhos||0;
      if (nova>=r.meta) { ganhou=true; nova=0; ganhos++; await qRun('INSERT INTO fidelidade_historico (cliente_id,regra_id,servico_nome,tipo,tenant_id) VALUES (?,?,?,?,?)',[cliente_id,regra_id,servico_nome,'ganho',req.tenantId]); }
      await qRun('INSERT INTO fidelidade_historico (cliente_id,regra_id,servico_nome,tipo,tenant_id) VALUES (?,?,?,?,?)',[cliente_id,regra_id,servico_nome,'uso',req.tenantId]);
      if (ex) await qRun('UPDATE fidelidade_cartoes SET contagem=?,total_ganhos=?,updated_at=NOW() WHERE id=?',[nova,ganhos,ex.id]);
      else await qRun('INSERT INTO fidelidade_cartoes (cliente_id,regra_id,contagem,total_ganhos,tenant_id) VALUES (?,?,?,?,?)',[cliente_id,regra_id,nova,ganhos,req.tenantId]);
      res.json({ success:true, ganhou, contagem:nova, meta:r.meta });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.get('/fidelidade/cliente/:clienteId', async (req: Request, res) => {
    const [cartoes, historico] = await Promise.all([
      qAll('SELECT fc.*,fr.nome as regra_nome,fr.meta,fr.descricao FROM fidelidade_cartoes fc JOIN fidelidade_regras fr ON fr.id=fc.regra_id WHERE fc.cliente_id=? AND fc.tenant_id=?', [req.params.clienteId, req.tenantId]),
      qAll('SELECT fh.*,fr.nome as regra_nome FROM fidelidade_historico fh JOIN fidelidade_regras fr ON fr.id=fh.regra_id WHERE fh.cliente_id=? AND fh.tenant_id=? ORDER BY fh.created_at DESC LIMIT 20', [req.params.clienteId, req.tenantId]),
    ]);
    res.json({ cartoes, historico });
  });

  // ── Assinaturas ────────────────────────────────────────────────────────────
  router.get('/assinaturas/planos', async (req: Request, res) => {
    res.json(await qAll('SELECT * FROM assinatura_planos WHERE tenant_id=? ORDER BY valor_mensal', [req.tenantId]));
  });
  router.post('/assinaturas/planos', async (req: Request, res) => {
    const { nome, descricao, valor_mensal } = req.body;
    if (!nome||!valor_mensal) return res.status(400).json({ error:'Nome e valor são obrigatórios' });
    const id = await qInsert('INSERT INTO assinatura_planos (nome,descricao,valor_mensal,tenant_id) VALUES (?,?,?,?)', [nome, descricao||null, valor_mensal, req.tenantId]);
    res.json({ success:true, id });
  });
  router.put('/assinaturas/planos/:id', async (req: Request, res) => {
    const { nome, descricao, valor_mensal, ativo } = req.body;
    await qRun('UPDATE assinatura_planos SET nome=?,descricao=?,valor_mensal=?,ativo=? WHERE id=? AND tenant_id=?',
      [nome, descricao||null, valor_mensal, ativo!==undefined?ativo:1, req.params.id, req.tenantId]);
    res.json({ success:true });
  });
  router.delete('/assinaturas/planos/:id', async (req: Request, res) => {
    await qRun('DELETE FROM assinatura_planos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ success:true });
  });

  router.get('/assinaturas/planos-detalhados', async (req: Request, res) => {
    try {
      const planos = await qAll('SELECT * FROM assinatura_planos WHERE tenant_id=? ORDER BY valor_mensal', [req.tenantId]);
      const result = [];
      for (const p of planos) {
        const servicos = await qAll('SELECT ps.*,pr.name as produto_nome FROM plano_servicos ps LEFT JOIN produtos pr ON pr.id=ps.produto_id WHERE ps.plano_id=?', [p.id]);
        result.push({ ...p, servicos });
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/assinaturas/assinar', async (req: Request, res) => {
    try {
      const { cliente_id, plano_id, data_inicio, data_vencimento } = req.body;
      await qRun("UPDATE assinatura_clientes SET status='cancelada' WHERE cliente_id=? AND tenant_id=? AND status='ativa'", [cliente_id, req.tenantId]);
      const id = await qInsert('INSERT INTO assinatura_clientes (cliente_id,plano_id,status,data_inicio,data_vencimento,tenant_id) VALUES (?,?,?,?,?,?)',
        [cliente_id, plano_id, 'ativa', data_inicio, data_vencimento, req.tenantId]);
      res.json({ success:true, id });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.get('/assinaturas/assinantes', async (req: Request, res) => {
    res.json(await qAll(
      'SELECT ac.*,bc.nome as cliente_nome,bc.telefone,ap.nome as plano_nome,ap.valor_mensal FROM assinatura_clientes ac JOIN barber_clientes bc ON bc.id=ac.cliente_id JOIN assinatura_planos ap ON ap.id=ac.plano_id WHERE ac.tenant_id=? ORDER BY ac.data_vencimento DESC',
      [req.tenantId]
    ));
  });

  router.get('/assinaturas/relatorio', async (req: Request, res) => {
    const ini = (req.query.inicio as string)||new Date().toISOString().slice(0,7)+'-01';
    const fim = (req.query.fim as string)||new Date().toISOString().slice(0,10);
    const [total_usos, assinantes, receita_mes] = await Promise.all([
      q1("SELECT COUNT(*) as c FROM assinatura_usos WHERE tenant_id=? AND data BETWEEN ? AND ?", [req.tenantId,ini,fim]),
      q1("SELECT COUNT(*) as c FROM assinatura_clientes WHERE tenant_id=? AND status='ativa'", [req.tenantId]),
      q1("SELECT COALESCE(SUM(ap.valor_mensal),0) as total FROM assinatura_clientes ac JOIN assinatura_planos ap ON ap.id=ac.plano_id WHERE ac.tenant_id=? AND ac.status='ativa'", [req.tenantId]),
    ]);
    res.json({ total_usos: total_usos?.c||0, assinantes_ativos: assinantes?.c||0, receita_mes: receita_mes?.total||0 });
  });

  router.patch('/assinaturas/:id/cancelar', async (req: Request, res) => {
    await qRun("UPDATE assinatura_clientes SET status='cancelada' WHERE id=? AND tenant_id=?", [req.params.id,req.tenantId]);
    res.json({success:true});
  });
  router.patch('/assinaturas/:id/renovar', async (req: Request, res) => {
    await qRun("UPDATE assinatura_clientes SET status='ativa',data_vencimento=? WHERE id=? AND tenant_id=?", [req.body.data_vencimento,req.params.id,req.tenantId]);
    res.json({success:true});
  });

  router.get('/assinaturas/check', async (req: Request, res) => {
    try {
      const { cliente_id, produto_id } = req.query;
      if (!cliente_id) return res.json({ coberto:false });
      const as = await q1("SELECT ac.*,ap.nome FROM assinatura_clientes ac JOIN assinatura_planos ap ON ap.id=ac.plano_id WHERE ac.cliente_id=? AND ac.tenant_id=? AND ac.status='ativa' AND ac.data_vencimento>=CURRENT_DATE::text LIMIT 1", [cliente_id, req.tenantId]);
      if (!as) return res.json({ coberto:false });
      if (!produto_id) return res.json({ coberto:true, assinatura:as });
      const svc = await q1('SELECT * FROM plano_servicos WHERE plano_id=? AND produto_id=?', [as.plano_id, produto_id]);
      res.json({ coberto:!!svc, assinatura:as });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Funcionários barber ────────────────────────────────────────────────────
  router.get('/funcionarios', async (req: Request, res) => {
    res.json(await qAll(
      `SELECT bf.*,COUNT(CASE WHEN a.status='concluido' THEN 1 END) as total_atendimentos FROM barber_funcionarios bf LEFT JOIN agendamentos a ON a.funcionario_id=bf.id AND a.tenant_id=bf.tenant_id WHERE bf.tenant_id=? GROUP BY bf.id ORDER BY bf.nome`,
      [req.tenantId]
    ));
  });
  router.post('/funcionarios', async (req: Request, res) => {
    const { nome, cargo, telefone, percentual_repasse, cor } = req.body;
    if (!nome) return res.status(400).json({ error:'Nome obrigatório' });
    const id = await qInsert('INSERT INTO barber_funcionarios (nome,cargo,telefone,percentual_repasse,cor,tenant_id) VALUES (?,?,?,?,?,?)',
      [nome, cargo||'Barbeiro', telefone||null, percentual_repasse??50, cor||'zinc', req.tenantId]);
    res.json({ success:true, id });
  });
  router.put('/funcionarios/:id', async (req: Request, res) => {
    const { nome, cargo, telefone, percentual_repasse, ativo, cor } = req.body;
    await qRun('UPDATE barber_funcionarios SET nome=?,cargo=?,telefone=?,percentual_repasse=?,ativo=?,cor=? WHERE id=? AND tenant_id=?',
      [nome, cargo||'Barbeiro', telefone||null, percentual_repasse??50, ativo!==undefined?ativo:1, cor||'zinc', req.params.id, req.tenantId]);
    res.json({ success:true });
  });
  router.delete('/funcionarios/:id', async (req: Request, res) => {
    await qRun('UPDATE barber_funcionarios SET ativo=0 WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
    res.json({success:true});
  });

  router.get('/produtos-com-estoque', async (req: Request, res) => {
    const rows = await qAll('SELECT DISTINCT product_id as id FROM produto_ingrediente WHERE tenant_id=?', [req.tenantId]);
    res.json({ ids: rows.map((r:any)=>r.id) });
  });

  // ── Produção ───────────────────────────────────────────────────────────────
  router.get('/producao', async (req: Request, res) => {
    try {
      const { inicio, fim, funcionario_id } = req.query;
      const di = (inicio as string)||new Date().toISOString().slice(0,7)+'-01';
      const df = (fim as string)||new Date().toISOString().slice(0,10);
      let sql = `SELECT bf.id,bf.nome,bf.cargo,bf.percentual_repasse,bf.cor,
        COUNT(CASE WHEN a.status='concluido' THEN 1 END) as qtd_atendimentos,
        SUM(CASE WHEN a.status='concluido' THEN CAST(a.valor AS REAL) ELSE 0.0 END) as total_produzido,
        SUM(CASE WHEN a.status='concluido' THEN (CAST(a.valor AS REAL)*CAST(bf.percentual_repasse AS REAL)/100.0) ELSE 0.0 END) as valor_repasse
        FROM barber_funcionarios bf
        LEFT JOIN agendamentos a ON a.funcionario_id=bf.id AND a.tenant_id=bf.tenant_id AND a.data BETWEEN ? AND ?
        WHERE bf.tenant_id=? AND bf.ativo=1`;
      const params: any[] = [di,df,req.tenantId];
      if (funcionario_id) { sql+=' AND bf.id=?'; params.push(funcionario_id); }
      sql+=' GROUP BY bf.id ORDER BY total_produzido DESC';
      const funcionariosBase = await qAll(sql, params);
      const pagtos = await qAll('SELECT funcionario_id,COALESCE(SUM(valor_repasse),0) as total_ja_pago FROM pagamentos_funcionarios WHERE tenant_id=? AND periodo_inicio=? AND periodo_fim=? GROUP BY funcionario_id', [req.tenantId,di,df]);
      const map: Record<number,number> = {};
      for (const p of pagtos) map[p.funcionario_id]=Number(p.total_ja_pago);
      const funcionarios = funcionariosBase.map((f:any)=>({ ...f, total_ja_pago:map[f.id]||0, valor_repasse_pendente:Math.max(0,(f.valor_repasse||0)-(map[f.id]||0)) }));
      let atendimentos: any[] = [];
      if (funcionario_id) atendimentos = await qAll(`SELECT a.*,bc.nome as cliente_nome_cadastrado FROM agendamentos a LEFT JOIN barber_clientes bc ON bc.id=a.cliente_id AND bc.tenant_id=a.tenant_id WHERE a.funcionario_id=? AND a.tenant_id=? AND a.status='concluido' AND a.data BETWEEN ? AND ? ORDER BY a.data DESC, a.hora DESC`, [funcionario_id,req.tenantId,di,df]);
      res.json({ funcionarios, atendimentos, periodo:{inicio:di,fim:df} });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  return router;
}
