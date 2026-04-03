import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    /** Subsenha/admin/caixa + PIN funcionário (Vitest). CPF: `npm run test:funcionario-cpf`. */
    include: ['src/utils/securityPassword*.test.ts', 'src/utils/funcionarioPin.test.ts'],
    clearMocks: true,
  },
});
