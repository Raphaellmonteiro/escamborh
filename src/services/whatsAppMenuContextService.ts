/**
 * whatsAppMenuContextService.ts
 * Fase 2 — Serviço que monta o snapshot do cardápio do tenant para ser
 * injetado no system-prompt da IA antes de cada resposta.
 *
 * Consulta: produtos, categorias, adicionais, promoções, config de delivery e PIX.
 * Filtra apenas itens disponíveis (available = true / active = true).
 */

import { query } from '../db';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface MenuAdditional {
  name: string;
  price: number;
}

export interface MenuPromotion {
  discount: number;
  label: string;
}

export interface MenuProduct {
  id: number;
  name: string;
  price: number;
  category_id: number;
  category_name?: string;
  available: boolean;
  description?: string;
  additionals?: MenuAdditional[];
  promotions?: MenuPromotion[];
}

export interface MenuCategory {
  id: number;
  name: string;
  active: boolean;
}

export interface DeliveryConfig {
  min_order?: number;
  delivery_fee?: number;
  estimated_time?: string;
}

export interface PixInfo {
  enabled: boolean;
  key: string | null;
  key_type: string | null;
}

export interface MenuContextForAI {
  categories: MenuCategory[];
  products: MenuProduct[];
  pix?: PixInfo;
  delivery_config?: DeliveryConfig;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function loadCategories(tenantId: number): Promise<MenuCategory[]> {
  const result = await query<{ id: number; name: string; active: boolean }>(
    `SELECT id, name, COALESCE(active, true) AS active
       FROM categories
      WHERE tenant_id = $1
        AND (active IS NULL OR active = true)
      ORDER BY sort_order ASC NULLS LAST, id ASC`,
    [tenantId],
  );
  return result.rows;
}

async function loadProducts(tenantId: number): Promise<MenuProduct[]> {
  const result = await query<{
    id: number;
    name: string;
    price: number;
    category_id: number;
    category_name: string | null;
    available: boolean;
    description: string | null;
  }>(
    `SELECT p.id,
            p.name,
            p.price,
            p.category_id,
            c.name AS category_name,
            COALESCE(p.available, true) AS available,
            p.description
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1
        AND (p.available IS NULL OR p.available = true)
      ORDER BY p.category_id ASC, p.sort_order ASC NULLS LAST, p.id ASC`,
    [tenantId],
  );
  return result.rows.map((row) => ({
    id:            row.id,
    name:          row.name,
    price:         Number(row.price),
    category_id:   row.category_id,
    category_name: row.category_name ?? undefined,
    available:     Boolean(row.available),
    description:   row.description ?? undefined,
  }));
}

async function loadAdditionals(
  tenantId: number,
  productIds: number[],
): Promise<Map<number, MenuAdditional[]>> {
  if (productIds.length === 0) return new Map();

  // Tenta tabela product_additionals; se não existir, retorna vazio silenciosamente.
  try {
    const result = await query<{ product_id: number; name: string; price: number }>(
      `SELECT pa.product_id, pa.name, pa.price
         FROM product_additionals pa
        WHERE pa.product_id = ANY($1::int[])
          AND (pa.available IS NULL OR pa.available = true)
        ORDER BY pa.product_id, pa.sort_order ASC NULLS LAST, pa.id ASC`,
      [productIds],
    );
    const map = new Map<number, MenuAdditional[]>();
    for (const row of result.rows) {
      const list = map.get(row.product_id) ?? [];
      list.push({ name: row.name, price: Number(row.price) });
      map.set(row.product_id, list);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadPromotions(
  tenantId: number,
  productIds: number[],
): Promise<Map<number, MenuPromotion[]>> {
  if (productIds.length === 0) return new Map();

  try {
    const now = new Date().toISOString();
    const result = await query<{ product_id: number; discount: number; label: string | null }>(
      `SELECT pp.product_id, pp.discount, pp.label
         FROM product_promotions pp
        WHERE pp.product_id = ANY($1::int[])
          AND (pp.active IS NULL OR pp.active = true)
          AND (pp.starts_at IS NULL OR pp.starts_at <= $2)
          AND (pp.ends_at IS NULL OR pp.ends_at >= $2)
        ORDER BY pp.product_id, pp.id ASC`,
      [productIds, now],
    );
    const map = new Map<number, MenuPromotion[]>();
    for (const row of result.rows) {
      const list = map.get(row.product_id) ?? [];
      list.push({ discount: Number(row.discount), label: row.label ?? '' });
      map.set(row.product_id, list);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadDeliveryConfig(tenantId: number): Promise<DeliveryConfig | undefined> {
  try {
    const result = await query<{
      min_order_value: number | null;
      delivery_fee: number | null;
      estimated_delivery_time: string | null;
    }>(
      `SELECT min_order_value, delivery_fee, estimated_delivery_time
         FROM delivery_config
        WHERE tenant_id = $1
        LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      min_order:     row.min_order_value != null ? Number(row.min_order_value) : undefined,
      delivery_fee:  row.delivery_fee    != null ? Number(row.delivery_fee)    : undefined,
      estimated_time: row.estimated_delivery_time ?? undefined,
    };
  } catch {
    return undefined;
  }
}

async function loadPixInfo(tenantId: number): Promise<PixInfo | undefined> {
  try {
    const result = await query<{
      pix_enabled: boolean | null;
      pix_key: string | null;
      pix_key_type: string | null;
    }>(
      `SELECT pix_enabled, pix_key, pix_key_type
         FROM tenants
        WHERE id = $1
        LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      enabled:  Boolean(row.pix_enabled),
      key:      row.pix_key ?? null,
      key_type: row.pix_key_type ?? null,
    };
  } catch {
    // Colunas podem não existir ainda — retorna vazio sem quebrar
    return undefined;
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Monta o contexto completo do cardápio para injeção no prompt da IA.
 *
 * ⚠️ ATENÇÃO DE SEGURANÇA: a chave PIX nunca deve ser enviada ao frontend —
 * este serviço só deve ser chamado no servidor.
 */
export async function loadMenuContextForAI(tenantId: number): Promise<MenuContextForAI> {
  const [categories, rawProducts, deliveryConfig, pixInfo] = await Promise.all([
    loadCategories(tenantId),
    loadProducts(tenantId),
    loadDeliveryConfig(tenantId),
    loadPixInfo(tenantId),
  ]);

  const productIds = rawProducts.map((p) => p.id);
  const [additionalsMap, promotionsMap] = await Promise.all([
    loadAdditionals(tenantId, productIds),
    loadPromotions(tenantId, productIds),
  ]);

  const products: MenuProduct[] = rawProducts.map((p) => ({
    ...p,
    additionals: additionalsMap.get(p.id),
    promotions:  promotionsMap.get(p.id),
  }));

  return {
    categories,
    products,
    pix:            pixInfo,
    delivery_config: deliveryConfig,
  };
}

// ─── Serialização para prompt ─────────────────────────────────────────────────

/**
 * Serializa o contexto do cardápio como texto compacto para ser inserido no system prompt.
 * Mantém o prompt o mais curto possível para economizar tokens.
 */
export function serializeMenuContextForPrompt(menu: MenuContextForAI): string {
  const lines: string[] = ['=== CARDÁPIO ==='];

  if (menu.delivery_config) {
    const d = menu.delivery_config;
    const parts: string[] = [];
    if (d.min_order    != null) parts.push(`Mínimo: R$${d.min_order.toFixed(2)}`);
    if (d.delivery_fee != null) parts.push(`Entrega: R$${d.delivery_fee.toFixed(2)}`);
    if (d.estimated_time)       parts.push(`Tempo: ${d.estimated_time}`);
    if (parts.length) lines.push('Entrega → ' + parts.join(' | '));
  }

  if (menu.pix?.enabled && menu.pix.key) {
    lines.push(`PIX: chave ${menu.pix.key_type ?? ''} = ${menu.pix.key}`);
  }

  // Índice de categorias
  const catMap = new Map(menu.categories.map((c) => [c.id, c.name]));

  // Produtos por categoria
  const byCat = new Map<number, MenuProduct[]>();
  for (const p of menu.products) {
    const list = byCat.get(p.category_id) ?? [];
    list.push(p);
    byCat.set(p.category_id, list);
  }

  for (const [catId, products] of byCat) {
    lines.push(`\n[${catMap.get(catId) ?? 'Sem categoria'}]`);
    for (const p of products) {
      let line = `• ${p.name} — R$${p.price.toFixed(2)}`;
      if (p.description) line += ` (${p.description.slice(0, 80)})`;
      if (p.additionals?.length) {
        line += ` | Add: ${p.additionals.map((a) => `${a.name} +R$${a.price.toFixed(2)}`).join(', ')}`;
      }
      if (p.promotions?.length) {
        line += ` | PROMO: ${p.promotions[0].label || `-${p.promotions[0].discount}%`}`;
      }
      lines.push(line);
    }
  }

  lines.push('=================');
  return lines.join('\n');
}

/**
 * Constrói o system prompt final combinando o prompt base do tenant com o cardápio.
 */
export function buildSystemPromptWithMenu(basePrompt: string, menu: MenuContextForAI): string {
  const menuText = serializeMenuContextForPrompt(menu);
  return `${basePrompt}\n\n${menuText}`;
}
