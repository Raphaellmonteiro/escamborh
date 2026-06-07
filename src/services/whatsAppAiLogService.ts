/**
 * whatsAppAiLogService.ts — Fase 9b
 *
 * Grava eventos reais na tabela whatsapp_ai_logs.
 * Chamado nos pontos relevantes do fluxo:
 *   - Mensagem recebida e respondida pelo chatbot
 *   - Pedido criado via IA
 *   - Erro da IA (timeout, provider, config)
 *   - Handoff para atendente humano solicitado
 *
 * Todos os inserts são fire-and-forget (.catch silencioso) para
 * nunca bloquear o fluxo principal por falha de log.
 */

import { query } from '../db';
import { logError } from '../utils/logger';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AILogType = 'message' | 'order' | 'campaign' | 'error' | 'handoff';

export type InsertAILogInput = {
  tenantId: number | string;
  type: AILogType;
  summary: string;
  detail?: string | null;
  phone?: string | null;
};

// ─── Helpers privados ─────────────────────────────────────────────────────────

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function parseTenantId(value: number | string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) + '…' : value;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Insere um registro na tabela whatsapp_ai_logs.
 * Retorna void — nunca lança, falhas são logadas internamente.
 */
export async function insertAILog(input: InsertAILogInput): Promise<void> {
  try {
    const tenantId = parseTenantId(input.tenantId);
    if (!tenantId) return;

    const summary = truncate(normalizeOptionalText(input.summary), 500);
    if (!summary) return;

    await query(
      `INSERT INTO whatsapp_ai_logs (tenant_id, type, summary, detail, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        tenantId,
        input.type,
        summary,
        truncate(normalizeOptionalText(input.detail), 2000),
        truncate(normalizeOptionalText(input.phone), 30),
      ]
    );
  } catch (err) {
    // Log de log não pode derrubar o fluxo principal
    logError('whatsAppAiLogService.insertAILog', err, {
      tenantId: input.tenantId,
      type: input.type,
    });
  }
}

// ─── Helpers semânticos (chamados nos pontos do sistema) ──────────────────────

/** Mensagem recebida e respondida pelo chatbot (keyword ou IA). */
export function logAIMessage(input: {
  tenantId: number | string;
  phone: string | null;
  messageText: string;
  replySource: 'keyword' | 'groq' | 'none';
  reason: string;
  replyText: string | null;
}): void {
  const sourceLabel = input.replySource === 'groq' ? 'IA' : input.replySource === 'keyword' ? 'keyword' : 'sem resposta';
  const summary = `Mensagem recebida — resposta via ${sourceLabel}`;
  const detail = [
    `Mensagem: ${truncate(input.messageText, 200)}`,
    `Motivo: ${input.reason}`,
    input.replyText ? `Resposta: ${truncate(input.replyText, 300)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  void insertAILog({
    tenantId: input.tenantId,
    type: 'message',
    summary,
    detail,
    phone: input.phone,
  });
}

/** Pedido criado pela IA. */
export function logAIOrderCreated(input: {
  tenantId: number | string;
  phone: string | null;
  orderId: number;
  total: number;
}): void {
  void insertAILog({
    tenantId: input.tenantId,
    type: 'order',
    summary: `Pedido #${input.orderId} criado via WhatsApp IA — total R$${input.total.toFixed(2)}`,
    phone: input.phone,
  });
}

/** Erro da IA (timeout, provider mal configurado, etc.). */
export function logAIError(input: {
  tenantId: number | string;
  phone: string | null;
  reason: string;
  error: string | null;
}): void {
  void insertAILog({
    tenantId: input.tenantId,
    type: 'error',
    summary: `Erro da IA — ${input.reason}`,
    detail: input.error ?? undefined,
    phone: input.phone,
  });
}

/** Cliente solicitou atendente humano. */
export function logAIHandoff(input: {
  tenantId: number | string;
  phone: string | null;
  messageText: string;
}): void {
  void insertAILog({
    tenantId: input.tenantId,
    type: 'handoff',
    summary: 'Cliente solicitou atendente humano',
    detail: truncate(input.messageText, 300),
    phone: input.phone,
  });
}
