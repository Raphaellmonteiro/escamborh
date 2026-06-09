import type { Response } from 'express';
import { logError } from './logger';

export const INTERNAL_SERVER_MESSAGE = 'Erro interno ao processar a solicitação.';

export type InternalErrorJson = {
  success: false;
  message: typeof INTERNAL_SERVER_MESSAGE;
};

/**
 * Responde 500 com mensagem genérica ao cliente e registra erro completo (incl. stack) no servidor.
 */
export function sendInternalError(
  res: Response,
  context: string,
  err: unknown,
  meta: Record<string, unknown> = {}
): void {
  logError(context, err, meta);
  if (!res.headersSent) {
    res.status(500).json({ success: false, message: INTERNAL_SERVER_MESSAGE } satisfies InternalErrorJson);
  }
}
