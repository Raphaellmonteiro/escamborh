import { Router } from 'express';
import { processMercadoPagoPaymentWebhook } from '../services/paymentWebhooksService';
import { registerInboundWhatsAppMessages } from '../services/whatsAppInboundService';
import { logError, logInfo } from '../utils/logger';
import { createWhatsAppWebhookRouter } from './webhooks/whatsappWebhook';

export function createWebhooksRouter() {
  const router = Router();

  router.use('/whatsapp', createWhatsAppWebhookRouter());

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

  const handleInbound = (req: any, res: any) => {
    const payload = req.body;
    const tenantId = req.params.tenantId;
    const eventName =
      typeof req.params?.eventName === 'string' && req.params.eventName.trim()
        ? req.params.eventName.trim().toLowerCase()
        : null;

    logInfo('webhooks.whatsappInbound.received', {
      path: req.originalUrl,
      method: req.method,
      tenantId,
      eventName,
      payloadEvent:
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>).event ?? null
          : null,
    });

    res.status(200).json({ received: true });

    void registerInboundWhatsAppMessages({
      tenantId,
      payload,
      webhookEventName: eventName,
    })
      .then((result) => {
        logInfo('webhooks.whatsappInbound.result', {
          path: req.originalUrl,
          method: req.method,
          tenantId,
          eventName,
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
          eventName,
        });
      });
  };

  router.post('/whatsapp/inbound/:tenantId', handleInbound);
  router.post('/whatsapp/inbound/:tenantId/:eventName', handleInbound);

  return router;
}
