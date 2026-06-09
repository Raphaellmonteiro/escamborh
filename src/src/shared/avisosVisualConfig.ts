import type { Aviso } from '../hooks/useFlowAI';

export type SeverityVariant = 'critical' | 'warning' | 'success';

/** Metadados por tipo de aviso — alinhado à central de notificações */
export const AVISO_TIPO_META: Record<
  Aviso['tipo'],
  { label: string; severity: SeverityVariant }
> = {
  oportunidade: { label: 'Oportunidade', severity: 'success' },
  alerta: { label: 'Alerta', severity: 'warning' },
  parabens: { label: 'Conquista', severity: 'success' },
  atencao: { label: 'Critico', severity: 'critical' },
};

export function getSeverity(tipo: Aviso['tipo']): SeverityVariant {
  return AVISO_TIPO_META[tipo]?.severity ?? 'critical';
}

export const SEVERITY_CFG: Record<
  SeverityVariant,
  {
    label: string;
    dot: string;
    rail: string;
    iconWrap: string;
    badge: string;
    cta: string;
    subtleLink: string;
    activeFilter: string;
  }
> = {
  critical: {
    label: 'Critico',
    dot: 'bg-red-400',
    rail: 'bg-red-400/85',
    iconWrap: 'border-red-500/25 bg-red-500/12 text-red-200',
    badge: 'border-red-500/20 bg-red-500/10 text-red-200',
    cta: 'border-red-500/25 bg-red-500/10 text-red-100 hover:border-red-400/35 hover:bg-red-500/14',
    subtleLink: 'text-red-200/75 hover:text-red-100',
    activeFilter: 'border-red-500/25 bg-red-500/12 text-red-100',
  },
  warning: {
    label: 'Alerta',
    dot: 'bg-amber-400',
    rail: 'bg-amber-400/85',
    iconWrap: 'border-amber-500/25 bg-amber-500/12 text-amber-200',
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    cta: 'border-amber-500/25 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/14',
    subtleLink: 'text-amber-200/75 hover:text-amber-100',
    activeFilter: 'border-amber-500/25 bg-amber-500/12 text-amber-100',
  },
  success: {
    label: 'Positivo',
    dot: 'bg-emerald-400',
    rail: 'bg-emerald-400/85',
    iconWrap: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-200',
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    cta: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/35 hover:bg-emerald-500/14',
    subtleLink: 'text-emerald-200/75 hover:text-emerald-100',
    activeFilter: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-100',
  },
};
