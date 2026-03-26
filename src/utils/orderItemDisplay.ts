/** Texto salvo por item (cardápio usa `obs_opcoes`; API também expõe `observation`). */
export type OrderItemDetailSource = {
  observation?: string | null;
  obs_opcoes?: string | null;
};

export function getOrderItemDetailText(item: OrderItemDetailSource): string {
  const raw = item.observation ?? item.obs_opcoes;
  return String(raw ?? '').trim();
}

/** Cardápio junta opções e observação com ` | `. */
export function splitOrderItemDetailLines(detail: string): string[] {
  if (!detail) return [];
  const parts = detail.split(/\s*\|\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [detail];
}

export function orderHasAnyItemCustomization(order: { items?: Array<OrderItemDetailSource> }): boolean {
  return Boolean(order.items?.some((it) => getOrderItemDetailText(it).length > 0));
}
