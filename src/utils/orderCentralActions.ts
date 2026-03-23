import type { Order } from '../types';
import { getDeliveryNextStatus } from './deliveryStatusNext';
import { getNonDeliveryNextStatus } from './orderNonDeliveryNextStatus';
import { isOrderCanceledLike, mapOrderToCentralColumn, type CentralColumnId } from './orderCentralBoard';
import { fetchPrintableHtml, openPrintPreview } from './print';

function isDeliveryOrder(order: Order): boolean {
  return String(order.canal || '').trim().toLowerCase() === 'delivery';
}

function getPaymentStatus(order: Order): string {
  return String((order as { pagamento_status?: string | null }).pagamento_status || '')
    .trim()
    .toLowerCase();
}

function getCustomerPhone(order: Order): string {
  return String((order as { cliente_tel?: string | null }).cliente_tel || '')
    .replace(/\D/g, '')
    .trim();
}

function getCustomerAddress(order: Order): string {
  return String((order as { endereco?: string | null }).endereco || '').trim();
}

function formatOrderTotal(order: Order): string {
  return `R$ ${Number(order.total_amount || 0).toFixed(2).replace('.', ',')}`;
}

function getNotifyMessage(order: Order): string {
  const address = getCustomerAddress(order);
  const status = String(order.status || '').trim();
  const statusLine =
    status === 'Saiu para Entrega'
      ? 'Seu pedido saiu para entrega.'
      : status === 'Pronto para Entrega'
        ? 'Seu pedido está pronto e seguirá para entrega em breve.'
        : `Atualização do pedido: ${status}.`;

  return [
    `Olá!`,
    `${statusLine}`,
    `Pedido #${order.order_number}`,
    `Total: ${formatOrderTotal(order)}`,
    address ? `Endereço: ${address}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function labelForDeliveryNext(nextStatus: string): string {
  if (nextStatus === 'Em Preparo') return 'Preparar';
  if (nextStatus === 'Pronto para Entrega') return 'Marcar como pronto';
  if (nextStatus === 'Saiu para Entrega') return 'Enviar para entrega';
  if (nextStatus === 'Entregue') return 'Finalizar entrega';
  return 'Avançar';
}

function labelForNonDeliveryNext(_current: string, nextStatus: string): string {
  if (nextStatus === 'Em Preparo') return 'Preparar';
  if (nextStatus === 'Pronto') return 'Marcar como pronto';
  if (nextStatus === 'Entregue' || nextStatus === 'Concluído') return 'Finalizar';
  return 'Avançar';
}

export type CentralPrimaryAction =
  | { kind: 'confirm'; label: string }
  | {
      kind: 'patch_orders';
      label: string;
      status: string;
    }
  | {
      kind: 'patch_delivery';
      label: string;
      status: string;
      needsMotoboy: boolean;
    };

export function getCentralPrimaryAction(
  order: Order,
  opts: { segmentFinalStatus: string; columnId: CentralColumnId }
): CentralPrimaryAction | null {
  if (isOrderCanceledLike(order)) return null;
  if (opts.columnId === 'encerrado' || opts.columnId === 'outros') return null;

  const mapped = mapOrderToCentralColumn(order, { segmentFinalStatus: opts.segmentFinalStatus });
  if (mapped === null || mapped === 'outros' || mapped !== opts.columnId) return null;

  const st = String(order.status || '').trim();
  if (st === 'Aguardando confirmação') {
    return { kind: 'confirm', label: 'Confirmar pedido' };
  }

  if (isDeliveryOrder(order)) {
    const next = getDeliveryNextStatus(order.status);
    if (!next) return null;
    return {
      kind: 'patch_delivery',
      status: next,
      label: labelForDeliveryNext(next),
      needsMotoboy: next === 'Saiu para Entrega',
    };
  }

  const next = getNonDeliveryNextStatus(order);
  if (!next) return null;

  return {
    kind: 'patch_orders',
    status: next,
    label: labelForNonDeliveryNext(order.status, next),
  };
}

export async function executeCentralPrimaryAction(input: {
  token: string;
  order: Order;
  action: CentralPrimaryAction;
  motoboyId?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { token, order, action, motoboyId } = input;
  const hdrs: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (action.kind === 'confirm') {
    try {
      const res = await fetch(`/api/orders/${order.id}/confirm`, {
        method: 'POST',
        headers: hdrs,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: data?.error || 'Não foi possível confirmar o pedido.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro de conexão ao confirmar o pedido.' };
    }
  }

  if (action.kind === 'patch_orders') {
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: hdrs,
        body: JSON.stringify({ status: action.status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: data?.error || 'Erro ao atualizar status do pedido.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro de conexão ao atualizar o pedido.' };
    }
  }

  const body: { status: string; motoboy_id?: number } = { status: action.status };
  if (action.needsMotoboy && motoboyId) body.motoboy_id = motoboyId;

  try {
    const res = await fetch(`/api/delivery/pedidos/${order.id}/status`, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error || 'Erro ao atualizar status do delivery.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erro de conexão ao atualizar o pedido.' };
  }
}

export function canCentralConfirmPayment(order: Order): boolean {
  if (!isDeliveryOrder(order)) return false;
  if (isOrderCanceledLike(order)) return false;
  return getPaymentStatus(order) !== 'pago';
}

export function canCentralPrintProof(order: Order): boolean {
  if (isOrderCanceledLike(order)) return true;
  const refundStatus = String(
    (order as { reembolso_status?: string | null }).reembolso_status || ''
  )
    .trim()
    .toLowerCase();
  return refundStatus === 'parcial' || refundStatus === 'total';
}

export function canCentralPrintCupom(_order: Order): boolean {
  return true;
}

export function canCentralOpenMaps(order: Order): boolean {
  return getCustomerAddress(order).length > 0;
}

export function getCentralMapsUrl(order: Order): string | null {
  const address = getCustomerAddress(order);
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function canCentralNotifyCustomer(order: Order): boolean {
  return isDeliveryOrder(order) && getCustomerPhone(order).length > 0;
}

export function getCentralNotifyCustomerUrl(order: Order): string | null {
  const phone = getCustomerPhone(order);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(getNotifyMessage(order))}`;
}

export async function executeCentralConfirmPayment(input: {
  token: string;
  order: Order;
}): Promise<{ ok: boolean; error?: string }> {
  const { token, order } = input;
  if (!canCentralConfirmPayment(order)) {
    return { ok: false, error: 'Pagamento já está confirmado ou não pode ser alterado aqui.' };
  }

  try {
    const res = await fetch(`/api/delivery/pedidos/${order.id}/pagamento`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pagamento_status: 'pago' }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || 'Não foi possível confirmar o pagamento.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erro de conexão ao confirmar o pagamento.' };
  }
}

export async function executeCentralPrintAction(input: {
  token: string;
  order: Order;
  document: 'cupom' | 'comprovante';
}): Promise<{ ok: boolean; error?: string }> {
  const { token, order, document } = input;
  const url =
    document === 'cupom'
      ? `/api/print/cupom-html/${order.id}`
      : `/api/print/comprovante-html/${order.id}`;

  try {
    const html = await fetchPrintableHtml(url, token);
    const win = openPrintPreview(html, 'width=420,height=700,toolbar=0,menubar=0,location=0');
    if (!win) {
      return { ok: false, error: 'Permita popups para abrir a impressão.' };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (document === 'comprovante' && message.includes('(404)')) {
      return { ok: false, error: 'Nenhum comprovante disponível para este pedido.' };
    }
    return {
      ok: false,
      error:
        document === 'cupom'
          ? 'Não foi possível gerar o cupom.'
          : 'Não foi possível gerar o comprovante.',
    };
  }
}
