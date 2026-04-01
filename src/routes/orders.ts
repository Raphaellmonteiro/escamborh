import { Router, Request, Response, NextFunction } from 'express';
import {
  cancelOrder,
  confirmOrderPayment,
  createOrder,
  deleteOrder,
  getOrderHistory,
  getOrders,
  refundOrder,
  updateOrderStatus,
  confirmQrOrder,
} from '../services/ordersService';
import { requireAnyPermission } from '../middleware';
import { sendInternalError } from '../utils/internalServerError';

type TenantRequest = Request & {
  tenantId: number | string;
  user?: {
    id?: number;
  };
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

function getStringQueryValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function getBooleanQueryValue(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return undefined;
}

export function createOrdersRouter() {
  const router = Router();

  router.post(
    '/',
    requireAnyPermission('pos', 'orders'),
    asyncHandler(async (req, res) => {
      const result = await createOrder(req.body, req.tenantId);
      res.json({ success: true, ...result });
    })
  );

  router.use(requireAnyPermission('orders'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const orders = await getOrders({
        tenantId: req.tenantId,
        status: getStringQueryValue(req.query.status),
        canal: getStringQueryValue(req.query.canal),
        excludeCanal: getStringQueryValue(req.query.excludeCanal),
        activeOnly: getBooleanQueryValue(req.query.activeOnly),
        from: getStringQueryValue(req.query.from),
        to: getStringQueryValue(req.query.to),
        day: getStringQueryValue(req.query.day),
        month: getStringQueryValue(req.query.month),
        year: getStringQueryValue(req.query.year),
        limit: getStringQueryValue(req.query.limit),
      });

      res.json(orders);
    })
  );

  router.patch(
    '/:id/confirm-payment',
    asyncHandler(async (req, res) => {
      const result = await confirmOrderPayment({
        orderId: req.params.id,
        tenantId: req.tenantId,
        userId: req.user?.id,
      });
      res.json({ success: true, ...result });
    })
  );

  router.patch(
    '/:id/status',
    asyncHandler(async (req, res) => {
      const order = await updateOrderStatus({
        orderId: req.params.id,
        status: req.body?.status,
        userId: req.user?.id,
        tenantId: req.tenantId,
      });

      res.json({ success: true, order });
    })
  );

// Rota para confirmar pedido via QR Code
  router.post('/:id/confirm', async (req: any, res: any) => {
    try {
      const status = await confirmQrOrder({
        orderId: req.params.id,
        tenantId: req.tenantId,
        userId: req.user?.id,
      });
      res.json({ success: true, status });
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'statusCode' in error && typeof (error as { statusCode?: number }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 500;
      if (status >= 500) {
        sendInternalError(res, 'routes/orders:confirmQr', error, { orderId: req.params.id });
        return;
      }
      const msg = error instanceof Error ? error.message : 'Erro';
      res.status(status).json({ error: msg });
    }
  });

  router.get(
    '/:id/history',
    asyncHandler(async (req, res) => {
      const events = await getOrderHistory({
        orderId: req.params.id,
        tenantId: req.tenantId,
      });

      res.json(events);
    })
  );

  router.post(
    '/:id/cancel',
    asyncHandler(async (req, res) => {
      const order = await cancelOrder({
        orderId: req.params.id,
        subsenha: req.body?.subsenha,
        motivo: req.body?.motivo,
        estoque_reposto: req.body?.estoque_reposto,
        userId: req.user?.id,
        tenantId: req.tenantId,
      });

      res.json({ success: true, order });
    })
  );

  router.post(
    '/:id/refund',
    asyncHandler(async (req, res) => {
      const order = await refundOrder({
        orderId: req.params.id,
        subsenha: req.body?.subsenha,
        motivo: req.body?.motivo,
        valor: req.body?.valor,
        userId: req.user?.id,
        tenantId: req.tenantId,
      });

      res.json({ success: true, order });
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await deleteOrder({
        orderId: req.params.id,
        subsenha: req.body?.subsenha,
        userId: req.user?.id,
        tenantId: req.tenantId,
      });

      res.json({ success: true });
    })
  );

  return router;
}
