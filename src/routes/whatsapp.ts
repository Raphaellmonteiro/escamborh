import { Router, Request, Response, NextFunction } from 'express';
import { requireAnyPermission } from '../middleware';
import {
  getWhatsAppConversationMessages,
  listWhatsAppConversations,
  normalizeWhatsAppConversationPhone,
  sendWhatsAppConversationMessage,
} from '../services/whatsAppConversationService';
import { AppError } from '../utils/errors';

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

export function createWhatsAppRouter() {
  const router = Router();

  router.use(requireAnyPermission('orders', 'delivery'));

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
