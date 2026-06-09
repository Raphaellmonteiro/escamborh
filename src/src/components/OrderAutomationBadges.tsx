import type { Order } from '../types';
import { StatusChip } from './ui/StatusChip';

export type OrderAutomationBadgeSource = Pick<
  Order,
  'automation_auto_delivery_accept' | 'automation_kitchen_ok' | 'automation_kitchen_failed'
>;

export function orderHasAutomationBadges(order: OrderAutomationBadgeSource) {
  return Boolean(
    order.automation_auto_delivery_accept ||
      order.automation_kitchen_ok ||
      order.automation_kitchen_failed
  );
}

/** Pílulas alinhadas ao painel Delivery — lista Pedidos / Central. */
export function OrderAutomationBadges({
  order,
  compact,
}: {
  order: OrderAutomationBadgeSource;
  compact?: boolean;
}) {
  const a = order.automation_auto_delivery_accept;
  const ok = order.automation_kitchen_ok;
  const fail = order.automation_kitchen_failed;
  if (!a && !ok && !fail) return null;

  const size = compact ? 'sm' : 'md';

  return (
    <>
      {a ? (
        <StatusChip
          variant="info"
          size={size}
          title="Pedido aceito automaticamente pelo cardápio online"
        >
          Auto aceito
        </StatusChip>
      ) : null}
      {ok ? (
        <StatusChip
          variant="success"
          size={size}
          title="Produção enviada à impressora automaticamente (ao menos uma vez)"
        >
          Produção OK
        </StatusChip>
      ) : null}
      {fail ? (
        <StatusChip
          variant="error"
          size={size}
          title="Falha registrada na auto-impressão de produção — verifique impressora ou use impressão manual"
        >
          Produção falhou
        </StatusChip>
      ) : null}
    </>
  );
}
