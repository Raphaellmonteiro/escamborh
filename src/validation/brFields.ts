import { z } from 'zod';
import { normalizeBrazilDeliveryPhoneDigits } from '../utils/deliveryFirstPurchaseEligibility';

export const MAX_USERNAME_LEN = 128;
export const MAX_PASSWORD_LEN = 256;
export const MAX_SHORT_LABEL = 160;
export const MAX_NAME = 120;
export const MAX_CITY = 120;
export const MAX_RAZAO_SOCIAL = 200;
export const MAX_DOCUMENTO_RAW = 32;
export const MAX_EMAIL_LEN = 254;

/** Telefone/WhatsApp BR: normaliza como no delivery e exige 10–11 dígitos (DDD + número). */
export const zBrazilPhoneDigits = z
  .union([z.string(), z.number()])
  .transform((v) => normalizeBrazilDeliveryPhoneDigits(String(v)))
  .refine((d) => d.length >= 10 && d.length <= 11, {
    message: 'Telefone inválido: informe DDD + número (10 ou 11 dígitos)',
  });

export const zEmailRequired = z
  .string()
  .trim()
  .min(1, 'E-mail obrigatório')
  .max(MAX_EMAIL_LEN, 'E-mail muito longo')
  .email('E-mail inválido');
