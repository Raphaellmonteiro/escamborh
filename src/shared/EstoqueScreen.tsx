import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Minus, Trash2, FileText, Lock, AlertCircle,
  History, ArrowUpCircle, ArrowDownCircle, Search,
  BarChart2, ChevronDown, ChevronUp, X, Package,
  TrendingDown, DollarSign, Filter, BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  Ingrediente, MovimentacaoEstoque, FichaTecnicaItem,
  RelatorioConsumo, Product,
} from '../types';
import { Card, Button, Input } from '../components/ui/Card';

// ─── helpers ────────────────────────────────────────────────────
const fmt  = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtN = (v: number, u: string) => `${v % 1 === 0 ? v : v.toFixed(2)} ${u}`;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

type Tab    = 'ingredientes' | 'movimentacoes' | 'relatorio' | 'ficha';
type Ordem  = 'nome' | 'status' | 'quantidade' | 'custo';
type Filtro = 'todos' | 'ok' | 'baixo' | 'esgotado';

export default function EstoqueScreen({ token, segmento }: { token: string; segmento: string }) {
  const isBarber    = segmento === 'Barbearia/Salão';
  const labelItem   = isBarber ? 'Insumo/Produto' : 'Ingrediente';
  const labelNovo   = isBarber ? 'Novo Insumo'    : 'Novo Ingrediente';
  const tituloTela  = isBarber ? 'Estoque da Barbearia' : 'Controle de Estoque';
  const unidades    = isBarber
    ? ['unidade', 'frasco', 'litro', 'ml', 'kit', 'caixa', 'kg', 'g']
    : ['kg', 'g', 'unidade', 'litro', 'ml', 'pacote', 'caixa', 'saco', 'bandeja'];

  // ── state principal ──────────────────────────────────────────
  const [tab, setTab]                         = useState<Tab>('ingredientes');
  const [ingredientes, setIngredientes]       = useState<Ingrediente[]>([]);
  const [movimentacoes, setMovimentacoes]     = useState<MovimentacaoEstoque[]>([]);
  const [relatorio, setRelatorio]             = useState<RelatorioConsumo | null>(null);
  const [produtos, setProdutos]               = useState<Product[]>([]);
  const [fichaProduto, setFichaProduto]       = useState<number | ''>('');
  const [fichaItens, setFichaItens]           = useState<FichaTecnicaItem[]>([]);
  const [loading, setLoading]                 = useState(false);

  // ── filtros / busca ──────────────────────────────────────────
  const [busca, setBusca]                     = useState('');
  const [filtroStatus, setFiltroStatus]       = useState<Filtro>('todos');
  const [ordem, setOrdem]                     = useState<Ordem>('nome');
  const [ordemAsc, setOrdemAsc]               = useState(true);

  // ── período (movimentações e relatório) ──────────────────────
  const [periodoInicio, setPeriodoInicio]     = useState(daysAgo(30));
  const [periodoFim, setPeriodoFim]           = useState(today());

  // ── modais ───────────────────────────────────────────────────
  const [editing, setEditing]                 = useState<Partial<Ingrediente> | null>(null);
  const [showMovModal, setShowMovModal]       = useState<{ id: number; tipo: 'entrada' | 'saida' } | null>(null);
  const [movForm, setMovForm]                 = useState({ quantidade: '', motivo: 'Uso do dia' });
  const [showHistorico, setShowHistorico]     = useState<Ingrediente | null>(null);
  const [historico, setHistorico]             = useState<MovimentacaoEstoque[]>([]);
  const [showAddFicha, setShowAddFicha]       = useState(false);
  const [fichaForm, setFichaForm]             = useState({ ingrediente_id: '', quantidade_usada: '' });

  // ── exclusão ─────────────────────────────────────────────────
  const [showAuthModal, setShowAuthModal]     = useState(false);
  const [authPassword, setAuthPassword]       = useState('');
  const [itemToDelete, setItemToDelete]       = useState<number | null>(null);
  const [deleteStep, setDeleteStep]           = useState<'password' | 'confirm1' | 'confirm2'>('password');

  const hdrs = { Authorization: `Bearer ${token}` };
  const jHdrs = { ...hdrs, 'Content-Type': 'application/json' };

  // ── carga inicial ────────────────────────────────────────────
  useEffect(() => { fetchIngredientes(); fetchProdutos(); }, []);
  useEffect(() => { if (tab === 'movimentacoes') fetchMovimentacoes(); }, [tab, periodoInicio, periodoFim]);
  useEffect(() => { if (tab === 'relatorio') fetchRelatorio(); }, [tab, periodoInicio, periodoFim]);
  useEffect(() => { if (tab === 'ficha' && fichaProduto) fetchFicha(fichaProduto as number); }, [fichaProduto]);

  const fetchIngredientes = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/estoque', { headers: hdrs });
      setIngredientes(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchProdutos = async () => {
    try {
      const r = await fetch('/api/products', { headers: hdrs });
      const data = await r.json();
      setProdutos(Array.isArray(data) ? data.filter((p: Product) => p.active) : []);
    } catch {}
  };

  const fetchMovimentacoes = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque/movimentacoes/periodo?inicio=${periodoInicio}&fim=${periodoFim}`, { headers: hdrs });
      setMovimentacoes(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchRelatorio = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque/relatorio/consumo?inicio=${periodoInicio}&fim=${periodoFim}`, { headers: hdrs });
      setRelatorio(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchFicha = async (pid: number) => {
    try {
      const r = await fetch(`/api/estoque/ficha-tecnica/${pid}`, { headers: hdrs });
      setFichaItens(await r.json());
    } catch {}
  };

  const fetchHistoricoItem = async (ing: Ingrediente) => {
    try {
      const r = await fetch(`/api/estoque/${ing.id}/historico`, { headers: hdrs });
      setHistorico(await r.json());
      setShowHistorico(ing);
    } catch {}
  };

  // ── salvar ingrediente ───────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.nome?.trim()) { alert('Informe o nome.'); return; }
    const method = editing.id ? 'PUT' : 'POST';
    const url    = editing.id ? `/api/estoque/${editing.id}` : '/api/estoque';
    try {
      const r = await fetch(url, { method, headers: jHdrs, body: JSON.stringify(editing) });
      const d = await r.json();
      if (r.ok && d.success !== false) { setEditing(null); fetchIngredientes(); }
      else alert(d.message || d.error || 'Erro ao salvar.');
    } catch { alert('Erro de conexão.'); }
  };

  // ── movimentação ─────────────────────────────────────────────
  const handleMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showMovModal) return;
    const qtd = parseFloat(movForm.quantidade);
    if (!qtd || qtd <= 0) { alert('Informe uma quantidade válida.'); return; }
    try {
      const r = await fetch(`/api/estoque/${showMovModal.id}/movimentacao`, {
        method: 'POST', headers: jHdrs,
        body: JSON.stringify({ tipo: showMovModal.tipo, quantidade: qtd, motivo: movForm.motivo })
      });
      const d = await r.json();
      if (d.success) { setShowMovModal(null); setMovForm({ quantidade: '', motivo: 'Uso do dia' }); fetchIngredientes(); }
      else alert(d.message || 'Erro ao registrar.');
    } catch { alert('Erro de conexão.'); }
  };

  // ── ficha técnica ────────────────────────────────────────────
  const handleAddFicha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fichaProduto || !fichaForm.ingrediente_id || !fichaForm.quantidade_usada) return;
    try {
      const r = await fetch(`/api/estoque/ficha-tecnica/${fichaProduto}`, {
        method: 'POST', headers: jHdrs,
        body: JSON.stringify({ ingrediente_id: Number(fichaForm.ingrediente_id), quantidade_usada: parseFloat(fichaForm.quantidade_usada) })
      });
      if (r.ok) { setShowAddFicha(false); setFichaForm({ ingrediente_id: '', quantidade_usada: '' }); fetchFicha(fichaProduto as number); }
    } catch {}
  };

  const handleRemoveFicha = async (ingrediente_id: number) => {
    if (!fichaProduto || !confirm('Remover este ingrediente da ficha técnica?')) return;
    await fetch(`/api/estoque/ficha-tecnica/${fichaProduto}/${ingrediente_id}`, { method: 'DELETE', headers: hdrs });
    fetchFicha(fichaProduto as number);
  };

  // ── exclusão ─────────────────────────────────────────────────
  const handleDeleteClick = (id: number) => {
    setItemToDelete(id); setDeleteStep('password'); setShowAuthModal(true); setAuthPassword('');
  };
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/auth/verify-admin', {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({ senha: authPassword }),
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        alert(data.message || 'Senha de segurança inválida.');
        return;
      }

      setDeleteStep('confirm1');
    } catch {
      alert('Não foi possível validar a senha de segurança.');
    }
  };
  const confirmDelete = async () => {
    if (deleteStep === 'confirm1') { setDeleteStep('confirm2'); return; }
    if (!itemToDelete) return;
    try {
      const response = await fetch(`/api/estoque/${itemToDelete}`, {
        method: 'DELETE',
        headers: jHdrs,
        body: JSON.stringify({ senha: authPassword }),
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        alert(data.message || data.error || 'Erro ao excluir.');
        return;
      }

      fetchIngredientes(); setShowAuthModal(false); setItemToDelete(null);
    } catch { alert('Erro ao excluir.'); }
  };

  // ── lista filtrada e ordenada ─────────────────────────────────
  const ingredientesFiltrados = useMemo(() => {
    let list = [...ingredientes];
    if (busca) {
      const q = busca.toLowerCase();
      list = list.filter(i => i.nome.toLowerCase().includes(q) || (i.fornecedor || '').toLowerCase().includes(q));
    }
    if (filtroStatus !== 'todos') list = list.filter(i => i.status === filtroStatus);
    list.sort((a, b) => {
      let va: any, vb: any;
      if (ordem === 'nome')       { va = a.nome;                  vb = b.nome; }
      else if (ordem === 'status'){ va = a.status || 'ok';        vb = b.status || 'ok'; }
      else if (ordem === 'quantidade') { va = a.estoque_atual;    vb = b.estoque_atual; }
      else                        { va = a.custo_unitario || 0;   vb = b.custo_unitario || 0; }
      if (va < vb) return ordemAsc ? -1 :  1;
      if (va > vb) return ordemAsc ?  1 : -1;
      return 0;
    });
    return list;
  }, [ingredientes, busca, filtroStatus, ordem, ordemAsc]);

  // ── custo do produto selecionado na ficha ────────────────────
  const custoProduto = fichaItens.reduce((s, i) => s + (i.custo_unitario || 0) * i.quantidade_usada, 0);

  // ── badges de status ─────────────────────────────────────────
  const totalEsgotados = ingredientes.filter(i => i.status === 'esgotado').length;
  const totalBaixos    = ingredientes.filter(i => i.status === 'baixo').length;

  const getStatusCls = (s?: string) =>
    s === 'esgotado' ? 'bg-red-50 border-red-300' : s === 'baixo' ? 'bg-amber-50 border-amber-300' : 'bg-white border-zinc-200';

  const ingredienteEmoji = (nome: string) => {
    const n = nome.toLowerCase();
    if (n.includes('carne') || n.includes('boi') || n.includes('frango') || n.includes('bacon')) return '🥩';
    if (n.includes('pão') || n.includes('pao') || n.includes('brioche')) return '🍞';
    if (n.includes('queijo')) return '🧀';
    if (n.includes('alface') || n.includes('salada')) return '🥬';
    if (n.includes('tomate')) return '🍅';
    if (n.includes('molho') || n.includes('maionese') || n.includes('ketchup')) return '🫙';
    if (n.includes('arroz')) return '🍚';
    if (n.includes('feijão') || n.includes('feijao')) return '🫘';
    if (n.includes('ovo')) return '🥚';
    if (n.includes('leite')) return '🥛';
    if (n.includes('oleo') || n.includes('óleo')) return '🫙';
    if (n.includes('farinha')) return '🌾';
    if (n.includes('batata')) return '🥔';
    if (n.includes('cebola')) return '🧅';
    if (n.includes('alho')) return '🧄';
    if (n.includes('cerveja') || n.includes('bebida')) return '🍺';
    if (n.includes('refrigerante') || n.includes('coca') || n.includes('suco')) return '🥤';
    if (n.includes('shampoo')) return '🧴';
    if (n.includes('lâmina') || n.includes('lamina') || n.includes('navalha')) return '🪒';
    if (n.includes('toalha')) return '🧻';
    if (n.includes('luva')) return '🧤';
    if (n.includes('gel') || n.includes('pomada') || n.includes('creme')) return '✨';
    return '📦';
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col bg-zinc-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-zinc-200 px-6 py-5 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-zinc-900">{tituloTela}</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {ingredientes.length} {isBarber ? 'insumos' : 'ingredientes'}
              {totalEsgotados > 0 && <span className="ml-2 text-red-600 font-bold">· {totalEsgotados} esgotado(s)</span>}
              {totalBaixos    > 0 && <span className="ml-1 text-amber-600 font-bold">· {totalBaixos} baixo(s)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tabs */}
            <div className="flex bg-zinc-100 p-1 rounded-xl gap-0.5">
              {([
                { key: 'ingredientes',  label: isBarber ? 'Insumos' : 'Ingredientes', icon: <Package size={14}/> },
                { key: 'movimentacoes', label: 'Movimentações', icon: <History size={14}/> },
                { key: 'relatorio',     label: 'Relatório', icon: <BarChart2 size={14}/> },
                { key: 'ficha',         label: 'Ficha Técnica', icon: <BookOpen size={14}/> },
              ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${tab === t.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            <button onClick={() => setEditing({ nome: '', unidade: 'kg', estoque_atual: 0, estoque_minimo: 0, custo_unitario: 0 })}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all active:scale-95">
              <Plus size={16}/>{labelNovo}
            </button>
          </div>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ═══ ABA: INGREDIENTES ═══ */}
        {tab === 'ingredientes' && (
          <div className="space-y-4">
            {/* Alertas rápidos */}
            {(totalEsgotados > 0 || totalBaixos > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {totalEsgotados > 0 && (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={20}/>
                    </div>
                    <div>
                      <p className="font-bold text-red-900 text-sm">Itens Esgotados</p>
                      <p className="text-xs text-red-700">{ingredientes.filter(i => i.status === 'esgotado').map(i => i.nome).join(', ')}</p>
                    </div>
                  </div>
                )}
                {totalBaixos > 0 && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={20}/>
                    </div>
                    <div>
                      <p className="font-bold text-amber-900 text-sm">Estoque Baixo</p>
                      <p className="text-xs text-amber-700">{ingredientes.filter(i => i.status === 'baixo').map(i => i.nome).join(', ')}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Busca + Filtros + Ordenação */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Busca */}
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou fornecedor..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
              </div>
              {/* Status */}
              <div className="flex bg-white border border-zinc-200 rounded-xl p-0.5 gap-0.5">
                {(['todos', 'ok', 'baixo', 'esgotado'] as Filtro[]).map(f => (
                  <button key={f} onClick={() => setFiltroStatus(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                      filtroStatus === f
                        ? f === 'esgotado' ? 'bg-red-600 text-white'
                        : f === 'baixo'    ? 'bg-amber-500 text-white'
                        : f === 'ok'       ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:bg-zinc-50'
                    }`}>
                    {f === 'todos' ? 'Todos' : f === 'ok' ? 'Normal' : f === 'baixo' ? 'Baixo' : 'Esgotado'}
                  </button>
                ))}
              </div>
              {/* Ordenação */}
              <div className="flex items-center gap-1">
                <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-medium focus:outline-none">
                  <option value="nome">Ordenar: Nome</option>
                  <option value="status">Ordenar: Status</option>
                  <option value="quantidade">Ordenar: Quantidade</option>
                  <option value="custo">Ordenar: Custo</option>
                </select>
                <button onClick={() => setOrdemAsc(!ordemAsc)}
                  className="p-2 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all">
                  {ordemAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>
              </div>
              <span className="text-xs text-zinc-400">{ingredientesFiltrados.length} item(s)</span>
            </div>

            {/* Grid de cards */}
            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin"/></div>
            ) : ingredientesFiltrados.length === 0 ? (
              <div className="text-center py-16 text-zinc-400">
                <Package size={48} className="mx-auto mb-3 opacity-20"/>
                <p className="font-semibold">{busca ? 'Nenhum item encontrado' : 'Nenhum ingrediente cadastrado'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ingredientesFiltrados.map(ing => (
                  <div key={ing.id} className={`rounded-2xl border-2 p-5 transition-all ${getStatusCls(ing.status)}`}>
                    {/* Header do card */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{ingredienteEmoji(ing.nome)}</span>
                        <div>
                          <h3 className="font-black text-zinc-900 text-sm leading-tight">{ing.nome}</h3>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase">{ing.unidade}</p>
                          {ing.fornecedor && <p className="text-[10px] text-zinc-400">📦 {ing.fornecedor}</p>}
                        </div>
                      </div>
                      <div className="flex gap-0.5">
                        <button onClick={() => setEditing(ing)} className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all" title="Editar">
                          <FileText size={14}/>
                        </button>
                        <button onClick={() => fetchHistoricoItem(ing)} className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all" title="Histórico">
                          <History size={14}/>
                        </button>
                        <button onClick={() => handleDeleteClick(ing.id)} className="p-1.5 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-lg transition-all" title="Excluir">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>

                    {/* Estoque atual/mínimo */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/70 rounded-xl p-2.5 border border-zinc-100">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Atual</p>
                        <p className="text-lg font-black text-zinc-900">{ing.estoque_atual} <span className="text-[10px] font-normal text-zinc-400">{ing.unidade}</span></p>
                      </div>
                      <div className="bg-white/70 rounded-xl p-2.5 border border-zinc-100">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Mínimo</p>
                        <p className="text-lg font-black text-zinc-900">{ing.estoque_minimo} <span className="text-[10px] font-normal text-zinc-400">{ing.unidade}</span></p>
                      </div>
                    </div>

                    {/* Barra de nível */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[9px] font-bold text-zinc-400 uppercase mb-1">
                        <span>Nível</span>
                        <span>{Math.round(Math.min(100, (ing.estoque_atual / (ing.estoque_minimo * 3 || 1)) * 100))}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (ing.estoque_atual / (ing.estoque_minimo * 3 || 1)) * 100)}%` }}
                          className={`h-full rounded-full ${ing.status === 'esgotado' ? 'bg-red-500' : ing.status === 'baixo' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        />
                      </div>
                    </div>

                    {/* Custo + uso hoje */}
                    <div className="flex justify-between items-center mb-3 text-[10px]">
                      <div className="flex items-center gap-1 text-red-500 font-bold">
                        <ArrowDownCircle size={12}/> {ing.usado_hoje || 0} {ing.unidade} hoje
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600 font-bold">
                        <ArrowUpCircle size={12}/> +{ing.recebido_hoje || 0} {ing.unidade}
                      </div>
                    </div>

                    {/* Custo unitário */}
                    {(ing.custo_unitario || 0) > 0 && (
                      <div className="mb-3 px-2.5 py-1.5 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">Custo unit.</span>
                        <span className="font-black text-zinc-800">{fmt(ing.custo_unitario || 0)} / {ing.unidade}</span>
                      </div>
                    )}

                    {/* Botões */}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setShowMovModal({ id: ing.id, tipo: 'entrada' }); setMovForm({ quantidade: '', motivo: 'Compra' }); }}
                        className="flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all active:scale-95">
                        <Plus size={12}/> Entrada
                      </button>
                      <button onClick={() => { setShowMovModal({ id: ing.id, tipo: 'saida' }); setMovForm({ quantidade: '', motivo: 'Uso do dia' }); }}
                        className="flex items-center justify-center gap-1.5 py-2 bg-zinc-800 text-white rounded-xl font-bold text-xs hover:bg-zinc-900 transition-all active:scale-95">
                        <Minus size={12}/> Saída
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ABA: MOVIMENTAÇÕES ═══ */}
        {tab === 'movimentacoes' && (
          <div className="space-y-4">
            {/* Filtro de período */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-zinc-200 rounded-2xl p-4">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Período</span>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                className="px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
              <span className="text-zinc-400 text-sm">até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                className="px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
              <div className="flex gap-2 ml-auto flex-wrap">
                {[['Hoje', 0], ['7 dias', 7], ['30 dias', 30]] .map(([label, dias]) => (
                  <button key={label as string} onClick={() => { setPeriodoInicio(daysAgo(dias as number)); setPeriodoFim(today()); }}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-all">
                    {label as string}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
              {loading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin"/></div>
              ) : movimentacoes.length === 0 ? (
                <div className="text-center py-16 text-zinc-400"><History size={40} className="mx-auto mb-3 opacity-20"/><p>Nenhuma movimentação no período</p></div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      {['Data/Hora', 'Item', 'Tipo', 'Quantidade', 'Motivo'].map(h => (
                        <th key={h} className="px-5 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {movimentacoes.map((m, i) => (
                      <tr key={i} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-zinc-900">{m.ingrediente_nome}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${m.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-sm font-black ${m.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {m.tipo === 'entrada' ? '+' : '-'}{m.quantidade} {m.unidade}
                        </td>
                        <td className="px-5 py-3 text-xs text-zinc-500">{m.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ═══ ABA: RELATÓRIO ═══ */}
        {tab === 'relatorio' && (
          <div className="space-y-4">
            {/* Período */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-zinc-200 rounded-2xl p-4">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Período</span>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                className="px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
              <span className="text-zinc-400 text-sm">até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                className="px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
              <div className="flex gap-2 ml-auto flex-wrap">
                {[['7 dias', 7], ['30 dias', 30], ['90 dias', 90]].map(([label, dias]) => (
                  <button key={label as string} onClick={() => { setPeriodoInicio(daysAgo(dias as number)); setPeriodoFim(today()); }}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-all">
                    {label as string}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin"/></div>
            ) : relatorio ? (
              <>
                {/* Cards de resumo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Custo Total do Período</p>
                    <p className="text-2xl font-black text-red-600">{fmt(relatorio.custo_total_periodo)}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Itens Movimentados</p>
                    <p className="text-2xl font-black text-zinc-900">{relatorio.consumo.filter(c => c.total_saida > 0 || c.total_entrada > 0).length}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Maior Consumo</p>
                    <p className="text-sm font-black text-zinc-900 truncate">
                      {relatorio.consumo[0]?.nome || '—'}
                    </p>
                    {relatorio.consumo[0] && (
                      <p className="text-xs text-zinc-400">{fmtN(relatorio.consumo[0].total_saida, relatorio.consumo[0].unidade)} consumido</p>
                    )}
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
                    <p className="text-xs font-black text-zinc-600 uppercase tracking-wider">Consumo por Item</p>
                  </div>
                  <table className="w-full text-left">
                    <thead className="border-b border-zinc-100">
                      <tr>
                        {['Item', 'Saída', 'Entrada', 'Custo Unit.', 'Custo Total', 'Fornecedor'].map(h => (
                          <th key={h} className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {relatorio.consumo.map(r => (
                        <tr key={r.id} className={`hover:bg-zinc-50 transition-colors ${r.total_saida === 0 && r.total_entrada === 0 ? 'opacity-40' : ''}`}>
                          <td className="px-5 py-3 text-sm font-bold text-zinc-900">
                            {ingredienteEmoji(r.nome)} {r.nome}
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-red-600">
                            {r.total_saida > 0 ? `-${fmtN(r.total_saida, r.unidade)}` : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-emerald-700">
                            {r.total_entrada > 0 ? `+${fmtN(r.total_entrada, r.unidade)}` : '—'}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">
                            {r.custo_unitario > 0 ? fmt(r.custo_unitario) : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm font-black text-zinc-900">
                            {r.custo_total > 0 ? fmt(r.custo_total) : '—'}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">{r.fornecedor || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ═══ ABA: FICHA TÉCNICA ═══ */}
        {tab === 'ficha' && (
          <div className="space-y-4">
            {/* Seleção do produto */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mb-1.5">Produto</label>
                <select value={fichaProduto} onChange={e => setFichaProduto(Number(e.target.value) || '')}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 bg-zinc-50">
                  <option value="">Selecione um produto...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {fichaProduto !== '' && (
                <div className="flex items-center gap-3">
                  {custoProduto > 0 && (
                    <div className="px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                      <p className="text-[9px] font-black text-zinc-400 uppercase">Custo da Receita</p>
                      <p className="text-base font-black text-zinc-900">{fmt(custoProduto)}</p>
                    </div>
                  )}
                  <button onClick={() => setShowAddFicha(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all">
                    <Plus size={14}/> Adicionar Ingrediente
                  </button>
                </div>
              )}
            </div>

            {fichaProduto === '' ? (
              <div className="text-center py-16 text-zinc-400">
                <BookOpen size={48} className="mx-auto mb-3 opacity-20"/>
                <p className="font-semibold">Selecione um produto para ver ou editar sua ficha técnica</p>
                <p className="text-sm mt-1">A ficha técnica vincula ingredientes aos produtos e calcula o custo automaticamente.</p>
              </div>
            ) : fichaItens.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 bg-white border border-dashed border-zinc-300 rounded-2xl">
                <BookOpen size={36} className="mx-auto mb-3 opacity-20"/>
                <p className="font-semibold">Nenhum ingrediente na ficha técnica</p>
                <p className="text-sm mt-1">Clique em "Adicionar Ingrediente" para montar a receita deste produto.</p>
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                  <p className="text-xs font-black text-zinc-600 uppercase tracking-wider">Ingredientes da Receita</p>
                  {custoProduto > 0 && (
                    <span className="text-xs font-bold text-zinc-500">Custo total: <strong className="text-zinc-900">{fmt(custoProduto)}</strong></span>
                  )}
                </div>
                <table className="w-full text-left">
                  <thead className="border-b border-zinc-100">
                    <tr>
                      {['Ingrediente', 'Qtd. usada', 'Estoque atual', 'Custo unit.', 'Custo parcial', ''].map(h => (
                        <th key={h} className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {fichaItens.map(fi => (
                      <tr key={fi.id} className="hover:bg-zinc-50">
                        <td className="px-5 py-3 text-sm font-bold text-zinc-900">{ingredienteEmoji(fi.nome)} {fi.nome}</td>
                        <td className="px-5 py-3 text-sm text-zinc-700">{fmtN(fi.quantidade_usada, fi.unidade)}</td>
                        <td className={`px-5 py-3 text-sm font-bold ${fi.estoque_atual <= 0 ? 'text-red-600' : 'text-zinc-700'}`}>
                          {fmtN(fi.estoque_atual, fi.unidade)}
                        </td>
                        <td className="px-5 py-3 text-xs text-zinc-500">{fi.custo_unitario ? fmt(fi.custo_unitario) : '—'}</td>
                        <td className="px-5 py-3 text-sm font-black text-zinc-900">
                          {fi.custo_unitario ? fmt(fi.custo_unitario * fi.quantidade_usada) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <button onClick={() => handleRemoveFicha(fi.ingrediente_id)}
                            className="p-1.5 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all">
                            <X size={14}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════ MODAIS ════════════════════ */}

      {/* Modal: Novo/Editar Ingrediente */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-zinc-900">{editing.id ? `Editar ${labelItem}` : labelNovo}</h3>
                <button onClick={() => setEditing(null)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                {/* Nome */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Nome do item *</label>
                  <input value={editing.nome || ''} onChange={e => setEditing(p => ({...p, nome: e.target.value}))}
                    placeholder="ex: Carne bovina, Pão brioche, Queijo cheddar..."
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400" required/>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Unidade */}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Unidade</label>
                    <select value={editing.unidade || 'kg'} onChange={e => setEditing(p => ({...p, unidade: e.target.value}))}
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none">
                      {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {/* Estoque mínimo */}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Estoque mínimo</label>
                    <input type="number" step="0.01" min="0" value={editing.estoque_minimo ?? 0}
                      onChange={e => setEditing(p => ({...p, estoque_minimo: parseFloat(e.target.value)}))}
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none" required/>
                  </div>
                </div>

                {/* Estoque inicial (só criação) */}
                {!editing.id && (
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Estoque inicial</label>
                    <input type="number" step="0.01" min="0" value={editing.estoque_atual ?? 0}
                      onChange={e => setEditing(p => ({...p, estoque_atual: parseFloat(e.target.value)}))}
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Custo unitário */}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Custo unitário (R$)</label>
                    <input type="number" step="0.01" min="0" value={editing.custo_unitario ?? 0}
                      onChange={e => setEditing(p => ({...p, custo_unitario: parseFloat(e.target.value)}))}
                      placeholder="0,00"
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                  </div>
                  {/* Código de barras */}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Código de barras</label>
                    <input value={editing.codigo_barras || ''} onChange={e => setEditing(p => ({...p, codigo_barras: e.target.value}))}
                      placeholder="opcional"
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                  </div>
                </div>

                {/* Fornecedor */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Fornecedor</label>
                  <input value={editing.fornecedor || ''} onChange={e => setEditing(p => ({...p, fornecedor: e.target.value}))}
                    placeholder="ex: Distribuidora XYZ, Mercado Central..."
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditing(null)}
                    className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold transition-all">Cancelar</button>
                  <button type="submit"
                    className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all">Salvar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Movimentação */}
      <AnimatePresence>
        {showMovModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-black text-zinc-900">
                    {showMovModal.tipo === 'entrada' ? '📥 Registrar Entrada' : '📤 Registrar Saída'}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-0.5">{ingredientes.find(i => i.id === showMovModal.id)?.nome}</p>
                </div>
                <button onClick={() => setShowMovModal(null)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
              </div>
              <form onSubmit={handleMovimentacao} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Quantidade</label>
                  <input type="number" step="0.01" min="0.01" value={movForm.quantidade} autoFocus
                    onChange={e => setMovForm(f => ({...f, quantidade: e.target.value}))}
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400" required/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Motivo</label>
                  <select value={movForm.motivo} onChange={e => setMovForm(f => ({...f, motivo: e.target.value}))}
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none">
                    {showMovModal.tipo === 'entrada' ? (
                      <>
                        <option>Compra</option>
                        <option>Devolução</option>
                        <option>Ajuste/Inventário</option>
                        <option>Transferência</option>
                      </>
                    ) : (
                      <>
                        <option>Uso do dia</option>
                        <option>Perda/Desperdício</option>
                        <option>Vencimento</option>
                        <option>Ajuste/Inventário</option>
                        <option>Transferência</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowMovModal(null)}
                    className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Cancelar</button>
                  <button type="submit"
                    className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold transition-all ${showMovModal.tipo === 'entrada' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-zinc-900 hover:bg-zinc-800'}`}>
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Histórico */}
      <AnimatePresence>
        {showHistorico && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-black text-zinc-900">Histórico — {showHistorico.nome}</h3>
                  <p className="text-sm text-zinc-400">Últimas 30 movimentações</p>
                </div>
                <button onClick={() => setShowHistorico(null)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-zinc-100">
                    <tr>
                      {['Data/Hora', 'Tipo', 'Qtd', 'Motivo'].map(h => (
                        <th key={h} className="py-3 pr-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {historico.length === 0 ? (
                      <tr><td colSpan={4} className="py-10 text-center text-zinc-400 italic">Nenhuma movimentação registrada</td></tr>
                    ) : historico.map((h, i) => (
                      <tr key={i} className="hover:bg-zinc-50">
                        <td className="py-3 pr-4 text-xs text-zinc-500">{new Date(h.created_at).toLocaleString('pt-BR')}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${h.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{h.tipo}</span>
                        </td>
                        <td className={`py-3 pr-4 text-xs font-black ${h.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {h.tipo === 'entrada' ? '+' : '-'}{h.quantidade} {showHistorico.unidade}
                        </td>
                        <td className="py-3 text-xs text-zinc-500">{h.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 pt-5 border-t border-zinc-100">
                <button onClick={() => setShowHistorico(null)} className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold transition-all">Fechar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Adicionar à Ficha Técnica */}
      <AnimatePresence>
        {showAddFicha && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-black text-zinc-900">Adicionar Ingrediente</h3>
                <button onClick={() => setShowAddFicha(false)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
              </div>
              <form onSubmit={handleAddFicha} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Ingrediente</label>
                  <select value={fichaForm.ingrediente_id} onChange={e => setFichaForm(f => ({...f, ingrediente_id: e.target.value}))}
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none" required>
                    <option value="">Selecione...</option>
                    {ingredientes.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                  </select>
                </div>
                <div>
                  {(() => {
                    const ingSel = ingredientes.find(i => String(i.id) === fichaForm.ingrediente_id);
                    const unid = ingSel?.unidade || '';
                    const isKg  = unid === 'kg';
                    const isLit = unid === 'litro';
                    const placeholder = isKg  ? 'ex: 0.15  (= 150g por unidade)'
                                      : isLit ? 'ex: 0.25  (= 250ml por unidade)'
                                      : `ex: 1  (= 1 ${unid || 'unidade'} por produto)`;
                    const dica = isKg  ? '💡 Em kg: 100g = 0,1 · 250g = 0,25 · 500g = 0,5'
                               : isLit ? '💡 Em litro: 100ml = 0,1 · 250ml = 0,25 · 500ml = 0,5'
                               : unid  ? `💡 Digite quantas ${unid}(s) são usadas por unidade vendida`
                               : '';
                    return (
                      <>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                          Quantidade usada por unidade do produto
                          {unid && <span className="ml-1 normal-case font-normal text-zinc-400">({unid})</span>}
                        </label>
                        <input type="number" step="0.001" min="0.001" value={fichaForm.quantidade_usada}
                          onChange={e => setFichaForm(f => ({...f, quantidade_usada: e.target.value}))}
                          placeholder={placeholder}
                          className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none" required/>
                        {dica && <p className="text-[10px] text-zinc-400 mt-1">{dica}</p>}
                        {fichaForm.quantidade_usada && ingSel && (
                          <p className="text-[11px] text-emerald-600 font-bold mt-1">
                            ✅ Usa {fmtN(parseFloat(fichaForm.quantidade_usada) || 0, unid)} por unidade vendida
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowAddFicha(false)}
                    className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Cancelar</button>
                  <button type="submit"
                    className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all">Adicionar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Autenticação para Exclusão */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              {deleteStep === 'password' ? (
                <>
                  <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-5"><Lock size={28}/></div>
                  <h3 className="text-xl font-black text-zinc-900 text-center">Autorizar Exclusão</h3>
                  <p className="text-zinc-400 text-center text-sm mt-2 mb-6">Digite a senha de segurança para continuar.</p>
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                      placeholder="••••••" autoFocus className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none text-center tracking-widest" required/>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowAuthModal(false)}
                        className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-sm font-bold">Cancelar</button>
                      <button type="submit" className="flex-1 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold">Confirmar</button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-center">
                  <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5"><AlertCircle size={28}/></div>
                  <h3 className="text-xl font-black text-zinc-900">{deleteStep === 'confirm1' ? 'Tem certeza?' : 'Confirmação Final'}</h3>
                  <p className="text-zinc-400 text-sm mt-2 mb-6">
                    {deleteStep === 'confirm1' ? 'Todas as movimentações vinculadas serão apagadas.' : 'Esta ação é irreversível. Confirma a exclusão?'}
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => { setShowAuthModal(false); setItemToDelete(null); }}
                      className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-sm font-bold">Cancelar</button>
                    <button onClick={confirmDelete}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold">
                      {deleteStep === 'confirm1' ? 'Sim, continuar' : 'Sim, excluir'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
