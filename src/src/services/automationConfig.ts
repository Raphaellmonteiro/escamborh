/**
 * Automação operacional persistida em `clientes.delivery_config` (JSON), bloco `automation`.
 */
export type TenantAutomationConfig = {
  delivery_auto_accept_orders: boolean;
  delivery_auto_print_production: boolean;
  balcao_auto_print_production: boolean;
  mesa_auto_print_production: boolean;
  retirada_auto_print_production: boolean;
  consumo_local_auto_print_production: boolean;
  /** Se false, não dispara impressão automática quando existe pedido KDS operacional na mesa. */
  print_production_even_with_kds: boolean;
};

export const DEFAULT_TENANT_AUTOMATION: TenantAutomationConfig = {
  delivery_auto_accept_orders: false,
  delivery_auto_print_production: false,
  balcao_auto_print_production: false,
  mesa_auto_print_production: false,
  retirada_auto_print_production: false,
  consumo_local_auto_print_production: false,
  print_production_even_with_kds: false,
};

function toBool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(s)) return false;
  return fallback;
}

export function parseAutomationFromUnknown(raw: unknown): TenantAutomationConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TENANT_AUTOMATION };
  const a = raw as Record<string, unknown>;
  return {
    delivery_auto_accept_orders: toBool(a.delivery_auto_accept_orders, DEFAULT_TENANT_AUTOMATION.delivery_auto_accept_orders),
    delivery_auto_print_production: toBool(a.delivery_auto_print_production, DEFAULT_TENANT_AUTOMATION.delivery_auto_print_production),
    balcao_auto_print_production: toBool(a.balcao_auto_print_production, DEFAULT_TENANT_AUTOMATION.balcao_auto_print_production),
    mesa_auto_print_production: toBool(a.mesa_auto_print_production, DEFAULT_TENANT_AUTOMATION.mesa_auto_print_production),
    retirada_auto_print_production: toBool(a.retirada_auto_print_production, DEFAULT_TENANT_AUTOMATION.retirada_auto_print_production),
    consumo_local_auto_print_production: toBool(
      a.consumo_local_auto_print_production,
      DEFAULT_TENANT_AUTOMATION.consumo_local_auto_print_production
    ),
    print_production_even_with_kds: toBool(a.print_production_even_with_kds, DEFAULT_TENANT_AUTOMATION.print_production_even_with_kds),
  };
}

/** Extrai `automation` de um objeto já parseado de `delivery_config`. */
export function parseAutomationFromDeliveryConfigJson(cfg: Record<string, unknown> | null | undefined): TenantAutomationConfig {
  const block = cfg?.automation;
  return parseAutomationFromUnknown(block);
}

export function shouldAutoPrintForBalcaoOrder(
  automation: TenantAutomationConfig,
  canal: string,
  tipoRetirada: string
): boolean {
  const c = String(canal || '').trim().toLowerCase();
  const t = String(tipoRetirada || '').trim().toLowerCase();
  if (c === 'retirada' || t === 'levar') return automation.retirada_auto_print_production;
  if (c === 'balcao' && t === 'local') return automation.consumo_local_auto_print_production;
  if (c === 'balcao') return automation.balcao_auto_print_production;
  return false;
}
