import { Router, Request, Response, NextFunction } from 'express';
import { requireAnyPermission } from '../middleware';
import { getCustomerLoyaltyTier } from '../services/customerLoyaltyTier';
import {
  findOrCreateStoreCustomerByPhone,
  getStoreCustomerById,
  getStoreCustomerMetrics,
  getStoreCustomerOrdersList,
  lookupStoreCustomerByPhone,
  normalizeStoreCustomerPhone,
  searchStoreCustomers,
} from '../services/storeCustomerService';
import { AppError } from '../utils/errors';

type TenantRequest = Request & { tenantId: number | string };

type AsyncRouteHandler = (req: TenantRequest, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function createClientesRouter() {
  const router = Router();
  router.use(requireAnyPermission('pos', 'orders', 'delivery'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const telefone = typeof req.query.telefone === 'string' ? req.query.telefone : '';
      const tenantId = Number(req.tenantId);

      if (telefone) {
        const normalized = normalizeStoreCustomerPhone(telefone);
        if (normalized.length >= 8) {
          const one = await lookupStoreCustomerByPhone(tenantId, normalized);
          res.json(one ? [one] : []);
          return;
        }
      }

      if (!q) {
        res.json([]);
        return;
      }

      const rows = await searchStoreCustomers(tenantId, q, 40);
      res.json(rows);
    })
  );

  router.get(
    '/lookup',
    asyncHandler(async (req, res) => {
      const raw = typeof req.query.telefone === 'string' ? req.query.telefone : '';
      const row = await lookupStoreCustomerByPhone(Number(req.tenantId), raw);
      res.json(row);
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const nome = String(req.body?.nome || '').trim();
      const telefone = normalizeStoreCustomerPhone(req.body?.telefone);
      if (!telefone || telefone.length < 8) {
        throw new AppError('Telefone inválido (mínimo 8 dígitos)', 400);
      }
      if (!nome) {
        throw new AppError('Nome é obrigatório', 400);
      }

      const id = await findOrCreateStoreCustomerByPhone({
        tenantId: Number(req.tenantId),
        nome,
        telefone,
        origemCadastro: 'balcao',
      });

      if (!id) {
        throw new AppError('Não foi possível salvar o cliente', 400);
      }

      const customer = await getStoreCustomerById(Number(req.tenantId), id);
      res.json({ success: true, customer });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('Cliente inválido', 400);
      }
      const tenantId = Number(req.tenantId);
      const customer = await getStoreCustomerById(tenantId, id);
      if (!customer) {
        res.status(404).json({ error: 'Cliente não encontrado' });
        return;
      }
      const metricasRaw = await getStoreCustomerMetrics(tenantId, id);
      const fidelizacao = getCustomerLoyaltyTier(metricasRaw.total_pedidos);
      const metricas = {
        ...metricasRaw,
        ultimo_pedido: metricasRaw.ultimo_pedido_em,
      };
      res.json({ ...customer, metricas, fidelizacao });
    })
  );

  router.get(
    '/:id/pedidos',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('Cliente inválido', 400);
      }
      const tenantId = Number(req.tenantId);
      const exists = await getStoreCustomerById(tenantId, id);
      if (!exists) {
        res.status(404).json({ error: 'Cliente não encontrado' });
        return;
      }
      const rows = await getStoreCustomerOrdersList(tenantId, id, 100);
      res.json(rows);
    })
  );

  return router;
}
