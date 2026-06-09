import type { Order, OrderItem } from '../types';
import { resolveRequiresPreparation } from './preparation';

type OrderItemLike = OrderItem & {
  product_name?: string | null;
  product_category?: string | null;
  production_type?: string | null;
  requires_preparation?: number | boolean | null;
};

/** Etapas do fluxo operacional (balcão/mesa/retirada) — usado em OrdersScreen e na Central. */
export const ORDER_PIPELINE_STEPS = ['Criado', 'Em Preparo', 'Pronto', 'Entregue'] as const;

/** Mesmo mapa de OrdersScreen — normaliza status para índice no pipeline. */
const STATUS_NORM_OS: Record<string, string> = {
  'Pedido Recebido': 'Criado',
  'Pronto para Entrega': 'Pronto',
  'Saiu para Entrega': 'Pronto',
  Entregue: 'Entregue',
};

export function normalizeStatusForPipeline(s: string) {
  return STATUS_NORM_OS[s] || s;
}

function nextInPipeline(current: string): string | null {
  const norm = normalizeStatusForPipeline(current);
  const idx = ORDER_PIPELINE_STEPS.indexOf(norm as (typeof ORDER_PIPELINE_STEPS)[number]);
  if (idx >= 0 && idx < ORDER_PIPELINE_STEPS.length - 1) return ORDER_PIPELINE_STEPS[idx + 1];
  return null;
}

function orderHasPreparationItems(order: Order): boolean {
  return (order.items || []).some((item) => {
    const it = item as OrderItemLike;
    return resolveRequiresPreparation({
      name: it.name || it.product_name,
      category: it.product_category,
      requires_preparation: it.requires_preparation,
      production_type: it.production_type,
    });
  });
}

/**
 * Próximo status para pedidos que não são delivery — mesma regra que `getNextActionStatus` em OrdersScreen.
 */
export function getNonDeliveryNextStatus(order: Order): string | null {
  const next = nextInPipeline(order.status);
  if (next === null) return null;
  if (next !== 'Em Preparo') return next;
  return orderHasPreparationItems(order) ? next : 'Pronto';
}
