import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/utils/securityPassword*.test.ts',
      'src/utils/funcionarioPin.test.ts',
      'src/utils/auditRedaction.test.ts',
      'src/services/adminAuditService.test.ts',
    ],
    clearMocks: true,
  },
});
