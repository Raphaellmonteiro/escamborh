import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Trash2, DollarSign, TrendingDown, TrendingUp,
  X, Filter, Calendar, AlertCircle, CheckCircle2,
  Banknote, ChevronDown,
} from 'lucide-react';

interface Expense { id: number; description: string; amount: number; category: string; created_at: string; }
interface Caixa {
  id: number; data: string; status: string; fundo_inicial: number;
  total_vendas_dinheiro?: number; total_esperado?: number;
  valor_contado?: number; diferenca?: number;
}
interface FinancialStats {
  filteredTotal?: number;
  totalRefunded?: number;
  netRevenue?: number;
  totalPedidos?: number;
}

const fmt = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const CATEGORIAS = ['Estoque','Funcionários','Aluguel','Energia/Água','Manutenção','Marketing','Equipamentos','Outros'];

const CAT_COLORS: Record<string, string> = {
  'Estoque': 'bg-blue-100 text-blue-700',
  'Funcionários': 'bg-violet-100 text-violet-700',
  'Aluguel': 'bg-amber-100 text-amber-700',
  'Energia/Água': 'bg-cyan-100 text-cyan-700',
  'Manutenção': 'bg-orange-100 text-orange-700',
  'Marketing': 'bg-pink-100 text-pink-700',
  'Equipamentos': 'bg-indigo-100 text-indigo-700',
  'Outros': 'bg-zinc-100 text-zinc-700',
};

export default function FinanceScreen({ token, segmento: _segmento }: { token: string; segmento: string }) {
  const [tab, setTab] = useState<'despesas' | 'caixa'>('despesas');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [caixaHistory, setCaixaHistory] = useState<Caixa[]>([]);
  const [financialStats, setFinancialStats] = useState<FinancialStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [catFilter, setCatFilter]     = useState('Todas');
  const [dateFilter, setDateFilter]   = useState<'hoje'|'semana'|'mes'|'tudo'>(() => {
    return (localStorage.getItem('finance_date_filter') as any) || 'tudo';
  });

  // persiste ao mudar
  const handleDateFilter = (v: 'hoje'|'semana'|'mes'|'tudo') => {
    setDateFilter(v);
    localStorage.setItem('finance_date_filter', v);
  };
  const [form, setForm] = useState({ description: '', amount: '', category: 'Estoque' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tab === 'despesas') fetchExpenses();
    else if (tab === 'caixa') fetchCaixa();
  }, [tab]);

  useEffect(() => {
    fetchFinancialStats();
  }, [dateFilter, token]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/expenses', { headers: { Authorization: `Bearer ${token}` } });
      setExpenses(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchCaixa = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/caixa/historico', { headers: { Authorization: `Bearer ${token}` } });
      setCaixaHistory(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchFinancialStats = async () => {
    try {
      const query =
        dateFilter === 'hoje' ? '?range=today' :
        dateFilter === 'semana' ? '?range=week' :
        dateFilter === 'mes' ? '?range=month' :
        '?range=all';

      const r = await fetch(`/api/dashboard/stats${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (r.ok) {
        setFinancialStats(await r.json());
      }
    } catch {}
  };

  const handleAdd = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    try {
      const r = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount.replace(',', '.')) }),
      });
      if (r.ok) {
        setShowAdd(false);
        setForm({ description: '', amount: '', category: 'Estoque' });
        fetchExpenses();
      } else {
        const e = await r.json();
        alert(e.error || 'Erro ao salvar');
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir esta despesa?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchExpenses();
  };

  // ── Filtragem por data ──────────────────────────────────────────────────────
  const filterByDate = (list: { created_at: string }[]) => {
    if (dateFilter === 'tudo') return list;
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return list.filter(item => {
      const d = new Date(item.created_at);
      if (dateFilter === 'hoje')   return d >= today;
      if (dateFilter === 'semana') {
        const start = new Date(today); start.setDate(today.getDate() - today.getDay());
        return d >= start;
      }
      if (dateFilter === 'mes') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  };

  // Estatísticas das despesas
  const expFiltered = filterByDate(expenses) as Expense[];
  const filtered = catFilter === 'Todas' ? expFiltered : expFiltered.filter(e => e.category === catFilter);
  const totalDespesas = expFiltered.reduce((a, e) => a + e.amount, 0);
  const receitaOperacional = Number(financialStats?.filteredTotal || 0);
  const totalReembolsado = Number(financialStats?.totalRefunded || 0);
  const receitaLiquida = Number(financialStats?.netRevenue ?? (receitaOperacional - totalReembolsado));
  const byCat = CATEGORIAS.map(cat => ({
    cat,
    total: expFiltered.filter(e => e.category === cat).reduce((a, e) => a + e.amount, 0),
    count: expFiltered.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0).sort((a, b) => b.total - a.total);

  const TABS = [
    { key: 'despesas', label: 'Despesas' },
    { key: 'caixa', label: 'Histórico de Caixa' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto bg-zinc-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-zinc-900">Financeiro</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Controle de despesas e caixa</p>
          </div>
          {tab === 'despesas' && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all active:scale-95">
              <Plus size={16} /> Nova Despesa
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-white border border-zinc-200 rounded-xl p-1 w-fit gap-0.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Filtro de Período ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-zinc-400" />
          {([
            { key: 'hoje',   label: 'Hoje'        },
            { key: 'semana', label: 'Esta semana'  },
            { key: 'mes',    label: 'Este mês'     },
            { key: 'tudo',   label: 'Tudo'         },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => handleDateFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilter === key ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ABA DESPESAS ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Receita Operacional</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{fmt(receitaOperacional)}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{financialStats?.totalPedidos || 0} pedidos no período</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Reembolsos</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{fmt(totalReembolsado)}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Total reembolsado no período</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Receita Líquida</p>
            <p className="text-2xl font-black text-zinc-900 mt-1">{fmt(receitaLiquida)}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Receita operacional menos reembolsos</p>
          </div>
        </div>

        {tab === 'despesas' && (
          <div className="space-y-4">

            {/* Resumo em cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-zinc-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Total Despesas</p>
                <p className="text-2xl font-black text-red-600 mt-1">{fmt(totalDespesas)}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{expenses.length} registros</p>
              </div>
              {byCat.slice(0, 3).map(c => (
                <div key={c.cat} className="bg-white border border-zinc-200 rounded-2xl p-4">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">{c.cat}</p>
                  <p className="text-xl font-black text-zinc-800 mt-1">{fmt(c.total)}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{c.count} registro{c.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>

            {/* Filtro por categoria */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={14} className="text-zinc-400" />
              {['Todas', ...CATEGORIAS].map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${catFilter === cat ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Lista de despesas */}
            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="w-7 h-7 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-zinc-200 rounded-2xl">
                  <TrendingDown size={40} className="text-zinc-200 mb-3" />
                  <p className="text-zinc-400 font-medium">Nenhuma despesa {catFilter !== 'Todas' ? `em "${catFilter}"` : 'registrada'}</p>
                  <button onClick={() => setShowAdd(true)}
                    className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold">
                    Registrar despesa
                  </button>
                </div>
              ) : filtered.map(exp => (
                <motion.div key={exp.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-300 transition-all">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-400 shrink-0">
                    <TrendingDown size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-900 text-sm">{exp.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAT_COLORS[exp.category] || 'bg-zinc-100 text-zinc-600'}`}>
                        {exp.category}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(exp.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <span className="text-base font-black text-red-600 shrink-0">{fmt(exp.amount)}</span>
                  <button onClick={() => handleDelete(exp.id)}
                    className="text-zinc-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={15} />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABA CAIXA ─────────────────────────────────────────────────── */}
        {tab === 'caixa' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-7 h-7 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
              </div>
            ) : caixaHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-zinc-200 rounded-2xl">
                <Banknote size={40} className="text-zinc-200 mb-3" />
                <p className="text-zinc-400 font-medium">Nenhum histórico de caixa</p>
              </div>
            ) : (
              (filterByDate(caixaHistory.map(c => ({ ...c, created_at: c.data + 'T12:00:00' }))) as (Caixa & { created_at: string })[]).map((c, i) => {
                const isAberto = c.status === 'aberto';
                const diff = c.diferenca || 0;
                return (
                  <div key={i} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                    <div className="p-4 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isAberto ? 'bg-emerald-50 text-emerald-500' : 'bg-zinc-100 text-zinc-400'}`}>
                        <Banknote size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-zinc-900 text-sm">
                            {new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isAberto ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                            {isAberto ? 'Aberto' : 'Fechado'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-zinc-400">Fundo: <b className="text-zinc-700">{fmt(c.fundo_inicial)}</b></span>
                          <span className="text-xs text-zinc-400">Esperado: <b className="text-zinc-700">{fmt(c.total_esperado || 0)}</b></span>
                          {!isAberto && <span className="text-xs text-zinc-400">Contado: <b className="text-zinc-700">{fmt(c.valor_contado || 0)}</b></span>}
                          {!isAberto && (
                            <span className={`flex items-center gap-1 text-xs font-bold ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {diff === 0 ? <CheckCircle2 size={12} /> : diff > 0 ? <TrendingUp size={12} /> : <AlertCircle size={12} />}
                              {diff > 0 ? '+' : ''}{fmt(diff)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* ── Modal Nova Despesa ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-black text-zinc-900">Nova Despesa</h3>
                <button onClick={() => setShowAdd(false)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Descrição</label>
                  <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                    placeholder="Ex: Compra de ingredientes"
                    className="mt-1 w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor (R$)</label>
                    <input value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
                      placeholder="0,00" type="text"
                      className="mt-1 w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Categoria</label>
                    <div className="relative mt-1">
                      <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                        className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none appearance-none">
                        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold transition-all">
                  Cancelar
                </button>
                <button onClick={handleAdd} disabled={saving || !form.description || !form.amount}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
