import { Router, Request, Response, NextFunction } from 'express';
import { q1, qRun } from '../db';
import { authenticateToken, resolveAuthenticatedSession } from '../middleware';
import { AppError } from '../utils/errors';
import { createExpensesRouter } from '../expenses/expenses';
import { createAdminRouter } from './admin';
import { createAiRouter } from './ai';
import { createAuthRouter } from './auth';
import { createBarberRouter } from './barbearia';
import { createDashboardRouter } from './dashboard';
import { createDeliveryRouter } from './delivery';
import { createEstoqueRouter } from './estoque';
import { createLogsRouter, createUsuariosRouter, createAcessoFuncRouter } from './logs';
import { createMesasRouter } from './mesas';
import { createOrdersRouter } from './orders';
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

    const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 30000);
    req.on('close', () => clearInterval(ping));
  });

  protectedRouter.use(authenticateToken);
  protectedRouter.use('/products', createProductsRouter());
  protectedRouter.use('/settings', createSettingsRouter());
  protectedRouter.use('/categories', createCategoriesRouter());
  protectedRouter.use('/print', createPrintRouter());
  protectedRouter.use('/orders', createOrdersRouter());
  protectedRouter.use('/expenses', createExpensesRouter());
  protectedRouter.use('/dashboard', createDashboardRouter());
  protectedRouter.use('/caixa', createDashboardRouter());
  protectedRouter.use('/estoque', createEstoqueRouter());
  protectedRouter.use('/delivery', createDeliveryRouter());
  protectedRouter.use('/ai', createAiRouter());
  protectedRouter.use('/logs', createLogsRouter());
  protectedRouter.use('/usuarios', createUsuariosRouter());
  protectedRouter.use('/funcionarios', createRhRouter());
  protectedRouter.use('/funcionarios', createAcessoFuncRouter());
  protectedRouter.use('/barber', createBarberRouter());
  protectedRouter.use('/mesas', createMesasRouter());
  protectedRouter.use('/pontos', createPontosRouter());

  router.use(protectedRouter);

  return router;
}
