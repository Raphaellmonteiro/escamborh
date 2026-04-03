import { z } from 'zod';

/** POST /api/privacidade/solicitar-exclusao */
export const solicitarExclusaoBodySchema = z.object({
  tipo: z.enum(['cliente', 'funcionario'], { message: 'tipo deve ser cliente ou funcionario.' }),
  id: z.coerce
    .number({ message: 'id inválido.' })
    .int({ message: 'id deve ser inteiro.' })
    .positive({ message: 'id deve ser positivo.' }),
  motivo: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : String(v)),
    z.string().trim().max(5000, 'motivo muito longo.').optional()
  ),
});
