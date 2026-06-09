export const ALL_PLAN_FEATURES = [
  'pos',
  'orders',
  'products',
  'configuracoes',
  'caixa',
  'print',
  'mesas',
  'delivery',
  'delivery_public',
  'delivery_tracking',
  'estoque',
  'dashboard',
  'finance',
  'funcionarios',
  'logs',
  'ai',
] as const;

export type PlanFeature = (typeof ALL_PLAN_FEATURES)[number];
export type PaidTenantPlan = 'basico' | 'basico_delivery' | 'completo';
export type TenantPlan = PaidTenantPlan | 'trial';

export const PLAN_LABELS: Record<TenantPlan, string> = {
  basico: 'Básico',
  basico_delivery: 'Básico + Delivery',
  completo: 'Completo',
  trial: 'Trial',
};

const CORE_FEATURES: PlanFeature[] = [
  'pos',
  'orders',
  'products',
  'configuracoes',
  'caixa',
  'print',
  'mesas',
  'dashboard',
];

export const PLAN_FEATURES: Record<PaidTenantPlan, PlanFeature[]> = {
  basico: CORE_FEATURES,
  basico_delivery: [
    ...CORE_FEATURES,
    'delivery',
    'delivery_public',
    'delivery_tracking',
  ],
  completo: [
    ...CORE_FEATURES,
    'delivery',
    'delivery_public',
    'delivery_tracking',
    'estoque',
    'finance',
    'funcionarios',
    'logs',
    'ai',
  ],
};

export function isKnownPlanFeature(value: string): value is PlanFeature {
  return (ALL_PLAN_FEATURES as readonly string[]).includes(value);
}

export function normalizeTenantPlan(rawPlan?: string | null): TenantPlan {
  const plan = String(rawPlan || '').trim().toLowerCase();
  if (plan === 'basico' || plan === 'basico_delivery' || plan === 'completo' || plan === 'trial') {
    return plan;
  }

  // Normaliza rótulos/variações comuns (ex.: "Básico + Delivery", "basico delivery", "basico-delivery").
  const normalized = plan
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized === 'basico') return 'basico';
  if (normalized === 'trial') return 'trial';
  if (normalized === 'completo') return 'completo';

  // Aceita labels que contenham ambos os tokens.
  if (normalized.includes('basico') && normalized.includes('delivery')) {
    return 'basico_delivery';
  }

  // Mantem compatibilidade com tenants antigos, sem bloquear acesso inesperadamente.
  if (normalized === 'mensal' || normalized === 'trimestral' || normalized === 'anual') {
    return 'completo';
  }

  return 'completo';
}

export function getPlanFeatures(plan: PaidTenantPlan): PlanFeature[] {
  return [...PLAN_FEATURES[plan]];
}

export function getCompletePlanFeatures(): PlanFeature[] {
  return [...PLAN_FEATURES.completo];
}

export function getSafeFallbackPlanFeatures(): PlanFeature[] {
  return [...CORE_FEATURES];
}

export function sanitizePlanFeatures(
  rawValue: unknown,
  fallback: PlanFeature[] = getSafeFallbackPlanFeatures()
): PlanFeature[] {
  if (!Array.isArray(rawValue)) return [...fallback];

  const features = rawValue.filter(
    (feature): feature is PlanFeature => typeof feature === 'string' && isKnownPlanFeature(feature)
  );

  return features.length > 0 ? features : [...fallback];
}
