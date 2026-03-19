import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2, ShoppingBag,
  X, Search, Check, Printer, Barcode, ScanLine,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, OrderItem, PaymentMethod } from '../types';
import { getSegCfg, categoryNeedsPrep } from '../config/segmentos';
import type { TipoItem } from '../config/segmentos';
import { Card, Button, Input } from '../components/ui/Card';
import MesaPickerModal from '../segments/bar/MesaPickerModal';

// ── Constantes de estilo ──────────────────────────────────────────────────────
const PAY_METHODS: PaymentMethod[] = ['Dinheiro', 'PIX', 'Débito', 'Crédito'];

const PAY_ICON: Record<string, string> = {
  Dinheiro: '💵',
  PIX:      '⚡',
  Débito:   '💳',
  Crédito:  '💳',
};

export default function POSScreen({
  token, products, estabelecimentoSegmento, taxasPagamento,
}: {
  token: string;
  products: Product[];
  estabelecimentoSegmento?: string;
  taxasPagamento?: { debito: number; credito: number; pix: number };
}) {
  const cfg = getSegCfg(estabelecimentoSegmento);

  // ─── Estado original (INALTERADO) ─────────────────────────────────────────
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [showFuncPicker, setShowFuncPicker]               = useState(false);
  const [pendingFuncProduct, setPendingFuncProduct]       = useState<Product | null>(null);
  const [funcionariosPOS, setFuncionariosPOS]             = useState<any[]>([]);
  const [pendingFuncionario, setPendingFuncionario]       = useState<any | null>(null);
  const [showClientePicker, setShowClientePicker]         = useState(false);
  const [clientesPOS, setClientesPOS]                     = useState<any[]>([]);
  const [clienteSelecionado, setClienteSelecionado]       = useState<any | null>(null);
  const [clienteSearch, setClienteSearch]                 = useState('');
  const [coberturaAtual, setCoberturaAtual]               = useState<any | null>(null);
  const [showProdutoVendedorPicker, setShowProdutoVendedorPicker] = useState(false);
  const [produtoVendedorComissao, setProdutoVendedorComissao]     = useState<string>('');
  const [produtosComEstoque, setProdutosComEstoque]       = useState<number[]>([]);
  const [observation, setObservation]                     = useState('');
  const [payments, setPayments]                           = useState<{ method: PaymentMethod; amount_paid: number }[]>([]);
  const [currentPaymentMethod, setCurrentPaymentMethod]  = useState<PaymentMethod>('Dinheiro');
  const [currentAmount, setCurrentAmount]                 = useState<number>(0);
  const [pendingProduct, setPendingProduct]               = useState<Product | null>(null);
  const [showSuccess, setShowSuccess]                     = useState<{ number: string; receipt: string; senha: number; tipo: string; orderId?: number } | null>(null);
  const [isFinalizing, setIsFinalizing]                   = useState(false);
  const [showTipoRetirada, setShowTipoRetirada]           = useState(false);
  const [tipoRetirada, setTipoRetirada]                   = useState<'local' | 'levar'>('local');
  const [showMesaPicker, setShowMesaPicker]               = useState(false);
  const [pendingMesaProduct, setPendingMesaProduct]       = useState<Product | null>(null);
  const [mesaToast, setMesaToast]                         = useState<string | null>(null);
  const [confirmLimpar, setConfirmLimpar]                 = useState(false);

  // ─── Estado de UI ─────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchTerm, setSearchTerm]             = useState('');
  const [barcodeBuffer, setBarcodeBuffer]       = useState('');
  const [barcodeToast, setBarcodeToast]         = useState<string | null>(null);
  const searchRef    = useRef<HTMLInputElement>(null);
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (estabelecimentoSegmento === 'Barbearia/Salão') {
      fetch('/api/barber/funcionarios', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setFuncionariosPOS(Array.isArray(d) ? d : [])).catch(() => {});
      fetch('/api/barber/clientes', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setClientesPOS(Array.isArray(d) ? d : [])).catch(() => {});
      fetch('/api/barber/produtos-com-estoque', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setProdutosComEstoque(d.ids || [])).catch(() => {});
    }
  }, [estabelecimentoSegmento]);

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

    if (!searchTerm.trim()) return active;
    const t = searchTerm.toLowerCase();
    return active.filter(p =>
      p.name.toLowerCase().includes(t) ||
      (p as any).marca?.toLowerCase().includes(t) ||
      (p as any).codigo_barras?.includes(t) ||
      p.category.toLowerCase().includes(t)
    );
  }, [products, searchTerm]);

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

  // ─── Handlers originais (INALTERADOS) ────────────────────────────────────
  const addToCartDirect = (product: Product) => {
    const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
    setCart(prev => {
      const ex = prev.find(i => i.product_id === product.id && i.type === tipo);
      if (ex) return prev.map(i => i.product_id === product.id && i.type === tipo ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, type: tipo, price_at_time: product.price }];
    });
  };

  const handleProductClick = (product: Product) => {
    const isProdutoFisico = (product.category as string) === 'PRODUTO FISICO';
    if (estabelecimentoSegmento === 'Barbearia/Salão' && funcionariosPOS.length > 0) {
      setPendingFuncProduct(product);
      if (isProdutoFisico) {
        setPendingFuncionario(null); setShowFuncPicker(false); setProdutoVendedorComissao(''); setShowProdutoVendedorPicker(true);
      } else { setShowFuncPicker(true); }
      return;
    }
    if (cfg.usaTipoItem && cfg.tiposItem.length > 1) {
      setPendingProduct(product);
    } else {
      const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
      setCart(prev => {
        const ex = prev.find(i => i.product_id === product.id && i.type === tipo);
        if (ex) return prev.map(i => i.product_id === product.id && i.type === tipo ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, type: tipo, price_at_time: product.price }];
      });
    }
  };

  const addToCartWithFuncionario = (funcionario: any | null) => {
    setPendingFuncionario(funcionario); setShowFuncPicker(false); setClienteSearch(''); setShowClientePicker(true);
  };

  const finalizarProdutoFisico = (funcionario: any | null, comissaoPerc: number) => {
    if (!pendingFuncProduct) return;
    const product = pendingFuncProduct;
    setPendingFuncProduct(null); setShowProdutoVendedorPicker(false); setProdutoVendedorComissao('');
    const nomeFinal = product.name + (funcionario ? ` 📦 ${funcionario.nome}` : '');
    const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
    const fKey = (funcionario?.id || 0) * 100000 + product.id;
    setCart(prev => {
      const ex = prev.find(i => (i as any)._fKey === fKey && i.product_id === product.id);
      if (ex) return prev.map(i => (i as any)._fKey === fKey && i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: nomeFinal, quantity: 1, type: tipo, price_at_time: product.price, _barberItem: true, _fKey: fKey, _funcionarioId: funcionario?.id || null, _clienteId: null, _clienteNome: null, _cobertura: null, _originalPrice: product.price, _isProdutoFisico: true, _comissaoProduto: comissaoPerc } as any];
    });
  };

  const finalizarAddToCart = async (cliente: any | null) => {
    if (!pendingFuncProduct) return;
    const product = pendingFuncProduct; const funcionario = pendingFuncionario;
    setPendingFuncProduct(null); setPendingFuncionario(null); setShowClientePicker(false); setClienteSearch('');
    if (cliente) setClienteSelecionado(cliente);
    const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
    const fKey = (funcionario?.id || 0) * 100000 + (cliente?.id || 0);
    let cobertura: any = null;
    if (cliente && (product.category as string) !== 'PRODUTO FISICO') {
      try {
        const res = await fetch(`/api/barber/assinaturas/check?cliente_id=${cliente.id}&produto_id=${product.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) cobertura = await res.json();
      } catch(e) {}
    }
    const coberto = cobertura?.coberto === true;
    const preco = coberto ? 0 : product.price;
    const nomeFinal = product.name + (funcionario ? ` (✂️ ${funcionario.nome})` : '') + (coberto ? ' ✅ Plano' : '');
    setCart(prev => {
      const ex = prev.find(i => (i as any)._fKey === fKey && i.product_id === product.id);
      if (ex) return prev.map(i => (i as any)._fKey === fKey && i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: nomeFinal, quantity: 1, type: tipo, price_at_time: preco, _barberItem: true, _fKey: fKey, _funcionarioId: funcionario?.id || null, _clienteId: cliente?.id || null, _clienteNome: cliente?.nome || null, _cobertura: cobertura || null, _originalPrice: product.price } as any];
    });
    if (coberto && cobertura) { setCoberturaAtual(cobertura); setTimeout(() => setCoberturaAtual(null), 4000); }
  };

  const addToCartWithType = (tipo: TipoItem) => {
    if (!pendingProduct) return;
    setPendingProduct(null);
    if (tipo.usaMesas) { setPendingMesaProduct(pendingProduct); setShowMesaPicker(true); return; }
    setCart(prev => {
      const ex = prev.find(i => i.product_id === pendingProduct.id && i.type === tipo.type);
      if (ex) return prev.map(i => (i.product_id === pendingProduct.id && i.type === tipo.type) ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: pendingProduct.id, product_name: pendingProduct.name, quantity: 1, type: tipo.type, price_at_time: pendingProduct.price }];
    });
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
        const code = barcodeBuffer; setBarcodeBuffer('');
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        const found = (Array.isArray(products) ? products : []).find(p => p.active && (p as any).codigo_barras === code);
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
      barber_items: (cart as any[]).filter(i => i._barberItem === true).map(i => ({
        product_id: i.product_id, product_name: i.product_name, price: i.price_at_time,
        original_price: (i as any)._originalPrice ?? i.price_at_time, quantity: i.quantity,
        funcionario_id: i._funcionarioId || null, cliente_id: i._clienteId || null,
        cliente_nome: i._clienteNome || null, is_produto_fisico: (i as any)._isProdutoFisico || false,
        comissao_produto: (i as any)._comissaoProduto ?? 0,
      })),
    };
    try {
      const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(orderData) });
      const data = await res.json();
      if (data.success) {
        setShowSuccess({ number: data.orderNumber, receipt: data.receipt, senha: data.senhaPedido || 0, tipo, orderId: data.orderId });
        setCart([]); setPayments([]); setObservation(''); setCurrentAmount(0); setClienteSelecionado(null); setTipoRetirada('local');
      } else { alert('Erro ao finalizar pedido: ' + (data.error || 'Erro desconhecido')); }
    } catch { alert('Erro ao finalizar pedido'); }
    finally { setIsFinalizing(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col lg:flex-row overflow-hidden bg-zinc-50">

      {/* ═══════════════════════════════════════════════════════════════
          PAINEL ESQUERDO — Catálogo
      ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Busca */}
        <div className="px-6 pt-5 pb-4 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              ref={searchRef} type="text" value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setSelectedCategory('Todas'); }}
              placeholder="Buscar por nome, marca... ou bipe o código"
              className="w-full pl-11 pr-10 py-3 bg-white border border-zinc-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all shadow-sm"
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); searchRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Abas de categoria */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {['Todas', ...categories].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap border transition-all shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-amber-400 border-amber-400 text-zinc-900 shadow-sm shadow-amber-200'
                    : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grade de Produtos */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {displayProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
              <ScanLine size={40} className="mb-3 opacity-30" />
              <p className="font-semibold">Nenhum produto encontrado</p>
              {searchTerm && <p className="text-xs mt-1">"{searchTerm}"</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {displayProducts.map(product => {
                const isPromo    = !!(product as any).em_promocao || !!(product as any).desconto;
                const isDestaque = !!(product as any).destaque    || !!(product as any).mais_vendido;
                const isRecomend = !!(product as any).recomendado;
                const emoji = (cfg.categoryEmojis as any)?.[product.category] || cfg.emojiDefault || '🍽️';

                return (
                  <motion.button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    whileTap={{ scale: 0.97 }}
                    className="group text-left rounded-2xl border border-zinc-200 bg-white overflow-hidden hover:border-amber-300 hover:shadow-lg hover:shadow-amber-100 transition-all"
                  >
                    {/* Imagem */}
                    <div className="relative w-full overflow-hidden" style={{ paddingBottom: '45%' }}>
                      {product.photo_url ? (
                        <img
                          src={product.photo_url}
                          alt={product.name}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center">
                          <span className="text-3xl opacity-40">{emoji}</span>
                        </div>
                      )}

                      {/* Gradiente sobre a imagem */}
                      {product.photo_url && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      )}

                      {/* Badges sobrepostos */}
                      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                        {isDestaque && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-amber-500 text-white shadow-sm">
                            🔥 MAIS VENDIDO
                          </span>
                        )}
                        {isRecomend && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-blue-500 text-white shadow-sm">
                            ⭐ RECOMENDADO
                          </span>
                        )}
                        {isPromo && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-red-500 text-white shadow-sm">
                            🏷️ PROMOÇÃO
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">
                        {product.category}
                      </p>
                      <h3 className="font-black text-zinc-800 text-xs uppercase leading-snug line-clamp-2 mb-1.5">
                        {product.name}
                      </h3>
                      {(product as any).codigo_barras && (
                        <span className="text-[9px] text-zinc-400 flex items-center gap-0.5 mb-1.5">
                          <Barcode size={8} />{(product as any).codigo_barras}
                        </span>
                      )}
                      {produtosComEstoque.includes(product.id) && (
                        <span className="inline-flex items-center gap-1 mb-1.5 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[9px] font-black text-emerald-700">
                          📦 baixa estoque
                        </span>
                      )}
                      <p className="text-base font-black text-amber-500">
                        R$ {product.price.toFixed(2)}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TOASTS
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {coberturaAtual && (
          <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl z-[200] font-semibold text-sm whitespace-nowrap flex items-center gap-2">
            <Check size={16} />
            ✅ Coberto pelo plano <strong>{coberturaAtual.plano_nome}</strong>
            {coberturaAtual.tipo_plano === 'pacote' && coberturaAtual.restante != null && <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-lg text-xs">{coberturaAtual.restante - 1} restantes</span>}
            {coberturaAtual.tipo_plano === 'ilimitado' && <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-lg text-xs">Ilimitado</span>}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {barcodeToast && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[200] font-semibold text-sm whitespace-nowrap">
            {barcodeToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          MODAIS BARBEARIA (INALTERADOS)
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showProdutoVendedorPicker && pendingFuncProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div><h3 className="text-xl font-black text-zinc-900">Quem vendeu?</h3><p className="text-sm text-zinc-400 mt-0.5">📦 {pendingFuncProduct.name} · <span className="font-bold text-zinc-700">R$ {pendingFuncProduct.price.toFixed(2)}</span></p></div>
                <button onClick={() => { setShowProdutoVendedorPicker(false); setPendingFuncProduct(null); }} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={20} /></button>
              </div>
              <div className="mb-4 bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                <p className="text-xs font-black text-zinc-500 uppercase tracking-wide mb-1">Comissão sobre esta venda</p>
                <p className="text-xs text-zinc-400">O percentual é definido no cadastro de cada funcionário.</p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {funcionariosPOS.map(f => {
                  const corMap: Record<string, string> = { zinc:'bg-zinc-500',red:'bg-red-500',orange:'bg-orange-500',yellow:'bg-yellow-500',green:'bg-green-500',blue:'bg-blue-500',purple:'bg-purple-500',pink:'bg-pink-500' };
                  const perc = f.comissao_produto || 0;
                  const val  = pendingFuncProduct ? (pendingFuncProduct.price * perc / 100) : 0;
                  return (
                    <button key={f.id} onClick={() => finalizarProdutoFisico(f, perc)} className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-zinc-100 hover:border-zinc-900 hover:bg-zinc-50 transition-all text-left">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 ${corMap[f.cor] || 'bg-zinc-500'}`}>{f.nome[0]}</div>
                      <div className="flex-1"><p className="font-black text-zinc-900 text-sm">{f.nome}</p><p className="text-xs text-zinc-400">{f.cargo}</p></div>
                      {perc > 0 ? <span className="text-xs font-black text-green-700 bg-green-50 px-2 py-1 rounded-lg">{perc}% · +R$ {val.toFixed(2)}</span> : <span className="text-xs text-zinc-400 bg-zinc-50 px-2 py-1 rounded-lg">sem comissão</span>}
                    </button>
                  );
                })}
                <button onClick={() => finalizarProdutoFisico(null, 0)} className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all text-zinc-400 text-sm">
                  <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">🏠</div>Dono / Sem comissão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFuncPicker && pendingFuncProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }} className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div><h3 className="text-xl font-black text-zinc-900">Quem vai atender?</h3><p className="text-sm text-zinc-400 mt-0.5">{pendingFuncProduct.name} · <span className="font-bold text-zinc-700">R$ {pendingFuncProduct.price.toFixed(2)}</span></p></div>
                <button onClick={() => { setShowFuncPicker(false); setPendingFuncProduct(null); }} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={20} /></button>
              </div>
              <div className="space-y-2">
                {funcionariosPOS.map(f => {
                  const corMap: Record<string, string> = { zinc:'bg-zinc-500',red:'bg-red-500',orange:'bg-orange-500',yellow:'bg-yellow-500',green:'bg-green-500',blue:'bg-blue-500',purple:'bg-purple-500',pink:'bg-pink-500' };
                  return (
                    <button key={f.id} onClick={() => addToCartWithFuncionario(f)} className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-zinc-100 hover:border-zinc-900 hover:bg-zinc-50 transition-all text-left">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 ${corMap[f.cor] || 'bg-zinc-500'}`}>{f.nome[0]}</div>
                      <div><p className="font-black text-zinc-900 text-sm">{f.nome}</p><p className="text-xs text-zinc-400">{f.cargo}</p></div>
                    </button>
                  );
                })}
                <button onClick={() => addToCartWithFuncionario(null)} className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all text-zinc-400 text-sm">
                  <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 font-bold">?</div>Qualquer funcionário
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClientePicker && pendingFuncProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }} className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-black text-zinc-900">Para qual cliente?</h3>
                  <p className="text-sm text-zinc-400 mt-0.5">{pendingFuncProduct.name}{pendingFuncionario && pendingFuncProduct.category !== 'PRODUTO FISICO' && <span className="ml-1 text-zinc-600 font-semibold">· ✂️ {pendingFuncionario.nome}</span>}</p>
                </div>
                <button onClick={() => { setShowClientePicker(false); setPendingFuncProduct(null); setPendingFuncionario(null); }} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={20} /></button>
              </div>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input autoFocus type="text" placeholder="Buscar cliente..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-900" />
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {clientesPOS.filter(c => !clienteSearch || c.nome.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.telefone || '').includes(clienteSearch)).slice(0, 8).map(c => (
                  <button key={c.id} onClick={() => finalizarAddToCart(c)} className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-zinc-100 hover:border-zinc-900 hover:bg-zinc-50 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center text-white font-black text-sm shrink-0">{c.nome[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><p className="font-black text-zinc-900 text-sm truncate">{c.nome}</p>{c.assinatura_nome && <span className="text-[9px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full shrink-0">✅ {c.assinatura_nome}</span>}</div>
                      {c.telefone && <p className="text-xs text-zinc-400">{c.telefone}</p>}
                    </div>
                  </button>
                ))}
                {clientesPOS.filter(c => !clienteSearch || c.nome.toLowerCase().includes(clienteSearch.toLowerCase())).length === 0 && <p className="text-xs text-zinc-400 text-center py-3">Nenhum cliente encontrado</p>}
              </div>
              <button onClick={() => finalizarAddToCart(null)} className="w-full mt-3 p-3 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 text-zinc-400 text-sm hover:bg-zinc-50 transition-all">
                {pendingFuncProduct?.category === 'PRODUTO FISICO' ? 'Adicionar sem vincular cliente' : 'Continuar sem vincular cliente'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          PAINEL DIREITO — Pedido + Pagamento
      ═══════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[340px] bg-white border-l border-zinc-200 flex flex-col shrink-0 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2.5 shrink-0">
          <ShoppingCart size={19} className="text-amber-500" />
          <h2 className="text-lg font-black text-zinc-900">Pedido Atual</h2>
          {cart.length > 0 && (
            <button
              onClick={() => setConfirmLimpar(true)}
              className="ml-auto text-[10px] font-bold text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 hover:bg-red-50 rounded-lg"
              title="Limpar carrinho"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Itens do carrinho */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-center py-6">
              <ShoppingBag size={44} className="mb-3 opacity-15" />
              <p className="font-semibold text-sm">O carrinho está vazio</p>
              <p className="text-xs mt-1 opacity-60">Seleciona produtos ao lado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item, index) => (
                <motion.div key={index} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 bg-zinc-50 rounded-xl border border-zinc-100 p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-800 text-xs leading-snug line-clamp-2">{item.product_name}</p>
                    <p className="text-amber-500 font-black text-xs mt-0.5">R$ {(item.price_at_time * item.quantity).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateQuantity(index, -1)} className="w-6 h-6 flex items-center justify-center bg-zinc-200 hover:bg-zinc-300 rounded-lg transition-all text-zinc-600"><Minus size={11} /></button>
                    <span className="w-6 text-center font-black text-xs text-zinc-800">{item.quantity}</span>
                    <button onClick={() => updateQuantity(index, 1)} className="w-6 h-6 flex items-center justify-center bg-zinc-200 hover:bg-zinc-300 rounded-lg transition-all text-zinc-600"><Plus size={11} /></button>
                    <button onClick={() => removeItem(index)} className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-red-500 transition-colors ml-1"><Trash2 size={13} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* ── Seção de pagamento ────────────────────────────────────── */}
        <div className="border-t border-zinc-100 px-4 pt-4 pb-4 space-y-3 shrink-0 bg-white">

          {/* Label */}
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pagamentos Adicionados</p>

          {/* Pagamentos registrados */}
          {payments.length > 0 && (
            <div className="space-y-1">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-zinc-50 px-3 py-2 rounded-xl border border-zinc-100 text-xs">
                  <span className="font-bold text-zinc-600">{p.method}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-zinc-900">R$ {p.amount_paid.toFixed(2)}</span>
                    <button onClick={() => removePayment(i)} className="text-zinc-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Métodos de pagamento — grid 2x2 */}
          <div className="grid grid-cols-3 gap-1.5">
            {PAY_METHODS.map(m => (
              <button key={m} onClick={() => setCurrentPaymentMethod(m)}
                className={`py-2 rounded-xl text-[11px] font-bold border transition-all ${
                  currentPaymentMethod === m
                    ? 'bg-zinc-800 border-zinc-800 text-white'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-400'
                }`}>
                <span>{m}</span>
                {getTaxa(m) > 0 && (
                  <span className={`block text-[9px] font-bold mt-0.5 ${currentPaymentMethod === m ? 'text-zinc-300' : 'text-amber-500'}`}>
                    +{getTaxa(m)}%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Valor + Adicionar */}
          <div className="flex gap-2">
            <input
              type="number" placeholder="Valor"
              value={currentAmount || ''}
              onChange={e => setCurrentAmount(parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-all"
            />
            <button onClick={addPayment} disabled={currentAmount <= 0}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-zinc-900 font-black rounded-xl text-sm disabled:opacity-30 transition-all">
              Adicionar
            </button>
          </div>

          {/* Atalho valor exato */}
          {remaining > 0 && (
            <button onClick={() => setCurrentAmount(remaining)}
              className="w-full py-1.5 text-[11px] font-bold text-zinc-500 hover:text-zinc-800 border border-dashed border-zinc-200 hover:border-zinc-400 rounded-xl transition-all">
              Preencher valor exato — R$ {remaining.toFixed(2)}
            </button>
          )}

          {/* Restante + Troco */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Restante</p>
              <div className={`h-9 flex items-center justify-center font-bold text-sm rounded-xl border ${remaining > 0 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-zinc-50 text-zinc-400 border-zinc-200'}`}>
                R$ {Math.max(0, remaining).toFixed(2)}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Troco</p>
              <div className={`h-9 flex items-center justify-center font-bold text-sm rounded-xl border ${change > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-zinc-50 text-zinc-400 border-zinc-200'}`}>
                R$ {change.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Observações</p>
            <Input
              placeholder="Ex: Sem feijão, mais carne..."
              value={observation}
              onChange={(e: any) => setObservation(e.target.value)}
            />
          </div>

          {/* Cliente vinculado */}
          {clienteSelecionado && (
            <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center text-white text-[10px] font-black">{clienteSelecionado.nome[0]}</div>
                <p className="text-xs font-black text-zinc-900">{clienteSelecionado.nome}</p>
              </div>
              <button onClick={() => setClienteSelecionado(null)} className="text-zinc-300 hover:text-red-500 transition-colors"><X size={13} /></button>
            </div>
          )}

          {/* Total + Botão */}
          <div className="pt-1 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium text-sm">Subtotal</span>
                <span className="text-sm font-bold text-zinc-700">R$ {total.toFixed(2)}</span>
              </div>
              {/* Taxas dos pagamentos já adicionados */}
              {payments.map((p, i) => {
                const perc = getTaxa(p.method as PaymentMethod);
                const taxa = perc > 0 ? p.amount_paid * perc / 100 : 0;
                return taxa > 0 ? (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-amber-600 font-medium text-xs">Taxa {p.method} ({perc}%) s/ R$ {p.amount_paid.toFixed(2)}</span>
                    <span className="text-xs font-bold text-amber-600">+ R$ {taxa.toFixed(2)}</span>
                  </div>
                ) : null;
              })}
              {/* Preview taxa do método atual */}
              {taxaPreviewPOS > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-amber-500 font-medium text-xs">Taxa {currentPaymentMethod} ({taxaAtual}%) s/ R$ {(currentAmount||0).toFixed(2)}</span>
                  <span className="text-xs font-bold text-amber-500">+ R$ {taxaPreviewPOS.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-zinc-100">
                <span className="text-zinc-500 font-medium text-sm">Total do Pedido</span>
                <span className="text-2xl font-black text-zinc-900">
                  R$ {totalComTaxas.toFixed(2)}
                </span>
              </div>
            </div>
            <Button
              onClick={() => {
                if (cart.length === 0 || remaining > 0.01 || isFinalizing) return;
                const isRestaurante = ['Restaurante/Food', 'Bar/Pub'].includes(estabelecimentoSegmento || '');
                const cartHasFood = cart.some(item => {
                  const prod = products.find(p => p.id === item.product_id);
                  return prod ? categoryNeedsPrep(prod.category || '') : false;
                });
                if (isRestaurante && cartHasFood && !cfg.usaTipoItem) { setShowTipoRetirada(true); }
                else { finalizeOrder('local'); }
              }}
              className="w-full py-4 text-base font-black !bg-amber-400 !text-zinc-900 hover:!bg-amber-500 border-0"
              disabled={cart.length === 0 || remaining > 0.01 || isFinalizing}
            >
              {isFinalizing ? '⏳ Processando...'
                : cart.length === 0 ? 'Adicione itens ao pedido'
                : remaining > 0.01 ? `Faltam R$ ${remaining.toFixed(2)}`
                : 'Finalizar Venda'}
            </Button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Tipo de Item (INALTERADO)
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {pendingProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} transition={{ duration: 0.15 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <div className="text-center mb-6">
                {pendingProduct.photo_url && <div className="w-full h-40 rounded-2xl overflow-hidden mb-4"><img src={pendingProduct.photo_url} alt={pendingProduct.name} className="w-full h-full object-cover" /></div>}
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{pendingProduct.category}</p>
                <h3 className="text-2xl font-black text-zinc-900">{pendingProduct.name}</h3>
                <p className="text-xl font-black text-amber-500 mt-1">R$ {pendingProduct.price.toFixed(2)}</p>
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
              <button onClick={() => setPendingProduct(null)} className="w-full mt-4 py-2 text-zinc-400 hover:text-zinc-600 text-sm font-medium transition-colors">Cancelar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mesa Picker (INALTERADO) */}
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

      {/* ═══════════════════════════════════════════════════════════════
          MODAIS FINALIZAÇÃO (INALTERADOS)
      ═══════════════════════════════════════════════════════════════ */}
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
                      const w = window.open('', '_blank', 'width=420,height=700');
                      if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                    } catch {
                      const w = window.open('', '_blank', 'width=420,height=700');
                      if (w) { w.document.write(showSuccess.receipt); w.document.close(); }
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
                    setClienteSelecionado(null);
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