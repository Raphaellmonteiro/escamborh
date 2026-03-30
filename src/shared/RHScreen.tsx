import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { generatePayrollPdf, generatePayrollReceiptHtml, generateFeriasReceiptHtml, generateDecimoReceiptHtml } from '../utils/payrollPdfHtml';
import {
  hourBankApplicable,
  hourBankVisibleInUi,
  isEvento,
  isFixo,
  normalizeTipoContrato,
} from '../services/employeeContract';
import {
  Users, Fingerprint, Calendar, FileText, UserPlus, X, Pencil,
  Trash2, AlertTriangle, CheckCircle2, DollarSign,
  TrendingUp, Download, ArrowRight, Check, RefreshCw,
  ChevronLeft, ChevronRight, Search, Camera, Upload,
  Bell, Palmtree, Gift,
} from 'lucide-react';
import { adminScreenPagePaddingClass } from '../components/ui/screenChrome';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Func {
  id: number; nome: string; cargo: string; salario_base: number;
  horario_entrada: string; horario_saida: string; carga_horaria: number;
  dias_semana: string; tolerancia_minutos: number; dias_trabalho_mes: number;
  data_admissao: string; telefone?: string; cpf?: string; pin?: string;
  foto_url?: string; status: string;
  tipo_contrato?: 'fixo' | 'diarista' | 'evento';
}
interface UsuarioFuncionario {
  nome: string;
  username: string;
  cargo?: 'dono' | 'gerente' | 'atendente' | string;
  permissoes?: string[] | null;
}
interface Evento { id: number; funcionario_id: number; data: string; tipo: string; horas_ausentes: number; observacao?: string; }
interface Adiantamento {
  id: number;
  valor: number;
  motivo: string;
  data: string;
  descontado: number;
  origem?: string;
}
interface HoraExtraDia {
  id: number;
  minutos: number;
  minutos_pago_folha?: number | null;
  destino?: 'folha' | 'banco' | 'dividido' | 'legado_folha' | 'pendente';
  observacao?: string | null;
  quantidade?: number;
  itens?: HoraExtraDia[];
}
interface HoraExtraPendenteApi {
  id: number;
  data: string;
  minutos: number;
  observacao?: string | null;
}
interface DiaEspelho {
  data: string; dia: number; diaSemana: number; isExpediente: boolean; status: string;
  entrada?: string; saida?: string; atrasoMin: number; eventos: Evento[];
  extraAprov?: HoraExtraDia | null; saidaRealExtraMin?: number;
}
interface BancoMovRow {
  id: number; data_referencia: string; tipo: string; minutos: number; origem: string;
  observacao?: string | null; created_at: string; created_by?: string | null;
}
interface Espelho {
  /** Dados do colaborador (API também pode enviar legado em `func`) */
  funcionario?: Func;
  func?: Func;
  dias: DiaEspelho[];
  resumo: {
    diasTrabalhados: number; totalFaltas: number; diasFolga: number; diasAtestado: number; totalAtrasoMin: number;
    descontoFaltas: number; descontoAtrasos: number; descontoParcial?: number; totalDescontos: number;
    totalExtraMin?: number; totalExtraMinPagoFolha?: number; totalExtraMinBancoMes?: number; totalExtraMinPendentes?: number;
    saldoBancoHorasMin?: number;
  };
  banco_horas_mes?: BancoMovRow[];
  banco_horas_aplicavel?: boolean;
  horas_extras_pendentes?: HoraExtraPendenteApi[];
}
interface PayrollLineApi { type: string; label: string; amount: number }
interface FolhaPayrollApi {
  base_salary: number;
  earnings: PayrollLineApi[];
  deductions: PayrollLineApi[];
  totals: { gross: number; deductions: number; net: number };
}
interface FolhaCompetenciaApi {
  referencia: string;
  start_date: string;
  end_date: string;
  status: string;
}
interface FolhaPagamentoRow {
  id: number;
  tipo: string;
  valor: number;
  observacao?: string | null;
  created_at: string;
  created_by?: string | null;
  recibo_numero?: string | null;
}
interface FolhaPaymentSummary {
  net_liquid: number;
  total_paid: number;
  balance_due: number;
  status: 'pending' | 'partial' | 'paid';
  unbounded?: boolean;
}
interface FolhaManagerialApi {
  informativos: { label: string; amount: number }[];
  benefit_credits: { label: string; amount: number }[];
  benefit_deductions: { label: string; amount: number }[];
  benefit_credit_total: number;
  benefit_deduction_total: number;
  net_adjusted: number;
}
interface RhAlertItem {
  id: string;
  severity: 'ok' | 'attention' | 'urgent';
  titulo: string;
  detalhe: string;
  funcionario_id?: number;
}

interface Folha {
  funcionario: Func;
  mes: string;
  salarioBruto: number;
  totalFaltas: number;
  descontoFaltas: number;
  totalAtrasoMin: number;
  descontoAtrasos: number;
  horasAusentesParcial: number;
  descontoParcial: number;
  inss: number;
  totalAdiantamentos: number;
  adiantamentos: Adiantamento[];
  adiantamentos_legado_nao_contabilizados?: Adiantamento[];
  totalExtraMin: number;
  totalExtraMinPago?: number;
  totalExtraMinBancoMes?: number;
  totalExtraMinPendentes?: number;
  valorExtras: number;
  totalBancoConvertidoFolhaMin?: number;
  valorBancoConvertidoFolha?: number;
  totalDescontos: number;
  salarioLiquido: number;
  competencia?: FolhaCompetenciaApi;
  payroll?: FolhaPayrollApi;
  managerial?: FolhaManagerialApi;
  payroll_payments?: FolhaPagamentoRow[];
  payroll_payment_summary?: FolhaPaymentSummary;
  hour_bank?: { saldo_minutos: number; movimentacoes: BancoMovRow[]; aplicavel?: boolean };
  contract_profile?: { tipo: 'fixo' | 'diarista' | 'evento'; folha_tradicional: boolean };
  pagamentos_sem_teto_folha?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtDate = (d: string) => d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_LABEL = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const TIPOS_EVENTO = [
  { value: 'falta', label: 'Falta' },
  { value: 'folga', label: 'Folga' },
  { value: 'atestado', label: 'Atestado' },
  { value: 'declaracao_parcial', label: 'Aus. Parcial' },
];
const STATUS_COLOR: Record<string, string> = {
  trabalhado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  falta: 'bg-red-50 text-red-700 border-red-200',
  folga: 'bg-blue-50 text-blue-700 border-blue-200',
  atestado: 'bg-purple-50 text-purple-700 border-purple-200',
  declaracao_parcial: 'bg-amber-50 text-amber-700 border-amber-200',
  sem_expediente: 'bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border)]',
};
const STATUS_LABEL: Record<string, string> = { trabalhado: 'OK', falta: 'Falta', folga: 'Folga', atestado: 'Ates.', declaracao_parcial: 'Parc.', sem_expediente: '—' };
const PAYROLL_STATUS_LABEL: Record<string, string> = { pending: 'Pendente', partial: 'Parcial', paid: 'Quitada' };
const PAYMENT_TIPO_LABEL: Record<string, string> = {
  advance: 'Adiantamento',
  partial_payment: 'Pagamento parcial',
  final_payment: 'Pagamento final',
};
const TIPO_CONTRATO_LABEL: Record<'fixo' | 'diarista' | 'evento', string> = {
  fixo: 'Fixo',
  diarista: 'Diarista',
  evento: 'Evento',
};
const fmtMinHuman = (minutes: number) => {
  const total = Math.abs(Math.trunc(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const min = total % 60;
  const label = h > 0 ? `${h}h${min > 0 ? ` ${min}min` : ''}` : `${min}min`;
  return minutes < 0 ? `-${label}` : label;
};
const resolveHoraExtraDestino = (item: {
  minutos: number;
  minutos_pago_folha?: number | null;
  destino?: HoraExtraDia['destino'];
}): HoraExtraDia['destino'] => {
  if (item.destino === 'pendente') return 'pendente';
  const total = Math.max(0, Number(item.minutos) || 0);
  const pago = item.minutos_pago_folha;
  if (pago == null) return 'legado_folha';
  const pagoNorm = Math.min(total, Math.max(0, Number(pago) || 0));
  if (pagoNorm <= 0) return 'banco';
  if (pagoNorm >= total) return 'folha';
  return 'dividido';
};
const horaExtraDestinoLabel = (destino: HoraExtraDia['destino']) => {
  switch (destino) {
    case 'pendente':
      return 'Destino da hora extra: pendente (ainda não entra na folha nem no banco)';
    case 'banco':
      return 'Destino da hora extra: banco de horas';
    case 'dividido':
      return 'Destino da hora extra: parte na folha, parte no banco';
    case 'folha':
      return 'Destino da hora extra: pagamento na folha';
    default:
      return 'Legado: 100% considerado na folha (sem destino gravado)';
  }
};
const HOUR_BANK_MOVEMENT_LABEL: Record<string, string> = {
  credit: 'Credito',
  debit: 'Compensacao',
  manual_adjust: 'Ajuste manual',
  converted_to_payroll: 'Destino da HE na folha (baixa do banco)',
};
const HOUR_BANK_ORIGIN_LABEL: Record<string, string> = {
  espelho: 'Espelho',
  compensacao: 'Compensacao',
  folha: 'Folha',
  manual: 'Ajuste manual',
  hora_extra: 'Hora extra',
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function RHScreen({ token }: { token: string }) {
  const [tab, setTab] = useState<'lista'|'espelho'|'folha'|'gestao'>('lista');
  const [gestaoAtalho, setGestaoAtalho] = useState<Func | null>(null);
  const slug = React.useMemo(() => {
    try { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')))?.username || ''; }
    catch { return ''; }
  }, [token]);

  const TABS = [
    { key:'lista',   label:'Funcionarios',       icon:<Users size={14}/> },
    { key:'gestao',  label:'Gestao RH',          icon:<Bell size={14}/> },
    { key:'espelho', label:'Espelho de Ponto',   icon:<Calendar size={14}/> },
    { key:'folha',   label:'Folha de Pagamento', icon:<FileText size={14}/> },
  ] as const;
  const TAB_COPY = {
    lista: {
      title: 'Cadastro, contrato e ficha completa do colaborador',
      subtitle: 'Use esta area para dados cadastrais, contrato, acessos e a gestao detalhada por colaborador quando precisar agir no nivel individual.',
      shortcuts: [
        { key: 'gestao', label: 'Ver pendencias gerenciais' },
        { key: 'espelho', label: 'Conferir jornada' },
        { key: 'folha', label: 'Fechar pagamento' },
      ],
    },
    gestao: {
      title: 'Painel gerencial para triagem e prioridades',
      subtitle: 'Aqui entram alertas, pendencias e filas de decisao. Quando precisar editar um colaborador no detalhe, a ficha completa abre pela aba Funcionarios.',
      shortcuts: [
        { key: 'lista', label: 'Abrir ficha completa' },
        { key: 'folha', label: 'Ir para a folha' },
      ],
    },
    espelho: {
      title: 'Jornada, ponto, ocorrencias e banco de horas',
      subtitle: 'O Espelho concentra a operacao do dia e a conferencia mensal de presenca. Tudo que vira reflexo na folha nasce daqui.',
      shortcuts: [
        { key: 'folha', label: 'Conferir reflexos na folha' },
        { key: 'gestao', label: 'Voltar para pendencias RH' },
      ],
    },
    folha: {
      title: 'Conferencia da competencia, recibos e quitacao',
      subtitle: 'A Folha de Pagamento fecha o periodo. Jornada e compensacoes continuam no Espelho; beneficios, ferias e 13o continuam em Funcionarios e Gestao RH.',
      shortcuts: [
        { key: 'espelho', label: 'Revisar jornada no espelho' },
        { key: 'lista', label: 'Abrir cadastro do colaborador' },
      ],
    },
  } as const;
  const activeTabCopy = TAB_COPY[tab];

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[var(--bg-main)]">
      <div className={`max-w-7xl mx-auto min-w-0 ${adminScreenPagePaddingClass} space-y-2 sm:space-y-3 2xl:space-y-4`}>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-black text-[var(--text-main)] 2xl:text-2xl">Modulo RH</h1>
          <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5 leading-snug 2xl:text-sm">Funcionarios cuida do cadastro e da ficha completa. Gestao RH organiza prioridades. Espelho de Ponto cuida da jornada. Folha de Pagamento fecha a competencia.</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 flex-wrap min-w-0">
          <div className="flex bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-0.5 sm:p-1 gap-0.5 overflow-x-auto overflow-y-hidden w-full sm:w-auto min-w-0 touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch] scroll-pl-1 scroll-pr-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] text-xs font-bold transition-all shrink-0 rounded-lg sm:gap-2 sm:px-3 sm:text-sm lg:min-h-0 lg:py-1.5 2xl:px-3.5 2xl:py-2 ${tab===t.key ? 'bg-zinc-900 text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          {/* Botão Bater Ponto — abre quiosque em nova aba */}
          <a
            href={`/kiosk/ponto/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] text-xs font-bold sm:px-4 sm:py-2.5 sm:min-h-[44px] sm:text-sm lg:min-h-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all active:scale-95 no-underline shrink-0"
          >
            <Fingerprint size={14} />
            Bater Ponto
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5 sm:p-3 min-w-0 2xl:p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between min-w-0 2xl:gap-3">
            <div className="max-w-4xl min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] 2xl:text-[11px]">{TABS.find((item) => item.key === tab)?.label}</p>
              <h2 className="mt-0.5 text-sm sm:text-base font-black text-[var(--text-main)] 2xl:text-lg 2xl:mt-1">{activeTabCopy.title}</h2>
              <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)] 2xl:mt-1.5 2xl:text-sm">{activeTabCopy.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0 2xl:gap-2">
              {activeTabCopy.shortcuts.map((shortcut) => (
                <button
                  key={shortcut.key}
                  type="button"
                  onClick={() => setTab(shortcut.key)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-main)] hover:bg-zinc-100 sm:text-xs 2xl:rounded-xl 2xl:px-3 2xl:py-2 2xl:text-sm"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {tab==='lista'   && (
          <TabLista
            token={token}
            gestaoAtalho={gestaoAtalho}
            onGestaoAtalhoConsumed={() => setGestaoAtalho(null)}
          />
        )}
        {tab==='espelho' && <TabEspelho token={token} onIrFolha={() => setTab('folha')} />}
        {tab==='folha'   && <TabFolha   token={token} onIrEspelho={() => setTab('espelho')} />}
        {tab==='gestao'  && (
          <TabGestaoRH
            token={token}
            onOpenGestao={(func) => {
              setGestaoAtalho(func);
              setTab('lista');
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA GESTÃO RH
// ═══════════════════════════════════════════════════════════════════════════════
function TabGestaoRH({ token, onOpenGestao }: { token: string; onOpenGestao: (func: Func) => void }) {
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [alertas, setAlertas] = useState<RhAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const hdrs = { Authorization: `Bearer ${token}` };

  const carregarPainel = async () => {
    setLoading(true);
    try {
      const [rf, ra] = await Promise.all([
        fetch('/api/funcionarios', { headers: hdrs }),
        fetch('/api/funcionarios/painel/alertas', { headers: hdrs }),
      ]);
      const funcsData = await rf.json();
      const alertasData = await ra.json();
      setFuncs(Array.isArray(funcsData) ? funcsData : []);
      setAlertas(Array.isArray(alertasData.alertas) ? alertasData.alertas : []);
    } catch {
      setFuncs([]);
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarPainel();
  }, [token]);

  const ativos = funcs.filter((f) => f.status === 'ativo');
  const termo = search.trim().toLowerCase();
  const alertasUrgentes = alertas.filter((a) => a.severity === 'urgent').length;
  const alertasPendentes = alertas.filter((a) => a.severity !== 'ok').length;
  const alertasPorFuncionario = new Set(alertas.map((a) => a.funcionario_id).filter((id): id is number => typeof id === 'number'));
  const alertasFiltrados = alertas.filter((a) => {
    if (!termo) return true;
    const func = a.funcionario_id ? ativos.find((item) => item.id === a.funcionario_id) : null;
    return [a.titulo, a.detalhe, func?.nome, func?.cargo].some((value) => String(value || '').toLowerCase().includes(termo));
  });
  const funcionariosFiltrados = ativos.filter((f) => {
    if (!termo) return true;
    return [f.nome, f.cargo, TIPO_CONTRATO_LABEL[normalizeTipoContrato(f.tipo_contrato)]]
      .some((value) => String(value || '').toLowerCase().includes(termo));
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Painel gerencial</p>
            <h2 className="text-xl font-black text-[var(--text-main)] mt-1">Alertas, pendencias e prioridades do RH</h2>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Esta aba serve para triagem rapida de ferias, 13o, beneficios e folhas em aberto. Quando for preciso editar no detalhe, abrimos a ficha completa do colaborador pela aba Funcionarios.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar alerta ou colaborador..."
                className="w-full min-w-[250px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-9 pr-4 text-sm focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={carregarPainel}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-bold text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SCard label="Urgentes" value={alertasUrgentes} color="red" />
        <SCard label="Pendências" value={alertasPendentes} color="amber" />
        <SCard label="Com alertas" value={alertasPorFuncionario.size} color="purple" />
        <SCard label="Ativos" value={ativos.length} color="emerald" />
      </div>

      {loading ? (
        <LoadSpinner />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Triagem do modulo</p>
            <p className="text-sm text-[var(--text-muted)]">Revise aqui o que pede decisao gerencial e entre na ficha completa apenas quando precisar agir em um colaborador especifico.</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
            <div>
              <h3 className="text-sm font-black text-[var(--text-main)]">Pendencias e alertas</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">Cada card mostra o que precisa de decisao agora e, se necessario, leva para a ficha completa do colaborador.</p>
            </div>
            <div className="grid gap-3 mt-4 sm:grid-cols-2 xl:grid-cols-3">
              {alertasFiltrados.map((a) => {
                const func = a.funcionario_id ? ativos.find((item) => item.id === a.funcionario_id) : null;
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl border p-4 text-sm ${
                      a.severity === 'urgent'
                        ? 'bg-red-50 border-red-200 text-red-950'
                        : a.severity === 'attention'
                          ? 'bg-amber-50 border-amber-200 text-amber-950'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <p className="font-black text-[10px] uppercase tracking-wider mb-1 opacity-80">
                      {a.severity === 'ok' ? 'Ok' : a.severity === 'urgent' ? 'Urgente' : 'Atenção'}
                    </p>
                    <p className="font-bold">{a.titulo}</p>
                    <p className="text-xs mt-1.5 leading-relaxed opacity-90">{a.detalhe}</p>
                    {func && (
                      <button
                        type="button"
                        onClick={() => onOpenGestao(func)}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-current/20 bg-[var(--bg-card)]/70 px-3 py-2 text-[11px] font-black hover:bg-[var(--bg-card)]"
                      >
                        Abrir ficha completa
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
            <div>
              <h3 className="text-sm font-black text-[var(--text-main)]">Abrir ficha completa por funcionario</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">Use esta grade para sair da triagem e entrar na mesma gestao detalhada ja existente dentro de Funcionarios.</p>
            </div>
            {funcionariosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center py-10 sm:py-12 text-[var(--text-muted)]">
                <Users size={44} className="mb-3 opacity-20" />
                <p className="font-semibold">Nenhum colaborador encontrado</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 mt-4 sm:grid-cols-2 xl:grid-cols-3">
                {funcionariosFiltrados.map((f) => {
                  const tipoContrato = normalizeTipoContrato(f.tipo_contrato);
                  const temPendencia = alertasPorFuncionario.has(f.id);
                  return (
                    <div key={f.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)]/70 p-4">
                      <div className="flex items-start gap-3">
                        <Avatar func={f} size={42} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-black text-[var(--text-main)]">{f.nome}</p>
                          <p className="truncate text-xs text-[var(--text-muted)]">{f.cargo || 'Sem cargo definido'}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white">
                              {TIPO_CONTRATO_LABEL[tipoContrato]}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${temPendencia ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                              {temPendencia ? 'Com pendência' : 'Em dia'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <InfoChip label="Salário base" value={fmt(f.salario_base)} />
                        <InfoChip label="Jornada" value={`${f.horario_entrada || '--:--'}–${f.horario_saida || '--:--'}`} />
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenGestao(f)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-black text-white hover:bg-zinc-800"
                      >
                        Abrir ficha completa
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA LISTA
// ═══════════════════════════════════════════════════════════════════════════════
const BEN_TIPOS = [
  { key: 'transporte' as const, label: 'Transporte' },
  { key: 'refeicao' as const, label: 'Refeição' },
  { key: 'ajuda_custo' as const, label: 'Ajuda de custo' },
];

function TabLista({
  token,
  gestaoAtalho,
  onGestaoAtalhoConsumed,
}: {
  token: string;
  gestaoAtalho: Func | null;
  onGestaoAtalhoConsumed: () => void;
}) {
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Func|null>(null);
  const [modal, setModal] = useState<null|'novo'|'edit'|'adiant'|'ajuste'|'evento'|'rh_gestao'>(null);
  const [adiantamentos, setAdiantamentos] = useState<Adiantamento[]>([]);
  const [saving, setSaving] = useState(false);
  const hdrs = { Authorization:`Bearer ${token}` };
  const jHdrs = { ...hdrs, 'Content-Type':'application/json' };

  const ABAS_SISTEMA = [
    { key:'pos',            label:'Balcão/Vendas' },
    { key:'orders',         label:'Pedidos' },
    { key:'mesas',          label:'Mesas/Comandas' },
    { key:'products',       label:'Cardápio' },
    { key:'estoque',        label:'Estoque' },
    { key:'nfse',           label:'Nota Fiscal' },
    { key:'dashboard',      label:'Dashboard' },
    { key:'finance',        label:'Financeiro' },
    { key:'funcionarios',   label:'RH' },
    { key:'configuracoes',  label:'Configurações' },
  ];

  const CARGO_PRESETS: Record<string, string[]> = {
    dono:      [], // null = tudo
    gerente:   ['pos','orders','mesas','products','estoque','nfse','dashboard','finance','funcionarios'],
    atendente: ['pos','orders','mesas'],
  };

  const eF = { nome:'', cargo:'', salario_base:'', horario_entrada:'08:00', horario_saida:'17:00', carga_horaria:'8', dias_semana:'1,2,3,4,5', tolerancia_minutos:'10', dias_trabalho_mes:'26', data_admissao:'', telefone:'', cpf:'', pin:'', tipo_contrato: 'fixo' as 'fixo' | 'diarista' | 'evento' };
  const eAcesso = { login:'', senha:'', cargo_sistema:'atendente' as 'dono'|'gerente'|'atendente', permissoes: ['pos','orders','mesas'] as string[], criar_acesso: false };
  const [form, setForm] = useState(eF);
  const [formAcesso, setFormAcesso] = useState(eAcesso);
  const [usuariosExistentes, setUsuariosExistentes] = useState<UsuarioFuncionario[]>([]);
  const [fotoFile, setFotoFile] = useState<File|null>(null);
  const [fotoPreview, setFotoPreview] = useState('');
  const fotoRef = useRef<HTMLInputElement>(null);
  const [formAdiant, setFormAdiant] = useState({ valor:'', motivo:'' });
  const [formAjuste, setFormAjuste] = useState({ tipo:'aumento' as 'aumento'|'reducao', valor:'', motivo:'' });
  const [formEvento, setFormEvento] = useState({ data:'', tipo:'falta', horas_ausentes:'', observacao:'' });
  const [rhPackFerias, setRhPackFerias] = useState<{ ferias: any[]; resumo: Record<string, number> } | null>(null);
  const [rhPackDecimo, setRhPackDecimo] = useState<{
    decimo: Record<string, unknown> | null;
    pago_total: number;
    pendente: number;
    aplicavel?: boolean;
  } | null>(null);
  const [rhDecimoAno, setRhDecimoAno] = useState(new Date().getFullYear());
  const [rhBen, setRhBen] = useState<
    Record<string, { valor: string; tipo_valor: 'fixo' | 'percentual'; ativo: boolean; efeito: 'acrescimo' | 'desconto' }>
  >({
    transporte: { valor: '0', tipo_valor: 'fixo', ativo: false, efeito: 'acrescimo' },
    refeicao: { valor: '0', tipo_valor: 'fixo', ativo: false, efeito: 'acrescimo' },
    ajuda_custo: { valor: '0', tipo_valor: 'fixo', ativo: false, efeito: 'acrescimo' },
  });
  const [rhSchedIni, setRhSchedIni] = useState('');
  const [rhSchedFim, setRhSchedFim] = useState('');
  const [rhSchedId, setRhSchedId] = useState<number | ''>('');
  const [rhValFerias, setRhValFerias] = useState('');
  const [rhGestaoLoading, setRhGestaoLoading] = useState(false);
  const [rhDecimoConfirm, setRhDecimoConfirm] = useState<null | { parcela: 1 | 2 }>(null);
  const [rhDecimoSaving, setRhDecimoSaving] = useState(false);
  const [rhDecimoCalculoSaving, setRhDecimoCalculoSaving] = useState(false);
  const [rhDecimoValorManualStr, setRhDecimoValorManualStr] = useState('');

  const loadRhGestao = async (fid: number, ano: number) => {
    setRhGestaoLoading(true);
    try {
      const [rf, rd, rb] = await Promise.all([
        fetch(`/api/funcionarios/${fid}/ferias`, { headers: hdrs }).then((r) => r.json()),
        fetch(`/api/funcionarios/${fid}/decimo-terceiro?ano=${ano}`, { headers: hdrs }).then((r) => r.json()),
        fetch(`/api/funcionarios/${fid}/beneficios`, { headers: hdrs }).then((r) => r.json()),
      ]);
      setRhPackFerias({ ferias: rf.ferias || [], resumo: rf.resumo || {} });
      if (!rd.error) setRhPackDecimo(rd);
      const next: typeof rhBen = {
        transporte: { valor: '0', tipo_valor: 'fixo', ativo: false, efeito: 'acrescimo' },
        refeicao: { valor: '0', tipo_valor: 'fixo', ativo: false, efeito: 'acrescimo' },
        ajuda_custo: { valor: '0', tipo_valor: 'fixo', ativo: false, efeito: 'acrescimo' },
      };
      for (const row of rb.beneficios || []) {
        const k = String(row.tipo || '');
        if (next[k]) {
          next[k] = {
            valor: String(row.valor ?? 0),
            tipo_valor: row.tipo_valor === 'percentual' ? 'percentual' : 'fixo',
            ativo: !!row.ativo,
            efeito: row.efeito === 'desconto' ? 'desconto' : 'acrescimo',
          };
        }
      }
      setRhBen(next);
      const firstAvail = (rf.ferias || []).find((x: any) => x.status === 'available');
      setRhSchedId(firstAvail ? firstAvail.id : '');
    } catch {
      setRhPackFerias(null);
      setRhPackDecimo(null);
    } finally {
      setRhGestaoLoading(false);
    }
  };

  useEffect(()=>{ fetchFuncs(); fetchUsuarios(); },[]);
  useEffect(() => {
    if (!selected || isEvento(normalizeTipoContrato(selected.tipo_contrato))) {
      setAdiantamentos([]);
      return;
    }
    void fetchAdiantamentos(selected.id);
  }, [selected]);
  useEffect(() => {
    if (modal !== 'rh_gestao' || !selected) return;
    void loadRhGestao(selected.id, rhDecimoAno);
  }, [modal, selected, rhDecimoAno]);
  useEffect(() => {
    const d = rhPackDecimo?.decimo as { valor_total?: number; valor_total_manual?: number | null } | null;
    if (modal === 'rh_gestao' && d) {
      const v =
        d.valor_total_manual != null && Number(d.valor_total_manual) > 0
          ? Number(d.valor_total_manual)
          : Number(d.valor_total) || 0;
      setRhDecimoValorManualStr(v.toFixed(2).replace('.', ','));
    }
  }, [rhPackDecimo?.decimo, modal]);
  useEffect(() => {
    if (!gestaoAtalho) return;
    setSelected(gestaoAtalho);
    setRhDecimoAno(new Date().getFullYear());
    setRhSchedIni('');
    setRhSchedFim('');
    setRhValFerias('');
    setModal('rh_gestao');
    onGestaoAtalhoConsumed();
  }, [gestaoAtalho, onGestaoAtalhoConsumed]);

  const fetchFuncs = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/funcionarios', { headers: hdrs });
      const d = await r.json();
      setFuncs(Array.isArray(d) ? d : []);
    } catch {
      setFuncs([]);
    } finally {
      setLoading(false);
    }
  };
  const fetchAdiantamentos = async (id:number) => { const r=await fetch(`/api/funcionarios/${id}/adiantamentos`,{headers:hdrs}); setAdiantamentos(await r.json()); };
  const fetchUsuarios = async () => { try { const r=await fetch('/api/usuarios/funcionarios',{headers:hdrs}); if(r.ok) setUsuariosExistentes(await r.json()); } catch{} };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      const body = { ...form, salario_base:parseFloat(form.salario_base), carga_horaria:parseFloat(form.carga_horaria), tolerancia_minutos:parseInt(form.tolerancia_minutos), dias_trabalho_mes:parseInt(form.dias_trabalho_mes), tipo_contrato: form.tipo_contrato || 'fixo' };
      const url = modal==='novo' ? '/api/funcionarios' : `/api/funcionarios/${selected!.id}`;
      const r = await fetch(url, { method:modal==='novo'?'POST':'PUT', headers:jHdrs, body:JSON.stringify(body) });
      const data = await r.json();
      if(!r.ok){ alert(data.error||'Erro'); return; }
      if(fotoFile){ const fid=modal==='novo'?data.id:selected!.id; const fd=new FormData(); fd.append('foto',fotoFile); await fetch(`/api/funcionarios/${fid}/foto`,{method:'POST',headers:hdrs,body:fd}); }
      // Criar/atualizar acesso de login se marcado
      // Para novo funcionário: exige senha. Para edição: senha é opcional (mantém a atual)
      const isNovoAcesso = modal === 'novo' || !usuariosExistentes.find(u => u.username === formAcesso.login);
      if(formAcesso.criar_acesso && formAcesso.login && (formAcesso.senha || !isNovoAcesso)) {
        const fid = modal==='novo' ? data.id : selected!.id;
        const perms = formAcesso.cargo_sistema === 'dono' ? null : formAcesso.permissoes;
        await fetch(`/api/funcionarios/${fid}/criar-acesso`, {
          method:'POST', headers:jHdrs,
          body:JSON.stringify({ login:formAcesso.login, senha:formAcesso.senha || undefined, cargo:formAcesso.cargo_sistema, permissoes:perms })
        });
        await fetchUsuarios();
      }
      setModal(null); setForm(eF); setFormAcesso(eAcesso); setFotoFile(null); setFotoPreview(''); fetchFuncs(); setSelected(null);
    } finally { setSaving(false); }
  };

  const handleAdiantamento = async () => {
    if (selected && isEvento(normalizeTipoContrato(selected.tipo_contrato))) {
      alert(
        'Colaboradores por evento não utilizam adiantamento de folha. Use a aba Folha e registre em Pagamentos (valores avulsos ou parciais).'
      );
      return;
    }
    const valor = parseFloat(formAdiant.valor);
    if (isNaN(valor) || valor <= 0) { alert('Informe um valor válido maior que zero.'); return; }
    if (!formAdiant.motivo.trim()) { alert('Informe o motivo do adiantamento.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${selected!.id}/adiantamentos`, { method:'POST', headers:jHdrs, body:JSON.stringify({ valor, motivo:formAdiant.motivo }) });
      if (r.ok) {
        setModal(null);
        setFormAdiant({ valor:'', motivo:'' });
        void fetchAdiantamentos(selected!.id);
      } else {
        const data = await r.json().catch(() => ({}));
        alert((data as { error?: string }).error || 'Não foi possível registrar.');
      }
    } finally { setSaving(false); }
  };

  const handleAjuste = async () => {
    const valor = parseFloat(formAjuste.valor);
    if (isNaN(valor) || valor <= 0) { alert('Informe um valor de ajuste válido maior que zero.'); return; }
    if (!formAjuste.motivo.trim()) { alert('Informe o motivo do ajuste salarial.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${selected!.id}/ajustes`, { method:'POST', headers:jHdrs, body:JSON.stringify({ tipo:formAjuste.tipo, valor, motivo:formAjuste.motivo }) });
      if (r.ok) { setModal(null); setFormAjuste({ tipo:'aumento', valor:'', motivo:'' }); fetchFuncs(); setSelected(null); }
    } finally { setSaving(false); }
  };
  const handleEvento = async () => { setSaving(true); try { const r=await fetch(`/api/funcionarios/${selected!.id}/eventos`,{method:'POST',headers:jHdrs,body:JSON.stringify({...formEvento,horas_ausentes:parseFloat(formEvento.horas_ausentes||'0')})}); if(r.ok){setModal(null);setFormEvento({data:'',tipo:'falta',horas_ausentes:'',observacao:''});} } finally{setSaving(false);} };
  const handleDesativar = async (id:number) => { if(!confirm('Desativar?'))return; await fetch(`/api/funcionarios/${id}/desativar`,{method:'PATCH',headers:hdrs}); setSelected(null); fetchFuncs(); };

  const preencherFormulario = (f:Func) => {
    setSelected(f);
    const tc = f.tipo_contrato === 'diarista' || f.tipo_contrato === 'evento' ? f.tipo_contrato : 'fixo';
    setForm({ nome:f.nome, cargo:f.cargo, salario_base:String(f.salario_base), horario_entrada:f.horario_entrada||'08:00', horario_saida:f.horario_saida||'17:00', carga_horaria:String(f.carga_horaria||8), dias_semana:f.dias_semana||'1,2,3,4,5', tolerancia_minutos:String(f.tolerancia_minutos||10), dias_trabalho_mes:String(f.dias_trabalho_mes||26), data_admissao:f.data_admissao||'', telefone:f.telefone||'', cpf:f.cpf||'', pin:f.pin||'', tipo_contrato: tc });
    // Usa caminho relativo: funciona tanto em localhost quanto em produção
    setFotoPreview(f.foto_url ? f.foto_url : '');
    // Carrega dados de acesso existente
    const uExist = usuariosExistentes.find(u=>u.nome===f.nome);
    if(uExist) {
      setFormAcesso({ login:uExist.username, senha:'', cargo_sistema:uExist.cargo||'atendente', permissoes:uExist.permissoes||[], criar_acesso:true });
    } else {
      setFormAcesso({...eAcesso});
    }
  };

  const openEdit = (f:Func) => {
    preencherFormulario(f);
    setModal('edit');
  };

  const toggleDia = (v:number) => { const arr=form.dias_semana.split(',').map(Number).filter(n=>!isNaN(n)); const next=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v].sort(); setForm({...form,dias_semana:next.join(',')}); };
  const diasAtivos = form.dias_semana.split(',').map(Number);
  const filtered = funcs.filter(f=>f.status==='ativo'&&f.nome.toLowerCase().includes(search.toLowerCase()));
  const inativos = funcs.filter(f=>f.status!=='ativo');

  return (
    <>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Funcionarios</p>
            <h2 className="mt-1 text-xl font-black text-[var(--text-main)]">Cadastro, contrato e ficha completa</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Esta aba concentra dados cadastrais, contrato, acesso ao sistema e a gestao detalhada por colaborador. Use Gestao RH para triagem e volte aqui quando precisar editar no detalhe.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] px-4 py-3 text-sm text-[var(--text-muted)] min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Quando usar</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">Entrar no nivel do funcionario.</p>
            <p className="mt-1 text-xs leading-relaxed">Cadastro, salario, jornada, acesso, historico e gestao gerencial detalhada ficam concentrados aqui.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário..." className="pl-9 pr-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm focus:outline-none w-56"/></div>
        <button onClick={()=>{setForm(eF);setFotoFile(null);setFotoPreview('');setSelected(null);setModal('novo');}} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all active:scale-95"><UserPlus size={16}/>Novo Funcionário</button>
      </div>

      {loading ? <LoadSpinner/> : filtered.length===0 ? (
        <div className="flex flex-col items-center py-12 sm:py-16 2xl:py-20 text-[var(--text-muted)]"><Users size={48} className="mb-3 opacity-20 sm:mb-4"/><p className="font-semibold">Nenhum funcionário ativo</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(f=>(
            <div key={f.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:border-zinc-400 hover:shadow-md transition-all">
              {(() => {
                const acesso = usuariosExistentes.find(u => u.nome === f.nome);
                const tipoContrato = normalizeTipoContrato(f.tipo_contrato);
                return (
                  <>
              <div className="flex items-start gap-3 mb-4">
                <Avatar func={f} size={44}/>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-[var(--text-main)] truncate">{f.nome}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{f.cargo || 'Sem cargo definido'}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Contrato: {TIPO_CONTRATO_LABEL[tipoContrato]}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">{f.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <InfoChip label="Salário base" value={fmt(f.salario_base)}/>
                <InfoChip label="Jornada" value={`${f.horario_entrada||'08:00'}–${f.horario_saida||'17:00'}`}/>
                <InfoChip label="PIN" value={f.pin ? 'Definido' : 'Pendente'}/>
                <InfoChip label="Foto" value={f.foto_url ? 'Cadastrada' : 'Sem foto'}/>
                <InfoChip label="Acesso" value={acesso ? 'Liberado' : 'Sem acesso'}/>
                <InfoChip label="Status" value={f.status}/>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <ABtn label="Editar cadastro" icon={<Pencil size={11}/>} onClick={()=>openEdit(f)}/>
                <ABtn label="Desativar" icon={<Trash2 size={11}/>} danger onClick={()=>handleDesativar(f.id)}/>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {inativos.length>0&&<details><summary className="cursor-pointer text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-muted)] mt-2">Inativos ({inativos.length})</summary><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">{inativos.map(f=><div key={f.id} className="bg-[var(--bg-main)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3 opacity-60"><Avatar func={f} size={36}/><div><p className="text-sm font-bold text-[var(--text-main)]">{f.nome}</p><p className="text-xs text-[var(--text-muted)]">{f.cargo}</p></div></div>)}</div></details>}

      {/* Modal Funcionário */}
      <Modal
        open={modal==='novo'||modal==='edit'}
        onClose={()=>setModal(null)}
        title={modal==='novo' ? 'Novo Funcionário' : `Editar cadastro — ${selected?.nome}`}
        wide
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-2xl bg-zinc-100 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer" onClick={()=>fotoRef.current?.click()}>
              {fotoPreview?<img src={fotoPreview} alt="" className="w-full h-full object-cover"/>:<Camera size={24} className="text-[var(--text-muted)]"/>}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-all"><Upload size={18} className="text-white"/></div>
            </div>
            <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setFotoFile(f);setFotoPreview(URL.createObjectURL(f));}}/>
            <div className="flex-1"><FInput label="Nome completo*" value={form.nome} onChange={v=>setForm({...form,nome:v})} placeholder="João Silva"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Cargo" value={form.cargo} onChange={v=>setForm({...form,cargo:v})} placeholder="Garçom, Cozinheiro..."/>
            <FInput label="Salário base (R$)*" value={form.salario_base} onChange={v=>setForm({...form,salario_base:v})} placeholder="1500,00"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tipo de contrato</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={form.tipo_contrato || 'fixo'}
              onChange={(e) => setForm({ ...form, tipo_contrato: e.target.value as 'fixo' | 'diarista' | 'evento' })}
            >
              <option value="fixo">Fixo (mensal)</option>
              <option value="diarista">Diarista</option>
              <option value="evento">Evento</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FInput label="Entrada" type="time" value={form.horario_entrada} onChange={v=>setForm({...form,horario_entrada:v})}/>
            <FInput label="Saída" type="time" value={form.horario_saida} onChange={v=>setForm({...form,horario_saida:v})}/>
            <FInput label="Carga (h/dia)" value={form.carga_horaria} onChange={v=>setForm({...form,carga_horaria:v})} placeholder="8"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Tolerância (min)" value={form.tolerancia_minutos} onChange={v=>setForm({...form,tolerancia_minutos:v})} placeholder="10"/>
            <FInput label="Dias trab./mês (base)" value={form.dias_trabalho_mes} onChange={v=>setForm({...form,dias_trabalho_mes:v})} placeholder="26"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Dias de trabalho</label>
            <div className="flex gap-1.5 mt-1.5">
              {[{v:0,l:'Dom'},{v:1,l:'Seg'},{v:2,l:'Ter'},{v:3,l:'Qua'},{v:4,l:'Qui'},{v:5,l:'Sex'},{v:6,l:'Sáb'}].map(d=>(
                <button key={d.v} onClick={()=>toggleDia(d.v)} className={`w-10 h-10 rounded-xl text-xs font-bold border transition-all ${diasAtivos.includes(d.v)?'bg-zinc-900 text-white border-zinc-900':'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)] hover:border-zinc-400'}`}>{d.l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Data de admissão" type="date" value={form.data_admissao} onChange={v=>setForm({...form,data_admissao:v})}/>
            <FInput label="PIN (bater ponto)" value={form.pin} onChange={v=>setForm({...form,pin:v})} placeholder="Ex: 1234"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Telefone" value={form.telefone} onChange={v=>setForm({...form,telefone:v})} placeholder="(11) 99999-9999"/>
            <FInput label="CPF" value={form.cpf} onChange={v=>setForm({...form,cpf:v})} placeholder="000.000.000-00"/>
          </div>

          {/* ── Seção de Acesso ao Sistema ──────────────────────────────── */}
          <div className="border-t border-[var(--border)] pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-black text-[var(--text-main)]">🔐 Acesso ao Sistema</p>
                <p className="text-[11px] text-[var(--text-muted)]">Permita que este funcionário faça login</p>
              </div>
              <button
                type="button"
                onClick={()=>setFormAcesso({...formAcesso, criar_acesso:!formAcesso.criar_acesso})}
                className={`relative w-11 h-6 rounded-full transition-colors ${formAcesso.criar_acesso?'bg-zinc-900':'bg-zinc-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-zinc-100 rounded-full shadow transition-all ${formAcesso.criar_acesso?'left-5':'left-0.5'}`}/>
              </button>
            </div>

            {formAcesso.criar_acesso && (
              <div className="space-y-3 p-4 bg-[var(--bg-main)] rounded-2xl border border-[var(--border)]">
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Login*" value={formAcesso.login} onChange={v=>setFormAcesso({...formAcesso,login:v})} placeholder="joao.silva"/>
                  <FInput label={modal!=='novo'?'Nova senha (deixe vazio para manter)':'Senha*'} type="password" value={formAcesso.senha} onChange={v=>setFormAcesso({...formAcesso,senha:v})} placeholder="••••••"/>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Nível de acesso</label>
                  <div className="flex gap-2 mt-1.5">
                    {(['atendente','gerente','dono'] as const).map(c=>(
                      <button key={c} type="button"
                        onClick={()=>setFormAcesso({...formAcesso, cargo_sistema:c, permissoes:CARGO_PRESETS[c] || formAcesso.permissoes})}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize ${formAcesso.cargo_sistema===c?'bg-zinc-900 text-white border-zinc-900':'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)] hover:border-zinc-400'}`}
                      >
                        {c==='dono'?'👑 Dono':c==='gerente'?'🔑 Gerente':'🪪 Atendente'}
                      </button>
                    ))}
                  </div>
                </div>

                {formAcesso.cargo_sistema !== 'dono' && (
                  <div>
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Abas permitidas</label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      {ABAS_SISTEMA.map(aba=>{
                        const checked = formAcesso.permissoes.includes(aba.key);
                        return (
                          <button key={aba.key} type="button"
                            onClick={()=>{
                              const next = checked
                                ? formAcesso.permissoes.filter(p=>p!==aba.key)
                                : [...formAcesso.permissoes, aba.key];
                              setFormAcesso({...formAcesso, permissoes:next});
                            }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left ${checked?'bg-zinc-900 text-white border-zinc-900':'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)] hover:border-zinc-400'}`}
                          >
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked?'bg-[var(--bg-card)] border-white':'border-[var(--border)]'}`}>
                              {checked && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-[var(--text-main)]"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
                            </span>
                            {aba.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleSalvar} saving={saving} label="Salvar Funcionário"/>
      </Modal>

      {/* Modal Evento */}
      <Modal open={modal==='evento'} onClose={()=>setModal(null)} title={`Registrar Evento — ${selected?.nome}`}>
        <div className="space-y-3">
          <FInput label="Data" type="date" value={formEvento.data} onChange={v=>setFormEvento({...formEvento,data:v})}/>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tipo de evento</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {TIPOS_EVENTO.map(t=><button key={t.value} onClick={()=>setFormEvento({...formEvento,tipo:t.value})} className={`py-2 rounded-xl text-xs font-bold border transition-all ${formEvento.tipo===t.value?'bg-zinc-900 text-white border-zinc-900':'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)] hover:border-zinc-400'}`}>{t.label}</button>)}
            </div>
          </div>
          {formEvento.tipo==='declaracao_parcial'&&<FInput label="Horas ausentes" value={formEvento.horas_ausentes} onChange={v=>setFormEvento({...formEvento,horas_ausentes:v})} placeholder="Ex: 2.5"/>}
          <FInput label="Observação (opcional)" value={formEvento.observacao} onChange={v=>setFormEvento({...formEvento,observacao:v})} placeholder="Descreva o motivo..."/>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-start gap-2"><AlertTriangle size={13} className="shrink-0 mt-0.5"/>Faltas e ausências parciais geram descontos automáticos na folha.</div>
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleEvento} saving={saving} label="Registrar Evento"/>
      </Modal>

      {/* Modal Adiantamento */}
      <Modal open={modal==='adiant'} onClose={()=>setModal(null)} title={`Adiantamento — ${selected?.nome}`}>
        <div className="space-y-3">
          <FInput label="Valor (R$)" value={formAdiant.valor} onChange={v=>setFormAdiant({...formAdiant,valor:v})} placeholder="500,00"/>
          <FInput label="Motivo" value={formAdiant.motivo} onChange={v=>setFormAdiant({...formAdiant,motivo:v})} placeholder="Emergência, solicitação..."/>
          {adiantamentos.filter(a=>!a.descontado).length>0&&<div className="p-3 bg-[var(--bg-main)] rounded-xl"><p className="text-xs font-bold text-[var(--text-muted)] mb-2">Pendentes</p>{adiantamentos.filter(a=>!a.descontado).map(a=><div key={a.id} className="flex justify-between text-xs text-[var(--text-muted)]"><span>{fmtDate(a.data)} · {a.motivo}</span><span className="font-bold text-amber-600">{fmt(a.valor)}</span></div>)}</div>}
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleAdiantamento} saving={saving} label="Registrar"/>
      </Modal>

      {/* Modal Ajuste Salário */}
      <Modal open={modal==='ajuste'} onClose={()=>setModal(null)} title={`Ajuste Salarial — ${selected?.nome}`}>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['aumento','reducao'] as const).map(t=><button key={t} onClick={()=>setFormAjuste({...formAjuste,tipo:t})} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${formAjuste.tipo===t?(t==='aumento'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'}`}>{t==='aumento'?'▲ Aumento':'▼ Redução'}</button>)}
          </div>
          <FInput label="Valor (R$)" value={formAjuste.valor} onChange={v=>setFormAjuste({...formAjuste,valor:v})} placeholder="200,00"/>
          <FInput label="Motivo" value={formAjuste.motivo} onChange={v=>setFormAjuste({...formAjuste,motivo:v})} placeholder="Promoção, reajuste..."/>
          {selected&&formAjuste.valor&&<div className="p-3 bg-[var(--bg-main)] rounded-xl text-xs space-y-1"><div className="flex justify-between"><span className="text-[var(--text-muted)]">Atual</span><span className="font-bold">{fmt(selected.salario_base)}</span></div><div className="flex justify-between"><span className="text-[var(--text-muted)]">Novo</span><span className={`font-black ${formAjuste.tipo==='aumento'?'text-emerald-600':'text-red-600'}`}>{fmt(selected.salario_base+(formAjuste.tipo==='aumento'?1:-1)*(parseFloat(formAjuste.valor)||0))}</span></div></div>}
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleAjuste} saving={saving} label="Confirmar Ajuste"/>
      </Modal>

      <Modal
        open={modal === 'rh_gestao'}
        onClose={() => {
          setRhDecimoConfirm(null);
          setModal(null);
        }}
        title={`Ficha completa RH - ${selected?.nome}`}
        wide
      >
        <div className="space-y-4 pr-0.5 2xl:space-y-6">
          {rhGestaoLoading && <p className="text-xs text-[var(--text-muted)]">Carregando…</p>}
          {selected && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)]/80 p-4 text-sm text-[var(--text-main)]">
              <p className="font-black text-[var(--text-main)]">Edicao detalhada do colaborador</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                Esta ficha concentra beneficios, ferias e 13o no nivel individual. A aba Gestao RH continua sendo o painel de triagem; aqui fica a acao detalhada por colaborador.
              </p>
            </div>
          )}
          {selected && !isFixo(normalizeTipoContrato(selected.tipo_contrato)) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
              <p className="font-black text-amber-900">Contrato {TIPO_CONTRATO_LABEL[normalizeTipoContrato(selected.tipo_contrato)]}</p>
              <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
                {isEvento(normalizeTipoContrato(selected.tipo_contrato))
                  ? 'Colaborador por evento não utiliza folha mensal CLT no sistema. Use a aba Folha para registrar pagamentos por competência e o Espelho para ponto. Serviços por evento podem ser controlados externamente; aqui o foco é histórico financeiro e presença.'
                  : '13º e férias gerenciais automáticos não se aplicam a diarista no FlowPDV. Use Espelho e Folha (folha simplificada, sem INSS automático) e pagamentos na competência.'}
              </p>
            </div>
          )}
          {selected && isFixo(normalizeTipoContrato(selected.tipo_contrato)) && (
          <>
          {/* Benefícios */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)]/80 p-4 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Benefícios (folha)</p>
            <p className="text-[11px] text-[var(--text-muted)]">Valores fixos ou % do salário base; efeito na folha como acréscimo ou desconto gerencial.</p>
            {BEN_TIPOS.map((t) => (
              <div key={t.key} className="flex flex-wrap items-end gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => setRhBen((b) => ({ ...b, [t.key]: { ...b[t.key], ativo: !b[t.key].ativo } }))}
                    className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${rhBen[t.key].ativo ? 'bg-emerald-600' : 'bg-zinc-200'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-zinc-100 rounded-full shadow transition-all ${rhBen[t.key].ativo ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="text-sm font-bold text-[var(--text-main)]">{t.label}</span>
                </div>
                <input
                  type="text"
                  value={rhBen[t.key].valor}
                  onChange={(e) => setRhBen((b) => ({ ...b, [t.key]: { ...b[t.key], valor: e.target.value } }))}
                  className="w-24 px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm font-mono"
                  placeholder="0"
                />
                <select
                  value={rhBen[t.key].tipo_valor}
                  onChange={(e) =>
                    setRhBen((b) => ({
                      ...b,
                      [t.key]: { ...b[t.key], tipo_valor: e.target.value as 'fixo' | 'percentual' },
                    }))
                  }
                  className="px-2 py-1.5 border border-[var(--border)] rounded-lg text-xs font-bold"
                >
                  <option value="fixo">R$ fixo</option>
                  <option value="percentual">% salário</option>
                </select>
                <select
                  value={rhBen[t.key].efeito}
                  onChange={(e) =>
                    setRhBen((b) => ({
                      ...b,
                      [t.key]: { ...b[t.key], efeito: e.target.value as 'acrescimo' | 'desconto' },
                    }))
                  }
                  className="px-2 py-1.5 border border-[var(--border)] rounded-lg text-xs font-bold"
                >
                  <option value="acrescimo">Soma na folha</option>
                  <option value="desconto">Desconta na folha</option>
                </select>
              </div>
            ))}
            <button
              type="button"
              className="w-full py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-black"
              onClick={async () => {
                if (!selected) return;
                const items = BEN_TIPOS.map((t) => ({
                  tipo: t.key,
                  valor: parseFloat(String(rhBen[t.key].valor).replace(',', '.')) || 0,
                  tipo_valor: rhBen[t.key].tipo_valor,
                  ativo: rhBen[t.key].ativo,
                  efeito: rhBen[t.key].efeito,
                }));
                const r = await fetch(`/api/funcionarios/${selected.id}/beneficios`, {
                  method: 'PUT',
                  headers: jHdrs,
                  body: JSON.stringify({ items }),
                });
                if (!r.ok) {
                  const d = await r.json();
                  alert(d.error || 'Erro ao salvar benefícios');
                  return;
                }
                alert('Benefícios salvos.');
              }}
            >
              Salvar benefícios
            </button>
          </div>

          {/* 13º */}
          {rhPackDecimo?.decimo && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-violet-800 flex items-center gap-1">
                  <Gift size={14} /> 13º salário (gerencial)
                </p>
                <input
                  type="number"
                  className="w-24 px-2 py-1 border border-violet-200 rounded-lg text-sm font-mono"
                  value={rhDecimoAno}
                  onChange={(e) => setRhDecimoAno(Number(e.target.value) || new Date().getFullYear())}
                />
              </div>
              {(() => {
                const d = rhPackDecimo.decimo as any;
                const modo = String(d.calculo_modo || 'automatico');
                const emAberto = !d.pago_primeira && !d.pago_segunda;
                return (
                  <div className="text-sm space-y-2 text-[var(--text-main)]">
                    <p className="text-[11px] leading-relaxed text-violet-900/90">
                      O total é <strong>proporcional ao tempo trabalhado no ano civil</strong> (dias desde a admissão até 31/12),
                      com base no salário base atual. Convencionalmente a <strong>1ª parcela</strong> costuma ser paga em{' '}
                      <strong>novembro</strong> e a <strong>2ª em dezembro</strong> — aqui você só registra quando efetivou cada
                      pagamento (controle gerencial).
                    </p>
                    <p>
                      Meses equivalentes (≈12 × proporção do ano): <strong>{d.meses_trabalhados}</strong>
                    </p>
                    <p>
                      Total: <strong>{fmt(Number(d.valor_total) || 0)}</strong> · Pago:{' '}
                      <strong>{fmt(rhPackDecimo.pago_total)}</strong> · Pendente:{' '}
                      <strong>{fmt(rhPackDecimo.pendente)}</strong>
                    </p>
                    <p className="text-[10px] font-bold text-violet-800">
                      Modo: {modo === 'manual' ? 'Valor manual' : 'Automático (proporcional)'}
                    </p>
                    {emAberto && selected && (
                      <div className="rounded-xl border border-violet-200 bg-[var(--bg-card)]/80 p-3 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">Ajustar total do 13º</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={rhDecimoCalculoSaving}
                            className="px-3 py-1.5 rounded-lg bg-violet-100 text-violet-900 text-[11px] font-bold border border-violet-200 hover:bg-violet-200 disabled:opacity-40"
                            onClick={async () => {
                              if (!selected) return;
                              setRhDecimoCalculoSaving(true);
                              try {
                                const r = await fetch(`/api/funcionarios/decimo-terceiro/${d.id}`, {
                                  method: 'PATCH',
                                  headers: jHdrs,
                                  body: JSON.stringify({ action: 'set_calculo', modo: 'automatico' }),
                                });
                                const data = await r.json();
                                if (!r.ok) alert(data.error || 'Erro');
                                else await loadRhGestao(selected.id, rhDecimoAno);
                              } catch {
                                alert('Erro de conexão');
                              } finally {
                                setRhDecimoCalculoSaving(false);
                              }
                            }}
                          >
                            Voltar ao automático
                          </button>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[140px]">
                            <label className="text-[10px] font-bold text-[var(--text-muted)]">Valor total manual (R$)</label>
                            <input
                              type="text"
                              className="mt-1 w-full px-2 py-2 border border-violet-200 rounded-lg text-sm font-mono"
                              value={rhDecimoValorManualStr}
                              onChange={(e) => setRhDecimoValorManualStr(e.target.value)}
                              placeholder="0,00"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={rhDecimoCalculoSaving}
                            className="px-3 py-2 bg-violet-800 text-white rounded-lg text-[11px] font-bold disabled:opacity-40"
                            onClick={async () => {
                              if (!selected) return;
                              const v = parseFloat(String(rhDecimoValorManualStr).replace(',', '.'));
                              if (!Number.isFinite(v) || v <= 0) {
                                alert('Informe um valor válido.');
                                return;
                              }
                              setRhDecimoCalculoSaving(true);
                              try {
                                const r = await fetch(`/api/funcionarios/decimo-terceiro/${d.id}`, {
                                  method: 'PATCH',
                                  headers: jHdrs,
                                  body: JSON.stringify({
                                    action: 'set_calculo',
                                    modo: 'manual',
                                    valor_total_manual: v,
                                  }),
                                });
                                const data = await r.json();
                                if (!r.ok) alert(data.error || 'Erro');
                                else await loadRhGestao(selected.id, rhDecimoAno);
                              } catch {
                                alert('Erro de conexão');
                              } finally {
                                setRhDecimoCalculoSaving(false);
                              }
                            }}
                          >
                            Aplicar manual
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        disabled={!!d.pago_primeira}
                        className="px-3 py-2 bg-violet-700 text-white rounded-xl text-xs font-bold disabled:opacity-40"
                        onClick={() => setRhDecimoConfirm({ parcela: 1 })}
                      >
                        Registrar 1ª parcela (ex.: nov)…
                      </button>
                      <button
                        type="button"
                        disabled={!d.pago_primeira || !!d.pago_segunda}
                        className="px-3 py-2 bg-violet-900 text-white rounded-xl text-xs font-bold disabled:opacity-40"
                        onClick={() => setRhDecimoConfirm({ parcela: 2 })}
                      >
                        Registrar 2ª parcela (ex.: dez)…
                      </button>
                    </div>
                    <p className="text-[10px] text-violet-700/80 pt-1">
                      O sistema apenas marca o pagamento como registrado (controle gerencial). Confira o valor na etapa seguinte e abra o recibo depois de confirmar.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Férias */}
          {rhPackFerias && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-teal-900">Férias (gerencial)</p>
              <p className="text-sm text-teal-950">
                Saldo aproximado de dias livres:{' '}
                <strong>{rhPackFerias.resumo?.dias_livres ?? 0}</strong> · Agendadas:{' '}
                {rhPackFerias.resumo?.pendentes_agendamento ?? 0} · Em gozo:{' '}
                {rhPackFerias.resumo?.em_andamento ?? 0}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                {(rhPackFerias.ferias || []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 bg-[var(--bg-card)]/90 border border-teal-100 rounded-lg px-2 py-2"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-[var(--text-muted)]">
                        <span className="font-mono text-[var(--text-muted)]">#{row.id}</span> · Aquis. {row.data_inicio_aquisitivo} →{' '}
                        {row.data_fim_aquisitivo} · <strong>{row.status}</strong>
                        {row.data_inicio_gozo ? ` · gozo ${row.data_inicio_gozo}–${row.data_fim_gozo}` : ''}
                      </span>
                      <span className="font-mono text-teal-800">{fmt(Number(row.valor_pago) || 0)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.status === 'scheduled' && (
                        <button
                          type="button"
                          className="px-2 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold"
                          onClick={async () => {
                            if (!selected) return;
                            const r = await fetch(`/api/funcionarios/ferias/${row.id}`, {
                              method: 'PATCH',
                              headers: jHdrs,
                              body: JSON.stringify({ action: 'start' }),
                            });
                            const data = await r.json();
                            if (!r.ok) alert(data.error || 'Erro');
                            else await loadRhGestao(selected.id, rhDecimoAno);
                          }}
                        >
                          Iniciar gozo
                        </button>
                      )}
                      {(row.status === 'in_progress' || row.status === 'scheduled') && (
                        <button
                          type="button"
                          className="px-2 py-1 rounded-lg bg-teal-900 text-white text-[10px] font-bold"
                          onClick={async () => {
                            if (!selected) return;
                            const def = rhValFerias || '0';
                            const vStr = window.prompt('Valor pago registrado (R$):', def);
                            if (vStr === null) return;
                            const v = parseFloat(String(vStr).replace(',', '.'));
                            const r = await fetch(`/api/funcionarios/ferias/${row.id}`, {
                              method: 'PATCH',
                              headers: jHdrs,
                              body: JSON.stringify({
                                action: 'complete',
                                valor_pago: Number.isFinite(v) ? v : 0,
                              }),
                            });
                            const data = await r.json();
                            if (!r.ok) alert(data.error || 'Erro');
                            else {
                              await loadRhGestao(selected.id, rhDecimoAno);
                              const fr = data.ferias;
                              if (fr && selected) {
                                const w = window.open('', '_blank', 'width=750,height=950');
                                if (w) {
                                  const d0 = fr.data_inicio_gozo || '';
                                  const d1 = fr.data_fim_gozo || '';
                                  let dias = 0;
                                  if (d0 && d1) {
                                    const a = new Date(d0 + 'T12:00:00').getTime();
                                    const b = new Date(d1 + 'T12:00:00').getTime();
                                    dias = Math.floor((b - a) / 86400000) + 1;
                                  }
                                  w.document.write(
                                    generateFeriasReceiptHtml({
                                      employeeName: selected.nome,
                                      periodoAquisitivoLabel: `${fr.data_inicio_aquisitivo} a ${fr.data_fim_aquisitivo}`,
                                      dataInicioGozo: d0,
                                      dataFimGozo: d1,
                                      dias,
                                      valorPago: Number(fr.valor_pago) || 0,
                                      dataDocumentoLabel: new Date().toLocaleString('pt-BR'),
                                    })
                                  );
                                  w.document.close();
                                }
                              }
                            }
                          }}
                        >
                          Concluir + recibo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)]">Período (ID interno)</label>
                  <select
                    className="w-full mt-1 px-2 py-2 border border-[var(--border)] rounded-lg text-xs"
                    value={rhSchedId === '' ? '' : String(rhSchedId)}
                    onChange={(e) => setRhSchedId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">Selecione período disponível</option>
                    {(rhPackFerias.ferias || [])
                      .filter((x: any) => x.status === 'available')
                      .map((x: any) => (
                        <option key={x.id} value={x.id}>
                          #{x.id} · {x.data_inicio_aquisitivo}
                        </option>
                      ))}
                  </select>
                </div>
                <FInput label="Início gozo" type="date" value={rhSchedIni} onChange={(v) => setRhSchedIni(v)} />
                <FInput label="Fim gozo" type="date" value={rhSchedFim} onChange={(v) => setRhSchedFim(v)} />
              </div>
              <button
                type="button"
                className="w-full py-2 bg-teal-700 text-white rounded-xl text-xs font-black"
                onClick={async () => {
                  if (!selected || !rhSchedId) {
                    alert('Selecione o período e as datas.');
                    return;
                  }
                  const r = await fetch(`/api/funcionarios/ferias/${rhSchedId}`, {
                    method: 'PATCH',
                    headers: jHdrs,
                    body: JSON.stringify({
                      action: 'schedule',
                      data_inicio_gozo: rhSchedIni,
                      data_fim_gozo: rhSchedFim,
                    }),
                  });
                  const data = await r.json();
                  if (!r.ok) {
                    alert(data.error || 'Erro');
                    return;
                  }
                  if (data.overlap?.alerta) {
                    alert(
                      `Aviso: ${data.overlap.count} outro(s) colaborador(es) com férias sobrepostas neste intervalo (limite sugerido: 3).`
                    );
                  }
                  await loadRhGestao(selected.id, rhDecimoAno);
                }}
              >
                Agendar férias
              </button>
              <p className="text-[10px] text-[var(--text-muted)]">Dica: use Iniciar / Concluir em cada linha do histórico. O valor no prompt de conclusão sugere o campo abaixo.</p>
              <FInput
                label="Sugestão valor pago (R$) — usada no prompt ao concluir"
                value={rhValFerias}
                onChange={(v) => setRhValFerias(v)}
                placeholder="0,00"
              />
            </div>
          )}
          </>
          )}
        </div>
        <div className="flex justify-end pt-2 border-t border-[var(--border)] mt-2">
          <button
            type="button"
            className="px-4 py-2 text-sm font-bold text-[var(--text-muted)]"
            onClick={() => {
              setRhDecimoConfirm(null);
              setModal(null);
            }}
          >
            Fechar
          </button>
        </div>
      </Modal>

      <Modal
        open={rhDecimoConfirm != null && !!selected && !!rhPackDecimo?.decimo}
        onClose={() => !rhDecimoSaving && setRhDecimoConfirm(null)}
        title="13º salário — revisar antes de registrar"
      >
        {rhDecimoConfirm && selected && rhPackDecimo?.decimo ? (
          <div className="space-y-4 text-sm text-[var(--text-main)]">
            {(() => {
              const d = rhPackDecimo.decimo as any;
              const p = rhDecimoConfirm.parcela;
              const valor =
                p === 1 ? Number(d.valor_primeira_parcela) || 0 : Number(d.valor_segunda_parcela) || 0;
              const label = p === 1 ? '1ª parcela' : '2ª parcela';
              return (
                <>
                  <p>
                    <span className="text-[var(--text-muted)]">Colaborador:</span>{' '}
                    <span className="font-bold text-[var(--text-main)]">{selected.nome}</span>
                  </p>
                  <p>
                    <span className="text-[var(--text-muted)]">Exercício:</span>{' '}
                    <span className="font-mono font-bold">{rhDecimoAno}</span>
                  </p>
                  <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-800">{label}</p>
                    <p className="text-2xl font-black text-violet-900">{fmt(valor)}</p>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      Ao confirmar, o FlowPDV marca esta parcela como <strong>paga no controle gerencial</strong> (data de
                      hoje). Não há integração bancária: o pagamento efetivo continua sendo feito por você fora do
                      sistema.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={rhDecimoSaving}
                      className="px-4 py-2 rounded-xl text-sm font-bold border border-[var(--border)] text-[var(--text-main)] bg-[var(--bg-card)] hover:bg-[var(--bg-main)] disabled:opacity-50"
                      onClick={() => setRhDecimoConfirm(null)}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={rhDecimoSaving}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50 flex items-center gap-2"
                      onClick={async () => {
                        const decRow = rhPackDecimo.decimo as any;
                        setRhDecimoSaving(true);
                        try {
                          const r = await fetch(`/api/funcionarios/decimo-terceiro/${decRow.id}`, {
                            method: 'PATCH',
                            headers: jHdrs,
                            body: JSON.stringify({
                              action: p === 1 ? 'pay_primeira' : 'pay_segunda',
                            }),
                          });
                          const x = await r.json();
                          if (!r.ok) {
                            alert(x.error || 'Erro ao registrar');
                            return;
                          }
                          const dec = x.decimo as any;
                          await loadRhGestao(selected.id, rhDecimoAno);
                          setRhDecimoConfirm(null);
                          const w = window.open('', '_blank', 'width=750,height=950');
                          if (w && dec) {
                            w.document.write(
                              generateDecimoReceiptHtml({
                                employeeName: selected.nome,
                                ano: rhDecimoAno,
                                parcelaLabel: label,
                                valor:
                                  p === 1
                                    ? Number(dec.valor_primeira_parcela) || 0
                                    : Number(dec.valor_segunda_parcela) || 0,
                                dataDocumentoLabel: new Date().toLocaleString('pt-BR'),
                                autoPrint: false,
                              })
                            );
                            w.document.close();
                          } else {
                            alert(
                              'Pagamento registrado. Se o recibo não abriu, verifique o bloqueador de pop-ups do navegador.'
                            );
                          }
                        } finally {
                          setRhDecimoSaving(false);
                        }
                      }}
                    >
                      {rhDecimoSaving ? (
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : null}
                      Confirmar registro
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA ESPELHO
// ═══════════════════════════════════════════════════════════════════════════════
interface PontoRaw { id: number; tipo: string; hora: string; data: string; ip: string; }

function PendenteHoraExtraRow({
  item,
  heBancoOk,
  jHdrs,
  onApplied,
}: {
  item: HoraExtraPendenteApi;
  heBancoOk: boolean;
  jHdrs: Record<string, string>;
  onApplied: () => void;
}) {
  const [dest, setDest] = useState<'folha' | 'banco' | 'dividir'>('folha');
  const [pagoFolha, setPagoFolha] = useState('');
  const [saving, setSaving] = useState(false);

  const aplicar = async () => {
    const total = item.minutos;
    const body: Record<string, unknown> = {
      destino: dest === 'dividir' ? 'dividido' : dest,
    };
    if (dest === 'banco') body.minutos_pago_folha = 0;
    else if (dest === 'folha') body.minutos_pago_folha = total;
    else {
      const p = parseInt(pagoFolha, 10);
      if (!Number.isFinite(p) || p <= 0 || p >= total) {
        alert('Na divisão, informe minutos na folha entre 1 e (total − 1).');
        return;
      }
      body.minutos_pago_folha = p;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/horas-extras/${item.id}`, {
        method: 'PATCH',
        headers: jHdrs,
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((d as { error?: string }).error || 'Erro ao definir destino');
        return;
      }
      onApplied();
    } catch {
      alert('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const opcoes: { k: 'folha' | 'banco' | 'dividir'; label: string }[] = [
    { k: 'folha', label: 'Folha' },
    ...(heBancoOk
      ? ([
          { k: 'banco' as const, label: 'Banco' },
          { k: 'dividir' as const, label: 'Dividir' },
        ] as const)
      : []),
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3 sm:px-4 sm:py-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-[var(--text-main)]">
          {fmtDate(item.data)} · {item.minutos} min
        </p>
        {item.observacao ? (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.observacao}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setDest(o.k)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                dest === o.k
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border)]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {dest === 'dividir' && (
          <input
            type="number"
            min={1}
            max={479}
            className="w-[4.5rem] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] text-sm font-mono"
            placeholder="min folha"
            value={pagoFolha}
            onChange={(e) => setPagoFolha(e.target.value)}
          />
        )}
        <button
          type="button"
          disabled={saving}
          onClick={aplicar}
          className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {saving ? '…' : 'Aplicar destino'}
        </button>
      </div>
    </div>
  );
}

function TabEspelho({ token, onIrFolha }: { token: string; onIrFolha?: () => void }) {
  const [funcs, setFuncs]         = useState<Func[]>([]);
  const [sel, setSel]             = useState<number|''>('');
  const [month, setMonth]         = useState(new Date().getMonth()+1);
  const [year, setYear]           = useState(new Date().getFullYear());
  const [espelho, setEspelho]     = useState<Espelho|null>(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  // modal de evento (já existia)
  const [addEvento, setAddEvento] = useState<string|null>(null);
  const [formEvento, setFormEvento] = useState({tipo:'falta',horas_ausentes:'',observacao:''});
  // modal de gestão de pontos (novo)
  const [gestaoData, setGestaoData]     = useState<string|null>(null);
  const [pontosRaw, setPontosRaw]       = useState<PontoRaw[]>([]);
  const [loadingPontos, setLoadingPontos] = useState(false);
  const [editPonto, setEditPonto]       = useState<PontoRaw|null>(null);
  const [editHora, setEditHora]         = useState('');
  const [editTipo, setEditTipo]         = useState('');
  const [manualHora, setManualHora]     = useState('');
  const [manualTipo, setManualTipo]     = useState<'entrada'|'saida'>('entrada');

  // ── Hora Extra ──────────────────────────────────────────────────────────
  const [horaExtraMin, setHoraExtraMin]         = useState('');
  const [horaExtraObs, setHoraExtraObs]         = useState('');
  const [horaExtraDestino, setHoraExtraDestino] = useState<'folha' | 'banco' | 'dividir' | 'pendente'>('folha');
  const [horaExtraPagoFolha, setHoraExtraPagoFolha] = useState('');
  const [savingExtra, setSavingExtra]           = useState(false);
  const [compBancoMin, setCompBancoMin] = useState('');
  const [compBancoObs, setCompBancoObs] = useState('');
  const [compBancoSaving, setCompBancoSaving] = useState(false);

  const hdrs   = { Authorization:`Bearer ${token}` };
  const jHdrs  = { ...hdrs, 'Content-Type':'application/json' };

  useEffect(() => {
    fetch('/api/funcionarios', { headers: hdrs }).then(async (r) => {
      const d = await r.json();
      if (!r.ok || !Array.isArray(d)) {
        setFuncs([]);
        return;
      }
      setFuncs(d);
      const ativos = d.filter((f: Func) => f.status === 'ativo');
      if (ativos.length) setSel(ativos[0].id);
    });
  }, []);
  useEffect(()=>{ if(sel) fetchEspelho(); },[sel,month,year]);

  const fetchEspelho = async () => {
    if (!sel) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/espelho?month=${month}&year=${year}`, { headers: hdrs });
      if (!r.ok) return;
      const d = await r.json();
      // Garante que o retorno é um objeto válido com a propriedade dias antes de setar
      if (d && Array.isArray(d.dias)) {
        const funcionario = d.funcionario ?? d.func;
        setEspelho({ ...d, funcionario });
      }
    } catch {} finally { setLoading(false); }
  };

  // ── Evento ──────────────────────────────────────────────────────────────
  const handleAddEvento = async () => {
    if(!addEvento) return;
    await fetch(`/api/funcionarios/${sel}/eventos`,{method:'POST',headers:jHdrs,body:JSON.stringify({data:addEvento,tipo:formEvento.tipo,horas_ausentes:parseFloat(formEvento.horas_ausentes||'0'),observacao:formEvento.observacao})});
    setAddEvento(null); setFormEvento({tipo:'falta',horas_ausentes:'',observacao:''}); fetchEspelho();
  };

  // ── Gestão de pontos do dia ──────────────────────────────────────────────
  const abrirGestao = async (data: string) => {
    setGestaoData(data); setLoadingPontos(true); setEditPonto(null); setManualHora(''); setManualTipo('entrada');
    try {
      const r = await fetch(`/api/funcionarios/${sel}/pontos-dia?data=${data}`, {headers:hdrs});
      setPontosRaw(await r.json());
    } catch { setPontosRaw([]); } finally { setLoadingPontos(false); }
  };

  const handleEditarPonto = async () => {
    if(!editPonto) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/pontos/${editPonto.id}`,{method:'PUT',headers:jHdrs,body:JSON.stringify({hora:editHora,tipo:editTipo})});
      if(r.ok){
        setEditPonto(null);
        await abrirGestao(gestaoData!);
        await fetchEspelho();
      } else {
        const d = await r.json();
        alert(d.error || 'Erro ao editar ponto');
      }
    } catch { alert('Erro de conexão'); }
    finally { setSaving(false); }
  };

  const handleDeletarPonto = async (id: number) => {
    if(!confirm('Deletar este registro de ponto?')) return;
    try {
      await fetch(`/api/pontos/${id}`,{method:'DELETE',headers:hdrs});
      await abrirGestao(gestaoData!);
      await fetchEspelho();
    } catch { alert('Erro ao deletar'); }
  };

  const handlePontoManual = async () => {
    if(!manualHora || !gestaoData) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/pontos-manual`,{method:'POST',headers:jHdrs,body:JSON.stringify({data:gestaoData,hora:manualHora,tipo:manualTipo})});
      if(r.ok){
        setManualHora('');
        await abrirGestao(gestaoData!);
        await fetchEspelho();
      } else {
        const d = await r.json();
        alert(d.error || 'Erro ao inserir ponto');
      }
    } catch { alert('Erro de conexão'); }
    finally { setSaving(false); }
  };

  const handleAprovarExtra = async () => {
    if (!gestaoData || !horaExtraMin || parseInt(horaExtraMin) <= 0) {
      alert('Informe quantos minutos de hora extra aprovar.'); return;
    }
    const total = parseInt(horaExtraMin, 10);
    const body: Record<string, unknown> = {
      data: gestaoData,
      minutos: total,
      observacao: horaExtraObs || null,
      destino: horaExtraDestino === 'dividir' ? 'dividido' : horaExtraDestino,
    };
    if (horaExtraDestino === 'banco') body.minutos_pago_folha = 0;
    else if (horaExtraDestino === 'folha') body.minutos_pago_folha = total;
    else if (horaExtraDestino === 'dividir') {
      const p = parseInt(horaExtraPagoFolha, 10);
      if (!Number.isFinite(p) || p <= 0 || p >= total) {
        alert('Na divisão, informe minutos a pagar na folha entre 1 e (total − 1).');
        return;
      }
      body.minutos_pago_folha = p;
    }
    setSavingExtra(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/horas-extras`, {
        method: 'POST', headers: jHdrs,
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setHoraExtraMin(''); setHoraExtraObs(''); setHoraExtraDestino('folha'); setHoraExtraPagoFolha('');
        await fetchEspelho();
      } else {
        const d = await r.json(); alert(d.error || 'Erro ao aprovar hora extra');
      }
    } catch { alert('Erro de conexão'); }
    finally { setSavingExtra(false); }
  };

  const handleCancelarExtra = async (id: number) => {
    if (!confirm('Cancelar aprovação desta hora extra?')) return;
    try {
      await fetch(`/api/funcionarios/horas-extras/${id}`, { method: 'DELETE', headers: hdrs });
      await fetchEspelho();
    } catch { alert('Erro ao cancelar'); }
  };

  const handleCompensacaoBancoEspelho = async () => {
    if (!sel || !gestaoData) return;
    const raw = parseInt(String(compBancoMin).replace(/\s/g, ''), 10);
    if (!Number.isFinite(raw) || raw <= 0) {
      alert('Informe quantos minutos debitar do banco (valor positivo).');
      return;
    }
    const saldoDisponivel = espelho?.resumo.saldoBancoHorasMin ?? 0;
    if (saldoDisponivel > 0 && raw > saldoDisponivel) {
      alert(`Saldo disponivel para compensacao: ${saldoDisponivel} min.`);
      return;
    }
    setCompBancoSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/banco-horas/movimentacoes`, {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({
          data_referencia: gestaoData,
          tipo: 'debit',
          minutos: raw,
          origem: 'espelho',
          observacao: compBancoObs.trim() || null,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setCompBancoMin('');
        setCompBancoObs('');
        await fetchEspelho();
        await abrirGestao(gestaoData);
      } else {
        alert((data as { error?: string }).error || 'Erro ao registrar compensação');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setCompBancoSaving(false);
    }
  };

  // ── PDF do espelho ───────────────────────────────────────────────────────
  const exportarPDF = () => {
    if(!espelho) return;
    const func = espelho.funcionario ?? espelho.func;
    if (!func) return;
    const diasExp = espelho.dias.filter(d=>d.isExpediente);
    const mesLabel = `${MESES[month-1]} ${year}`;
    const fmtMoney = (v:number) => `R$ ${(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')}`;
    const fmtH = (m:number) => { const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h${mn>0?` ${mn}min`:''}`:mn+'min'; };
    const statusLabel: Record<string,string> = { trabalhado:'Trabalhou', falta:'Falta', folga:'Folga', atestado:'Atestado', declaracao_parcial:'Aus. Parcial', sem_expediente:'—' };
    const statusColor: Record<string,string> = { trabalhado:'#16a34a', falta:'#dc2626', folga:'#2563eb', atestado:'#7c3aed', declaracao_parcial:'#d97706', sem_expediente:'#a1a1aa' };

    const heApurPdf = espelho.resumo.totalExtraMin ?? 0;
    const heFolhaPdf = espelho.resumo.totalExtraMinPagoFolha ?? 0;
    const heBancoMesPdf = espelho.resumo.totalExtraMinBancoMes ?? 0;
    const hePendPdf = espelho.resumo.totalExtraMinPendentes ?? 0;
    const saldoBancoPdf = espelho.resumo.saldoBancoHorasMin ?? 0;

    const linhas = diasExp.map(d=>`
      <tr>
        <td>${new Date(d.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</td>
        <td><span style="color:${statusColor[d.status]||'#666'};font-weight:700">${statusLabel[d.status]||d.status}</span></td>
        <td>${d.entrada||'—'}</td>
        <td>${d.saida||'—'}</td>
        <td>${d.atrasoMin>0?`<span style="color:#d97706;font-weight:700">+${d.atrasoMin}min</span>`:'—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Espelho de Ponto — ${func.nome} — ${mesLabel}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:12px}
        h1{font-size:18px;font-weight:900;margin-bottom:2px}
        .sub{color:#666;font-size:12px;margin-bottom:20px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
        .resumo{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:18px}
        .resumo-card{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}
        .resumo-label{font-size:9px;color:#71717a;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
        .resumo-val{font-size:16px;font-weight:900;margin-top:2px}
        table{width:100%;border-collapse:collapse}
        th{background:#f4f4f5;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;font-weight:700;border-bottom:1px solid #e4e4e7}
        td{padding:7px 10px;border-bottom:1px solid #f4f4f5;vertical-align:middle}
        tr:nth-child(even) td{background:#fafafa}
        .sign{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;font-size:11px;color:#888}
        .sign div{border-top:1px solid #ccc;padding-top:8px}
        @media print{body{padding:16px}}
      </style></head><body>
      <div class="header">
        <div>
          <h1>Espelho de Ponto</h1>
          <p class="sub">${mesLabel} · ${func.nome} · ${func.cargo}</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#555">
          ${func.horario_entrada||'08:00'} – ${func.horario_saida||'17:00'} · ${func.carga_horaria||8}h/dia<br/>
          Tolerância: ${func.tolerancia_minutos||10}min<br/>
          Admissão: ${func.data_admissao?new Date(func.data_admissao+'T12:00:00').toLocaleDateString('pt-BR'):'-'}
        </div>
      </div>
      <div class="resumo">
        <div class="resumo-card"><div class="resumo-label">Trabalhados</div><div class="resumo-val" style="color:#16a34a">${espelho.resumo.diasTrabalhados}</div></div>
        <div class="resumo-card"><div class="resumo-label">Faltas</div><div class="resumo-val" style="color:#dc2626">${espelho.resumo.totalFaltas}</div></div>
        <div class="resumo-card"><div class="resumo-label">Folgas</div><div class="resumo-val" style="color:#2563eb">${espelho.resumo.diasFolga}</div></div>
        <div class="resumo-card"><div class="resumo-label">Atestados</div><div class="resumo-val" style="color:#7c3aed">${espelho.resumo.diasAtestado}</div></div>
        <div class="resumo-card"><div class="resumo-label">Atraso</div><div class="resumo-val" style="color:#d97706">${espelho.resumo.totalAtrasoMin>0?fmtH(espelho.resumo.totalAtrasoMin):'0min'}</div></div>
        <div class="resumo-card"><div class="resumo-label">Desc. Total</div><div class="resumo-val" style="color:#dc2626;font-size:13px">${fmtMoney(espelho.resumo.totalDescontos)}</div></div>
      </div>
      <p style="font-size:10px;color:#52525b;margin:-10px 0 18px;line-height:1.55">
        <strong>Resumo HE / banco:</strong> HE apuradas ${heApurPdf} min (${fmtH(heApurPdf)}) · HE -&gt; folha ${heFolhaPdf} min · HE -&gt; banco ${heBancoMesPdf} min
        ${hePendPdf > 0 ? ` · HE pendentes de destino ${hePendPdf} min` : ''} · Saldo disponível para compensação ${saldoBancoPdf} min
      </p>
      <table>
        <thead><tr><th>Data</th><th>Status</th><th>Entrada</th><th>Saída</th><th>Atraso</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="sign">
        <div>Assinatura do Funcionário</div>
        <div>Assinatura do Responsável</div>
      </div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`;

    const w = window.open('','_blank','width=800,height:1000');
    if(!w) return;
    w.document.write(html); w.document.close();
  };

  const chgMonth = (d:number)=>{ let m=month+d,y=year; if(m>12){m=1;y++;}if(m<1){m=12;y--;} setMonth(m);setYear(y); };
  const funcSel = funcs.find(f=>f.id===sel);
  const espFunc = espelho ? (espelho.funcionario ?? espelho.func) : undefined;
  const tipoEsp = normalizeTipoContrato(espFunc?.tipo_contrato ?? 'fixo');
  const espBancoOk = espelho?.banco_horas_aplicavel !== false;
  const heBancoOk = hourBankApplicable(tipoEsp);
  const saldoBancoDisponivel = espelho?.resumo.saldoBancoHorasMin ?? 0;
  const atalhosCompensacao = [
    { min: 30, label: '30m' },
    { min: 60, label: '1h' },
    { min: 120, label: '2h' },
    { min: saldoBancoDisponivel, label: 'Saldo total' },
  ].filter((item, index, arr) =>
    item.min > 0 &&
    item.min <= saldoBancoDisponivel &&
    arr.findIndex((candidate) => candidate.min === item.min) === index
  );

  useEffect(() => {
    if (!heBancoOk && (horaExtraDestino === 'banco' || horaExtraDestino === 'dividir')) {
      setHoraExtraDestino('folha');
    }
  }, [heBancoOk, horaExtraDestino, gestaoData]);

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 overflow-x-auto overflow-y-hidden pb-0.5 -mx-0.5 px-0.5 sm:mx-0 sm:px-0 sm:overflow-visible sm:pb-0 touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <select value={sel} onChange={e=>setSel(Number(e.target.value))} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-medium focus:outline-none shrink-0 max-w-[min(100%,16rem)]">
          {funcs.filter(f=>f.status==='ativo').map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-2 shrink-0">
          <button onClick={()=>chgMonth(-1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold text-[var(--text-main)] w-28 text-center">{MESES[month-1]} {year}</span>
          <button onClick={()=>chgMonth(1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronRight size={16}/></button>
        </div>
        <button onClick={fetchEspelho} className="p-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] shrink-0"><RefreshCw size={15}/></button>
        {espelho && (
          <button onClick={exportarPDF} className="flex items-center gap-2 px-3 py-2 sm:px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0">
            <Download size={14}/>Exportar PDF
          </button>
        )}
        {onIrFolha && (
          <button
            type="button"
            onClick={onIrFolha}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] rounded-xl text-xs sm:text-sm font-bold text-[var(--text-main)] hover:bg-[var(--bg-main)] shrink-0"
          >
            <FileText size={14} />
            Folha deste mês
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 sm:p-4 min-w-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between min-w-0">
          <div className="max-w-3xl min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Espelho</p>
            <h2 className="mt-1 text-lg sm:text-xl font-black text-[var(--text-main)]">Operacao do dia e conferencia mensal de presenca</h2>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
              Aqui fica a area principal para resolver ponto, faltas, atrasos, folgas, atestados, ponto manual, HE e compensacao com banco.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-[var(--text-muted)] min-w-0 w-full lg:max-w-xs xl:min-w-[240px]">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Leitura rapida</p>
            <p className="mt-1 font-semibold text-[var(--text-main)]">Clique em um dia para resolver a operacao.</p>
            <p className="mt-1 text-xs leading-relaxed">
              O resumo e a lista abaixo servem para fechar o mes com clareza de presenca, descontos, HE e banco.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Resolver o dia</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">Ponto, ocorrencias, HE e compensacao sem sair do calendario.</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50/70 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0 sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-orange-700">Resumo do periodo</p>
            <p className="mt-1 text-sm font-semibold text-orange-950">HE apuradas, destino na folha, credito no banco e saldo para compensar.</p>
          </div>
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0 sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-cyan-800">Conferencia mensal</p>
            <p className="mt-1 text-sm font-semibold text-cyan-950">Visual do mes para validar presenca e encontrar pendencias rapido.</p>
          </div>
        </div>
      </div>

      {loading ? <LoadSpinner/> : espelho ? (
        <>
          {/* Resumo presença / descontos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3 min-w-0">
            <SCard label="Dias com ponto" value={espelho.resumo.diasTrabalhados} color="emerald" hint="Presencas validadas no espelho."/>
            <SCard label="Faltas" value={espelho.resumo.totalFaltas} color="red" hint="Dias sem comparecimento."/>
            <SCard label="Folgas" value={espelho.resumo.diasFolga} color="blue" hint="Folgas registradas no periodo."/>
            <SCard label="Atestados" value={espelho.resumo.diasAtestado} color="purple" hint="Ausencias justificadas por atestado."/>
            <SCard label="Atrasos somados" value={`${espelho.resumo.totalAtrasoMin}min`} color="amber" hint={fmtMinHuman(espelho.resumo.totalAtrasoMin)}/>
            <SCard label="Desconto por faltas" value={fmt(espelho.resumo.descontoFaltas)} color="red" small hint="Reflexo estimado na folha."/>
            <SCard label="Desconto por atrasos" value={fmt(espelho.resumo.descontoAtrasos)} color="amber" small hint="Reflexo estimado na folha."/>
          </div>

          {/* HE e banco — leitura explícita */}
          {(() => {
            const heApur = espelho.resumo.totalExtraMin ?? 0;
            const heFolha = espelho.resumo.totalExtraMinPagoFolha ?? 0;
            const heBancoMes = espelho.resumo.totalExtraMinBancoMes ?? 0;
            const hePend = espelho.resumo.totalExtraMinPendentes ?? 0;
            const saldoDisp = espelho.resumo.saldoBancoHorasMin ?? 0;
            const tudoNaFolha = heApur > 0 && heFolha >= heApur && heBancoMes === 0;
            return (
              <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-orange-50/80 to-cyan-50/40 p-3 sm:p-4 space-y-2 sm:space-y-3 min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                    Resumo HE e compensação · {MESES[month - 1]} {year}
                  </p>
                  {!espBancoOk && (
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">Banco não se aplica a contrato por evento</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-[var(--bg-card)]/90 border border-orange-100 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-orange-800/80">HE apuradas</p>
                    <p className="text-lg font-black text-orange-900 tabular-nums mt-0.5">{heApur} min</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">Total aprovado no Espelho neste período.</p>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-card)]/90 border border-orange-100 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-orange-800/80">HE -&gt; folha</p>
                    <p className="text-lg font-black text-orange-900 tabular-nums mt-0.5">{heFolha} min</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">Minutos enviados para pagamento na folha.</p>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-card)]/90 border border-cyan-100 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-cyan-900/85">HE -&gt; banco</p>
                    <p className="text-lg font-black text-cyan-950 tabular-nums mt-0.5">{heBancoMes} min</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">Minutos das HE deste período que viraram crédito no banco.</p>
                  </div>
                  {espBancoOk ? (
                    <div className="rounded-xl bg-[var(--bg-card)]/90 border border-cyan-200 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-wider text-cyan-900">Saldo disponível para compensação</p>
                      <p className="text-lg font-black text-cyan-950 tabular-nums mt-0.5">{saldoDisp} min</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">Saldo acumulado até agora. Use no calendário: dia -&gt; compensação.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[var(--bg-main)] border border-[var(--border)] px-3 py-2.5 flex items-center">
                      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Sem banco de horas neste perfil; HE ficam somente como registro operacional.</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)]/70 border border-[var(--border)]/80 rounded-xl px-3 py-2 leading-relaxed">
                  <span className="font-bold text-[var(--text-main)]">Como ler este resumo:</span> HE apuradas = total aprovado no Espelho. HE -&gt; folha = minutos enviados para pagamento.
                  HE -&gt; banco = creditos gerados neste periodo.
                  {hePend > 0 ? (
                    <> HE pendentes = aprovadas com &quot;Definir depois&quot; — ainda sem reflexo na folha ou no banco até você aplicar o destino na seção abaixo.</>
                  ) : null}{' '}
                  Saldo disponivel para compensacao = o que ainda pode ser usado nos dias seguintes.
                </p>
                {espBancoOk && saldoDisp === 0 && (
                  <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)]/70 border border-[var(--border)]/80 rounded-xl px-3 py-2 leading-relaxed">
                    {tudoNaFolha ? (
                      <>
                        <span className="font-bold text-[var(--text-main)]">Por que o banco está em zero?</span> Neste mês, todas as horas extras foram para a folha;
                        nada foi creditado no banco pelos lançamentos de HE. O saldo mostrado é o disponível no banco em geral (créditos anteriores já
                        compensados ou inexistentes).
                      </>
                    ) : heBancoMes > 0 ? (
                      <>
                        <span className="font-bold text-[var(--text-main)]">Saldo zerado com crédito no mês?</span> É possível se houve compensações (débitos) ou se o
                        saldo anterior já tinha sido usado. Confira a lista de movimentações abaixo.
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-[var(--text-main)]">Saldo zerado.</span> Não há minutos acumulados no banco para compensar. Créditos entram ao
                        aprovar HE com destino &quot;banco&quot; ou por lançamento manual na Folha (conferência).
                      </>
                    )}
                  </p>
                )}
              </div>
            );
          })()}

          {(espelho.horas_extras_pendentes?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4 space-y-3 min-w-0">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-900">Horas extras pendentes</p>
                <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                  Lançamentos aprovados com destino &quot;Definir depois&quot;. Não entram na folha nem geram crédito no banco até você escolher folha, banco ou
                  divisão.
                </p>
              </div>
              <div className="space-y-2">
                {espelho.horas_extras_pendentes!.map((pe) => (
                  <React.Fragment key={pe.id}>
                    <PendenteHoraExtraRow
                      item={pe}
                      heBancoOk={heBancoOk}
                      jHdrs={jHdrs as Record<string, string>}
                      onApplied={() => {
                        void fetchEspelho();
                        if (gestaoData) void abrirGestao(gestaoData);
                      }}
                    />
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {espBancoOk && espelho.banco_horas_mes && espelho.banco_horas_mes.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-2 bg-cyan-50 border-b border-cyan-100 text-[10px] font-black text-cyan-800 uppercase tracking-wider">
                Banco de horas - movimentações do mês
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-[var(--border)] text-xs">
                {espelho.banco_horas_mes.map((m) => (
                  <div key={m.id} className="px-4 py-2 flex justify-between gap-2 text-[var(--text-muted)]">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">{fmtDate(m.data_referencia)}</span>
                    <span className="flex-1 truncate">{HOUR_BANK_MOVEMENT_LABEL[m.tipo] || m.tipo} · {HOUR_BANK_ORIGIN_LABEL[m.origem] || m.origem}{m.observacao ? ` - ${m.observacao}` : ''}</span>
                    <span className={`font-black tabular-nums shrink-0 ${
                      m.tipo === 'manual_adjust'
                        ? m.minutos < 0 ? 'text-red-600' : 'text-emerald-600'
                        : m.tipo === 'debit' || m.tipo === 'converted_to_payroll'
                          ? 'text-red-600'
                          : 'text-emerald-600'
                    }`}>
                      {m.tipo === 'manual_adjust'
                        ? `${m.minutos > 0 ? '+' : ''}${m.minutos}m`
                        : m.tipo === 'debit' || m.tipo === 'converted_to_payroll'
                          ? `−${Math.abs(m.minutos)}m`
                          : `+${Math.abs(m.minutos)}m`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calendário */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden min-w-0">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-[var(--border)] bg-[var(--bg-main)]/80">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Operacao do dia</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">Calendario para resolver ponto, ocorrencias, HE e compensacao.</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Clique em um dia para abrir a gestao do dia e corrigir o que ficou pendente.</p>
            </div>
            <div className="overflow-x-auto min-w-0 overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
              <div className="min-w-[520px]">
            <div className="grid grid-cols-7 border-b border-[var(--border)]">
              {DIAS_LABEL.map(d=><div key={d} className="py-2 text-center text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {(()=>{
                const first = new Date(`${year}-${String(month).padStart(2,'0')}-01`).getDay();
                const cells = [...Array(first).fill(null), ...espelho.dias];
                return cells.map((dia,i)=>!dia?(
                  <div key={`e${i}`} className="aspect-square border-r border-b border-[var(--border)]/40"/>
                ):(
                  <div key={dia.data} onClick={()=>abrirGestao(dia.data)}
                    className={`aspect-square border-r border-b border-[var(--border)] p-1 cursor-pointer hover:ring-2 hover:ring-inset hover:ring-zinc-400 transition-all ${dia.status==='sem_expediente'&&!dia.eventos?.length?'bg-[var(--bg-main)]/50':''}`}>
                    <div className="flex flex-col h-full">
                      <span className="text-[10px] font-bold text-[var(--text-muted)]">{dia.dia}</span>
                      {dia.isExpediente && dia.status !== 'futuro' && <div className="flex-1 flex flex-col justify-center items-center gap-0.5">
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${STATUS_COLOR[dia.status]||''}`}>{STATUS_LABEL[dia.status]}</span>
                        {dia.entrada&&<span className="text-[8px] text-[var(--text-muted)]">E: {dia.entrada?.slice(0,5)}</span>}
                        {dia.saida&&<span className="text-[8px] text-[var(--text-muted)]">S: {dia.saida?.slice(0,5)}</span>}
                        {dia.atrasoMin>0&&<span className="text-[8px] text-amber-600 font-bold">+{dia.atrasoMin}m atr.</span>}
                        {/* Badge de hora extra aprovada */}
                        {dia.extraAprov && (
                          <span
                            className={`text-[8px] font-black px-1 py-0.5 rounded border ${
                              dia.extraAprov.destino === 'pendente'
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-orange-100 text-orange-700 border-orange-200'
                            }`}
                          >
                            HE +{dia.extraAprov.minutos}m{(dia.extraAprov.quantidade ?? 1) > 1 ? ` (${dia.extraAprov.quantidade})` : ''}
                            {dia.extraAprov.destino === 'pendente' ? ' · ?' : ''}
                          </span>
                        )}
                        {/* Indicador de saída tardia ainda não aprovada como extra */}
                        {!dia.extraAprov && dia.saidaRealExtraMin && dia.saidaRealExtraMin > 0 && (
                          <span className="text-[8px] text-[var(--text-muted)] italic">+{dia.saidaRealExtraMin}m?</span>
                        )}
                      </div>}
                      {/* Folga/atestado em dias fora do expediente */}
                      {!dia.isExpediente && dia.eventos?.some((e:any)=>['folga','atestado'].includes(e.tipo)) && (
                        <div className="flex-1 flex flex-col justify-center items-center gap-0.5">
                          {dia.eventos.filter((e:any)=>['folga','atestado'].includes(e.tipo)).map((e:any,ei:number)=>(
                            <span key={ei} className={`text-[9px] font-bold px-1 py-0.5 rounded border ${STATUS_COLOR[e.tipo]||''}`}>
                              {STATUS_LABEL[e.tipo]||e.tipo}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
              </div>
            </div>
          </div>

          {/* Tabela detalhada */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden min-w-0">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Conferencia detalhada</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">Linha a linha para revisar presenca e agir rapido quando houver divergencia.</p>
            </div>
            <div className="overflow-x-auto min-w-0 overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
              <div className="min-w-[720px]">
            <div className="grid grid-cols-7 px-3 sm:px-4 py-2 bg-[var(--bg-main)] border-b border-[var(--border)] text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider">
              <span>Data</span><span>Status</span><span>Entrada</span><span>Saída</span><span>Atraso</span><span>HE</span><span>Ação no dia</span>
            </div>
            <div className="divide-y divide-zinc-100 max-h-[min(18rem,50vh)] sm:max-h-72 overflow-y-auto overscroll-y-contain">
              {espelho.dias
                .filter(d => d.isExpediente || d.eventos?.some((e:any) => ['folga','atestado'].includes(e.tipo)))
                .map(dia => {
                  const eventoDestaque = dia.eventos?.find((e:any) => ['folga','atestado'].includes(e.tipo));
                  return (
                    <div key={dia.data} className="grid grid-cols-7 px-3 sm:px-4 py-2.5 text-xs hover:bg-[var(--bg-main)] items-center">
                      <span className="font-medium text-[var(--text-muted)]">{fmtDate(dia.data)}</span>
                      <div className="flex flex-col gap-0.5">
                        <span className={`w-fit px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[dia.status]}`}>{STATUS_LABEL[dia.status]}</span>
                        {eventoDestaque?.observacao && (
                          <span className="text-[9px] text-[var(--text-muted)] truncate max-w-[80px]" title={eventoDestaque.observacao}>{eventoDestaque.observacao}</span>
                        )}
                      </div>
                      <span className="text-[var(--text-muted)]">{dia.entrada ? dia.entrada.slice(0,5) : '—'}</span>
                      <span className="text-[var(--text-muted)]">{dia.saida  ? dia.saida.slice(0,5)  : '—'}</span>
                      <span className={dia.atrasoMin>0?'text-amber-600 font-bold':'text-zinc-300'}>{dia.atrasoMin>0?`${dia.atrasoMin}min`:'—'}</span>
                      <span>
                        {dia.extraAprov
                          ? <span className="text-orange-600 font-bold text-[10px]">+{dia.extraAprov.minutos}min ✓</span>
                          : dia.saidaRealExtraMin && dia.saidaRealExtraMin > 0
                            ? <span className="text-[var(--text-muted)] text-[10px] italic">+{dia.saidaRealExtraMin}m?</span>
                            : <span className="text-zinc-300">—</span>
                        }
                      </span>
                      <div className="flex gap-2">
                        <button onClick={()=>setAddEvento(dia.data)} className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-[10px] font-bold">+ ocorrencia</button>
                        <button onClick={()=>abrirGestao(dia.data)} className="text-blue-500 hover:text-blue-700 text-[10px] font-bold">resolver dia</button>
                      </div>
                    </div>
                  );
                })}
            </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ── Modal: Evento ── */}
      <Modal open={!!addEvento} onClose={()=>setAddEvento(null)} title={`Ocorrência do dia — ${addEvento?fmtDate(addEvento):''}`}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Registre aqui faltas, folgas, atestados ou ausência parcial para deixar o dia coerente no Espelho.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_EVENTO.map(t=><button key={t.value} onClick={()=>setFormEvento({...formEvento,tipo:t.value})} className={`py-2 rounded-xl text-xs font-bold border transition-all ${formEvento.tipo===t.value?'bg-zinc-900 text-white border-zinc-900':'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'}`}>{t.label}</button>)}
          </div>
          {formEvento.tipo==='declaracao_parcial'&&<FInput label="Horas ausentes" value={formEvento.horas_ausentes} onChange={v=>setFormEvento({...formEvento,horas_ausentes:v})} placeholder="Ex: 2.5"/>}
          <FInput label="Observação (opcional)" value={formEvento.observacao} onChange={v=>setFormEvento({...formEvento,observacao:v})} placeholder="..."/>
        </div>
        <MBtns onCancel={()=>setAddEvento(null)} onConfirm={handleAddEvento} saving={false} label="Salvar ocorrência"/>
      </Modal>

      {/* ── Modal: Gestão de Pontos do Dia ── */}
      <Modal open={!!gestaoData} onClose={()=>{setGestaoData(null);setEditPonto(null);setCompBancoMin('');setCompBancoObs('');}} title={`Gestão do dia — ${funcSel?.nome||''} · ${gestaoData?fmtDate(gestaoData):''}`} wide>
        {loadingPontos ? <LoadSpinner/> : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Resolver este dia</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">Ajuste ponto, registre ausências, aprove HE e use banco de horas sem sair do Espelho.</p>
            </div>

            {/* Registros existentes */}
            <div>
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-2">Ponto do dia</p>
              {pontosRaw.length === 0 ? (
                <div className="text-center py-6 text-sm text-[var(--text-muted)] bg-[var(--bg-main)] rounded-xl">Nenhum ponto registrado neste dia. Use Ponto manual se precisar corrigir a operação.</div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-[var(--border)] rounded-xl overflow-hidden">
                  {pontosRaw.map(p=>(
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-card)] hover:bg-[var(--bg-main)]">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${p.tipo==='entrada'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>
                        {p.tipo==='entrada'?'▲ Entrada':'▼ Saída'}
                      </span>
                      <span className="font-mono font-bold text-[var(--text-main)] text-sm">{p.hora}</span>
                      {p.ip==='manual-admin'&&<span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Manual</span>}
                      <span className="text-[10px] text-[var(--text-muted)] flex-1">{p.ip!=='manual-admin'?`IP: ${p.ip}`:''}</span>
                      <div className="flex gap-2">
                        {/* Editar */}
                        {editPonto?.id===p.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={editHora.slice(0,5)}
                              onChange={e=>setEditHora(e.target.value)}
                              className="px-2 py-1 border border-[var(--border)] rounded-lg text-sm font-mono focus:outline-none focus:border-zinc-400"
                            />
                            <select value={editTipo} onChange={e=>setEditTipo(e.target.value)} className="px-2 py-1 border border-[var(--border)] rounded-lg text-xs focus:outline-none">
                              <option value="entrada">Entrada</option>
                              <option value="saida">Saída</option>
                            </select>
                            <button onClick={handleEditarPonto} disabled={saving} className="px-3 py-1 bg-zinc-900 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                              {saving?'...':'Salvar'}
                            </button>
                            <button onClick={()=>setEditPonto(null)} className="px-2 py-1 bg-zinc-100 rounded-lg text-xs font-bold">✕</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={()=>{setEditPonto(p);setEditHora(p.hora);setEditTipo(p.tipo);}}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-main)] hover:bg-zinc-100">
                              <Pencil size={10}/>Editar
                            </button>
                            <button onClick={()=>handleDeletarPonto(p.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100">
                              <Trash2 size={10}/>Deletar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conceder Folga Extra */}
            {(() => {
              const diaEspelho = espelho?.dias.find(d => d.data === gestaoData);
              const eventoFolga = diaEspelho?.eventos?.find((e:any) => e.tipo === 'folga');
              const temFolga = !!eventoFolga;
              return (
                <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Folga / descanso</p>
                    {temFolga && <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">✓ Folga registrada</span>}
                  </div>
                  <p className="text-[11px] text-blue-950/80 mb-3 leading-relaxed">
                    Use quando a resolução do dia for folga compensatória, descanso combinado ou liberação formal.
                  </p>
                  {temFolga ? (
                    <div className="flex items-center justify-between bg-[var(--bg-card)] border border-blue-200 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-sm font-black text-blue-700">Folga concedida</p>
                        {eventoFolga?.observacao && <p className="text-xs text-[var(--text-muted)] mt-0.5">{eventoFolga.observacao}</p>}
                      </div>
                      <button
                        onClick={async () => {
                          if (!eventoFolga?.id) return;
                          if (!confirm('Remover folga deste dia?')) return;
                          try {
                            await fetch(`/api/funcionarios/eventos/${eventoFolga.id}`, { method: 'DELETE', headers: hdrs });
                            await abrirGestao(gestaoData!); await fetchEspelho();
                          } catch { alert('Erro ao remover folga'); }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={10}/> Remover
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Motivo (opcional)</label>
                        <input type="text" id="folga-obs-input"
                          placeholder="Ex: Folga compensatória, banco de horas..."
                          className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!gestaoData || !sel) return;
                          const obs = (document.getElementById('folga-obs-input') as HTMLInputElement)?.value || '';
                          try {
                            const r = await fetch(`/api/funcionarios/${sel}/eventos`, {
                              method: 'POST', headers: jHdrs,
                              body: JSON.stringify({ data: gestaoData, tipo: 'folga', horas_ausentes: 0, observacao: obs }),
                            });
                            if (r.ok) { await abrirGestao(gestaoData!); await fetchEspelho(); }
                            else { const d = await r.json(); alert(d.error || 'Erro ao registrar folga'); }
                          } catch { alert('Erro de conexão'); }
                        }}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap"
                      >
                        <Check size={14}/> Conceder Folga
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Compensação: debitar banco nesta data (mesmo endpoint da Folha) */}
            {espBancoOk && (
              <div className="border border-dashed border-cyan-300 rounded-xl p-4 bg-cyan-50/40">
                <p className="text-[10px] font-black text-cyan-800 uppercase tracking-wider mb-1">Compensação com banco</p>
                <p className="text-[11px] text-cyan-950/80 mb-3 leading-relaxed">
                  Use quando o colaborador vai compensar horas nesta data. Isso baixa o saldo e deixa o ajuste rastreado no Espelho.
                  Se o dia também precisa aparecer como folga, use <span className="font-bold">Conceder folga</span> acima.
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-cyan-900">
                    Saldo disponível:{' '}
                    <span className="tabular-nums font-black">{saldoBancoDisponivel} min</span>
                    <span className="font-medium text-cyan-800/80"> ({fmtMinHuman(saldoBancoDisponivel)})</span>
                  </span>
                </div>
                {saldoBancoDisponivel <= 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-card)]/60 rounded-lg px-3 py-2 border border-cyan-100">
                    Sem saldo no banco. Credite HE para o banco ao aprovar hora extra, ou use a Folha apenas para ajuste administrativo.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {atalhosCompensacao.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {atalhosCompensacao.map((atalho) => (
                          <button
                            key={`${atalho.label}-${atalho.min}`}
                            type="button"
                            onClick={() => setCompBancoMin(String(atalho.min))}
                            className="px-3 py-1.5 rounded-full border border-cyan-200 bg-[var(--bg-card)] text-[11px] font-bold text-cyan-700 hover:bg-cyan-100 transition-all"
                          >
                            {atalho.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
                    <div className="w-full sm:w-32">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Quanto vai compensar</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={compBancoMin}
                        onChange={(e) => setCompBancoMin(e.target.value)}
                        placeholder="ex: 60"
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
                      />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Observação (opcional)</label>
                      <input
                        type="text"
                        value={compBancoObs}
                        onChange={(e) => setCompBancoObs(e.target.value)}
                        placeholder="Ex: Folga compensatória, saída antecipada"
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCompensacaoBancoEspelho}
                      disabled={compBancoSaving || !compBancoMin.trim()}
                      className="px-5 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all whitespace-nowrap"
                    >
                      {compBancoSaving ? 'Salvando...' : 'Usar saldo nesta data'}
                    </button>
                  </div>
                  </div>
                )}
              </div>
            )}

            {/* Inserir ponto manual */}
            <div className="border border-dashed border-[var(--border)] rounded-xl p-4 bg-[var(--bg-main)]">
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-3">Ponto manual</p>
              <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
                Use quando precisar corrigir um registro que não entrou no dia. O lançamento fica marcado para auditoria.
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Tipo</label>
                  <div className="flex gap-2">
                    {(['entrada','saida'] as const).map(t=>(
                      <button key={t} onClick={()=>setManualTipo(t)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${manualTipo===t?(t==='entrada'?'bg-emerald-600 text-white border-emerald-600':'bg-blue-600 text-white border-blue-600'):'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'}`}>
                        {t==='entrada'?'▲ Entrada':'▼ Saída'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Horário</label>
                  <input
                    type="time"
                    value={manualHora}
                    onChange={e=>setManualHora(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
                <button
                  onClick={handlePontoManual}
                  disabled={saving||!manualHora}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all flex items-center gap-2"
                >
                  {saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<Check size={14}/>}
                  Registrar ponto
                </button>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-2">Registros manuais ficam marcados para auditoria.</p>
            </div>

            {/* Hora Extra */}
            {(() => {
              const diaEspelho = espelho?.dias.find(d => d.data === gestaoData);
              const extraExistente = diaEspelho?.extraAprov || null;
              const extraLancamentos = extraExistente?.itens?.length ? extraExistente.itens : extraExistente ? [extraExistente] : [];
              return (
                <div className="border border-dashed border-orange-300 rounded-xl p-4 bg-orange-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-wider">Aprovar hora extra (destino)</p>
                    {extraExistente && (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full border border-orange-200">
                        ✓ Aprovada: {extraExistente.minutos}min
                      </span>
                    )}
                  </div>

                  {/* Informativo: saída além do horário */}
                  {diaEspelho?.saidaRealExtraMin && diaEspelho.saidaRealExtraMin > 0 && (
                    <div className="mb-3 flex items-center gap-2 bg-[var(--bg-card)] border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                      <span className="text-base">⏱</span>
                      <span>Saída registrada <strong>{diaEspelho.saidaRealExtraMin} min além</strong> do horário previsto. Aprove abaixo se for hora extra.</span>
                    </div>
                  )}

                  {extraExistente ? (
                    /* Já aprovada — mostra info e botão de cancelar */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-[var(--bg-card)] border border-orange-200 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-sm font-black text-orange-700">{extraExistente.minutos} minutos aprovados</p>
                          {(() => {
                            const d = resolveHoraExtraDestino(extraExistente);
                            if (d === 'pendente') {
                              return (
                                <p className="text-[11px] text-amber-800 mt-1">
                                  Pendente: não entra na folha nem no banco. Defina o destino na seção <strong>Horas extras pendentes</strong> acima do
                                  calendário.
                                </p>
                              );
                            }
                            const pagoF =
                              extraExistente.minutos_pago_folha == null
                                ? extraExistente.minutos
                                : Math.min(
                                    extraExistente.minutos,
                                    Math.max(0, Number(extraExistente.minutos_pago_folha))
                                  );
                            return (
                              <p className="text-[11px] text-orange-600/90 mt-1">
                                Na folha: {pagoF} min · Banco: {Math.max(0, extraExistente.minutos - pagoF)} min
                                {extraExistente.minutos_pago_folha == null ? (
                                  <span className="text-[var(--text-muted)]"> (legado: destino não gravado — considerado 100% folha)</span>
                                ) : null}
                              </p>
                            );
                          })()}
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {horaExtraDestinoLabel(resolveHoraExtraDestino(extraExistente))}
                          </p>
                          {extraExistente.observacao && <p className="text-xs text-[var(--text-muted)] mt-0.5">{extraExistente.observacao}</p>}
                        </div>
                        {(extraExistente.quantidade ?? 1) <= 1 && <button
                          onClick={() => handleCancelarExtra(extraExistente.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                        >
                          <Trash2 size={10}/> Cancelar aprovação
                        </button>
                        }
                      </div>
                      {extraLancamentos.length > 1 && (
                        <div className="space-y-2">
                          {extraLancamentos.map((item) => {
                            const d = resolveHoraExtraDestino(item);
                            const pagoF =
                              item.minutos_pago_folha == null
                                ? item.minutos
                                : Math.min(item.minutos, Math.max(0, Number(item.minutos_pago_folha)));
                            return (
                              <div key={item.id} className="flex items-center justify-between bg-[var(--bg-card)] border border-orange-200 rounded-xl px-4 py-3 gap-3">
                                <div>
                                  <p className="text-sm font-black text-orange-700">{item.minutos} minutos aprovados</p>
                                  {d === 'pendente' ? (
                                    <p className="text-[11px] text-amber-800 mt-1">
                                      Pendente: defina o destino na seção <strong>Horas extras pendentes</strong>.
                                    </p>
                                  ) : (
                                  <p className="text-[11px] text-orange-600/90 mt-1">
                                    Na folha: {pagoF} min · Banco: {Math.max(0, item.minutos - pagoF)} min
                                    {item.minutos_pago_folha == null ? (
                                      <span className="text-[var(--text-muted)]"> (legado: destino nao gravado, considerado 100% folha)</span>
                                    ) : null}
                                  </p>
                                  )}
                                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                    {horaExtraDestinoLabel(resolveHoraExtraDestino(item))}
                                  </p>
                                  {item.observacao && <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.observacao}</p>}
                                </div>
                                <button
                                  onClick={() => handleCancelarExtra(item.id)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all shrink-0"
                                >
                                  <Trash2 size={10}/> Cancelar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Ainda não aprovada — formulário de aprovação */
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                          Destino da hora extra neste dia
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { k: 'folha' as const, label: 'Pagar na folha' },
                            ...(heBancoOk
                              ? ([
                                  { k: 'banco' as const, label: 'Enviar ao banco' },
                                  { k: 'dividir' as const, label: 'Dividir (folha + banco)' },
                                ] as const)
                              : []),
                            { k: 'pendente' as const, label: 'Definir depois' },
                          ]).map((o) => (
                            <button
                              key={o.k}
                              type="button"
                              onClick={() => setHoraExtraDestino(o.k)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                horaExtraDestino === o.k
                                  ? 'bg-orange-500 text-white border-orange-500'
                                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)] hover:border-orange-200'
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                          Defina aqui se a hora extra será paga na folha, virará crédito no banco, será dividida entre os dois ou ficará pendente até decidir
                          (sem reflexo na folha ou no banco).
                        </p>
                      </div>
                      {horaExtraDestino === 'dividir' && (
                        <div className="w-40">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Minutos que vão para a folha</label>
                          <input
                            type="number"
                            min="1"
                            max="479"
                            value={horaExtraPagoFolha}
                            onChange={(e) => setHoraExtraPagoFolha(e.target.value)}
                            placeholder="ex: 60"
                            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-36">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Minutos extras</label>
                          <input
                            type="number"
                            min="1"
                            max="480"
                            value={horaExtraMin}
                            onChange={e => setHoraExtraMin(e.target.value)}
                            placeholder={diaEspelho?.saidaRealExtraMin ? String(diaEspelho.saidaRealExtraMin) : '30'}
                            className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
                          />
                        </div>
                        <div className="flex-1 min-w-[160px]">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Observação (opcional)</label>
                          <input
                            type="text"
                            value={horaExtraObs}
                            onChange={e => setHoraExtraObs(e.target.value)}
                            placeholder="Ex: Cobertura de turno, evento especial..."
                            className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
                          />
                        </div>
                        <button
                          onClick={handleAprovarExtra}
                          disabled={savingExtra || !horaExtraMin}
                          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all flex items-center gap-2 whitespace-nowrap"
                        >
                          {savingExtra ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={14}/>}
                          Aprovar hora extra
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-orange-500/70 mt-2">
                    {heBancoOk
                      ? 'O que for para a folha entra como pagamento. O que for para o banco vira saldo disponível para compensar depois. “Definir depois” mantém a HE aprovada sem entrar na folha nem no banco até você aplicar o destino na seção de pendentes.'
                      : 'Contrato por evento: horas extras ficam como referência de ponto; use “Definir depois” se ainda não souber como pagar neste mês.'}
                  </p>
                </div>
              );
            })()}

          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={()=>{setGestaoData(null);setEditPonto(null);}} className="px-5 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Fechar</button>
        </div>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA FOLHA
// ═══════════════════════════════════════════════════════════════════════════════
function TabFolha({ token, onIrEspelho }: { token: string; onIrEspelho?: () => void }) {
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [sel, setSel] = useState<number|''>('');
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [folha, setFolha] = useState<Folha|null>(null);
  const [loading, setLoading] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [payForm, setPayForm] = useState({ tipo: 'partial_payment' as 'advance' | 'partial_payment' | 'final_payment', valor: '', observacao: '' });
  const [bancoSaving, setBancoSaving] = useState(false);
  const [bancoTipo, setBancoTipo] = useState<'debit' | 'credit' | 'manual_adjust' | 'converted_to_payroll'>('debit');
  const [bancoMin, setBancoMin] = useState('');
  const [bancoDataRef, setBancoDataRef] = useState('');
  const [bancoObs, setBancoObs] = useState('');
  const hdrs = { Authorization:`Bearer ${token}` };
  const jHdrs = { ...hdrs, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch('/api/funcionarios', { headers: hdrs }).then(async (r) => {
      const d = await r.json();
      if (!r.ok || !Array.isArray(d)) {
        setFuncs([]);
        return;
      }
      setFuncs(d);
      const ativos = d.filter((f: Func) => f.status === 'ativo');
      if (ativos.length) setSel(ativos[0].id);
    });
  }, []);
  useEffect(()=>{ if(sel)fetchFolha(); },[sel,month,year]);
  useEffect(() => {
    setBancoDataRef(`${year}-${String(month).padStart(2, '0')}-01`);
  }, [month, year]);

  const fetchFolha = async () => { setLoading(true); try{const r=await fetch(`/api/funcionarios/${sel}/folha?month=${month}&year=${year}`,{headers:hdrs});setFolha(await r.json());}catch{}finally{setLoading(false);} };

  const printReceipt = (pay: FolhaPagamentoRow) => {
    if (!folha?.funcionario) return;
    const periodLabel = folha.competencia
      ? `Competência ${folha.competencia.referencia}`
      : `${MESES[month - 1]} ${year}`;
    const payments = [...(folha.payroll_payments || [])].sort((a, b) => a.id - b.id);
    const ix = payments.findIndex((p) => p.id === pay.id);
    const totalAfter = payments.slice(0, ix + 1).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const netL =
      folha.managerial?.net_adjusted ??
      folha.payroll_payment_summary?.net_liquid ??
      Math.max(0, folha.payroll?.totals.net ?? folha.salarioLiquido);
    const totalAfterR = Math.round(totalAfter * 100) / 100;
    const balanceAfter = Math.max(0, Math.round((netL - totalAfterR) * 100) / 100);
    const paidAt = pay.created_at
      ? new Date(pay.created_at).toLocaleString('pt-BR')
      : '-';
    const html = generatePayrollReceiptHtml({
      employeeName: folha.funcionario.nome,
      periodLabel,
      reciboNumero: pay.recibo_numero || `RHF-${pay.id}`,
      tipo: pay.tipo,
      valor: Number(pay.valor) || 0,
      paidAtLabel: paidAt,
      observacao: pay.observacao,
      netLiquid: netL,
      totalPaidAfter: totalAfterR,
      balanceAfter,
    });
    const w = window.open('', '_blank', 'width=750,height=950');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const registrarPagamento = async () => {
    if (!sel) return;
    const valor = parseFloat(payForm.valor.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      alert('Informe um valor válido.');
      return;
    }
    setSavingPay(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/folha/pagamentos`, {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({
          month,
          year,
          tipo: payForm.tipo,
          valor,
          observacao: payForm.observacao || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error || 'Erro ao registrar');
        return;
      }
      setPayForm((f) => ({ ...f, valor: '', observacao: '' }));
      await fetchFolha();
    } catch {
      alert('Erro de rede');
    } finally {
      setSavingPay(false);
    }
  };

  const handlePrint = () => {
    if (!folha) return;
    const t = folha.contract_profile?.tipo ?? normalizeTipoContrato(folha.funcionario.tipo_contrato);
    if (isEvento(t) || folha.pagamentos_sem_teto_folha) {
      alert('Funcionário por evento não utiliza impressão de folha mensal CLT neste módulo.');
      return;
    }
    const periodLabel = folha.competencia
      ? `Competência ${folha.competencia.referencia}`
      : `${MESES[month - 1]} ${year}`;
    const earningsPdf =
      folha.payroll?.earnings.map((e) => ({ label: e.label, amount: e.amount })) ?? [
        { label: 'Salário Base', amount: folha.salarioBruto },
        ...(folha.totalExtraMin > 0
          ? [{ label: `Horas Extras (${folha.totalExtraMin} min · 50% CLT)`, amount: folha.valorExtras ?? 0 }]
          : []),
      ];
    const deductionsPdf =
      folha.payroll?.deductions.map((d) => ({ label: d.label, amount: d.amount })) ?? [
        { label: 'INSS (11% estimado)', amount: folha.inss },
        { label: `Faltas (${folha.totalFaltas} dia${folha.totalFaltas !== 1 ? 's' : ''})`, amount: folha.descontoFaltas },
        { label: `Atrasos (${folha.totalAtrasoMin} min)`, amount: folha.descontoAtrasos },
        ...(folha.descontoParcial > 0
          ? [{ label: `Ausência parcial (${folha.horasAusentesParcial} h)`, amount: folha.descontoParcial }]
          : []),
        ...(folha.totalAdiantamentos > 0
          ? [{ label: `Adiantamentos (${folha.adiantamentos.length})`, amount: folha.totalAdiantamentos }]
          : []),
      ];
    const net = folha.managerial?.net_adjusted ?? folha.payroll?.totals.net ?? folha.salarioLiquido;
    const html = generatePayrollPdf({
      employeeName: folha.funcionario.nome,
      periodLabel,
      earnings: earningsPdf,
      deductions: deductionsPdf,
      net: Math.max(0, net),
    });
    const w = window.open('', '_blank', 'width=750,height=950');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const chgMonth = (d:number)=>{ let m=month+d,y=year; if(m>12){m=1;y++;}if(m<1){m=12;y--;} setMonth(m);setYear(y); };

  const folhaView = useMemo(() => {
    if (!folha) return null;
    if (folha.payroll) {
      return {
        earnings: folha.payroll.earnings,
        deductions: folha.payroll.deductions,
        gross: folha.payroll.totals.gross,
        dedTotal: folha.payroll.totals.deductions,
        net: folha.managerial?.net_adjusted ?? folha.payroll.totals.net,
        referencia: folha.competencia?.referencia ?? folha.mes,
        periodRange:
          folha.competencia &&
          `${new Date(folha.competencia.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(folha.competencia.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}`,
      };
    }
    const earnings = [
      { type: 'salary', label: 'Salário Base', amount: folha.salarioBruto },
      ...((folha.totalExtraMinPago ?? folha.totalExtraMin) > 0
        ? [{ type: 'overtime', label: `Horas Extras (${folha.totalExtraMinPago ?? folha.totalExtraMin} min · 50% CLT)`, amount: folha.valorExtras ?? 0 }]
        : []),
    ];
    const deductions = [
      { type: 'inss', label: 'INSS (estimado)', amount: folha.inss },
      { type: 'absences', label: `Faltas (${folha.totalFaltas} dia${folha.totalFaltas !== 1 ? 's' : ''})`, amount: folha.descontoFaltas },
      { type: 'late', label: `Atrasos (${folha.totalAtrasoMin} min)`, amount: folha.descontoAtrasos },
      ...(folha.descontoParcial > 0
        ? [{ type: 'partial_absence', label: `Ausência parcial (${folha.horasAusentesParcial} h)`, amount: folha.descontoParcial }]
        : []),
      ...(folha.totalAdiantamentos > 0
        ? [{ type: 'advances', label: `Adiantamentos (${folha.adiantamentos.length})`, amount: folha.totalAdiantamentos }]
        : []),
    ];
    const gross = earnings.reduce((s, e) => s + e.amount, 0);
    return {
      earnings,
      deductions,
      gross,
      dedTotal: folha.totalDescontos,
      net: folha.managerial?.net_adjusted ?? folha.salarioLiquido,
      referencia: folha.mes,
      periodRange: undefined as string | undefined,
    };
  }, [folha]);

  const paySummary = useMemo(() => {
    if (!folha) return null;
    if (folha.payroll_payment_summary) return folha.payroll_payment_summary;
    const net = Math.max(
      0,
      folha.payroll?.totals.net_gerencial ?? folha.payroll?.totals.net ?? folha.salarioLiquido
    );
    return { net_liquid: net, total_paid: 0, balance_due: net, status: 'pending' as const };
  }, [folha]);

  const payStatusClass =
    paySummary?.status === 'paid'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : paySummary?.status === 'partial'
        ? 'bg-amber-100 text-amber-900 border-amber-200'
        : 'bg-zinc-100 text-[var(--text-muted)] border-[var(--border)]';

  const registrarMovBanco = async () => {
    if (!sel || !bancoDataRef) return;
    const raw = parseInt(String(bancoMin).replace(/\s/g, ''), 10);
    if (bancoTipo === 'manual_adjust') {
      if (!Number.isFinite(raw) || raw === 0) {
        alert('Ajuste manual: informe minutos (positivo aumenta o banco, negativo reduz).');
        return;
      }
    } else if (!Number.isFinite(raw) || raw <= 0) {
      alert('Informe uma quantidade positiva de minutos.');
      return;
    }
    const origem =
      bancoTipo === 'debit' ? 'compensacao' : bancoTipo === 'converted_to_payroll' ? 'folha' : 'manual';
    setBancoSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/banco-horas/movimentacoes`, {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({
          data_referencia: bancoDataRef,
          tipo: bancoTipo,
          minutos: bancoTipo === 'manual_adjust' ? raw : Math.abs(raw),
          origem,
          observacao: bancoObs.trim() || null,
          competencia_referencia:
            bancoTipo === 'converted_to_payroll'
              ? folha?.competencia?.referencia ?? `${String(month).padStart(2, '0')}/${year}`
              : null,
        }),
      });
      if (r.ok) {
        setBancoMin('');
        setBancoObs('');
        await fetchFolha();
      } else {
        const d = await r.json();
        alert(d.error || 'Erro ao registrar movimentação');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setBancoSaving(false);
    }
  };

  const tcF = useMemo(() => {
    if (!folha?.funcionario) return 'fixo' as const;
    return folha.contract_profile?.tipo ?? normalizeTipoContrato(folha.funcionario.tipo_contrato);
  }, [folha]);
  const evF = useMemo(
    () => isEvento(tcF) || !!folha?.pagamentos_sem_teto_folha,
    [tcF, folha?.pagamentos_sem_teto_folha]
  );
  const folhaTradicional = folha?.contract_profile?.folha_tradicional ?? tcF === 'fixo';
  const showBancoBloco = !!(
    folha?.hour_bank &&
    folha.hour_bank.aplicavel !== false &&
    hourBankVisibleInUi(tcF)
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 overflow-x-auto overflow-y-hidden pb-0.5 -mx-0.5 px-0.5 sm:mx-0 sm:px-0 sm:overflow-visible sm:pb-0 touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <select value={sel} onChange={e=>setSel(Number(e.target.value))} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-medium focus:outline-none shrink-0 max-w-[min(100%,16rem)]">
          {funcs.filter(f=>f.status==='ativo').map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-2 shrink-0">
          <button onClick={()=>chgMonth(-1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold text-[var(--text-main)] w-28 text-center">{MESES[month-1]} {year}</span>
          <button onClick={()=>chgMonth(1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronRight size={16}/></button>
        </div>
        {onIrEspelho && (
          <button
            type="button"
            onClick={onIrEspelho}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] rounded-xl text-xs sm:text-sm font-bold text-[var(--text-main)] hover:bg-[var(--bg-main)] shrink-0"
          >
            <Calendar size={14} />
            Espelho deste mês
          </button>
        )}
        {folha && !evF && (
          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-zinc-900 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-zinc-800 transition-all shrink-0">
            <Download size={15} />
            Imprimir / PDF
          </button>
        )}
      </div>

      {loading ? <LoadSpinner/> : folha && folha.funcionario && folhaView ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4 min-w-0">
            <div className="xl:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden min-w-0">
            <div className="p-3 sm:p-4 space-y-3 min-w-0 2xl:p-6 2xl:space-y-5">
              <div className="border-b border-[var(--border)] pb-3 2xl:pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-black text-[var(--text-main)] sm:text-lg 2xl:text-xl">
                    {evF ? 'Pagamentos por competência' : 'Folha de pagamento'}
                  </h1>
                  {paySummary && (
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${payStatusClass}`}
                    >
                      {paySummary.unbounded ? 'Pagamentos por competência' : PAYROLL_STATUS_LABEL[paySummary.status] || paySummary.status}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
                  Competência {MESES[month - 1]} {year}
                  {folhaView.periodRange ? ` · ${folhaView.periodRange}` : ''}
                </p>
                <p className="text-xs font-bold text-[var(--text-muted)] mt-0.5">Referência {folhaView.referencia}</p>
              </div>

              <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)]/60 px-4 py-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Resumo do colaborador</p>
                <div className="flex flex-wrap items-start gap-4">
                  <Avatar func={folha.funcionario} size={52} />
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <p className="font-black text-[var(--text-main)] text-lg">{folha.funcionario.nome}</p>
                    <p className="text-[var(--text-muted)]">{folha.funcionario.cargo}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                      {folha.funcionario.cpf && <span>CPF: {folha.funcionario.cpf}</span>}
                      {folha.funcionario.data_admissao && (
                        <span>Admissão: {fmtDate(folha.funcionario.data_admissao)}</span>
                      )}
                      <span>
                        Jornada: {folha.funcionario.horario_entrada} – {folha.funcionario.horario_saida} ·{' '}
                        {folha.funcionario.carga_horaria}h · tolerância {folha.funcionario.tolerancia_minutos} min
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {!folhaTradicional && !evF && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-3 text-xs text-violet-950">
                  <p className="font-bold text-violet-900">Folha simplificada (diarista)</p>
                  <p className="mt-1 text-violet-900/85">
                    INSS e complemento gerencial automáticos não se aplicam. 13º e férias gerenciais não são geridos pelo sistema para este tipo.
                  </p>
                </div>
              )}

              {!evF && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)]/90 px-4 py-3 text-xs text-[var(--text-main)]">
                  <p className="font-bold text-[var(--text-main)]">Conferência e pagamento</p>
                  <p className="mt-1 leading-relaxed text-[var(--text-muted)]">
                    Os valores de <strong>hora extra na folha</strong> vêm do destino escolhido ao aprovar no Espelho. Pagamentos, adiantamentos e
                    recibos ficam na coluna à direita. Use <strong>Espelho deste mês</strong> no topo para conferir ponto e banco.
                  </p>
                </div>
              )}

              {evF ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                    <p className="font-black text-sky-900">Sem folha mensal CLT nesta tela</p>
                    <p className="text-xs mt-2 text-sky-900/85 leading-relaxed">
                      Use os pagamentos ao lado para registrar valores por competência (histórico e recibos). O valor abaixo é só referência cadastral
                      (serviço/evento), não salário líquido calculado.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] px-4 py-4">
                    <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">Valor referência (cadastro)</p>
                    <p className="text-2xl font-black text-[var(--text-main)] tabular-nums mt-1">{fmt(folha.salarioBruto)}</p>
                  </div>
                  {folha.adiantamentos.length > 0 && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)]/80 px-4 py-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                        Histórico na competência (legado)
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        Lançamentos antigos feitos como adiantamento de folha permanecem cadastrados só para consulta; não entram no fluxo de
                        pagamento por evento. Novos valores use a coluna de pagamentos ao lado.
                      </p>
                      <div className="divide-y divide-[var(--border)]">
                        {folha.adiantamentos.map((a) => (
                          <div key={a.id} className="flex justify-between gap-2 py-2 text-xs text-[var(--text-main)]">
                            <span className="min-w-0">
                              {fmtDate(a.data)} · {a.motivo || '—'}
                              <span className="ml-1.5 text-[10px] font-bold text-[var(--text-muted)]">
                                {a.descontado ? 'Baixado' : 'Pendente'}
                              </span>
                            </span>
                            <span className="font-bold tabular-nums shrink-0">{fmt(a.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <>
              <section className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Variáveis da competência</p>
              {((folha.totalExtraMin ?? 0) > 0 ||
                (folha.totalBancoConvertidoFolhaMin ?? 0) > 0 ||
                (folha.totalExtraMinPendentes ?? 0) > 0) && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-xs text-cyan-950 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-cyan-800">Horas extras e banco (reflexo na folha)</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      <span className="text-cyan-700/80">HE apuradas:</span>{' '}
                      <strong>{folha.totalExtraMin} min</strong>
                    </span>
                    <span>
                      <span className="text-cyan-700/80">Minutos pagos na folha:</span>{' '}
                      <strong>{folha.totalExtraMinPago ?? folha.totalExtraMin} min</strong>
                    </span>
                    <span>
                      <span className="text-cyan-700/80">Para o banco (crédito no mês):</span>{' '}
                      <strong>{folha.totalExtraMinBancoMes ?? 0} min</strong>
                    </span>
                    {(folha.totalExtraMinPendentes ?? 0) > 0 && (
                      <span>
                        <span className="text-cyan-700/80">HE pendentes de destino:</span>{' '}
                        <strong>{folha.totalExtraMinPendentes} min</strong>
                        <span className="text-[var(--text-muted)]"> (definir no Espelho)</span>
                      </span>
                    )}
                    <span>
                      <span className="text-cyan-700/80">Baixa do banco paga na folha:</span>{' '}
                      <strong>{folha.totalBancoConvertidoFolhaMin ?? 0} min</strong>
                    </span>
                  </div>
                </div>
              )}
              {folha.managerial &&
                (folha.managerial.informativos.length > 0 ||
                  folha.managerial.benefit_credits.length > 0 ||
                  folha.managerial.benefit_deductions.length > 0) && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-4 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-900">
                      Adicionais e descontos gerenciais
                    </p>
                    <p className="text-[11px] text-indigo-800/90">
                      Benefícios e informativos da ficha (Etapa gerencial). Pagamentos continuam alinhados ao líquido após estes ajustes.
                    </p>
                    {folha.managerial.informativos.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-indigo-700">Informativos (férias / 13º no mês)</p>
                        {folha.managerial.informativos.map((it, i) => (
                          <div key={i} className="flex justify-between text-xs text-indigo-950">
                            <span>{it.label}</span>
                            <span className="font-bold tabular-nums">{fmt(it.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {folha.managerial.benefit_credits.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-emerald-800">Benefícios — acréscimo</p>
                        {folha.managerial.benefit_credits.map((it, i) => (
                          <div key={i} className="flex justify-between text-xs text-emerald-950">
                            <span>{it.label}</span>
                            <span className="font-bold tabular-nums">{fmt(it.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {folha.managerial.benefit_deductions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-rose-800">Benefícios — desconto</p>
                        {folha.managerial.benefit_deductions.map((it, i) => (
                          <div key={i} className="flex justify-between text-xs text-rose-950">
                            <span>{it.label}</span>
                            <span className="font-bold tabular-nums">{fmt(it.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-2 border-t border-indigo-200 flex justify-between text-sm font-black text-indigo-950">
                      <span>Líquido com benefícios gerenciais</span>
                      <span className="tabular-nums">{fmt(folha.managerial.net_adjusted)}</span>
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Apuração — proventos e descontos</p>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>
                  Proventos
                </p>
                <div className="rounded-2xl bg-emerald-950 px-4 py-3 space-y-2">
                  {folhaView.earnings.map((row, i) => (
                    <div key={i} className="flex justify-between items-center gap-3 text-sm">
                      <span className="text-white font-medium">{row.label}</span>
                      <span className="font-black tabular-nums shrink-0 text-emerald-300">{fmt(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Descontos</p>
                <div className="rounded-2xl bg-rose-950 px-4 py-3 space-y-2">
                  {folhaView.deductions.map((row, i) => (
                    <div key={i} className="flex justify-between items-center gap-3 text-sm">
                      <span className="text-white font-medium">{row.label}</span>
                      <span className="font-black tabular-nums shrink-0 text-red-300">{fmt(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              </section>

              <section className="rounded-2xl bg-zinc-100 border border-[var(--border)] px-4 py-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Resumo financeiro</p>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#9ca3af' }}>Bruto apurado</span>
                  <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(folhaView.gross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#9ca3af' }}>Descontos da competência</span>
                  <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(folhaView.dedTotal)}</span>
                </div>
                {paySummary && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#9ca3af' }}>Pago nesta competência</span>
                      <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(paySummary.total_paid)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#9ca3af' }}>Pendente para quitar</span>
                      <span className="font-bold text-amber-800 tabular-nums">{fmt(paySummary.balance_due)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
                  <span className="font-black text-[var(--text-main)]">
                    {folha.managerial ? 'Líquido de referência (com gerencial)' : 'Líquido de referência'}
                  </span>
                  <span className="text-2xl font-black tabular-nums" style={{ color: '#22c55e' }}>
                    {fmt(Math.max(0, folhaView.net))}
                  </span>
                </div>
              </section>

              {folha.totalDescontos > folha.salarioBruto && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Descontos ({fmt(folha.totalDescontos)}) superam o bruto base ({fmt(folha.salarioBruto)}). Excedente{' '}
                    {fmt(folha.totalDescontos - folha.salarioBruto)} — tratar à parte ou no mês seguinte.
                  </span>
                </div>
              )}

              {folha.adiantamentos.length > 0 && (
                <div className="p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border)]">
                  <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    Adiantamentos que compõem o cálculo
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mb-2 leading-relaxed">
                    Preferência: registros feitos em <strong>Pagamentos</strong> (mesma competência). A tabela legada só entra no total se não houver
                    adiantamento por pagamentos.
                  </p>
                  {folha.adiantamentos.map((a) => (
                    <div key={a.id} className="flex justify-between text-xs text-[var(--text-muted)] py-1">
                      <span>
                        {fmtDate(a.data)} · {a.motivo}
                        {a.origem === 'pagamento_folha' ? (
                          <span className="ml-1 text-[9px] font-bold text-emerald-600">· Pagamentos</span>
                        ) : null}
                      </span>
                      <span className="font-bold tabular-nums">{fmt(a.valor)}</span>
                    </div>
                  ))}
                </div>
              )}

              {(folha.adiantamentos_legado_nao_contabilizados?.length ?? 0) > 0 && (
                <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-2">
                  <p className="font-black text-amber-900 uppercase tracking-wider text-[10px]">
                    Adiantamentos legados (fora do total)
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Existem lançamentos na tabela antiga de adiantamentos no mesmo mês, mas o total já usa os valores registrados em{' '}
                    <strong>Pagamentos</strong>. Estes itens não foram somados de novo para evitar duplicidade.
                  </p>
                  {(folha.adiantamentos_legado_nao_contabilizados ?? []).map((a) => (
                    <div key={a.id} className="flex justify-between text-amber-900 py-0.5 border-t border-amber-200/80 pt-1">
                      <span>
                        {fmtDate(a.data)} · {a.motivo || '—'}
                      </span>
                      <span className="font-bold tabular-nums">{fmt(a.valor)}</span>
                    </div>
                  ))}
                </div>
              )}

              {showBancoBloco && (
                <div className="p-4 rounded-xl border border-cyan-200 bg-[var(--bg-card)] space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <p className="text-xs font-black text-cyan-900 uppercase tracking-wider">Banco de horas na competência — conferência</p>
                      <span className="text-lg font-black text-cyan-800 tabular-nums">
                        Saldo {folha.hour_bank.saldo_minutos} min
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      Use este bloco para conferir o saldo que impacta a competência e, quando necessário, registrar ajuste administrativo autorizado.
                      Compensação no dia a dia continua no <span className="font-bold text-[var(--text-main)]">Espelho</span>.
                    </p>
                  </div>
                  {folha.hour_bank.movimentacoes?.length ? (
                    <div className="max-h-36 overflow-y-auto divide-y divide-zinc-100 text-[11px] text-[var(--text-muted)]">
                      {folha.hour_bank.movimentacoes.map((m) => (
                        <div key={m.id} className="py-1.5 flex justify-between gap-2">
                          <span className="truncate">
                            {fmtDate(m.data_referencia)} · {HOUR_BANK_MOVEMENT_LABEL[m.tipo] || m.tipo} ·{' '}
                            {HOUR_BANK_ORIGIN_LABEL[m.origem] || m.origem}
                            {m.observacao ? ` — ${m.observacao}` : ''}
                          </span>
                          <span className="shrink-0 font-bold tabular-nums text-cyan-900">
                            {m.tipo === 'manual_adjust'
                              ? `${m.minutos > 0 ? '+' : ''}${m.minutos}m`
                              : m.tipo === 'debit' || m.tipo === 'converted_to_payroll'
                                ? `−${m.minutos}m`
                                : `+${m.minutos}m`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)]">Nenhuma movimentação neste mês.</p>
                  )}
                  <div className="pt-2 border-t border-[var(--border)] space-y-2">
                    <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider">Ajuste administrativo</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-[var(--text-muted)] font-bold block mb-0.5">Tipo</label>
                        <select
                          value={bancoTipo}
                          onChange={(e) => setBancoTipo(e.target.value as typeof bancoTipo)}
                          className="w-full px-2 py-2 border border-[var(--border)] rounded-lg text-xs font-medium"
                        >
                          <option value="debit">Débito administrativo (baixa saldo)</option>
                          <option value="credit">Crédito administrativo</option>
                          <option value="manual_adjust">Ajuste manual (+/− min)</option>
                          <option value="converted_to_payroll">Destino da HE na folha (baixa do banco nesta competência)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-[var(--text-muted)] font-bold block mb-0.5">Data referência</label>
                        <input
                          type="date"
                          value={bancoDataRef}
                          onChange={(e) => setBancoDataRef(e.target.value)}
                          className="w-full px-2 py-2 border border-[var(--border)] rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-bold block mb-0.5">
                        Minutos {bancoTipo === 'manual_adjust' ? '(+ ou −)' : ''}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={bancoMin}
                        onChange={(e) => setBancoMin(e.target.value)}
                        placeholder={bancoTipo === 'manual_adjust' ? 'ex: -30 ou +60' : 'ex: 60'}
                        className="w-full px-2 py-2 border border-[var(--border)] rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-bold block mb-0.5">Observação</label>
                      <input
                        type="text"
                        value={bancoObs}
                        onChange={(e) => setBancoObs(e.target.value)}
                        placeholder="Motivo autorizado"
                        className="w-full px-2 py-2 border border-[var(--border)] rounded-lg text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={registrarMovBanco}
                      disabled={bancoSaving}
                      className="w-full py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      {bancoSaving ? 'Salvando…' : 'Salvar ajuste administrativo'}
                    </button>
                  </div>
                </div>
              )}

              </>
              )}

              {!evF && (
              <div className="pt-6 border-t border-[var(--border)] grid grid-cols-2 gap-8 text-center text-xs text-[var(--text-muted)]">
                <div>
                  <div className="border-b border-[var(--border)] mb-2 h-10" />
                  <p>Assinatura do Funcionário</p>
                </div>
                <div>
                  <div className="border-b border-[var(--border)] mb-2 h-10" />
                  <p>Assinatura do Responsável</p>
                </div>
              </div>
              )}
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 min-w-0">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                Resumo da folha
              </p>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Apuração desta competência, pagamentos registrados e saldo a quitar (mesma base usada em Pagamentos).
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: '#9ca3af' }}>Competência</span>
                  <span className="font-bold text-[var(--text-main)]">{folhaView.referencia}</span>
                </div>
                {!evF && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Bruto apurado</span>
                      <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(folhaView.gross)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Descontos da competência</span>
                      <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(folhaView.dedTotal)}</span>
                    </div>
                  </>
                )}
                {paySummary && !paySummary.unbounded && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Líquido apurado</span>
                      <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(paySummary.net_liquid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Pago nesta competência</span>
                      <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(paySummary.total_paid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Pendente para quitar</span>
                      <span className="font-bold text-amber-800 tabular-nums">{fmt(paySummary.balance_due)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span style={{ color: '#9ca3af' }}>Status do pagamento</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${payStatusClass}`}>
                        {PAYROLL_STATUS_LABEL[paySummary.status]}
                      </span>
                    </div>
                  </>
                )}
                {paySummary?.unbounded && (
                  <div className="flex justify-between">
                    <span style={{ color: '#9ca3af' }}>Total pago (competência)</span>
                    <span className="font-bold text-[var(--text-main)] tabular-nums">{fmt(paySummary.total_paid)}</span>
                  </div>
                )}
                {!evF && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Faltas</span>
                      <span className="font-bold text-[var(--text-main)]">{folha.totalFaltas}×</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: '#9ca3af' }}>Atrasos</span>
                      <span className="font-bold text-[var(--text-main)]">{folha.totalAtrasoMin} min</span>
                    </div>
                  </>
                )}
                {showBancoBloco && folha.hour_bank && (
                  <div className="flex justify-between">
                    <span style={{ color: '#9ca3af' }}>Saldo banco (conferência)</span>
                    <span className="font-bold text-cyan-800 tabular-nums">{folha.hour_bank.saldo_minutos} min</span>
                  </div>
                )}
              </div>
              <div className="mt-4 p-3 rounded-xl bg-zinc-100 border border-[var(--border)] flex justify-between items-center">
                <span className="text-sm font-black text-[var(--text-main)]">{evF ? 'Salário líquido (CLT)' : 'Líquido da competência'}</span>
                {evF ? (
                  <span className="text-xs font-bold text-[var(--text-muted)] text-right max-w-[140px]">Não aplicável (contrato por evento)</span>
                ) : (
                  <span className="text-xl font-black tabular-nums" style={{ color: '#22c55e' }}>
                    {fmt(Math.max(0, folhaView.net))}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                Pagamentos
              </p>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Use este bloco para registrar adiantamento, pagamento parcial ou quitação da competência. O lançamento entra no financeiro,
                atualiza o histórico e permite emitir recibo, sem alterar salário base nem ponto do dia a dia.
                {evF && (
                  <span className="block mt-2 text-sky-800/90">
                    Contrato por evento: não há teto automático de folha — registre os valores acordados por competência.
                  </span>
                )}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tipo</label>
                  <select
                    value={payForm.tipo}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, tipo: e.target.value as typeof payForm.tipo }))
                    }
                    className="mt-1 w-full px-3 py-2.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    <option value="advance">Adiantamento</option>
                    <option value="partial_payment">Pagamento parcial</option>
                    <option value="final_payment">Pagamento final (quita)</option>
                  </select>
                </div>
                <FInput
                  label="Valor (R$)"
                  type="text"
                  value={payForm.valor}
                  onChange={(v) => setPayForm((f) => ({ ...f, valor: v }))}
                  placeholder="0,00"
                />
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Observação</label>
                  <textarea
                    value={payForm.observacao}
                    onChange={(e) => setPayForm((f) => ({ ...f, observacao: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full px-3 py-2.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Opcional"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {paySummary && !paySummary.unbounded && paySummary.balance_due > 0.009 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPayForm((f) => ({
                          ...f,
                          tipo: 'final_payment',
                          valor: paySummary.balance_due.toFixed(2).replace('.', ','),
                        }))
                      }
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100"
                    >
                      Quitar pendente ({fmt(paySummary.balance_due)})
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={savingPay || (paySummary?.status === 'paid' && !paySummary?.unbounded)}
                    onClick={registrarPagamento}
                    className="flex-1 min-w-[140px] py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold disabled:opacity-40"
                  >
                    {savingPay ? 'Salvando…' : 'Registrar pagamento'}
                  </button>
                </div>
              </div>

              {(folha.payroll_payments?.length ?? 0) > 0 && (
                <div className="mt-5 pt-5 border-t border-[var(--border)]">
                  <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>
                    Pagamentos já registrados na competência
                  </p>
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {(folha.payroll_payments || []).map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--bg-main)] rounded-lg px-3 py-2 border border-[var(--border)]"
                      >
                        <div>
                          <span className="font-bold text-[var(--text-main)]">{PAYMENT_TIPO_LABEL[p.tipo] || p.tipo}</span>
                          <span className="text-[var(--text-muted)] mx-1">·</span>
                          <span className="font-black text-emerald-700 tabular-nums">{fmt(Number(p.valor))}</span>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            {p.recibo_numero || `RHF-${p.id}`} ·{' '}
                            {p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => printReceipt(p)}
                          className="shrink-0 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[11px] font-bold text-[var(--text-main)] hover:bg-zinc-100"
                        >
                          Recibo
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function Avatar({ func, size=40, className='' }: { func:Pick<Func,'nome'|'foto_url'>; size?:number; className?:string }) {
  const initials = func.nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
  return func.foto_url ? (
    <img src={func.foto_url} alt={func.nome} className={`rounded-xl object-cover shrink-0 ${className}`} style={{width:size,height:size}}/>
  ) : (
    <div className={`rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black shrink-0 ${className}`} style={{width:size,height:size,fontSize:Math.max(10,size*0.35)}}>{initials}</div>
  );
}
function InfoChip({ label, value }: { label:string; value:string }) {
  return <div className="bg-[var(--bg-main)] rounded-lg px-2 py-1.5"><p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</p><p className="text-xs font-bold text-[var(--text-main)] mt-0.5">{value}</p></div>;
}
function ABtn({ label, icon, onClick, danger=false }: { label:string; icon:React.ReactNode; onClick:()=>void; danger?:boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${danger?'border-red-200 text-red-500 bg-red-50 hover:bg-red-100':'border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-main)] hover:bg-zinc-100'}`}>{icon}{label}</button>;
}
function SCard({ label, value, color, small=false, hint }: { label:string; value:string|number; color:string; small?:boolean; hint?: string }) {
  const bg:Record<string,string>={emerald:'bg-emerald-50 border-emerald-200',red:'bg-red-50 border-red-200',blue:'bg-blue-50 border-blue-200',purple:'bg-purple-50 border-purple-200',amber:'bg-amber-50 border-amber-200',orange:'bg-orange-50 border-orange-200',cyan:'bg-cyan-50 border-cyan-200'};
  const txt:Record<string,string>={emerald:'text-emerald-700',red:'text-red-700',blue:'text-blue-700',purple:'text-purple-700',amber:'text-amber-700',orange:'text-orange-700',cyan:'text-cyan-800'};
  return <div className={`${bg[color]} border rounded-xl p-3`}><p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</p><p className={`font-black mt-1 ${txt[color]} ${small?'text-sm':'text-2xl'}`}>{value}</p>{hint && <p className="mt-1 text-[10px] text-[var(--text-muted)] leading-snug">{hint}</p>}</div>;
}
function FInput({ label, value, onChange, placeholder='', type='text' }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string }) {
  return <div><label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full px-3 py-2.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/></div>;
}
function Modal({ open, onClose, title, children, wide=false }: { open:boolean; onClose:()=>void; title:string; children:React.ReactNode; wide?:boolean }) {
  return (
    <AnimatePresence>
      {open&&(
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <motion.div
            initial={{ scale: 0.93, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.93, opacity: 0 }}
            className={`my-auto flex max-h-[min(92dvh,100svh)] min-h-0 w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl ${wide ? 'max-w-2xl' : 'max-w-md'} pb-[max(0.5rem,env(safe-area-inset-bottom))]`}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 2xl:px-6 2xl:py-4">
              <h3 className="min-w-0 pr-2 text-base font-black text-[var(--text-main)] 2xl:text-lg">{title}</h3>
              <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] hover:bg-zinc-100 2xl:p-1.5" aria-label="Fechar">
                <X size={18}/>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 2xl:px-6 2xl:py-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
function MBtns({ onCancel, onConfirm, saving, label }: { onCancel:()=>void; onConfirm:()=>void; saving:boolean; label:string }) {
  return <div className="flex gap-3 mt-5"><button onClick={onCancel} className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Cancelar</button><button onClick={onConfirm} disabled={saving} className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">{saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:label}</button></div>;
}
function LoadSpinner() { return <div className="flex justify-center py-10 sm:py-12"><div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--text-main)] rounded-full animate-spin"/></div>; }
