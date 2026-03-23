import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2, ShoppingBag,
  X, Search, Printer, Barcode, ScanLine,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, OrderItem, PaymentMethod } from '../types';
import { getSegCfg } from '../config/segmentos';
import type { TipoItem } from '../config/segmentos';
import MesaPickerModal from '../segments/bar/MesaPickerModal';
import { normalizeBarcode } from '../utils/barcode';
import { openPrintPreview } from '../utils/print';
import { resolveRequiresPreparation } from '../utils/preparation';
import { useDebounce } from '../hooks/useDebounce';

// ── Constantes de estilo ──────────────────────────────────────────────────────
const PAY_METHODS: PaymentMethod[] = ['Dinheiro', 'PIX', 'Débito', 'Crédito'];

const PAY_ICON: Record<string, string> = {
  Dinheiro: '💵',
  PIX:      '⚡',
  Débito:   '💳',
  Crédito:  '💳',
};

// ─── ProductCard memoizado para evitar re-renders desnecessários ─────────────
const ProductCard = React.memo(function ProductCard({
  product,
  categoryEmojis,
  emojiDefault,
  onClick,
  disabled,
}: {
  product: Product;
  categoryEmojis?: Record<string, string>;
  emojiDefault?: string;
  onClick: (p: Product) => void;
  disabled: boolean;
}) {
  const isPromo = !!(product as any).em_promocao || !!(product as any).desconto;
  const isDestaque = !!(product as any).destaque || !!(product as any).mais_vendido;
  const isRecomend = !!(product as any).recomendado;
  const emoji = (categoryEmojis as any)?.[product.category] ?? emojiDefault ?? '🍽️';

  const handleClick = () => {
    if (!disabled) onClick(product);
  };

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="group relative text-left rounded-xl border border-zinc-700 bg-zinc-800 overflow-hidden shadow-md shadow-black/15 hover:border-amber-500 hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-200 ease-out cursor-pointer min-h-[148px] flex flex-col"
    >
      <div className="absolute inset-0 pointer-events-none rounded-xl bg-amber-400/25 opacity-0 group-active:opacity-100 transition-opacity duration-75 z-10" aria-hidden />
      <div className="relative w-full overflow-hidden shrink-0" style={{ paddingBottom: '46%' }}>
        {product.photo_url ? (
          <img
            src={product.photo_url}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-700/50 flex items-center justify-center">
            <span className="text-2xl opacity-50">{emoji}</span>
          </div>
        )}
        {product.photo_url && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        )}
        <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
          {isDestaque && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-500/95 text-zinc-900 tracking-wide">MAIS VENDIDO</span>
          )}
          {isRecomend && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-blue-500/95 text-white tracking-wide">RECOMENDADO</span>
          )}
          {isPromo && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-red-500/95 text-white tracking-wide">PROMOÇÃO</span>
          )}
        </div>
      </div>
      <div className="p-2 flex-1 flex flex-col min-w-0">
        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{product.category}</p>
        <h3 className="font-bold text-zinc-100 text-xs leading-snug line-clamp-2 mb-1">{product.name}</h3>
        {(product as any).codigo_barras && (
          <span className="text-[9px] text-zinc-500 flex items-center gap-0.5 mb-1">
            <Barcode size={8} />{(product as any).codigo_barras}
          </span>
        )}
        <p className="text-sm font-black text-amber-400 mt-auto">R$ {product.price.toFixed(2)}</p>
      </div>
    </motion.button>
  );
});

export default function POSScreen({
  token, products, estabelecimentoSegmento, taxasPagamento,
}: {
  token: string;
  products: Product[];
  estabelecimentoSegmento?: string;
  taxasPagamento?: { debito: number; credito: number; pix: number };
}) {
  const cfg = getSegCfg(estabelecimentoSegmento);

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [observation, setObservation]                     = useState('');
  const [payments, setPayments]                           = useState<{ method: PaymentMethod; amount_paid: number }[]>([]);
  const [currentPaymentMethod, setCurrentPaymentMethod]  = useState<PaymentMethod>('Dinheiro');
  const [currentAmount, setCurrentAmount]                 = useState<number>(0);
  const [pendingProduct, setPendingProduct]               = useState<Product | null>(null);
  const [pendingSelection, setPendingSelection]           = useState<{ product_id: number; product_name: string; price_at_time: number; variation_id?: number | null } | null>(null);
  const [variacaoModalProduct, setVariacaoModalProduct]   = useState<Product | null>(null);
  const [variacoesVendaveis, setVariacoesVendaveis]       = useState<any[]>([]);
  const [carregandoVariacoes, setCarregandoVariacoes]     = useState(false);
  const [showSuccess, setShowSuccess]                     = useState<{ number: string; receipt: string; senha: number; tipo: string; orderId?: number } | null>(null);
  const [isFinalizing, setIsFinalizing]                   = useState(false);
  const [showTipoRetirada, setShowTipoRetirada]           = useState(false);
  const [tipoRetirada, setTipoRetirada]                   = useState<'local' | 'levar'>('local');
  const [showMesaPicker, setShowMesaPicker]               = useState(false);
  const [pendingMesaProduct, setPendingMesaProduct]       = useState<Product | null>(null);
  const [mesaToast, setMesaToast]                         = useState<string | null>(null);
  const [confirmLimpar, setConfirmLimpar]                 = useState(false);
  const [mobileCartOpen, setMobileCartOpen]               = useState(false);

  // ─── Estado de UI ─────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchTerm, setSearchTerm]             = useState('');
  const debouncedSearch                         = useDebounce(searchTerm, 250);
  const [barcodeBuffer, setBarcodeBuffer]       = useState('');
  const [barcodeToast, setBarcodeToast]         = useState<string | null>(null);
  const searchRef    = useRef<HTMLInputElement>(null);
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proceedSelectionRef = useRef<(p: Product, v?: any) => void>(() => {});

  // ─── Derivados ────────────────────────────────────────────────────────────
  const total     = useMemo(() => cart.reduce((a, i) => a + i.price_at_time * i.quantity, 0), [cart]);
  const totalPaid = useMemo(() => payments.reduce((a, p) => a + p.amount_paid, 0), [payments]);


  const filteredProducts = useMemo(() => {
    // Verifica disponibilidade por horário
    const agora = new Date();
    const horaAtual = agora.getHours() * 60 + agora.getMinutes(); // minutos desde meia-noite

    const active = (Array.isArray(products) ? products : []).filter(p => {
      if (!p.active) return false;
      const de  = (p as any).disponivel_de;
      const ate = (p as any).disponivel_ate;
      if (!de || !ate) return true; // sem horário definido = sempre disponível
      const [dh, dm] = de.split(':').map(Number);
      const [ah, am] = ate.split(':').map(Number);
      const inicio = dh * 60 + dm;
      const fim    = ah * 60 + am;
      // Suporte a virada de meia-noite (ex: 22:00 às 02:00)
      if (inicio <= fim) return horaAtual >= inicio && horaAtual <= fim;
      return horaAtual >= inicio || horaAtual <= fim;
    });

    if (!debouncedSearch.trim()) return active;
    const t = debouncedSearch.toLowerCase();
    return active.filter(p =>
      p.name.toLowerCase().includes(t) ||
      (p as any).marca?.toLowerCase().includes(t) ||
      (p as any).codigo_barras?.includes(t) ||
      p.category.toLowerCase().includes(t)
    );
  }, [products, debouncedSearch]);

  const categories = useMemo(() =>
    [...new Set(filteredProducts.map(p => p.category))].sort(),
  [filteredProducts]);

  const displayProducts = useMemo(() =>
    selectedCategory === 'Todas'
      ? filteredProducts
      : filteredProducts.filter(p => p.category === selectedCategory),
  [filteredProducts, selectedCategory]);

  // ─── Taxas de pagamento (após todos os useState e useMemo simples) ──────────
  const getTaxa = (method: PaymentMethod): number => {
    if (!taxasPagamento) return 0;
    if (method === 'Débito')  return taxasPagamento.debito  || 0;
    if (method === 'Crédito') return taxasPagamento.credito || 0;
    if (method === 'PIX')     return taxasPagamento.pix     || 0;
    return 0;
  };
  const taxaAtual        = getTaxa(currentPaymentMethod);
  const taxasAcumuladas  = payments.reduce((acc, p) => {
    const perc = getTaxa(p.method as PaymentMethod);
    return acc + (perc > 0 ? p.amount_paid * perc / 100 : 0);
  }, 0);
  const taxaPreviewPOS   = taxaAtual > 0 ? (currentAmount || 0) * taxaAtual / 100 : 0;
  const totalComTaxas    = total + taxasAcumuladas + taxaPreviewPOS;
  const totalPagoComTaxas = payments.reduce((acc, p) => {
    const perc = getTaxa(p.method as PaymentMethod);
    return acc + p.amount_paid + (perc > 0 ? p.amount_paid * perc / 100 : 0);
  }, 0);
  const remaining        = Math.max(0, totalComTaxas - totalPagoComTaxas);
  const change           = Math.max(0, totalPagoComTaxas - totalComTaxas);
  // ─────────────────────────────────────────────────────────────────────────

  const addToCartDirect = (product: Product) => {
    const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
    const seed = { product_id: product.id, product_name: product.name, price_at_time: product.price, variation_id: null };
    setCart(prev => {
      const ex = prev.find(i =>
        i.product_id === seed.product_id
        && i.type === tipo
        && Number((i as any).variation_id || 0) === Number(seed.variation_id || 0)
      );
      if (ex) {
        return prev.map(i =>
          i.product_id === seed.product_id
          && i.type === tipo
          && Number((i as any).variation_id || 0) === Number(seed.variation_id || 0)
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { ...seed, quantity: 1, type: tipo } as any];
    });
  };

  const addSelectionToCart = useCallback((selection: { product_id: number; product_name: string; price_at_time: number; variation_id?: number | null }, tipo: string) => {
    setCart(prev => {
      const ex = prev.find(i =>
        i.product_id === selection.product_id
        && i.type === tipo
        && Number((i as any).variation_id || 0) === Number(selection.variation_id || 0)
      );
      if (ex) {
        return prev.map(i =>
          i.product_id === selection.product_id
          && i.type === tipo
          && Number((i as any).variation_id || 0) === Number(selection.variation_id || 0)
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { ...selection, quantity: 1, type: tipo } as any];
    });
  }, []);

  const proceedSelection = useCallback((product: Product, variation?: any) => {
    const selection = variation
      ? {
          product_id: product.id,
          product_name: `${product.name} - ${variation.nome}`,
          price_at_time: Number(variation.preco || 0),
          variation_id: Number(variation.id || 0),
        }
      : {
          product_id: product.id,
          product_name: product.name,
          price_at_time: product.price,
          variation_id: null,
        };

    if (cfg.usaTipoItem && cfg.tiposItem.length > 1) {
      setPendingSelection(selection);
      setPendingProduct(product);
      return;
    }
    const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
    addSelectionToCart(selection, tipo);
  }, [cfg.usaTipoItem, cfg.tiposItem, addSelectionToCart]);

  proceedSelectionRef.current = proceedSelection;

  const handleProductClick = useCallback(async (product: Product) => {
    try {
      setCarregandoVariacoes(true);
      const res = await fetch(`/api/products/${product.id}/variacoes-vendaveis`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const vars = res.ok ? await res.json() : [];
      const ativas = Array.isArray(vars)
        ? vars.filter((v: { ativo?: number }) => Number(v?.ativo) === 1)
        : [];
      if (ativas.length > 0) {
        setVariacoesVendaveis(ativas);
        setVariacaoModalProduct(product);
        return;
      }
      proceedSelectionRef.current(product);
    } catch {
      proceedSelectionRef.current(product);
    } finally {
      setCarregandoVariacoes(false);
    }
  }, [token]);

  const addToCartWithType = (tipo: TipoItem) => {
    if (!pendingProduct || !pendingSelection) return;
    setPendingProduct(null);
    const selection = pendingSelection;
    setPendingSelection(null);
    if (tipo.usaMesas) { setPendingMesaProduct(pendingProduct); setShowMesaPicker(true); return; }
    addSelectionToCart(selection, tipo.type);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => { const n = [...prev]; n[index].quantity = Math.max(1, n[index].quantity + delta); return n; });
  };
  const removeItem    = (index: number) => setCart(prev => prev.filter((_, i) => i !== index));
  const addPayment    = () => { if (currentAmount <= 0) return; setPayments(prev => [...prev, { method: currentPaymentMethod, amount_paid: currentAmount }]); setCurrentAmount(0); };
  const removePayment = (index: number) => setPayments(prev => prev.filter((_, i) => i !== index));

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement;
      if (el?.tagName === 'TEXTAREA') return;
      if (el?.tagName === 'INPUT' && el !== searchRef.current) return;
      if (e.key === 'Enter' && barcodeBuffer.length >= 4) {
        const code = normalizeBarcode(barcodeBuffer); setBarcodeBuffer('');
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        const found = code
          ? (Array.isArray(products) ? products : []).find(
              p => p.active && normalizeBarcode((p as any).codigo_barras) === code
            )
          : null;
        if (found) { addToCartDirect(found); setBarcodeToast(`✓ ${found.name} adicionado`); setSearchTerm(''); }
        else { setBarcodeToast(`⚠ Código "${code}" não cadastrado`); }
        setTimeout(() => setBarcodeToast(null), 2500); return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setBarcodeBuffer(prev => prev + e.key);
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => setBarcodeBuffer(''), 120);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [barcodeBuffer, products]);

  const finalizeOrder = async (tipo: 'local' | 'levar' = 'local') => {
    if (cart.length === 0 || remaining > 0.01 || isFinalizing) return;
    setIsFinalizing(true); setShowTipoRetirada(false);
    const orderData = {
      items: cart, observation,
      // ⚠️ Envia o total COM taxas de maquininha, não o subtotal pré-taxa.
      // Garante que o registro financeiro no servidor bate com o valor realmente pago.
      total_amount: totalComTaxas,
      taxa_total: taxasAcumuladas, // auxiliar: permite o servidor separar produto de taxa
      tipo_retirada: tipo,
      payments: payments.map((p, i) => ({ ...p, change_given: i === payments.length - 1 ? change : 0 })),
    };
    try {
      const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(orderData) });
      const data = await res.json();
      if (data.success) {
        setShowSuccess({ number: data.orderNumber, receipt: data.receipt, senha: data.senhaPedido || 0, tipo, orderId: data.orderId });
        setCart([]); setPayments([]); setObservation(''); setCurrentAmount(0); setTipoRetirada('local');
        setMobileCartOpen(false);
      } else { alert('Erro ao finalizar pedido: ' + (data.error || 'Erro desconhecido')); }
    } catch { alert('Erro ao finalizar pedido'); }
    finally { setIsFinalizing(false); }
  };

  const renderCartColumn = (variant: 'desktop' | 'drawer') => (
    <>
      {variant === 'desktop' && (
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex items-center gap-2.5 shrink-0">
          <ShoppingCart size={18} className="text-amber-400" />
          <h2 className="text-base font-black text-zinc-100">Pedido Atual</h2>
          {cart.length > 0 && (
            <button
              onClick={() => setConfirmLimpar(true)}
              className="ml-auto text-[10px] font-bold text-zinc-400 hover:text-red-400 transition-colors px-2 py-1 hover:bg-red-500/10 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Limpar carrinho"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 bg-zinc-950">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
              <ShoppingCart size={28} className="text-zinc-500" />
            </div>
            <p className="font-bold text-zinc-300 text-sm">Carrinho vazio</p>
            <p className="text-xs text-zinc-500 mt-1">Toque nos produtos para adicionar ao pedido</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map((item, index) => (
              <motion.div key={index} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 bg-zinc-800 rounded-lg border border-zinc-700 p-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-100 text-xs leading-snug line-clamp-2">{item.product_name}</p>
                  <p className="text-amber-400 font-black text-xs mt-0.5">R$ {(item.price_at_time * item.quantity).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => updateQuantity(index, -1)} className="w-9 h-9 md:w-6 md:h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-all text-zinc-200"><Minus size={11} /></button>
                  <span className="w-7 md:w-6 text-center font-black text-xs text-zinc-100">{item.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(index, 1)} className="w-9 h-9 md:w-6 md:h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-all text-zinc-200"><Plus size={11} /></button>
                  <button type="button" onClick={() => removeItem(index)} className="w-9 h-9 md:w-6 md:h-6 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors ml-0.5"><Trash2 size={12} /></button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 px-4 pt-4 pb-4 space-y-4 shrink-0 bg-zinc-950">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Pagamentos Adicionados</p>
        {payments.length > 0 && (
          <div className="space-y-1.5">
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between items-center bg-zinc-800 px-2.5 py-2 rounded-lg border border-zinc-700 text-xs">
                <span className="font-bold text-zinc-400">{p.method}</span>
                <div className="flex items-center gap-2">
                  <span className="font-black text-zinc-100">R$ {p.amount_paid.toFixed(2)}</span>
                  <button type="button" onClick={() => removePayment(i)} className="text-zinc-500 hover:text-red-400 transition-colors p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {PAY_METHODS.map(m => (
            <button key={m} type="button" onClick={() => setCurrentPaymentMethod(m)}
              className={`py-2 md:py-1.5 rounded-lg text-[10px] font-bold border transition-all min-h-[40px] md:min-h-0 ${
                currentPaymentMethod === m
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}>
              <span>{m}</span>
              {getTaxa(m) > 0 && (
                <span className={`block text-[9px] font-bold mt-0.5 ${currentPaymentMethod === m ? 'text-amber-400/80' : 'text-amber-500'}`}>
                  +{getTaxa(m)}%
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number" placeholder="Valor"
            value={currentAmount || ''}
            onChange={e => setCurrentAmount(parseFloat(e.target.value) || 0)}
            className="flex-1 min-h-[44px] px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-base md:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all"
          />
          <button type="button" onClick={addPayment} disabled={currentAmount <= 0}
            className="px-4 py-2 min-h-[44px] bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-400 font-bold rounded-lg text-sm disabled:opacity-30 transition-all">
            Adicionar
          </button>
        </div>
        {remaining > 0 && (
          <button type="button" onClick={() => setCurrentAmount(remaining)}
            className="w-full py-2 md:py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 border border-dashed border-zinc-700 hover:border-zinc-600 rounded-lg transition-all">
            Preencher valor exato — R$ {remaining.toFixed(2)}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Restante</p>
            <div className={`min-h-9 flex items-center justify-center font-bold text-xs rounded-lg border ${remaining > 0 ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
              R$ {Math.max(0, remaining).toFixed(2)}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Troco</p>
            <div className={`min-h-9 flex items-center justify-center font-bold text-xs rounded-lg border ${change > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
              R$ {change.toFixed(2)}
            </div>
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Observações</p>
          <input
            placeholder="Ex: Sem feijão, mais carne..."
            value={observation}
            onChange={(e: any) => setObservation(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-base md:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all"
          />
        </div>
        <div className="pt-3 space-y-3">
          <div className="bg-zinc-800 rounded-xl border-2 border-zinc-600 ring-2 ring-amber-400/25 p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium text-xs">Subtotal</span>
              <span className="text-sm font-black text-zinc-200">R$ {total.toFixed(2)}</span>
            </div>
            {payments.map((p, i) => {
              const perc = getTaxa(p.method as PaymentMethod);
              const taxa = perc > 0 ? p.amount_paid * perc / 100 : 0;
              return taxa > 0 ? (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-amber-500/80 font-medium text-[10px]">Taxa {p.method} ({perc}%) s/ R$ {p.amount_paid.toFixed(2)}</span>
                  <span className="text-[10px] font-bold text-amber-500">+ R$ {taxa.toFixed(2)}</span>
                </div>
              ) : null;
            })}
            {taxaPreviewPOS > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-amber-500/70 font-medium text-[10px]">Taxa {currentPaymentMethod} ({taxaAtual}%) s/ R$ {(currentAmount||0).toFixed(2)}</span>
                <span className="text-[10px] font-bold text-amber-500">+ R$ {taxaPreviewPOS.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-3 mt-2 border-t-2 border-zinc-600">
              <span className="text-zinc-200 font-bold text-sm">Total do Pedido</span>
              <span className="text-2xl font-black text-amber-400 tabular-nums">
                R$ {totalComTaxas.toFixed(2)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (cart.length === 0 || remaining > 0.01 || isFinalizing) return;
              const isRestaurante = ['Restaurante/Food', 'Bar/Pub'].includes(estabelecimentoSegmento || '');
              const cartHasFood = cart.some(item => {
                const prod = products.find(p => p.id === item.product_id);
                return prod ? resolveRequiresPreparation(prod) : false;
              });
              if (isRestaurante && cartHasFood && !cfg.usaTipoItem) { setShowTipoRetirada(true); }
              else { finalizeOrder('local'); }
            }}
            disabled={cart.length === 0 || remaining > 0.01 || isFinalizing}
            className="w-full py-4 text-base font-black rounded-xl flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-zinc-900 shadow-xl shadow-amber-500/25 ring-2 ring-amber-400/40 hover:ring-amber-400/60 min-h-[52px]"
          >
            {isFinalizing ? (
              <><span className="animate-pulse">⏳</span> Processando...</>
            ) : cart.length === 0 ? (
              'Adicione itens ao pedido'
            ) : remaining > 0.01 ? (
              `Faltam R$ ${remaining.toFixed(2)}`
            ) : (
              <><CheckCircle2 size={22} strokeWidth={2.5} /> Finalizar Venda</>
            )}
          </button>
        </div>
      </div>
    </>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col md:flex-row overflow-hidden bg-zinc-950">

      {/* ═══════════════════════════════════════════════════════════════
          PAINEL ESQUERDO — Catálogo
      ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Busca */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              ref={searchRef} type="text" value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setSelectedCategory('Todas'); }}
              placeholder="Buscar por nome, marca... ou bipe o código"
              className="w-full pl-11 pr-10 py-2.5 bg-zinc-800/80 border border-zinc-600 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-500 transition-all"
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); searchRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Abas de categoria */}
        <div className="px-3 pb-2 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {['Todas', ...categories].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap border transition-all duration-200 shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-amber-400 border-amber-400 text-zinc-900 shadow-md shadow-amber-500/20 ring-2 ring-amber-300/50'
                    : 'bg-zinc-800/70 border-zinc-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grade de Produtos */}
        <div className="flex-1 overflow-y-auto px-3 pb-24 md:pb-3">
          {displayProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <ScanLine size={36} className="mb-2.5 opacity-40" />
              <p className="font-semibold text-zinc-300">Nenhum produto encontrado</p>
              {searchTerm && <p className="text-xs mt-1 text-zinc-600">"{searchTerm}"</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[1728px]:grid-cols-7 gap-2.5">
              {displayProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryEmojis={cfg.categoryEmojis}
                  emojiDefault={cfg.emojiDefault}
                  onClick={handleProductClick}
                  disabled={carregandoVariacoes}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TOASTS
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {barcodeToast && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[200] font-semibold text-sm whitespace-nowrap">
            {barcodeToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          PAINEL DIREITO — Pedido + Pagamento (tablet/desktop)
          Usa bg-zinc-950 para evitar override .flowpdv-dark .bg-zinc-900 → #f0f0f0
      ═══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-col h-full min-h-0 w-full md:w-[300px] lg:w-[340px] bg-zinc-950 border-l border-zinc-800 shrink-0 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] print:shadow-none [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        {renderCartColumn('desktop')}
      </div>

      {/* Mobile: CTA fixo + sheet do pedido (max-md) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] text-left active:bg-zinc-900/80"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingCart size={20} className="text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Pedido atual</p>
              <p className="text-sm font-black text-zinc-100 truncate">{cart.length === 0 ? 'Vazio' : `${cart.length} item(ns)`}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-zinc-500">Total</p>
            <p className="text-lg font-black text-amber-400 tabular-nums">R$ {totalComTaxas.toFixed(2)}</p>
          </div>
          <span className="text-xs font-black text-amber-500 shrink-0">Abrir →</span>
        </button>
      </div>

      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileCartOpen(false)}
          />
          <div className="relative flex flex-col max-h-[min(92dvh,100%)] rounded-t-2xl bg-zinc-950 border border-zinc-800 border-b-0 shadow-2xl overflow-hidden mx-0">
            <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="p-2 rounded-xl text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center active:bg-zinc-800"
                aria-label="Fechar pedido"
              >
                <X size={22} />
              </button>
              <h2 className="text-base font-black text-zinc-100">Pedido e pagamento</h2>
              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setConfirmLimpar(true)}
                  className="text-[10px] font-bold text-zinc-400 hover:text-red-400 px-2 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Limpar carrinho"
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <span className="w-11" />
              )}
            </div>
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
              {renderCartColumn('drawer')}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {pendingProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} transition={{ duration: 0.15 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <div className="text-center mb-6">
                {pendingProduct.photo_url && <div className="w-full h-40 rounded-2xl overflow-hidden mb-4"><img src={pendingProduct.photo_url} alt={pendingProduct.name} className="w-full h-full object-cover" /></div>}
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{pendingProduct.category}</p>
                <h3 className="text-2xl font-black text-zinc-900">{pendingSelection?.product_name || pendingProduct.name}</h3>
                <p className="text-xl font-black text-amber-500 mt-1">R$ {Number(pendingSelection?.price_at_time ?? pendingProduct.price).toFixed(2)}</p>
              </div>
              <p className="text-center text-sm text-zinc-500 mb-6 font-medium">Como será este item?</p>
              <div className={`grid gap-4 ${cfg.tiposItem.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {cfg.tiposItem.map(tipo => {
                  const paleta: Record<string, string> = { blue:'bg-blue-50 hover:bg-blue-100 border-blue-200 hover:border-blue-400 text-blue-700', amber:'bg-amber-50 hover:bg-amber-100 border-amber-200 hover:border-amber-400 text-amber-700', green:'bg-green-50 hover:bg-green-100 border-green-200 hover:border-green-400 text-green-700', purple:'bg-purple-50 hover:bg-purple-100 border-purple-200 hover:border-purple-400 text-purple-700' };
                  return (
                    <button key={tipo.type} onClick={() => addToCartWithType(tipo)} className={`flex flex-col items-center gap-3 p-5 border-2 rounded-2xl transition-all active:scale-95 ${paleta[tipo.cor] || paleta.blue}`}>
                      <span className="text-4xl">{tipo.emoji}</span>
                      <span className="font-black text-sm uppercase tracking-wider">{tipo.label}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => { setPendingProduct(null); setPendingSelection(null); }} className="w-full mt-4 py-2 text-zinc-400 hover:text-zinc-600 text-sm font-medium transition-colors">Cancelar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {variacaoModalProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl">
              <div className="mb-4">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Escolha a variação</p>
                <h3 className="text-xl font-black text-zinc-900">{variacaoModalProduct.name}</h3>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {variacoesVendaveis.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      const product = variacaoModalProduct;
                      setVariacaoModalProduct(null);
                      setVariacoesVendaveis([]);
                      proceedSelection(product, v);
                    }}
                    className="w-full text-left p-3 rounded-xl border border-zinc-200 hover:border-amber-300 hover:bg-amber-50 transition-all"
                  >
                    <p className="font-bold text-sm text-zinc-800">{v.nome}</p>
                    <p className="text-xs text-zinc-500">
                      R$ {Number(v.preco || 0).toFixed(2)}
                      {v.codigo_barras ? ` · ${v.codigo_barras}` : ''}
                    </p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setVariacaoModalProduct(null); setVariacoesVendaveis([]); }}
                className="w-full mt-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold transition-all"
              >
                Cancelar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showMesaPicker && pendingMesaProduct && (
        <MesaPickerModal product={pendingMesaProduct} token={token}
          onClose={() => { setShowMesaPicker(false); setPendingMesaProduct(null); }}
          onSuccess={n => { setShowMesaPicker(false); setPendingMesaProduct(null); setMesaToast(`✓ Adicionado à Mesa ${n}`); setTimeout(() => setMesaToast(null), 2500); }}
        />
      )}
      <AnimatePresence>
        {mesaToast && (          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[200] font-bold text-sm">
            {mesaToast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTipoRetirada && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center" style={{ background: '#fff', color: '#18181b' }}>
              <div className="text-4xl mb-3">🍽️</div>
              <h3 className="text-xl font-black mb-1">Como vai consumir?</h3>
              <p className="text-sm mb-6" style={{ color: '#71717a' }}>Escolha para gerar a comanda correta</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => finalizeOrder('local')} className="flex flex-col items-center gap-2 p-5 rounded-2xl transition-all hover:scale-105 active:scale-95" style={{ background: '#18181b', color: '#fff' }}>
                  <span className="text-3xl">🪑</span><span className="font-black text-sm">Consumir aqui</span><span className="text-[10px] opacity-70">Pedido vai para a mesa</span>
                </button>
                <button onClick={() => finalizeOrder('levar')} className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all hover:scale-105 active:scale-95" style={{ border: '2px solid #e4e4e7', background: '#f9f9f9', color: '#18181b' }}>
                  <span className="text-3xl">🛍️</span><span className="font-black text-sm">Para levar</span><span className="text-[10px]" style={{ color: '#a1a1aa' }}>Retirada no balcão</span>
                </button>
              </div>
              <button onClick={() => setShowTipoRetirada(false)} className="mt-4 text-xs font-medium" style={{ color: '#a1a1aa' }}>Cancelar</button>
            </motion.div>
          </div>
        )}

        {showSuccess && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center">

              {/* Ícone + título */}
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#d1fae5', color: '#059669' }}>
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-lg font-black text-zinc-900">Venda Finalizada!</h3>
              <p className="text-xs text-zinc-400 mt-0.5">#{showSuccess.number}</p>

              {/* Senha */}
              {showSuccess.senha > 0 && (
                <div className="mt-3 mx-auto inline-flex flex-col items-center gap-0.5 px-5 py-2.5 rounded-xl bg-zinc-900">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                    {showSuccess.tipo === 'levar' ? '🛍️ Para Levar' : '🪑 Local'} — Senha
                  </span>
                  <span className="text-4xl font-black tabular-nums text-white leading-none">
                    {String(showSuccess.senha).padStart(2, '0')}
                  </span>
                </div>
              )}

              {/* Botões de impressão */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`/api/print/cupom-html/${showSuccess.orderId}`, { headers: { Authorization: `Bearer ${token}` } });
                      const html = await r.text();
                      openPrintPreview(html);
                    } catch {
                      openPrintPreview(showSuccess.receipt);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-zinc-100 text-zinc-800 hover:bg-zinc-200 transition-colors"
                >
                  <Printer size={14} /> Imprimir
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`/api/print/recibo/${showSuccess.orderId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                      const d = await r.json();
                      if (!d.success) alert('Impressora: ' + (d.message || 'Erro'));
                    } catch { alert('Erro ao enviar para impressora.'); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors"
                  style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}
                  title="Impressora térmica"
                >
                  <Printer size={14} />
                </button>
              </div>

              {/* Novo pedido */}
              <button
                onClick={() => setShowSuccess(null)}
                className="w-full mt-2 py-2.5 rounded-xl font-black text-sm bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
              >
                Novo Pedido →
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal confirmação limpar carrinho ────────────────────────── */}
      <AnimatePresence>
        {confirmLimpar && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center"
            >
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="text-base font-black text-zinc-900 mb-1">Limpar carrinho?</h3>
              <p className="text-xs text-zinc-400 mb-5">
                {cart.length} item{cart.length !== 1 ? 's' : ''} será{cart.length !== 1 ? 'ão' : ''} removido{cart.length !== 1 ? 's' : ''}.
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmLimpar(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setCart([]);
                    setPayments([]);
                    setObservation('');
                    setCurrentAmount(0);
                    setConfirmLimpar(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black bg-red-600 hover:bg-red-700 text-white transition-all"
                >
                  Limpar tudo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
