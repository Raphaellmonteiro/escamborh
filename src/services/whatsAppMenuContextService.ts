/**
 * whatsAppMenuContextService.ts — CORRIGIDO
 *
 * Correções aplicadas vs versão anterior:
 *   - "categories"         → "categorias"         (nome real)
 *   - "products"           → "produtos"            (nome real)
 *   - "product_additionals"→ "produto_grupos_opcao" + "produto_opcao_itens" (estrutura real)
 *   - "product_promotions" → removido (tabela não existe; em_promocao/preco_original são colunas)
 *   - "delivery_config"    → "clientes" coluna delivery_config TEXT JSON  (estrutura real)
 *   - "tenants"            → "tenant_pix_config"   (PIX fica em tabela separada)
 *   - categorias.nome      → categorias.nome       (não tem coluna "active", "name")
 *   - produtos.name, .price, .category (TEXT), .active (INTEGER), .descricao
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
  category_name: string;   // categoria como texto (schema usa TEXT, não FK integer)
  available: boolean;
  description?: string;
  additionals?: MenuAdditional[];
  promotions?: MenuPromotion[];
}

export interface MenuCategory {
  id: number;
  name: string;
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

// ─── Schema real dos produtos ────────────────────────────────────────────────
// produtos: id, name, price, category(TEXT), active(INTEGER), descricao,
//           em_promocao(INTEGER), preco_original

async function loadCategories(tenantId: number): Promise<MenuCategory[]> {
  // categorias só tem: id, nome, tenant_id  (sem coluna "active")
  const result = await query<{ id: number; nome: string }>(
    `SELECT id, nome
       FROM categorias
      WHERE tenant_id = $1
      ORDER BY id ASC`,
    [tenantId],
  );
  return result.rows.map((r) => ({ id: r.id, name: r.nome }));
}

async function loadProducts(tenantId: number): Promise<MenuProduct[]> {
  // produtos: active = INTEGER (1/0), não boolean
  // category = TEXT (não FK para categorias — é só string de nome)
  const result = await query<{
    id: number;
    name: string;
    price: number;
    category: string | null;
    active: number;
    descricao: string | null;
    em_promocao: number;
    preco_original: number | null;
  }>(
    `SELECT id, name, price, category, active, descricao, em_promocao, preco_original
       FROM produtos
      WHERE tenant_id = $1
        AND (active IS NULL OR active = 1)
      ORDER BY ordem ASC NULLS LAST, id ASC`,
    [tenantId],
  );

  return result.rows.map((row) => {
    const product: MenuProduct = {
      id:            row.id,
      name:          row.name,
      price:         Number(row.price),
      category_name: row.category ?? 'Sem categoria',
      available:     (row.active ?? 1) === 1,
      description:   row.descricao ?? undefined,
    };

    // Promoção via colunas em_promocao / preco_original
    if (row.em_promocao === 1 && row.preco_original != null && row.preco_original > row.price) {
      const discount = Math.round(((row.preco_original - row.price) / row.preco_original) * 100);
      product.promotions = [{ discount, label: `${discount}% OFF` }];
    }

    return product;
  });
}

async function loadAdditionals(
  tenantId: number,
  productIds: number[],
): Promise<Map<number, MenuAdditional[]>> {
  if (productIds.length === 0) return new Map();

  try {
    // Adicionais ficam em produto_grupos_opcao + produto_opcao_itens
    // Grupos com modo_preco='adicional' e seus itens ativos
    const result = await query<{
      produto_id: number;
      nome: string;
      preco_adicional: number;
    }>(
      `SELECT g.produto_id, i.nome, i.preco_adicional
         FROM produto_grupos_opcao g
         JOIN produto_opcao_itens i ON i.grupo_id = g.id AND i.ativo = 1
        WHERE g.tenant_id = $1
          AND g.produto_id = ANY($2::int[])
          AND g.ativo = 1
        ORDER BY g.produto_id, g.ordem, i.ordem`,
      [tenantId, productIds],
    );

    const map = new Map<number, MenuAdditional[]>();
    for (const row of result.rows) {
      const list = map.get(row.produto_id) ?? [];
      list.push({ name: row.nome, price: Number(row.preco_adicional) });
      map.set(row.produto_id, list);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadDeliveryConfig(tenantId: number): Promise<DeliveryConfig | undefined> {
  // delivery_config é uma coluna TEXT com JSON na tabela clientes
  try {
    const result = await query<{ delivery_config: string | null }>(
      `SELECT delivery_config FROM clientes WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0 || !result.rows[0].delivery_config) return undefined;

    const cfg = JSON.parse(result.rows[0].delivery_config) as Record<string, unknown>;
    return {
      min_order:      cfg.min_order_value  != null ? Number(cfg.min_order_value)  : undefined,
      delivery_fee:   cfg.delivery_fee     != null ? Number(cfg.delivery_fee)     : undefined,
      estimated_time: typeof cfg.estimated_delivery_time === 'string'
        ? cfg.estimated_delivery_time
        : undefined,
    };
  } catch {
    return undefined;
  }
}

async function loadPixInfo(tenantId: number): Promise<PixInfo | undefined> {
  // PIX fica em tenant_pix_config, não em "tenants"
  // provider_config_json contém a chave PIX
  try {
    const result = await query<{
      pix_enabled: number;
      provider_config_json: string | null;
    }>(
      `SELECT pix_enabled, provider_config_json
         FROM tenant_pix_config
        WHERE tenant_id = $1
        LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];
    let pixKey: string | null = null;
    let pixKeyType: string | null = null;

    if (row.provider_config_json) {
      try {
        const cfg = JSON.parse(row.provider_config_json) as Record<string, unknown>;
        pixKey     = typeof cfg.pix_key      === 'string' ? cfg.pix_key      : null;
        pixKeyType = typeof cfg.pix_key_type === 'string' ? cfg.pix_key_type : null;
      } catch { /* JSON malformed — ignore */ }
    }

    return {
      enabled:  row.pix_enabled === 1,
      key:      pixKey,
      key_type: pixKeyType,
    };
  } catch {
    return undefined;
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Monta o contexto completo do cardápio para injeção no prompt da IA.
 * ⚠️ Chamar apenas no servidor — contém chave PIX em texto puro.
 */
export async function loadMenuContextForAI(tenantId: number): Promise<MenuContextForAI> {
  const [categories, rawProducts, deliveryConfig, pixInfo] = await Promise.all([
    loadCategories(tenantId),
    loadProducts(tenantId),
    loadDeliveryConfig(tenantId),
    loadPixInfo(tenantId),
  ]);

  const productIds = rawProducts.map((p) => p.id);
  const additionalsMap = await loadAdditionals(tenantId, productIds);

  const products: MenuProduct[] = rawProducts.map((p) => ({
    ...p,
    additionals: additionalsMap.get(p.id),
  }));

  return {
    categories,
    products,
    pix:             pixInfo,
    delivery_config: deliveryConfig,
  };
}

// ─── Serialização para prompt ─────────────────────────────────────────────────

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

  // Agrupar por categoria (category_name é string)
  const byCat = new Map<string, MenuProduct[]>();
  for (const p of menu.products) {
    const list = byCat.get(p.category_name) ?? [];
    list.push(p);
    byCat.set(p.category_name, list);
  }

  for (const [catName, products] of byCat) {
    lines.push(`\n[${catName}]`);
    for (const p of products) {
      let line = `• ${p.name} — R$${p.price.toFixed(2)}`;
      if (p.description) line += ` (${p.description.slice(0, 80)})`;
      if (p.additionals?.length) {
        line += ` | Add: ${p.additionals.map((a) => `${a.name} +R$${a.price.toFixed(2)}`).join(', ')}`;
      }
      if (p.promotions?.length) {
        line += ` | PROMO: ${p.promotions[0].label}`;
      }
      lines.push(line);
    }
  }

  lines.push('=================');
  return lines.join('\n');
}

export function buildSystemPromptWithMenu(basePrompt: string, menu: MenuContextForAI): string {
  const menuText = serializeMenuContextForPrompt(menu);
  return `${basePrompt}\n\n${menuText}`;
}
