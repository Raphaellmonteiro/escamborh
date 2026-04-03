import { Router } from 'express';
import { qInsert } from '../db';
import { lgpdSolicitacaoExclusaoRateLimit } from '../middleware';
import { sendInternalError } from '../utils/internalServerError';
import { parseBodyOrReply, replyZod400ErrorKey } from '../validation/zodHttp';
import { solicitarExclusaoBodySchema } from '../validation/schemas/privacidade';

export function createPrivacidadeRouter() {
  const router = Router();

  router.post('/solicitar-exclusao', lgpdSolicitacaoExclusaoRateLimit, async (req: any, res) => {
    try {
      const tenantId = Number(req.tenantId);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return res.status(401).json({ error: 'Tenant não identificado' });
      }

      const body = parseBodyOrReply(res, solicitarExclusaoBodySchema, req.body, replyZod400ErrorKey);
      if (!body) return;

      const motivo =
        body.motivo !== undefined && body.motivo.length > 0 ? body.motivo : null;

      await qInsert(
        `INSERT INTO lgpd_solicitacoes (tenant_id, tipo, entidade_id, motivo, status)
         VALUES (?, ?, ?, ?, 'pendente')`,
        [tenantId, body.tipo, body.id, motivo]
      );

      res.json({ ok: true });
    } catch (err: unknown) {
      sendInternalError(res, 'POST /api/privacidade/solicitar-exclusao', err);
    }
  });

  return router;
}
