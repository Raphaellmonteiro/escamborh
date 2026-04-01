import type { Order } from '../types';

/** sessionStorage: filtro inicial ao abrir a Central a partir de outras telas (ex.: Delivery). */
export const FLOWPDV_CENTRAL_CHANNEL_FILTER_KEY = 'flowpdv_central_channel_filter';

export type CentralChannelFilter = 'todos' | 'balcao' | 'delivery' | 'retirada';
export type CentralQuickFilter = 'todos' | 'urgentes' | 'pagamento_pendente' | 'qr_pendente' | 'sem_motoboy';

export type CentralColumnId =
  | 'a_confirmar'
  | 'entrada'
  | 'em_preparo'
  | 'pronto'
  | 'rota'
  | 'encerrado'
  | 'outros';

/** Normaliza para comparação (acentos, caixa) — alinhado ao padrão OrdersScreen. */
export function normalizeStatusKey(status?: string | null): string {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Canal lógico para regras do quadro (mesa segue balcão; desconhecido trata como balcão). */
export function getCentralOrderKind(order: Order): 'balcao' | 'delivery' | 'retirada' | 'mesa' | 'other' {
  const c = String(order.canal || '').trim().toLowerCase();
  if (c === 'delivery') return 'delivery';
  if (c === 'retirada') return 'retirada';
  if (c === 'mesa') return 'mesa';
  if (c === 'balcao') return 'balcao';
  return 'other';
}

export function isOrderCanceledLike(order: Order): boolean {
  if (order.cancelado_at) return true;
  return normalizeStatusKey(order.status) === 'cancelado';
}

export function getOrderAgeMinutes(order: Order): number {
  const raw = String(order.created_at || '');
  const t = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

function isFinalStatus(statusRaw: string | undefined | null, segmentFinal: string): boolean {
  const n = normalizeStatusKey(statusRaw);
  if (n === 'entregue' || n === 'concluido') return true;
  const seg = normalizeStatusKey(segmentFinal);
  if (seg && n === seg) return true;
  return false;
}

function inNormalizedSet(statusRaw: string | undefined | null, keys: Set<string>): boolean {
  return keys.has(normalizeStatusKey(statusRaw));
}

/**
 * Pedidos via QR da mesa nascem como `mesa` + `Aguardando confirmação`.
 * Esses pedidos são válidos e aguardam validação humana antes do fluxo normal.
 */
export function isPendingQrMesaOrder(order: Order): boolean {
  const status = normalizeStatusKey(order.status);
  const canal = String(order.canal || '').trim().toLowerCase();
  const tipoRetirada = String(order.tipo_retirada || '').trim().toLowerCase();
  const mesaId = Number((order as { mesa_id?: number | null }).mesa_id || 0);
  const observation = String(order.observation || '');
  const mesaMatch = /mesa\s+\d+/i.test(observation);

  if (status !== 'aguardando confirmacao') return false;
  if (canal === 'mesa') return true;
  if (tipoRetirada === 'mesa' && (mesaId > 0 || mesaMatch)) return true;
  return false;
}

export function isUrgentOrder(order: Order): boolean {
  return getOrderAgeMinutes(order) >= 25;
}

function getPaymentStatusKey(order: Order): string {
  return String(order.pagamento_status || '')
    .trim()
    .toLowerCase();
}

/** Delivery e retirada via app/cardápio: liquidação segue `pagamento_status`, separado do status operacional do pedido. */
function usesRemoteChannelPaymentConfirmation(order: Order): boolean {
  const k = getCentralOrderKind(order);
  return k === 'delivery' || k === 'retirada';
}

function getOrderRecordedPaidAmount(order: Order): number {
  return Number(order.payment_total_paid || 0);
}

function hasRecordedPayments(order: Order): boolean {
  return (
    Number(order.payment_count || 0) > 0 ||
    Number((order as { payment_total_received?: number }).payment_total_received || 0) > 0 ||
    Number((order as { payment_total_change?: number }).payment_total_change || 0) > 0 ||
    getOrderRecordedPaidAmount(order) > 0
  );
}

function getRecordedPaymentCoverageTarget(order: Order): number {
  const kind = getCentralOrderKind(order);
  const subtotal = Number(order.subtotal || 0);
  if ((kind === 'balcao' || kind === 'retirada' || kind === 'other') && subtotal > 0) {
    return subtotal;
  }
  return Number(order.total_amount || 0);
}

export function isOrderFullyPaid(order: Order): boolean {
  if (usesRemoteChannelPaymentConfirmation(order)) {
    return getPaymentStatusKey(order) === 'pago';
  }
  if (getPaymentStatusKey(order) === 'pago') return true;
  if (!hasRecordedPayments(order)) return false;
  return getOrderRecordedPaidAmount(order) + 0.01 >= getRecordedPaymentCoverageTarget(order);
}

export function isPaymentPendingOrder(order: Order): boolean {
  const status = getPaymentStatusKey(order);
  if (usesRemoteChannelPaymentConfirmation(order)) {
    return Boolean(status) && status !== 'pago';
  }
  if (isOrderFullyPaid(order)) return false;
  if (hasRecordedPayments(order)) {
    return getOrderRecordedPaidAmount(order) + 0.01 < getRecordedPaymentCoverageTarget(order);
  }
  return Boolean(status) && status !== 'pago';
}

export function isOrderWithoutAssignedMotoboy(order: Order): boolean {
  const kind = getCentralOrderKind(order);
  if (kind !== 'delivery') return false;
  const status = normalizeStatusKey(order.status);
  const motoboyId = Number((order as { motoboy_id?: number | null }).motoboy_id || 0);
  if (motoboyId > 0) return false;
  return status === 'pronto para entrega' || status === 'pronto' || status === 'saiu para entrega';
}

/** Entrada — balcão, mesa, canal vazio (other). */
const ENTRADA_BALCAO_MESA = new Set(['criado', 'aguardando confirmacao']);
/** Entrada — delivery. */
const ENTRADA_DELIVERY = new Set(['criado', 'pedido recebido', 'aguardando confirmacao']);
/** Entrada — retirada. */
const ENTRADA_RETIRADA = new Set(['criado', 'pedido recebido', 'aguardando confirmacao']);

export type MapCentralColumnOptions = {
  /** Status do segmento (getSegCfg().statusConcluido) — ex.: Entregue, Concluído, Entregue. */
  segmentFinalStatus: string;
};

/**
 * Mapa status → coluna. Cancelados → null (fora do quadro).
 * Status não reconhecido no fluxo do canal → `outros` (sem cair silenciosamente em Entrada).
 */
export function mapOrderToCentralColumn(order: Order, opts: MapCentralColumnOptions): CentralColumnId | null {
  if (isOrderCanceledLike(order)) return null;
  if (isPendingQrMesaOrder(order)) return 'a_confirmar';

  const status = String(order.status || '').trim();
  const n = normalizeStatusKey(status);
  const kind = getCentralOrderKind(order);
  const { segmentFinalStatus } = opts;

  if (kind === 'delivery') {
    if (isFinalStatus(status, segmentFinalStatus)) return 'encerrado';
    if (inNormalizedSet(status, ENTRADA_DELIVERY)) return 'entrada';
    if (n === 'em preparo') return 'em_preparo';
    if (n === 'pronto para entrega' || n === 'pronto') return 'pronto';
    if (n === 'saiu para entrega') return 'rota';
    return 'outros';
  }

  if (kind === 'retirada') {
    if (isFinalStatus(status, segmentFinalStatus)) return 'encerrado';
    if (inNormalizedSet(status, ENTRADA_RETIRADA)) return 'entrada';
    if (n === 'em preparo') return 'em_preparo';
    if (n === 'pronto') return 'pronto';
    return 'outros';
  }

  // balcão, mesa e demais: mesma lógica do balcão
  if (isFinalStatus(status, segmentFinalStatus)) return 'encerrado';
  if (inNormalizedSet(status, ENTRADA_BALCAO_MESA)) return 'entrada';
  if (n === 'em preparo') return 'em_preparo';
  if (n === 'pronto') return 'pronto';
  return 'outros';
}

export function passesCentralChannelFilter(order: Order, filter: CentralChannelFilter): boolean {
  const kind = getCentralOrderKind(order);
  if (filter === 'todos') return true;
  if (filter === 'balcao') return kind === 'balcao' || kind === 'mesa' || kind === 'other';
  if (filter === 'delivery') return kind === 'delivery';
  if (filter === 'retirada') return kind === 'retirada';
  return true;
}

export function passesCentralQuickFilter(order: Order, filter: CentralQuickFilter): boolean {
  if (filter === 'todos') return true;
  if (filter === 'urgentes') return isUrgentOrder(order);
  if (filter === 'pagamento_pendente') return isPaymentPendingOrder(order);
  if (filter === 'qr_pendente') return isPendingQrMesaOrder(order);
  if (filter === 'sem_motoboy') return isOrderWithoutAssignedMotoboy(order);
  return true;
}

function getOrderPriorityScore(order: Order): number {
  let score = getOrderAgeMinutes(order);
  if (isPendingQrMesaOrder(order)) score += 120;
  if (isOrderWithoutAssignedMotoboy(order)) score += 90;
  if (isPaymentPendingOrder(order)) score += 40;
  if (isUrgentOrder(order)) score += 30;
  return score;
}

export function groupOrdersByCentralColumn(
  orders: Order[],
  opts: MapCentralColumnOptions
): Record<CentralColumnId, Order[]> {
  const empty = (): Order[] => [];
  const buckets: Record<CentralColumnId, Order[]> = {
    a_confirmar: empty(),
    entrada: empty(),
    em_preparo: empty(),
    pronto: empty(),
    rota: empty(),
    encerrado: empty(),
    outros: empty(),
  };

  for (const o of orders) {
    const col = mapOrderToCentralColumn(o, opts);
    if (!col) continue;
    buckets[col].push(o);
  }

  (Object.keys(buckets) as CentralColumnId[]).forEach((k) => {
    buckets[k].sort((a, b) => {
      if (k === 'encerrado') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return getOrderPriorityScore(b) - getOrderPriorityScore(a);
    });
  });

  return buckets;
}
