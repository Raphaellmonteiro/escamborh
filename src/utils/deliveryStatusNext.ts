/**
 * Próximo status no fluxo delivery — mesma regra do painel Delivery (STATUS_CFG.next).
 * Fonte única para DeliveryScreen e Central de Pedidos.
 */
const DELIVERY_NEXT: Record<string, string | undefined> = {
  Criado: 'Em Preparo',
  'Pedido Recebido': 'Em Preparo',
  'Em Preparo': 'Pronto para Entrega',
  'Pronto para Entrega': 'Saiu para Entrega',
  'Saiu para Entrega': 'Entregue',
  Entregue: undefined,
  Cancelado: undefined,
};

export function getDeliveryNextStatus(statusRaw: string | undefined | null): string | undefined {
  const s = String(statusRaw || '').trim();
  const direct = DELIVERY_NEXT[s];
  if (direct !== undefined) return direct;
  // Alguns pedidos delivery podem aparecer como "Pronto" — alinhar ao passo antes de "Saiu para Entrega"
  if (s === 'Pronto') return 'Saiu para Entrega';
  return undefined;
}
