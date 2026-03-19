// src/shared/NotificationCenter.tsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Bell, CheckCheck, TrendingUp, AlertTriangle,
  Trophy, AlertCircle, Filter, Trash2,
} from 'lucide-react';
import type { Aviso } from '../hooks/useFlowAI';

// ── Config visual por tipo ───────────────────────────────────────────────────
const TIPO_CFG = {
  oportunidade: {
    icon:  <TrendingUp  size={14} />,
    label: 'Oportunidade',
    dot:   'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    ring:  'border-l-emerald-400',
  },
  alerta: {
    icon:  <AlertTriangle size={14} />,
    label: 'Alerta',
    dot:   'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    ring:  'border-l-amber-400',
  },
  parabens: {
    icon:  <Trophy size={14} />,
    label: 'Parabéns',
    dot:   'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    ring:  'border-l-blue-400',
  },
  atencao: {
    icon:  <AlertCircle size={14} />,
    label: 'Atenção',
    dot:   'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    ring:  'border-l-red-400',
  },
} as const;

const PRIORIDADE_LABEL: Record<number, string> = {
  1: 'Info',
  2: 'Aviso',
  3: 'Crítico',
};

const PRIORIDADE_COLOR: Record<number, string> = {
  1: 'bg-zinc-100 text-zinc-500',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-red-100 text-red-700',
};

// ── Formata timestamp ────────────────────────────────────────────────────────
function fmtDatetime(raw: string): string {
  try {
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
    const hoje = new Date();
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    const isHoje  = d.toDateString() === hoje.toDateString();
    const isOntem = d.toDateString() === ontem.toDateString();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isHoje)  return `Hoje, ${hora}`;
    if (isOntem) return `Ontem, ${hora}`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ` ${hora}`;
  } catch { return raw; }
}

// ── Props ────────────────────────────────────────────────────────────────────
interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  historico: Aviso[];
  carregandoHist: boolean;
  avisosNaoLidos: number;
  onMarcarLido:       (id: number) => void;
  onMarcarTodosLidos: () => void;
  onAcao:             (rota: string) => void;
  onRefresh:          () => void;
}

// ── Filtro ───────────────────────────────────────────────────────────────────
type FiltroTipo = 'todos' | 'nao_lidos' | 'alerta' | 'atencao' | 'oportunidade' | 'parabens';

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function NotificationCenter({
  open, onClose, historico, carregandoHist, avisosNaoLidos,
  onMarcarLido, onMarcarTodosLidos, onAcao, onRefresh,
}: NotificationCenterProps) {

  const [filtro, setFiltro] = useState<FiltroTipo>('todos');

  // Atualiza histórico ao abrir
  useEffect(() => { if (open) onRefresh(); }, [open]);

  const filtrados = historico.filter(a => {
    if (filtro === 'nao_lidos') return !a.lido;
    if (filtro === 'todos')     return true;
    return a.tipo === filtro;
  });

  const FILTROS: { key: FiltroTipo; label: string }[] = [
    { key: 'todos',       label: 'Todos' },
    { key: 'nao_lidos',   label: `Não lidos${avisosNaoLidos > 0 ? ` (${avisosNaoLidos})` : ''}` },
    { key: 'atencao',     label: 'Críticos' },
    { key: 'alerta',      label: 'Alertas' },
    { key: 'oportunidade',label: 'Oportunidades' },
    { key: 'parabens',    label: 'Conquistas' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[200]"
          />

          {/* Painel lateral */}
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-full max-w-[420px] bg-white shadow-2xl z-[201] flex flex-col"
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-zinc-900 rounded-xl flex items-center justify-center">
                  <Bell size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 leading-none">Notificações</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {historico.length} registro{historico.length !== 1 ? 's' : ''}
                    {avisosNaoLidos > 0 && ` · ${avisosNaoLidos} não lido${avisosNaoLidos !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {avisosNaoLidos > 0 && (
                  <button
                    onClick={onMarcarTodosLidos}
                    title="Marcar todos como lidos"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-all"
                  >
                    <CheckCheck size={13} />
                    Marcar todos lidos
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ── Filtros ── */}
            <div className="px-4 py-2.5 border-b border-zinc-100 flex gap-1.5 overflow-x-auto flex-shrink-0 scrollbar-hide">
              {FILTROS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFiltro(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                    filtro === f.key
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* ── Lista ── */}
            <div className="flex-1 overflow-y-auto">
              {carregandoHist ? (
                <div className="flex justify-center items-center py-20">
                  <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin" />
                </div>
              ) : filtrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                  <Bell size={40} className="mb-3 opacity-20" />
                  <p className="font-semibold text-sm">
                    {filtro === 'nao_lidos' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação aqui'}
                  </p>
                  <p className="text-xs mt-1 text-zinc-300">
                    {filtro === 'nao_lidos' ? 'Você está em dia! ✅' : 'As notificações aparecerão aqui conforme o sistema detecta eventos.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {filtrados.map(aviso => {
                    const cfg = TIPO_CFG[aviso.tipo] ?? TIPO_CFG.atencao;
                    return (
                      <div
                        key={aviso.id}
                        className={`flex gap-3 px-4 py-3.5 transition-all hover:bg-zinc-50 border-l-4 ${cfg.ring} ${aviso.lido ? 'opacity-60' : ''}`}
                      >
                        {/* Dot não-lido */}
                        <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                          {!aviso.lido && (
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          )}
                          {aviso.lido && <div className="w-2 h-2" />}
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          {/* Badges */}
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.badge}`}>
                              {cfg.icon}
                              {cfg.label}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORIDADE_COLOR[aviso.prioridade] || PRIORIDADE_COLOR[1]}`}>
                              {PRIORIDADE_LABEL[aviso.prioridade] || 'Info'}
                            </span>
                            <span className="text-[10px] text-zinc-400 ml-auto flex-shrink-0">
                              {fmtDatetime(aviso.created_at)}
                            </span>
                          </div>

                          {/* Título */}
                          <p className={`text-sm font-bold leading-snug ${aviso.lido ? 'text-zinc-500' : 'text-zinc-900'}`}>
                            {aviso.titulo}
                          </p>

                          {/* Mensagem */}
                          <p className="text-[12px] text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">
                            {aviso.mensagem}
                          </p>

                          {/* Ações */}
                          <div className="flex items-center gap-2 mt-2">
                            {aviso.acao && aviso.acao_rota && (
                              <button
                                onClick={() => { onAcao(aviso.acao_rota!); if (!aviso.lido) onMarcarLido(aviso.id); onClose(); }}
                                className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-lg transition-all"
                              >
                                {aviso.acao} →
                              </button>
                            )}
                            {!aviso.lido && (
                              <button
                                onClick={() => onMarcarLido(aviso.id)}
                                className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-all"
                              >
                                Marcar lido
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-3 border-t border-zinc-100 flex-shrink-0 bg-zinc-50/50">
              <p className="text-[10px] text-zinc-400 text-center">
                Notificações dos últimos 30 dias · Geradas automaticamente pelo FlowAI
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
