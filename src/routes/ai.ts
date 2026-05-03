// src/routes/ai.ts - avisos deterministicos + analise com IA
import { Router, Request } from 'express';
import { q1, qAll, qRun } from '../db';
import { sendInternalError } from '../utils/internalServerError';
import { requireAnyPermission, requirePlanFeature } from '../middleware';
import { refreshDeterministicAlerts } from '../services/alertsService';
import { getTenantFeatures } from '../services/tenantPlan';
import { type PlanFeature } from '../config/planFeatures';

const TZ = 'America/Sao_Paulo';

const TIPOS_ANALISE = new Set(['visao_geral', 'financeiro']);

function buildAvisosFeatureFilters(features: PlanFeature[]) {
  const blockedLike: string[] = [];

  if (!features.includes('estoque')) {
    blockedLike.push('sys:estoque:%');
  }

  if (!features.includes('funcionarios')) {
    blockedLike.push('sys:rh:%', 'sys:funcionarios:%');
  }

  if (blockedLike.length === 0) {
    return { whereSql: '', params: [] as string[] };
  }

  const whereSql = blockedLike.map(() => 'AND (chave IS NULL OR chave NOT LIKE ?)').join('\n             ');
  return { whereSql, params: blockedLike };
}

export function createAiRouter() {
  const router = Router();
  // Etapa 1 (insights comerciais + alertas determinísticos) fica disponível para planos com Dashboard.
  // A camada avançada (análises com IA externa) continua restrita ao plano completo via feature `ai`.
  router.use(requirePlanFeature('dashboard'));
  router.use(requireAnyPermission('dashboard', 'pos', 'orders', 'delivery'));

  router.get('/avisos', async (req: Request, res) => {
    try {
      await refreshDeterministicAlerts(req.tenantId!);
      const features = await getTenantFeatures(req.tenantId!);
      const filters = buildAvisosFeatureFilters(features);
      res.json(
        await qAll(
          `SELECT *
           FROM ai_avisos
           WHERE tenant_id=?
             AND lido=0
             AND (expira_em IS NULL OR expira_em > NOW())
             ${filters.whereSql}
           ORDER BY prioridade DESC, id DESC`,
          [req.tenantId, ...filters.params]
        )
      );
    } catch (e: any) {
      sendInternalError(res, 'routes/ai', e);
    }
  });

  router.get('/avisos/historico', async (req: Request, res) => {
    try {
      await refreshDeterministicAlerts(req.tenantId!);
      const features = await getTenantFeatures(req.tenantId!);
      const filters = buildAvisosFeatureFilters(features);
      const limit = Math.min(Number(req.query.limit) || 100, 200);
      const offset = Number(req.query.offset) || 0;
      const [lista, total] = await Promise.all([
        qAll(
          `SELECT *
           FROM ai_avisos
           WHERE tenant_id=?
             ${filters.whereSql}
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
          [req.tenantId, ...filters.params, limit, offset]
        ),
        q1(
          `SELECT COUNT(*) AS n
           FROM ai_avisos
           WHERE tenant_id=?
             ${filters.whereSql}`,
          [req.tenantId, ...filters.params]
        ),
      ]);
      res.json({ avisos: lista, total: total?.n || 0 });
    } catch (e: any) {
      sendInternalError(res, 'routes/ai', e);
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
      sendInternalError(res, 'routes/ai', e);
    }
  });

  router.post('/avisos/todos-lidos', async (req: Request, res) => {
    try {
      await qRun('UPDATE ai_avisos SET lido=1 WHERE tenant_id=? AND lido=0', [req.tenantId]);
      res.json({ ok: true });
    } catch (e: any) {
      sendInternalError(res, 'routes/ai', e);
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
      sendInternalError(res, 'routes/ai', e);
    }
  });

  router.post('/avisos/gerar', async (req: Request, res) => {
    try {
      const result = await refreshDeterministicAlerts(req.tenantId!);
      res.json(result);
    } catch (e: any) {
      sendInternalError(res, 'routes/ai', e);
    }
  });

  router.post('/analisar', requirePlanFeature('ai'), async (req: Request, res) => {
    const tipoRaw = String((req.body || {}).tipo ?? 'visao_geral').trim();
    const tipo = TIPOS_ANALISE.has(tipoRaw) ? tipoRaw : 'visao_geral';
    const perguntaProbe = (req.body || {}).pergunta;
    if (perguntaProbe != null && String(perguntaProbe).trim().length > 0) {
      return res.status(400).json({
        error: 'Pergunta livre ao FlowAI foi desativada. Use apenas a analise por tipo (visao_geral ou financeiro).',
      });
    }
    const tenantId = req.tenantId!;

    const cached = await q1(
      `SELECT resultado
       FROM ai_cache
       WHERE tenant_id=?
         AND tipo=?
         AND created_at >= NOW() - INTERVAL '1 hour'
       ORDER BY id DESC
       LIMIT 1`,
      [tenantId, tipo]
    );
    if (cached) {
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
      const nomeEst = JSON.stringify(tenant?.nome_estabelecimento ?? '');
      const segmentoEst = JSON.stringify(tenant?.segmento ?? '');
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
      const contextoJson = JSON.stringify(contexto);

      const systemInstrucao =
        'Voce e um consultor de negocios. Use apenas o JSON em CONTEXT para fatos. ' +
        'Responda em portugues do Brasil com exatamente 3 insights acionaveis no formato JSON: ' +
        '{insights:[{titulo,descricao,acao}], resumo}. Nao inclua markdown fora do JSON.';

      const userContent = `CONTEXT: ${contextoJson}\nNOME_ESTABELECIMENTO: ${nomeEst}\nSEGMENTO: ${segmentoEst}`;

      const msg = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemInstrucao,
        messages: [{ role: 'user', content: userContent }],
      });
      const texto = msg.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      let resultado: any = { texto };
      try {
        resultado = JSON.parse(texto.replace(/```json?|```/g, ''));
      } catch {}

      await qRun('INSERT INTO ai_cache (tenant_id, tipo, resultado) VALUES (?,?,?)', [
        tenantId,
        tipo,
        JSON.stringify(resultado),
      ]);
      res.json(resultado);
    } catch (e: any) {
      sendInternalError(res, 'routes/ai', e);
    }
  });

  return router;
}
