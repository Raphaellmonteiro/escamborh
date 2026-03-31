/** Limite de caracteres para texto livre enviado ao modelo (anti prompt injection / custo). */
export const MAX_FLOW_AI_USER_CHARS = 500;

const CTRL =
  // C0 exceto \t \n \r; DEL
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Remove caracteres de controle (exceto tab/CR/LF já normalizados abaixo) e limita o tamanho.
 */
export function sanitizeFlowAiUserText(raw: unknown): string {
  let s = String(raw ?? '').replace(CTRL, '');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = s.trim();
  return trimmed.length <= MAX_FLOW_AI_USER_CHARS ? trimmed : trimmed.slice(0, MAX_FLOW_AI_USER_CHARS);
}
