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

type ItemCustomizationSource = OrderItemDetailSource & {
  selecoes?: unknown;
  item_display_summary?: string;
};

export function orderHasAnyItemCustomization(order: { items?: Array<ItemCustomizationSource> }): boolean {
  return Boolean(
    order.items?.some((it) => {
      if (getOrderItemDetailText(it).length > 0) return true;
      const summary = String(it.item_display_summary ?? '').trim();
      if (summary.length > 0) return true;
      const sel = it.selecoes;
      return sel != null && typeof sel === 'object' && !Array.isArray(sel) && Object.keys(sel as object).length > 0;
    })
  );
}
