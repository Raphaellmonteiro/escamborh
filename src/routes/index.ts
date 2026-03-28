import { Router, Request, Response, NextFunction } from 'express';
import { q1, qAll, qInsert, qRun } from '../db';
import { authenticateToken, publicRateLimit, requireAnyPermission, requirePlanFeature, resolveAuthenticatedSession } from '../middleware';
import { AppError } from '../utils/errors';
import { createExpensesRouter } from '../expenses/expenses';
import { createAdminRouter } from './admin';
import { createAiRouter } from './ai';
import { createAuthRouter } from './auth';
import { createDashboardRouter } from './dashboard';
import { createDeliveryRouter } from './delivery';
import { createEstoqueRouter } from './estoque';
import { createLogsRouter, createUsuariosRouter, createAcessoFuncRouter } from './logs';
import { createMesasRouter } from './mesas';
import { createOrdersRouter } from './orders';
import { createClientesRouter } from './clientes';
import { createPrintRouter } from './print';
import { createProductsRouter } from './products';
import { createRhRouter } from './rh';
import { createSettingsRouter, createCategoriesRouter } from './settings';

type TenantRequest = Request & {
  tenantId: number | string;
};

type AsyncRouteHandler = (
  req: TenantRequest,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function createPontosRouter() {
  const router = Router();

  router.put(
    '/:pontId',
    asyncHandler(async (req, res) => {
      const { hora, tipo } = req.body ?? {};

      if (!hora) {
        throw new AppError('hora obrigatória', 400);
      }

      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) {
        throw new AppError('Formato inválido. Use HH:MM', 400);
      }

      const ponto = await q1(
        'SELECT * FROM func_pontos WHERE id=? AND tenant_id=?',
        [req.params.pontId, req.tenantId]
      );

      if (!ponto) {
        throw new AppError('Registro não encontrado', 404);
      }

      const novaHora = hora.length === 5 ? `${hora}:00` : hora;
      const novoTipo = tipo && ['entrada', 'saida'].includes(tipo) ? tipo : ponto.tipo;

      await qRun(
        'UPDATE func_pontos SET hora=?,tipo=? WHERE id=? AND tenant_id=?',
        [novaHora, novoTipo, req.params.pontId, req.tenantId]
      );

      res.json({ success: true });
    })
  );

  router.delete(
    '/:pontId',
    asyncHandler(async (req, res) => {
      const exists = await q1(
        'SELECT id FROM func_pontos WHERE id=? AND tenant_id=?',
        [req.params.pontId, req.tenantId]
      );

      if (!exists) {
        throw new AppError('Registro não encontrado', 404);
      }

      await qRun(
        'DELETE FROM func_pontos WHERE id=? AND tenant_id=?',
        [req.params.pontId, req.tenantId]
      );

      res.json({ success: true });
    })
  );

  return router;
}

export function createApiRouter() {
  const router = Router();
  const protectedRouter = Router();

  router.use(createAuthRouter());
  router.use(createAdminRouter());
  router.get('/events', async (req, res) => {
    const token = (req.query.token as string) || req.headers['authorization']?.split(' ')[1];

    const session = await resolveAuthenticatedSession(req, token);
    if (session.ok === false) {
      return res.status(session.status).end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');

    const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 30000);
    req.on('close', () => clearInterval(ping));
  });

  router.post(
    '/products/suggestions/event',
    publicRateLimit,
    async (req: Request, res: Response) => {
      try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];
        let tenantId: number | null = null;

        if (token) {
          const session = await resolveAuthenticatedSession(req);
          if (session.ok === false) {
            return res.status(session.status).json(session.body);
          }
          tenantId = session.tenantId;
        } else {
          const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
          if (!slug) {
            return res.status(400).json({ error: 'slug obrigatório' });
          }
          const tenant = await q1<{ id: number }>(
            'SELECT id FROM clientes WHERE usuario=? AND status=?',
            [slug, 'ativo']
          );
          if (!tenant) {
            return res.status(404).json({ error: 'Loja não encontrada' });
          }
          tenantId = tenant.id;
        }

        const sourceProductId = Number(req.body?.sourceProductId);
        const suggestedProductId = Number(req.body?.suggestedProductId);

        if (
          !Number.isInteger(sourceProductId) ||
          sourceProductId <= 0 ||
          !Number.isInteger(suggestedProductId) ||
          suggestedProductId <= 0
        ) {
          return res.status(400).json({ error: 'sourceProductId e suggestedProductId são obrigatórios' });
        }

        if (sourceProductId === suggestedProductId) {
          return res.status(400).json({ error: 'Produto de origem e sugerido devem ser diferentes' });
        }

        const produtosOk = await qAll<{ id: number }>(
          'SELECT id FROM produtos WHERE tenant_id=? AND id IN (?,?) AND active=1',
          [tenantId, sourceProductId, suggestedProductId]
        );

        if (produtosOk.length !== 2) {
          return res.status(400).json({ error: 'Produtos inválidos para este estabelecimento' });
        }

        await qInsert(
          'INSERT INTO sugestoes_eventos (tenant_id, produto_origem_id, produto_sugerido_id) VALUES (?, ?, ?)',
          [tenantId, sourceProductId, suggestedProductId]
        );

        return res.json({ success: true });
      } catch (e: any) {
        console.error('POST /products/suggestions/event:', e?.message);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar evento' });
      }
    }
  );

  protectedRouter.use(authenticateToken);
  protectedRouter.use('/products', createProductsRouter());
  protectedRouter.use('/settings', requireAnyPermission('configuracoes'), createSettingsRouter());
  protectedRouter.use('/categories', requireAnyPermission('products'), createCategoriesRouter());
  protectedRouter.use('/print', createPrintRouter());
  protectedRouter.use('/orders', createOrdersRouter());
  protectedRouter.use('/clientes', createClientesRouter());
  protectedRouter.use('/expenses', requirePlanFeature('finance'), requireAnyPermission('finance'), createExpensesRouter());
  protectedRouter.use('/dashboard', requirePlanFeature('dashboard'), requireAnyPermission('dashboard'), createDashboardRouter());
  protectedRouter.use('/caixa', requireAnyPermission('finance'), createDashboardRouter());
  protectedRouter.use('/estoque', requirePlanFeature('estoque'), createEstoqueRouter());
  protectedRouter.use('/delivery', requirePlanFeature('delivery'), createDeliveryRouter());
  protectedRouter.use('/ai', createAiRouter());
  protectedRouter.use('/logs', requirePlanFeature('logs'), requireAnyPermission('logs'), createLogsRouter());
  protectedRouter.use('/usuarios', requirePlanFeature('funcionarios'), requireAnyPermission('funcionarios'), createUsuariosRouter());
  protectedRouter.use('/funcionarios', requirePlanFeature('funcionarios'), requireAnyPermission('funcionarios'), createRhRouter());
  protectedRouter.use('/funcionarios', requirePlanFeature('funcionarios'), requireAnyPermission('funcionarios'), createAcessoFuncRouter());
  protectedRouter.use('/mesas', requireAnyPermission('mesas'), createMesasRouter());
  protectedRouter.use('/pontos', requireAnyPermission('funcionarios'), createPontosRouter());

  router.use(protectedRouter);

  return router;
}
