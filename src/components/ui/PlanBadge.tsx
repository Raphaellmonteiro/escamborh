import React from 'react';
import { getPlanStatus, type PlanProfileInfo } from '../../utils/planStatus';

type PlanBadgeProps = {
  profile?: PlanProfileInfo | null;
  compact?: boolean;
};

export default function PlanBadge({ profile, compact = false }: PlanBadgeProps) {
  const info = getPlanStatus(profile);

  const statusTextTone =
    info.status === 'trial'
      ? 'text-amber-700'
      : info.status === 'vencido'
        ? 'text-red-700'
        : 'text-emerald-700';
  const statusDotTone =
    info.status === 'trial'
      ? 'bg-amber-500'
      : info.status === 'vencido'
        ? 'bg-red-500'
        : 'bg-emerald-500';
  const statusText =
    info.status === 'trial'
      ? `Trial: ${Math.max(0, info.diasRestantes || 0)} dia${Math.abs(info.diasRestantes || 0) === 1 ? '' : 's'} restantes`
      : info.status === 'vencido'
        ? (info.dataFormatada ? `Vencido em ${info.dataFormatada}` : 'Plano vencido')
        : info.dataFormatada
          ? `Renovação em ${info.dataFormatada}`
          : 'Plano ativo';
  const statusLabel =
    info.status === 'trial' ? 'Trial' : info.status === 'vencido' ? 'Vencido' : 'Ativo';

  return (
    <div className={`rounded-2xl border border-zinc-200 bg-zinc-50 ${compact ? 'px-3 py-3' : 'px-4 py-3.5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Plano</p>
          <p className={`truncate font-black text-zinc-900 ${compact ? 'text-sm mt-1' : 'text-base mt-1.5'}`}>
            {info.labelPlano}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTextTone}`}>
          <span className={`h-2 w-2 rounded-full ${statusDotTone}`} />
          {statusLabel}
        </span>
      </div>
      <p className={`mt-2 text-zinc-600 ${compact ? 'text-[11px] leading-4' : 'text-xs leading-5'}`}>
        {statusText}
      </p>
    </div>
  );
}
