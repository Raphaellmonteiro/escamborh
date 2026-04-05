import { Router } from 'express';
import { processMercadoPagoPaymentWebhook } from '../services/paymentWebhooksService';
import { logError } from '../utils/logger';

export function createWebhooksRouter() {
  const router = Router();

  // Webhook publico: Mercado Pago nao envia o JWT interno do sistema.
  router.post(
    '/payments/mercado-pago',
    (req, res) => {
      const payload = req.body;
      const queryDataId = req.query['data.id'];
      const headers = {
        xSignature: req.header('x-signature'),
        xRequestId: req.header('x-request-id'),
      };

      res.status(200).json({ received: true });

      void processMercadoPagoPaymentWebhook({
        payload,
        queryDataId,
        headers,
      }).catch((error) => {
        logError('webhooks.mercadoPagoPayment', error, {
          path: req.originalUrl,
          method: req.method,
          queryDataId,
        });
      });
    }
  );

  return router;
}
