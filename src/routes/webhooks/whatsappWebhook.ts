import { Router, Request, Response } from 'express';
import { logError, logInfo } from '../../utils/logger';
import { handleIncomingMessage } from '../../services/whatsappMessageHandler';

type EvolutionWebhookPayload = {
  instance?: unknown;
  data?: unknown;
  event?: unknown;
  type?: unknown;
};

function toNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeEventType(payload: EvolutionWebhookPayload) {
  const eventType = toNonEmptyString(payload.event) ?? toNonEmptyString(payload.type) ?? 'unknown';

  if (eventType === 'messages.upsert' || eventType === 'connection.update') {
    return eventType;
  }

  return eventType;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createWhatsAppWebhookRouter() {
  const router = Router();

  router.post('/', (req: Request, res: Response) => {
    try {
      const payload = isObject(req.body) ? (req.body as EvolutionWebhookPayload) : null;
      const instance = toNonEmptyString(payload?.instance);

      if (!payload || !instance || payload.data === undefined || payload.data === null) {
        return res.status(400).json({ error: 'Payload invalido: instance e data sao obrigatorios' });
      }

      const eventType = normalizeEventType(payload);

      logInfo('webhooks.whatsapp.received', {
        instance,
        eventType,
      });

      switch (eventType) {
        case 'messages.upsert':
          res.status(200).json({ received: true });
          void handleIncomingMessage(payload).catch((error) => {
            logError('webhooks.whatsapp.messagesUpsert', error, {
              instance,
              eventType,
            });
          });
          return;
        case 'connection.update':
          break;
        default:
          break;
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      logError('webhooks.whatsapp', error);

      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  return router;
}
