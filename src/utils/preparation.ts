type PreparationProductLike = {
  name?: string | null;
  category?: string | null;
  requires_preparation?: unknown;
};

const NON_PREPARATION_KEYWORDS = [
  'bebida',
  'cerveja',
  'chopp',
  'refrigerante',
  'suco',
  'agua',
  'água',
  'energetico',
  'energético',
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

const PREPARATION_KEYWORDS = [
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
  'porção',
  'pastel',
  'espetinho',
  'hot dog',
  'cachorro quente',
  'batata',
  'combo',
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

function normalizeCatalogText(product: Pick<PreparationProductLike, 'name' | 'category'>) {
  return `${String(product.name || '')} ${String(product.category || '')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function inferRequiresPreparation(product: Pick<PreparationProductLike, 'name' | 'category'>): boolean {
  const text = normalizeCatalogText(product);

  if (!text) return true;
  if (NON_PREPARATION_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
  if (PREPARATION_KEYWORDS.some((keyword) => text.includes(keyword))) return true;

  return true;
}

export function resolveRequiresPreparation(product: PreparationProductLike): boolean {
  const explicit = parsePreparationFlag(product.requires_preparation);
  if (explicit !== null) return explicit;
  return inferRequiresPreparation(product);
}

export function normalizeRequiresPreparationInput(
  value: unknown,
  fallbackProduct: Pick<PreparationProductLike, 'name' | 'category'>
) {
  const explicit = parsePreparationFlag(value);
  return explicit === null ? (inferRequiresPreparation(fallbackProduct) ? 1 : 0) : explicit ? 1 : 0;
}
