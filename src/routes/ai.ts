// src/routes/ai.ts - avisos deterministicos + analise com IA
import { Router, Request } from 'express';
import { q1, qAll, qRun } from '../db';
import { requirePlanFeature } from '../middleware';
import { refreshDeterministicAlerts } from '../services/alertsService';

const TZ = 'America/Sao_Paulo';

export function createAiRouter() {
  const router = Router();

  router.get('/avisos', async (req: Request, res) => {
    try {
      await refreshDeterministicAlerts(req.tenantId!);
      res.json(
        await qAll(
          `SELECT *
           FROM ai_avisos
           WHERE tenant_id=?
             AND lido=0
             AND (expira_em IS NULL OR expira_em > NOW())
           ORDER BY prioridade DESC, id DESC`,
          [req.tenantId]
        )
      );
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/avisos/historico', async (req: Request, res) => {
    try {
      await refreshDeterministicAlerts(req.tenantId!);
      const limit = Math.min(Number(req.query.limit) || 100, 200);
      const offset = Number(req.query.offset) || 0;
      const [lista, total] = await Promise.all([
        qAll('SELECT * FROM ai_avisos WHERE tenant_id=? ORDER BY id DESC LIMIT ? OFFSET ?', [
          req.tenantId,
          limit,
          offset,
        ]),
        q1('SELECT COUNT(*) AS n FROM ai_avisos WHERE tenant_id=?', [req.tenantId]),
      ]);
      res.json({ avisos: lista, total: total?.n || 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/avisos/:id/lido', async (req: Request, res) => {
    try {
      await qRun('UPDATE ai_avisos SET lido=1 WHERE id=? AND tenant_id=?', [
        req.params.id,
        req.tenantId,
      ]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/avisos/todos-lidos', async (req: Request, res) => {
    try {
      await qRun('UPDATE ai_avisos SET lido=1 WHERE tenant_id=? AND lido=0', [req.tenantId]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/avisos/historico', async (req: Request, res) => {
    try {
      await qRun(
        "DELETE FROM ai_avisos WHERE tenant_id=? AND created_at < NOW() - INTERVAL '30 days'",
        [req.tenantId]
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/avisos/gerar', async (req: Request, res) => {
    try {
      const result = await refreshDeterministicAlerts(req.tenantId!);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/analisar', requirePlanFeature('ai'), async (req: Request, res) => {
    const { tipo = 'visao_geral', pergunta } = req.body || {};
    const tenantId = req.tenantId!;

    const cached = await q1(
      `SELECT resultado
       FROM ai_cache
       WHERE tenant_id=?
         AND tipo=?
         AND created_at >= NOW() - INTERVAL '1 hour'
       ORDER BY id DESC
       LIMIT 1`,
      [tenantId, pergunta ? 'livre' : tipo]
    );
    if (cached && !pergunta) {
      try {
        return res.json(JSON.parse(cached.resultado));
      } catch {}
    }

    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        return res
          .status(503)
          .json({ error: 'FlowAI nao configurado. Defina ANTHROPIC_API_KEY no .env.' });
      }

      const tenant = await q1(
        'SELECT nome_estabelecimento, segmento FROM clientes WHERE id=?',
        [tenantId]
      );
      let contexto: Record<string, any> = {};

      if (tipo === 'visao_geral' || !tipo) {
        const [ph, p7] = await Promise.all([
          q1(
            `SELECT COUNT(*) AS total, COALESCE(SUM(total_amount),0) AS receita, COALESCE(AVG(total_amount),0) AS ticket
             FROM pedidos
             WHERE tenant_id=?
               AND (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE`,
            [tenantId]
          ),
          q1(
            `SELECT COUNT(*) AS total, COALESCE(SUM(total_amount),0) AS receita
             FROM pedidos
             WHERE tenant_id=?
               AND created_at >= NOW() - INTERVAL '7 days'`,
            [tenantId]
          ),
        ]);
        contexto = { pedidosHoje: ph, pedidos7d: p7 };
      }
      if (tipo === 'financeiro') {
        const [fin, desp] = await Promise.all([
          q1(
            `SELECT
               COALESCE(SUM(CASE WHEN (created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE THEN total_amount END),0) AS hoje,
               COALESCE(SUM(CASE WHEN created_at >= NOW()-INTERVAL '7 days' THEN total_amount END),0) AS semana,
               COALESCE(SUM(CASE WHEN created_at >= NOW()-INTERVAL '30 days' THEN total_amount END),0) AS mes
             FROM pedidos
             WHERE tenant_id=?`,
            [tenantId]
          ),
          q1(
            `SELECT COALESCE(SUM(amount),0) AS total
             FROM despesas
             WHERE tenant_id=?
               AND created_at >= NOW() - INTERVAL '30 days'`,
            [tenantId]
          ),
        ]);
        contexto = { receitas: fin, despesas30d: desp?.total };
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic();
      const prompt = pergunta
        ? `Voce e um consultor de negocios para "${tenant?.nome_estabelecimento}" (${tenant?.segmento}). Dados: ${JSON.stringify(contexto)}. Pergunta: ${pergunta}`
        : `Analise "${tenant?.nome_estabelecimento}" (${tenant?.segmento}). Dados: ${JSON.stringify(contexto)}. De 3 insights acionaveis em JSON: {insights:[{titulo,descricao,acao}], resumo}`;

      const msg = await client.messages.create({
        model: 'claude-sonnet-4-5-20251101',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const texto = msg.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      let resultado: any = { texto };
      if (!pergunta) {
        try {
          resultado = JSON.parse(texto.replace(/```json?|```/g, ''));
        } catch {}
      }

      await qRun('INSERT INTO ai_cache (tenant_id, tipo, resultado) VALUES (?,?,?)', [
        tenantId,
        pergunta ? 'livre' : tipo,
        JSON.stringify(resultado),
      ]);
      res.json(resultado);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
