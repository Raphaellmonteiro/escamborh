// src/routes/ai.ts — FlowAI: avisos automáticos + análise Claude
import { Router, Request } from 'express';
import { q1, qAll, qRun, qInsert } from '../db';

const TZ = 'America/Sao_Paulo';

async function avisoJaHoje(tenantId: number, chave: string): Promise<boolean> {
  const row = await q1(
    `SELECT id FROM ai_avisos WHERE tenant_id=? AND chave=? AND (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE LIMIT 1`,
    [tenantId, chave]
  );
  return !!row;
}

async function gerarAvisosAutomaticos(tenantId: number): Promise<number> {
  const avisos: any[] = [];
  try {
    const tenant = await q1('SELECT segmento FROM clientes WHERE id=?', [tenantId]);
    const segmento = tenant?.segmento || 'Restaurante/Food';
    const isBarbearia = segmento === 'Barbearia/Salão';

    // U1 — Produtos sem venda há 7+ dias
    const parados = await qAll(
      `SELECT name FROM produtos WHERE tenant_id=? AND active=1
       AND id NOT IN (
         SELECT DISTINCT ip.product_id FROM itens_pedido ip
         JOIN pedidos pd ON pd.id=ip.order_id
         WHERE ip.tenant_id=? AND pd.created_at >= NOW() - INTERVAL '7 days'
       ) LIMIT 3`,
      [tenantId, tenantId]
    );
    if (parados.length > 0 && !await avisoJaHoje(tenantId, 'parado'))
      avisos.push({ tipo:'atencao', prioridade:2, chave:'parado', titulo:`${parados.length} item(ns) sem venda há 7+ dias`, mensagem:`"${parados.map((p:any)=>p.name).join('", "')}" . Considere promover ou rever o preço.`, acao:'Ver cardápio', acao_rota:'/products' });

    // U2 — Produto mais vendido
    const top = await q1(
      `SELECT p.name, SUM(ip.quantity) AS qtd FROM itens_pedido ip
       JOIN produtos p ON p.id=ip.product_id
       JOIN pedidos pd ON pd.id=ip.order_id
       WHERE ip.tenant_id=? AND pd.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY p.id, p.name ORDER BY qtd DESC LIMIT 1`,
      [tenantId]
    );
    if (top && top.qtd >= 5 && !await avisoJaHoje(tenantId, 'mais vendido'))
      avisos.push({ tipo:'oportunidade', prioridade:1, chave:'mais vendido', titulo:`⭐ "${top.name}" está bombando!`, mensagem:`Vendido ${top.qtd}x esta semana. Garanta estoque e destaque no cardápio.` });

    // U3 — Dia excepcional
    const rec = await q1(
      `SELECT
         (SELECT COALESCE(SUM(total_amount),0) FROM pedidos WHERE tenant_id=? AND (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE) AS receita_hoje,
         (SELECT COALESCE(AVG(rd),0) FROM (SELECT SUM(total_amount) AS rd FROM pedidos WHERE tenant_id=? AND created_at >= NOW() - INTERVAL '30 days' GROUP BY (created_at AT TIME ZONE '${TZ}')::date) sub) AS media_30d`,
      [tenantId, tenantId]
    );
    if (rec) {
      const pct = rec.media_30d > 0 ? ((rec.receita_hoje - rec.media_30d) / rec.media_30d) * 100 : 0;
      if (pct >= 20 && !await avisoJaHoje(tenantId, 'excepcional'))
        avisos.push({ tipo:'parabens', prioridade:1, chave:'excepcional', titulo:`🔥 Dia excepcional! +${pct.toFixed(0)}%`, mensagem:`Receita hoje (R$ ${Number(rec.receita_hoje).toFixed(2)}) está ${pct.toFixed(0)}% acima da média dos últimos 30 dias.` });
      else if (pct <= -30 && !await avisoJaHoje(tenantId, 'abaixo do esperado'))
        avisos.push({ tipo:'atencao', prioridade:2, chave:'abaixo do esperado', titulo:`📉 Receita ${Math.abs(pct).toFixed(0)}% abaixo da média`, mensagem:`Hoje está bem abaixo do ritmo normal (média: R$ ${Number(rec.media_30d).toFixed(2)}).` });
    }

    // U4 — Hora de ouro
    const diaSemana = new Date().getDay();
    const horaOuro = await q1(
      `SELECT TO_CHAR(created_at AT TIME ZONE '${TZ}', 'HH24') AS hora, COUNT(*) AS pedidos
       FROM pedidos WHERE tenant_id=? AND EXTRACT(DOW FROM created_at AT TIME ZONE '${TZ}')=?
       AND created_at >= NOW() - INTERVAL '60 days'
       GROUP BY hora ORDER BY pedidos DESC LIMIT 1`,
      [tenantId, diaSemana]
    );
    if (horaOuro && horaOuro.pedidos >= 3 && !await avisoJaHoje(tenantId, 'hora de ouro')) {
      const dias = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
      avisos.push({ tipo:'oportunidade', prioridade:1, chave:'hora de ouro', titulo:`⏰ Hora de ouro de ${dias[diaSemana]}: ${horaOuro.hora}h`, mensagem:`Nas últimas semanas, ${horaOuro.hora}h é seu pico neste dia. Prepare equipe e estoque.` });
    }

    // U5 — Sem vendas hoje (após 14h)
    if (new Date().getHours() >= 14) {
      const vh = await q1(
        `SELECT COUNT(*) AS total FROM pedidos WHERE tenant_id=? AND (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE`,
        [tenantId]
      );
      if (Number(vh?.total || 0) === 0 && !await avisoJaHoje(tenantId, 'sem vendas hoje'))
        avisos.push({ tipo:'atencao', prioridade:2, chave:'sem vendas hoje', titulo:'⚠️ Nenhuma venda registrada hoje', mensagem:`Já são ${new Date().getHours()}h e não há nenhuma venda no sistema.` });
    }

    // U6 — Estoque crítico
    const esCrit = await qAll(
      'SELECT nome, estoque_atual, estoque_minimo FROM ingredientes WHERE tenant_id=? AND estoque_minimo>0 AND estoque_atual<=estoque_minimo LIMIT 5',
      [tenantId]
    );
    if (esCrit.length > 0 && !await avisoJaHoje(tenantId, 'estoque critico'))
      avisos.push({ tipo:'atencao', prioridade:3, chave:'estoque critico', titulo:`⚠️ ${esCrit.length} insumo(s) no limite mínimo`, mensagem:`"${esCrit.map((i:any)=>i.nome).join('", "')}" . Reponha o estoque antes de acabar.`, acao:'Ver estoque', acao_rota:'/estoque' });

    // Barbearia: agendamentos do dia
    if (isBarbearia) {
      const hoje = new Date().toISOString().split('T')[0];
      const agds = await q1(`SELECT COUNT(*) AS total FROM agendamentos WHERE tenant_id=? AND data=? AND status='agendado'`, [tenantId, hoje]);
      if (Number(agds?.total || 0) > 0 && !await avisoJaHoje(tenantId, 'agendamentos hoje'))
        avisos.push({ tipo:'info', prioridade:1, chave:'agendamentos hoje', titulo:`📅 ${agds.total} agendamento(s) hoje`, mensagem:`Você tem ${agds.total} cliente(s) agendado(s) hoje.`, acao:'Ver agenda', acao_rota:'/barbearia' });
    }

    if (avisos.length > 0) {
      for (const a of avisos) {
        await qRun('INSERT INTO ai_avisos (tenant_id,tipo,titulo,mensagem,acao,acao_rota,prioridade,chave) VALUES (?,?,?,?,?,?,?,?)',
          [tenantId, a.tipo, a.titulo, a.mensagem, a.acao||null, a.acao_rota||null, a.prioridade, a.chave]);
      }
    }
    return avisos.length;
  } catch (e) { console.error('gerarAvisosAutomaticos:', e); return 0; }
}

export function createAiRouter() {
  const router = Router();

  // GET avisos não lidos
  router.get('/avisos', async (req: Request, res) => {
    try {
      res.json(await qAll(
        `SELECT * FROM ai_avisos WHERE tenant_id=? AND lido=0 AND (expira_em IS NULL OR expira_em > NOW()) ORDER BY prioridade DESC, id DESC`,
        [req.tenantId]
      ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET histórico completo
  router.get('/avisos/historico', async (req: Request, res) => {
    try {
      const limit = Math.min(Number(req.query.limit)||100, 200);
      const offset = Number(req.query.offset)||0;
      const [lista, total] = await Promise.all([
        qAll('SELECT * FROM ai_avisos WHERE tenant_id=? ORDER BY id DESC LIMIT ? OFFSET ?', [req.tenantId, limit, offset]),
        q1('SELECT COUNT(*) AS n FROM ai_avisos WHERE tenant_id=?', [req.tenantId]),
      ]);
      res.json({ avisos: lista, total: total?.n||0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST marcar aviso como lido
  router.post('/avisos/:id/lido', async (req: Request, res) => {
    try {
      await qRun('UPDATE ai_avisos SET lido=1 WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST marcar todos como lidos
  router.post('/avisos/todos-lidos', async (req: Request, res) => {
    try {
      await qRun('UPDATE ai_avisos SET lido=1 WHERE tenant_id=? AND lido=0', [req.tenantId]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE limpar histórico antigo
  router.delete('/avisos/historico', async (req: Request, res) => {
    try {
      await qRun("DELETE FROM ai_avisos WHERE tenant_id=? AND created_at < NOW() - INTERVAL '30 days'", [req.tenantId]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST gerar avisos automáticos manualmente
  router.post('/avisos/gerar', async (req: Request, res) => {
    try {
      const total = await gerarAvisosAutomaticos(req.tenantId!);
      res.json({ gerados: total });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST análise com IA (Claude)
  router.post('/analisar', async (req: Request, res) => {
    const { tipo = 'visao_geral', pergunta } = req.body || {};
    const tenantId = req.tenantId!;

    // Verifica cache de 1 hora
    const cached = await q1(
      `SELECT resultado FROM ai_cache WHERE tenant_id=? AND tipo=? AND created_at >= NOW() - INTERVAL '1 hour' ORDER BY id DESC LIMIT 1`,
      [tenantId, pergunta ? 'livre' : tipo]
    );
    if (cached && !pergunta) {
      try { return res.json(JSON.parse(cached.resultado)); } catch {}
    }

    try {
      if (!process.env.ANTHROPIC_API_KEY)
        return res.status(503).json({ error: 'FlowAI não configurado. Defina ANTHROPIC_API_KEY no .env.' });

      const tenant = await q1('SELECT nome_estabelecimento, segmento FROM clientes WHERE id=?', [tenantId]);
      let contexto: Record<string, any> = {};

      if (tipo === 'visao_geral' || !tipo) {
        const [ph, p7] = await Promise.all([
          q1(`SELECT COUNT(*) AS total, COALESCE(SUM(total_amount),0) AS receita, COALESCE(AVG(total_amount),0) AS ticket FROM pedidos WHERE tenant_id=? AND (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE`, [tenantId]),
          q1(`SELECT COUNT(*) AS total, COALESCE(SUM(total_amount),0) AS receita FROM pedidos WHERE tenant_id=? AND created_at >= NOW() - INTERVAL '7 days'`, [tenantId]),
        ]);
        contexto = { pedidosHoje: ph, pedidos7d: p7 };
      }
      if (tipo === 'financeiro') {
        const [fin, desp] = await Promise.all([
          q1(`SELECT
               COALESCE(SUM(CASE WHEN (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE THEN total_amount END),0) AS hoje,
               COALESCE(SUM(CASE WHEN created_at >= NOW()-INTERVAL '7 days' THEN total_amount END),0) AS semana,
               COALESCE(SUM(CASE WHEN created_at >= NOW()-INTERVAL '30 days' THEN total_amount END),0) AS mes
               FROM pedidos WHERE tenant_id=?`, [tenantId]),
          q1(`SELECT COALESCE(SUM(amount),0) AS total FROM despesas WHERE tenant_id=? AND created_at >= NOW() - INTERVAL '30 days'`, [tenantId]),
        ]);
        contexto = { receitas: fin, despesas30d: desp?.total };
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic();
      const prompt = pergunta
        ? `Você é um consultor de negócios para "${tenant?.nome_estabelecimento}" (${tenant?.segmento}). Dados: ${JSON.stringify(contexto)}. Pergunta: ${pergunta}`
        : `Analise "${tenant?.nome_estabelecimento}" (${tenant?.segmento}). Dados: ${JSON.stringify(contexto)}. Dê 3 insights acionáveis em JSON: {insights:[{titulo,descricao,acao}], resumo}`;

      const msg = await client.messages.create({
        model: 'claude-sonnet-4-5-20251101', max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });
      const texto = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      let resultado: any = { texto };
      if (!pergunta) { try { resultado = JSON.parse(texto.replace(/```json?|```/g, '')); } catch {} }

      await qRun('INSERT INTO ai_cache (tenant_id, tipo, resultado) VALUES (?,?,?)',
        [tenantId, pergunta ? 'livre' : tipo, JSON.stringify(resultado)]);
      res.json(resultado);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}