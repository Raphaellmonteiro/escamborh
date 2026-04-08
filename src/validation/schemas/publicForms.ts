import { z } from 'zod';
import { PUBLIC_SEGMENT_VALUES } from '../../config/publicSegments';
import {
  MAX_CITY,
  MAX_DOCUMENTO_RAW,
  MAX_NAME,
  MAX_PASSWORD_LEN,
  MAX_RAZAO_SOCIAL,
  MAX_SHORT_LABEL,
  MAX_USERNAME_LEN,
  zBrazilPhoneDigits,
  zEmailRequired,
} from '../brFields';

const documentoTipoEnum = z.enum(['CNPJ', 'CPF']);

export const solicitarAcessoBodySchema = z
  .object({
    nome_estabelecimento: z
      .string()
      .trim()
      .min(1, 'Nome do estabelecimento é obrigatório')
      .max(MAX_SHORT_LABEL, 'Nome do estabelecimento muito longo'),
    razao_social: z.string().max(MAX_RAZAO_SOCIAL, 'Razão social muito longa').optional(),
    documento_tipo: documentoTipoEnum,
    documento_numero: z
      .string()
      .trim()
      .min(1, 'Documento é obrigatório')
      .max(MAX_DOCUMENTO_RAW, 'Documento muito longo'),
    nome_responsavel: z
      .string()
      .trim()
      .min(1, 'Nome do responsável é obrigatório')
      .max(MAX_NAME, 'Nome do responsável muito longo'),
    email: zEmailRequired,
    whatsapp: zBrazilPhoneDigits,
    cidade: z.string().trim().min(1, 'Cidade é obrigatória').max(MAX_CITY, 'Cidade muito longa'),
    segmento: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.enum(PUBLIC_SEGMENT_VALUES, { message: 'Segmento indisponível no momento.' }).optional()
    ),
  })
  .superRefine((data, ctx) => {
    const digits = data.documento_numero.replace(/\D/g, '');
    if (data.documento_tipo === 'CPF' && digits.length !== 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento_numero'],
        message: 'CPF deve conter 11 dígitos',
      });
    }
    if (data.documento_tipo === 'CNPJ' && digits.length !== 14) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento_numero'],
        message: 'CNPJ deve conter 14 dígitos',
      });
    }
  });

export const loginBodySchema = z
  .object({
    username: z.string().max(MAX_USERNAME_LEN, 'Usuário muito longo'),
    password: z.string().max(MAX_PASSWORD_LEN, 'Senha muito longa'),
  })
  .transform((o) => ({
    username: String(o.username ?? '').trim(),
    password: String(o.password ?? ''),
  }))
  .refine((o) => o.username.length > 0 && o.password.length > 0, {
    message: 'Usuário e senha são obrigatórios',
  });

export const securitySenhaBodySchema = z
  .object({
    senha: z.string().max(MAX_PASSWORD_LEN, 'Senha muito longa'),
  })
  .transform((o) => ({ senha: String(o.senha ?? '').trim() }))
  .superRefine((v, ctx) => {
    if (!v.senha.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['senha'],
        message: 'Senha de segurança obrigatória',
      });
    }
  });

export const deliveryIdentificarBodySchema = z.object({
  telefone: zBrazilPhoneDigits,
});

export const deliveryCadastrarBodySchema = z.object({
  telefone: zBrazilPhoneDigits,
  nome: z.string().trim().min(1, 'Nome é obrigatório').max(MAX_NAME, 'Nome muito longo'),
  email: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().trim().max(254, 'E-mail muito longo').email('E-mail inválido').optional()
  ),
});

const perfilEmailField = z.preprocess((v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}, z.union([z.null(), z.string().max(254).email('E-mail inválido')]).optional());

export const deliveryPerfilPutBodySchema = z
  .object({
    nome: z.string().max(MAX_NAME, 'Nome muito longo').optional(),
    email: perfilEmailField,
  })
  .transform((raw) => ({
    nome: raw.nome != null ? String(raw.nome).trim() : '',
    email: raw.email === undefined ? null : raw.email,
  }));
