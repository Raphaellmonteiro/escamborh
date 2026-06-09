/**
 * Validação server-side de itens de delivery (cardápio online e painel manual).
 * Fonte única de regras compartilhada com `delivery-public` e `delivery`.
 */
import { q1 } from '../db';
import { AppError } from '../utils/errors';
import { validateAuthoritativeComboSelections } from './productComboValidation';
import {
  normalizeDeliverySelections,
  validateProductOpcoesSelections,
  type DeliverySelections,
} from './productOpcoesValidation';

export type { DeliverySelections };
export { normalizeDeliverySelections };

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
    const { validado: comboValidado, adicionaisTotal } = await validateAuthoritativeComboSelections({
      tenantId: params.tenantId,
      comboProductId: params.productId,
      rawCombo: comboRaw,
    });
    return {
      priceAtTime: Number(product.price || 0) + Number(adicionaisTotal || 0),
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

  const { selecoes: selecoesValidadas, priceAtTime } = await validateProductOpcoesSelections({
    tenantId: params.tenantId,
    productId: params.productId,
    rawSelecoes: params.selecoes,
    baseProductPrice: Number(product.price || 0),
    applyOpcoesPricing: true,
  });

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
