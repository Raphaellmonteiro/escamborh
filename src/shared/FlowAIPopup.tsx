// src/shared/FlowAIPopup.tsx
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, AlertTriangle, Trophy, AlertCircle, ChevronRight } from 'lucide-react';
import type { Aviso } from '../hooks/useFlowAI';

interface FlowAIPopupProps {
  aviso: Aviso;
  onDismiss: (id: number) => void;
  onAcao: (rota: string) => void;
}

const TIPO_CFG = {
  oportunidade: {
    cor:    '#34d399',
    bg:     'bg-emerald-50',
    border: 'border-emerald-200',
    text:   'text-emerald-800',
    sub:    'text-emerald-600',
    badge:  'bg-emerald-100 text-emerald-700',
    btn:    'bg-emerald-600 hover:bg-emerald-700 text-white',
    icon:   <TrendingUp size={18} />,
    label:  'Oportunidade',
  },
  alerta: {
    cor:    '#fbbf24',
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    text:   'text-amber-900',
    sub:    'text-amber-700',
    badge:  'bg-amber-100 text-amber-700',
    btn:    'bg-amber-500 hover:bg-amber-600 text-white',
    icon:   <AlertTriangle size={18} />,
    label:  'Alerta',
  },
  parabens: {
    cor:    '#60a5fa',
    bg:     'bg-blue-50',
    border: 'border-blue-200',
    text:   'text-blue-900',
    sub:    'text-blue-700',
    badge:  'bg-blue-100 text-blue-700',
    btn:    'bg-blue-600 hover:bg-blue-700 text-white',
    icon:   <Trophy size={18} />,
    label:  'Parabéns!',
  },
  atencao: {
    cor:    '#f87171',
    bg:     'bg-red-50',
    border: 'border-red-200',
    text:   'text-red-900',
    sub:    'text-red-700',
    badge:  'bg-red-100 text-red-700',
    btn:    'bg-red-600 hover:bg-red-700 text-white',
    icon:   <AlertCircle size={18} />,
    label:  'Atenção',
  },
} as const;

// ms para auto-fechar por prioridade (null = não fecha sozinho)
const DURACAO: Record<number, number | null> = { 1: 8000, 2: 15000, 3: null };

export default function FlowAIPopup({ aviso, onDismiss, onAcao }: FlowAIPopupProps) {
  const cfg      = TIPO_CFG[aviso.tipo] ?? TIPO_CFG.atencao;
  const duracao  = DURACAO[aviso.prioridade];
  const [progresso, setProgresso] = useState(100);
  // Estado local de visibilidade — fecha instantaneamente ao clicar X
  const [visivel, setVisivel] = useState(true);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef  = useRef<number>(Date.now());

  const fechar = () => {
    // Esconde imediatamente localmente, depois notifica o pai
    setVisivel(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => onDismiss(aviso.id), 250); // aguarda animação de saída
  };

  useEffect(() => {
    setVisivel(true); // reseta ao trocar de aviso
    setProgresso(100);
    if (!duracao) return;
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct     = Math.max(0, 100 - (elapsed / duracao) * 100);
      setProgresso(pct);
      if (pct <= 0) {
        clearInterval(timerRef.current!);
        fechar();
      }
    }, 80);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [aviso.id, duracao]);

  if (!visivel) return null;

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0,   opacity: 1 }}
      exit={{   x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className={`fixed bottom-6 right-6 w-[340px] rounded-2xl border shadow-2xl shadow-black/10 overflow-hidden z-[300] ${cfg.bg} ${cfg.border}`}
    >
      {/* Barra colorida lateral */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: cfg.cor }} />

      <div className="pl-4 pr-3 pt-3 pb-3">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          {/* Ícone */}
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.badge}`}>
            {cfg.icon}
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.sub}`}>
                FlowAI · {cfg.label}
              </span>
            </div>
            <p className={`font-black text-sm leading-snug ${cfg.text}`}>
              {aviso.titulo}
            </p>
            <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${cfg.sub}`}>
              {aviso.mensagem}
            </p>
          </div>

          {/* Fechar */}
          <button
            onClick={fechar}
            className={`shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors ${cfg.sub}`}
          >
            <X size={14} />
          </button>
        </div>

        {/* Botão de ação */}
        {aviso.acao && aviso.acao_rota && (
          <button
            onClick={() => { onAcao(aviso.acao_rota!); fechar(); }}
            className={`mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${cfg.btn}`}
          >
            {aviso.acao}
            <ChevronRight size={13} />
          </button>
        )}
      </div>

      {/* Barra de progresso */}
      {duracao && (
        <div className="h-1 bg-black/5">
          <div
            className="h-full transition-none rounded-full"
            style={{ width: `${progresso}%`, background: cfg.cor }}
          />
        </div>
      )}
    </motion.div>
  );
}