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

// Cache em memoria por processo: em multi-instancia, cada replica mantem seu proprio Map.
export const TENANT_PLAN_CACHE_TTL_MS = 30 * 1000;

type TenantPlanCacheEntry = { expiresAt: number; context: TenantPlanContext };

const tenantPlanCacheById = new Map<number, TenantPlanCacheEntry>();

function normalizeCacheableTenantId(tenantId: number | string): number | null {
  const n = typeof tenantId === 'number' ? tenantId : Number(tenantId);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

/** Remove entradas do cache de plano para o tenant (ex.: após alteração no admin). */
export function invalidateTenantPlanCache(tenantId: number | string): void {
  const id = normalizeCacheableTenantId(tenantId);
  if (id == null) return;

  const removed = tenantPlanCacheById.delete(id);
  if (removed) {
    console.info('[tenant-plan] local cache invalidated', {
      tenantId: id,
      ttlMs: TENANT_PLAN_CACHE_TTL_MS,
    });
  }
}

function readTenantPlanCache(id: number): TenantPlanContext | null {
  const row = tenantPlanCacheById.get(id);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    tenantPlanCacheById.delete(id);
    return null;
  }
  const { context } = row;
  return { ...context, features: [...context.features] };
}

function writeTenantPlanCache(id: number, context: TenantPlanContext): void {
  tenantPlanCacheById.set(id, {
    expiresAt: Date.now() + TENANT_PLAN_CACHE_TTL_MS,
    context: { ...context, features: [...context.features] },
  });
}

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
  const legacyTrialPlan = normalizedPlan === 'trial';
  const trialFim = row.trial_fim || (legacyTrialPlan ? row.vencimento : null) || null;
  const trialInicio = row.trial_inicio || null;

  // Compatibilidade com tenants legados que ainda persistem apenas plano=trial.
  if (legacyTrialPlan) {
    return {
      plan: normalizedPlan,
      effectivePlan: 'completo',
      features: getCompletePlanFeatures(),
      isTrialActive: trialActive,
      trialInicio,
      trialFim,
    };
  }

  const effectivePlan = normalizedPlan as PaidTenantPlan;
  return {
    plan: normalizedPlan,
    effectivePlan,
    features: getPlanFeatures(effectivePlan),
    isTrialActive: trialActive,
    trialInicio,
    trialFim,
  };
}

async function loadTenantPlanContextFromDb(tenantId: number | string): Promise<TenantPlanContext> {
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

export async function getTenantPlanContext(tenantId: number | string): Promise<TenantPlanContext> {
  const cacheId = normalizeCacheableTenantId(tenantId);
  if (cacheId != null) {
    const hit = readTenantPlanCache(cacheId);
    if (hit) return hit;
  }

  const context = await loadTenantPlanContextFromDb(tenantId);

  if (cacheId != null) {
    writeTenantPlanCache(cacheId, context);
  }

  return { ...context, features: [...context.features] };
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
