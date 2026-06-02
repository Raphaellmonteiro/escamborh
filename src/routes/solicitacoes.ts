import { Router } from 'express';
import { qInsert, qAll, qRun } from '../db';
import { ensureSolicitacoesTable } from '../db/migrations/solicitacoesTable';
import { publicRateLimit } from '../middleware';
import { sendInternalError } from '../utils/internalServerError';

export function createSolicitacoesRouter() {
  const router = Router();

  // POST /api/solicitacoes — público, chamado pela landing page
  router.post('/', publicRateLimit, async (req, res) => {
    try {
      await ensureSolicitacoesTable();

      const {
        nome = '',
        empresa = '',
        cnpj = '',
        whatsapp = '',
        email = '',
        cidade = '',
        segmento = '',
        plano = '',
        origem = 'landing_planos',
      } = req.body ?? {};

      if (!String(nome).trim() || !String(whatsapp).trim()) {
        return res.status(400).json({ success: false, message: 'Nome e WhatsApp são obrigatórios.' });
      }

      const id = await qInsert(
        `INSERT INTO solicitacoes
          (nome, empresa, cnpj, whatsapp, email, cidade, segmento, plano, origem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(nome).trim(),
          String(empresa).trim(),
          String(cnpj).trim(),
          String(whatsapp).trim(),
          String(email).trim(),
          String(cidade).trim(),
          String(segmento).trim(),
          String(plano).trim(),
          String(origem).trim(),
        ]
      );

      return res.status(201).json({ success: true, id });
    } catch (err) {
      sendInternalError(res, 'POST /api/solicitacoes', err);
    }
  });

  // GET /api/solicitacoes — protegido, só admin vê os leads
  router.get('/', async (req: any, res) => {
    try {
      // Só usuários autenticados com permissão admin acessam
      if (!req.user) {
        return res.status(401).json({ error: 'Não autorizado' });
      }

      await ensureSolicitacoesTable();

      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const rows = await qAll(
        status
          ? 'SELECT * FROM solicitacoes WHERE status=? ORDER BY criado_em DESC LIMIT 200'
          : 'SELECT * FROM solicitacoes ORDER BY criado_em DESC LIMIT 200',
        status ? [status] : []
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      sendInternalError(res, 'GET /api/solicitacoes', err);
    }
  });

  // PATCH /api/solicitacoes/:id/status — atualiza status do lead (novo, contatado, convertido, perdido)
  router.patch('/:id/status', async (req: any, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Não autorizado' });
      }

      const id = Number(req.params.id);
      const { status } = req.body ?? {};

      const statusValidos = ['novo', 'contatado', 'convertido', 'perdido'];
      if (!statusValidos.includes(status)) {
        return res.status(400).json({ success: false, message: 'Status inválido.' });
      }

      await qRun('UPDATE solicitacoes SET status=? WHERE id=?', [status, id]);
      return res.json({ success: true });
    } catch (err) {
      sendInternalError(res, 'PATCH /api/solicitacoes/:id/status', err);
    }
  });

  return router;
}