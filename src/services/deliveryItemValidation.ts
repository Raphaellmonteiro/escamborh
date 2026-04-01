/**
 * Validação server-side de itens de delivery (cardápio online e painel manual).
 * Fonte única de regras compartilhada com `delivery-public` e `delivery`.
 */
import { q1, qAll } from '../db';
import { AppError } from '../utils/errors';
import { validateAuthoritativeComboSelections } from './productComboValidation';

export type DeliverySelections = Record<number, Record<number, number>>;

export function normalizeDeliverySelections(raw: unknown): DeliverySelections {
  if (!raw || typeof raw !== 'object') return {};

  const normalized: DeliverySelections = {};
  for (const [groupIdRaw, itemMap] of Object.entries(raw as Record<string, unknown>)) {
    const groupId = Number(groupIdRaw);
    if (!Number.isInteger(groupId) || groupId <= 0 || !itemMap || typeof itemMap !== 'object') continue;

    const itemSelections: Record<number, number> = {};
    for (const [itemIdRaw, qtyRaw] of Object.entries(itemMap as Record<string, unknown>)) {
      const itemId = Number(itemIdRaw);
      const qty = Number(qtyRaw);
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
      itemSelections[itemId] = Math.floor(qty);
    }

    if (Object.keys(itemSelections).length > 0) {
      normalized[groupId] = itemSelections;
    }
  }

  return normalized;
}

export async function resolveAuthoritativeDeliveryItem(params: {
  tenantId: number;
  productId: number;
  variationId: number | null;
  selecoes?: unknown;
}) {
  const product = await q1<{
    id: number;
    name: string;
    price: number;
    active: number;
    is_combo?: number;
  }>(
    'SELECT id, name, price, active, COALESCE(is_combo,0) AS is_combo FROM produtos WHERE id=? AND tenant_id=? AND active=1',
    [params.productId, params.tenantId]
  );
  if (!product) {
    throw new AppError(`Produto ${params.productId} invalido`, 400);
  }

  if (Number(product.is_combo) === 1) {
    if (params.variationId !== null) {
      throw new AppError(`Combo nao aceita variacao vendavel`, 400);
    }
    const selecoesObj =
      params.selecoes && typeof params.selecoes === 'object' && !Array.isArray(params.selecoes)
        ? (params.selecoes as Record<string, unknown>)
        : {};
    const comboRaw = selecoesObj.combo;
    const comboValidado = await validateAuthoritativeComboSelections({
      tenantId: params.tenantId,
      comboProductId: params.productId,
      rawCombo: comboRaw,
    });
    return {
      priceAtTime: Number(product.price || 0),
      name: product.name,
      selecoes: { combo: comboValidado } as unknown as DeliverySelections,
    };
  }

  if (params.variationId !== null) {
    const variation = await q1<{ id: number; nome: string; preco: number }>(
      `SELECT id, nome, preco
       FROM produto_variacoes_vendaveis
       WHERE id=? AND tenant_id=? AND produto_id=? AND ativo=1`,
      [params.variationId, params.tenantId, params.productId]
    );
    if (!variation) {
      throw new AppError(
        `Variacao ${params.variationId} invalida ou nao pertence ao produto ${params.productId}`,
        400
      );
    }

    return {
      priceAtTime: Number(variation.preco || 0),
      name: `${product.name} - ${variation.nome}`,
      selecoes: {} as DeliverySelections,
    };
  }

  const grupos = await qAll<{
    id: number;
    tipo: 'radio' | 'checkbox' | 'quantidade';
    min_selecoes: number;
    max_selecoes: number;
    obrigatorio: number;
    modo_preco?: 'adicional' | 'final' | null;
  }>(
    `SELECT id, tipo, min_selecoes, max_selecoes, obrigatorio, modo_preco
     FROM produto_grupos_opcao
     WHERE produto_id=? AND tenant_id=? AND ativo=1
     ORDER BY ordem ASC, id ASC`,
    [params.productId, params.tenantId]
  );

  if (!grupos.length) {
    return {
      priceAtTime: Number(product.price || 0),
      name: product.name,
      selecoes: {} as DeliverySelections,
    };
  }

  const selecoes = normalizeDeliverySelections(params.selecoes);
  let substitutoFinal = 0;
  let temGrupoFinalComSelecao = false;
  let somaAdicional = 0;
  const selecoesValidadas: DeliverySelections = {};

  for (const grupo of grupos) {
    const itens = await qAll<{ id: number; preco_adicional: number }>(
      `SELECT id, preco_adicional
       FROM produto_opcao_itens
       WHERE grupo_id=? AND tenant_id=? AND ativo=1
       ORDER BY ordem ASC, id ASC`,
      [grupo.id, params.tenantId]
    );

    const itemIds = new Set(itens.map((item) => Number(item.id)));
    const itemSelections = selecoes[grupo.id] || {};
    const normalizedGroupSelections: Record<number, number> = {};

    for (const [itemIdRaw, qtyRaw] of Object.entries(itemSelections)) {
      const itemId = Number(itemIdRaw);
      const qty = Number(qtyRaw);
      if (!itemIds.has(itemId)) {
        throw new AppError(`Opcao invalida para o produto ${params.productId}`, 400);
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        continue;
      }
      if (grupo.tipo !== 'quantidade' && qty !== 1) {
        throw new AppError(`Quantidade invalida nas opcoes do produto ${params.productId}`, 400);
      }
      normalizedGroupSelections[itemId] = qty;
    }

    const totalSelecionado = Object.values(normalizedGroupSelections).reduce((acc, qty) => acc + qty, 0);
    const minSelecoes = Math.max(0, Number(grupo.min_selecoes || 0));
    const maxSelecoes = Math.max(0, Number(grupo.max_selecoes || 0));

    if (Number(grupo.obrigatorio) === 1 && totalSelecionado < minSelecoes) {
      throw new AppError(`Selecao obrigatoria incompleta para o produto ${params.productId}`, 400);
    }

    if (maxSelecoes > 0 && totalSelecionado > maxSelecoes) {
      throw new AppError(`Selecao acima do limite para o produto ${params.productId}`, 400);
    }

    if (grupo.tipo === 'radio' && totalSelecionado > 1) {
      throw new AppError(`Selecao invalida para o produto ${params.productId}`, 400);
    }

    if (totalSelecionado > 0) {
      selecoesValidadas[grupo.id] = normalizedGroupSelections;
    }

    if ((grupo.modo_preco || 'adicional') === 'final') {
      let grupoSoma = 0;
      let temSelNesteGrupo = false;
      for (const item of itens) {
        const qty = normalizedGroupSelections[item.id] || 0;
        if (qty > 0) {
          temSelNesteGrupo = true;
          grupoSoma += Number(item.preco_adicional || 0) * qty;
        }
      }
      if (temSelNesteGrupo) {
        temGrupoFinalComSelecao = true;
        substitutoFinal += grupoSoma;
      }
    } else {
      for (const item of itens) {
        const qty = normalizedGroupSelections[item.id] || 0;
        if (qty > 0) {
          somaAdicional += Number(item.preco_adicional || 0) * qty;
        }
      }
    }
  }

  const priceAtTime = temGrupoFinalComSelecao
    ? substitutoFinal + somaAdicional
    : Number(product.price || 0) + somaAdicional;

  return {
    priceAtTime,
    name: product.name,
    selecoes: selecoesValidadas,
  };
}

export async function validateDeliveryItems(tenantId: number, items: any[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Pedido sem itens', 400);
  }

  let subtotal = 0;
  const itensValidados: any[] = [];

  for (const item of items) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('Produto invalido', 400);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError(`Quantidade invalida para o produto ${productId}`, 400);
    }

    const vid = Number(item?.variation_id);
    const variation_id = Number.isInteger(vid) && vid > 0 ? vid : null;
    const resolvedItem = await resolveAuthoritativeDeliveryItem({
      tenantId,
      productId,
      variationId: variation_id,
      selecoes: item?.selecoes,
    });

    subtotal += resolvedItem.priceAtTime * quantity;
    itensValidados.push({
      ...item,
      product_id: productId,
      quantity,
      price_at_time: resolvedItem.priceAtTime,
      variation_id,
      name: resolvedItem.name,
      selecoes: resolvedItem.selecoes,
    });
  }

  return { subtotal, itensValidados };
}
