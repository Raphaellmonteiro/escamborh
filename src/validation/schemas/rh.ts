import { z } from 'zod';

/** POST /rh e PUT /rh/:id — cadastro/edição (payload do RHScreen). */
export const rhFuncionarioWriteBodySchema = z.object({
  nome: z.string().trim().min(1, 'Nome obrigatório'),
  tipo_contrato: z.enum(['fixo', 'diarista', 'evento']).optional(),
  cargo: z.string().nullable().optional(),
  salario_base: z.union([z.number(), z.string()]).optional(),
  horario_entrada: z.string().nullable().optional(),
  horario_saida: z.string().nullable().optional(),
  carga_horaria: z.union([z.number(), z.string()]).optional(),
  dias_semana: z.string().nullable().optional(),
  tolerancia_minutos: z.union([z.number(), z.string()]).optional(),
  dias_trabalho_mes: z.union([z.number(), z.string()]).optional(),
  data_admissao: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  cpf: z.union([z.string(), z.number()]).nullable().optional(),
  pin: z.union([z.string(), z.number()]).nullable().optional(),
  foto_url: z.string().nullable().optional(),
});

export const rhFeriasPatchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('schedule'),
    data_inicio_gozo: z.string().trim().min(1, 'Informe data_inicio_gozo.'),
    data_fim_gozo: z.string().trim().min(1, 'Informe data_fim_gozo.'),
  }),
  z.object({ action: z.literal('start') }),
  z.object({
    action: z.literal('complete'),
    valor_pago: z.coerce
      .number({ message: 'valor_pago inválido.' })
      .finite({ message: 'valor_pago inválido.' }),
  }),
]);

export const rhDecimoPatchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_calculo'),
    modo: z.enum(['automatico', 'manual'], { message: 'modo deve ser automatico ou manual.' }),
    valor_total_manual: z.union([z.number(), z.string(), z.null()]).optional(),
  }),
  z.object({ action: z.literal('pay_primeira') }),
  z.object({ action: z.literal('pay_segunda') }),
]);

export const rhPontosManualBodySchema = z.object({
  data: z.string().trim().min(1, 'data obrigatória'),
  hora: z.string().trim().min(1, 'hora obrigatória'),
  tipo: z.enum(['entrada', 'saida'], { message: 'tipo deve ser entrada ou saida.' }),
});

export const rhPontosPutBodySchema = z.object({
  hora: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v)),
    z.string().min(1, 'hora obrigatória')
  ),
  tipo: z.union([z.string(), z.null()]).optional(),
});

export const rhHoraExtraPostBodySchema = z
  .object({
    data: z.string().trim().min(1, 'data e minutos obrigatórios'),
    minutos: z.coerce.number().int().positive({ message: 'minutos inválidos' }),
    observacao: z.union([z.string(), z.null()]).optional(),
    minutos_pago_folha: z.union([z.number(), z.string(), z.null()]).optional(),
    destino: z.union([z.string(), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    const dest = data.destino != null ? String(data.destino).trim() : '';
    if (dest === 'pendente') return;
    const mpf = data.minutos_pago_folha;
    if (mpf === undefined || mpf === null || (typeof mpf === 'string' && mpf.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Informe explicitamente quantos minutos da HE vão para a folha. Use 0 para banco e o total para pagamento integral.',
        path: ['minutos_pago_folha'],
      });
    }
  });

const optionalIntish = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().int()
);

export const rhHoraExtraPatchBodySchema = z.object({
  minutos: optionalIntish.optional(),
  minutos_pago_folha: z.union([z.number(), z.string(), z.null()]).optional(),
  destino: z.union([z.string(), z.null()]).optional(),
  observacao: z.union([z.string(), z.null()]).optional(),
  data: z.union([z.string(), z.null()]).optional(),
});

export const rhBancoHorasMovBodySchema = z.object({
  data_referencia: z.string().trim().min(1, 'data_referencia obrigatória'),
  tipo: z.enum(['credit', 'debit', 'manual_adjust', 'converted_to_payroll'], {
    message: 'Tipo inválido (credit, debit, manual_adjust, converted_to_payroll).',
  }),
  minutos: z.coerce.number().int({ message: 'minutos inválidos' }),
  origem: z.enum(['espelho', 'folha', 'manual', 'compensacao'], {
    message: 'Origem inválida (espelho, folha, manual, compensacao).',
  }),
  observacao: z.union([z.string(), z.null()]).optional(),
  competencia_referencia: z.union([z.string(), z.null()]).optional(),
});

export const rhEventoPostBodySchema = z.object({
  data: z.string().trim().min(1, 'data e tipo obrigatórios'),
  tipo: z.string().trim().min(1, 'data e tipo obrigatórios'),
  horas_ausentes: z.coerce.number().nonnegative().optional(),
  observacao: z.union([z.string(), z.null()]).optional(),
});

export const rhAdiantamentoPostBodySchema = z.object({
  valor: z.coerce.number().positive({ message: 'valor obrigatório' }),
  motivo: z.union([z.string(), z.null()]).optional(),
});

export const rhAjustePostBodySchema = z.object({
  tipo: z.string().trim().min(1, 'tipo e valor obrigatórios'),
  valor: z.coerce.number().positive({ message: 'tipo e valor obrigatórios' }),
  motivo: z.union([z.string(), z.null()]).optional(),
});

export const rhBeneficioItemSchema = z.object({
  tipo: z.string().min(1),
  valor: z.coerce.number(),
  tipo_valor: z.string().optional(),
  ativo: z.coerce.boolean(),
  efeito: z.string().optional(),
});

export const rhBeneficiosPutBodySchema = z.object({
  items: z.array(rhBeneficioItemSchema),
});

export const rhFolhaPagamentoPostBodySchema = z.object({
  month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
  tipo: z.enum(['advance', 'partial_payment', 'final_payment'], {
    message: 'Tipo inválido. Use advance, partial_payment ou final_payment.',
  }),
  valor: z.coerce.number().positive({ message: 'Valor inválido' }),
  observacao: z.union([z.string(), z.null()]).optional(),
});
