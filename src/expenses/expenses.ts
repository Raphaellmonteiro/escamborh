// src/routes/expenses.ts
import { Router, Request, Response } from 'express';
import { q1, qAll, qInsert } from '../db';

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
      res.status(500).json({ error: e.message });
    }
  });

  // CRIAR DESPESA
  router.post('/', async (req: TenantRequest, res: Response) => {
    try {
      const { description, amount, category, payment_method, observation } = req.body;

      if (!description?.trim()) {
        return res.status(400).json({ success: false, error: 'Descrição é obrigatória' });
      }

      if (amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: 'Valor inválido' });
      }

      const id = await qInsert(
        `INSERT INTO despesas
        (description, amount, category, payment_method, observation, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          description.trim(),
          Number(amount),
          category || null,
          payment_method || null,
          observation || null,
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
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}