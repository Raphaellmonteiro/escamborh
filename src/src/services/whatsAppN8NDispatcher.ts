/**
 * whatsAppN8NDispatcher.ts — Fase 8b
 *
 * Dispatcher de eventos WhatsApp → N8N (ou webhook_custom).
 * Chamado após o processamento de cada mensagem/evento recebido.
 *
 * Eventos suportados:
 *   message_received  — mensagem inbound processada
 *   order_created     — pedido criado via IA
 *   status_changed    — status do pedido alterado
 *   campaign_sent     — envio de campanha concluído
 *
 * Nunca bloqueia o fluxo principal: fire-and-forget com .catch silencioso.
 * Usa a tabela whatsapp_integrations (já criada na Fase 8).
 */

import { query } from '../db';
import { logError, logInfo } from '../utils/logger';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type N8NEventName =
  | 'message_received'
  | 'order_created'
  | 'status_changed'
  | 'campaign_sent';

export type N8NDispatchInput = {
  tenantId: number | string;
  event: N8NEventName;
  payload: Record<string, unknown>;
};

type IntegrationRow = {
  id: number;
  type: string;
  config_json: string | Record<string, unknown>;
  enabled: boolean;
};

type N8NConfig = {
  webhook_url?: string;
  token?: string;
  events?: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseConfigJson(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw as string) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function fetchActiveN8NIntegration(tenantId: number | string): Promise<IntegrationRow | null> {
  const result = await query<IntegrationRow>(
    `SELECT id, type, config_json, enabled
       FROM whatsapp_integrations
      WHERE tenant_id = $1
        AND type IN ('n8n', 'webhook_custom')
        AND enabled = TRUE
      LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] ?? null;
}

async function postToWebhook(url: string, token: string | undefined, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000), // 8s timeout
  });

  if (!response.ok) {
    throw new Error(`N8N webhook retornou ${response.status}: ${await response.text().catch(() => '')}`);
  }

  return response;
}

// ─── Dispatcher principal ─────────────────────────────────────────────────────

/**
 * Despacha um evento para a integração N8N/webhook ativa do tenant.
 * Fire-and-forget: nunca rejeita (erros são logados).
 */
export function dispatchToN8NIfConfigured(input: N8NDispatchInput): void {
  void (async () => {
    const { tenantId, event, payload } = input;

    const integration = await fetchActiveN8NIntegration(tenantId);
    if (!integration) return; // sem integração ativa — silencioso

    const config = parseConfigJson(integration.config_json) as N8NConfig;
    const webhookUrl = config.webhook_url?.trim();
    if (!webhookUrl) return; // URL não configurada — silencioso

    // Verificar se o evento está na lista de eventos configurados.
    // Se a lista estiver vazia/ausente, envia todos os eventos.
    const allowedEvents = Array.isArray(config.events) ? config.events : [];
    if (allowedEvents.length > 0 && !allowedEvents.includes(event)) return;

    const body: Record<string, unknown> = {
      event,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    await postToWebhook(webhookUrl, config.token, body);

    logInfo('whatsAppN8NDispatcher.dispatched', {
      tenantId,
      event,
      integrationId: integration.id,
      integrationType: integration.type,
      url: webhookUrl.replace(/^(https?:\/\/[^/]+).*/, '$1/…'), // loga só domínio
    });
  })().catch((error) => {
    logError('whatsAppN8NDispatcher.error', error, {
      tenantId: input.tenantId,
      event: input.event,
    });
  });
}
