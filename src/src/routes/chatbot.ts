import { Router } from 'express';
import { requireAnyPermission } from '../middleware';
import { createWhatsAppAiRouter } from './whatsapp-ai';

export function createChatbotRouter() {
  const router = Router();

  // Alias legado temporario enquanto o contrato principal migra para /api/whatsapp/ai.
  router.use(requireAnyPermission('orders', 'delivery'));
  router.use(createWhatsAppAiRouter());

  return router;
}
