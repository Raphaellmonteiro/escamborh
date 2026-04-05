import { Router } from 'express';
import { processMercadoPagoPaymentWebhook } from '../services/paymentWebhooksService';
import { registerInboundWhatsAppMessages } from '../services/whatsAppInboundService';
import { logError, logInfo } from '../utils/logger';

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
      })
        .then((result) => {
          logInfo('webhooks.mercadoPagoPayment.result', {
            path: req.originalUrl,
            method: req.method,
            queryDataId,
            ...result,
          });
        })
        .catch((error) => {
          logError('webhooks.mercadoPagoPayment', error, {
            path: req.originalUrl,
            method: req.method,
            queryDataId,
          });
        });
    }
  );

  router.post('/whatsapp/inbound/:tenantId', (req, res) => {
    const payload = req.body;
    const tenantId = req.params.tenantId;

    res.status(200).json({ received: true });

    void registerInboundWhatsAppMessages({
      tenantId,
      payload,
    })
      .then((result) => {
        logInfo('webhooks.whatsappInbound.result', {
          path: req.originalUrl,
          method: req.method,
          tenantId,
          provider: result.provider,
          accepted: result.accepted,
          reason: result.reason,
          savedCount: result.savedCount,
          ignoredCount: result.ignoredCount,
        });
      })
      .catch((error) => {
        logError('webhooks.whatsappInbound', error, {
          path: req.originalUrl,
          method: req.method,
          tenantId,
        });
      });
  });

  return router;
}
