import { q1 } from '../db';
import {
  type PaidTenantPlan,
  type PlanFeature,
  type TenantPlan,
  getCompletePlanFeatures,
  getPlanFeatures,
  normalizeTenantPlan,
} from '../config/planFeatures';

type TenantPlanRow = {
  id: number;
  plano?: string | null;
  trial_inicio?: string | null;
  trial_fim?: string | null;
  vencimento?: string | null;
};

export type TenantPlanContext = {
  plan: TenantPlan;
  effectivePlan: PaidTenantPlan;
  features: PlanFeature[];
  isTrialActive: boolean;
  trialInicio: string | null;
  trialFim: string | null;
};

function isFutureDate(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= Date.now();
}

function isTrialActive(row: TenantPlanRow, normalizedPlan: TenantPlan): boolean {
  if (row.trial_fim) {
    const trialEnd = new Date(row.trial_fim);
    if (Number.isNaN(trialEnd.getTime())) return false;

    const trialStart = row.trial_inicio ? new Date(row.trial_inicio) : null;
    const now = Date.now();
    const started = !trialStart || Number.isNaN(trialStart.getTime()) || trialStart.getTime() <= now;
    return started && trialEnd.getTime() >= now;
  }

  // Compatibilidade com tenants antigos que ainda usam plano=trial + vencimento.
  return normalizedPlan === 'trial' && isFutureDate(row.vencimento);
}

function buildTenantPlanContext(row: TenantPlanRow): TenantPlanContext {
  const normalizedPlan = normalizeTenantPlan(row.plano);
  const trialActive = isTrialActive(row, normalizedPlan);

  if (trialActive || normalizedPlan === 'trial') {
    return {
      plan: normalizedPlan,
      effectivePlan: 'completo',
      features: getCompletePlanFeatures(),
      isTrialActive: true,
      trialInicio: row.trial_inicio || null,
      trialFim: row.trial_fim || row.vencimento || null,
    };
  }

  const effectivePlan = normalizedPlan as PaidTenantPlan;
  return {
    plan: normalizedPlan,
    effectivePlan,
    features: getPlanFeatures(effectivePlan),
    isTrialActive: false,
    trialInicio: row.trial_inicio || null,
    trialFim: row.trial_fim || null,
  };
}

export async function getTenantPlanContext(tenantId: number | string): Promise<TenantPlanContext> {
  const tenant = await q1<TenantPlanRow>(
    'SELECT id, plano, trial_inicio, trial_fim, vencimento FROM clientes WHERE id=?',
    [tenantId]
  );

  if (!tenant) {
    return {
      plan: 'completo',
      effectivePlan: 'completo',
      features: getCompletePlanFeatures(),
      isTrialActive: false,
      trialInicio: null,
      trialFim: null,
    };
  }

  return buildTenantPlanContext(tenant);
}

export async function getTenantFeatures(tenantId: number | string): Promise<PlanFeature[]> {
  const context = await getTenantPlanContext(tenantId);
  return context.features;
}

export async function tenantHasFeature(tenantId: number | string, feature: PlanFeature): Promise<boolean> {
  const features = await getTenantFeatures(tenantId);
  return features.includes(feature);
}

export async function getTenantFeaturesBySlug(slug: string): Promise<PlanFeature[] | null> {
  const tenant = await q1<TenantPlanRow>(
    'SELECT id, plano, trial_inicio, trial_fim, vencimento FROM clientes WHERE usuario=? AND status=?',
    [slug, 'ativo']
  );

  if (!tenant) return null;
  return buildTenantPlanContext(tenant).features;
}
