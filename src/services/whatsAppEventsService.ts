import { q1, qRun } from '../db';
import { logError, logInfo } from '../utils/logger';
import { sendWhatsAppMessage } from './whatsAppSenderService';

type TenantId = number | string;

type WhatsAppOrderEventName =
  | 'order_created'
  | 'payment_confirmed'
  | 'order_accepted'
  | 'order_preparing'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled';

type TenantWhatsAppConfigRow = {
  whatsapp_enabled?: number | boolean | string | null;
  provider?: string | null;
  provider_config_json?: string | null;
  auto_notify_order_created?: number | boolean | string | null;
  auto_notify_order_accepted?: number | boolean | string | null;
  auto_notify_order_preparing?: number | boolean | string | null;
  auto_notify_order_out_for_delivery?: number | boolean | string | null;
  auto_notify_order_delivered?: number | boolean | string | null;
  auto_notify_order_cancelled?: number | boolean | string | null;
};

type OrderWhatsAppRow = {
  id: number | string;
  tenant_id: number | string;
  order_number?: string | null;
  cliente_nome: string | null;
  cliente_tel: string | null;
  status: string | null;
  total_amount: number | string | null;
  loja_nome?: string | null;
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
  customer_name: string | null;
  customer_phone: string | null;
  status: string | null;
  total_amount: number;
};

const SUCCESS_EVENT_TYPE_BY_NAME: Record<WhatsAppOrderEventName, string> = {
  order_created: 'WHATSAPP_ORDER_CREATED',
  payment_confirmed: 'WHATSAPP_ORDER_PAYMENT_CONFIRMED',
  order_accepted: 'WHATSAPP_ORDER_ACCEPTED',
  order_preparing: 'WHATSAPP_ORDER_PREPARING',
  order_out_for_delivery: 'WHATSAPP_ORDER_OUT_FOR_DELIVERY',
  order_delivered: 'WHATSAPP_ORDER_DELIVERED',
  order_cancelled: 'WHATSAPP_ORDER_CANCELLED',
};

const ERROR_EVENT_TYPE_BY_NAME: Record<WhatsAppOrderEventName, string> = {
  order_created: 'WHATSAPP_ORDER_CREATED_ERROR',
  payment_confirmed: 'WHATSAPP_ORDER_PAYMENT_CONFIRMED_ERROR',
  order_accepted: 'WHATSAPP_ORDER_ACCEPTED_ERROR',
  order_preparing: 'WHATSAPP_ORDER_PREPARING_ERROR',
  order_out_for_delivery: 'WHATSAPP_ORDER_OUT_FOR_DELIVERY_ERROR',
  order_delivered: 'WHATSAPP_ORDER_DELIVERED_ERROR',
  order_cancelled: 'WHATSAPP_ORDER_CANCELLED_ERROR',
};

const CONFIG_FLAG_BY_NAME: Record<
  WhatsAppOrderEventName,
  keyof TenantWhatsAppConfigRow
> = {
  order_created: 'auto_notify_order_created',
  payment_confirmed: 'auto_notify_order_accepted',
  order_accepted: 'auto_notify_order_accepted',
  order_preparing: 'auto_notify_order_preparing',
  order_out_for_delivery: 'auto_notify_order_out_for_delivery',
  order_delivered: 'auto_notify_order_delivered',
  order_cancelled: 'auto_notify_order_cancelled',
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

function formatMoneyBr(value: number) {
  return value.toFixed(2).replace('.', ',');
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

function buildDefaultOrderStatusMessage(
  eventName: WhatsAppOrderEventName,
  payload: WhatsAppMessagePayload
) {
  const greeting = getCustomerGreeting(payload.customer_name);
  const orderLabel = getOrderDisplayLabel(payload);
  const totalLine = `Total: R$ ${formatMoneyBr(payload.total_amount)}`;
  const storeLine = payload.store_name ? `Loja: ${payload.store_name}` : null;

  switch (eventName) {
    case 'order_created':
      return [greeting, `${orderLabel} foi recebido com sucesso.`, totalLine, storeLine]
        .filter(Boolean)
        .join('\n');
    case 'payment_confirmed':
      return [
        greeting,
        `Recebemos o pagamento do ${orderLabel}.`,
        `${orderLabel} foi confirmado e seguira para preparo.`,
        totalLine,
        storeLine,
      ]
        .filter(Boolean)
        .join('\n');
    case 'order_accepted':
      return [greeting, `${orderLabel} foi aceito e entrou em atendimento.`, storeLine]
        .filter(Boolean)
        .join('\n');
    case 'order_preparing':
      return [greeting, `${orderLabel} esta em preparo.`, storeLine]
        .filter(Boolean)
        .join('\n');
    case 'order_out_for_delivery':
      return [greeting, `${orderLabel} saiu para entrega.`, storeLine]
        .filter(Boolean)
        .join('\n');
    case 'order_delivered':
      return [greeting, `${orderLabel} foi entregue. Obrigado pela preferencia!`, storeLine]
        .filter(Boolean)
        .join('\n');
    case 'order_cancelled':
      return [greeting, `${orderLabel} foi cancelado. Se precisar, fale com a loja.`, storeLine]
        .filter(Boolean)
        .join('\n');
    default:
      return [greeting, `${orderLabel} teve atualizacao de status.`, storeLine]
        .filter(Boolean)
        .join('\n');
  }
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
  totalAmount: number;
  payload: Record<string, unknown>;
}) {
  await qRun(
    `INSERT INTO pedido_eventos
      (pedido_id, tenant_id, tipo, status_novo, valor, estoque_reposto, payload, usuario_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, NULL)`,
    [
      input.orderId,
      input.tenantId,
      input.eventType,
      input.statusNovo,
      input.totalAmount,
      JSON.stringify(input.payload),
    ]
  );
}

async function registerWhatsAppOrderEvent(
  eventName: WhatsAppOrderEventName,
  input: RegisterWhatsAppOrderEventInput
) {
  try {
    const tenantId = parsePositiveInt(input.tenantId);
    const orderId = parsePositiveInt(input.orderId);

    if (!tenantId || !orderId) {
      return;
    }

    const config = await q1<TenantWhatsAppConfigRow>(
      `SELECT whatsapp_enabled,
              provider,
              provider_config_json,
              auto_notify_order_created,
              auto_notify_order_accepted,
              auto_notify_order_preparing,
              auto_notify_order_out_for_delivery,
              auto_notify_order_delivered,
              auto_notify_order_cancelled
       FROM tenant_whatsapp_config
       WHERE tenant_id=?`,
      [tenantId]
    );

    if (!config || !toBool(config.whatsapp_enabled, false)) {
      return;
    }

    const autoNotifyFlag = CONFIG_FLAG_BY_NAME[eventName];
    if (!toBool(config[autoNotifyFlag], false)) {
      return;
    }

    const order = await q1<OrderWhatsAppRow>(
      `SELECT p.id,
              p.tenant_id,
              p.order_number,
              COALESCE(NULLIF(BTRIM(p.cliente_nome), ''), NULLIF(BTRIM(dc.nome), '')) AS cliente_nome,
              COALESCE(NULLIF(BTRIM(p.cliente_tel), ''), NULLIF(BTRIM(dc.telefone), '')) AS cliente_tel,
              p.status,
              p.total_amount,
              c.nome_estabelecimento AS loja_nome
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
      return;
    }

    const payload: WhatsAppMessagePayload = {
      tenant_id: Number(order.tenant_id),
      order_id: Number(order.id),
      order_number: normalizeOptionalText(order.order_number),
      store_name: normalizeOptionalText(order.loja_nome),
      customer_name: normalizeOptionalText(order.cliente_nome),
      customer_phone: normalizeOptionalText(order.cliente_tel),
      status: normalizeOptionalText(order.status),
      total_amount: Number(order.total_amount || 0),
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
        totalAmount: payload.total_amount,
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
        totalAmount: payload.total_amount,
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
  await registerWhatsAppOrderEvent('order_created', input);
}

export async function orderPaymentConfirmedWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('payment_confirmed', input);
}

export async function orderAcceptedWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_accepted', input);
}

export async function orderPreparingWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_preparing', input);
}

export async function orderOutForDeliveryWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_out_for_delivery', input);
}

export async function orderDeliveredWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_delivered', input);
}

export async function orderCancelledWhatsAppEvent(input: RegisterWhatsAppOrderEventInput) {
  await registerWhatsAppOrderEvent('order_cancelled', input);
}

export async function emitWhatsAppOrderStatusEvent(input: RegisterWhatsAppOrderEventInput & { status?: string | null }) {
  const normalizedStatus = String(input.status || '').trim().toLowerCase();

  if (normalizedStatus === 'pedido recebido') {
    await orderAcceptedWhatsAppEvent(input);
    return;
  }

  if (normalizedStatus === 'em preparo') {
    await orderPreparingWhatsAppEvent(input);
    return;
  }

  if (normalizedStatus === 'saiu para entrega') {
    await orderOutForDeliveryWhatsAppEvent(input);
    return;
  }

  if (normalizedStatus === 'entregue') {
    await orderDeliveredWhatsAppEvent(input);
    return;
  }

  if (normalizedStatus === 'cancelado') {
    await orderCancelledWhatsAppEvent(input);
  }
}
