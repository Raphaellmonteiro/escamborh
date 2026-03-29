// src/shared/FlowAIPopup.tsx
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, TrendingUp, AlertTriangle, Trophy, AlertCircle, ChevronRight } from 'lucide-react';
import type { Aviso } from '../hooks/useFlowAI';
import { AVISO_TIPO_META, getSeverity, SEVERITY_CFG } from './avisosVisualConfig';

interface FlowAIPopupProps {
  aviso: Aviso;
  onDismiss: (id: number) => void;
  onAcao: (rota: string) => void;
}

const TIPO_ICONS: Record<Aviso['tipo'], React.ReactNode> = {
  oportunidade: <TrendingUp size={18} />,
  alerta: <AlertTriangle size={18} />,
  parabens: <Trophy size={18} />,
  atencao: <AlertCircle size={18} />,
};

// ms para auto-fechar por prioridade (null = não fecha sozinho)
const DURACAO: Record<number, number | null> = { 1: 8000, 2: 15000, 3: null };

export default function FlowAIPopup({ aviso, onDismiss, onAcao }: FlowAIPopupProps) {
  const tipoMeta = AVISO_TIPO_META[aviso.tipo] ?? AVISO_TIPO_META.atencao;
  const severityKey = getSeverity(aviso.tipo);
  const severity = SEVERITY_CFG[severityKey];
  const tipoIcon = TIPO_ICONS[aviso.tipo] ?? TIPO_ICONS.atencao;
  const duracao = DURACAO[aviso.prioridade];
  const [progresso, setProgresso] = useState(100);
  const [visivel, setVisivel] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(Date.now());

  const fechar = () => {
    setVisivel(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => onDismiss(aviso.id), 250);
  };

  useEffect(() => {
    setVisivel(true);
    setProgresso(100);
    if (!duracao) return;
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / duracao) * 100);
      setProgresso(pct);
      if (pct <= 0) {
        clearInterval(timerRef.current!);
        fechar();
      }
    }, 80);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [aviso.id, duracao]);

  if (!visivel) return null;

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="fixed bottom-4 right-4 z-[300] w-[min(340px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.97),rgba(12,12,14,0.99))] text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:bottom-6 sm:right-6"
    >
      <div className={`absolute bottom-0 left-0 top-0 w-[3px] rounded-r-full ${severity.rail}`} />

      <div className="relative pl-4 pr-3 pb-3 pt-3">
        <div className="flex items-start gap-2.5">
          <div
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
              severity.iconWrap,
            ].join(' ')}
          >
            {tipoIcon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                FlowAI
              </span>
              <span
                className={[
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]',
                  severity.badge,
                ].join(' ')}
              >
                {severity.label}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                {tipoMeta.label}
              </span>
            </div>
            <p className="text-sm font-black leading-snug text-zinc-50">{aviso.titulo}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{aviso.mensagem}</p>
          </div>

          <button
            type="button"
            onClick={fechar}
            className="shrink-0 rounded-lg border border-white/8 bg-white/[0.04] p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
            aria-label="Fechar aviso"
          >
            <X size={14} />
          </button>
        </div>

        {aviso.acao && aviso.acao_rota ? (
          <button
            type="button"
            onClick={() => {
              onAcao(aviso.acao_rota!);
              fechar();
            }}
            className={[
              'mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
              severity.cta,
            ].join(' ')}
          >
            {aviso.acao}
            <ChevronRight size={13} />
          </button>
        ) : null}
      </div>

      {duracao ? (
        <div className="h-1 bg-white/[0.08]">
          <div
            className={`h-full rounded-full transition-none ${severity.rail}`}
            style={{ width: `${progresso}%` }}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
