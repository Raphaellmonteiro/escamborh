import { q1, qAll, qRun } from '../db';
import { AppError } from '../utils/errors';
import { sendWhatsAppMessage } from './whatsAppSenderService';

type DbConversationSummaryRow = {
  customer_phone: string;
  customer_name: string | null;
  last_message: string;
  last_message_at: string | Date;
  handoff_active: boolean | number | string | null;
};

type DbConversationMessageRow = {
  source_message_id: number | string;
  customer_phone: string;
  customer_name: string | null;
  message_text: string;
  message_at: string | Date;
  direction: 'inbound' | 'outbound';
  status: string;
  raw_status: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
};

type DbHandoffRow = {
  handoff_active: boolean | number | string | null;
};

type DbManualOutboundInsertRow = {
  id: number | string;
  created_at: string | Date;
};

type TenantWhatsAppConfigRow = {
  whatsapp_enabled?: boolean | number | string | null;
  provider?: string | null;
  provider_config_json?: string | null;
};

export type WhatsAppConversationSummary = {
  customer_phone: string;
  customer_name: string | null;
  last_message: string;
  last_message_at: string;
  handoff_active: boolean;
};

export type WhatsAppConversationMessage = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  direction: 'inbound' | 'outbound';
  text: string;
  status: string;
  raw_status: string | null;
  created_at: string;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
};

export type SendWhatsAppConversationMessageResult = {
  status: 'enviado' | 'erro';
  handoff_active: boolean;
  message: WhatsAppConversationMessage;
};

const HUMAN_HANDOFF_ACTIVE_WINDOW_HOURS = 4;

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function normalizeProviderName(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  return normalized
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function normalizeWhatsAppConversationPhone(rawValue: unknown) {
  const base = normalizeOptionalText(rawValue);
  if (!base) return null;

  const digits = base.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length < 10) return null;
  return digits;
}

export async function listWhatsAppConversations(tenantId: number) {
  const rows = await qAll<DbConversationSummaryRow>(
    `WITH timeline AS (
       SELECT m.customer_phone,
              NULLIF(BTRIM(m.customer_name), '') AS customer_name,
              m.message_text AS last_message,
              m.created_at AS last_message_at
       FROM whatsapp_inbound_messages m
       WHERE m.tenant_id=?
         AND NULLIF(BTRIM(COALESCE(m.message_text, '')), '') IS NOT NULL

       UNION ALL

       SELECT m.customer_phone,
              NULLIF(BTRIM(m.customer_name), '') AS customer_name,
              m.auto_reply_text AS last_message,
              COALESCE(m.auto_reply_sent_at, m.auto_reply_attempted_at, m.created_at) AS last_message_at
       FROM whatsapp_inbound_messages m
       WHERE m.tenant_id=?
         AND NULLIF(BTRIM(m.auto_reply_text), '') IS NOT NULL
     ),
     latest_messages AS (
       SELECT DISTINCT ON (timeline.customer_phone)
              timeline.customer_phone,
              timeline.customer_name,
              timeline.last_message,
              timeline.last_message_at
       FROM timeline
       ORDER BY timeline.customer_phone, timeline.last_message_at DESC
     ),
     latest_names AS (
       SELECT DISTINCT ON (m.customer_phone)
              m.customer_phone,
              NULLIF(BTRIM(m.customer_name), '') AS customer_name
       FROM whatsapp_inbound_messages m
       WHERE m.tenant_id=?
         AND NULLIF(BTRIM(m.customer_name), '') IS NOT NULL
       ORDER BY m.customer_phone, m.created_at DESC
     ),
     handoffs AS (
       SELECT h.customer_phone,
              CASE
                WHEN h.human_handoff_active = 1
                 AND h.handoff_created_at >= NOW() - INTERVAL '${HUMAN_HANDOFF_ACTIVE_WINDOW_HOURS} hours'
                THEN TRUE
                ELSE FALSE
              END AS handoff_active
       FROM whatsapp_human_handoffs h
       WHERE h.tenant_id=?
     )
     SELECT lm.customer_phone,
            COALESCE(ln.customer_name, lm.customer_name) AS customer_name,
            lm.last_message,
            lm.last_message_at,
            COALESCE(h.handoff_active, FALSE) AS handoff_active
     FROM latest_messages lm
     LEFT JOIN latest_names ln
       ON ln.customer_phone = lm.customer_phone
     LEFT JOIN handoffs h
       ON h.customer_phone = lm.customer_phone
     ORDER BY lm.last_message_at DESC, lm.customer_phone ASC`,
    [tenantId, tenantId, tenantId, tenantId]
  );

  return rows.map<WhatsAppConversationSummary>((row) => ({
    customer_phone: row.customer_phone,
    customer_name: normalizeOptionalText(row.customer_name),
    last_message: row.last_message,
    last_message_at: toIsoString(row.last_message_at),
    handoff_active: toBool(row.handoff_active, false),
  }));
}

export async function getWhatsAppConversationMessages(tenantId: number, customerPhone: string) {
  const [messages, handoffRow] = await Promise.all([
    qAll<DbConversationMessageRow>(
      `WITH timeline AS (
         SELECT m.id AS source_message_id,
                m.customer_phone,
                NULLIF(BTRIM(m.customer_name), '') AS customer_name,
                m.message_text,
                m.created_at AS message_at,
                'inbound'::text AS direction,
                'recebido'::text AS status,
                NULL::text AS raw_status,
                m.provider,
                m.provider_message_id,
                NULL::text AS error
         FROM whatsapp_inbound_messages m
         WHERE m.tenant_id=?
           AND m.customer_phone=?
           AND NULLIF(BTRIM(COALESCE(m.message_text, '')), '') IS NOT NULL

         UNION ALL

         SELECT m.id AS source_message_id,
                m.customer_phone,
                NULLIF(BTRIM(m.customer_name), '') AS customer_name,
                m.auto_reply_text AS message_text,
                COALESCE(m.auto_reply_sent_at, m.auto_reply_attempted_at, m.created_at) AS message_at,
                'outbound'::text AS direction,
                CASE
                  WHEN m.auto_reply_status = 'sent' THEN 'enviado'
                  WHEN m.auto_reply_status = 'error' THEN 'erro'
                  WHEN COALESCE(m.auto_reply_status, '') LIKE 'blocked_%' THEN 'bloqueado'
                  WHEN COALESCE(m.auto_reply_status, '') LIKE 'ignored_%' THEN 'ignorado'
                  ELSE COALESCE(NULLIF(BTRIM(m.auto_reply_status), ''), 'pendente')
                END AS status,
                m.auto_reply_status AS raw_status,
                m.auto_reply_provider AS provider,
                m.auto_reply_external_id AS provider_message_id,
                m.auto_reply_error AS error
         FROM whatsapp_inbound_messages m
         WHERE m.tenant_id=?
           AND m.customer_phone=?
           AND NULLIF(BTRIM(m.auto_reply_text), '') IS NOT NULL
       )
       SELECT source_message_id,
              customer_phone,
              customer_name,
              message_text,
              message_at,
              direction,
              status,
              raw_status,
              provider,
              provider_message_id,
              error
       FROM timeline
       ORDER BY message_at ASC,
                source_message_id ASC,
                CASE WHEN direction = 'inbound' THEN 0 ELSE 1 END ASC`,
      [tenantId, customerPhone, tenantId, customerPhone]
    ),
    q1<DbHandoffRow>(
      `SELECT CASE
                WHEN human_handoff_active = 1
                 AND handoff_created_at >= NOW() - INTERVAL '${HUMAN_HANDOFF_ACTIVE_WINDOW_HOURS} hours'
                THEN TRUE
                ELSE FALSE
              END AS handoff_active
       FROM whatsapp_human_handoffs
       WHERE tenant_id=?
         AND customer_phone=?
       LIMIT 1`,
      [tenantId, customerPhone]
    ),
  ]);

  if (messages.length === 0) {
    return null;
  }

  const customerName =
    messages
      .map((message) => normalizeOptionalText(message.customer_name))
      .filter((value): value is string => Boolean(value))
      .at(-1) || null;

  return {
    customer_phone: customerPhone,
    customer_name: customerName,
    handoff_active: toBool(handoffRow?.handoff_active, false),
    messages: messages.map<WhatsAppConversationMessage>((message) => ({
      id: `${message.direction}:${message.source_message_id}`,
      customer_phone: message.customer_phone,
      customer_name: normalizeOptionalText(message.customer_name),
      direction: message.direction,
      text: message.message_text,
      status: message.status,
      raw_status: normalizeOptionalText(message.raw_status),
      created_at: toIsoString(message.message_at),
      provider: normalizeOptionalText(message.provider),
      provider_message_id: normalizeOptionalText(message.provider_message_id),
      error: normalizeOptionalText(message.error),
    })),
  };
}

async function refreshActiveHandoffWindow(tenantId: number, customerPhone: string) {
  await qRun(
    `UPDATE whatsapp_human_handoffs
     SET handoff_created_at=NOW(),
         updated_at=NOW()
     WHERE tenant_id=?
       AND customer_phone=?
       AND human_handoff_active=1
       AND handoff_created_at >= NOW() - INTERVAL '${HUMAN_HANDOFF_ACTIVE_WINDOW_HOURS} hours'`,
    [tenantId, customerPhone]
  );
}

async function insertManualOutboundMessage(input: {
  tenantId: number;
  customerPhone: string;
  customerName: string | null;
  message: string;
  provider: string | null;
  status: 'sent' | 'error';
  error: string | null;
  externalId: string | null;
}) {
  const inserted = await q1<DbManualOutboundInsertRow>(
    `INSERT INTO whatsapp_inbound_messages
      (
        tenant_id,
        provider,
        provider_message_id,
        customer_phone,
        customer_name,
        message_text,
        payload_json,
        intent,
        auto_reply_text,
        auto_reply_status,
        auto_reply_error,
        auto_reply_provider,
        auto_reply_external_id,
        auto_reply_attempted_at,
        auto_reply_sent_at,
        created_at,
        received_at
      )
     VALUES (?, ?, NULL, ?, ?, NULL, ?, 'atendente', ?, ?, ?, ?, ?, NOW(), CASE WHEN ?=1 THEN NOW() ELSE NULL END, NOW(), NOW())
     RETURNING id, created_at`,
    [
      input.tenantId,
      input.provider,
      input.customerPhone,
      input.customerName,
      JSON.stringify({
        source: 'manual_send',
        direction: 'outbound',
      }),
      input.message,
      input.status,
      input.error,
      input.provider,
      input.externalId,
      input.status === 'sent' ? 1 : 0,
    ]
  );

  return inserted;
}

export async function sendWhatsAppConversationMessage(input: {
  tenantId: number;
  customerPhone: string;
  message: string;
}): Promise<SendWhatsAppConversationMessageResult> {
  const tenantId = Number(input.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new AppError('Tenant invalido', 400);
  }

  const messageText = normalizeOptionalText(input.message);
  if (!messageText) {
    throw new AppError('Mensagem obrigatoria', 400);
  }

  const conversation = await getWhatsAppConversationMessages(tenantId, input.customerPhone);
  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }

  const config = await q1<TenantWhatsAppConfigRow>(
    `SELECT whatsapp_enabled, provider, provider_config_json
     FROM tenant_whatsapp_config
     WHERE tenant_id=?`,
    [tenantId]
  );

  if (!config) {
    throw new AppError('Configuracao do WhatsApp nao encontrada', 404);
  }

  if (!toBool(config.whatsapp_enabled, false)) {
    throw new AppError('WhatsApp desabilitado para este tenant', 403);
  }

  if (conversation.handoff_active) {
    await refreshActiveHandoffWindow(tenantId, input.customerPhone);
  }

  const configuredProvider = normalizeProviderName(config.provider);

  try {
    const sendResult = await sendWhatsAppMessage({
      provider: config.provider || null,
      providerConfigJson: config.provider_config_json || null,
      to: input.customerPhone,
      message: messageText,
    });

    const inserted = await insertManualOutboundMessage({
      tenantId,
      customerPhone: input.customerPhone,
      customerName: conversation.customer_name,
      message: messageText,
      provider: sendResult.provider,
      status: 'sent',
      error: null,
      externalId: sendResult.externalId,
    });

    return {
      status: 'enviado',
      handoff_active: conversation.handoff_active,
      message: {
        id: `outbound:${inserted?.id ?? 'manual'}`,
        customer_phone: input.customerPhone,
        customer_name: conversation.customer_name,
        direction: 'outbound',
        text: messageText,
        status: 'enviado',
        raw_status: 'sent',
        created_at: toIsoString(inserted?.created_at),
        provider: normalizeOptionalText(sendResult.provider),
        provider_message_id: normalizeOptionalText(sendResult.externalId),
        error: null,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const inserted = await insertManualOutboundMessage({
      tenantId,
      customerPhone: input.customerPhone,
      customerName: conversation.customer_name,
      message: messageText,
      provider: configuredProvider,
      status: 'error',
      error: errorMessage,
      externalId: null,
    });

    return {
      status: 'erro',
      handoff_active: conversation.handoff_active,
      message: {
        id: `outbound:${inserted?.id ?? 'manual'}`,
        customer_phone: input.customerPhone,
        customer_name: conversation.customer_name,
        direction: 'outbound',
        text: messageText,
        status: 'erro',
        raw_status: 'error',
        created_at: toIsoString(inserted?.created_at),
        provider: configuredProvider,
        provider_message_id: null,
        error: errorMessage,
      },
    };
  }
}
