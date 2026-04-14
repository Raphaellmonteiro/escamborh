import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { getSegCfg } from '../config/segmentos';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  BarChart2, Clock, CreditCard, Banknote, Smartphone,
  Package, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ─── Tipos locais ─────────────────────────────────────────────────────────────
interface WeeklyDay { dia: string; label: string; total: number; pedidos: number; }

interface Stats {
  filteredTotal: number;
  today: number;
  week: number;
  month: number;
  totalExpenses: number;
  totalRefunded?: number;
  netRevenue?: number;
  totalRepassesPagos: number;
  productSales: { name: string; quantity: number; total: number }[];
  ticketMedio: number;
  totalPedidos: number;
}
interface CashReport {
  total: number;
  cash: number;
  pix: number;
  debit: number;
  credit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtShort = (v: number) => {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmt(v);
};

export default function DashboardScreen({
  token, segmento, onGoToPOS,
}: { token: string; segmento: string; onGoToPOS: () => void }) {
  const cfg = getSegCfg(segmento);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyDay[]>([]);
  const [cashReport, setCashReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filterType, setFilterType] = useState<'day' | 'month' | 'year'>('day');
  const _ld = new Date();
  const todayStr = `${_ld.getFullYear()}-${String(_ld.getMonth()+1).padStart(2,'0')}-${String(_ld.getDate()).padStart(2,'0')}`;
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: anoAtual - 2022 }, (_, i) => 2023 + i);
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const fetchAll = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      let q = '';
      if (filterType === 'day') {
        const [y, m, d] = selectedDate.split('-');
        q = `?day=${d}&month=${m}&year=${y}`;
      } else if (filterType === 'month') {
        q = `?month=${selectedMonth}&year=${selectedYear}`;
      } else {
        q = `?year=${selectedYear}`;
      }
      const hdrs = { Authorization: `Bearer ${token}` };
      const [sRes, wRes, cRes] = await Promise.all([
        fetch(`/api/dashboard/stats${q}`, { headers: hdrs }),
        fetch('/api/dashboard/weekly', { headers: hdrs }),
        fetch(`/api/dashboard/cash-report${q}`, { headers: hdrs }),
      ]);

      // Parseia cada resposta individualmente — uma falha não derruba as demais
      const safeJson = async (r: Response) => {
        try { return r.ok ? await r.json() : null; } catch { return null; }
      };
      const [s, w, c] = await Promise.all([safeJson(sRes), safeJson(wRes), safeJson(cRes)]);

      if (s) setStats(s);
      if (Array.isArray(w)) setWeeklyData(w);
      if (c) setCashReport(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, [filterType, selectedDate, selectedMonth, selectedYear]);

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-400 rounded-full animate-spin" />
        <p className="text-sm text-zinc-500 font-medium">Carregando dashboard...</p>
      </div>
    </div>
  );

  const receitaOperacional = stats?.filteredTotal || 0;
  const totalRefunded = stats?.totalRefunded || 0;
  const receitaLiquida = stats?.netRevenue ?? (receitaOperacional - totalRefunded);
  const lucro = receitaLiquida - (stats?.totalExpenses || 0) - (stats?.totalRepassesPagos || 0);
  const margem = receitaLiquida ? (lucro / receitaLiquida) * 100 : 0;
  const totalPagamentos = cashReport ? (cashReport.cash + cashReport.pix + cashReport.debit + cashReport.credit) : 0;

  const periodoLabel =
    filterType === 'day' ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    : filterType === 'month' ? `${meses[Number(selectedMonth)-1]} ${selectedYear}`
    : `Ano ${selectedYear}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto bg-zinc-100 dark:bg-zinc-950"
    >
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Dashboard</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 capitalize font-medium">{periodoLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro tipo */}
            <div className="flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 gap-0.5 shadow-sm">
              {(['day','month','year'] as const).map(t => (
                <button key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === t ? 'bg-zinc-900 dark:bg-zinc-700 text-white dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                  {t === 'day' ? 'Dia' : t === 'month' ? 'Mês' : 'Ano'}
                </button>
              ))}
            </div>

            {filterType === 'day' && (
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600" />
            )}
            {filterType === 'month' && (
              <div className="flex gap-2">
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none">
                  {meses.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                  className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none">
                  {anos.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {filterType === 'year' && (
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none">
                {anos.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}

            <button onClick={() => fetchAll(true)}
              className={`p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all ${refreshing ? 'animate-spin' : ''}`}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* ── KPIs principais ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Receita Operacional"
            value={fmt(receitaOperacional)}
            sub={`${stats?.totalPedidos || 0} pedidos`}
            icon={<DollarSign size={22} />}
            color="emerald"
            trend={null}
            highlight
          />
          <KpiCard
            label="Receita Líquida"
            value={fmtShort(receitaLiquida)}
            sub={totalRefunded > 0 ? `${fmtShort(totalRefunded)} reembolsados` : 'sem reembolsos'}
            icon={receitaLiquida >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            color={receitaLiquida >= 0 ? 'emerald' : 'red'}
            trend={null}
          />
          <KpiCard
            label="Despesas"
            value={fmtShort(stats?.totalExpenses || 0)}
            sub="custos operacionais"
            icon={<TrendingDown size={20} />}
            color="red"
            trend={null}
          />
          <KpiCard
            label="Ticket Médio"
            value={fmtShort(stats?.ticketMedio || (stats?.totalPedidos ? (receitaOperacional / stats.totalPedidos) : 0))}
            sub="por pedido"
            icon={<ShoppingBag size={20} />}
            color="blue"
            trend={null}
          />
        </div>

        {/* ── Linha 2: Métodos + Top Produtos ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Métodos de pagamento */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CreditCard size={16} className="text-zinc-500" />
              Formas de Pagamento
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Dinheiro', value: cashReport?.cash || 0, icon: <Banknote size={16} />, color: 'bg-emerald-500' },
                { label: 'PIX', value: cashReport?.pix || 0, icon: <Smartphone size={16} />, color: 'bg-blue-500' },
                { label: 'Débito', value: cashReport?.debit || 0, icon: <CreditCard size={16} />, color: 'bg-violet-500' },
                { label: 'Crédito', value: cashReport?.credit || 0, icon: <CreditCard size={16} />, color: 'bg-amber-500' },
              ].map(({ label, value, icon, color }) => {
                const pct = totalPagamentos > 0 ? (value / totalPagamentos) * 100 : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 text-xs font-medium">
                        <span className="text-zinc-500">{icon}</span>
                        {label}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmt(value)}</span>
                        <span className="text-[10px] text-zinc-500 w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 mt-1 border-t-2 border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Total recebido</span>
                <span className="text-base font-black text-zinc-900 dark:text-zinc-100 tabular-nums">{fmt(cashReport?.total || 0)}</span>
              </div>
            </div>
          </div>

          {/* Top produtos */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package size={16} className="text-zinc-500" />
              Produtos Mais Vendidos
            </h2>
            {(stats?.productSales || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
                <BarChart2 size={36} className="text-zinc-400 dark:text-zinc-500" />
                <p className="text-sm mt-2 text-zinc-500 dark:text-zinc-400 font-medium">Nenhuma venda no período</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(stats?.productSales || []).slice(0, 8).map((item, i) => {
                  const maxQty = Math.max(...(stats?.productSales || []).map(p => p.quantity));
                  const pct = (item.quantity / maxQty) * 100;
                  const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-5 text-[10px] font-black text-zinc-500 text-right">{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{item.name}</span>
                          <div className="flex items-center gap-3 ml-2 shrink-0">
                            <span className="text-[10px] text-zinc-500">{item.quantity} un</span>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmt(item.total || 0)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${colors[i % colors.length]} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Linha 3: Resumo financeiro + Comparativo ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* DRE simplificado */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-4">Resultado do Período</h2>
            <div className="space-y-2">
              <DreRow label="Receita Operacional" value={receitaOperacional} type="positive" />
              {totalRefunded > 0 && (
                <DreRow label="(-) Reembolsos" value={-totalRefunded} type="negative" />
              )}
              <DreRow label="Receita Líquida" value={receitaLiquida} type="positive" />
              <DreRow label="(-) Despesas" value={-(stats?.totalExpenses || 0)} type="negative" />
              {(stats?.totalRepassesPagos || 0) > 0 && (
                <DreRow label="(-) Repasses" value={-(stats?.totalRepassesPagos || 0)} type="negative" />
              )}
              <div className="border-t-2 border-zinc-200 dark:border-zinc-700 pt-3 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-zinc-800 dark:text-zinc-200">Lucro Líquido</span>
                  <span className={`text-xl font-black tabular-nums ${lucro >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmt(lucro)}
                  </span>
                </div>
                <div className="mt-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${lucro >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, Math.abs(margem))}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">{margem.toFixed(1)}% de margem</p>
              </div>
            </div>
          </div>

          {/* Comparativo dia/semana/mês + Gráfico 7 dias */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-zinc-500" />
              Vendas — Últimos 7 Dias
            </h2>

            {/* Mini KPIs */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Hoje',        value: stats?.today || 0, active: false },
                { label: 'Esta Semana', value: stats?.week  || 0, active: false },
                { label: 'Este Mês',    value: stats?.month || 0, active: true },
              ].map(({ label, value, active }) => (
                <div key={label} className={`rounded-xl p-3 text-center bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 ${active ? 'ring-2 ring-emerald-400/40' : ''}`}>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{label}</p>
                  <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{fmtShort(value)}</p>
                </div>
              ))}
            </div>

            {/* Gráfico de barras — SVG puro, sem dependência */}
            {weeklyData.length > 0 && weeklyData.some(d => d.total > 0) ? (() => {
              const maxVal = Math.max(...weeklyData.map(d => d.total), 1);
              const H = 130;
              return (
                <div className="w-full bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800" style={{ height: 170 }}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${weeklyData.length * 52} ${H + 36}`} preserveAspectRatio="xMidYMid meet">
                    {weeklyData.map((d, i) => {
                      const barH   = Math.max(6, Math.round((d.total / maxVal) * H));
                      const x      = i * 52 + 6;
                      const y      = H - barH;
                      const isHoje = i === weeklyData.length - 1;
                      const isMax  = d.total === maxVal && d.total > 0;
                      const fill   = isHoje ? '#3b82f6' : isMax ? '#059669' : '#94a3b8';
                      return (
                        <g key={i}>
                          <rect x={x} y={y} width={40} height={barH} rx={6} fill={fill} opacity={isHoje || isMax ? 1 : 0.85} />
                          {d.total > 0 && (
                            <text x={x + 20} y={y - 6} textAnchor="middle" fontSize={10} fill="#a1a1aa" fontWeight={600}>
                              {d.total >= 1000 ? `${(d.total/1000).toFixed(1)}k` : `${d.total.toFixed(0)}`}
                            </text>
                          )}
                          <text x={x + 20} y={H + 18} textAnchor="middle" fontSize={10} fill={isHoje ? '#60a5fa' : '#71717a'} fontWeight={isHoje ? 700 : 500}>
                            {d.label}
                          </text>
                        </g>
                      );
                    })}
                    <line x1={0} y1={H} x2={weeklyData.length * 52} y2={H} stroke="#3f3f46" strokeWidth={1.5} />
                  </svg>
                </div>
              );
            })() : (
              <div className="h-[160px] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
                <BarChart2 size={32} className="text-zinc-400 dark:text-zinc-500 mb-2" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Nenhuma venda nos últimos 7 dias</p>
              </div>
            )}

            {/* Alerta se sem vendas no período filtrado */}
            {(stats?.filteredTotal || 0) === 0 && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-3 shadow-sm">
                <AlertTriangle size={18} className="text-amber-500 dark:text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Nenhuma venda neste período</p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400/80">Registre vendas no balcão para ver as métricas.</p>
                </div>
                <button onClick={onGoToPOS}
                  className="shrink-0 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-all">
                  Ir ao PDV
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color, trend, highlight }: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; color: 'emerald' | 'red' | 'blue' | 'amber';
  trend: number | null;
  highlight?: boolean;
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    red:     { bg: 'bg-red-500/10',     text: 'text-red-400'     },
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400'    },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400'   },
  };
  const c = colorMap[color];
  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-sm border transition-shadow hover:shadow-md ${
      highlight ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/5' : 'border-zinc-200 dark:border-zinc-800'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 ${c.bg} rounded-xl flex items-center justify-center ${c.text}`}>
          {icon}
        </div>
        {trend !== null && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className={`font-black tabular-nums ${highlight ? 'text-3xl text-zinc-900 dark:text-zinc-100' : 'text-2xl text-zinc-900 dark:text-zinc-100'}`}>{value}</p>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{label}</p>
        <p className="text-[10px] text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}

function DreRow({ label, value, type }: { label: string; value: number; type: 'positive' | 'negative' }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-sm font-bold ${type === 'positive' ? 'text-zinc-800 dark:text-zinc-200' : 'text-red-600 dark:text-red-400'}`}>
        {type === 'positive' ? '' : ''}{`R$ ${Math.abs(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`}
      </span>
    </div>
  );
}

export function StatCard({ label, value, icon, color, highlight = false }: any) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-center gap-4 ${highlight ? 'ring-2 ring-emerald-400' : ''}`}>
      <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
      <div>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black text-zinc-900 dark:text-zinc-100">{value}</p>
      </div>
    </div>
  );
}
export function CashRow({ label, value }: any) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-bold text-zinc-900 dark:text-zinc-100">R$ {(value || 0).toFixed(2)}</span>
    </div>
  );
}
