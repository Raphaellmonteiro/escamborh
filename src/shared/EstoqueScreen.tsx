import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { usePaginatedList } from '../hooks/usePaginatedList';
import {
  Plus, Minus, Trash2, FileText, Lock, AlertCircle,
  History, ArrowUpCircle, ArrowDownCircle, Search,
  BarChart2, ChevronDown, ChevronUp, X, Package,
  BookOpen, Link2, RefreshCw,
  SlidersHorizontal, RotateCcw, Zap,   Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  Ingrediente, MovimentacaoEstoque, FichaTecnicaItem,
  RelatorioConsumo, Product, LegacyFallbackAuditReport,
} from '../types';
import { EmptyState } from '../components/ui/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Spinner } from '../components/ui/Spinner';
import { adminScreenPagePaddingClass } from '../components/ui/screenChrome';

// ─── helpers ────────────────────────────────────────────────────
const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return fallback;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;

  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const fmt  = (v: unknown) => `R$ ${toNumber(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtN = (v: unknown, u?: string | null) => {
  const n = toNumber(v);
  const unit = typeof u === 'string' && u.trim() ? u.trim() : 'unidade';
  return `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

type Tab    = 'ingredientes' | 'movimentacoes' | 'relatorio' | 'ficha' | 'padronizacao';
type Ordem  = 'nome' | 'status' | 'quantidade' | 'custo';
type Filtro = 'todos' | 'ok' | 'baixo' | 'esgotado';

const ESTOQUE_INTRO_COLLAPSED_KEY = 'flowpdv_estoque_intro_collapsed';

type TutorialAction = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
};

const SIMPLE_MODE_ACTIONS: TutorialAction[] = [
  {
    title: 'Entrada',
    description: 'Soma estoque quando chega compra, reposicao ou devolucao do fornecedor.',
    icon: ArrowUpCircle,
    iconClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    title: 'Saida',
    description: 'Desconta manualmente perdas, uso interno ou vendas feitas fora do fluxo automatico.',
    icon: ArrowDownCircle,
    iconClass:
      'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  {
    title: 'Zerar',
    description: 'Transforma todo o saldo atual em uma saida unica para reiniciar a contagem.',
    icon: RotateCcw,
    iconClass:
      'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  },
  {
    title: 'Editar',
    description: 'Altera nome, unidade, custo e fornecedor. Se mudar o saldo, o sistema registra ajuste.',
    icon: FileText,
    iconClass:
      'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    title: 'Historico',
    description: 'Mostra as ultimas movimentacoes do item para conferir entradas, saidas e ajustes.',
    icon: History,
    iconClass:
      'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
];

const SIMPLE_MODE_STEPS = [
  'Cadastre o item no estoque como Coca-Cola lata, unidade "unidade" e estoque atual de 20.',
  'No produto de venda, deixe o vinculo correto com o estoque: codigo de barras exato igual ao item de estoque ou uma variacao ligada ao item certo.',
  'Quando vender no balcao, mesa ou delivery com esse vinculo valido, o sistema localiza a Coca-Cola e baixa automaticamente a quantidade vendida.',
  'Exemplo: vendeu 3 latas. O estoque cai de 20 para 17 e a movimentacao fica registrada no historico.',
];

const ADVANCED_MODE_STEPS = [
  'Cadastre os ingredientes reais no estoque, por exemplo arroz, feijao e carne, usando kg, g, litro ou ml.',
  'Abra Receita / Producao e monte a ficha tecnica da marmita informando quanto cada ingrediente usa por unidade vendida.',
  'Exemplo: 1 marmita pode consumir 0,18 kg de arroz, 0,12 kg de feijao e 0,15 kg de carne.',
  'Quando a marmita for vendida, o sistema multiplica a ficha tecnica pela quantidade do pedido e baixa cada ingrediente automaticamente.',
];

const STOCK_IDENTIFICATION_STEPS = [
  'Se a variacao vendavel estiver ligada diretamente a um item de estoque, esse item tem prioridade na baixa.',
  'Se a variacao tiver codigo de barras proprio e ele bater exatamente com um item de estoque, o sistema usa esse item.',
  'Se o produto tiver ficha tecnica, a baixa acontece pelos ingredientes cadastrados na ficha.',
  'Se nao houver ficha tecnica, o sistema ainda pode baixar 1 para 1 quando o codigo de barras do produto for igual ao codigo do item de estoque.',
];

/** Valores sugeridos para saída rápida conforme a unidade do item. */
function quickSaidaPresets(unidade: string): number[] {
  const u = (unidade || '').toLowerCase();
  if (u === 'g' || u === 'ml') return [50, 100, 250];
  if (u === 'kg' || u === 'litro') return [0.1, 0.25, 0.5];
  return [1, 5, 10];
}

function fmtQuickQtyBtn(q: number): string {
  const s = Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
  return `−${s}`;
}

function previewIngredientNames(items: Ingrediente[]): string {
  if (items.length === 0) return 'Nenhum item nesta categoria.';
  const visible = items.slice(0, 3).map((item) => item.nome).join(', ');
  return items.length > 3 ? `${visible} +${items.length - 3}` : visible;
}

export default function EstoqueScreen({ token, segmento: _segmento }: { token: string; segmento: string }) {
  const labelItem   = 'Item';
  const labelNovo   = 'Novo item';
  const tituloTela  = 'Controle de Estoque';
  const unidades    = ['kg', 'g', 'unidade', 'litro', 'ml', 'pacote', 'caixa', 'saco', 'bandeja'];

  // ── state principal ──────────────────────────────────────────
  const [tab, setTab]                         = useState<Tab>('ingredientes');
  const [introCollapsed, setIntroCollapsed]   = useState(() => {
    try {
      return localStorage.getItem(ESTOQUE_INTRO_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [ingredientes, setIngredientes]       = useState<Ingrediente[]>([]);
  const [movimentacoes, setMovimentacoes]     = useState<MovimentacaoEstoque[]>([]);
  const [relatorio, setRelatorio]             = useState<RelatorioConsumo | null>(null);
  const [padronizacao, setPadronizacao]       = useState<LegacyFallbackAuditReport | null>(null);
  const [produtos, setProdutos]               = useState<Product[]>([]);
  const [fichaProduto, setFichaProduto]       = useState<number | ''>('');
  const [fichaItens, setFichaItens]           = useState<FichaTecnicaItem[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [padronizacaoFixingKey, setPadronizacaoFixingKey] = useState<string | null>(null);

  // ── filtros / busca ──────────────────────────────────────────
  const [busca, setBusca]                     = useState('');
  const debouncedBusca                        = useDebounce(busca, 250);
  const [filtroStatus, setFiltroStatus]       = useState<Filtro>('todos');
  const [ordem, setOrdem]                     = useState<Ordem>('nome');
  const [ordemAsc, setOrdemAsc]               = useState(true);

  // ── período (movimentações e relatório) ──────────────────────
  const [periodoInicio, setPeriodoInicio]     = useState(daysAgo(30));
  const [periodoFim, setPeriodoFim]           = useState(today());

  // ── modais ───────────────────────────────────────────────────
  const [editing, setEditing]                 = useState<Partial<Ingrediente> | null>(null);
  const [showMovModal, setShowMovModal]       = useState<{ id: number; tipo: 'entrada' | 'saida' | 'ajustar' | 'zerar' } | null>(null);
  const [movForm, setMovForm]                 = useState({ quantidade: '', motivo: 'Uso do dia', novoValor: '' });
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
  // Deeplink admin → aba Receita / Produção: só aplica depois que `produtos` carrega; senão o <select>
  // fica com value sem <option> correspondente e o browser mostra o primeiro item da lista.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('flowpdv_estoque_deeplink') || sessionStorage.getItem('flowpdv_estoque_deeplink');
      if (!raw) return;
      const o = JSON.parse(raw) as { tab?: string; productId?: unknown };
      if (o.tab !== 'ficha') return;
      const pid = Number(o.productId);
      if (!Number.isFinite(pid)) {
        localStorage.removeItem('flowpdv_estoque_deeplink');
        sessionStorage.removeItem('flowpdv_estoque_deeplink');
        return;
      }
      if (produtos.length === 0) return;
      const match = produtos.some((p) => Number(p.id) === pid);
      if (!match) {
        localStorage.removeItem('flowpdv_estoque_deeplink');
        sessionStorage.removeItem('flowpdv_estoque_deeplink');
        return;
      }
      setTab('ficha');
      setFichaProduto(pid);
      localStorage.removeItem('flowpdv_estoque_deeplink');
      sessionStorage.removeItem('flowpdv_estoque_deeplink');
    } catch {
      try {
        localStorage.removeItem('flowpdv_estoque_deeplink');
        sessionStorage.removeItem('flowpdv_estoque_deeplink');
      } catch {
        /* ignore */
      }
    }
  }, [produtos]);

  useEffect(() => { fetchIngredientes(); fetchProdutos(); }, []);
  useEffect(() => { if (tab === 'movimentacoes') fetchMovimentacoes(); }, [tab, periodoInicio, periodoFim]);
  useEffect(() => { if (tab === 'relatorio') fetchRelatorio(); }, [tab, periodoInicio, periodoFim]);
  useEffect(() => { if (tab === 'padronizacao') fetchPadronizacao(); }, [tab]);
  useEffect(() => { if (tab === 'ficha' && fichaProduto) fetchFicha(fichaProduto as number); }, [fichaProduto]);

  const fetchIngredientes = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const r = await fetch('/api/estoque', { headers: hdrs });
      setIngredientes(await r.json());
    } catch {} finally { if (!silent) setLoading(false); }
  };

  const postMovimentacao = async (
    ingredienteId: number,
    tipo: 'entrada' | 'saida',
    quantidade: number,
    motivo: string
  ): Promise<{ ok: boolean; message?: string }> => {
    try {
      const r = await fetch(`/api/estoque/${ingredienteId}/movimentacao`, {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({ tipo, quantidade, motivo }),
      });
      const d = await r.json();
      if (d.success) return { ok: true };
      return { ok: false, message: d.message || d.error || 'Erro ao registrar.' };
    } catch {
      return { ok: false, message: 'Erro de conexão.' };
    }
  };

  const handleQuickSaida = async (ing: Ingrediente, quantidade: number) => {
    if (quantidade <= 0) return;
    const atual = toNumber(ing.estoque_atual);
    if (atual < quantidade) {
      alert('Estoque insuficiente para esta saída rápida.');
      return;
    }
    const res = await postMovimentacao(ing.id, 'saida', quantidade, 'Saída rápida');
    if (res.ok) await fetchIngredientes({ silent: true });
    else alert(res.message || 'Erro ao registrar.');
  };

  const setIntroCollapsedPersist = (collapsed: boolean) => {
    setIntroCollapsed(collapsed);
    try {
      if (collapsed) localStorage.setItem(ESTOQUE_INTRO_COLLAPSED_KEY, '1');
      else localStorage.removeItem(ESTOQUE_INTRO_COLLAPSED_KEY);
    } catch {
      /* ignore */
    }
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
      const data = await r.json();
      const consumoBruto = Array.isArray(data)
        ? data
        : Array.isArray(data?.consumo)
          ? data.consumo
          : [];

      const consumo = consumoBruto
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => {
          const totalSaida = toNumber(item.total_saida ?? item.total_consumido);
          const custoUnitario = toNumber(item.custo_unitario);
          return {
            id: toNumber(item.id),
            nome: typeof item.nome === 'string' ? item.nome : 'Item sem nome',
            unidade: typeof item.unidade === 'string' && item.unidade.trim() ? item.unidade : 'unidade',
            custo_unitario: custoUnitario,
            fornecedor: typeof item.fornecedor === 'string' ? item.fornecedor : undefined,
            total_saida: totalSaida,
            total_entrada: toNumber(item.total_entrada),
            custo_total: toNumber(item.custo_total, custoUnitario * totalSaida),
            qtd_saidas: toNumber(item.qtd_saidas),
          };
        });

      setRelatorio({
        consumo,
        custo_total_periodo: toNumber(
          Array.isArray(data) ? undefined : data?.custo_total_periodo,
          consumo.reduce((total, item) => total + item.custo_total, 0)
        ),
        periodo: {
          inicio: typeof data?.periodo?.inicio === 'string' ? data.periodo.inicio : periodoInicio,
          fim: typeof data?.periodo?.fim === 'string' ? data.periodo.fim : periodoFim,
        },
      });
    } catch {} finally { setLoading(false); }
  };

  const fetchPadronizacao = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/estoque/padronizacao/produtos-pendentes', { headers: hdrs });
      setPadronizacao(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchFicha = async (pid: number) => {
    try {
      const r = await fetch(`/api/estoque/ficha-tecnica/${pid}`, { headers: hdrs });
      const data = await r.json();
      setFichaItens(
        Array.isArray(data)
          ? data
              .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
              .map((item): FichaTecnicaItem => ({
                id: toNumber(item.id),
                product_id: toNumber(item.product_id),
                ingrediente_id: toNumber(item.ingrediente_id),
                nome: typeof item.nome === 'string' ? item.nome : typeof item.ingrediente_nome === 'string' ? item.ingrediente_nome : '',
                ingrediente_nome: typeof item.ingrediente_nome === 'string' ? item.ingrediente_nome : undefined,
                unidade: typeof item.unidade === 'string' && item.unidade.trim() ? item.unidade : 'unidade',
                quantidade_usada: toNumber(item.quantidade_usada),
                estoque_atual: toNumber(item.estoque_atual ?? item.estoque),
                custo_unitario: toOptionalNumber(item.custo_unitario ?? item.custo ?? item.valor_unitario),
              }))
          : []
      );
    } catch {}
  };

  const handleApplyPadronizacaoFixes = async (productIds?: number[]) => {
    const requestKey = productIds?.length ? `item:${productIds.join(',')}` : 'bulk';
    setPadronizacaoFixingKey(requestKey);
    try {
      const r = await fetch('/api/estoque/padronizacao/corrigir-seguros', {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({
          only_active: true,
          product_ids: productIds?.length ? productIds : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || data.success === false) {
        alert(data.error || 'Nao foi possivel aplicar as correcoes seguras.');
        return;
      }

      setPadronizacao(data.report);
      await Promise.all([fetchProdutos(), fetchIngredientes()]);
      alert(
        `Fase 1 aplicada: ${data.appliedCount} correcao(oes) segura(s) (${data.recipeFixes} receita(s), ${data.barcodeFixes} barcode(s)).`
      );
    } catch {
      alert('Erro de conexao ao aplicar as correcoes seguras.');
    } finally {
      setPadronizacaoFixingKey(null);
    }
  };

  const handleApplyPadronizacaoManualPhase = async (productIds?: number[]) => {
    const requestKey = productIds?.length ? `manual:item:${productIds.join(',')}` : 'manual:bulk';
    setPadronizacaoFixingKey(requestKey);
    try {
      const r = await fetch('/api/estoque/padronizacao/corrigir-manuais-fase-1', {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({
          only_active: true,
          product_ids: productIds?.length ? productIds : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || data.success === false) {
        alert(data.error || 'Nao foi possivel aplicar a fase manual segura.');
        return;
      }

      setPadronizacao(data.report);
      await Promise.all([fetchProdutos(), fetchIngredientes()]);
      alert(
        `Fase manual segura aplicada: ${data.appliedCount} correcao(oes) (${data.createdIngredients} item(ns) de estoque, ${data.createdRecipes} receita(s)).`
      );
    } catch {
      alert('Erro de conexao ao aplicar a fase manual segura.');
    } finally {
      setPadronizacaoFixingKey(null);
    }
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
      if (r.ok && d.success !== false) {
        setEditing(null);
        fetchIngredientes();
        if (tab === 'padronizacao') fetchPadronizacao();
      }
      else alert(d.message || d.error || 'Erro ao salvar.');
    } catch { alert('Erro de conexão.'); }
  };

  // ── movimentação ─────────────────────────────────────────────
  const handleMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showMovModal) return;

    const ing = ingredientes.find(i => i.id === showMovModal.id);
    if (!ing) return;

    let tipo: 'entrada' | 'saida';
    let quantidade: number;

    if (showMovModal.tipo === 'zerar') {
      tipo = 'saida';
      quantidade = Math.max(0, toNumber(ing.estoque_atual));
      if (quantidade === 0) { alert('Estoque já está zerado.'); return; }
    } else if (showMovModal.tipo === 'ajustar') {
      const novoValor = parseFloat(movForm.novoValor);
      if (Number.isNaN(novoValor) || novoValor < 0) { alert('Informe um valor válido para o novo estoque.'); return; }
      const antigo = toNumber(ing.estoque_atual);
      const diff = novoValor - antigo;
      if (diff === 0) { alert('O valor informado é igual ao estoque atual.'); return; }
      tipo = diff > 0 ? 'entrada' : 'saida';
      quantidade = Math.abs(diff);
    } else {
      const qtd = parseFloat(movForm.quantidade);
      if (!qtd || qtd <= 0) { alert('Informe uma quantidade válida.'); return; }
      tipo = showMovModal.tipo;
      quantidade = qtd;
    }

    let motivo = (movForm.motivo || '').trim();
    if (!motivo) {
      if (showMovModal.tipo === 'entrada') motivo = 'Compra';
      else if (showMovModal.tipo === 'saida') motivo = 'Uso do dia';
      else if (showMovModal.tipo === 'zerar') motivo = 'Zeramento manual';
      else if (showMovModal.tipo === 'ajustar') motivo = 'Ajuste/Inventário';
    }

    const res = await postMovimentacao(showMovModal.id, tipo, quantidade, motivo);
    if (res.ok) {
      setShowMovModal(null);
      setMovForm({ quantidade: '', motivo: 'Uso do dia', novoValor: '' });
      fetchIngredientes();
    } else alert(res.message || 'Erro ao registrar.');
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
      if (r.ok) {
        setShowAddFicha(false);
        setFichaForm({ ingrediente_id: '', quantidade_usada: '' });
        fetchFicha(fichaProduto as number);
        if (tab === 'padronizacao') fetchPadronizacao();
      }
    } catch {}
  };

  const handleRemoveFicha = async (ingrediente_id: number) => {
    if (!fichaProduto || !confirm('Remover este item da receita / produção deste produto?')) return;
    await fetch(`/api/estoque/ficha-tecnica/${fichaProduto}/${ingrediente_id}`, { method: 'DELETE', headers: hdrs });
    fetchFicha(fichaProduto as number);
    if (tab === 'padronizacao') fetchPadronizacao();
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

      fetchIngredientes();
      if (tab === 'padronizacao') fetchPadronizacao();
      setShowAuthModal(false);
      setItemToDelete(null);
    } catch { alert('Erro ao excluir.'); }
  };

  // ── lista filtrada e ordenada ─────────────────────────────────
  const ingredientesFiltrados = useMemo(() => {
    let list = [...ingredientes];
    if (debouncedBusca) {
      const q = debouncedBusca.toLowerCase();
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
  }, [ingredientes, debouncedBusca, filtroStatus, ordem, ordemAsc]);

  const { visibleItems: ingredientesVisiveis, hasMore: hasMoreIngredientes, loadMore: loadMoreIngredientes, totalCount: totalIngredientes } = usePaginatedList(ingredientesFiltrados, { pageSize: 30 });

  const { visibleItems: movimentacoesVisiveis, hasMore: hasMoreMovimentacoes, loadMore: loadMoreMovimentacoes, totalCount: totalMovimentacoes } = usePaginatedList(movimentacoes, { pageSize: 30 });

  const safePadronizacaoItems = useMemo(
    () => (Array.isArray(padronizacao?.items) ? padronizacao.items : []).filter(
      item => Boolean(item.safeFixAction) && item.productActive
    ),
    [padronizacao]
  );

  const manualPadronizacaoItems = useMemo(
    () => (Array.isArray(padronizacao?.items) ? padronizacao.items : []).filter(
      item => Boolean(item.manualFixAction) && item.productActive
    ),
    [padronizacao]
  );

  const padronizacaoItems = useMemo(
    () => Array.isArray(padronizacao?.items) ? padronizacao.items : [],
    [padronizacao]
  );

  const { visibleItems: padronizacaoItemsVisiveis, hasMore: hasMorePadronizacao, loadMore: loadMorePadronizacao, totalCount: totalPadronizacao } = usePaginatedList(padronizacaoItems, { pageSize: 30 });

  const padronizacaoSummary = useMemo(() => ({
    totalPendingProducts: padronizacaoItems.length,
    activePendingProducts: padronizacaoItems.filter(item => item.productActive).length,
    inactivePendingProducts: padronizacaoItems.filter(item => !item.productActive).length,
    legacyFallbackProducts: padronizacaoItems.filter(item => item.usesLegacyNameFallback).length,
    ambiguousPendingProducts: padronizacaoItems.filter(item => item.ambiguousNameMatch).length,
    singleMatchPendingProducts: padronizacaoItems.filter(item => item.exactNameMatchCount === 1).length,
    unmatchedPendingProducts: padronizacaoItems.filter(item => item.exactNameMatchCount === 0).length,
    safeBarcodeCandidates: padronizacaoItems.filter(item => item.safeFixAction === 'align_product_barcode').length,
    safeRecipeCandidates: padronizacaoItems.filter(item => item.safeFixAction === 'create_explicit_recipe').length,
    safeFixCandidates: padronizacaoItems.filter(item => Boolean(item.safeFixAction)).length,
    manualPhaseOneCandidates: padronizacaoItems.filter(item => Boolean(item.manualFixAction)).length,
  }), [padronizacaoItems]);

  const relatorioConsumo = useMemo(
    () => Array.isArray(relatorio?.consumo) ? relatorio.consumo : [],
    [relatorio]
  );

  const { visibleItems: relatorioConsumoVisiveis, hasMore: hasMoreRelatorioConsumo, loadMore: loadMoreRelatorioConsumo, totalCount: totalRelatorioConsumo } = usePaginatedList(relatorioConsumo, { pageSize: 30 });

  const { visibleItems: historicoVisiveis, hasMore: hasMoreHistorico, loadMore: loadMoreHistorico, totalCount: totalHistorico } = usePaginatedList(historico, { pageSize: 30 });

  // ── custo do produto selecionado na ficha ────────────────────
  const custoProduto = fichaItens.reduce(
    (s, i) => s + toNumber(i.custo_unitario) * toNumber(i.quantidade_usada),
    0
  );

  // ── badges de status ─────────────────────────────────────────
  const itensEsgotados = ingredientes.filter((item) => item.status === 'esgotado');
  const itensBaixos = ingredientes.filter((item) => item.status === 'baixo');
  const totalEsgotados = itensEsgotados.length;
  const totalBaixos = itensBaixos.length;
  const totalSaudaveis = Math.max(ingredientes.length - totalEsgotados - totalBaixos, 0);
  const ingredientesComMovimentoHoje = ingredientes.filter(
    (item) => toNumber(item.usado_hoje) > 0 || toNumber(item.recebido_hoje) > 0
  ).length;

  const getStatusMeta = (status?: string) => {
    if (status === 'esgotado') {
      return {
        cardClass:
          'border-red-200 bg-red-50/80 [.admin-dark_&]:border-red-500/30 [.admin-dark_&]:bg-red-500/10',
        badgeClass:
          'border border-red-200 bg-red-50 text-red-700 [.admin-dark_&]:border-red-500/30 [.admin-dark_&]:bg-red-500/15 [.admin-dark_&]:text-red-200',
        progressClass: 'bg-red-500',
        label: 'Esgotado',
      };
    }
    if (status === 'baixo') {
      return {
        cardClass:
          'border-amber-200 bg-amber-50/80 [.admin-dark_&]:border-amber-500/30 [.admin-dark_&]:bg-amber-500/10',
        badgeClass:
          'border border-amber-200 bg-amber-50 text-amber-700 [.admin-dark_&]:border-amber-500/30 [.admin-dark_&]:bg-amber-500/15 [.admin-dark_&]:text-amber-200',
        progressClass: 'bg-amber-500',
        label: 'Baixo',
      };
    }
    return {
      cardClass: 'stock-surface border-zinc-200 bg-white',
      badgeClass:
        'border border-emerald-200 bg-emerald-50 text-emerald-700 [.admin-dark_&]:border-emerald-500/30 [.admin-dark_&]:bg-emerald-500/15 [.admin-dark_&]:text-emerald-200',
      progressClass: 'bg-emerald-500',
      label: 'Normal',
    };
  };

  const getFichaItemNome = (item: FichaTecnicaItem) => {
    const nome = item?.nome ?? item?.ingrediente_nome ?? '';
    return typeof nome === 'string' && nome.trim() ? nome.trim() : 'Item sem nome';
  };

  const ingredienteEmoji = (nome?: string | null) => {
    const n = (nome ?? '').toLowerCase();
    if (!n) return String.fromCodePoint(0x1f4e6);
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
    return '📦';
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="stock-screen-shell flex h-full min-h-0 min-w-0 flex-col bg-zinc-50">

      {/* ── Header ── */}
      <div className="stock-header-shell min-w-0 shrink-0 border-b border-zinc-200 bg-white px-3 py-2 sm:px-3 sm:py-2.5 lg:px-4 lg:py-2.5 2xl:px-6 2xl:py-3.5">
        <ScreenHeader
          rowFrom="md"
          className="gap-2 md:gap-2 2xl:gap-4"
          title={tituloTela}
          subtitle={
            <p className="mt-0.5 text-xs text-zinc-400 2xl:text-sm">
              {ingredientes.length} {ingredientes.length === 1 ? 'item cadastrado' : 'itens cadastrados'}
              {totalEsgotados > 0 && <span className="ml-2 text-red-600 font-bold">· {totalEsgotados} esgotado(s)</span>}
              {totalBaixos    > 0 && <span className="ml-1 text-amber-600 font-bold">· {totalBaixos} baixo(s)</span>}
            </p>
          }
          actions={
            <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-0 md:flex-row md:items-stretch md:justify-end">
              <div className="flex max-w-full min-w-0 items-stretch gap-1.5 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch] scroll-pl-1 scroll-pr-1 pb-0.5">
                <div className="stock-tab-group flex min-w-0 shrink-0 flex-col gap-0.5 rounded-xl border border-zinc-200/80 bg-zinc-100 p-1">
                  <span className="hidden px-2 pt-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 sm:block">Estoque simples</span>
                  <div className="flex gap-0.5">
                    {([
                      { key: 'ingredientes' as const, label: 'Ingredientes (controle por gramas)', icon: <Package size={14}/> },
                      { key: 'movimentacoes' as const, label: 'Entradas e Saídas', icon: <History size={14}/> },
                      { key: 'relatorio' as const, label: 'Relatório', icon: <BarChart2 size={14}/> },
                    ]).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        title={t.label}
                        onClick={() => setTab(t.key)}
                        className={`stock-tab-button flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-bold transition-all min-h-[40px] sm:max-w-[14rem] sm:px-3 lg:min-h-0 lg:max-w-none lg:py-2 ${tab === t.key ? 'is-active bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                      >
                        <span className="shrink-0">{t.icon}</span>
                        <span className="min-w-0 truncate leading-tight sm:whitespace-normal">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="stock-tab-divider hidden w-px shrink-0 self-stretch bg-zinc-200 sm:block" aria-hidden />
                <div className="stock-tab-group flex min-w-0 shrink-0 flex-col gap-0.5 rounded-xl border border-violet-200/80 bg-violet-50/60 p-1">
                  <span className="hidden px-2 pt-0.5 text-[9px] font-black uppercase tracking-wider text-violet-700 sm:block">Produção / receitas</span>
                  <div className="flex gap-0.5">
                    {([
                      { key: 'ficha' as const, label: 'Receita / Produção', icon: <BookOpen size={14}/> },
                      { key: 'padronizacao' as const, label: 'Padronização', icon: <Link2 size={14}/> },
                    ]).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`stock-tab-button stock-tab-production flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-xs font-bold transition-all min-h-[40px] sm:px-3 lg:min-h-0 lg:py-2 ${tab === t.key ? 'is-active bg-white text-violet-950 shadow-sm ring-1 ring-violet-200/80' : 'text-violet-800/90 hover:text-violet-950'}`}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditing({ nome: '', unidade: 'unidade', estoque_atual: 0, estoque_minimo: 0, custo_unitario: 0 })}
                className="stock-primary-action flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-zinc-800 active:scale-95 md:min-w-[9.5rem]">
                <Plus size={16}/>{labelNovo}
              </button>
            </div>
          }
        />
      </div>

      {/* ── Conteúdo ── */}
      <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${adminScreenPagePaddingClass}`}>

        {/* Bloco explicativo: modos simples e avançado */}
        <AnimatePresence initial={false} mode="wait">
          {!introCollapsed ? (
            <motion.section
              key="estoque-intro-expanded"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="stock-surface stock-tutorial-shell mb-3 rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-zinc-50 p-4 shadow-sm sm:mb-4 sm:p-5 2xl:p-6 dark:border-zinc-800 dark:bg-gradient-to-br dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:shadow-black/30"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm dark:bg-sky-500/15 dark:text-sky-300 dark:shadow-none">
                      <Info size={20} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-black text-zinc-900 sm:text-xl dark:text-white">Como funciona o estoque</p>
                      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                        Este tutorial mostra o jeito mais simples e o jeito mais completo de trabalhar com estoque no FlowPDV. A ideia e ler uma vez, entender o fluxo e depois ocultar sem medo.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="stock-tutorial-chip stock-tutorial-chip-simple rounded-full border border-transparent bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300">
                      Modo simples em verde
                    </span>
                    <span className="stock-tutorial-chip stock-tutorial-chip-advanced rounded-full border border-transparent bg-orange-100 px-3 py-1 text-[11px] font-bold text-orange-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      Modo avançado em laranja
                    </span>
                    <span className="stock-tutorial-chip stock-tutorial-chip-neutral rounded-full border border-transparent bg-zinc-100 px-3 py-1 text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      Baixa automática depende de vínculo correto
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIntroCollapsedPersist(true)}
                  className="stock-secondary-action inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-800 shadow-sm hover:bg-sky-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:shadow-none"
                  aria-expanded="true"
                >
                  <ChevronUp size={14} className="dark:text-zinc-300" aria-hidden />
                  Ocultar tutorial
                </button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="stock-tutorial-panel stock-tutorial-panel-simple rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/50 p-4 shadow-sm sm:p-5 dark:border-emerald-800 dark:bg-gradient-to-br dark:from-emerald-950/35 dark:via-zinc-950 dark:to-emerald-950/25 dark:shadow-[inset_0_1px_0_rgba(52,211,153,0.06)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Package size={20} aria-hidden />
                    </div>
                    <div>
                      <span className="inline-flex rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white dark:bg-emerald-600 dark:ring-1 dark:ring-emerald-500/40">
                        Modo simples
                      </span>
                      <p className="mt-2 text-lg font-black text-zinc-900 dark:text-white">Ideal para bebida, lata, garrafa e item vendido por unidade</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        Use quando o que voce vende e praticamente o mesmo item que sai do estoque. Exemplo classico: Coca-Cola lata, agua, cerveja long neck, sobremesa pronta ou produto embalado.
                      </p>
                    </div>
                  </div>

                  <div className="stock-tutorial-card mt-4 rounded-2xl border border-emerald-200 bg-white/90 p-4 dark:border-emerald-800 dark:bg-zinc-900">
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Passo a passo com Coca-Cola lata</p>
                    <div className="mt-3 space-y-3">
                      {SIMPLE_MODE_STEPS.map((step, index) => (
                        <div key={step} className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white dark:bg-emerald-600 dark:ring-2 dark:ring-emerald-500/30">
                            {index + 1}
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">O que cada acao faz no modo simples</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {SIMPLE_MODE_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                          <div
                            key={action.title}
                            className="stock-tutorial-card rounded-2xl border border-emerald-100 bg-white/85 p-3 shadow-sm dark:border-emerald-800 dark:bg-zinc-900 dark:shadow-none"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${action.iconClass}`}>
                                <Icon size={18} aria-hidden />
                              </div>
                              <div>
                                <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{action.title}</p>
                                <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{action.description}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="stock-tutorial-panel stock-tutorial-panel-advanced rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-100/60 p-4 shadow-sm sm:p-5 dark:border-amber-800 dark:bg-gradient-to-br dark:from-amber-950/30 dark:via-zinc-950 dark:to-amber-950/20 dark:shadow-[inset_0_1px_0_rgba(251,146,60,0.06)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-amber-500/15 dark:text-amber-300">
                      <BookOpen size={20} aria-hidden />
                    </div>
                    <div>
                      <span className="inline-flex rounded-full bg-orange-500 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white dark:bg-orange-600 dark:ring-1 dark:ring-amber-500/35">
                        Modo avancado
                      </span>
                      <p className="mt-2 text-lg font-black text-zinc-900 dark:text-white">Ideal para ficha tecnica, producao e controle por ingredientes</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        Use quando um produto vendido consome varios itens do estoque. E o caso de marmita, lanche, prato feito, pizza, porcao e qualquer preparacao feita na cozinha.
                      </p>
                    </div>
                  </div>

                  <div className="stock-tutorial-card mt-4 rounded-2xl border border-orange-200 bg-white/90 p-4 dark:border-amber-800 dark:bg-zinc-900">
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Passo a passo com marmita</p>
                    <div className="mt-3 space-y-3">
                      {ADVANCED_MODE_STEPS.map((step, index) => (
                        <div key={step} className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-black text-white dark:bg-orange-600 dark:ring-2 dark:ring-amber-500/30">
                            {index + 1}
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="stock-tutorial-card rounded-2xl border border-orange-100 bg-white/85 p-4 dark:border-amber-800 dark:bg-zinc-900">
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Quando usar</p>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                        Quando voce quer saber consumo real, custo por receita e baixa automatica de ingredientes em gramas, quilos, litros ou mililitros.
                      </p>
                    </div>
                    <div className="stock-tutorial-card rounded-2xl border border-orange-100 bg-white/85 p-4 dark:border-amber-800 dark:bg-zinc-900">
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Resultado na venda</p>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                        Se vender 2 marmitas, a baixa e multiplicada por 2 em cada ingrediente da ficha tecnica. O historico registra cada saida no estoque.
                      </p>
                    </div>
                    <div className="stock-tutorial-card rounded-2xl border border-orange-100 bg-white/85 p-4 sm:col-span-2 dark:border-amber-800 dark:bg-zinc-900">
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Resumo pratico</p>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                        No modo avancado, o produto vendido nao precisa ser o mesmo item do estoque. O importante e a ficha tecnica estar certa, porque e ela que diz exatamente o que sera baixado.
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="stock-tutorial-panel stock-tutorial-panel-neutral mt-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-1 dark:ring-zinc-700">
                    <Link2 size={18} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-900 dark:text-white">Como o sistema identifica o item de estoque na venda</p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                      A baixa automatica so acontece quando existe um vinculo valido entre o produto vendido e o estoque. Hoje a logica do FlowPDV segue esta ordem:
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-2">
                    {STOCK_IDENTIFICATION_STEPS.map((step, index) => (
                      <div
                        key={step}
                        className="stock-tutorial-card flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-black text-white dark:bg-zinc-700 dark:text-white dark:ring-1 dark:ring-zinc-600">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{step}</p>
                      </div>
                    ))}
                  </div>

                  <div className="stock-tutorial-card stock-tutorial-note rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-800 dark:bg-zinc-900">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-sky-700 dark:text-sky-400" aria-hidden />
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Importante para o cliente final</p>
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                      <p>Se nao existir ficha tecnica, variacao vinculada ou codigo de barras exato, o sistema nao tem como adivinhar qual item deve baixar.</p>
                      <p>Nas vendas do PDV e nas mesas, esse vinculo precisa estar certo para a baixa acontecer com seguranca.</p>
                      <p>No delivery online, se o pedido entrar sem vinculo valido, ele pode ser autorizado sem a baixa automatica do estoque.</p>
                      <p>Depois da venda, voce confere tudo em Historico, Entradas e Saidas e Relatorio.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          ) : (
            <motion.div
              key="estoque-intro-collapsed"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-3 flex justify-end sm:mb-4"
            >
              <button
                type="button"
                onClick={() => setIntroCollapsedPersist(false)}
                className="stock-secondary-action inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:shadow-none"
                aria-expanded="false"
              >
                <ChevronDown size={14} className="text-sky-600 dark:text-sky-400" aria-hidden />
                Mostrar tutorial do estoque
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ ABA: INGREDIENTES ═══ */}
        {tab === 'ingredientes' && (
          <div className="space-y-3 2xl:space-y-4">
            <div className="stock-surface rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-600 sm:px-4">
              <span className="font-bold text-zinc-800">Estoque simples · </span>
              Lista de itens com entrada, saída e ajuste. Unidade em <strong className="font-semibold text-zinc-800">gramas</strong> ou outra — você escolhe ao cadastrar.
              <p className="mt-2 text-[11px] text-zinc-500">
                {ingredientesComMovimentoHoje} item(ns) com movimento hoje · {totalSaudaveis} com estoque estável
              </p>
            </div>
            {/* Alertas rápidos */}
            {(totalEsgotados > 0 || totalBaixos > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {totalEsgotados > 0 && (
                  <div className="stock-kpi-card flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 sm:gap-3 2xl:rounded-2xl 2xl:p-4">
                    <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={20}/>
                    </div>
                    <div>
                      <p className="font-bold text-red-900 text-sm">Itens Esgotados</p>
                      <p className="text-xs text-red-700">{previewIngredientNames(itensEsgotados)}</p>
                    </div>
                  </div>
                )}
                {totalBaixos > 0 && (
                  <div className="stock-kpi-card flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:gap-3 2xl:rounded-2xl 2xl:p-4">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={20}/>
                    </div>
                    <div>
                      <p className="font-bold text-amber-900 text-sm">Estoque Baixo</p>
                      <p className="text-xs text-amber-700">{previewIngredientNames(itensBaixos)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Busca + Filtros + Ordenação */}
            <div className="stock-surface flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:p-4">
              {/* Busca */}
              <div className="relative flex-1 min-w-[220px] max-w-full sm:max-w-sm lg:max-w-md">
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
                  className="stock-secondary-action p-2 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all">
                  {ordemAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>
              </div>
              <span className="text-xs text-zinc-400">{totalIngredientes} item(s)</span>
            </div>

            {/* Grid de cards */}
            {loading ? (
              <div className="flex justify-center py-10 sm:py-12" role="status" aria-label="Carregando ingredientes">
                <Spinner className="h-8 w-8" />
              </div>
            ) : ingredientesVisiveis.length === 0 ? (
              <EmptyState
                icon={Package}
                title={debouncedBusca ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}
                description={debouncedBusca ? 'Ajuste a busca ou os filtros.' : 'Cadastre itens para controlar quantidade, compras e (se quiser) receitas por produto.'}
              />
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 min-[1200px]:grid-cols-3 gap-3">
                {ingredientesVisiveis.map(ing => (
                  <div key={ing.id} className={`stock-surface rounded-2xl border p-3 transition-all hover:-translate-y-[1px] ${getStatusMeta(ing.status).cardClass}`}>
                    {/* Linha 1: Header + ícones */}
                    <div className="mb-2 flex justify-between items-start gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-lg shrink-0">{ingredienteEmoji(ing.nome)}</span>
                        <div className="min-w-0">
                          <h3 className="font-black text-zinc-900 text-sm leading-tight truncate">{ing.nome}</h3>
                          <p className="text-[9px] font-bold text-zinc-400 uppercase">{ing.unidade}{ing.fornecedor ? ` · ${ing.fornecedor}` : ''}</p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${getStatusMeta(ing.status).badgeClass}`}>
                            {getStatusMeta(ing.status).label}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button onClick={() => setEditing(ing)} className="stock-secondary-action rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Editar"><FileText size={11}/></button>
                        <button onClick={() => fetchHistoricoItem(ing)} className="stock-secondary-action rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Histórico"><History size={11}/></button>
                        <button onClick={() => handleDeleteClick(ing.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500" title="Excluir"><Trash2 size={11}/></button>
                      </div>
                    </div>

                    {/* Linha 2: Atual/Mín inline + Barra + % */}
                    <div className="stock-muted-surface mb-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2">
                      <span className="text-[10px] text-zinc-500 shrink-0"><span className="font-black text-zinc-900">{ing.estoque_atual}</span>/<span className="font-black text-zinc-900">{ing.estoque_minimo}</span> {ing.unidade}</span>
                      <div className="flex-1 min-w-[50px] flex items-center gap-1">
                        <div className="flex-1 h-1 bg-zinc-100 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (ing.estoque_atual / (ing.estoque_minimo * 3 || 1)) * 100)}%` }}
                            className={`h-full rounded-full ${getStatusMeta(ing.status).progressClass}`}
                          />
                        </div>
                        <span className="text-[9px] font-bold text-zinc-400 w-6">{Math.round(Math.min(100, (ing.estoque_atual / (ing.estoque_minimo * 3 || 1)) * 100))}%</span>
                      </div>
                    </div>

                    {/* Linha 3: Uso hoje + Custo + Botões */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-[9px] shrink-0">
                        <span className="text-red-500 font-bold"><ArrowDownCircle size={8}/> {ing.usado_hoje || 0}</span>
                        <span className="text-emerald-600 font-bold"><ArrowUpCircle size={8}/> +{ing.recebido_hoje || 0}</span>
                      </div>
                      {(ing.custo_unitario || 0) > 0 && (
                        <span className="stock-muted-surface shrink-0 rounded-lg border border-zinc-100 bg-zinc-50 px-1.5 py-0.5 text-[9px] text-zinc-500">{fmt(ing.custo_unitario || 0)}/{ing.unidade}</span>
                      )}
                      <div className="flex-1 grid grid-cols-2 gap-1 min-w-0">
                        <button onClick={() => { setShowMovModal({ id: ing.id, tipo: 'entrada' }); setMovForm({ quantidade: '', motivo: 'Compra', novoValor: '' }); }}
                          className="flex items-center justify-center gap-0.5 py-1 bg-emerald-600 text-white rounded font-bold text-[10px] hover:bg-emerald-700 transition-all active:scale-95">
                          <Plus size={9}/> Entrada
                        </button>
                        <button onClick={() => { setShowMovModal({ id: ing.id, tipo: 'saida' }); setMovForm({ quantidade: '', motivo: 'Uso do dia', novoValor: '' }); }}
                          className="flex items-center justify-center gap-0.5 py-1 bg-zinc-800 text-white rounded font-bold text-[10px] hover:bg-zinc-900 transition-all active:scale-95">
                          <Minus size={9}/> Saída
                        </button>
                        <button onClick={() => { setShowMovModal({ id: ing.id, tipo: 'ajustar' }); setMovForm({ quantidade: '', motivo: 'Ajuste/Inventário', novoValor: String(ing.estoque_atual ?? 0) }); }}
                          className="flex items-center justify-center gap-0.5 py-1 bg-amber-600 text-white rounded font-bold text-[10px] hover:bg-amber-700 transition-all active:scale-95">
                          <SlidersHorizontal size={9}/> Ajustar
                        </button>
                        <button onClick={() => { setShowMovModal({ id: ing.id, tipo: 'zerar' }); setMovForm({ quantidade: '', motivo: 'Zeramento manual', novoValor: '' }); }}
                          className="flex items-center justify-center gap-0.5 py-1 bg-red-600 text-white rounded font-bold text-[10px] hover:bg-red-700 transition-all active:scale-95">
                          <RotateCcw size={9}/> Zerar
                        </button>
                      </div>
                      <div className="mt-2 flex w-full flex-wrap items-center gap-1 border-t border-zinc-100/80 pt-2">
                        <span className="flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-500">
                          <Zap size={10} className="text-amber-500" aria-hidden />
                          Saída rápida
                        </span>
                        {quickSaidaPresets(ing.unidade).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleQuickSaida(ing, q)}
                            title={`Registrar saída de ${fmtN(q, ing.unidade)} com motivo automático`}
                            className="stock-secondary-action rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-zinc-700 shadow-sm hover:bg-zinc-50 active:scale-95"
                          >
                            {fmtQuickQtyBtn(q)} <span className="font-bold text-zinc-500">{ing.unidade}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {hasMoreIngredientes && (
                <div className="flex justify-center pt-6">
                  <button onClick={loadMoreIngredientes}
                    className="px-6 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition-all active:scale-95">
                    Carregar mais (+30)
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ═══ ABA: MOVIMENTAÇÕES ═══ */}
        {tab === 'movimentacoes' && (
          <div className="space-y-2 2xl:space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 sm:px-4">
              <span className="font-bold text-zinc-800">Entradas e saídas · </span>
              Histórico do que entrou e saiu do estoque no período (compras, consumo, ajustes). Para lançar algo novo, use a aba <strong className="font-semibold text-zinc-800">Ingredientes</strong>.
            </div>
            {/* Filtro de período */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 min-w-0">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider shrink-0">Período</span>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                className="rounded-xl border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none sm:px-3 sm:py-2"/>
              <span className="text-sm text-zinc-400 shrink-0">até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                className="rounded-xl border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none sm:px-3 sm:py-2"/>
              <div className="flex w-full min-w-0 flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
                {[['Hoje', 0], ['7 dias', 7], ['30 dias', 30]] .map(([label, dias]) => (
                  <button key={label as string} onClick={() => { setPeriodoInicio(daysAgo(dias as number)); setPeriodoFim(today()); }}
                    className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-bold text-zinc-600 transition-all hover:bg-zinc-200 sm:px-3">
                    {label as string}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              {loading ? (
                <div className="flex justify-center py-10 sm:py-12"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin"/></div>
              ) : movimentacoes.length === 0 ? (
                <div className="text-center py-10 sm:py-12 text-zinc-400"><History size={40} className="mx-auto mb-3 opacity-20"/><p>Nenhuma entrada ou saída neste período</p></div>
              ) : (
                <>
                <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      {['Data/Hora', 'Item', 'Tipo', 'Quantidade', 'Motivo'].map(h => (
                        <th key={h} className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 sm:px-4 2xl:px-5 2xl:py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {movimentacoesVisiveis.map((m, i) => (
                      <tr key={i} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-3 py-2.5 text-xs text-zinc-500 whitespace-nowrap sm:px-5 sm:py-3">
                          {new Date(m.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-bold text-zinc-900">{m.ingrediente_nome}</td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${m.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {m.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td className={`px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-black ${m.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {m.tipo === 'entrada' ? '+' : '-'}{m.quantidade} {m.unidade}
                        </td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-xs text-zinc-500">{m.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {hasMoreMovimentacoes && (
                  <div className="flex justify-center border-t border-zinc-100 py-4">
                    <button onClick={loadMoreMovimentacoes}
                      className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition-all">
                      Carregar mais (+30) — {movimentacoesVisiveis.length} de {totalMovimentacoes}
                    </button>
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ ABA: RELATÓRIO ═══ */}
        {tab === 'relatorio' && (
          <div className="space-y-2 2xl:space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 sm:px-4">
              <span className="font-bold text-zinc-800">Relatório · </span>
              Resumo de consumo e custos no período, a partir das <strong className="font-semibold text-zinc-800">entradas e saídas</strong> lançadas.
            </div>
            {/* Período */}
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
              <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">Período</span>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                className="rounded-xl border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none sm:px-3 sm:py-2"/>
              <span className="shrink-0 text-sm text-zinc-400">até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                className="rounded-xl border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none sm:px-3 sm:py-2"/>
              <div className="flex w-full min-w-0 flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
                {[['7 dias', 7], ['30 dias', 30], ['90 dias', 90]].map(([label, dias]) => (
                  <button key={label as string} onClick={() => { setPeriodoInicio(daysAgo(dias as number)); setPeriodoFim(today()); }}
                    className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-bold text-zinc-600 transition-all hover:bg-zinc-200 sm:px-3">
                    {label as string}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-10 sm:py-12"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin"/></div>
            ) : relatorio ? (
              <>
                {/* Cards de resumo */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Custo Total do Período</p>
                    <p className="text-2xl font-black text-red-600">{fmt(relatorio.custo_total_periodo)}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Itens com movimento</p>
                    <p className="text-2xl font-black text-zinc-900">{relatorioConsumo.filter(c => c.total_saida > 0 || c.total_entrada > 0).length}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Maior Consumo</p>
                    <p className="text-sm font-black text-zinc-900 truncate">
                      {relatorio.consumo[0]?.nome || '—'}
                    </p>
                    {relatorioConsumo[0] && (
                      <p className="text-xs text-zinc-400">{fmtN(relatorioConsumo[0].total_saida, relatorioConsumo[0].unidade)} consumido</p>
                    )}
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2.5 sm:px-5 sm:py-3">
                    <p className="text-xs font-black text-zinc-600 uppercase tracking-wider">Consumo por Item</p>
                  </div>
                  <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[720px] text-left">
                    <thead className="border-b border-zinc-100">
                      <tr>
                        {['Item', 'Saída', 'Entrada', 'Custo Unit.', 'Custo Total', 'Fornecedor'].map(h => (
                          <th key={h} className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:px-4 2xl:px-5 2xl:py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {relatorioConsumoVisiveis.map(r => (
                        <tr key={r.id} className={`hover:bg-zinc-50 transition-colors ${r.total_saida === 0 && r.total_entrada === 0 ? 'opacity-40' : ''}`}>
                          <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-bold text-zinc-900">
                            {ingredienteEmoji(r.nome)} {r.nome}
                          </td>
                          <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-bold text-red-600">
                            {r.total_saida > 0 ? `-${fmtN(r.total_saida, r.unidade)}` : '—'}
                          </td>
                          <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-bold text-emerald-700">
                            {r.total_entrada > 0 ? `+${fmtN(r.total_entrada, r.unidade)}` : '—'}
                          </td>
                          <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-xs text-zinc-500">
                            {r.custo_unitario > 0 ? fmt(r.custo_unitario) : '—'}
                          </td>
                          <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-black text-zinc-900">
                            {r.custo_total > 0 ? fmt(r.custo_total) : '—'}
                          </td>
                          <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-xs text-zinc-500">{r.fornecedor || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {hasMoreRelatorioConsumo && (
                    <div className="flex justify-center border-t border-zinc-100 py-4">
                      <button onClick={loadMoreRelatorioConsumo}
                        className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition-all">
                        Carregar mais (+30) — {relatorioConsumoVisiveis.length} de {totalRelatorioConsumo}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ═══ ABA: PADRONIZACAO ═══ */}
        {tab === 'padronizacao' && (
          <div className="space-y-2 2xl:space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs text-violet-950 sm:px-4">
              <span className="font-bold">Produção / receitas · </span>
              Ferramenta para alinhar produtos do cardápio a <strong className="font-semibold">receitas</strong> e códigos de barras. Uso típico com suporte ou migração — não é necessário para o controle simples por quantidade.
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-zinc-500 uppercase tracking-wider">Auditoria de padronização de estoque</p>
                <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
                  Lista produtos sem vínculo explícito por receita (produção) ou código de barras e separa correções seguras das que exigem revisão manual.
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                <button
                  onClick={fetchPadronizacao}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-zinc-800"
                >
                  <RefreshCw size={14}/>
                  Atualizar auditoria
                </button>
                <button
                  onClick={() => handleApplyPadronizacaoFixes()}
                  disabled={safePadronizacaoItems.length === 0 || padronizacaoFixingKey !== null}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Link2 size={14}/>
                  {padronizacaoFixingKey === 'bulk' ? 'Aplicando fase 1...' : `Corrigir ${safePadronizacaoItems.length} caso(s) seguro(s)`}
                </button>
                <button
                  onClick={() => handleApplyPadronizacaoManualPhase()}
                  disabled={manualPadronizacaoItems.length === 0 || padronizacaoFixingKey !== null}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <BookOpen size={14}/>
                  {padronizacaoFixingKey === 'manual:bulk'
                    ? 'Aplicando fase manual...'
                    : `Aplicar fase manual segura (${manualPadronizacaoItems.length})`}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-10 sm:py-12"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin"/></div>
            ) : padronizacao ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 min-[1200px]:grid-cols-4 min-[1600px]:grid-cols-7">
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Pendencias totais</p>
                    <p className="text-2xl font-black text-zinc-900">{padronizacaoSummary.totalPendingProducts}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Sem match</p>
                    <p className="text-2xl font-black text-amber-600">{padronizacaoSummary.unmatchedPendingProducts}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Casos ambiguos</p>
                    <p className="text-2xl font-black text-red-600">{padronizacaoSummary.ambiguousPendingProducts}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Casos com 1 match</p>
                    <p className="text-2xl font-black text-emerald-600">{padronizacaoSummary.singleMatchPendingProducts}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Seguros via receita</p>
                    <p className="text-2xl font-black text-sky-600">{padronizacaoSummary.safeRecipeCandidates}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Seguros via barcode</p>
                    <p className="text-2xl font-black text-violet-600">{padronizacaoSummary.safeBarcodeCandidates}</p>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Fase manual segura</p>
                    <p className="text-2xl font-black text-amber-600">{padronizacaoSummary.manualPhaseOneCandidates}</p>
                  </div>
                </div>

                <div className="bg-zinc-900 text-white rounded-2xl p-5">
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-300">Como corrigir com seguranca</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-sm font-black">Produto preparado</p>
                      <p className="text-xs text-zinc-300 mt-1">Na fase 1, materializamos o vínculo atual em receita 1:1 para sair do fallback sem mudar a baixa de estoque.</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-sm font-black">Item 1:1</p>
                      <p className="text-xs text-zinc-300 mt-1">Quando houver match unico e barcode confiavel no ingrediente, usamos alinhamento de barcode como primeira correcao.</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-sm font-black">Casos manuais</p>
                      <p className="text-xs text-zinc-300 mt-1">Nos sem match seguros, criamos item de estoque dedicado e receita 1:1. Ambiguidades continuam pendentes até a revisão final.</p>
                    </div>
                  </div>
                </div>

                {padronizacaoItems.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
                    <p className="text-lg font-black text-emerald-800">Nenhum produto pendente de padronizacao foi encontrado.</p>
                    <p className="text-sm text-emerald-700 mt-2">Com receita ou código de barras cobrindo tudo, a futura remoção do fallback fica bem mais segura.</p>
                  </div>
                ) : (
                  <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 border-b border-zinc-100 bg-zinc-50 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black text-zinc-600 uppercase tracking-wider">Produtos pendentes de migracao</p>
                      <p className="text-[11px] text-zinc-500">
                        Atualizado em {new Date(padronizacao.generatedAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[1240px]">
                        <thead className="border-b border-zinc-100">
                          <tr>
                            {['Produto', 'Item de estoque atual', 'Classificacao', 'Uso', 'Correcao sugerida'].map(h => (
                              <th key={h} className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:px-4 2xl:px-5 2xl:py-3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {padronizacaoItemsVisiveis.map(item => (
                            <tr key={item.productId} className="align-top hover:bg-zinc-50 transition-colors">
                              <td className="px-3 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                                <p className="text-sm font-black text-zinc-900">{item.productName}</p>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                  {item.productPublicId || 'sem public_id'} • {item.productActive ? 'ativo' : 'inativo'}
                                </p>
                                <p className="text-[11px] text-zinc-400 mt-1">
                                  {item.productCategory || 'Sem categoria'} • {item.productBarcode ? `barcode ${item.productBarcode}` : 'sem codigo de barras'}
                                </p>
                              </td>
                              <td className="px-3 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                                {item.candidateIngredients.length === 0 ? (
                                  <>
                                    <p className="text-sm font-black text-zinc-900">Nenhum match exato</p>
                                    <p className="text-[11px] text-zinc-400 mt-1">O fallback por nome nao cobre este produto hoje.</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm font-black text-zinc-900">{item.ingredientName}</p>
                                    <p className="text-[11px] text-zinc-500 mt-1">
                                      {item.ingredientPublicId || 'sem public_id'} • {item.ingredientUnit || 'unidade'}
                                    </p>
                                    <p className="text-[11px] text-zinc-400 mt-1">
                                      Estoque atual: {fmtN(item.ingredientStock, item.ingredientUnit || 'unidade')}
                                    </p>
                                    {item.candidateIngredients.length > 1 && (
                                      <p className="text-[11px] text-red-500 mt-2">
                                        Outros matches: {item.candidateIngredients.slice(1).map(candidate => candidate.ingredientName).join(', ')}
                                      </p>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="px-3 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                  item.classification === 'safe_barcode_alignment'
                                    ? 'bg-violet-100 text-violet-700'
                                    : item.classification === 'safe_recipe_explicit'
                                      ? 'bg-sky-100 text-sky-700'
                                      : item.classification === 'ambiguous_exact_name'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-zinc-100 text-zinc-700'
                                }`}>
                                  {item.classification === 'safe_barcode_alignment'
                                    ? '1:1 via barcode'
                                    : item.classification === 'safe_recipe_explicit'
                                      ? item.isPreparedProduct ? 'preparado via receita' : 'match unico seguro'
                                      : item.classification === 'ambiguous_exact_name'
                                        ? `${item.exactNameMatchCount} matches por nome`
                                        : 'sem match'}
                                </span>
                                <p className="text-[11px] text-zinc-500 mt-2">
                                  Resolucao atual: <span className="font-bold">{item.resolutionMode}</span>
                                </p>
                                {item.safeFixReason && (
                                  <p className="text-[11px] text-zinc-400 mt-2">{item.safeFixReason}</p>
                                )}
                                {item.manualFixReason && (
                                  <p className="text-[11px] text-amber-700 mt-2">{item.manualFixReason}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                                <p className="text-sm font-black text-zinc-900">{item.totalOrderUsages} pedido(s)</p>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                  {item.lastOrderAt ? `Ultimo uso: ${new Date(item.lastOrderAt).toLocaleString('pt-BR')}` : 'Sem uso registrado'}
                                </p>
                              </td>
                              <td className="px-3 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                                <p className="text-xs text-zinc-600 leading-5">{item.suggestedFix}</p>
                                {item.safeFixAction && item.productActive && (
                                  <button
                                    onClick={() => handleApplyPadronizacaoFixes([item.productId])}
                                    disabled={padronizacaoFixingKey !== null}
                                    className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-zinc-900 text-white rounded-xl text-[11px] font-bold hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Link2 size={12}/>
                                    {padronizacaoFixingKey === `item:${item.productId}`
                                      ? 'Aplicando...'
                                      : item.safeFixLabel || 'Aplicar correcao segura'}
                                  </button>
                                )}
                                {item.manualFixAction && item.productActive && (
                                  <button
                                    onClick={() => handleApplyPadronizacaoManualPhase([item.productId])}
                                    disabled={padronizacaoFixingKey !== null}
                                    className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-xl text-[11px] font-bold hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <BookOpen size={12}/>
                                    {padronizacaoFixingKey === `manual:item:${item.productId}`
                                      ? 'Aplicando fase manual...'
                                      : item.manualFixLabel || 'Aplicar fase manual segura'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {hasMorePadronizacao && (
                      <div className="flex justify-center py-4 border-t border-zinc-100">
                        <button onClick={loadMorePadronizacao}
                          className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition-all">
                          Carregar mais (+30) — {padronizacaoItemsVisiveis.length} de {totalPadronizacao}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ═══ ABA: FICHA TÉCNICA ═══ */}
        {tab === 'ficha' && (
          <div className="space-y-2 2xl:space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs text-violet-950 sm:px-4">
              <span className="font-bold">Receita / produção · </span>
              Defina quanto de cada item de estoque entra em <strong className="font-semibold">uma unidade vendida</strong> deste produto (ex.: 0,15 kg de carne por espetinho). O custo da receita é estimado a partir dos custos cadastrados nos itens.
            </div>
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
                      <p className="text-[10px] font-black text-zinc-400 uppercase">Custo da Receita</p>
                      <p className="text-base font-black text-zinc-900">{fmt(custoProduto)}</p>
                    </div>
                  )}
                  <button onClick={() => setShowAddFicha(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all">
                    <Plus size={14}/> Adicionar à receita
                  </button>
                </div>
              )}
            </div>

            {fichaProduto === '' ? (
              <div className="text-center py-10 sm:py-12 text-zinc-400">
                <BookOpen size={48} className="mx-auto mb-3 opacity-20"/>
                <p className="font-semibold">Selecione um produto para ver ou editar a receita / produção</p>
                <p className="text-sm mt-1">A receita liga itens de estoque ao produto do cardápio e ajuda a calcular custo por venda.</p>
              </div>
            ) : fichaItens.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 bg-white border border-dashed border-zinc-300 rounded-2xl">
                <BookOpen size={36} className="mx-auto mb-3 opacity-20"/>
                <p className="font-semibold">Nenhum item nesta receita</p>
                <p className="text-sm mt-1">Use &quot;Adicionar à receita&quot; para informar os insumos deste produto.</p>
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                  <p className="text-xs font-black text-zinc-600 uppercase tracking-wider">Itens da receita</p>
                  {custoProduto > 0 && (
                    <span className="text-xs font-bold text-zinc-500">Custo total: <strong className="text-zinc-900">{fmt(custoProduto)}</strong></span>
                  )}
                </div>
                <table className="w-full text-left">
                  <thead className="border-b border-zinc-100">
                    <tr>
                      {['Item', 'Qtd. usada', 'Estoque atual', 'Custo unit.', 'Custo parcial', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:px-4 2xl:px-5 2xl:py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {fichaItens.map((fi, index) => {
                      if (!fi) return null;
                      const nomeFicha = getFichaItemNome(fi);
                      const quantidadeUsada = toNumber(fi.quantidade_usada);
                      const estoqueAtual = toNumber(fi.estoque_atual);
                      return (
                      <tr key={fi.id ?? `${fi.ingrediente_id}-${index}`} className="hover:bg-zinc-50">
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-bold text-zinc-900">{ingredienteEmoji(nomeFicha)} {nomeFicha}</td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm text-zinc-700">{fmtN(quantidadeUsada, fi.unidade)}</td>
                        <td className={`px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-bold ${estoqueAtual <= 0 ? 'text-red-600' : 'text-zinc-700'}`}>
                          {fmtN(estoqueAtual, fi.unidade)}
                        </td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-xs text-zinc-500">{fi.custo_unitario ? fmt(fi.custo_unitario) : '—'}</td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3 text-sm font-black text-zinc-900">
                          {fi.custo_unitario ? fmt(fi.custo_unitario * fi.quantidade_usada) : '—'}
                        </td>
                        <td className="px-4 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
                          <button onClick={() => handleRemoveFicha(fi.ingrediente_id)}
                            className="p-1.5 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all">
                            <X size={14}/>
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════ MODAIS ════════════════════ */}

      {/* Modal: Novo/Editar item de estoque */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-[150] flex items-end justify-center overflow-y-auto overscroll-contain bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="my-auto flex max-h-[min(92dvh,100svh)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[min(90vh,720px)] sm:rounded-3xl pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-2.5 sm:px-5 sm:py-3 2xl:px-6 2xl:py-4">
                <h3 className="pr-2 text-lg font-black text-zinc-900 sm:text-xl">{editing.id ? `Editar ${labelItem}` : labelNovo}</h3>
                <button type="button" onClick={() => setEditing(null)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X size={18}/></button>
              </div>
              <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4 2xl:space-y-4 2xl:px-6 2xl:py-5">
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

                {/* Estoque atual (ou inicial na criação) */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                    {editing.id ? 'Estoque atual' : 'Estoque inicial'}
                  </label>
                  <input type="number" step="0.01" min="0" value={editing.estoque_atual ?? 0}
                    onChange={e => setEditing(p => ({...p, estoque_atual: parseFloat(e.target.value) || 0}))}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                  {editing.id && (
                    <p className="text-[10px] text-zinc-400 mt-1">Ajuste direto. Para auditoria, use entradas e saídas na lista de itens.</p>
                  )}
                </div>

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

              </div>
                <div className="flex shrink-0 gap-2 border-t border-zinc-100 bg-white px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3 2xl:px-6 2xl:py-4">
                  <button type="button" onClick={() => setEditing(null)}
                    className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-bold transition-all hover:bg-zinc-200">Cancelar</button>
                  <button type="submit"
                    className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-bold text-white transition-all hover:bg-zinc-800">Salvar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Movimentação (Entrada, Saída, Ajustar, Zerar) */}
      <AnimatePresence>
        {showMovModal && (() => {
          const ing = ingredientes.find(i => i.id === showMovModal.id);
          const titulos: Record<string, string> = {
            entrada: '📥 Registrar Entrada',
            saida: '📤 Registrar Saída',
            ajustar: '⚙️ Ajustar Estoque',
            zerar: '🔄 Zerar Estoque',
          };
          const btnCls: Record<string, string> = {
            entrada: 'bg-emerald-600 hover:bg-emerald-700',
            saida: 'bg-zinc-900 hover:bg-zinc-800',
            ajustar: 'bg-amber-600 hover:bg-amber-700',
            zerar: 'bg-red-600 hover:bg-red-700',
          };
          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
                className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-xl font-black text-zinc-900">{titulos[showMovModal.tipo]}</h3>
                    <p className="text-sm text-zinc-400 mt-0.5">{ing?.nome} {ing && <span className="text-zinc-500">({ing.unidade})</span>}</p>
                    {showMovModal.tipo === 'zerar' && ing && (
                      <p className="text-xs text-amber-600 font-bold mt-1">Atual: {fmtN(ing.estoque_atual, ing.unidade)} → 0</p>
                    )}
                  </div>
                  <button onClick={() => setShowMovModal(null)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
                </div>
                <form onSubmit={handleMovimentacao} className="space-y-4">
                  {showMovModal.tipo === 'ajustar' && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Novo valor (em {ing?.unidade || 'unidade'})</label>
                      <input type="number" step="0.01" min="0" value={movForm.novoValor} autoFocus
                        onChange={e => setMovForm(f => ({...f, novoValor: e.target.value}))}
                        placeholder="0"
                        className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400" required/>
                    </div>
                  )}
                  {(showMovModal.tipo === 'entrada' || showMovModal.tipo === 'saida') && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Quantidade ({ing?.unidade || 'unidade'})</label>
                      <input type="number" step="0.01" min="0.01" value={movForm.quantidade} autoFocus
                        onChange={e => setMovForm(f => ({...f, quantidade: e.target.value}))}
                        className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400" required/>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                      Motivo {(showMovModal.tipo === 'entrada' || showMovModal.tipo === 'saida') ? '(opcional)' : '*'}
                    </label>
                    <input type="text" value={movForm.motivo}
                      onChange={e => setMovForm(f => ({...f, motivo: e.target.value}))}
                      placeholder={
                        showMovModal.tipo === 'entrada' ? 'Vazio = Compra'
                        : showMovModal.tipo === 'saida' ? 'Vazio = Uso do dia'
                        : 'ex: Ajuste inventário, Perda...'
                      }
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400"
                      required={showMovModal.tipo !== 'entrada' && showMovModal.tipo !== 'saida'}
                    />
                    {(showMovModal.tipo === 'entrada' || showMovModal.tipo === 'saida') && (
                      <p className="mt-1 text-[10px] text-zinc-400">Se deixar em branco, usamos um motivo padrão para ir mais rápido.</p>
                    )}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setShowMovModal(null)}
                      className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Cancelar</button>
                    <button type="submit" className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold transition-all ${btnCls[showMovModal.tipo]}`}>
                      Confirmar
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Modal: Histórico */}
      <AnimatePresence>
        {showHistorico && (
            <div className="fixed inset-0 z-[150] flex items-end justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="my-auto flex max-h-[min(92dvh,100svh)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white p-4 shadow-2xl sm:max-h-[min(88vh,720px)] sm:rounded-3xl sm:p-5 2xl:p-6">
              <div className="mb-4 flex shrink-0 items-center justify-between sm:mb-5">
                <div className="min-w-0 pr-2">
                  <h3 className="text-lg font-black text-zinc-900 sm:text-xl">Histórico — {showHistorico.nome}</h3>
                  <p className="text-sm text-zinc-400">{historico.length === 0 ? 'Nenhuma entrada ou saída' : `${totalHistorico} lançamento(s)`}</p>
                </div>
                <button type="button" onClick={() => setShowHistorico(null)} className="shrink-0 rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X size={18}/></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                      <tr><td colSpan={4} className="py-8 text-center text-zinc-400 italic sm:py-10">Nenhum lançamento registrado</td></tr>
                    ) : historicoVisiveis.map((h, i) => (
                      <tr key={i} className="hover:bg-zinc-50">
                        <td className="py-3 pr-4 text-xs text-zinc-500">{new Date(h.created_at).toLocaleString('pt-BR')}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${h.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{h.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span>
                        </td>
                        <td className={`py-3 pr-4 text-xs font-black ${h.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {h.tipo === 'entrada' ? '+' : '-'}{h.quantidade} {showHistorico.unidade}
                        </td>
                        <td className="py-3 text-xs text-zinc-500">{h.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hasMoreHistorico && (
                  <div className="flex justify-center py-4 border-t border-zinc-100">
                    <button onClick={loadMoreHistorico}
                      className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition-all">
                      Carregar mais (+30) — {historicoVisiveis.length} de {totalHistorico}
                    </button>
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-zinc-100 pt-4">
                <button type="button" onClick={() => setShowHistorico(null)} className="w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-bold transition-all hover:bg-zinc-200">Fechar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Adicionar à receita */}
      <AnimatePresence>
        {showAddFicha && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-black text-zinc-900">Adicionar à receita</h3>
                <button onClick={() => setShowAddFicha(false)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
              </div>
              <form onSubmit={handleAddFicha} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Item de estoque</label>
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
                    {deleteStep === 'confirm1' ? 'Todo o histórico de entradas e saídas deste item será apagado.' : 'Esta ação é irreversível. Confirma a exclusão?'}
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
