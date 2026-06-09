import type { Response } from 'express';
import type { z, ZodError } from 'zod';

export type ZodIssueDto = { path: string; message: string };

export function zodIssuesDto(err: ZodError): ZodIssueDto[] {
  return err.issues.map((i) => ({
    path: i.path.length ? i.path.map(String).join('.') : '(body)',
    message: i.message,
  }));
}

/** Formato usado em `/api/*` (ex.: solicitar-acesso, login). */
export function replyZod400Api(res: Response, err: ZodError, fallbackMessage = 'Dados inválidos.') {
  const issues = zodIssuesDto(err);
  res.status(400).json({
    success: false,
    message: issues[0]?.message ?? fallbackMessage,
    issues,
  });
}

/** Formato usado em rotas públicas que já retornam `{ error: string }`. */
export function replyZod400ErrorKey(res: Response, err: ZodError, fallbackMessage = 'Dados inválidos') {
  const issues = zodIssuesDto(err);
  res.status(400).json({
    error: issues[0]?.message ?? fallbackMessage,
    issues,
  });
}

/**
 * Valida `body` com o schema; em falha envia 400 e retorna `null`.
 * `reply` escolhe o formato da resposta (API vs `error`).
 */
export function parseBodyOrReply<S extends z.ZodType>(
  res: Response,
  schema: S,
  body: unknown,
  reply: (r: Response, e: ZodError) => void
): z.infer<S> | null {
  const out = schema.safeParse(body);
  if (!out.success) {
    reply(res, out.error);
    return null;
  }
  return out.data;
}
