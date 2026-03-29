import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import type { Aviso } from '../hooks/useFlowAI';
import { AVISO_TIPO_META, getSeverity, SEVERITY_CFG } from './avisosVisualConfig';

type FiltroTipo = 'todos' | 'nao_lidos' | 'alerta' | 'atencao' | 'oportunidade' | 'parabens';

const TIPO_ICONS: Record<Aviso['tipo'], React.ReactNode> = {
  oportunidade: <TrendingUp size={14} />,
  alerta: <AlertTriangle size={14} />,
  parabens: <Trophy size={14} />,
  atencao: <AlertCircle size={14} />,
};

const PRIORIDADE_LABEL: Record<number, string> = {
  1: 'Info',
  2: 'Aviso',
  3: 'Alta',
};

const PRIORIDADE_COLOR: Record<number, string> = {
  1: 'border-white/8 bg-white/[0.04] text-zinc-400',
  2: 'border-amber-500/20 bg-amber-500/8 text-amber-200',
  3: 'border-red-500/20 bg-red-500/8 text-red-200',
};

function fmtDatetime(raw: string): string {
  try {
    const date = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    const isHoje = date.toDateString() === hoje.toDateString();
    const isOntem = date.toDateString() === ontem.toDateString();
    const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (isHoje) return `Hoje, ${hora}`;
    if (isOntem) return `Ontem, ${hora}`;

    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
  } catch {
    return raw;
  }
}

function normalizeText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function shortenText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function summarizeQuotedList(text: string, maxVisible = 2): string {
  const match = text.match(/"[^"]+"(?:,\s*"[^"]+")+/);
  if (!match) return text;

  const items = Array.from(match[0].matchAll(/"([^"]+)"/g)).map(([, value]) => value.trim());
  if (items.length <= maxVisible) return text;

  const visible = items.slice(0, maxVisible).map((item) => `"${item}"`).join(', ');
  const remaining = items.length - maxVisible;

  return text.replace(
    match[0],
    `${visible} e mais ${remaining} item${remaining > 1 ? 's' : ''}`,
  );
}

function compactTitle(text: string): string {
  return shortenText(normalizeText(text), 84);
}

function compactMessage(text: string): string {
  return shortenText(summarizeQuotedList(normalizeText(text)), 168);
}

function getFiltroActiveClass(filtro: FiltroTipo): string {
  if (filtro === 'atencao') return SEVERITY_CFG.critical.activeFilter;
  if (filtro === 'alerta') return SEVERITY_CFG.warning.activeFilter;
  if (filtro === 'oportunidade' || filtro === 'parabens') return SEVERITY_CFG.success.activeFilter;
  return 'border-white/10 bg-white/[0.08] text-white';
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  historico: Aviso[];
  carregandoHist: boolean;
  avisosNaoLidos: number;
  onMarcarLido: (id: number) => void;
  onMarcarTodosLidos: () => void;
  onAcao: (rota: string) => void;
  onRefresh: () => void;
}

export default function NotificationCenter({
  open,
  onClose,
  historico,
  carregandoHist,
  avisosNaoLidos,
  onMarcarLido,
  onMarcarTodosLidos,
  onAcao,
  onRefresh,
}: NotificationCenterProps) {
  const [filtro, setFiltro] = useState<FiltroTipo>('todos');

  useEffect(() => {
    if (open) onRefresh();
  }, [open, onRefresh]);

  const filtrados = historico.filter((aviso) => {
    if (filtro === 'nao_lidos') return !aviso.lido;
    if (filtro === 'todos') return true;
    return aviso.tipo === filtro;
  });

  const filtros: { key: FiltroTipo; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'nao_lidos', label: `Nao lidos${avisosNaoLidos > 0 ? ` (${avisosNaoLidos})` : ''}` },
    { key: 'atencao', label: 'Criticos' },
    { key: 'alerta', label: 'Alertas' },
    { key: 'oportunidade', label: 'Oportunidades' },
    { key: 'parabens', label: 'Conquistas' },
  ];

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[3px]"
          />

          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-[201] flex h-screen w-full max-w-[420px] flex-col border-l border-white/10 bg-[linear-gradient(180deg,rgba(18,18,21,0.98),rgba(10,10,12,1))] text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <Bell size={17} className="text-zinc-100" />
                </div>
                <div>
                  <h2 className="text-base font-black leading-none text-zinc-50">Notificacoes</h2>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {historico.length} registro{historico.length !== 1 ? 's' : ''}
                    {avisosNaoLidos > 0 && ` - ${avisosNaoLidos} nao lido${avisosNaoLidos !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {avisosNaoLidos > 0 ? (
                  <button
                    onClick={onMarcarTodosLidos}
                    title="Marcar todos como lidos"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <CheckCheck size={13} />
                    Marcar lidos
                  </button>
                ) : null}

                <button
                  onClick={onClose}
                  className="rounded-xl border border-white/8 bg-white/[0.04] p-2 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                  aria-label="Fechar notificacoes"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-white/8 px-4 py-3 scrollbar-hide">
              {filtros.map((item) => {
                const isActive = filtro === item.key;

                return (
                  <button
                    key={item.key}
                    onClick={() => setFiltro(item.key)}
                    className={[
                      'whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                      isActive
                        ? getFiltroActiveClass(item.key)
                        : 'border-white/8 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {carregandoHist ? (
                <div className="flex items-center justify-center py-24">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-zinc-200" />
                </div>
              ) : filtrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-20 text-center">
                  <Bell size={40} className="mb-3 text-zinc-500/60" />
                  <p className="text-sm font-semibold text-zinc-200">
                    {filtro === 'nao_lidos' ? 'Nenhuma notificacao nao lida' : 'Nenhuma notificacao aqui'}
                  </p>
                  <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-zinc-500">
                    {filtro === 'nao_lidos'
                      ? 'Tudo em dia por aqui.'
                      : 'Os avisos aparecerao aqui conforme o sistema detectar eventos.'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filtrados.map((aviso) => {
                    const tipoMeta = AVISO_TIPO_META[aviso.tipo] ?? AVISO_TIPO_META.atencao;
                    const tipoIcon = TIPO_ICONS[aviso.tipo] ?? TIPO_ICONS.atencao;
                    const severity = SEVERITY_CFG[getSeverity(aviso.tipo)];
                    const isUnread = !aviso.lido;
                    const title = compactTitle(aviso.titulo);
                    const message = compactMessage(aviso.mensagem);

                    return (
                      <article
                        key={aviso.id}
                        className={[
                          'group relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-900/78 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:border-white/12 hover:bg-zinc-900',
                          isUnread ? 'opacity-100' : 'opacity-72',
                        ].join(' ')}
                      >
                        <div className={`absolute inset-y-4 left-0 w-[3px] rounded-r-full ${severity.rail}`} />

                        <div className="flex gap-3 pl-1">
                          <div className="flex flex-col items-center pt-0.5">
                            <div
                              className={[
                                'flex h-9 w-9 items-center justify-center rounded-xl border',
                                severity.iconWrap,
                              ].join(' ')}
                            >
                              {tipoIcon}
                            </div>
                            <div className="mt-2 h-2 w-2">
                              {isUnread ? <div className={`h-2 w-2 rounded-full ${severity.dot}`} /> : null}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-start gap-2">
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                <span
                                  className={[
                                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]',
                                    severity.badge,
                                  ].join(' ')}
                                >
                                  {severity.label}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                                  {tipoMeta.label}
                                </span>
                                <span
                                  className={[
                                    'inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
                                    PRIORIDADE_COLOR[aviso.prioridade] || PRIORIDADE_COLOR[1],
                                  ].join(' ')}
                                >
                                  {PRIORIDADE_LABEL[aviso.prioridade] || 'Info'}
                                </span>
                              </div>

                              <span className="shrink-0 pt-0.5 text-[10px] font-medium text-zinc-500">
                                {fmtDatetime(aviso.created_at)}
                              </span>
                            </div>

                            <p className="line-clamp-2 text-sm font-black leading-snug text-zinc-50">{title}</p>
                            <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-zinc-400">{message}</p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {aviso.acao && aviso.acao_rota ? (
                                <button
                                  onClick={() => {
                                    onAcao(aviso.acao_rota!);
                                    if (isUnread) onMarcarLido(aviso.id);
                                    onClose();
                                  }}
                                  className={[
                                    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                                    severity.cta,
                                  ].join(' ')}
                                >
                                  {aviso.acao}
                                  <ChevronRight size={13} />
                                </button>
                              ) : null}

                              {isUnread ? (
                                <button
                                  onClick={() => onMarcarLido(aviso.id)}
                                  className={[
                                    'text-[11px] font-medium transition-colors',
                                    severity.subtleLink,
                                  ].join(' ')}
                                >
                                  Marcar lido
                                </button>
                              ) : (
                                <span className="text-[11px] font-medium text-zinc-500">Lido</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/8 bg-black/10 px-5 py-3">
              <p className="text-center text-[10px] text-zinc-500">
                Notificacoes dos ultimos 30 dias - Geradas automaticamente pelo FlowPDV
              </p>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
