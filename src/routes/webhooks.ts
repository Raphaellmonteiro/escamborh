import { Router, Request, Response, NextFunction } from 'express';
import { processMercadoPagoPaymentWebhook } from '../services/paymentWebhooksService';

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function createWebhooksRouter() {
  const router = Router();

  router.post(
    '/payments/mercado-pago',
    asyncHandler(async (req, res) => {
      const result = await processMercadoPagoPaymentWebhook({
        payload: req.body,
        queryDataId: req.query['data.id'],
        headers: {
          xSignature: req.header('x-signature'),
          xRequestId: req.header('x-request-id'),
        },
      });

      res.json({ success: true, ...result });
    })
  );

  return router;
}
