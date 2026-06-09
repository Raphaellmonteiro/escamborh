import { Router, Request, Response, NextFunction } from 'express';
import { requireAnyPermission } from '../middleware';
import {
  getWhatsAppConversationMessages,
  listWhatsAppConversations,
  normalizeWhatsAppConversationPhone,
  sendWhatsAppConversationMessage,
} from '../services/whatsAppConversationService';
import { AppError } from '../utils/errors';
import {
  createWhatsAppInstance,
  getConnectionInfo,
  generateQrCode,
  getStatus,
  sendMessage,
} from '../services/whatsappService';
import { createWhatsAppAiRouter } from './whatsapp-ai';

type TenantRequest = Request & { tenantId: number | string };

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

function getRequestTenantId(req: TenantRequest) {
  const tenantId = Number(req.tenantId);

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new AppError('Tenant invalido', 400);
  }

  return tenantId;
}

function sendRouteError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }

  const message = error instanceof Error && error.message ? error.message : 'Erro interno do servidor';
  return res.status(500).json({ error: message });
}

function createWhatsAppManagementRouter() {
  const router = Router();

  router.post('/create', async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getRequestTenantId(req);
      const result = await createWhatsAppInstance(tenantId);

      res.status(result.created ? 201 : 200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.get('/connection', async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getRequestTenantId(req);
      const result = await getConnectionInfo(tenantId);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.get('/qrcode', async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getRequestTenantId(req);
      const result = await generateQrCode(tenantId);

      res.json(result);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.get('/status', async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getRequestTenantId(req);
      const result = await getStatus(tenantId);

      res.json(result);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.post('/send', async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getRequestTenantId(req);
      const { number, text } = req.body ?? {};
      const result = await sendMessage(tenantId, String(number ?? ''), String(text ?? ''));

      res.json({
        status: result.status,
        data: result.data,
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}

export function createWhatsAppRouter() {
  const router = Router();

  router.use(requireAnyPermission('orders', 'delivery'));
  router.use(createWhatsAppManagementRouter());
  router.use('/ai', createWhatsAppAiRouter());

  router.get(
    '/conversations',
    asyncHandler(async (req, res) => {
      const conversations = await listWhatsAppConversations(Number(req.tenantId));
      res.json({ conversations });
    })
  );

  router.get(
    '/conversations/:phone',
    asyncHandler(async (req, res) => {
      const customerPhone = normalizeWhatsAppConversationPhone(req.params.phone);
      if (!customerPhone) {
        throw new AppError('Telefone invalido', 400);
      }

      const conversation = await getWhatsAppConversationMessages(
        Number(req.tenantId),
        customerPhone
      );

      if (!conversation) {
        res.status(404).json({ error: 'Conversa nao encontrada' });
        return;
      }

      res.json(conversation);
    })
  );

  router.post(
    '/conversations/:phone/send',
    asyncHandler(async (req, res) => {
      const customerPhone = normalizeWhatsAppConversationPhone(req.params.phone);
      if (!customerPhone) {
        throw new AppError('Telefone invalido', 400);
      }

      const result = await sendWhatsAppConversationMessage({
        tenantId: Number(req.tenantId),
        customerPhone,
        message: req.body?.message,
      });

      res.status(result.status === 'erro' ? 502 : 200).json(result);
    })
  );

  return router;
}
