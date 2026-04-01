import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { usePaginatedList } from '../hooks/usePaginatedList';
import {
  Package, Plus, Trash2, Lock, AlertCircle, Image as ImageIcon,
  X, Barcode, Search, LayoutGrid, LayoutList, Copy,
  ChevronUp, ChevronDown, Star, Clock, Eye, EyeOff,
  Download, Filter, Pencil, Settings2, ChevronRight, Minus, Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, Category } from '../types';
import { Card, Button, Input } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { adminOpsListRowClass, adminOpsMutedBlockClass, adminScreenPagePaddingClass } from '../components/ui/screenChrome';
import type { ProductionType } from '../utils/preparation';
import { resolveProductionType, resolveRequiresPreparation } from '../utils/preparation';
import { buildCardapioPdfHtml, type CardapioPdfMode, type CardapioPdfProduct } from '../utils/cardapioPdfHtml';

// ─── helpers ─────────────────────────────────────────────────────
const fmtR$ = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const fmtQtdEstoque = (q: number, unidade: string) =>
  `${Number(q || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}${unidade ? ` ${unidade}` : ''}`;

/** Compara categorias do cardápio ignorando maiúsculas, espaços e NFC (evita falha do filtro vs. nome cadastrado). */
function normalizeCardapioCategoryKey(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR');
}

function isProductRowActive(p: Pick<ProductExtended, 'active'>): boolean {
  const a = p.active as unknown;
  return a === true || a === 1 || a === '1';
}

/** Cardápio (admin): ativos primeiro; dentro de cada bloco mantém ordem manual (ordem, id). */
function sortProductsForCardapioAdmin(list: ProductExtended[]): ProductExtended[] {
  return [...list].sort((a, b) => {
    const aa = isProductRowActive(a) ? 0 : 1;
    const ba = isProductRowActive(b) ? 0 : 1;
    if (aa !== ba) return aa - ba;
    const oa = a.ordem ?? 0;
    const ob = b.ordem ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

/** Apenas ativos ou apenas inativos, ordenados por ordem manual (para setas / Pos.). */
function getGroupSortedByOrdem(list: ProductExtended[], activeGroup: boolean): ProductExtended[] {
  return list
    .filter((p) => isProductRowActive(p) === activeGroup)
    .sort((a, b) => {
      const oa = a.ordem ?? 0;
      const ob = b.ordem ?? 0;
      if (oa !== ob) return oa - ob;
      return (a.id ?? 0) - (b.id ?? 0);
    });
}

const COLOR_MAP: Record<string, { bg: string }> = {
  zinc:   { bg: 'bg-zinc-100' },
  red:    { bg: 'bg-red-100' },
  orange: { bg: 'bg-orange-100' },
  amber:  { bg: 'bg-amber-100' },
  green:  { bg: 'bg-green-100' },
  teal:   { bg: 'bg-teal-100' },
  blue:   { bg: 'bg-blue-100' },
  purple: { bg: 'bg-purple-100' },
  pink:   { bg: 'bg-pink-100' },
};

interface ProductExtended extends Product {
  codigo_barras?: string;
  marca?: string;
  descricao?: string;
  custo?: number;
  destaque?: number;
  ordem?: number;
  disponivel_de?: string;
  disponivel_ate?: string;
}

function getPromotionValidationMessage(product?: Partial<ProductExtended> | null) {
  if (!product?.em_promocao) return '';

  const currentPrice = Number(product.price ?? 0);
  const originalPrice = product.preco_original == null
    ? NaN
    : Number(product.preco_original);

  if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
    return 'Informe um Preço de antes válido para ativar a promoção.';
  }

  if (originalPrice <= currentPrice) {
    return 'O Preço de antes deve ser maior que o preço atual.';
  }

  return '';
}
interface ProductSuggestion {
  id: number;
  name: string;
  price: number;
  category: string;
  photo_url?: string;
  prioridade: number;
}

interface ProdutoVariacaoVendavel {
  id: number;
  produto_id: number;
  nome: string;
  preco: number;
  codigo_barras: string | null;
  ativo: number;
  ordem: number;
  ingrediente_id?: number | null;
}

type ViewMode = 'list' | 'grid';

const PRODUCTION_TYPE_META: Record<ProductionType, { label: string; description: string; badgeClass: string; badgeSolidClass: string }> = {
  kitchen: {
    label: 'Cozinha',
    description: 'Entra na fila de preparo da cozinha.',
    badgeClass: 'bg-orange-100 text-orange-700',
    badgeSolidClass: 'bg-orange-500 text-white',
  },
  bar: {
    label: 'Bar',
    description: 'Entra na producao de bar e bebidas.',
    badgeClass: 'bg-cyan-100 text-cyan-700',
    badgeSolidClass: 'bg-cyan-500 text-white',
  },
  counter: {
    label: 'Balcao',
    description: 'Item pronto ou retirado no balcao, sem fila de cozinha.',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    badgeSolidClass: 'bg-emerald-500 text-white',
  },
  none: {
    label: 'Sem producao',
    description: 'Nao entra em nenhuma fila de producao.',
    badgeClass: 'bg-zinc-100 text-zinc-700',
    badgeSolidClass: 'bg-zinc-500 text-white',
  },
};

function getProductionMeta(product: Partial<ProductExtended>) {
  return PRODUCTION_TYPE_META[resolveProductionType(product)];
}

export default function ProductsScreen({
  products,
  onUpdate,
  token,
  estabelecimentoNome = 'Cardápio',
  logoUrl = null,
  deliverySlug = '',
}: {
  products: ProductExtended[];
  onUpdate: () => void | Promise<void>;
  token: string;
  estabelecimentoNome?: string;
  logoUrl?: string | null;
  /** Slug público do delivery (JWT username); usado no QR do PDF moderno */
  deliverySlug?: string;
}) {
  const [editing, setEditing]                 = useState<Partial<ProductExtended> | null>(null);
  const [showAuthModal, setShowAuthModal]     = useState(false);
  const [authPassword, setAuthPassword]       = useState('');
  const [productToDelete, setProductToDelete] = useState<number | null>(null);
  const [deleteStep, setDeleteStep]           = useState<'password' | 'confirm1' | 'confirm2'>('password');
  const [uploadingPhoto, setUploadingPhoto]   = useState(false);
  const [pendingPhoto, setPendingPhoto]       = useState<File | null>(null);
  const [categories, setCategories]           = useState<{ id: number; nome: string }[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [opcoesProdutoId, setOpcoesProdutoId] = useState<number|null>(null); // produto com modal de opções aberto
  const [productSuggestions, setProductSuggestions] = useState<ProductSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestedProductId, setSuggestedProductId] = useState<number>(0);
  const [suggestionPriority, setSuggestionPriority] = useState<number>(0);
  const [variacoesVendaveis, setVariacoesVendaveis] = useState<ProdutoVariacaoVendavel[]>([]);
  const [loadingVariacoes, setLoadingVariacoes] = useState(false);
  const [newVarNome, setNewVarNome] = useState('');
  const [newVarPreco, setNewVarPreco] = useState('');
  const [newVarCodigoBarras, setNewVarCodigoBarras] = useState('');
  const [newVarAtivo, setNewVarAtivo] = useState(true);
  const [newVarOrdem, setNewVarOrdem] = useState(0);
  const [newVarIngredienteId, setNewVarIngredienteId] = useState<number | null>(null);
  const [ingredientesEstoque, setIngredientesEstoque] = useState<
    { id: number; nome: string; estoque_atual: number; unidade: string }[]
  >([]);
  const [editingVar, setEditingVar] = useState<ProdutoVariacaoVendavel | null>(null);

  function handleEditVar(v: ProdutoVariacaoVendavel) {
    setEditingVar(v);
    setNewVarNome(v.nome || '');
    setNewVarPreco(String(v.preco ?? ''));
    setNewVarCodigoBarras(v.codigo_barras || '');
    setNewVarOrdem(Number.isFinite(v.ordem) ? v.ordem : 0);
    setNewVarAtivo(Number(v.ativo) === 1);
    const iid = v.ingrediente_id != null ? Number(v.ingrediente_id) : NaN;
    setNewVarIngredienteId(Number.isInteger(iid) && iid > 0 ? iid : null);
  }


  // ── filtros + view ───────────────────────────────────────────
  const [busca, setBusca]                     = useState('');
  const debouncedBusca                        = useDebounce(busca, 250);
  const [catFiltro, setCatFiltro]             = useState<string>('todas');
  const [statusFiltro, setStatusFiltro]       = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [destaqueFiltro, setDestaqueFiltro]   = useState(false);
  const [viewMode, setViewMode]               = useState<ViewMode>('list');
  const [cardapioPdfIncluirData, setCardapioPdfIncluirData] = useState(true);
  /** Rascunho do campo "Pos." por produto (ordem global no cardápio). */
  const [posInputById, setPosInputById] = useState<Record<number, string>>({});

  const hdrs  = { Authorization: `Bearer ${token}` };
  const jHdrs = { ...hdrs, 'Content-Type': 'application/json' };

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    const r = await fetch('/api/categories', { headers: hdrs });
    setCategories(await r.json());
  };

  // ── categorias ───────────────────────────────────────────────
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await fetch('/api/categories', { method: 'POST', headers: jHdrs, body: JSON.stringify({ nome: newCategoryName }) });
    setNewCategoryName(''); fetchCategories();
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Excluir esta categoria? Os produtos que já estão com ela NÃO serão apagados.')) return;
    await fetch(`/api/categories/${id}`, { method: 'DELETE', headers: hdrs });
    fetchCategories();
  };

  // ── foto ─────────────────────────────────────────────────────
  const handlePhotoRemove = async (productId: number) => {
    try {
      await fetch(`/api/products/${productId}/photo`, { method: 'DELETE', headers: hdrs });
      setEditing(prev => prev ? { ...prev, photo_url: undefined } : prev);
      onUpdate();
    } catch { alert('Erro ao remover foto'); }
  };

  // ── salvar ───────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const promotionError = getPromotionValidationMessage(editing);
    if (promotionError) {
      alert(promotionError);
      return;
    }
    const method = editing.id ? 'PUT' : 'POST';
    const url    = editing.id ? `/api/products/${editing.id}` : '/api/products';
    try {
      setUploadingPhoto(true);
      const r = await fetch(url, { method, headers: jHdrs, body: JSON.stringify(editing) });
      const d = await r.json();
      const savedId = editing.id || d.id;
      if (pendingPhoto && savedId) {
        const fd = new FormData(); fd.append('photo', pendingPhoto);
        await fetch(`/api/products/${savedId}/photo`, { method: 'POST', headers: hdrs, body: fd });
      }
      setEditing(null); setPendingPhoto(null); onUpdate();
    } catch { alert('Erro ao salvar produto.'); }
    finally { setUploadingPhoto(false); }
  };

  const loadProductSuggestions = async (productId: number) => {
    setLoadingSuggestions(true);
    try {
      const r = await fetch(`/api/products/${productId}/suggestions`, { headers: hdrs });
      setProductSuggestions(r.ok ? await r.json() : []);
    } catch {
      setProductSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = async () => {
    if (!editing?.id || !suggestedProductId) return;
    try {
      const r = await fetch(`/api/products/${editing.id}/suggestions`, {
        method: 'POST',
        headers: jHdrs,
        body: JSON.stringify({ suggestedProductId, priority: suggestionPriority }),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'Nao foi possivel adicionar a sugestao');
        return;
      }
      setSuggestedProductId(0);
      setSuggestionPriority(0);
      loadProductSuggestions(editing.id);
    } catch {
      alert('Erro ao adicionar sugestao.');
    }
  };

  const handleRemoveSuggestion = async (id: number) => {
    if (!editing?.id) return;
    try {
      await fetch(`/api/products/${editing.id}/suggestions/${id}`, {
        method: 'DELETE',
        headers: hdrs,
      });
      loadProductSuggestions(editing.id);
    } catch {
      alert('Erro ao remover sugestao.');
    }
  };

  const loadProductVariacoes = async (productId: number) => {
    setLoadingVariacoes(true);
    try {
      const r = await fetch(
        `/api/products/${productId}/variacoes-vendaveis?includeInactive=1`,
        { headers: hdrs }
      );
      setVariacoesVendaveis(r.ok ? await r.json() : []);
    } catch {
      setVariacoesVendaveis([]);
    } finally {
      setLoadingVariacoes(false);
    }
  };

  const loadVariacoesVendaveis = loadProductVariacoes;

  const loadIngredientesEstoque = async () => {
    try {
      const r = await fetch('/api/estoque', { headers: hdrs });
      const rows = r.ok ? await r.json() : [];
      setIngredientesEstoque(
        Array.isArray(rows)
          ? rows.map((x: { id: number; nome?: string; estoque_atual?: number; unidade?: string }) => ({
              id: Number(x.id),
              nome: String(x.nome || ''),
              estoque_atual: Number(x.estoque_atual ?? 0),
              unidade: String(x.unidade || ''),
            }))
          : []
      );
    } catch {
      setIngredientesEstoque([]);
    }
  };

  const handleAddVariacaoVendavel = async () => {
    if (!editing?.id) return;
    const nome = newVarNome.trim();
    if (!nome) {
      alert('Informe o nome da variacao.');
      return;
    }
    const preco = Number(String(newVarPreco).replace(',', '.'));
    if (!Number.isFinite(preco) || preco < 0) {
      alert('Preco invalido.');
      return;
    }
    const body: Record<string, unknown> = {
      nome,
      preco,
      codigo_barras: newVarCodigoBarras || null,
      ativo: newVarAtivo,
      ordem: newVarOrdem,
      ingrediente_id: newVarIngredienteId,
    };
    const url = editingVar
      ? `/api/products/${editing.id}/variacoes-vendaveis/${editingVar.id}`
      : `/api/products/${editing.id}/variacoes-vendaveis`;
    const method = editingVar ? 'PUT' : 'POST';
    try {
      const r = await fetch(url, {
        method,
        headers: jHdrs,
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || (editingVar ? 'Nao foi possivel salvar a variacao' : 'Nao foi possivel adicionar a variacao'));
        return;
      }
      setNewVarNome('');
      setNewVarPreco('');
      setNewVarCodigoBarras('');
      setNewVarAtivo(true);
      setNewVarOrdem(0);
      setNewVarIngredienteId(null);
      setEditingVar(null);
      loadVariacoesVendaveis(editing.id);
    } catch {
      alert(editingVar ? 'Erro ao salvar variacao.' : 'Erro ao adicionar variacao.');
    }
  };

  const handleRemoveVariacaoVendavel = async (variationId: number) => {
    if (!editing?.id) return;
    if (!confirm('Remover esta variacao vendavel?')) return;
    try {
      const r = await fetch(
        `/api/products/${editing.id}/variacoes-vendaveis/${variationId}`,
        { method: 'DELETE', headers: hdrs }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((d as { error?: string }).error || 'Nao foi possivel remover');
        return;
      }
      if (editingVar?.id === variationId) {
        setEditingVar(null);
        setNewVarNome('');
        setNewVarPreco('');
        setNewVarCodigoBarras('');
        setNewVarAtivo(true);
        setNewVarOrdem(0);
        setNewVarIngredienteId(null);
      }
      loadProductVariacoes(editing.id);
    } catch {
      alert('Erro ao remover variacao.');
    }
  };

  // ── duplicar ─────────────────────────────────────────────────
  const handleDuplicate = async (id: number) => {
    try {
      const r = await fetch(`/api/products/${id}/duplicar`, { method: 'POST', headers: hdrs });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        alert(d.error || 'Nao foi possivel duplicar o produto.');
        return;
      }
      await Promise.resolve(onUpdate());
    } catch {
      alert('Erro ao duplicar produto.');
    }
  };

  // ── destaque toggle ──────────────────────────────────────────
  const handleToggleDestaque = async (p: ProductExtended) => {
    await fetch(`/api/products/${p.id}`, {
      method: 'PUT', headers: jHdrs,
      body: JSON.stringify({ ...p, destaque: p.destaque ? 0 : 1 })
    });
    onUpdate();
  };

  // ── ativo toggle ─────────────────────────────────────────────
  const handleToggleAtivo = async (p: ProductExtended) => {
    await fetch(`/api/products/${p.id}`, {
      method: 'PUT', headers: jHdrs,
      body: JSON.stringify({ ...p, active: !p.active })
    });
    onUpdate();
  };

  // ── reordenar (só dentro do grupo ativo ou inativo; inativos ficam por último na listagem) ──
  const activeProductsSorted = useMemo(() => getGroupSortedByOrdem(products, true), [products]);
  const inactiveProductsSorted = useMemo(() => getGroupSortedByOrdem(products, false), [products]);

  const groupIndexForProduct = (p: ProductExtended) => {
    const list = isProductRowActive(p) ? activeProductsSorted : inactiveProductsSorted;
    const idx = list.findIndex((x) => x.id === p.id);
    return { idx, len: list.length };
  };

  const globalPosition1Based = (p: ProductExtended) => {
    const { idx } = groupIndexForProduct(p);
    return idx < 0 ? 1 : idx + 1;
  };

  const persistOrdemForGroup = async (sortedGroup: ProductExtended[]) => {
    const items = sortedGroup.map((prod, i) => ({ id: prod.id, ordem: i }));
    const r = await fetch('/api/products/reorder', {
      method: 'PUT',
      headers: jHdrs,
      body: JSON.stringify({ items }),
    });
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error || 'Falha ao salvar ordem');
    }
    await Promise.resolve(onUpdate());
  };

  const handleReorder = async (p: ProductExtended, dir: 'up' | 'down') => {
    const group = isProductRowActive(p);
    const sorted = getGroupSortedByOrdem(products, group);
    const idx = sorted.findIndex((x) => x.id === p.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const next = [...sorted];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    try {
      await persistOrdemForGroup(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao reordenar produtos.');
    }
  };

  const handleSetGlobalPosition = async (p: ProductExtended, newPos1Based: number) => {
    const group = isProductRowActive(p);
    const sorted = getGroupSortedByOrdem(products, group);
    const n = sorted.length;
    if (n === 0) return;
    const cur = sorted.findIndex((x) => x.id === p.id);
    if (cur < 0) return;
    const target = Math.max(0, Math.min(Math.floor(newPos1Based) - 1, n - 1));
    if (target === cur) return;
    const next = [...sorted];
    const [item] = next.splice(cur, 1);
    next.splice(target, 0, item);
    try {
      await persistOrdemForGroup(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar a posicao no cardapio.');
    }
  };

  const commitGlobalPositionInput = (p: ProductExtended) => {
    const draft = posInputById[p.id];
    setPosInputById((prev) => {
      const copy = { ...prev };
      delete copy[p.id];
      return copy;
    });
    if (draft === undefined) return;
    const digits = draft.replace(/\D/g, '');
    if (!digits) return;
    const parsed = parseInt(digits, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    if (parsed === globalPosition1Based(p)) return;
    void handleSetGlobalPosition(p, parsed);
  };

  // ── excluir ──────────────────────────────────────────────────
  const handleDeleteClick   = (id: number) => { setProductToDelete(id); setDeleteStep('password'); setShowAuthModal(true); setAuthPassword(''); };
  const handleAuthSubmit    = async (e: React.FormEvent) => {
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
    if (!productToDelete) return;
    try {
      const r = await fetch(`/api/products/${productToDelete}`, {
        method: 'DELETE',
        headers: jHdrs,
        body: JSON.stringify({ senha: authPassword }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        code?: string;
        success?: boolean;
      };
      if (r.ok) {
        onUpdate();
        setShowAuthModal(false);
      } else {
        setShowAuthModal(false);
        const blockedSales =
          d.code === 'PRODUCT_HAS_SALES_HISTORY' ||
          (typeof d.message === 'string' &&
            (d.message.includes('histórico') ||
              d.message.includes('historico') ||
              d.message.includes('vendas registradas')));
        if (blockedSales && d.message) {
          alert(d.message);
          if (
            window.confirm(
              'Deseja marcar este produto como INATIVO agora? Ele some de novas vendas e do cardápio online, mas permanece nos pedidos e relatórios antigos.'
            )
          ) {
            const prod = products.find((x) => x.id === productToDelete);
            if (prod) {
              await fetch(`/api/products/${productToDelete}`, {
                method: 'PUT',
                headers: jHdrs,
                body: JSON.stringify({ ...prod, active: false }),
              });
              onUpdate();
            }
          }
        } else {
          alert(d.message || d.error || 'Erro ao excluir.');
        }
      }
    } catch { alert('Erro de conexão.'); }
    finally { setProductToDelete(null); setDeleteStep('password'); }
  };

  // ── exportar PDF (simples ou moderno) ────────────────────────
  const abrirCardapioImpressao = (mode: CardapioPdfMode) => {
    const origin = window.location.origin;
    const html = buildCardapioPdfHtml({
      mode,
      products: products as CardapioPdfProduct[],
      estabelecimentoNome,
      logoUrl,
      origin,
      deliverySlug: deliverySlug.trim() || null,
      includeDate: mode === 'modern' ? cardapioPdfIncluirData : true,
    });
    const w = window.open('', '_blank', 'width=820,height=960');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  // ── lista filtrada ───────────────────────────────────────────
  const produtosFiltrados = useMemo(() => {
    let list = [...products];
    if (debouncedBusca) {
      const q = debouncedBusca.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    }
    if (catFiltro !== 'todas') {
      const fk = normalizeCardapioCategoryKey(catFiltro);
      list = list.filter((p) => normalizeCardapioCategoryKey(p.category) === fk);
    }
    if (statusFiltro === 'ativo') list = list.filter((p) => isProductRowActive(p));
    if (statusFiltro === 'inativo') list = list.filter((p) => !isProductRowActive(p));
    if (destaqueFiltro)           list = list.filter(p => p.destaque);
    return sortProductsForCardapioAdmin(list);
  }, [products, debouncedBusca, catFiltro, statusFiltro, destaqueFiltro]);

  const produtosPaginacaoKey = useMemo(
    () => produtosFiltrados.map((p) => p.id).join(','),
    [produtosFiltrados]
  );
  const { visibleItems: produtosVisiveis, hasMore: hasMoreProdutos, loadMore: loadMoreProdutos, totalCount: totalProdutos } = usePaginatedList(
    produtosFiltrados,
    { pageSize: 30, listResetKey: produtosPaginacaoKey }
  );

  /** Chips do filtro: categorias cadastradas + categorias ainda presentes só nos produtos (rótulo canônico por chave normalizada). */
  const catList = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of categories) {
      const k = normalizeCardapioCategoryKey(c.nome);
      if (k) byKey.set(k, c.nome);
    }
    for (const p of products) {
      const raw = String(p.category ?? '').trim();
      const k = normalizeCardapioCategoryKey(raw);
      if (k && !byKey.has(k)) byKey.set(k, raw);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [categories, products]);
  const availableSuggestionProducts = useMemo(
    () => products.filter((p) => p.id !== editing?.id),
    [products, editing?.id]
  );

  const margem = (p?: Partial<ProductExtended>) => {
    if (!p?.price || !p?.custo || p.custo <= 0) return null;
    return ((p.price - p.custo) / p.price) * 100;
  };

  useEffect(() => {
    if (!editing?.id) {
      setProductSuggestions([]);
      setSuggestedProductId(0);
      setSuggestionPriority(0);
      setVariacoesVendaveis([]);
      setNewVarNome('');
      setNewVarPreco('');
      setNewVarCodigoBarras('');
      setNewVarAtivo(true);
      setNewVarOrdem(0);
      setNewVarIngredienteId(null);
      setEditingVar(null);
      setIngredientesEstoque([]);
      return;
    }
    setEditingVar(null);
    loadProductSuggestions(editing.id);
    loadProductVariacoes(editing.id);
    loadIngredientesEstoque();
  }, [editing?.id]);

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-0 min-w-0 flex-col bg-zinc-50">

      {/* ── Header ── */}
      <div className="min-w-0 shrink-0 border-b border-zinc-200 bg-white px-3 py-2 sm:px-3 sm:py-2.5 lg:px-4 lg:py-2.5 2xl:px-6 2xl:py-3.5">
        <ScreenHeader
          rowFrom="lg"
          className="gap-2 lg:gap-2 2xl:gap-4"
          title="Cardápio"
          subtitle={
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 leading-snug">
              {products.filter((p) => isProductRowActive(p)).length} ativos · {products.filter((p) => !isProductRowActive(p)).length} inativos
              {products.filter(p => p.destaque).length > 0 && ` · ${products.filter(p => p.destaque).length} em destaque`}
            </p>
          }
          actions={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto lg:shrink-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => abrirCardapioImpressao('simple')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 rounded-xl text-xs font-bold transition-all"
                  >
                    <Download size={13} /> PDF simples
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirCardapioImpressao('modern')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all"
                  >
                    <Download size={13} /> PDF moderno
                  </button>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-500 sm:pl-1">
                  <input
                    type="checkbox"
                    checked={cardapioPdfIncluirData}
                    onChange={(e) => setCardapioPdfIncluirData(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                  />
                  Data no cabeçalho (moderno)
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button type="button" onClick={() => setShowCategoryModal(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 rounded-xl text-xs font-bold transition-all">
                  <Filter size={13}/> Categorias
                </button>
                <div className="flex bg-zinc-100 p-0.5 rounded-xl shrink-0">
                  <button type="button" aria-label="Lista" onClick={() => setViewMode('list')} className={`p-2.5 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 lg:p-2 lg:px-2.5 flex items-center justify-center rounded-lg transition-all ${viewMode==='list'?'bg-white shadow-sm text-zinc-900':'text-zinc-400'}`}><LayoutList size={15}/></button>
                  <button type="button" aria-label="Grade" onClick={() => setViewMode('grid')} className={`p-2.5 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 lg:p-2 lg:px-2.5 flex items-center justify-center rounded-lg transition-all ${viewMode==='grid'?'bg-white shadow-sm text-zinc-900':'text-zinc-400'}`}><LayoutGrid size={15}/></button>
                </div>
              </div>
              <button type="button" onClick={() => setEditing({ name: '', price: 0, category: categories[0]?.nome || 'Geral', active: true, custo: 0, destaque: 0, em_promocao: 0, preco_original: null, ordem: 0, production_type: 'kitchen', requires_preparation: 1, mais_vendido: 0 })}
                className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all active:scale-95 w-full sm:w-auto">
                <Plus size={16}/> Novo Produto
              </button>
            </div>
          }
        />

        {/* ── Filtros ── */}
        <div className="flex flex-col gap-2 mt-2 sm:mt-3 2xl:mt-4 2xl:gap-3">
          <div className="relative w-full max-w-none sm:max-w-sm sm:min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..."
              className="w-full pl-8 pr-4 py-2.5 min-h-[44px] lg:min-h-0 lg:py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 bg-zinc-50"/>
          </div>
          <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch] scroll-pl-1 scroll-pr-1">
            <button type="button" onClick={() => setCatFiltro('todas')} className={`px-3 py-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${catFiltro==='todas'?'bg-zinc-900 text-white':'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}>Todas</button>
            {catList.map((c) => {
              const active =
                catFiltro !== 'todas' &&
                normalizeCardapioCategoryKey(catFiltro) === normalizeCardapioCategoryKey(c);
              return (
                <button
                  type="button"
                  key={normalizeCardapioCategoryKey(c) || c}
                  onClick={() => setCatFiltro(c)}
                  className={`px-3 py-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 max-w-[12rem] truncate ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
                  title={c}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
            <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden flex-1 min-w-0 touch-pan-x pb-0.5 -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
              {(['todos','ativo','inativo'] as const).map(s => (
                <button type="button" key={s} onClick={() => setStatusFiltro(s)} className={`px-3 py-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5 rounded-lg text-xs font-bold capitalize transition-all shrink-0 ${statusFiltro===s?'bg-zinc-900 text-white':'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}>{s}</button>
              ))}
              <button type="button" onClick={() => setDestaqueFiltro(!destaqueFiltro)} className={`flex items-center gap-1 px-3 py-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${destaqueFiltro?'bg-amber-500 text-white':'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}>
                <Star size={11}/> Destaque
              </button>
            </div>
            <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0 pl-1">{totalProdutos} produto(s)</span>
          </div>
        </div>
      </div>

      {/* ── Lista / Grid ── */}
      <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${adminScreenPagePaddingClass}`}>
        {produtosVisiveis.length === 0 ? (
          <EmptyState
            icon={Package}
            title={debouncedBusca ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            description={
              debouncedBusca
                ? 'Tente outro termo de busca ou limpe os filtros.'
                : 'Cadastre um produto ou importe sua lista para começar.'
            }
          />
        ) : viewMode === 'list' ? (
          /* ── LISTA ── */
          <div className="space-y-2">
            {produtosVisiveis.map((p) => {
              const mg = margem(p);
              const { idx: gIdx, len: gLen } = groupIndexForProduct(p);
              const grupoLabel = isProductRowActive(p) ? 'ativos' : 'inativos';
              return (
                <div key={p.id} className={`${adminOpsListRowClass} flex flex-col gap-2 p-3 hover:border-zinc-300 transition-all lg:flex-row lg:items-center lg:gap-3 2xl:gap-4 2xl:p-4 ${!p.active ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button type="button" onClick={() => handleReorder(p, 'up')} className="p-1 hover:bg-zinc-100 rounded min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-300 hover:text-zinc-600 transition-all disabled:opacity-30" disabled={gIdx <= 0} title={`Subir entre produtos ${grupoLabel}`}><ChevronUp size={13}/></button>
                      <button type="button" onClick={() => handleReorder(p, 'down')} className="p-1 hover:bg-zinc-100 rounded min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-300 hover:text-zinc-600 transition-all disabled:opacity-30" disabled={gIdx < 0 || gIdx >= gLen - 1} title={`Descer entre produtos ${grupoLabel}`}><ChevronDown size={13}/></button>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-11 sm:w-12" title={`Posicao entre ${grupoLabel} (1 = primeiro do grupo). Enter ou clique fora para aplicar.`}>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tight leading-none">Pos.</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`Posicao no cardapio: ${p.name}`}
                        className="w-full h-7 px-0.5 text-center text-xs font-black tabular-nums border border-zinc-200 rounded-lg bg-white text-zinc-800 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
                        value={posInputById[p.id] ?? String(globalPosition1Based(p))}
                        onChange={(e) => setPosInputById((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => commitGlobalPositionInput(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </div>
                    <div className={`w-14 h-14 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${COLOR_MAP[p.color || 'zinc']?.bg || 'bg-zinc-100'}`}>
                      {p.photo_url ? (
                        <img
                          key={`cardapio-thumb-${p.id}-${p.photo_url}`}
                          src={p.photo_url}
                          alt={p.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package size={20} className="text-zinc-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="min-w-0 flex-1 truncate font-black text-zinc-900 text-sm" title={p.name}>{p.name}</span>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                          {p.destaque ? <Star size={12} className="text-amber-500 fill-amber-500 flex-shrink-0"/> : null}
                          {!!p.mais_vendido ? <Award size={12} className="text-teal-600 flex-shrink-0" aria-hidden /> : null}
                          {!!p.em_promocao && Number(p.preco_original || 0) > Number(p.price || 0) ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase flex-shrink-0 bg-rose-100 text-rose-700">
                              Promocao
                            </span>
                          ) : null}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase flex-shrink-0 ${p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                            {p.active ? 'Ativo' : 'Inativo'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase flex-shrink-0 ${getProductionMeta(p).badgeClass}`}>
                            {getProductionMeta(p).label}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 break-words">
                        {p.category} · {fmtR$(p.price)}
                        {!!p.em_promocao && Number(p.preco_original || 0) > Number(p.price || 0) && <span className="text-rose-500"> · de {fmtR$(Number(p.preco_original || 0))}</span>}
                        {p.custo && p.custo > 0 && <span className="text-zinc-300"> · custo {fmtR$(p.custo)}</span>}
                        {mg !== null && <span className={`font-bold ${mg >= 50 ? 'text-emerald-600' : mg >= 30 ? 'text-amber-600' : 'text-red-500'}`}> · {mg.toFixed(0)}% margem</span>}
                      </p>
                      {p.descricao && <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{p.descricao}</p>}
                      {(p.disponivel_de || p.disponivel_ate) && (
                        <p className="text-[10px] text-blue-500 mt-0.5"><Clock size={9} className="inline mr-0.5"/>{p.disponivel_de || '–'} às {p.disponivel_ate || '–'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:gap-1 lg:flex-nowrap lg:justify-end lg:flex-shrink-0 lg:max-w-none max-lg:pt-1 max-lg:border-t max-lg:border-zinc-100">
                    <button type="button" onClick={() => handleToggleDestaque(p)} title={p.destaque ? 'Remover destaque' : 'Destacar'}
                      className={`p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-all ${p.destaque ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-zinc-300 hover:text-amber-500 hover:bg-amber-50'}`}>
                      <Star size={15} className={p.destaque ? 'fill-amber-500' : ''}/>
                    </button>
                    <button type="button" onClick={() => handleToggleAtivo(p)} title={p.active ? 'Desativar' : 'Ativar'}
                      className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all">
                      {p.active ? <Eye size={15}/> : <EyeOff size={15}/>}
                    </button>
                    <button type="button" onClick={() => handleDuplicate(p.id)} title="Duplicar"
                      className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all">
                      <Copy size={15}/>
                    </button>
                    {p.id && <button type="button" onClick={() => setOpcoesProdutoId(p.id!)} title="Opções / Adicionais"
                      className="flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-bold transition-all">
                      <Settings2 size={12}/> Opções
                    </button>}
                    <button type="button" onClick={() => { setEditing({ ...p, production_type: resolveProductionType(p), requires_preparation: resolveRequiresPreparation(p) ? 1 : 0 }); setPendingPhoto(null); }}
                      className="flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-lg text-xs font-bold transition-all">
                      <Pencil size={12}/> Editar
                    </button>
                    <button type="button" onClick={() => handleDeleteClick(p.id)}
                      className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all">
                      <Trash2 size={15}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── GRID ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 min-[1100px]:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
            {produtosVisiveis.map(p => {
              const mg = margem(p);
              const cc = COLOR_MAP[p.color || 'zinc'] || COLOR_MAP.zinc;
              const grupoPos = isProductRowActive(p) ? 'ativos' : 'inativos';
              return (
                <div key={p.id} className={`${adminOpsListRowClass} overflow-hidden hover:border-zinc-300 transition-all flex flex-col ${!p.active ? 'opacity-60' : ''}`}>
                  {/* Foto */}
                  <div className={`w-full h-40 flex items-center justify-center overflow-hidden relative ${cc.bg}`}>
                    {p.photo_url ? (
                      <img
                        key={`cardapio-grid-${p.id}-${p.photo_url}`}
                        src={p.photo_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={40} className="text-zinc-300" />
                    )}
                    {p.destaque ? <div className="absolute top-2 left-2 bg-amber-400 text-white rounded-full p-1"><Star size={12} className="fill-white"/></div> : null}
                    {!!p.em_promocao && Number(p.preco_original || 0) > Number(p.price || 0) ? (
                      <div className="absolute top-2 left-11 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase">
                        Promocao
                      </div>
                    ) : null}
                    {!!p.mais_vendido ? (
                      <div className="absolute bottom-10 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm" title="Mais vendidos">
                        <Award size={14} aria-hidden />
                      </div>
                    ) : null}
                    <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${p.active ? 'bg-emerald-500 text-white' : 'bg-zinc-500 text-white'}`}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </div>
                    <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${getProductionMeta(p).badgeSolidClass}`}>
                      {getProductionMeta(p).label}
                    </div>
                  </div>
                  {/* Body */}
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="font-black text-zinc-900 text-sm leading-tight mb-0.5">{p.name}</p>
                    <p className="text-[10px] text-zinc-400 mb-1">{p.category}</p>
                    {p.descricao && <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2">{p.descricao}</p>}
                    <div className="mt-auto">
                      <p className="text-base font-black text-zinc-900">{fmtR$(p.price)}</p>
                      {!!p.em_promocao && Number(p.preco_original || 0) > Number(p.price || 0) && (
                        <p className="text-[10px] font-bold text-rose-500 line-through">{fmtR$(Number(p.preco_original || 0))}</p>
                      )}
                      {mg !== null && <p className={`text-[10px] font-bold ${mg >= 50 ? 'text-emerald-600' : mg >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{mg.toFixed(0)}% margem</p>}
                    </div>
                  </div>
                  {/* Ações */}
                  <div className="border-t border-zinc-100 px-2 sm:px-3 py-2 flex flex-wrap gap-1 items-center justify-end sm:flex-nowrap">
                    <div className="flex items-center gap-1 mr-auto sm:mr-0 pr-1" title={`Posicao entre produtos ${grupoPos} (1 = primeiro do grupo)`}>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase">Pos.</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`Posicao entre ${grupoPos}: ${p.name}`}
                        className="w-9 h-8 px-0.5 text-center text-[11px] font-black tabular-nums border border-zinc-200 rounded-lg bg-white text-zinc-800 focus:outline-none focus:border-zinc-400"
                        value={posInputById[p.id] ?? String(globalPosition1Based(p))}
                        onChange={(e) => setPosInputById((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => commitGlobalPositionInput(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </div>
                    <button type="button" onClick={() => handleToggleDestaque(p)} className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-all ${p.destaque ? 'text-amber-500' : 'text-zinc-300 hover:text-amber-500'}`}><Star size={14} className={p.destaque ? 'fill-amber-500' : ''}/></button>
                    <button type="button" onClick={() => handleToggleAtivo(p)} className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-zinc-100 text-zinc-400 rounded-lg transition-all">{p.active ? <Eye size={14}/> : <EyeOff size={14}/>}</button>
                    <button type="button" onClick={() => handleDuplicate(p.id)} className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-zinc-100 text-zinc-400 rounded-lg transition-all"><Copy size={14}/></button>
                    {p.id && <button type="button" onClick={() => setOpcoesProdutoId(p.id!)} title="Opções / Adicionais" className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-emerald-50 text-zinc-300 hover:text-emerald-600 rounded-lg transition-all"><Settings2 size={14}/></button>}
                    <button type="button" onClick={() => { setEditing({ ...p, production_type: resolveProductionType(p), requires_preparation: resolveRequiresPreparation(p) ? 1 : 0 }); setPendingPhoto(null); }} className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-zinc-100 text-zinc-400 rounded-lg transition-all"><Pencil size={14}/></button>
                    <button type="button" onClick={() => handleDeleteClick(p.id)} className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all"><Trash2 size={14}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {produtosVisiveis.length > 0 && hasMoreProdutos && (
          <div className="flex justify-center pt-4 pb-2">
            <button onClick={loadMoreProdutos}
              className="px-6 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-bold rounded-xl text-sm transition-all active:scale-95">
              Carregar mais (+30)
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════ MODAIS ════════════════════ */}

      {/* Modal: Editar / Novo Produto */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="product-form-modal my-auto flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl max-h-[min(92dvh,100svh)] sm:max-h-[min(90vh,900px)] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="product-form-modal-header flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 pt-3 pb-2 sm:px-5 sm:pt-4 2xl:px-7 2xl:pt-7 2xl:pb-3">
                <h3 className="pr-2 text-base font-black text-zinc-900 sm:text-lg 2xl:text-xl">{editing.id ? 'Editar Produto' : 'Novo Produto'}</h3>
                <button type="button" onClick={() => { setEditing(null); setPendingPhoto(null); }} className="product-form-modal-close p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded-xl text-zinc-400 shrink-0"><X size={18}/></button>
              </div>

              <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 min-w-0">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pt-3 pb-2 sm:px-5 sm:pt-3 2xl:space-y-4 2xl:px-7 2xl:pt-4">
                {/* Nome */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Nome do produto *</label>
                  <input value={editing.name || ''} onChange={e => setEditing(p => ({...p, name: e.target.value}))}
                    placeholder="ex: Hambúrguer Clássico" required
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
                </div>

                {/* Descrição */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Descrição</label>
                  <textarea value={editing.descricao || ''} onChange={e => setEditing(p => ({...p, descricao: e.target.value}))}
                    rows={2} placeholder="ex: Pão brioche, carne 180g, queijo cheddar, molho especial..."
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400 resize-none"/>
                </div>

                {/* Preço + Custo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Preço de venda (R$) *</label>
                    <input type="number" step="0.01" min="0" value={editing.price ?? 0}
                      onChange={e => setEditing(p => ({...p, price: parseFloat(e.target.value) || 0}))} required
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Custo (R$)</label>
                    <input type="number" step="0.01" min="0" value={editing.custo ?? 0}
                      onChange={e => setEditing(p => ({...p, custo: parseFloat(e.target.value) || 0}))}
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
                  </div>
                </div>

                <div className="product-form-promo-block rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="product-form-section-title text-sm font-semibold text-zinc-800">Promocao no cardapio online</p>
                      <p className="product-form-section-description text-xs text-zinc-500 mt-0.5">
                        O preco atual continua sendo o Preco de venda. O campo abaixo serve apenas para exibir o valor antigo riscado.
                      </p>
                    </div>
                    <label className={`product-form-checkbox-row flex items-center gap-2 cursor-pointer shrink-0 rounded-xl border px-3 py-2 transition-all ${editing.em_promocao ? 'is-active border-rose-300 bg-white shadow-sm' : 'border-rose-100/70 bg-white/70 hover:border-rose-200'}`}>
                      <input
                        type="checkbox"
                        checked={!!editing.em_promocao}
                        onChange={e => setEditing(prev => ({
                          ...prev,
                          em_promocao: e.target.checked ? 1 : 0,
                          preco_original: e.target.checked ? prev?.preco_original ?? undefined : null,
                        }))}
                        className="product-form-checkbox h-4 w-4 rounded border-rose-300 accent-rose-500"
                      />
                      <span className="product-form-checkbox-label text-sm font-medium text-zinc-700">Produto em promocao</span>
                    </label>
                  </div>

                  {!!editing.em_promocao && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Preco de antes (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editing.preco_original ?? ''}
                          onChange={e => setEditing(prev => ({
                            ...prev,
                            preco_original: e.target.value === '' ? null : (parseFloat(e.target.value) || 0),
                          }))}
                          className="product-form-promo-input w-full px-3.5 py-2.5 border border-rose-200 bg-white rounded-xl text-sm focus:outline-none focus:border-rose-400"
                        />
                      </div>
                      <div className="product-form-promo-preview rounded-xl border border-rose-100 bg-white px-3.5 py-2.5 flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Preview</span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-base font-black text-zinc-900">{fmtR$(Number(editing.price || 0))}</span>
                          {Number(editing.preco_original || 0) > Number(editing.price || 0) && (
                            <span className="text-xs font-bold text-rose-500 line-through">{fmtR$(Number(editing.preco_original || 0))}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {getPromotionValidationMessage(editing) && (
                    <div className="product-form-promo-alert rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700">
                      {getPromotionValidationMessage(editing)}
                    </div>
                  )}
                </div>

                {/* Margem calculada */}
                {(editing.price || 0) > 0 && (editing.custo || 0) > 0 && (() => {
                  const mg = margem(editing)!;
                  const cls = mg >= 50 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : mg >= 30 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700';
                  return (
                    <div className={`px-4 py-2.5 rounded-xl border text-sm font-bold ${cls}`}>
                      Margem: {mg.toFixed(1)}% · Lucro: {fmtR$((editing.price || 0) - (editing.custo || 0))} por unidade
                    </div>
                  );
                })()}

                {/* Categoria */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Categoria</label>
                  <select value={editing.category || ''} onChange={e => setEditing(p => ({...p, category: e.target.value as any}))}
                    className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none">
                    {categories.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                    {editing.category && !categories.find(c => c.nome === editing.category) && (
                      <option value={editing.category}>{editing.category}</option>
                    )}
                  </select>
                </div>

                {/* Disponibilidade por horário */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                    <Clock size={10} className="inline mr-1"/>Disponível das… às…
                    <span className="ml-1 normal-case font-normal text-zinc-400">(deixe vazio para sempre disponível)</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="time" value={editing.disponivel_de || ''}
                      onChange={e => setEditing(p => ({...p, disponivel_de: e.target.value || undefined}))}
                      className="px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                    <input type="time" value={editing.disponivel_ate || ''}
                      onChange={e => setEditing(p => ({...p, disponivel_ate: e.target.value || undefined}))}
                      className="px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                  </div>
                </div>

                <div className={`${adminOpsMutedBlockClass} product-form-production-block`}>
                  <div>
                    <span className="product-form-section-title block text-sm font-semibold text-zinc-800">Setor de producao</span>
                    <span className="product-form-section-description block text-xs text-zinc-500 mt-0.5">
                      Define se o item vai para cozinha, bar, balcao/pronto ou se nao entra em fila de producao.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {(Object.entries(PRODUCTION_TYPE_META) as [ProductionType, typeof PRODUCTION_TYPE_META[ProductionType]][]).map(([value, meta]) => {
                      const selectedType = resolveProductionType(editing);
                      const isSelected = selectedType === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEditing(prev => ({
                            ...prev,
                            production_type: value,
                            requires_preparation: value === 'kitchen' || value === 'bar' ? 1 : 0,
                          }))}
                          aria-pressed={isSelected}
                          data-production-type={value}
                          className={`product-form-production-option rounded-xl border px-3 py-3 text-left transition-all ${isSelected ? 'is-selected border-zinc-900 bg-white shadow-sm' : 'border-zinc-200 bg-white/70 hover:bg-white'}`}
                        >
                          <span className="product-form-option-title block text-sm font-bold text-zinc-900">{meta.label}</span>
                          <span className="product-form-option-description block text-xs text-zinc-500 mt-1">{meta.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>


                {/* Código de barras + Marca */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 mb-1.5"><Barcode size={10}/>Cód. Barras</label>
                    <input type="text" placeholder="7896006754345"
                      value={(editing as any).codigo_barras || ''}
                      onChange={e => setEditing(p => ({...p, codigo_barras: e.target.value} as any))}
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm font-mono focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Marca</label>
                    <input type="text" placeholder="Nestlé, Camil..."
                      value={(editing as any).marca || ''}
                      onChange={e => setEditing(p => ({...p, marca: e.target.value} as any))}
                      className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none"/>
                  </div>
                </div>

                {/* Foto */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Foto do Produto</label>
                  {editing.photo_url || pendingPhoto ? (
                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-zinc-200">
                      <img src={pendingPhoto ? URL.createObjectURL(pendingPhoto) : editing.photo_url} alt="" className="w-full h-full object-cover"/>
                      <button type="button"
                        onClick={() => { if (pendingPhoto) setPendingPhoto(null); else if (editing.id) handlePhotoRemove(editing.id); }}
                        className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-lg">
                        <X size={14}/>
                      </button>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-300 rounded-xl cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 transition-all ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                      <ImageIcon size={24} className="text-zinc-300 mb-1"/>
                      <span className="text-xs text-zinc-400">Clique para adicionar foto</span>
                      <span className="text-[10px] text-zinc-300">JPEG, PNG ou WEBP · máx. 5MB</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPendingPhoto(f); }}/>
                    </label>
                  )}
                </div>

                {editing.id && (
                  <div className={`${adminOpsMutedBlockClass} space-y-3`}>
                    <div>
                      <p className="text-sm font-semibold text-zinc-800">Sugestões de complementos</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Cadastre produtos sugeridos para este item.</p>
                    </div>

                    <div className="space-y-2">
                      {loadingSuggestions ? (
                        <p className="text-xs text-zinc-400">Carregando sugestões...</p>
                      ) : productSuggestions.length === 0 ? (
                        <p className="text-xs text-zinc-400">Nenhuma sugestão cadastrada.</p>
                      ) : (
                        productSuggestions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between bg-white border border-zinc-200 rounded-xl px-3 py-2">
                            <div>
                              <p className="text-sm font-bold text-zinc-800">{s.name}</p>
                              <p className="text-xs text-zinc-500">{fmtR$(s.price)} · prioridade {s.prioridade}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSuggestion(s.id)}
                              className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                            >
                              Remover
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={suggestedProductId || ''}
                        onChange={(e) => setSuggestedProductId(Number(e.target.value) || 0)}
                        className="sm:col-span-2 px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                      >
                        <option value="">Selecionar produto sugerido</option>
                        {availableSuggestionProducts.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={suggestionPriority}
                        onChange={(e) => setSuggestionPriority(parseInt(e.target.value, 10) || 0)}
                        className="px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                        placeholder="Prioridade"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSuggestion}
                      disabled={!suggestedProductId}
                      className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-xl text-sm font-bold transition-all"
                    >
                      Adicionar sugestão
                    </button>
                  </div>
                )}

                {editing.id && (
                  <div className={`${adminOpsMutedBlockClass} space-y-3`}>
                    <div>
                      <p className="text-sm font-semibold text-zinc-800">Variações vendáveis</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Sabores, tamanhos ou opções com preço, insumo de estoque ou código de barras próprios no PDV.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {loadingVariacoes ? (
                        <p className="text-xs text-zinc-400">Carregando variações...</p>
                      ) : variacoesVendaveis.length === 0 ? (
                        <p className="text-xs text-zinc-400">Nenhuma variação cadastrada.</p>
                      ) : (
                        variacoesVendaveis.map((v) => (
                          <div
                            key={v.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-zinc-800 truncate">{v.nome}</p>
                              <p className="text-xs text-zinc-500">
                                {fmtR$(v.preco)}
                                {v.ingrediente_id
                                  ? (() => {
                                      const ing = ingredientesEstoque.find((i) => i.id === Number(v.ingrediente_id));
                                      const label = ing?.nome || `insumo #${v.ingrediente_id}`;
                                      const q = ing ? fmtQtdEstoque(ing.estoque_atual, ing.unidade) : '';
                                      return ` · ${label}${q ? ` (atual: ${q})` : ''}`;
                                    })()
                                  : ''}
                                {v.codigo_barras ? ` · ${v.codigo_barras}` : ''}
                                {' · '}
                                ordem {v.ordem}
                                {' · '}
                                {Number(v.ativo) === 1 ? (
                                  <span className="text-emerald-600 font-semibold">ativo</span>
                                ) : (
                                  <span className="text-zinc-400 font-semibold">inativo</span>
                                )}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-center">
                              <button
                                type="button"
                                onClick={() => handleEditVar(v)}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-zinc-100 text-zinc-800 hover:bg-zinc-200 transition-all"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveVariacaoVendavel(v.id)}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Nome"
                        value={newVarNome}
                        onChange={(e) => setNewVarNome(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Preço"
                        value={newVarPreco}
                        onChange={(e) => setNewVarPreco(e.target.value)}
                        className="px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Código de barras (opcional)"
                        value={newVarCodigoBarras}
                        onChange={(e) => setNewVarCodigoBarras(e.target.value)}
                        className="px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                      />
                      <label className="sm:col-span-2 flex flex-col gap-1">
                        <span className="text-xs font-medium text-zinc-600">Insumo no estoque (opcional)</span>
                        <select
                          value={newVarIngredienteId ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setNewVarIngredienteId(raw === '' ? null : Number(raw));
                          }}
                          className="px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                        >
                          <option value="">Nenhum (prioriza código de barras da variação, se houver)</option>
                          {ingredientesEstoque.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.nome} — atual: {fmtQtdEstoque(ing.estoque_atual, ing.unidade)}
                            </option>
                          ))}
                        </select>
                        {newVarIngredienteId != null && (
                          <p className="text-xs text-zinc-500">
                            Quantidade atual no estoque:{' '}
                            <span className="font-semibold text-zinc-700">
                              {(() => {
                                const ing = ingredientesEstoque.find((i) => i.id === newVarIngredienteId);
                                return ing ? fmtQtdEstoque(ing.estoque_atual, ing.unidade) : '—';
                              })()}
                            </span>
                            {' '}(ajuste no menu Estoque)
                          </p>
                        )}
                      </label>
                      <input
                        type="number"
                        placeholder="Ordem"
                        value={newVarOrdem}
                        onChange={(e) => setNewVarOrdem(parseInt(e.target.value, 10) || 0)}
                        className="px-3 py-2 border border-zinc-200 bg-white rounded-lg text-sm focus:outline-none"
                      />
                      <label className="flex items-center gap-2 px-1 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newVarAtivo}
                          onChange={(e) => setNewVarAtivo(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span className="text-sm font-medium text-zinc-700">Ativo</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddVariacaoVendavel}
                      className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all"
                    >
                      {editingVar ? 'Salvar edição' : 'Adicionar variação'}
                    </button>
                  </div>
                )}

                {/* Toggles */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <input type="checkbox" checked={!!editing.active} onChange={e => setEditing(p => ({...p, active: e.target.checked}))}
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"/>
                    <span className="text-sm font-medium text-zinc-700">Produto ativo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <input type="checkbox" checked={!!editing.destaque} onChange={e => setEditing(p => ({...p, destaque: e.target.checked ? 1 : 0}))}
                      className="w-4 h-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-500"/>
                    <span className="text-sm font-medium text-zinc-700">⭐ Em destaque</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <input type="checkbox" checked={!!editing.mais_vendido} onChange={e => setEditing(p => ({...p, mais_vendido: e.target.checked ? 1 : 0}))}
                      className="w-4 h-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"/>
                    <span className="text-sm font-medium text-zinc-700">🏆 Mais vendidos (PDF)</span>
                  </label>
                </div>
              </div>

                <div className="flex shrink-0 gap-2 border-t border-zinc-100 bg-white px-3 pt-2.5 pb-3 sm:gap-3 sm:px-5 sm:pb-4 2xl:px-7 2xl:pt-3 2xl:pb-6">
                  <button type="button" onClick={() => { setEditing(null); setPendingPhoto(null); }}
                    className="min-h-[44px] flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-bold transition-all hover:bg-zinc-200 2xl:min-h-[48px] 2xl:py-3">Cancelar</button>
                  <button type="submit" disabled={uploadingPhoto}
                    className="min-h-[44px] flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:opacity-50 2xl:min-h-[48px] 2xl:py-3">
                    {uploadingPhoto ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Categorias */}
      <AnimatePresence>
        {showCategoryModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="flex max-h-[min(92dvh,100svh)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white p-4 shadow-2xl sm:max-h-[min(85vh,640px)] sm:rounded-3xl sm:p-6">
              <div className="flex shrink-0 items-center justify-between pb-3 sm:pb-4">
                <h3 className="text-lg sm:text-xl font-black text-zinc-900">Categorias</h3>
                <button type="button" onClick={() => setShowCategoryModal(false)} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
              </div>
              <form onSubmit={handleAddCategory} className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row">
                <input type="text" placeholder="Nova categoria..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                  className="min-h-[44px] flex-1 min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm focus:border-zinc-400 focus:outline-none lg:min-h-0 lg:py-2"/>
                <button type="submit" className="min-h-[44px] shrink-0 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-zinc-800 lg:min-h-0 lg:py-2">Adicionar</button>
              </form>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-100 divide-y divide-zinc-50">
                {categories.length === 0 && <p className="text-center text-zinc-400 py-6 text-sm">Nenhuma categoria</p>}
                {categories.map(cat => (
                  <div key={cat.id} className="flex justify-between items-center px-4 py-3 hover:bg-zinc-50">
                    <span className="font-bold text-zinc-700 text-sm">{cat.nome}</span>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="text-zinc-300 hover:text-red-500 transition-all"><Trash2 size={15}/></button>
                  </div>
                ))}
              </div>
              <div className="shrink-0 border-t border-zinc-100 pt-3 sm:pt-4">
                <button type="button" onClick={() => setShowCategoryModal(false)} className="w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-bold transition-all hover:bg-zinc-200">Fechar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Exclusão */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              {deleteStep === 'password' ? (
                <>
                  <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-5"><Lock size={28}/></div>
                  <h3 className="text-xl font-black text-zinc-900 text-center">Autorizar Exclusão</h3>
                  <p className="text-zinc-400 text-center text-sm mt-2 mb-6">Digite a senha de segurança para continuar.</p>
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                      placeholder="••••••" autoFocus required className="w-full px-3.5 py-2.5 border border-zinc-200 bg-zinc-50 rounded-xl text-sm focus:outline-none text-center tracking-widest"/>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-sm font-bold">Cancelar</button>
                      <button type="submit" className="flex-1 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold">Confirmar</button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-center">
                  <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5"><AlertCircle size={28}/></div>
                  <h3 className="text-xl font-black text-zinc-900">{deleteStep === 'confirm1' ? 'Tem certeza?' : 'Confirmação Final'}</h3>
                  <p className="text-zinc-400 text-sm mt-2 mb-6">{deleteStep === 'confirm1' ? 'Esta ação não pode ser desfeita.' : 'Todos os dados do produto serão removidos.'}</p>
                  <div className="flex gap-3">
                    <button onClick={() => { setShowAuthModal(false); setProductToDelete(null); }} className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-sm font-bold">Cancelar</button>
                    <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold">
                      {deleteStep === 'confirm1' ? 'Sim, continuar' : 'Sim, excluir'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modal: Opções do Produto (adicionais, variações) */}
      <AnimatePresence>
        {opcoesProdutoId && (
          <ModalOpcoesAdmin
            produtoId={opcoesProdutoId}
            produtoNome={products.find(p=>p.id===opcoesProdutoId)?.name||''}
            token={token}
            onClose={()=>setOpcoesProdutoId(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// MODAL DE GESTÃO DE OPÇÕES DO PRODUTO (Admin)
// ══════════════════════════════════════════════════════════════════════════════
interface GrupoOpcaoAdmin {
  id: number; nome: string; tipo: string;
  min_selecoes: number; max_selecoes: number; obrigatorio: number; ordem: number;
  ativo: number; modo_preco: string;
  itens: ItemOpcaoAdmin[];
}
interface ItemOpcaoAdmin {
  id: number; nome: string; preco_adicional: number; ordem: number; ativo: number;
}

function ModalOpcoesAdmin({ produtoId, produtoNome, token, onClose }: {
  produtoId: number; produtoNome: string; token: string; onClose: ()=>void;
}) {
  const [grupos, setGrupos] = useState<GrupoOpcaoAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoGrupo, setNovoGrupo] = useState({ nome:'', tipo:'radio', min_selecoes:0, max_selecoes:1, obrigatorio:false, modo_preco:'adicional' });
  const [novoItem, setNovoItem] = useState<Record<number,{nome:string;preco:string}>>({});
  const [editItem, setEditItem] = useState<{id:number;nome:string;preco:string}|null>(null);
  const [editGrupo, setEditGrupo] = useState<{id:number;nome:string;tipo:string;min_selecoes:number;max_selecoes:number;obrigatorio:boolean;modo_preco:string}|null>(null);
  const [saving, setSaving] = useState(false);
  const hdrs = { 'Content-Type':'application/json', Authorization:`Bearer ${token}` };
  const fmtR = (v: number) => v > 0 ? `+R$ ${v.toFixed(2).replace('.',',')}` : 'Incluso';

  const { visibleItems: gruposVisiveis, hasMore: hasMoreGrupos, loadMore: loadMoreGrupos, totalCount: totalGrupos } = usePaginatedList(grupos, { pageSize: 10 });

  const carregar = async () => {
    const r = await fetch(`/api/products/${produtoId}/opcoes`, { headers: { Authorization:`Bearer ${token}` } });
    if (r.ok) setGrupos(await r.json());
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [produtoId]);

  const addGrupo = async () => {
    if (!novoGrupo.nome.trim()) return;
    setSaving(true);
    await fetch(`/api/products/${produtoId}/opcoes/grupos`, { method:'POST', headers: hdrs, body: JSON.stringify(novoGrupo) });
    setNovoGrupo({ nome:'', tipo:'radio', min_selecoes:0, max_selecoes:1, obrigatorio:false });
    await carregar(); setSaving(false);
  };

  const saveGrupo = async () => {
    if (!editGrupo) return;
    setSaving(true);
    await fetch(`/api/products/opcoes/grupos/${editGrupo.id}`, { method:'PUT', headers: hdrs,
      body: JSON.stringify(editGrupo) });
    setEditGrupo(null);
    await carregar(); setSaving(false);
  };

  const toggleGrupoAtivo = async (g: GrupoOpcaoAdmin) => {
    const novoAtivo = g.ativo ? 0 : 1;
    setGrupos(prev => prev.map(gr => gr.id === g.id ? {...gr, ativo: novoAtivo} : gr));
    await fetch(`/api/products/opcoes/grupos/${g.id}`, { method:'PUT', headers: hdrs,
      body: JSON.stringify({
        nome: g.nome, tipo: g.tipo,
        min_selecoes: g.min_selecoes, max_selecoes: g.max_selecoes,
        obrigatorio: g.obrigatorio, ordem: g.ordem, ativo: novoAtivo, modo_preco: g.modo_preco
      })
    });
  };

  const delGrupo = async (grupoId: number) => {
    if (!confirm('Remover grupo e todos seus itens?')) return;
    await fetch(`/api/products/opcoes/grupos/${grupoId}`, { method:'DELETE', headers: hdrs });
    carregar();
  };

  const addItem = async (grupoId: number) => {
    const ni = novoItem[grupoId];
    if (!ni?.nome?.trim()) return;
    setSaving(true);
    await fetch(`/api/products/opcoes/grupos/${grupoId}/itens`, { method:'POST', headers: hdrs,
      body: JSON.stringify({ nome: ni.nome.trim(), preco_adicional: parseFloat(ni.preco)||0 }) });
    setNovoItem(prev => ({...prev, [grupoId]: {nome:'',preco:''}}));
    await carregar(); setSaving(false);
  };

  const delItem = async (itemId: number) => {
    await fetch(`/api/products/opcoes/itens/${itemId}`, { method:'DELETE', headers: hdrs });
    carregar();
  };

  // Toggle ativo/inativo do item no delivery (sem deletar)
  const toggleItemAtivo = async (item: ItemOpcaoAdmin) => {
    await fetch(`/api/products/opcoes/itens/${item.id}`, { method:'PUT', headers: hdrs,
      body: JSON.stringify({ nome: item.nome, preco_adicional: item.preco_adicional, ativo: item.ativo ? 0 : 1, ordem: item.ordem }) });
    // Atualiza local sem reload total para resposta imediata
    setGrupos(prev => prev.map(g => ({
      ...g,
      itens: g.itens.map(it => it.id === item.id ? {...it, ativo: it.ativo ? 0 : 1} : it)
    })));
  };

  const saveItem = async () => {
    if (!editItem) return;
    await fetch(`/api/products/opcoes/itens/${editItem.id}`, { method:'PUT', headers: hdrs,
      body: JSON.stringify({ nome: editItem.nome, preco_adicional: parseFloat(editItem.preco)||0 }) });
    setEditItem(null); carregar();
  };

  const inp = "px-3 py-2 border border-zinc-200 bg-zinc-50 rounded-lg text-sm focus:outline-none focus:border-emerald-400 transition-all";

  const TIPO_LABELS: Record<string,string> = {
    radio: 'Escolha 1 (radio)',
    checkbox: 'Múltipla escolha',
    quantidade: 'Quantidade (+/-)',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <motion.div initial={{scale:0.93,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.93,opacity:0}}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col min-h-0 max-h-[min(92dvh,100svh)] sm:max-h-[92vh]">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-3 sm:px-5 sm:py-3.5 2xl:px-6 2xl:py-5">
          <div className="min-w-0 pr-2">
            <h3 className="text-base sm:text-lg font-black text-zinc-900">Opções do Produto</h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 truncate">{produtoNome}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18}/></button>
        </div>

        {/* Dica */}
        <div className="mx-3 mt-2 shrink-0 space-y-1.5 overflow-x-auto rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-800 sm:mx-5 sm:mt-3 sm:px-3 sm:py-2.5 2xl:mx-6 2xl:mt-4 2xl:px-4 2xl:py-3 2xl:text-xs">
          <p><strong>💡 Duas formas de configurar o preço:</strong></p>
          <p><strong>A) Preço base R$0,00</strong> — coloque o preço cheio em cada item da proteína (Bisteca = R$15,99, Frango = R$16,99...)</p>
          <p><strong>B) Preço base = mais barato</strong> — coloque o preço do item mais barato no produto (R$15,99) e nos outros apenas a diferença (Bife a Parmegiana = +R$4,00)</p>
          <p className="text-blue-600 font-bold">⚠️ Não misture: se o produto tem preço base &gt; R$0, os adicionais devem ser só a diferença, não o preço cheio.</p>
        </div>

        {/* Lista de grupos */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 2xl:space-y-4 2xl:px-6 2xl:py-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>
          ) : grupos.length === 0 ? (
            <div className="text-center py-10 text-zinc-400">
              <Settings2 size={36} className="mx-auto mb-3 opacity-30"/>
              <p className="font-semibold">Nenhum grupo ainda</p>
              <p className="text-xs mt-1">Crie grupos abaixo para adicionar opções ao produto</p>
            </div>
          ) : gruposVisiveis.map(g => (
            <div key={g.id} className="border border-zinc-200 rounded-2xl overflow-hidden">

              {/* Cabeçalho do grupo — modo edição inline */}
              {editGrupo?.id === g.id ? (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input value={editGrupo.nome} onChange={e=>setEditGrupo(p=>p?{...p,nome:e.target.value}:p)}
                      className={`${inp} flex-1`} placeholder="Nome do grupo"/>
                    <select value={editGrupo.tipo} onChange={e=>setEditGrupo(p=>p?{...p,tipo:e.target.value}:p)} className={inp}>
                      <option value="radio">Escolha 1 (radio)</option>
                      <option value="checkbox">Múltipla escolha</option>
                      <option value="quantidade">Quantidade (+/-)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-zinc-500">Mín:</label>
                      <input type="number" min="0" max="10" value={editGrupo.min_selecoes}
                        onChange={e=>setEditGrupo(p=>p?{...p,min_selecoes:parseInt(e.target.value)||0}:p)}
                        className={`${inp} w-16`}/>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-zinc-500">Máx:</label>
                      <input type="number" min="1" max="20" value={editGrupo.max_selecoes}
                        onChange={e=>setEditGrupo(p=>p?{...p,max_selecoes:parseInt(e.target.value)||1}:p)}
                        className={`${inp} w-16`}/>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={()=>setEditGrupo(p=>p?{...p,obrigatorio:!p.obrigatorio}:p)}
                        className={`w-10 h-5 rounded-full relative transition-all ${editGrupo.obrigatorio?'bg-emerald-500':'bg-zinc-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-all ${editGrupo.obrigatorio?'left-5':'left-0.5'}`}/>
                      </div>
                      <span className="text-xs font-bold text-zinc-600">Obrigatório</span>
                    </label>
                    {/* Modo preço */}
                    <div className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-2 py-1">
                      <span className="text-[10px] font-bold text-amber-700">Preço:</span>
                      <button onClick={()=>setEditGrupo(p=>p?{...p,modo_preco:'adicional'}:p)}
                        className={`text-[10px] font-black px-2 py-0.5 rounded transition-all ${editGrupo.modo_preco!=='final'?'bg-amber-500 text-white':'text-zinc-400 hover:text-zinc-600'}`}>
                        +Adicional
                      </button>
                      <button onClick={()=>setEditGrupo(p=>p?{...p,modo_preco:'final'}:p)}
                        className={`text-[10px] font-black px-2 py-0.5 rounded transition-all ${editGrupo.modo_preco==='final'?'bg-amber-500 text-white':'text-zinc-400 hover:text-zinc-600'}`}>
                        Preço final
                      </button>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <button onClick={saveGrupo} disabled={saving} className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold">✓ Salvar</button>
                      <button onClick={()=>setEditGrupo(null)} className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 rounded-lg text-xs font-bold">Cancelar</button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Cabeçalho normal */
                <div className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${g.ativo ? 'bg-zinc-50' : 'bg-zinc-100'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Toggle liga/desliga grupo no delivery */}
                    <button
                      onClick={()=>toggleGrupoAtivo(g)}
                      title={g.ativo ? 'Grupo ativo no delivery — clique para desativar' : 'Grupo desativado no delivery — clique para ativar'}
                      className={`w-10 h-5 rounded-full relative shrink-0 transition-all focus:outline-none ${g.ativo?'bg-emerald-500':'bg-zinc-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${g.ativo?'left-5':'left-0.5'}`}/>
                    </button>
                    <div className={`flex items-center gap-2 flex-wrap ${!g.ativo?'opacity-50':''}`}>
                      <span className="font-black text-zinc-900 text-sm">{g.nome}</span>
                      <span className="text-[10px] font-bold bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full">{TIPO_LABELS[g.tipo]||g.tipo}</span>
                      {g.obrigatorio ? <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Obrigatório</span>
                        : <span className="text-[10px] font-bold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">Opcional</span>}
                      <span className="text-[10px] text-zinc-400">min:{g.min_selecoes} max:{g.max_selecoes}</span>
                      {g.modo_preco === 'final' && (
                        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Preço final</span>
                      )}
                      {!g.ativo && <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Desativado no delivery</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={()=>setEditGrupo({id:g.id,nome:g.nome,tipo:g.tipo,min_selecoes:g.min_selecoes,max_selecoes:g.max_selecoes,obrigatorio:!!g.obrigatorio,modo_preco:g.modo_preco||'adicional'})}
                      title="Editar grupo" className="p-1.5 hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all">
                      <Pencil size={14}/>
                    </button>
                    <button onClick={()=>delGrupo(g.id)} title="Remover grupo" className="p-1.5 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              )}

              {/* Itens do grupo */}
              <div className="divide-y divide-zinc-50">
                {g.itens.map(it => (
                  <div key={it.id} className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 transition-colors ${!it.ativo?'bg-zinc-50 opacity-60':''}`}>
                    {editItem?.id === it.id ? (
                      <>
                        <input value={editItem.nome} onChange={e=>setEditItem(p=>p?{...p,nome:e.target.value}:p)}
                          className={`${inp} flex-1 min-w-0`} placeholder="Nome"/>
                        <div className="flex flex-wrap items-center gap-2">
                          <input value={editItem.preco} onChange={e=>setEditItem(p=>p?{...p,preco:e.target.value}:p)}
                            type="number" step="0.01" min="0" className={`${inp} w-full sm:w-24 min-w-0`} placeholder="R$ adicional"/>
                          <button type="button" onClick={saveItem} className="px-3 py-2 min-h-[40px] bg-emerald-500 text-white rounded-lg text-xs font-bold">✓</button>
                          <button type="button" onClick={()=>setEditItem(null)} className="px-3 py-2 min-h-[40px] bg-zinc-200 rounded-lg text-xs font-bold">✕</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start gap-2 sm:gap-3 min-w-0 w-full">
                          {/* Toggle ativo/inativo no delivery */}
                          <button
                            type="button"
                            onClick={()=>toggleItemAtivo(it)}
                            title={it.ativo ? 'Visível no delivery — clique para ocultar' : 'Oculto no delivery — clique para mostrar'}
                            className={`w-9 h-5 rounded-full relative shrink-0 mt-0.5 transition-all focus:outline-none ${it.ativo?'bg-emerald-500':'bg-zinc-300'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-all ${it.ativo?'left-4':'left-0.5'}`}/>
                          </button>
                          <p className={`flex-1 min-w-0 text-sm font-medium break-words ${it.ativo?'text-zinc-700':'text-zinc-400 line-through'}`}>{it.nome}</p>
                          <span className={`text-xs font-bold shrink-0 ${it.preco_adicional>0?'text-emerald-600':'text-zinc-400'}`}>{fmtR(it.preco_adicional)}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button type="button" onClick={()=>setEditItem({id:it.id,nome:it.nome,preco:String(it.preco_adicional)})} className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-zinc-100 text-zinc-300 hover:text-zinc-600 rounded-lg"><Pencil size={12}/></button>
                            <button type="button" onClick={()=>delItem(it.id)} className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg"><Trash2 size={12}/></button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {/* Adicionar item */}
                <div className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 bg-zinc-50/50">
                  <input value={novoItem[g.id]?.nome||''} onChange={e=>setNovoItem(p=>({...p,[g.id]:{...p[g.id],nome:e.target.value}}))}
                    placeholder="Nome do item" className={`${inp} flex-1 min-w-0`}
                    onKeyDown={e=>e.key==='Enter'&&addItem(g.id)}/>
                  <input value={novoItem[g.id]?.preco||''} onChange={e=>setNovoItem(p=>({...p,[g.id]:{...p[g.id],preco:e.target.value}}))}
                    type="number" step="0.01" min="0" placeholder="R$ adicional" className={`${inp} w-full sm:w-28 min-w-0`}/>
                  <button type="button" onClick={()=>addItem(g.id)} disabled={!novoItem[g.id]?.nome?.trim()}
                    className="px-3 py-2.5 min-h-[44px] bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-200 text-white rounded-lg text-xs font-bold transition-all shrink-0">
                    + Item
                  </button>
                </div>
              </div>
            </div>
          ))}
          {hasMoreGrupos && (
            <div className="flex justify-center py-4">
              <button onClick={loadMoreGrupos}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition-all">
                Carregar mais (+10) — {gruposVisiveis.length} de {totalGrupos} grupos
              </button>
            </div>
          )}
        </div>

        {/* Adicionar novo grupo */}
        <div className="shrink-0 space-y-2 border-t border-zinc-100 bg-zinc-50/50 px-3 py-3 sm:px-5 2xl:space-y-3 2xl:px-6 2xl:py-4">
          <p className="text-xs font-black text-zinc-500 uppercase tracking-wider">Novo grupo de opções</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
            <input value={novoGrupo.nome} onChange={e=>setNovoGrupo(p=>({...p,nome:e.target.value}))}
              placeholder="Nome do grupo (ex: Acompanhamentos)" className={`${inp} flex-1 min-w-0 sm:min-w-40`}/>
            <select value={novoGrupo.tipo} onChange={e=>setNovoGrupo(p=>({...p,tipo:e.target.value}))} className={`${inp} w-full sm:w-auto min-h-[44px]`}>
              <option value="radio">Escolha 1 (radio)</option>
              <option value="checkbox">Múltipla escolha</option>
              <option value="quantidade">Quantidade (+/-)</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-zinc-500">Mín:</label>
                <input type="number" min="0" max="10" value={novoGrupo.min_selecoes} onChange={e=>setNovoGrupo(p=>({...p,min_selecoes:parseInt(e.target.value)||0}))} className={`${inp} w-16 min-h-[44px]`}/>
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-zinc-500">Máx:</label>
                <input type="number" min="1" max="20" value={novoGrupo.max_selecoes} onChange={e=>setNovoGrupo(p=>({...p,max_selecoes:parseInt(e.target.value)||1}))} className={`${inp} w-16 min-h-[44px]`}/>
              </div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <div onClick={()=>setNovoGrupo(p=>({...p,obrigatorio:!p.obrigatorio}))}
                  className={`w-10 h-5 rounded-full relative transition-all shrink-0 ${novoGrupo.obrigatorio?'bg-emerald-500':'bg-zinc-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-all ${novoGrupo.obrigatorio?'left-5':'left-0.5'}`}/>
                </div>
                <span className="text-xs font-bold text-zinc-600">Obrigatório</span>
              </label>
            </div>
            <button onClick={addGrupo} disabled={!novoGrupo.nome.trim()||saving}
              className="w-full sm:w-auto sm:ml-auto px-5 py-2.5 min-h-[44px] bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5">
              <Plus size={14}/> Criar grupo
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 shrink-0">
          <button type="button" onClick={onClose} className="w-full py-3 min-h-[44px] bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold transition-all">
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
