/**
 * Validação de grupos de opção / adicionais de produto (cardápio, delivery, instâncias de combo).
 * Fonte única das regras min/max, radio/checkbox/quantidade.
 */
import { qAll } from '../db';
import { AppError } from '../utils/errors';

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

/**
 * Valida seleções contra `produto_grupos_opcao` / `produto_opcao_itens` do produto.
 * `applyOpcoesPricing: false` ignora preços de opções (só valida seleções).
 * Combo: use `baseProductPrice: 0` e `applyOpcoesPricing: true` para obter só a soma dos adicionais (sem preço de catálogo do componente).
 */
export async function validateProductOpcoesSelections(params: {
  tenantId: number;
  productId: number;
  rawSelecoes: unknown;
  baseProductPrice: number;
  applyOpcoesPricing: boolean;
}): Promise<{ selecoes: DeliverySelections; priceAtTime: number }> {
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
    return { selecoes: {}, priceAtTime: params.baseProductPrice };
  }

  const selecoes = normalizeDeliverySelections(params.rawSelecoes);
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

    if (params.applyOpcoesPricing) {
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
  }

  const priceAtTime = params.applyOpcoesPricing
    ? temGrupoFinalComSelecao
      ? substitutoFinal + somaAdicional
      : Number(params.baseProductPrice || 0) + somaAdicional
    : Number(params.baseProductPrice || 0);

  return { selecoes: selecoesValidadas, priceAtTime };
}
