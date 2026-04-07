import { Router, Request, Response } from 'express';
import { getInstanceByName } from '../../repositories/whatsappRepository';
import { logError, logInfo } from '../../utils/logger';

type EvolutionWebhookPayload = {
  instance?: unknown;
  data?: unknown;
  event?: unknown;
  type?: unknown;
};

type ForwardToPrimaryInboundInput = {
  tenantId: number | string;
  payload: EvolutionWebhookPayload;
  webhookEventName?: string | null;
  path: string;
  method: string;
  instance: string;
};

type CreateWhatsAppWebhookRouterInput = {
  forwardToPrimaryInbound: (input: ForwardToPrimaryInboundInput) => void;
};

const PRIMARY_WHATSAPP_INBOUND_ROUTE = '/api/webhooks/whatsapp/inbound/:tenantId/:eventName?';

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

function resolveTenantIdFromInstanceName(instanceName: string) {
  const match = /^tenant_(\d+)_/i.exec(instanceName);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveTenantIdFromInstance(instance: string) {
  const instanceRecord = await getInstanceByName(instance).catch(() => null);
  return instanceRecord?.tenantId ?? resolveTenantIdFromInstanceName(instance);
}

export function createWhatsAppWebhookRouter(
  input: CreateWhatsAppWebhookRouterInput
) {
  const router = Router();

  // Endpoint legado de compatibilidade externa.
  // Qualquer processamento de negocio deve seguir pela trilha principal em /api/webhooks/whatsapp/inbound/:tenantId/:eventName?
  router.post('/', (req: Request, res: Response) => {
    try {
      const payload = isObject(req.body) ? (req.body as EvolutionWebhookPayload) : null;
      const instance = toNonEmptyString(payload?.instance);

      if (!payload || !instance || payload.data === undefined || payload.data === null) {
        return res.status(400).json({ error: 'Payload invalido: instance e data sao obrigatorios' });
      }

      const eventType = normalizeEventType(payload);

      res.status(200).json({ received: true });

      void resolveTenantIdFromInstance(instance)
        .then((tenantId) => {
          logInfo('webhooks.whatsapp.legacyAdapter.delegated', {
            path: req.originalUrl,
            method: req.method,
            instance,
            tenantId: tenantId ?? null,
            eventType,
            delegatedTo: PRIMARY_WHATSAPP_INBOUND_ROUTE,
          });

          input.forwardToPrimaryInbound({
            tenantId: tenantId ?? '',
            payload,
            webhookEventName: eventType,
            path: req.originalUrl,
            method: req.method,
            instance,
          });
        })
        .catch((error) => {
          logError('webhooks.whatsapp.legacyAdapter', error, {
            path: req.originalUrl,
            method: req.method,
            instance,
            eventType,
          });
        });
      return;
    } catch (error) {
      logError('webhooks.whatsapp', error);

      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  return router;
}
