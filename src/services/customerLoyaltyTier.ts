/**
 * Classificação simples de fidelização por volume de pedidos válidos (não cancelados).
 * Único ponto de regra para tiers — ajuste thresholds aqui.
 */
export type CustomerLoyaltyTier = 'novo' | 'recorrente' | 'vip';

const TIER_LABELS: Record<CustomerLoyaltyTier, string> = {
  novo: 'Cliente novo',
  recorrente: 'Cliente recorrente',
  vip: 'Cliente VIP',
};

/** Pedidos válidos: 1–2 novo, 3–9 recorrente, 10+ vip. Com 0 pedidos válidos, tier novo. */
export function getCustomerLoyaltyTier(totalPedidosValidos: number): {
  tier: CustomerLoyaltyTier;
  label: string;
} {
  const n = Math.max(0, Math.floor(Number(totalPedidosValidos) || 0));
  if (n >= 10) return { tier: 'vip', label: TIER_LABELS.vip };
  if (n >= 3) return { tier: 'recorrente', label: TIER_LABELS.recorrente };
  return { tier: 'novo', label: TIER_LABELS.novo };
}
