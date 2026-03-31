import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Fingerprint,
  Info,
  KeyRound,
  Scale,
  Shield,
  Timer,
  UserPlus,
  Wallet,
} from 'lucide-react';

const RH_INTRO_COLLAPSED_KEY = 'flowpdv_rh_intro_collapsed';

type BasicCard = { title: string; text: string; icon: typeof UserPlus; iconClass: string };

const BASIC_CARDS: BasicCard[] = [
  {
    title: 'Cadastrar funcionário',
    text: 'Na aba Funcionários, use Novo Funcionário. Preencha nome, cargo, contrato e dados da ficha antes de salvar.',
    icon: UserPlus,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    title: 'Definir jornada',
    text: 'Ajuste entrada, saída, carga diária e dias da semana no mesmo cadastro. Isso orienta ponto e espelho.',
    icon: Clock,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    title: 'Bater ponto',
    text: 'O colaborador marca presença no quiosque com o PIN definido no cadastro. Evite PIN fraco ou compartilhado.',
    icon: Fingerprint,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    title: 'Consultar espelho',
    text: 'Na aba Espelho de Ponto, veja o mês por pessoa: presenças, faltas e pendências antes de fechar a folha.',
    icon: Calendar,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
];

type AdvancedCard = BasicCard;

const ADVANCED_CARDS: AdvancedCard[] = [
  {
    title: 'Acesso ao sistema',
    text: 'Só ative se a pessoa for usar o FlowPDV (caixa, telas internas). Desligado, ela pode só bater ponto com PIN.',
    icon: Shield,
    iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    title: 'Login, senha e PIN',
    text: 'Login e senha são para entrar no sistema. PIN é para o quiosque de ponto. São coisas diferentes; configure as duas quando precisar.',
    icon: KeyRound,
    iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    title: 'Horas extras',
    text: 'Registre e destine HE no Espelho (folha ou banco), conforme a política do estabelecimento. Revise antes de pagar.',
    icon: Timer,
    iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    title: 'Banco de horas',
    text: 'Quando aplicável, acompanhe saldo e compensações no Espelho para não fechar o mês com divergência.',
    icon: Scale,
    iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    title: 'Folha de pagamento',
    text: 'A aba Folha fecha a competência com base no que foi conferido no Espelho e nos cadastros. Não pule a conferência do espelho.',
    icon: Wallet,
    iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
];

export default function RhHowItWorksPanel() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RH_INTRO_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setCollapsedPersist = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      if (next) localStorage.setItem(RH_INTRO_COLLAPSED_KEY, '1');
      else localStorage.removeItem(RH_INTRO_COLLAPSED_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AnimatePresence initial={false} mode="wait">
      {!collapsed ? (
        <motion.section
          key="rh-intro-expanded"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-2 rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-zinc-50 p-4 shadow-sm sm:mb-3 sm:p-5 dark:border-zinc-800 dark:bg-gradient-to-br dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:shadow-black/25"
          aria-label="Como funciona o RH"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-sm dark:bg-violet-500/15 dark:text-violet-300 dark:shadow-none">
                  <Info size={20} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-black text-zinc-900 sm:text-xl dark:text-white">Como funciona o RH</p>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                    Referência rápida do dia a dia: o básico para colocar o time no ponto e o avançado para acesso, extras e folha.
                    Use o Modo guiado quando quiser um passo a passo na tela.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-transparent bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300">
                  Uso básico em verde
                </span>
                <span className="rounded-full border border-transparent bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Uso avançado em âmbar
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollapsedPersist(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 shadow-sm hover:bg-violet-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:shadow-none"
              aria-expanded="true"
            >
              <ChevronUp size={14} className="dark:text-zinc-300" aria-hidden />
              Ocultar
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/40 p-4 shadow-sm sm:p-5 dark:border-emerald-800 dark:from-emerald-950/30 dark:via-zinc-950 dark:to-emerald-950/20 dark:shadow-[inset_0_1px_0_rgba(52,211,153,0.06)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <UserPlus size={20} aria-hidden />
                </div>
                <div>
                  <span className="inline-flex rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white dark:bg-emerald-600 dark:ring-1 dark:ring-emerald-500/40">
                    Uso básico
                  </span>
                  <p className="mt-2 text-base font-black text-zinc-900 dark:text-white">Começar certo no dia a dia</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    Foco em cadastro, jornada, ponto e leitura do espelho. Evite salvar cadastro incompleto ou PIN genérico.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {BASIC_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className="rounded-2xl border border-emerald-100 bg-white/90 p-3 shadow-sm dark:border-emerald-800 dark:bg-zinc-900 dark:shadow-none"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}>
                          <Icon size={18} aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{card.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{card.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-100/40 p-4 shadow-sm sm:p-5 dark:border-amber-800 dark:from-amber-950/25 dark:via-zinc-950 dark:to-amber-950/15 dark:shadow-[inset_0_1px_0_rgba(251,191,36,0.06)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  <BookOpen size={20} aria-hidden />
                </div>
                <div>
                  <span className="inline-flex rounded-full bg-amber-500 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white dark:bg-amber-600 dark:ring-1 dark:ring-amber-500/35">
                    Uso avançado
                  </span>
                  <p className="mt-2 text-base font-black text-zinc-900 dark:text-white">Acesso, extras e fechamento</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    Ative acesso ao sistema só quando fizer sentido. Revise HE, banco e folha com calma — erros aqui custam caro na folha.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ADVANCED_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className={`rounded-2xl border border-amber-100 bg-white/90 p-3 shadow-sm dark:border-amber-800 dark:bg-zinc-900 dark:shadow-none ${card.title === 'Folha de pagamento' ? 'sm:col-span-2' : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}>
                          <Icon size={18} aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{card.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{card.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </motion.section>
      ) : (
        <motion.div
          key="rh-intro-collapsed"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-2 flex justify-end sm:mb-3"
        >
          <button
            type="button"
            onClick={() => setCollapsedPersist(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-[var(--text-main)] shadow-sm transition-colors hover:bg-[var(--bg-main)] dark:shadow-none"
            aria-expanded="false"
          >
            <ChevronDown size={14} className="text-violet-600 dark:text-violet-400" aria-hidden />
            Mostrar
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
