import { Router, Request, Response, NextFunction } from 'express';
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  getOrderHistory,
  getOrders,
  refundOrder,
  updateOrderStatus,
} from '../services/ordersService';

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

export function createOrdersRouter() {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const result = await createOrder(req.body, req.tenantId);
      res.json({ success: true, ...result });
    })
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const orders = await getOrders({
        tenantId: req.tenantId,
        status: getStringQueryValue(req.query.status),
        canal: getStringQueryValue(req.query.canal),
        excludeCanal: getStringQueryValue(req.query.excludeCanal),
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
