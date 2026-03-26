// Modal de opções / variações — compartilhado entre cardápio online (delivery) e PDV / balcão.
import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Minus, AlertCircle } from 'lucide-react';
import { useDeliveryCardapioTheme } from '../segments/delivery/DeliveryCardapioThemeContext';

export interface OpcaoItem { id: number; nome: string; preco_adicional: number; }
export interface GrupoOpcao {
  id: number; nome: string; tipo: 'radio' | 'checkbox' | 'quantidade';
  min_selecoes: number; max_selecoes: number; obrigatorio: boolean;
  modo_preco?: 'adicional' | 'final';
  itens: OpcaoItem[];
}
export interface VariacaoVendavel { id: number; nome: string; preco: number; }
export interface ProductOptionsProduto {
  id: number;
  name: string;
  price: number;
  category: string;
  photo_url?: string;
  description?: string;
  descricao?: string;
  destaque?: number;
  em_promocao?: number | boolean;
  preco_original?: number | null;
  grupos_opcao?: GrupoOpcao[];
  variacoes_vendaveis?: VariacaoVendavel[];
}
export type Selecoes = Record<number, Record<number, number>>;

export interface ProductOptionsCartItem extends ProductOptionsProduto {
  qty: number;
  selecoes?: Selecoes;
  preco_final: number;
  obs_opcoes?: string;
  cart_key: string;
  variation_id?: number | null;
}

const fmt = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

function getProdutoDescricao(produto: ProductOptionsProduto) {
  return String(produto.description || produto.descricao || '').trim();
}

function hasVariacoesVendaveis(produto: ProductOptionsProduto) {
  return !!(produto.variacoes_vendaveis && produto.variacoes_vendaveis.length > 0);
}

function isPromocaoProdutoValida(produto: ProductOptionsProduto) {
  const precoOriginal = Number(produto.preco_original || 0);
  return !hasVariacoesVendaveis(produto)
    && Boolean(produto.em_promocao)
    && Number.isFinite(precoOriginal)
    && precoOriginal > Number(produto.price || 0);
}

function getPercentualDesconto(produto: ProductOptionsProduto) {
  if (!isPromocaoProdutoValida(produto)) return 0;
  const precoOriginal = Number(produto.preco_original || 0);
  const precoAtual = Number(produto.price || 0);
  return Math.max(0, Math.round(((precoOriginal - precoAtual) / precoOriginal) * 100));
}

function gerarSelecaoInicial(grupos: GrupoOpcao[]): Selecoes {
  const sel: Selecoes = {};
  for (const g of grupos) {
    if (!g.obrigatorio || g.tipo !== 'radio' || !g.itens.length) continue;
    const maisBarato = g.itens.reduce((a, b) => a.preco_adicional <= b.preco_adicional ? a : b);
    sel[g.id] = { [maisBarato.id]: 1 };
  }
  return sel;
}

function gerarCartKey(prodId: number, selecoes: Selecoes): string {
  const partes = Object.entries(selecoes).map(([gId, itens]) =>
    `${gId}:${Object.entries(itens).filter(([, q]) => q > 0).map(([iId, q]) => `${iId}x${q}`).join(',')}`
  ).join('|');
  return `${prodId}_${partes}`;
}

function calcPrecoUnitario(grupos: GrupoOpcao[], selecoes: Selecoes, precoBase: number): number {
  let substitutoFinal = 0;
  let temGrupoFinalComSelecao = false;
  let somaAdicional = 0;
  for (const g of grupos) {
    const itensSel: Record<number, number> = selecoes[g.id] || {};
    if (g.modo_preco === 'final') {
      let grupoSoma = 0;
      let temSelNesteGrupo = false;
      for (const item of g.itens) {
        const qty = (itensSel[item.id] as number) || 0;
        if (qty > 0) {
          temSelNesteGrupo = true;
          grupoSoma += Number(item.preco_adicional || 0) * qty;
        }
      }
      if (temSelNesteGrupo) {
        temGrupoFinalComSelecao = true;
        substitutoFinal += grupoSoma;
      }
    } else {
      for (const item of g.itens) {
        const qty = (itensSel[item.id] as number) || 0;
        somaAdicional += item.preco_adicional * qty;
      }
    }
  }
  if (temGrupoFinalComSelecao) {
    return substitutoFinal + somaAdicional;
  }
  return precoBase + somaAdicional;
}

function descreverSelecoes(grupos: GrupoOpcao[], selecoes: Selecoes): string {
  const partes: string[] = [];
  for (const g of grupos) {
    const itensSel: Record<number, number> = selecoes[g.id] || {};
    const selecionados = g.itens.filter(it => ((itensSel[it.id] as number) || 0) > 0)
      .map(it => g.tipo === 'quantidade' && ((itensSel[it.id] as number) || 0) > 1
        ? `${it.nome} x${itensSel[it.id]}`
        : it.nome);
    if (selecionados.length) partes.push(`${g.nome}: ${selecionados.join(', ')}`);
  }
  return partes.join(' | ');
}

function getTotalSelecionadoGrupo(selecaoGrupo: Record<number, number>) {
  return Object.values(selecaoGrupo).reduce((acc, qty) => acc + Number(qty || 0), 0);
}

function getMinSelecoesGrupo(grupo: GrupoOpcao) {
  return Math.max(0, Number(grupo.min_selecoes || 0));
}

function getMaxSelecoesGrupo(grupo: GrupoOpcao) {
  const max = Math.max(0, Number(grupo.max_selecoes || 0));
  return max > 0 ? max : null;
}

function isGrupoCompleto(grupo: GrupoOpcao, selecaoGrupo: Record<number, number>) {
  if (!grupo.obrigatorio) return true;
  return getTotalSelecionadoGrupo(selecaoGrupo) >= getMinSelecoesGrupo(grupo);
}

function getGrupoRegraTexto(grupo: GrupoOpcao) {
  const min = getMinSelecoesGrupo(grupo);
  const max = getMaxSelecoesGrupo(grupo);

  if (grupo.tipo === 'radio') {
    return grupo.obrigatorio ? 'Escolha 1 opcao obrigatoria.' : 'Escolha 1 opcao se quiser.';
  }

  if (grupo.tipo === 'quantidade') {
    if (min > 0 && max !== null) return `Escolha entre ${min} e ${max} itens.`;
    if (min > 0) return `Escolha no minimo ${min} itens.`;
    if (max !== null) return `Escolha ate ${max} itens.`;
    return 'Escolha a quantidade que fizer sentido para o pedido.';
  }

  if (min > 0 && max !== null) return `Escolha entre ${min} e ${max} itens.`;
  if (min > 0) return `Escolha no minimo ${min} itens.`;
  if (max !== null) return `Escolha ate ${max} itens.`;
  return 'Escolha quantos itens quiser.';
}

function getResumoSelecaoGrupo(grupo: GrupoOpcao, totalSelecionado: number) {
  const max = getMaxSelecoesGrupo(grupo);

  if (grupo.tipo === 'radio') {
    return totalSelecionado > 0 ? '1 opcao escolhida' : 'Nenhuma opcao escolhida';
  }

  if (max !== null) {
    return `${totalSelecionado} de ${max} selecionados`;
  }

  if (totalSelecionado === 1) return '1 item selecionado';
  return `${totalSelecionado} itens selecionados`;
}

function getPrecoItemLabel(grupo: GrupoOpcao, item: OpcaoItem) {
  if ((grupo.modo_preco || 'adicional') === 'final') {
    return item.preco_adicional > 0 ? `Preco final ${fmt(item.preco_adicional)}` : 'Preco final incluso';
  }
  return item.preco_adicional > 0 ? `+${fmt(item.preco_adicional)}` : 'Incluso';
}

export type ProductOptionsDestination = 'sacola' | 'pedido';

/** `delivery` = paleta do cardápio online (cyan). `pos` = balcão/PDV (âmbar, alinhado ao POSScreen). */
export type ProductOptionsVisualVariant = 'delivery' | 'pos';

type ModalAccentClasses = {
  badgeVariacoesCount: string;
  precoAtual: string;
  statusProntoVariacao: string;
  rowVariacaoSel: string;
  precoVariacaoLinha: string;
  radioVariacaoOn: string;
  radioVariacaoDot: string;
  badgeGrupoCompleto: string;
  badgePrecoFinal: string;
  rowItemSel: string;
  precoItemDestaque: string;
  radioGrupoOn: string;
  radioGrupoDot: string;
  checkboxOn: string;
  checkboxMark: string;
  qtdStepPlusSm: string;
  textareaFocus: string;
  footerResumoOkBorder: string;
  footerResumoOkTitle: string;
  footerResumoOkSub: string;
};

function getModalAccent(isLightRed: boolean, visualVariant: ProductOptionsVisualVariant): ModalAccentClasses {
  if (isLightRed) {
    return {
      badgeVariacoesCount: 'border-red-400/35 bg-red-500/15 text-red-100',
      precoAtual: 'text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.22)]',
      statusProntoVariacao: 'border border-red-400/35 bg-red-500/15 text-red-100',
      rowVariacaoSel: 'bg-red-500/[0.16] ring-1 ring-inset ring-red-400/40',
      precoVariacaoLinha: 'text-red-300',
      radioVariacaoOn: 'border-red-400 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)]',
      radioVariacaoDot: 'bg-white',
      badgeGrupoCompleto: 'border border-red-400/35 bg-red-500/15 text-red-100',
      badgePrecoFinal: 'border-red-400/35 bg-red-500/15 text-red-100',
      rowItemSel: 'bg-red-500/[0.16] ring-1 ring-inset ring-red-400/40',
      precoItemDestaque: 'text-red-300',
      radioGrupoOn: 'border-red-400 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)]',
      radioGrupoDot: 'bg-white',
      checkboxOn: 'border-red-400 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.32)]',
      checkboxMark: 'text-white',
      qtdStepPlusSm: 'bg-red-500 text-white hover:bg-red-400',
      textareaFocus: 'border-white/14 bg-zinc-950 focus:border-red-400 focus:ring-red-500/25',
      footerResumoOkBorder: 'border-red-500/30 bg-red-500/12',
      footerResumoOkTitle: 'text-red-100',
      footerResumoOkSub: 'text-red-200/90',
    };
  }
  if (visualVariant === 'pos') {
    return {
      badgeVariacoesCount: 'border-amber-500/40 bg-amber-500/15 text-amber-100',
      precoAtual: 'text-amber-300 drop-shadow-[0_0_22px_rgba(251,191,36,0.28)]',
      statusProntoVariacao: 'border border-amber-500/35 bg-amber-500/20 text-amber-50',
      rowVariacaoSel: 'bg-amber-500/[0.15] ring-1 ring-inset ring-amber-400/40',
      precoVariacaoLinha: 'text-amber-300',
      radioVariacaoOn: 'border-amber-400 bg-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.45)]',
      radioVariacaoDot: 'bg-zinc-950',
      badgeGrupoCompleto: 'border border-amber-500/35 bg-amber-500/18 text-amber-50',
      badgePrecoFinal: 'border-amber-500/35 bg-amber-500/15 text-amber-100',
      rowItemSel: 'bg-amber-500/[0.14] ring-1 ring-inset ring-amber-400/35',
      precoItemDestaque: 'text-amber-300',
      radioGrupoOn: 'border-amber-400 bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
      radioGrupoDot: 'bg-zinc-950',
      checkboxOn: 'border-amber-400 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.38)]',
      checkboxMark: 'text-zinc-950',
      qtdStepPlusSm: 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
      textareaFocus: 'border-white/14 bg-zinc-950 focus:border-amber-500 focus:ring-amber-400/35',
      footerResumoOkBorder: 'border-amber-500/35 bg-amber-500/12',
      footerResumoOkTitle: 'text-amber-100',
      footerResumoOkSub: 'text-amber-200/90',
    };
  }
  return {
    badgeVariacoesCount: 'border-cyan-500/25 bg-cyan-500/12 text-cyan-100',
    precoAtual: 'text-cyan-200 drop-shadow-[0_0_18px_rgba(34,211,238,0.25)]',
    statusProntoVariacao: 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
    rowVariacaoSel: 'bg-cyan-500/[0.14] ring-1 ring-inset ring-cyan-400/30',
    precoVariacaoLinha: 'text-cyan-200',
    radioVariacaoOn: 'border-cyan-300 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.45)]',
    radioVariacaoDot: 'bg-zinc-950',
    badgeGrupoCompleto: 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
    badgePrecoFinal: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
    rowItemSel: 'bg-cyan-500/[0.14] ring-1 ring-inset ring-cyan-400/25',
    precoItemDestaque: 'text-cyan-200',
    radioGrupoOn: 'border-cyan-300 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]',
    radioGrupoDot: 'bg-zinc-950',
    checkboxOn: 'border-cyan-300 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.35)]',
    checkboxMark: 'text-zinc-950',
    qtdStepPlusSm: 'bg-cyan-400 text-zinc-950 hover:bg-cyan-300',
    textareaFocus: 'border-white/14 bg-zinc-950 focus:border-cyan-400 focus:ring-cyan-400/30',
    footerResumoOkBorder: 'border-cyan-500/25 bg-cyan-500/10',
    footerResumoOkTitle: 'text-cyan-100',
    footerResumoOkSub: 'text-cyan-100/85',
  };
}

const POS_MODAL_OPCOES_OVERRIDES = {
  sheet:
    'relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[32px] border border-white/16 bg-zinc-950 text-zinc-100 shadow-[0_32px_90px_rgba(0,0,0,0.58)] ring-1 ring-amber-500/25 sm:rounded-[32px]',
  footerBtn:
    'flex w-full min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-400 py-4 text-sm font-black text-zinc-900 shadow-[0_14px_36px_rgba(245,158,11,0.4)] transition-all hover:bg-amber-300 active:scale-[0.99] disabled:opacity-40 ring-2 ring-amber-400/45 hover:ring-amber-400/60',
  qtyBtnPlus:
    'flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-zinc-950 shadow-[0_10px_22px_rgba(245,158,11,0.32)] transition-colors hover:bg-amber-400',
} as const;

export function ProductOptionsModal({
  produto,
  onClose,
  onAdicionar,
  addDestination = 'sacola',
  visualVariant = 'delivery',
}: {
  produto: ProductOptionsProduto;
  onClose: () => void;
  onAdicionar: (item: ProductOptionsCartItem) => void;
  addDestination?: ProductOptionsDestination;
  visualVariant?: ProductOptionsVisualVariant;
}) {
  const mTh = useDeliveryCardapioTheme();
  const mo = useMemo(() => {
    const base = mTh.modalOpcoes;
    if (visualVariant !== 'pos') return base;
    return { ...base, ...POS_MODAL_OPCOES_OVERRIDES };
  }, [mTh.modalOpcoes, visualVariant]);
  const ac = getModalAccent(mTh.mode === 'light_red', visualVariant);
  const destSacola = addDestination === 'sacola';
  const addWord = destSacola ? 'sacola' : 'pedido';

  const variacoesLista = useMemo(
    () => (produto.variacoes_vendaveis || []).filter((v: VariacaoVendavel) => v?.id && Number(v.preco) >= 0),
    [produto.variacoes_vendaveis]
  );
  const modoSomenteVariacoes = variacoesLista.length > 0;
  const gruposOpcaoProduto = produto.grupos_opcao || [];
  const grupos = modoSomenteVariacoes ? [] : gruposOpcaoProduto;
  const [variacaoSel, setVariacaoSel] = useState<VariacaoVendavel | null>(null);
  const [selecoes, setSelecoes] = useState<Selecoes>(() => gerarSelecaoInicial(hasVariacoesVendaveis(produto) ? [] : gruposOpcaoProduto));
  const [obs, setObs] = useState('');
  const [qty, setQty] = useState(1);
  const [erros, setErros] = useState<Record<number, string>>({});
  const descricaoProduto = getProdutoDescricao(produto);
  const promoValida = isPromocaoProdutoValida(produto);
  const percentualDesconto = getPercentualDesconto(produto);

  const precoUnitOpcoes = calcPrecoUnitario(grupos, selecoes, produto.price);
  const precoUnit = modoSomenteVariacoes
    ? (variacaoSel ? Number(variacaoSel.preco) : null)
    : precoUnitOpcoes;
  const precoTotal = (precoUnit ?? 0) * qty;
  const temGrupoPrecoFinal = grupos.some((grupo) => (grupo.modo_preco || 'adicional') === 'final');
  const gruposObrigatoriosPendentes = modoSomenteVariacoes
    ? (variacaoSel ? 0 : 1)
    : grupos.filter((grupo) => !isGrupoCompleto(grupo, selecoes[grupo.id] || {})).length;
  const resumoPrecoUnitario = modoSomenteVariacoes
    ? `Cada opcao abaixo tem preco proprio. Selecione uma antes de adicionar à ${addWord}.`
    : temGrupoPrecoFinal
      ? 'Algumas escolhas definem o preco final do item antes dos adicionais extras.'
      : precoUnitOpcoes > produto.price
        ? `Base ${fmt(produto.price)} + adicionais ${fmt(precoUnitOpcoes - produto.price)} por unidade.`
        : 'Nenhum adicional pago selecionado por enquanto.';

  const toggleRadio = (grupoId: number, itemId: number) => {
    setSelecoes(prev => ({ ...prev, [grupoId]: { [itemId]: 1 } }));
    setErros(prev => { const n = { ...prev }; delete n[grupoId]; return n; });
  };

  const toggleCheck = (grupoId: number, itemId: number, grupo: GrupoOpcao) => {
    setSelecoes(prev => {
      const cur: Record<number, number> = { ...(prev[grupoId] || {}) };
      if (cur[itemId]) { delete cur[itemId]; }
      else {
        const total = Object.values(cur).reduce((a, v) => a + (v as number), 0);
        const maxSelecoes = getMaxSelecoesGrupo(grupo);
        if (maxSelecoes !== null && total >= maxSelecoes) return prev;
        cur[itemId] = 1;
      }
      return { ...prev, [grupoId]: cur };
    });
    setErros(prev => { const n = { ...prev }; delete n[grupoId]; return n; });
  };

  const setQtdItem = (grupoId: number, itemId: number, delta: number, grupo: GrupoOpcao) => {
    setSelecoes(prev => {
      const cur: Record<number, number> = { ...(prev[grupoId] || {}) };
      const novaQtd = Math.max(0, (cur[itemId] || 0) + delta);
      const totalSemEste = Object.entries(cur).filter(([id]) => Number(id) !== itemId).reduce((a, [, v]) => a + (v as number), 0);
      const maxSelecoes = getMaxSelecoesGrupo(grupo);
      if (delta > 0 && maxSelecoes !== null && totalSemEste + novaQtd > maxSelecoes) return prev;
      if (novaQtd === 0) delete cur[itemId]; else cur[itemId] = novaQtd;
      return { ...prev, [grupoId]: cur };
    });
  };

  const validarEAdicionar = () => {
    if (modoSomenteVariacoes) {
      if (!variacaoSel) return;
      const cartKey = `${produto.id}_v${variacaoSel.id}`;
      const name = `${produto.name} - ${variacaoSel.nome}`;
      const obsTxt = obs.trim();
      onAdicionar({
        ...produto,
        name,
        qty,
        preco_final: Number(variacaoSel.preco),
        cart_key: cartKey,
        variation_id: variacaoSel.id,
        obs_opcoes: obsTxt || undefined,
      });
      return;
    }
    const novosErros: Record<number, string> = {};
    for (const g of grupos) {
      if (!g.obrigatorio) continue;
      const sel: Record<number, number> = selecoes[g.id] || {};
      const total = Object.values(sel).reduce((a, v) => a + (v as number), 0);
      if (total < g.min_selecoes) {
        novosErros[g.id] = g.tipo === 'radio'
          ? 'Selecione uma opção'
          : `Selecione no mínimo ${g.min_selecoes} item(ns)`;
      }
    }
    if (Object.keys(novosErros).length) { setErros(novosErros); return; }
    const obsOpcoes = descreverSelecoes(grupos, selecoes);
    const cartKey = gerarCartKey(produto.id, selecoes) + (obs ? `_${obs.substring(0, 20)}` : '');
    onAdicionar({
      ...produto, qty, selecoes,
      preco_final: precoUnitOpcoes,
      obs_opcoes: [obsOpcoes, obs].filter(Boolean).join(' | '),
      cart_key: cartKey,
    });
  };

  const readyTitle = gruposObrigatoriosPendentes > 0
    ? (modoSomenteVariacoes
      ? 'Escolha uma opcao abaixo.'
      : `Faltam ${gruposObrigatoriosPendentes} grupo${gruposObrigatoriosPendentes > 1 ? 's' : ''} obrigatorio${gruposObrigatoriosPendentes > 1 ? 's' : ''}.`)
    : (destSacola ? 'Pedido pronto para ir para a sacola.' : 'Pronto para adicionar ao pedido atual.');
  const readyHint = gruposObrigatoriosPendentes > 0
    ? (modoSomenteVariacoes
      ? `Toque na variacao desejada antes de adicionar à ${addWord}.`
      : 'Complete as escolhas obrigatorias para continuar.')
    : (destSacola ? 'Revise a quantidade e confirme para adicionar.' : 'Revise a quantidade e confirme para enviar ao pedido.');

  const addBtnLabel = gruposObrigatoriosPendentes > 0
    ? (modoSomenteVariacoes ? 'Escolher opcao' : 'Revisar adicionais')
    : (destSacola ? `Adicionar a sacola${qty > 1 ? ` (${qty}x)` : ''}` : `Adicionar ao pedido${qty > 1 ? ` (${qty}x)` : ''}`);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className={mo.sheet}>

        <div className={mo.headerBg}>
          <button type="button" onClick={onClose} className={mo.closeBtn}>
            <X size={18} />
          </button>
          {produto.photo_url ? (
            <div className="relative h-44 overflow-hidden sm:h-52">
              <img src={produto.photo_url} alt={produto.name} className="h-full w-full object-cover brightness-[1.03] contrast-[1.02]" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/55 to-black/10" />
            </div>
          ) : null}

          <div className={`space-y-4 p-5 ${produto.photo_url ? '' : 'pr-16'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={mo.title}>{produto.name}</h3>
                {descricaoProduto && <p className={mo.desc}>{descricaoProduto}</p>}
              </div>
              {modoSomenteVariacoes ? (
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${ac.badgeVariacoesCount}`}>
                  {variacoesLista.length} opc{variacoesLista.length > 1 ? 'oes' : 'ao'}
                </span>
              ) : grupos.length > 0 ? (
                <span className="shrink-0 rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-100">
                  {grupos.length} grupo{grupos.length > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>

            <div className={promoValida ? mo.pricePanelPromo : mo.pricePanel}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${mo.textMuted}`}>Preco base</p>
                  <p className={`mt-1 text-xl font-black tabular-nums ${promoValida ? 'text-zinc-400 line-through decoration-zinc-500' : mo.textPrimary}`}>{fmt(produto.price)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${mo.textMuted}`}>Preco atual</p>
                  {precoUnit == null ? (
                    <p className={`mt-1 text-xl font-black ${mo.textMuted}`}>—</p>
                  ) : (
                    <p className={`mt-1 text-xl font-black tabular-nums ${promoValida ? 'text-emerald-400' : ac.precoAtual}`}>{fmt(precoUnit)}</p>
                  )}
                </div>
              </div>
              <p className={`mt-2 text-xs leading-relaxed ${mo.textSecondary}`}>{resumoPrecoUnitario}</p>
              {promoValida && (
                <p className="mt-2 text-xs font-bold leading-snug text-emerald-200/95">
                  ✨ Oferta ativa: {percentualDesconto}% de economia em relacao ao preco original.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className={mo.scroll}>
          {modoSomenteVariacoes ? (
            <section className={mo.section}>
              <div className={mo.sectionHeader}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black tracking-tight text-white">Escolha a variacao</p>
                    <p className="mt-1 text-sm leading-snug text-zinc-200">Obrigatorio — selecione 1 opcao para continuar.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                    variacaoSel
                      ? ac.statusProntoVariacao
                      : 'border border-amber-500/30 bg-amber-500/15 text-amber-100'
                  }`}>
                    {variacaoSel ? 'Pronto' : 'Obrigatorio'}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-white/5 bg-zinc-950/70">
                {variacoesLista.map((v) => {
                  const selecionado = variacaoSel?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setVariacaoSel(v)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setVariacaoSel(v);
                        }
                      }}
                      className={`flex cursor-pointer items-center gap-4 px-4 py-4 transition-colors ${
                        selecionado
                          ? ac.rowVariacaoSel
                          : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold leading-snug ${selecionado ? 'text-white' : 'text-zinc-100'}`}>{v.nome}</p>
                        <p className={`mt-1 text-xs font-bold tabular-nums ${ac.precoVariacaoLinha}`}>{fmt(Number(v.preco))}</p>
                      </div>
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        selecionado
                          ? ac.radioVariacaoOn
                          : 'border-zinc-500'
                      }`}>
                        {selecionado && <div className={`h-2 w-2 rounded-full ${ac.radioVariacaoDot}`} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            grupos.map(g => {
              const sel: Record<number, number> = selecoes[g.id] || {};
              const totalSel = getTotalSelecionadoGrupo(sel);
              const temErro = !!erros[g.id];
              const completo = isGrupoCompleto(g, sel);
              const maxSelecoes = getMaxSelecoesGrupo(g);
              return (
                <section key={g.id} className={`mx-4 mb-4 overflow-hidden rounded-[24px] border shadow-[0_12px_36px_rgba(0,0,0,0.2)] ${
                  temErro ? 'border-red-500/40 bg-red-500/10' : 'border-white/14 bg-zinc-900/85'
                }`}>
                  <div className="border-b border-white/12 bg-zinc-900/95 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-black tracking-tight text-white">{g.nome}</p>
                        <p className={`mt-1 text-sm leading-snug ${temErro ? 'text-red-200' : 'text-zinc-200'}`}>{getGrupoRegraTexto(g)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                        completo
                          ? ac.badgeGrupoCompleto
                          : g.obrigatorio
                            ? 'border border-amber-500/30 bg-amber-500/15 text-amber-100'
                            : 'border border-white/14 bg-white/10 text-zinc-100'
                      }`}>
                        {completo ? 'Pronto' : g.obrigatorio ? 'Obrigatorio' : 'Opcional'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        g.obrigatorio
                          ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
                          : 'border-white/14 bg-white/10 text-zinc-100'
                      }`}>
                        {g.obrigatorio ? 'Obrigatorio' : 'Opcional'}
                      </span>
                      <span className="rounded-full border border-white/14 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-100">
                        {getResumoSelecaoGrupo(g, totalSel)}
                      </span>
                      {(g.modo_preco || 'adicional') === 'final' && (
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ac.badgePrecoFinal}`}>
                          Preco definido pela escolha
                        </span>
                      )}
                    </div>
                  </div>
                  {temErro && (
                    <div className="flex items-center gap-1.5 border-b border-red-500/25 bg-red-500/10 px-4 py-2">
                      <AlertCircle size={11} className="shrink-0 text-red-400" />
                      <p className="text-xs font-semibold text-red-100">{erros[g.id]}</p>
                    </div>
                  )}

                  <div className="divide-y divide-white/5 bg-zinc-950/70">
                    {g.itens.map(item => {
                      const qtdItem = sel[item.id] || 0;
                      const selecionado = qtdItem > 0;
                      const limiteAtingido = maxSelecoes !== null && totalSel >= maxSelecoes;
                      const bloqueado = !selecionado && (g.tipo === 'checkbox' || g.tipo === 'quantidade') && limiteAtingido;
                      const podeAumentarQuantidade = maxSelecoes === null || totalSel < maxSelecoes;
                      return (
                        <div key={item.id}
                          className={`flex cursor-pointer items-center gap-4 px-4 py-4 transition-colors ${
                            selecionado
                              ? ac.rowItemSel
                              : bloqueado
                                ? 'opacity-70'
                                : 'hover:bg-white/[0.06]'
                          }`}
                          onClick={() => {
                            if (g.tipo === 'radio') toggleRadio(g.id, item.id);
                            else if (g.tipo === 'checkbox') toggleCheck(g.id, item.id, g);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold leading-snug ${selecionado ? 'text-white' : 'text-zinc-100'}`}>
                              {item.nome}
                            </p>
                            <p className={`mt-1 text-xs font-bold ${
                              (g.modo_preco || 'adicional') === 'final' || item.preco_adicional > 0
                                ? ac.precoItemDestaque
                                : 'text-zinc-300'
                            }`}>
                              {getPrecoItemLabel(g, item)}
                            </p>
                            {bloqueado && <p className="mt-1 text-[11px] text-amber-200">Limite do grupo atingido.</p>}
                          </div>

                          {g.tipo === 'radio' && (
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                              selecionado
                                ? ac.radioGrupoOn
                                : 'border-zinc-500'
                            }`}>
                              {selecionado && <div className={`h-2 w-2 rounded-full ${ac.radioGrupoDot}`} />}
                            </div>
                          )}
                          {g.tipo === 'checkbox' && (
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                              selecionado
                                ? ac.checkboxOn
                                : 'border-zinc-500'
                            }`}>
                              {selecionado && <span className={`text-[10px] font-black leading-none ${ac.checkboxMark}`}>✓</span>}
                            </div>
                          )}
                          {g.tipo === 'quantidade' && (
                            <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-zinc-900 p-1"
                              onClick={e => e.stopPropagation()}>
                              <button type="button" onClick={e => { e.stopPropagation(); setQtdItem(g.id, item.id, -1, g); }}
                                disabled={qtdItem === 0}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition-all hover:bg-white/14 hover:text-rose-300 disabled:cursor-not-allowed disabled:text-zinc-600">
                                <Minus size={11} />
                              </button>
                              <span className="w-6 text-center text-sm font-black text-white">{qtdItem}</span>
                              <button type="button" onClick={e => { e.stopPropagation(); setQtdItem(g.id, item.id, +1, g); }}
                                disabled={!podeAumentarQuantidade}
                                className={`flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 ${ac.qtdStepPlusSm}`}>
                                <Plus size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}

          <div className="mx-4 mt-1 rounded-[28px] border border-white/14 bg-zinc-900/85 px-5 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
            <p className="mb-2 text-sm font-bold text-zinc-50">Alguma observação?</p>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Ex: Sem cebola, ponto bem passado..."
              className={`w-full resize-none rounded-2xl border px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${ac.textareaFocus}`} />
          </div>
        </div>

        <div className={mo.footer}>
          <div className={`mb-3 rounded-[22px] border px-4 py-3 ${
            gruposObrigatoriosPendentes > 0
              ? 'border-amber-500/25 bg-amber-500/12'
              : ac.footerResumoOkBorder
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm font-black ${
                  gruposObrigatoriosPendentes > 0
                    ? 'text-amber-100'
                    : ac.footerResumoOkTitle
                }`}>
                  {readyTitle}
                </p>
                <p className={`mt-1 text-xs ${
                  gruposObrigatoriosPendentes > 0
                    ? 'text-amber-200/90'
                    : ac.footerResumoOkSub
                }`}>
                  {readyHint}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-200">Unitario</p>
                <p className="mt-1 text-sm font-black tabular-nums text-white">{precoUnit != null ? fmt(precoUnit) : '—'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={mo.qtyBar}>
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className={mo.qtyBtn}>
                <Minus size={13} />
              </button>
              <span className={`w-7 text-center text-base font-black ${mo.textPrimary}`}>{qty}</span>
              <button type="button" onClick={() => setQty(q => q + 1)} className={mo.qtyBtnPlus}>
                <Plus size={13} />
              </button>
            </div>
            <button type="button" onClick={validarEAdicionar}
              className={mo.footerBtn}>
              <span>{addBtnLabel}</span>
              <span className="tabular-nums">{precoUnit != null ? fmt(precoTotal) : '—'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
