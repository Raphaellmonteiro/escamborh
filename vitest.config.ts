import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/utils/securityPassword*.test.ts',
      'src/utils/funcionarioPin.test.ts',
      'src/utils/auditRedaction.test.ts',
      'src/utils/logger.test.ts',
      'src/services/adminAuditService.test.ts',
      'src/services/tenantWhatsAppConfigService.test.ts',
      'src/services/whatsappService.test.ts',
      'src/services/whatsAppWebhookAuthService.test.ts',
      'src/services/whatsAppChatbotService.test.ts',
    ],
    clearMocks: true,
  },
});
