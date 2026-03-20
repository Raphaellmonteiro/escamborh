import type { PoolClient } from 'pg';
import { txInsert, txQ1, txQAll, txRun } from '../db';
import { AppError } from '../utils/errors';
import { normalizeBarcode } from '../utils/barcode';
import { generatePublicId } from '../utils/publicIds';

type Queryable = Pick<PoolClient, 'query'>;
type TenantId = number | string;

type ProductIdentityRow = {
  id: number;
  name: string;
  codigo_barras?: string | null;
};

type ProductIngredientRow = {
  ingrediente_id: number | string;
  quantidade_usada: number | string | null;
};

type IngredientIdRow = {
  id: number;
};

type SchemaCapabilities = {
  productPublicId: boolean;
  ingredientPublicId: boolean;
};

type PendingInventoryRawRow = {
  product_id: number | string;
  product_public_id?: string | null;
  product_name: string;
  product_active: number | boolean | null;
  product_category?: string | null;
  product_barcode?: string | null;
  total_order_usages?: number | string | null;
  last_order_at?: string | null;
  barcode_match_count?: number | string | null;
  ingredient_id?: number | string | null;
  ingredient_public_id?: string | null;
  ingredient_name?: string | null;
  ingredient_barcode?: string | null;
  ingredient_unit?: string | null;
  ingredient_stock?: number | string | null;
  ingredient_barcode_unique?: number | boolean | null;
};

export type ProductInventoryResolutionMode =
  | 'recipe'
  | 'barcode_exact'
  | 'unresolved';

export type ResolvedIngredientTarget = {
  ingredientId: number;
  quantityMultiplier: number;
  mode: ProductInventoryResolutionMode;
};

export type ResolvedProductInventory = {
  product: ProductIdentityRow;
  targets: ResolvedIngredientTarget[];
};

export type PendingInventoryIngredientCandidate = {
  ingredientId: number;
  ingredientPublicId?: string | null;
  ingredientName: string;
  ingredientBarcode?: string | null;
  ingredientUnit?: string | null;
  ingredientStock: number;
  ingredientBarcodeUnique: boolean;
};

export type PendingInventoryClassification =
  | 'safe_barcode_alignment'
  | 'safe_recipe_explicit'
  | 'ambiguous_exact_name'
  | 'unmatched_manual_review';

export type PendingInventorySafeAction =
  | 'align_product_barcode'
  | 'create_explicit_recipe';

export type PendingInventoryManualAction =
  | 'create_missing_ingredient_recipe';

export type PendingInventoryReportItem = {
  resolutionMode: 'unresolved';
  usesLegacyNameFallback: boolean;
  productId: number;
  productPublicId?: string | null;
  productName: string;
  productActive: boolean;
  productCategory?: string | null;
  productBarcode?: string | null;
  totalOrderUsages: number;
  lastOrderAt?: string | null;
  exactNameMatchCount: number;
  ambiguousNameMatch: boolean;
  ingredientId?: number | null;
  ingredientPublicId?: string | null;
  ingredientName?: string | null;
  ingredientBarcode?: string | null;
  ingredientUnit?: string | null;
  ingredientStock: number;
  candidateIngredients: PendingInventoryIngredientCandidate[];
  classification: PendingInventoryClassification;
  isPreparedProduct: boolean;
  safeFixAction?: PendingInventorySafeAction | null;
  safeFixLabel?: string | null;
  safeFixReason?: string | null;
  manualFixAction?: PendingInventoryManualAction | null;
  manualFixLabel?: string | null;
  manualFixReason?: string | null;
  suggestedFix: string;
};

export type PendingInventoryAuditReport = {
  generatedAt: string;
  summary: {
    totalPendingProducts: number;
    activePendingProducts: number;
    inactivePendingProducts: number;
    legacyFallbackProducts: number;
    ambiguousPendingProducts: number;
    singleMatchPendingProducts: number;
    unmatchedPendingProducts: number;
    safeBarcodeCandidates: number;
    safeRecipeCandidates: number;
    safeFixCandidates: number;
    manualPhaseOneCandidates: number;
  };
  items: PendingInventoryReportItem[];
};

export type ApplyPendingInventoryFixesResult = {
  success: true;
  appliedCount: number;
  recipeFixes: number;
  barcodeFixes: number;
  skippedCount: number;
  appliedProductIds: number[];
  report: PendingInventoryAuditReport;
};

export type ApplyManualPendingInventoryFixesResult = {
  success: true;
  appliedCount: number;
  createdIngredients: number;
  createdRecipes: number;
  skippedCount: number;
  appliedProductIds: number[];
  report: PendingInventoryAuditReport;
};

export type LegacyFallbackPendingProduct = PendingInventoryReportItem;
export type LegacyFallbackAuditReport = PendingInventoryAuditReport;

const PREPARED_PRODUCT_KEYWORDS = [
  'burg',
  'hamburg',
  'x-',
  'xtudo',
  'combo',
  'pizza',
  'lanche',
  'sandu',
  'pastel',
  'marmita',
  'prato',
  'porcao',
  'porção',
  'refeicao',
  'refeição',
  'espeto',
  'acai',
  'açaí',
  'sobremesa',
  'batata',
  'churrasco',
  'dog',
  'hot dog',
];

const RESALE_KEYWORDS = [
  'cerveja',
  'refrigerante',
  'refri',
  'suco',
  'agua',
  'água',
  'energetico',
  'energético',
  'whisky',
  'vinho',
  'vodka',
  'gin',
  'licor',
  'bebida',
  'lata',
  'garrafa',
  'long neck',
  'pet',
  'dose',
  'chopp',
  'combo lata',
  'combo garrafa',
];

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferPreparedProduct(productName: string, productCategory?: string | null) {
  const text = `${normalizeText(productName)} ${normalizeText(productCategory)}`;
  return PREPARED_PRODUCT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function inferResaleOneToOne(
  item: Pick<
    PendingInventoryReportItem,
    'productName' | 'productCategory' | 'productBarcode'
  >,
  candidate: PendingInventoryIngredientCandidate
) {
  if (!candidate.ingredientBarcode || !candidate.ingredientBarcodeUnique) {
    return false;
  }

  if (normalizeBarcode(item.productBarcode)) {
    return false;
  }

  const text = `${normalizeText(item.productName)} ${normalizeText(item.productCategory)}`;
  return RESALE_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)));
}

async function getSchemaCapabilities(client: Queryable) {
  const rows = await txQAll<{ table_name: string; column_name: string }>(
    client,
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema='public'
       AND (
         (table_name='produtos' AND column_name='public_id')
         OR (table_name='ingredientes' AND column_name='public_id')
       )`
  );

  return {
    productPublicId: rows.some(
      (row) => row.table_name === 'produtos' && row.column_name === 'public_id'
    ),
    ingredientPublicId: rows.some(
      (row) => row.table_name === 'ingredientes' && row.column_name === 'public_id'
    ),
  } satisfies SchemaCapabilities;
}

function classifyPendingInventoryItem(item: PendingInventoryReportItem) {
  if (item.exactNameMatchCount <= 0) {
    const canCreateManualDedicatedRecipe =
      item.productActive && item.isPreparedProduct && item.totalOrderUsages > 0;

    return {
      classification: 'unmatched_manual_review' as const,
      safeFixAction: null,
      safeFixLabel: null,
      safeFixReason: null,
      manualFixAction: canCreateManualDedicatedRecipe
        ? ('create_missing_ingredient_recipe' as const)
        : null,
      manualFixLabel: canCreateManualDedicatedRecipe
        ? 'Criar ingrediente + ficha 1:1'
        : null,
      manualFixReason: canCreateManualDedicatedRecipe
        ? 'Produto preparado ativo e com uso real. Criar um ingrediente dedicado e uma ficha 1:1 e a forma mais segura de explicitar o vinculo sem adivinhar barcode ou reaproveitar estoque errado.'
        : null,
      suggestedFix: canCreateManualDedicatedRecipe
        ? 'Fase manual segura: criar um ingrediente dedicado com o nome do produto e vincular uma ficha tecnica 1:1. Mantem o fallback por nome ativo por compatibilidade, mas tira este item da pendencia sem guess de barcode.'
        : 'Sem match exato por nome. So alinhe barcode quando existir um ingrediente/SKU correto e unico; fora disso, mantenha em revisao manual.',
    };
  }

  if (item.exactNameMatchCount > 1) {
    return {
      classification: 'ambiguous_exact_name' as const,
      safeFixAction: null,
      safeFixLabel: null,
      safeFixReason: null,
      manualFixAction: null,
      manualFixLabel: null,
      manualFixReason: null,
      suggestedFix:
        'Ha mais de um ingrediente com o mesmo nome. A alternativa mais segura e criar um ingrediente dedicado e um vinculo explicito 1:1 em fase posterior, sem escolher um dos matches atuais no escuro; a duplicidade e o saldo devem ser revisados manualmente depois.',
    };
  }

  const candidate = item.candidateIngredients[0];
  const isPreparedProduct = inferPreparedProduct(item.productName, item.productCategory);
  const isSafeBarcodeAlignment = inferResaleOneToOne(item, candidate);

  if (isSafeBarcodeAlignment) {
    return {
      classification: 'safe_barcode_alignment' as const,
      safeFixAction: 'align_product_barcode' as const,
      safeFixLabel: 'Alinhar barcode',
      safeFixReason:
        'Match unico por nome com barcode unico no ingrediente e sem sinais de preparo composto.',
      manualFixAction: null,
      manualFixLabel: null,
      manualFixReason: null,
      suggestedFix:
        'Caso 1:1 de baixo risco. Alinhar o codigo de barras do produto com o do ingrediente para sair do fallback por nome.',
    };
  }

  return {
    classification: 'safe_recipe_explicit' as const,
    safeFixAction: 'create_explicit_recipe' as const,
    safeFixLabel: isPreparedProduct ? 'Criar ficha 1:1' : 'Explicitar vinculo',
    safeFixReason: isPreparedProduct
      ? 'Produto com cara de preparo; materializar o vinculo atual em ficha tecnica 1:1 preserva a baixa de hoje.'
      : 'Match unico por nome; transformar o fallback atual em ficha tecnica explicita mantem o comportamento de forma segura.',
    manualFixAction: null,
    manualFixLabel: null,
    manualFixReason: null,
    suggestedFix: isPreparedProduct
      ? 'Produto preparado com match unico por nome. Na fase 1, criar ficha tecnica 1:1 preserva a baixa atual e remove a dependencia do fallback.'
      : 'Criar ficha tecnica explicita 1:1 agora. Se depois confirmar que o item e revenda unitária, o proximo passo pode ser alinhar o barcode.',
  };
}

function mapPendingInventoryRows(rows: PendingInventoryRawRow[]) {
  const grouped = new Map<number, PendingInventoryReportItem>();

  for (const row of rows) {
    const productId = Number(row.product_id);
    const existing = grouped.get(productId);

    if (!existing) {
      grouped.set(productId, {
        resolutionMode:
          Number(row.barcode_match_count || 0) > 0 ? 'unresolved' : 'unresolved',
        usesLegacyNameFallback: false,
        productId,
        productPublicId: row.product_public_id || null,
        productName: row.product_name,
        productActive: Boolean(Number(row.product_active || 0)),
        productCategory: row.product_category || null,
        productBarcode: row.product_barcode || null,
        totalOrderUsages: Number(row.total_order_usages || 0),
        lastOrderAt: row.last_order_at || null,
        exactNameMatchCount: 0,
        ambiguousNameMatch: false,
        ingredientId: null,
        ingredientPublicId: null,
        ingredientName: null,
        ingredientBarcode: null,
        ingredientUnit: null,
        ingredientStock: 0,
        candidateIngredients: [],
        classification: 'unmatched_manual_review',
        isPreparedProduct: inferPreparedProduct(row.product_name, row.product_category),
        safeFixAction: null,
        safeFixLabel: null,
        safeFixReason: null,
        manualFixAction: null,
        manualFixLabel: null,
        manualFixReason: null,
        suggestedFix: '',
      });
    }

    const item = grouped.get(productId)!;

    if (row.ingredient_id !== null && row.ingredient_id !== undefined) {
      item.candidateIngredients.push({
        ingredientId: Number(row.ingredient_id),
        ingredientPublicId: row.ingredient_public_id || null,
        ingredientName: row.ingredient_name || '',
        ingredientBarcode: row.ingredient_barcode || null,
        ingredientUnit: row.ingredient_unit || null,
        ingredientStock: Number(row.ingredient_stock || 0),
        ingredientBarcodeUnique: Boolean(Number(row.ingredient_barcode_unique || 0)),
      });
    }
  }

  const items = [...grouped.values()].map((item) => {
    item.exactNameMatchCount = item.candidateIngredients.length;
    item.ambiguousNameMatch = item.exactNameMatchCount > 1;
    item.usesLegacyNameFallback = false;
    item.resolutionMode = 'unresolved';

    const primaryCandidate = item.candidateIngredients[0];
    if (primaryCandidate) {
      item.ingredientId = primaryCandidate.ingredientId;
      item.ingredientPublicId = primaryCandidate.ingredientPublicId || null;
      item.ingredientName = primaryCandidate.ingredientName;
      item.ingredientBarcode = primaryCandidate.ingredientBarcode || null;
      item.ingredientUnit = primaryCandidate.ingredientUnit || null;
      item.ingredientStock = primaryCandidate.ingredientStock;
    }

    const classification = classifyPendingInventoryItem(item);
    item.classification = classification.classification;
    item.safeFixAction = classification.safeFixAction;
    item.safeFixLabel = classification.safeFixLabel;
    item.safeFixReason = classification.safeFixReason;
    item.manualFixAction = classification.manualFixAction;
    item.manualFixLabel = classification.manualFixLabel;
    item.manualFixReason = classification.manualFixReason;
    item.suggestedFix = classification.suggestedFix;
    item.isPreparedProduct = inferPreparedProduct(item.productName, item.productCategory);

    return item;
  });

  items.sort((a, b) => {
    if (Number(b.productActive) !== Number(a.productActive)) {
      return Number(b.productActive) - Number(a.productActive);
    }

    if (Number(Boolean(b.safeFixAction)) !== Number(Boolean(a.safeFixAction))) {
      return Number(Boolean(b.safeFixAction)) - Number(Boolean(a.safeFixAction));
    }

    if (b.totalOrderUsages !== a.totalOrderUsages) {
      return b.totalOrderUsages - a.totalOrderUsages;
    }

    return a.productName.localeCompare(b.productName, 'pt-BR');
  });

  return items;
}

export async function resolveProductInventoryTargets(input: {
  client: Queryable;
  tenantId: TenantId;
  productId: number;
}) {
  const product = await txQ1<ProductIdentityRow>(
    input.client,
    'SELECT id, name, codigo_barras FROM produtos WHERE id=? AND tenant_id=?',
    [input.productId, input.tenantId]
  );

  if (!product) {
    return null;
  }

  const links = await txQAll<ProductIngredientRow>(
    input.client,
    'SELECT ingrediente_id, quantidade_usada FROM produto_ingrediente WHERE product_id=? AND tenant_id=?',
    [input.productId, input.tenantId]
  );

  if (links.length > 0) {
    return {
      product,
      targets: links.map((link) => ({
        ingredientId: Number(link.ingrediente_id),
        quantityMultiplier: Number(link.quantidade_usada || 0),
        mode: 'recipe' as const,
      })),
    } satisfies ResolvedProductInventory;
  }

  const normalizedBarcode = normalizeBarcode(product.codigo_barras);

  if (normalizedBarcode) {
    const ingredient = await txQ1<IngredientIdRow>(
      input.client,
      `SELECT id
       FROM ingredientes
       WHERE tenant_id=?
         AND codigo_barras IS NOT NULL
         AND UPPER(REGEXP_REPLACE(codigo_barras, '\\s+', '', 'g'))=?
       ORDER BY id ASC
       LIMIT 1`,
      [input.tenantId, normalizedBarcode]
    );

    if (ingredient) {
      return {
        product,
        targets: [
          {
            ingredientId: Number(ingredient.id),
            quantityMultiplier: 1,
            mode: 'barcode_exact',
          },
        ],
      } satisfies ResolvedProductInventory;
    }
  }

  return {
    product,
    targets: [],
  } satisfies ResolvedProductInventory;
}

export async function requireProductInventoryTargets(input: {
  client: Queryable;
  tenantId: TenantId;
  productId: number;
  context: string;
  orderId?: number | string | bigint | null;
  direction?: 'saida' | 'entrada' | null;
}) {
  const resolution = await resolveProductInventoryTargets({
    client: input.client,
    tenantId: input.tenantId,
    productId: input.productId,
  });

  if (!resolution) {
    throw new AppError(`Produto ${input.productId} nao encontrado`, 404, 'PRODUCT_NOT_FOUND');
  }

  if (resolution.targets.length > 0) {
    return resolution;
  }

  const operationLabel = input.direction
    ? input.direction === 'saida'
      ? 'baixa'
      : 'estorno'
    : 'movimentacao';
  const orderSuffix = input.orderId ? ` Pedido ${input.orderId}.` : '';

  throw new AppError(
    `Produto "${resolution.product.name}" sem vinculo valido de estoque. Cadastre ficha tecnica ou barcode exato antes da ${operationLabel}.${orderSuffix}`,
    409,
    'PRODUCT_INVENTORY_LINK_REQUIRED'
  );
}

export async function auditPendingInventoryProducts(input: {
  client: Queryable;
  tenantId: TenantId;
  onlyActive?: boolean;
}) {
  const capabilities = await getSchemaCapabilities(input.client);
  const activeFilter = input.onlyActive ? ' AND p.active=1' : '';
  const productPublicIdSelect = capabilities.productPublicId
    ? 'p.public_id AS product_public_id,'
    : 'NULL::text AS product_public_id,';
  const ingredientPublicIdSelect = capabilities.ingredientPublicId
    ? 'i.public_id AS ingredient_public_id,'
    : 'NULL::text AS ingredient_public_id,';

  const rows = await txQAll<PendingInventoryRawRow>(
    input.client,
    `WITH candidate_products AS (
       SELECT
         p.tenant_id,
         p.id AS product_id,
         ${productPublicIdSelect}
         p.name AS product_name,
         p.active AS product_active,
         p.category AS product_category,
         p.codigo_barras AS product_barcode,
         COALESCE(sales.total_order_usages, 0) AS total_order_usages,
         sales.last_order_at
       FROM produtos p
       LEFT JOIN LATERAL (
         SELECT
           COUNT(DISTINCT ip.order_id)::int AS total_order_usages,
           MAX(pe.created_at) AS last_order_at
         FROM itens_pedido ip
         JOIN pedidos pe
           ON pe.id = ip.order_id
          AND pe.tenant_id = ip.tenant_id
         WHERE ip.product_id = p.id
           AND ip.tenant_id = p.tenant_id
       ) sales ON TRUE
       WHERE p.tenant_id=?
         AND NOT EXISTS (
           SELECT 1
           FROM produto_ingrediente pi
           WHERE pi.product_id = p.id
             AND pi.tenant_id = p.tenant_id
         )
         ${activeFilter}
     ),
     barcode_resolution AS (
       SELECT
         c.product_id,
         COUNT(i.id)::int AS barcode_match_count
       FROM candidate_products c
       LEFT JOIN ingredientes i
         ON i.tenant_id = c.tenant_id
        AND COALESCE(UPPER(REGEXP_REPLACE(BTRIM(c.product_barcode), '\\s+', '', 'g')), '') <> ''
        AND UPPER(REGEXP_REPLACE(BTRIM(i.codigo_barras), '\\s+', '', 'g')) =
            UPPER(REGEXP_REPLACE(BTRIM(c.product_barcode), '\\s+', '', 'g'))
       GROUP BY c.product_id
     )
     SELECT
       c.product_id,
       c.product_public_id,
       c.product_name,
       c.product_active,
       c.product_category,
       c.product_barcode,
       c.total_order_usages,
       c.last_order_at,
       COALESCE(b.barcode_match_count, 0) AS barcode_match_count,
       i.id AS ingredient_id,
       ${ingredientPublicIdSelect}
       i.nome AS ingredient_name,
       i.codigo_barras AS ingredient_barcode,
       i.unidade AS ingredient_unit,
       COALESCE(i.estoque_atual, 0) AS ingredient_stock,
       CASE
         WHEN COALESCE(UPPER(REGEXP_REPLACE(BTRIM(i.codigo_barras), '\\s+', '', 'g')), '') = '' THEN 0
         WHEN EXISTS (
           SELECT 1
           FROM ingredientes i2
           WHERE i2.tenant_id = i.tenant_id
             AND i2.id <> i.id
             AND UPPER(REGEXP_REPLACE(BTRIM(i2.codigo_barras), '\\s+', '', 'g')) =
                 UPPER(REGEXP_REPLACE(BTRIM(i.codigo_barras), '\\s+', '', 'g'))
         ) THEN 0
         ELSE 1
       END AS ingredient_barcode_unique
     FROM candidate_products c
     JOIN barcode_resolution b
       ON b.product_id = c.product_id
     LEFT JOIN ingredientes i
       ON i.tenant_id = c.tenant_id
      AND LOWER(BTRIM(i.nome)) = LOWER(BTRIM(c.product_name))
     WHERE COALESCE(b.barcode_match_count, 0) = 0
     ORDER BY
       CASE WHEN c.product_active=1 THEN 0 ELSE 1 END,
       c.total_order_usages DESC,
       c.product_name ASC,
       i.id ASC`,
    [input.tenantId]
  );

  const items = mapPendingInventoryRows(rows);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPendingProducts: items.length,
      activePendingProducts: items.filter((item) => item.productActive).length,
      inactivePendingProducts: items.filter((item) => !item.productActive).length,
      legacyFallbackProducts: items.filter((item) => item.usesLegacyNameFallback).length,
      ambiguousPendingProducts: items.filter((item) => item.ambiguousNameMatch).length,
      singleMatchPendingProducts: items.filter((item) => item.exactNameMatchCount === 1).length,
      unmatchedPendingProducts: items.filter((item) => item.exactNameMatchCount === 0).length,
      safeBarcodeCandidates: items.filter(
        (item) => item.safeFixAction === 'align_product_barcode'
      ).length,
      safeRecipeCandidates: items.filter(
        (item) => item.safeFixAction === 'create_explicit_recipe'
      ).length,
      safeFixCandidates: items.filter((item) => Boolean(item.safeFixAction)).length,
      manualPhaseOneCandidates: items.filter((item) => Boolean(item.manualFixAction)).length,
    },
    items,
  } satisfies PendingInventoryAuditReport;
}

export async function applySafePendingInventoryFixes(input: {
  client: Queryable;
  tenantId: TenantId;
  onlyActive?: boolean;
  productIds?: number[];
}) {
  const report = await auditPendingInventoryProducts({
    client: input.client,
    tenantId: input.tenantId,
    onlyActive: input.onlyActive,
  });

  const requestedIds = new Set(
    (input.productIds || [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  const selectedItems = report.items.filter((item) => {
    if (!item.safeFixAction) {
      return false;
    }

    if (requestedIds.size === 0) {
      return true;
    }

    return requestedIds.has(item.productId);
  });

  let recipeFixes = 0;
  let barcodeFixes = 0;
  let skippedCount = 0;
  const appliedProductIds: number[] = [];

  for (const item of selectedItems) {
    const candidate = item.candidateIngredients[0];

    if (!candidate) {
      skippedCount += 1;
      continue;
    }

    if (item.safeFixAction === 'create_explicit_recipe') {
      const existingRecipe = await txQ1<{ id: number }>(
        input.client,
        'SELECT id FROM produto_ingrediente WHERE product_id=? AND tenant_id=? LIMIT 1',
        [item.productId, input.tenantId]
      );

      if (existingRecipe) {
        skippedCount += 1;
        continue;
      }

      await txRun(
        input.client,
        `INSERT INTO produto_ingrediente
          (product_id,ingrediente_id,quantidade_usada,tenant_id,unidade)
         VALUES (?,?,?,?,?)`,
        [
          item.productId,
          candidate.ingredientId,
          1,
          input.tenantId,
          candidate.ingredientUnit || 'unidade',
        ]
      );

      recipeFixes += 1;
      appliedProductIds.push(item.productId);
      continue;
    }

    if (item.safeFixAction === 'align_product_barcode') {
      const barcode = normalizeBarcode(candidate.ingredientBarcode);

      if (!barcode || !candidate.ingredientBarcodeUnique) {
        skippedCount += 1;
        continue;
      }

      const productBarcodeConflict = await txQ1<{ id: number }>(
        input.client,
        `SELECT id
         FROM produtos
         WHERE tenant_id=?
           AND id <> ?
           AND codigo_barras IS NOT NULL
           AND UPPER(REGEXP_REPLACE(codigo_barras, '\\s+', '', 'g'))=?
         LIMIT 1`,
        [input.tenantId, item.productId, barcode]
      );

      if (productBarcodeConflict) {
        skippedCount += 1;
        continue;
      }

      await txRun(
        input.client,
        'UPDATE produtos SET codigo_barras=? WHERE id=? AND tenant_id=?',
        [barcode, item.productId, input.tenantId]
      );

      barcodeFixes += 1;
      appliedProductIds.push(item.productId);
      continue;
    }

    skippedCount += 1;
  }

  const refreshedReport = await auditPendingInventoryProducts({
    client: input.client,
    tenantId: input.tenantId,
    onlyActive: input.onlyActive,
  });

  return {
    success: true,
    appliedCount: recipeFixes + barcodeFixes,
    recipeFixes,
    barcodeFixes,
    skippedCount,
    appliedProductIds,
    report: refreshedReport,
  } satisfies ApplyPendingInventoryFixesResult;
}

export async function applyManualPendingInventoryFixes(input: {
  client: Queryable;
  tenantId: TenantId;
  onlyActive?: boolean;
  productIds?: number[];
}) {
  const report = await auditPendingInventoryProducts({
    client: input.client,
    tenantId: input.tenantId,
    onlyActive: input.onlyActive,
  });
  const capabilities = await getSchemaCapabilities(input.client);

  const requestedIds = new Set(
    (input.productIds || [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  const selectedItems = report.items.filter((item) => {
    if (!item.manualFixAction) {
      return false;
    }

    if (requestedIds.size === 0) {
      return true;
    }

    return requestedIds.has(item.productId);
  });

  let createdIngredients = 0;
  let createdRecipes = 0;
  let skippedCount = 0;
  const appliedProductIds: number[] = [];

  for (const item of selectedItems) {
    if (item.manualFixAction !== 'create_missing_ingredient_recipe') {
      skippedCount += 1;
      continue;
    }

    const existingRecipe = await txQ1<{ id: number }>(
      input.client,
      'SELECT id FROM produto_ingrediente WHERE product_id=? AND tenant_id=? LIMIT 1',
      [item.productId, input.tenantId]
    );

    if (existingRecipe) {
      skippedCount += 1;
      continue;
    }

    const exactNameMatch = await txQ1<{ id: number }>(
      input.client,
      `SELECT id
       FROM ingredientes
       WHERE tenant_id=?
         AND LOWER(BTRIM(nome))=LOWER(BTRIM(?))
       LIMIT 1`,
      [input.tenantId, item.productName]
    );

    if (exactNameMatch) {
      skippedCount += 1;
      continue;
    }

    const ingredientId = Number(
      capabilities.ingredientPublicId
        ? await txInsert(
            input.client,
            `INSERT INTO ingredientes
              (public_id,nome,unidade,estoque_atual,estoque_minimo,custo_unitario,fornecedor,codigo_barras,tenant_id)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [
              generatePublicId('ing'),
              item.productName.trim(),
              'unidade',
              0,
              0,
              0,
              null,
              null,
              input.tenantId,
            ]
          )
        : await txInsert(
            input.client,
            `INSERT INTO ingredientes
              (nome,unidade,estoque_atual,estoque_minimo,custo_unitario,fornecedor,codigo_barras,tenant_id)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
              item.productName.trim(),
              'unidade',
              0,
              0,
              0,
              null,
              null,
              input.tenantId,
            ]
          )
    );

    await txRun(
      input.client,
      `INSERT INTO produto_ingrediente
        (product_id,ingrediente_id,quantidade_usada,tenant_id,unidade)
       VALUES (?,?,?,?,?)`,
      [item.productId, ingredientId, 1, input.tenantId, 'unidade']
    );

    createdIngredients += 1;
    createdRecipes += 1;
    appliedProductIds.push(item.productId);
  }

  const refreshedReport = await auditPendingInventoryProducts({
    client: input.client,
    tenantId: input.tenantId,
    onlyActive: input.onlyActive,
  });

  return {
    success: true,
    appliedCount: createdIngredients,
    createdIngredients,
    createdRecipes,
    skippedCount,
    appliedProductIds,
    report: refreshedReport,
  } satisfies ApplyManualPendingInventoryFixesResult;
}

export async function auditLegacyNameFallbackProducts(input: {
  client: Queryable;
  tenantId: TenantId;
  onlyActive?: boolean;
}) {
  return auditPendingInventoryProducts(input);
}
