import { Router, Request } from 'express';
import { requireAnyPermission } from '../middleware';
import {
  DEFAULT_TENANT_CHATBOT_CONFIG,
  getTenantChatbotConfig,
  loadTenantChatbotPaymentMethods,
  loadTenantChatbotRuntimeContext,
  upsertTenantChatbotConfig,
} from '../services/chatbotService';
import { AppError, isAppError } from '../utils/errors';
import { sendInternalError } from '../utils/internalServerError';

function getRequestTenantId(req: Request) {
  const tenantId = Number(req.tenantId);

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new AppError('Tenant invalido', 400);
  }

  return tenantId;
}

export function createChatbotRouter() {
  const router = Router();

  router.use(requireAnyPermission('orders', 'delivery'));

  router.get('/', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const [config, runtimeContext] = await Promise.all([
        getTenantChatbotConfig(tenantId),
        loadTenantChatbotRuntimeContext(tenantId),
      ]);
      const paymentMethods = runtimeContext
        ? await loadTenantChatbotPaymentMethods(tenantId, runtimeContext)
        : [];

      res.json({
        success: true,
        configured: Boolean(config),
        defaults: DEFAULT_TENANT_CHATBOT_CONFIG,
        config,
        runtime_context: runtimeContext,
        payment_methods: paymentMethods,
      });
    } catch (e: unknown) {
      if (isAppError(e)) {
        return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
      }

      sendInternalError(res, 'routes/chatbot:get', e);
    }
  });

  router.put('/', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const {
        chatbot_enabled,
        provider,
        model,
        system_prompt,
        provider_config_json,
      } = req.body ?? {};

      const config = await upsertTenantChatbotConfig({
        tenant_id: tenantId,
        chatbot_enabled,
        provider,
        model,
        system_prompt,
        provider_config_json,
      });

      const runtimeContext = await loadTenantChatbotRuntimeContext(tenantId);
      const paymentMethods = runtimeContext
        ? await loadTenantChatbotPaymentMethods(tenantId, runtimeContext)
        : [];

      res.json({
        success: true,
        configured: true,
        defaults: DEFAULT_TENANT_CHATBOT_CONFIG,
        config,
        runtime_context: runtimeContext,
        payment_methods: paymentMethods,
      });
    } catch (e: unknown) {
      if (isAppError(e)) {
        return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
      }

      sendInternalError(res, 'routes/chatbot:put', e);
    }
  });

  return router;
}
