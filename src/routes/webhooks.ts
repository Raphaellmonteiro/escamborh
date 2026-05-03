import { Request, Response, Router } from 'express';
import {
  MercadoPagoWebhookSecurityError,
  processMercadoPagoPaymentWebhook,
} from '../services/paymentWebhooksService';
import { processItauPixWebhook } from '../services/itauPaymentWebhooksService';
import { registerInboundWhatsAppMessages } from '../services/whatsAppInboundService';
import { validateInboundWhatsAppWebhookAuth } from '../services/whatsAppWebhookAuthService';
import { logError, logInfo } from '../utils/logger';
import { createWhatsAppWebhookRouter } from './webhooks/whatsappWebhook';

type ForwardWhatsAppInboundInput = {
  tenantId: number | string;
  payload: unknown;
  webhookEventName?: string | null;
  path: string;
  method: string;
  source: 'primary_route' | 'legacy_evolution_adapter';
  instance?: string | null;
};

function normalizeWebhookEventName(eventName: unknown) {
  if (typeof eventName !== 'string') {
    return null;
  }

  const normalized = eventName.trim().toLowerCase();
  return normalized || null;
}

function extractPayloadEventName(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  return payloadRecord.event ?? payloadRecord.type ?? null;
}

function getWhatsAppWebhookAuthErrorStatus(reason: string) {
  return reason === 'invalid_tenant_id' ? 400 : 401;
}

function getWhatsAppWebhookAuthPublicMessage(reason: string) {
  return reason === 'invalid_tenant_id' ? 'Tenant invalido' : 'Webhook nao autorizado';
}

function getRequestPath(req: Request) {
  return `${req.baseUrl}${req.path}`;
}

function forwardToCentralWhatsAppInbound(
  input: ForwardWhatsAppInboundInput
) {
  const eventName = normalizeWebhookEventName(input.webhookEventName);

  logInfo('webhooks.whatsappInbound.received', {
    path: input.path,
    method: input.method,
    source: input.source,
    tenantId: input.tenantId,
    eventName,
    instance: input.instance ?? null,
    payloadEvent: extractPayloadEventName(input.payload),
  });

  void registerInboundWhatsAppMessages({
    tenantId: input.tenantId,
    payload: input.payload,
    webhookEventName: eventName,
  })
    .then((result) => {
      logInfo('webhooks.whatsappInbound.result', {
        path: input.path,
        method: input.method,
        source: input.source,
        tenantId: input.tenantId,
        eventName,
        instance: input.instance ?? null,
        provider: result.provider,
        accepted: result.accepted,
        reason: result.reason,
        savedCount: result.savedCount,
        ignoredCount: result.ignoredCount,
      });
    })
    .catch((error) => {
      logError('webhooks.whatsappInbound', error, {
        path: input.path,
        method: input.method,
        source: input.source,
        tenantId: input.tenantId,
        eventName,
        instance: input.instance ?? null,
      });
    });
}

export function createWebhooksRouter() {
  const router = Router();

  router.use(
    '/whatsapp',
    createWhatsAppWebhookRouter({
      forwardToPrimaryInbound: ({ tenantId, payload, webhookEventName, path, method, instance }) => {
        forwardToCentralWhatsAppInbound({
          tenantId,
          payload,
          webhookEventName,
          path,
          method,
          source: 'legacy_evolution_adapter',
          instance,
        });
      },
    })
  );

  // Webhook publico: Mercado Pago nao envia o JWT interno do sistema.
  router.post(
    '/payments/mercado-pago',
    async (req, res) => {
      const payload = req.body;
      const queryDataId = req.query['data.id'];
      const headers = {
        xSignature: req.header('x-signature'),
        xRequestId: req.header('x-request-id'),
      };

      try {
        const result = await processMercadoPagoPaymentWebhook({
          payload,
          queryDataId,
          headers,
        });

        logInfo('webhooks.mercadoPagoPayment.result', {
          path: req.originalUrl,
          method: req.method,
          queryDataId,
          ...result,
        });

        return res.status(200).json({ received: true });
      } catch (error) {
        if (error instanceof MercadoPagoWebhookSecurityError) {
          logInfo('webhooks.mercadoPagoPayment.securityRejected', {
            path: req.originalUrl,
            method: req.method,
            queryDataId,
            reason: error.reason,
            statusCode: error.statusCode,
          });

          return res.status(error.statusCode).json({ error: 'Webhook nao autorizado' });
        }

        logError('webhooks.mercadoPagoPayment', error, {
          path: req.originalUrl,
          method: req.method,
          queryDataId,
        });

        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
    }
  );

  // Webhook Itaú (Pix Recebimentos): o Itaú envia eventos no sufixo /pix do webhook cadastrado.
  router.post('/payments/itau/pix', async (req, res) => {
    try {
      const result = await processItauPixWebhook({
        payload: req.body,
        path: req.originalUrl,
        method: req.method,
      });

      logInfo('webhooks.itauPix.result', result);
      return res.status(200).json({ received: true });
    } catch (error) {
      logError('webhooks.itauPix', error, {
        path: req.originalUrl,
        method: req.method,
      });
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Ponto central do inbound de WhatsApp no FlowPDV.
  // Trilha principal: Evolution webhook -> /api/webhooks/whatsapp/inbound/:tenantId/:eventName? -> registerInboundWhatsAppMessages()
  const handleInbound = (req: Request, res: Response) => {
    void (async () => {
      const authResult = await validateInboundWhatsAppWebhookAuth({
        tenantId: req.params.tenantId,
        headers: req.headers as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
        payload: req.body,
      });

      if (!authResult.allowed) {
        logInfo('webhooks.whatsappInbound.authRejected', {
          path: getRequestPath(req),
          method: req.method,
          source: 'primary_route',
          tenantId: req.params.tenantId,
          eventName: normalizeWebhookEventName(req.params.eventName),
          payloadEvent: extractPayloadEventName(req.body),
          provider: authResult.provider,
          reason: authResult.reason,
          enforced: authResult.enforced,
          incomingAuthSources: authResult.incomingAuthSources,
          expectedAuthSources: authResult.expectedAuthSources,
        });

        return res
          .status(getWhatsAppWebhookAuthErrorStatus(authResult.reason))
          .json({ error: getWhatsAppWebhookAuthPublicMessage(authResult.reason) });
      }

      if (authResult.enforced) {
        logInfo('webhooks.whatsappInbound.authValidated', {
          path: getRequestPath(req),
          method: req.method,
          source: 'primary_route',
          tenantId: req.params.tenantId,
          eventName: normalizeWebhookEventName(req.params.eventName),
          payloadEvent: extractPayloadEventName(req.body),
          provider: authResult.provider,
          reason: authResult.reason,
          matchedIncomingSource: authResult.matchedIncomingSource,
          matchedExpectedSource: authResult.matchedExpectedSource,
        });
      } else {
        logInfo('webhooks.whatsappInbound.authSkipped', {
          path: getRequestPath(req),
          method: req.method,
          source: 'primary_route',
          tenantId: req.params.tenantId,
          eventName: normalizeWebhookEventName(req.params.eventName),
          payloadEvent: extractPayloadEventName(req.body),
          provider: authResult.provider,
          reason: authResult.reason,
        });
      }

      res.status(200).json({ received: true });

      forwardToCentralWhatsAppInbound({
        tenantId: req.params.tenantId,
        payload: req.body,
        webhookEventName: req.params.eventName,
        path: getRequestPath(req),
        method: req.method,
        source: 'primary_route',
      });
    })().catch((error) => {
      logError('webhooks.whatsappInbound.auth', error, {
        path: getRequestPath(req),
        method: req.method,
        source: 'primary_route',
        tenantId: req.params.tenantId,
        eventName: normalizeWebhookEventName(req.params.eventName),
      });

      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });
  };

  router.post('/whatsapp/inbound/:tenantId', handleInbound);
  router.post('/whatsapp/inbound/:tenantId/:eventName', handleInbound);

  return router;
}
