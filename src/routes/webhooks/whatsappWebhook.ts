import { Router, Request, Response } from 'express';
import { getInstanceByName } from '../../repositories/whatsappRepository';
import { validateInboundWhatsAppWebhookAuth } from '../../services/whatsAppWebhookAuthService';
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

function getWhatsAppWebhookAuthErrorStatus(reason: string) {
  return reason === 'invalid_tenant_id' ? 400 : 401;
}

function getWhatsAppWebhookAuthPublicMessage(reason: string) {
  return reason === 'invalid_tenant_id' ? 'Tenant invalido' : 'Webhook nao autorizado';
}

function getRequestPath(req: Request) {
  return `${req.baseUrl}${req.path}`;
}

export function createWhatsAppWebhookRouter(
  input: CreateWhatsAppWebhookRouterInput
) {
  const router = Router();

  // Endpoint legado de compatibilidade externa.
  // Qualquer processamento de negocio deve seguir pela trilha principal em /api/webhooks/whatsapp/inbound/:tenantId/:eventName?
  router.post('/', (req: Request, res: Response) => {
    void (async () => {
      const payload = isObject(req.body) ? (req.body as EvolutionWebhookPayload) : null;
      const instance = toNonEmptyString(payload?.instance);

      if (!payload || !instance || payload.data === undefined || payload.data === null) {
        return res.status(400).json({ error: 'Payload invalido: instance e data sao obrigatorios' });
      }

      const eventType = normalizeEventType(payload);
      const tenantId = await resolveTenantIdFromInstance(instance);

      if (tenantId) {
        const authResult = await validateInboundWhatsAppWebhookAuth({
          tenantId,
          headers: req.headers as Record<string, unknown>,
          query: req.query as Record<string, unknown>,
          payload,
        });

        if (!authResult.allowed) {
          logInfo('webhooks.whatsapp.legacyAdapter.authRejected', {
            path: getRequestPath(req),
            method: req.method,
            instance,
            tenantId,
            eventType,
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
          logInfo('webhooks.whatsapp.legacyAdapter.authValidated', {
            path: getRequestPath(req),
            method: req.method,
            instance,
            tenantId,
            eventType,
            provider: authResult.provider,
            matchedIncomingSource: authResult.matchedIncomingSource,
            matchedExpectedSource: authResult.matchedExpectedSource,
          });
        } else {
          logInfo('webhooks.whatsapp.legacyAdapter.authSkipped', {
            path: getRequestPath(req),
            method: req.method,
            instance,
            tenantId,
            eventType,
            provider: authResult.provider,
            reason: authResult.reason,
          });
        }
      } else {
        logInfo('webhooks.whatsapp.legacyAdapter.authSkipped', {
          path: getRequestPath(req),
          method: req.method,
          instance,
          tenantId: null,
          eventType,
          provider: null,
          reason: 'tenant_unresolved',
        });
      }

      res.status(200).json({ received: true });

      logInfo('webhooks.whatsapp.legacyAdapter.delegated', {
        path: getRequestPath(req),
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
        path: getRequestPath(req),
        method: req.method,
        instance,
      });
    })().catch((error) => {
      logError('webhooks.whatsapp', error);

      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });
  });

  return router;
}
