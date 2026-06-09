import { q1, qRun } from '../db';
import { logError, logInfo } from '../utils/logger';
import { sendWhatsAppMessage } from './whatsAppSenderService';
import { getConnectionInfo } from './whatsappService';
import { dispatchToN8NIfConfigured } from './whatsAppN8NDispatcher';

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
  delivery_config?: string | null;
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
  estimated_minutes: number | null;
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
  if (!name) return 'Olá!';
  const firstName = String(name).trim().split(/\s+/)[0];
  return firstName ? `Olá, ${firstName}!` : 'Olá!';
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

function buildTrackingLink(payload: WhatsAppMessagePayload) {
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl || !payload.store_slug) return null;
  return `${baseUrl}/delivery/${encodeURIComponent(payload.store_slug)}/pedido/${payload.order_id}`;
}

function parseEstimatedMinutesFromDeliveryConfig(rawValue: string | null | undefined) {
  const raw = normalizeOptionalText(rawValue);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const minutes = Number(parsed.tempo_preparo);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return Math.round(minutes);
  } catch {
    return null;
  }
}

function buildDefaultOrderStatusMessage(
  eventName: WhatsAppOrderEventName,
  payload: WhatsAppMessagePayload
) {
  const greeting = getCustomerGreeting(payload.customer_name);
  const orderLabel = getOrderDisplayLabel(payload);
  const storeLabel = payload.store_name || 'sua loja';
  const trackingLink = buildTrackingLink(payload);
  const trackingLine = trackingLink ? `Acompanhe aqui: ${trackingLink}` : null;
  const etaLine = payload.estimated_minutes ? `Prazo estimado da loja: ${payload.estimated_minutes} min.` : null;

  if (eventName === 'order_confirmed') {
    return [
      `${greeting} 🍔`,
      `A ${storeLabel} aceitou seu ${orderLabel.toLowerCase()} com sucesso.`,
      etaLine ? `Prazo estimado: ${payload.estimated_minutes} min.` : null,
      trackingLine ? 'Acompanhe seu pedido pelo link da loja.' : null,
      trackingLine,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (eventName === 'order_out_for_delivery') {
    return [
      `${greeting} 🛵`,
      `Seu ${orderLabel.toLowerCase()} saiu para entrega.`,
      'Fique atento, o entregador chegará em instantes.',
      trackingLine,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `${greeting} 📦`,
    `Seu ${orderLabel.toLowerCase()} está pronto para retirada na ${storeLabel}.`,
    trackingLine,
  ]
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
    if (!tenantId || !orderId) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'invalid_identifiers',
        event: eventName,
        source: input.source || null,
        tenantId: input.tenantId,
        orderId: input.orderId,
      });
      return;
    }

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
    if (!config || !toBool(config.whatsapp_enabled, false)) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'channel_disconnected',
        detail: 'tenant_whatsapp_disabled_or_missing',
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
      });
      return;
    }

    const autoNotifyFlag = CONFIG_FLAG_BY_NAME[eventName];
    const autoNotifyEnabled = toBool(config[autoNotifyFlag], false);
    if (!autoNotifyEnabled) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'auto_notify_disabled',
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
        flag: autoNotifyFlag,
      });
      return;
    }

    const connectionInfo = await getConnectionInfo(tenantId);
    if (!connectionInfo.supported || !connectionInfo.configured || !connectionInfo.status?.connected) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'channel_disconnected',
        detail: {
          supported: Boolean(connectionInfo.supported),
          configured: Boolean(connectionInfo.configured),
          connected: Boolean(connectionInfo.status?.connected),
        },
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
      });
      return;
    }

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
              c.usuario AS loja_slug,
              c.delivery_config
       FROM pedidos p
       LEFT JOIN delivery_clientes dc
         ON dc.id = COALESCE(p.cliente_id, p.delivery_cliente_id)
        AND dc.tenant_id = p.tenant_id
       LEFT JOIN clientes c
         ON c.id = p.tenant_id
       WHERE p.id=? AND p.tenant_id=?`,
      [orderId, tenantId]
    );
    if (!order) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'order_not_found',
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
      });
      return;
    }
    if (!shouldDispatchTransactionalEvent(eventName, order)) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'event_not_supported',
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
        channel: normalizeOptionalText(order.canal),
        pickup_type: normalizeOptionalText(order.tipo_retirada),
      });
      return;
    }
    if (await hasAlreadyProcessedOrderEvent(tenantId, orderId, eventName)) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'deduplicated',
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
      });
      return;
    }

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
      estimated_minutes: parseEstimatedMinutesFromDeliveryConfig(order.delivery_config),
    };
    if (!payload.customer_phone) {
      logInfo('whatsAppEventsService.skip', {
        reason: 'invalid_customer_phone',
        detail: 'empty_or_missing',
        event: eventName,
        source: input.source || null,
        tenantId,
        orderId,
      });
      return;
    }

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
  // Pagamento Pix confirmado: envia mensagem dedicada ao cliente via WhatsApp.
  // NÃO usa 'order_confirmed' para evitar duplicidade com o evento de pedido aceito.
  try {
    const tenantId = Number(input.tenantId);
    const orderId = Number(input.orderId);
    if (!tenantId || !orderId) return;

    const config = await q1<TenantWhatsAppConfigRow>(
      `SELECT whatsapp_enabled, provider, provider_config_json
       FROM tenant_whatsapp_config
       WHERE tenant_id=?`,
      [tenantId]
    );
    if (!config || !toBool(config.whatsapp_enabled, false)) return;

    const connectionInfo = await getConnectionInfo(tenantId);
    if (!connectionInfo.supported || !connectionInfo.configured || !connectionInfo.status?.connected) return;

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
              c.usuario AS loja_slug,
              c.delivery_config
       FROM pedidos p
       LEFT JOIN delivery_clientes dc
         ON dc.id = COALESCE(p.cliente_id, p.delivery_cliente_id)
        AND dc.tenant_id = p.tenant_id
       LEFT JOIN clientes c
         ON c.id = p.tenant_id
       WHERE p.id=? AND p.tenant_id=?`,
      [orderId, tenantId]
    );
    if (!order || !order.cliente_tel) return;

    const greeting = getCustomerGreeting(normalizeOptionalText(order.cliente_nome));
    const orderLabel = order.order_number ? `pedido #${order.order_number}` : 'seu pedido';
    const storeName = normalizeOptionalText(order.loja_nome) || 'a loja';
    const trackingLink = buildTrackingLink({
      tenant_id: tenantId,
      order_id: orderId,
      order_number: normalizeOptionalText(order.order_number),
      store_name: normalizeOptionalText(order.loja_nome),
      store_slug: normalizeOptionalText(order.loja_slug),
      customer_name: normalizeOptionalText(order.cliente_nome),
      customer_phone: normalizeOptionalText(order.cliente_tel),
      status: normalizeOptionalText(order.status),
      channel: normalizeOptionalText(order.canal),
      pickup_type: normalizeOptionalText(order.tipo_retirada),
      estimated_minutes: parseEstimatedMinutesFromDeliveryConfig(order.delivery_config),
    });

    const message = [
      `${greeting} ✅`,
      `Pagamento Pix do ${orderLabel} confirmado com sucesso!`,
      `${storeName} já recebeu e está preparando seu pedido.`,
      trackingLink ? `Acompanhe aqui: ${trackingLink}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await sendWhatsAppMessage({
      to: String(order.cliente_tel).replace(/\D/g, ''),
      message,
      provider: normalizeOptionalText(config.provider) || 'evolution',
      providerConfigJson: normalizeOptionalText(config.provider_config_json),
    });

    await insertPedidoWhatsAppEvent({
      tenantId,
      orderId,
      eventType: 'WHATSAPP_TXN_PAYMENT_CONFIRMED',
      statusNovo: 'pago',
      payload: {
        source: input.source || 'orderPaymentConfirmedWhatsAppEvent',
        channel: 'whatsapp',
      },
    });
  } catch (error) {
    logError('whatsAppEventsService.orderPaymentConfirmedWhatsAppEvent', error, {
      tenantId: input.tenantId,
      orderId: input.orderId,
      source: input.source || null,
    });
  }
}

export async function orderAcceptedWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_confirmed', input);
}

export async function orderPreparingWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  void input;
  return;
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
  dispatchToN8NIfConfigured({ tenantId: input.tenantId, event: 'status_changed', payload: { order_id: input.orderId, status: input.status ?? null } });
  const normalizedStatus = String(input.status || '').trim().toLowerCase();

  if (normalizedStatus === 'pedido recebido') {
    await registerWhatsAppOrderEvent('order_confirmed', input);
    return;
  }

  if (normalizedStatus === 'saiu para entrega') {
    await registerWhatsAppOrderEvent('order_out_for_delivery', input);
    return;
  }

  if (normalizedStatus === 'pronto') {
    await registerWhatsAppOrderEvent('order_ready_for_pickup', input);
    return;
  }

  if (normalizedStatus === 'pronto para entrega' || normalizedStatus === 'pronto para retirada') {
    await registerWhatsAppOrderEvent('order_ready_for_pickup', input);
    return;
  }

  logInfo('whatsAppEventsService.skip', {
    reason: 'event_not_supported',
    source: input.source || null,
    tenantId: input.tenantId,
    orderId: input.orderId,
    status: normalizeOptionalText(input.status),
  });
}