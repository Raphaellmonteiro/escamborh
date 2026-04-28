import { q1, qRun } from '../db';
import { logError, logInfo } from '../utils/logger';
import { sendWhatsAppMessage } from './whatsAppSenderService';

type TenantId = number | string;

type WhatsAppOrderEventName =
  | 'order_confirmed'
  | 'order_ready_for_delivery'
  | 'order_out_for_delivery'
  | 'order_ready_for_pickup';

type TenantWhatsAppConfigRow = {
  whatsapp_enabled?: number | boolean | string | null;
  provider?: string | null;
  provider_config_json?: string | null;
  auto_notify_order_accepted?: number | boolean | string | null;
  auto_notify_order_preparing?: number | boolean | string | null;
  auto_notify_order_out_for_delivery?: number | boolean | string | null;
};

type OrderWhatsAppRow = {
  id: number | string;
  tenant_id: number | string;
  order_number?: string | null;
  cliente_nome: string | null;
  cliente_tel: string | null;
  status: string | null;
  canal?: string | null;
  tipo_retirada?: string | null;
  loja_nome?: string | null;
  loja_slug?: string | null;
};

type RegisterWhatsAppOrderEventInput = {
  tenantId: TenantId;
  orderId: number | string;
  source?: string;
};

type WhatsAppMessagePayload = {
  tenant_id: number;
  order_id: number;
  order_number: string | null;
  store_name: string | null;
  store_slug: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string | null;
  channel: string | null;
  pickup_type: string | null;
};

const SUCCESS_EVENT_TYPE_BY_NAME: Record<WhatsAppOrderEventName, string> = {
  order_confirmed: 'WHATSAPP_TXN_ORDER_CONFIRMED',
  order_ready_for_delivery: 'WHATSAPP_TXN_ORDER_READY_FOR_DELIVERY',
  order_out_for_delivery: 'WHATSAPP_TXN_ORDER_OUT_FOR_DELIVERY',
  order_ready_for_pickup: 'WHATSAPP_TXN_ORDER_READY_FOR_PICKUP',
};

const ERROR_EVENT_TYPE_BY_NAME: Record<WhatsAppOrderEventName, string> = {
  order_confirmed: 'WHATSAPP_TXN_ORDER_CONFIRMED_ERROR',
  order_ready_for_delivery: 'WHATSAPP_TXN_ORDER_READY_FOR_DELIVERY_ERROR',
  order_out_for_delivery: 'WHATSAPP_TXN_ORDER_OUT_FOR_DELIVERY_ERROR',
  order_ready_for_pickup: 'WHATSAPP_TXN_ORDER_READY_FOR_PICKUP_ERROR',
};

const CONFIG_FLAG_BY_NAME: Record<
  WhatsAppOrderEventName,
  keyof TenantWhatsAppConfigRow
> = {
  order_confirmed: 'auto_notify_order_accepted',
  order_ready_for_delivery: 'auto_notify_order_preparing',
  order_out_for_delivery: 'auto_notify_order_out_for_delivery',
  order_ready_for_pickup: 'auto_notify_order_preparing',
};

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: number | string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function getOrderDisplayLabel(payload: WhatsAppMessagePayload) {
  return payload.order_number
    ? `Pedido #${payload.order_number}`
    : `Pedido #${payload.order_id}`;
}

function getCustomerGreeting(name: string | null) {
  if (!name) return 'Ola!';
  const firstName = String(name).trim().split(/\s+/)[0];
  return firstName ? `Ola, ${firstName}!` : 'Ola!';
}

function resolvePublicBaseUrl() {
  const explicit =
    normalizeOptionalText(process.env.FLOWPDV_PUBLIC_URL) ||
    normalizeOptionalText(process.env.RAILWAY_PUBLIC_DOMAIN);
  if (!explicit) return normalizeOptionalText(process.env.PUBLIC_BASE_URL);
  return /^https?:\/\//i.test(explicit)
    ? explicit.replace(/\/+$/, '')
    : `https://${explicit}`.replace(/\/+$/, '');
}

function resolveOrderTypeLabel(payload: WhatsAppMessagePayload) {
  const channel = String(payload.channel || '').trim().toLowerCase();
  if (channel === 'delivery') return 'Entrega';
  if (channel === 'retirada' || String(payload.pickup_type || '').trim().toLowerCase() === 'levar') {
    return 'Retirada';
  }
  return null;
}

function buildTrackingLink(payload: WhatsAppMessagePayload) {
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl || !payload.store_slug) return null;
  return `${baseUrl}/delivery/${encodeURIComponent(payload.store_slug)}/pedido/${payload.order_id}`;
}

function buildDefaultOrderStatusMessage(
  eventName: WhatsAppOrderEventName,
  payload: WhatsAppMessagePayload
) {
  const greeting = getCustomerGreeting(payload.customer_name);
  const orderLabel = getOrderDisplayLabel(payload);
  const orderTypeLabel = resolveOrderTypeLabel(payload);
  const orderTypeLine = orderTypeLabel ? `Tipo: ${orderTypeLabel}` : null;
  const storeLine = payload.store_name ? `Loja: ${payload.store_name}` : null;
  const trackingLine = buildTrackingLink(payload) ? `Acompanhe: ${buildTrackingLink(payload)}` : null;

  if (eventName === 'order_confirmed') {
    return [greeting, `${orderLabel} confirmado com sucesso.`, orderTypeLine, storeLine, trackingLine]
      .filter(Boolean)
      .join('\n');
  }

  if (eventName === 'order_ready_for_delivery') {
    return [greeting, `${orderLabel} esta pronto e saira para entrega em breve.`, orderTypeLine, storeLine, trackingLine]
      .filter(Boolean)
      .join('\n');
  }

  if (eventName === 'order_out_for_delivery') {
    return [greeting, `${orderLabel} saiu para entrega.`, orderTypeLine, storeLine, trackingLine]
      .filter(Boolean)
      .join('\n');
  }

  return [greeting, `${orderLabel} esta pronto para retirada.`, orderTypeLine, storeLine, trackingLine]
    .filter(Boolean)
    .join('\n');
}

function maskPhone(rawPhone: string | null) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits || null;
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function insertPedidoWhatsAppEvent(input: {
  tenantId: number;
  orderId: number;
  eventType: string;
  statusNovo: string | null;
  payload: Record<string, unknown>;
}) {
  await qRun(
    `INSERT INTO pedido_eventos
      (pedido_id, tenant_id, tipo, status_novo, valor, estoque_reposto, payload, usuario_id)
     VALUES (?, ?, ?, ?, 0, 0, ?, NULL)`,
    [input.orderId, input.tenantId, input.eventType, input.statusNovo, JSON.stringify(input.payload)]
  );
}

async function hasAlreadyProcessedOrderEvent(
  tenantId: number,
  orderId: number,
  eventName: WhatsAppOrderEventName
) {
  const successType = SUCCESS_EVENT_TYPE_BY_NAME[eventName];
  const errorType = ERROR_EVENT_TYPE_BY_NAME[eventName];
  const row = await q1<{ id: number }>(
    `SELECT id
       FROM pedido_eventos
      WHERE pedido_id=? AND tenant_id=? AND tipo IN (?, ?)
      LIMIT 1`,
    [orderId, tenantId, successType, errorType]
  );
  return Boolean(row?.id);
}

function shouldDispatchTransactionalEvent(
  eventName: WhatsAppOrderEventName,
  order: OrderWhatsAppRow
) {
  const channel = String(order.canal || '').trim().toLowerCase();
  const pickupType = String(order.tipo_retirada || '').trim().toLowerCase();

  if (eventName === 'order_ready_for_pickup') {
    return channel === 'retirada' || pickupType === 'levar';
  }
  if (eventName === 'order_ready_for_delivery' || eventName === 'order_out_for_delivery') {
    return channel === 'delivery';
  }
  return true;
}

async function registerWhatsAppOrderEvent(
  eventName: WhatsAppOrderEventName,
  input: RegisterWhatsAppOrderEventInput
) {
  try {
    const tenantId = parsePositiveInt(input.tenantId);
    const orderId = parsePositiveInt(input.orderId);
    if (!tenantId || !orderId) return;

    const config = await q1<TenantWhatsAppConfigRow>(
      `SELECT whatsapp_enabled,
              provider,
              provider_config_json,
              auto_notify_order_accepted,
              auto_notify_order_preparing,
              auto_notify_order_out_for_delivery
       FROM tenant_whatsapp_config
       WHERE tenant_id=?`,
      [tenantId]
    );
    if (!config || !toBool(config.whatsapp_enabled, false)) return;

    const autoNotifyFlag = CONFIG_FLAG_BY_NAME[eventName];
    const autoNotifyEnabled = toBool(config[autoNotifyFlag], false);
    if (!autoNotifyEnabled) return;

    const order = await q1<OrderWhatsAppRow>(
      `SELECT p.id,
              p.tenant_id,
              p.order_number,
              COALESCE(NULLIF(BTRIM(p.cliente_nome), ''), NULLIF(BTRIM(dc.nome), '')) AS cliente_nome,
              COALESCE(NULLIF(BTRIM(p.cliente_tel), ''), NULLIF(BTRIM(dc.telefone), '')) AS cliente_tel,
              p.status,
              p.canal,
              p.tipo_retirada,
              c.nome_estabelecimento AS loja_nome,
              c.usuario AS loja_slug
       FROM pedidos p
       LEFT JOIN delivery_clientes dc
         ON dc.id = COALESCE(p.cliente_id, p.delivery_cliente_id)
        AND dc.tenant_id = p.tenant_id
       LEFT JOIN clientes c
         ON c.id = p.tenant_id
       WHERE p.id=? AND p.tenant_id=?`,
      [orderId, tenantId]
    );
    if (!order || !shouldDispatchTransactionalEvent(eventName, order)) return;
    if (await hasAlreadyProcessedOrderEvent(tenantId, orderId, eventName)) return;

    const payload: WhatsAppMessagePayload = {
      tenant_id: Number(order.tenant_id),
      order_id: Number(order.id),
      order_number: normalizeOptionalText(order.order_number),
      store_name: normalizeOptionalText(order.loja_nome),
      store_slug: normalizeOptionalText(order.loja_slug),
      customer_name: normalizeOptionalText(order.cliente_nome),
      customer_phone: normalizeOptionalText(order.cliente_tel),
      status: normalizeOptionalText(order.status),
      channel: normalizeOptionalText(order.canal),
      pickup_type: normalizeOptionalText(order.tipo_retirada),
    };

    const message = buildDefaultOrderStatusMessage(eventName, payload);

    try {
      const sendResult = await sendWhatsAppMessage({
        provider: config.provider || null,
        providerConfigJson: config.provider_config_json || null,
        to: payload.customer_phone || '',
        message,
      });

      await insertPedidoWhatsAppEvent({
        tenantId,
        orderId,
        eventType: SUCCESS_EVENT_TYPE_BY_NAME[eventName],
        statusNovo: payload.status,
        payload: {
          source: input.source || null,
          channel: 'whatsapp',
          event: eventName,
          provider: sendResult.provider,
          recipient: sendResult.recipient,
          external_id: sendResult.externalId,
          response_status: sendResult.responseStatus,
          message,
          payload,
          provider_response: sendResult.providerResponse,
        },
      });

      logInfo('whatsAppEventsService.sent', {
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
        provider: sendResult.provider,
        recipient: maskPhone(sendResult.recipient),
      });
    } catch (error) {
      await insertPedidoWhatsAppEvent({
        tenantId,
        orderId,
        eventType: ERROR_EVENT_TYPE_BY_NAME[eventName],
        statusNovo: payload.status,
        payload: {
          source: input.source || null,
          channel: 'whatsapp',
          event: eventName,
          provider: normalizeOptionalText(config.provider),
          error: safeErrorMessage(error),
          message,
          payload,
        },
      });

      logError('whatsAppEventsService.send', error, {
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
        provider: normalizeOptionalText(config.provider),
        recipient: maskPhone(payload.customer_phone),
      });
    }
  } catch (error) {
    logError('whatsAppEventsService.dispatch', error, {
      event: eventName,
      tenantId: input.tenantId,
      orderId: input.orderId,
      source: input.source || null,
    });
  }
}

export async function orderCreatedWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_confirmed', input);
}

export async function orderPaymentConfirmedWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_confirmed', input);
}

export async function orderAcceptedWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_confirmed', input);
}

export async function orderPreparingWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_ready_for_delivery', input);
}

export async function orderOutForDeliveryWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_out_for_delivery', input);
}

export async function orderDeliveredWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_ready_for_pickup', input);
}

export async function orderCancelledWhatsAppEvent(_input: RegisterWhatsAppOrderEventInput) {
  return;
}

export async function emitWhatsAppOrderStatusEvent(input: RegisterWhatsAppOrderEventInput & { status?: string | null }) {
  const normalizedStatus = String(input.status || '').trim().toLowerCase();

  if (normalizedStatus === 'pedido recebido') {
    await registerWhatsAppOrderEvent('order_confirmed', input);
    return;
  }

  if (normalizedStatus === 'pronto para entrega') {
    await registerWhatsAppOrderEvent('order_ready_for_delivery', input);
    return;
  }

  if (normalizedStatus === 'saiu para entrega') {
    await registerWhatsAppOrderEvent('order_out_for_delivery', input);
    return;
  }

  if (normalizedStatus === 'pronto') {
    await registerWhatsAppOrderEvent('order_ready_for_pickup', input);
  }
}
