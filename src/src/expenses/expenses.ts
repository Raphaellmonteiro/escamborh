// src/routes/expenses.ts
import { Router, Request, Response } from 'express';
import { q1, qAll, qInsert, qRun } from '../db';
import { sendInternalError } from '../utils/internalServerError';

type TenantRequest = Request & {
  tenantId: number | string;
};

export function createExpensesRouter() {
  const router = Router();

  // LISTAR DESPESAS
  router.get('/', async (req: TenantRequest, res: Response) => {
    try {
      const expenses = await qAll(
        'SELECT * FROM despesas WHERE tenant_id=? ORDER BY id DESC',
        [req.tenantId]
      );

      res.json(expenses);
    } catch (e: any) {
      console.error('GET /expenses erro:', e.message);
      sendInternalError(res, 'routes/expenses', e);
    }
  });

  // CRIAR DESPESA
  router.post('/', async (req: TenantRequest, res: Response) => {
    try {
      const { description, amount, category } = req.body;

      if (!description?.trim()) {
        return res.status(400).json({ success: false, error: 'Descrição é obrigatória' });
      }

      if (amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: 'Valor inválido' });
      }

      const id = await qInsert(
        `INSERT INTO despesas
        (description, amount, category, tenant_id)
        VALUES (?, ?, ?, ?)`,
        [
          description.trim(),
          Number(amount),
          category || null,
          req.tenantId,
        ]
      );

      const expense = await q1(
        'SELECT * FROM despesas WHERE id=? AND tenant_id=?',
        [id, req.tenantId]
      );

      res.json({ success: true, expense });
    } catch (e: any) {
      console.error('POST /expenses erro:', e.message);
      sendInternalError(res, 'routes/expenses', e);
    }
  });

  // EXCLUIR DESPESA
  router.delete('/:id', async (req: TenantRequest, res: Response) => {
    try {
      const expenseId = Number(req.params.id);

      if (!Number.isInteger(expenseId) || expenseId <= 0) {
        return res.status(400).json({ success: false, error: 'Despesa inválida' });
      }

      const expense = await q1(
        'SELECT id FROM despesas WHERE id=? AND tenant_id=?',
        [expenseId, req.tenantId]
      );

      if (!expense) {
        return res.status(404).json({ success: false, error: 'Despesa não encontrada' });
      }

      await qRun(
        'DELETE FROM despesas WHERE id=? AND tenant_id=?',
        [expenseId, req.tenantId]
      );

      res.json({ success: true, message: 'Despesa excluída com sucesso' });
    } catch (e: any) {
      console.error('DELETE /expenses/:id erro:', e.message);
      sendInternalError(res, 'routes/expenses', e);
    }
  });

  return router;
}
