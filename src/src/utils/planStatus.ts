import { PLAN_LABELS, type TenantPlan } from '../config/planFeatures';

export type PlanProfileInfo = {
  plano?: string | null;
  trial_ativo?: boolean;
  trial_fim?: string | null;
  vencimento?: string | null;
};

export type PlanStatusInfo = {
  labelPlano: string;
  status: 'trial' | 'ativo' | 'vencido';
  diasRestantes: number | null;
  dataFormatada: string | null;
};

function getPlanLabel(plano?: string | null) {
  const normalized = String(plano || '').trim().toLowerCase();
  if (normalized in PLAN_LABELS) return PLAN_LABELS[normalized as TenantPlan];
  return 'Plano';
}

function getTargetDate(profile: PlanProfileInfo) {
  return profile.trial_ativo ? profile.trial_fim : profile.vencimento;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR');
}

function getRemainingDays(value?: string | null) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = startOfTarget.getTime() - startOfToday.getTime();
  return Math.ceil(diffMs / 86400000);
}

export function getPlanStatus(profile?: PlanProfileInfo | null): PlanStatusInfo {
  const labelPlano = getPlanLabel(profile?.plano);
  const dataRef = getTargetDate(profile || {});
  const diasRestantes = getRemainingDays(dataRef);
  const dataFormatada = formatDate(dataRef);

  if (profile?.trial_ativo) {
    return {
      labelPlano,
      status: 'trial',
      diasRestantes,
      dataFormatada,
    };
  }

  if (typeof diasRestantes === 'number' && diasRestantes < 0) {
    return {
      labelPlano,
      status: 'vencido',
      diasRestantes,
      dataFormatada,
    };
  }

  return {
    labelPlano,
    status: 'ativo',
    diasRestantes,
    dataFormatada,
  };
}
