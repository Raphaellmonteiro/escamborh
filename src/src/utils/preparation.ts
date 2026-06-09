type PreparationProductLike = {
  name?: string | null;
  category?: string | null;
  requires_preparation?: unknown;
  production_type?: unknown;
};

export type ProductionType = 'kitchen' | 'bar' | 'counter' | 'none';

const BAR_KEYWORDS = [
  'bebida',
  'cerveja',
  'chopp',
  'refrigerante',
  'suco',
  'agua',
  'energetico',
  'drink',
  'vinho',
  'licor',
  'whisk',
  'dose',
  'balde',
  'ice',
  'long neck',
  'longneck',
];

const KITCHEN_KEYWORDS = [
  'xtudo',
  'x-tudo',
  'x tudo',
  'churrasco',
  'hamburg',
  'lanche',
  'pizza',
  'marmita',
  'prato',
  'porcao',
  'pastel',
  'espetinho',
  'hot dog',
  'cachorro quente',
  'batata',
  'combo',
];

const COUNTER_KEYWORDS = [
  'salgado',
  'salgados',
  'salgadinho',
  'doce',
  'doces',
  'sobremesa',
  'sobremesas',
  'fatia',
  'fatiado',
  'pronto',
  'pronta',
  'confeitaria',
  'padaria',
];

const NONE_KEYWORDS = [
  'ingresso',
  'servico',
  'servico extra',
  'taxa',
  'gorjeta',
  'embalagem',
  'adicional',
  'cortesia',
];

export function parsePreparationFlag(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(normalized)) return false;

  return null;
}

export function parseProductionType(value: unknown): ProductionType | null {
  if (value === undefined || value === null || value === '') return null;

  const normalized = String(value).trim().toLowerCase();
  if (['kitchen', 'cozinha', 'kitchen_preparation'].includes(normalized)) return 'kitchen';
  if (['bar', 'bebida', 'bebidas'].includes(normalized)) return 'bar';
  if (['counter', 'balcao', 'balcão', 'ready_counter'].includes(normalized)) return 'counter';
  if (['none', 'sem_producao', 'sem producao', 'sem produção', 'no_production'].includes(normalized)) return 'none';

  return null;
}

function normalizeCatalogText(product: Pick<PreparationProductLike, 'name' | 'category'>) {
  return `${String(product.name || '')} ${String(product.category || '')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferLegacyNonPreparationType(product: Pick<PreparationProductLike, 'name' | 'category'>): ProductionType {
  const text = normalizeCatalogText(product);

  if (!text) return 'counter';
  if (BAR_KEYWORDS.some((keyword) => text.includes(keyword))) return 'bar';
  if (COUNTER_KEYWORDS.some((keyword) => text.includes(keyword))) return 'counter';

  return 'counter';
}

export function inferProductionType(product: Pick<PreparationProductLike, 'name' | 'category'>): ProductionType {
  const text = normalizeCatalogText(product);

  if (!text) return 'kitchen';
  if (NONE_KEYWORDS.some((keyword) => text.includes(keyword))) return 'none';
  if (BAR_KEYWORDS.some((keyword) => text.includes(keyword))) return 'bar';
  if (KITCHEN_KEYWORDS.some((keyword) => text.includes(keyword))) return 'kitchen';
  if (COUNTER_KEYWORDS.some((keyword) => text.includes(keyword))) return 'counter';

  return 'kitchen';
}

export function isProductionTypePrepared(productionType: ProductionType): boolean {
  return productionType === 'kitchen' || productionType === 'bar';
}

export function inferRequiresPreparation(product: Pick<PreparationProductLike, 'name' | 'category'>): boolean {
  return isProductionTypePrepared(inferProductionType(product));
}

export function resolveProductionType(product: PreparationProductLike): ProductionType {
  const explicitProductionType = parseProductionType(product.production_type);
  if (explicitProductionType) return explicitProductionType;

  const explicitPreparation = parsePreparationFlag(product.requires_preparation);
  if (explicitPreparation === true) return 'kitchen';
  if (explicitPreparation === false) return inferLegacyNonPreparationType(product);

  return inferProductionType(product);
}

export function resolveRequiresPreparation(product: PreparationProductLike): boolean {
  return isProductionTypePrepared(resolveProductionType(product));
}

function mergeProductProductionInput(
  value: Pick<PreparationProductLike, 'production_type' | 'requires_preparation'>,
  currentValue?: Pick<PreparationProductLike, 'production_type' | 'requires_preparation'>
) {
  const explicitProductionType = parseProductionType(value.production_type);
  if (explicitProductionType) {
    return {
      production_type: explicitProductionType,
      requires_preparation: value.requires_preparation,
    };
  }

  const explicitPreparation = parsePreparationFlag(value.requires_preparation);
  if (explicitPreparation !== null) {
    return {
      production_type: undefined,
      requires_preparation: explicitPreparation,
    };
  }

  return {
    production_type: currentValue?.production_type,
    requires_preparation: currentValue?.requires_preparation,
  };
}

export function normalizeProductProductionInput(
  value: Pick<PreparationProductLike, 'production_type' | 'requires_preparation'>,
  fallbackProduct: Pick<PreparationProductLike, 'name' | 'category'>,
  currentValue?: Pick<PreparationProductLike, 'production_type' | 'requires_preparation'>
) {
  const mergedValue = mergeProductProductionInput(value, currentValue);
  const productionType = resolveProductionType({
    ...fallbackProduct,
    production_type: mergedValue.production_type,
    requires_preparation: mergedValue.requires_preparation,
  });

  return {
    productionType,
    requiresPreparation: isProductionTypePrepared(productionType) ? 1 : 0,
  };
}

export function normalizeRequiresPreparationInput(
  value: unknown,
  fallbackProduct: Pick<PreparationProductLike, 'name' | 'category'>
) {
  return normalizeProductProductionInput({ requires_preparation: value }, fallbackProduct).requiresPreparation;
}

export function normalizeProductionTypeInput(
  value: unknown,
  fallbackProduct: Pick<PreparationProductLike, 'name' | 'category'>
) {
  return normalizeProductProductionInput({ production_type: value }, fallbackProduct).productionType;
}
