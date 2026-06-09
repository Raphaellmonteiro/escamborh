import React, { useState, useEffect } from 'react';
import {
  X,
  UtensilsCrossed,
  TableProperties,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { lightModalTitleClass } from '../../components/ui/screenChrome';
import type { Product, Category, OrderItem, OrderType, PaymentMethod, Order, DashboardStats, CashReport, Expense, Caixa, Ingrediente, MovimentacaoEstoque } from '../../types';
import type { Selecoes } from '../../shared/ProductOptionsModal';

// ─── [A] TIPOS (adicionar no types.ts) ───────────────────────────────────────

interface Mesa {
  id: number;
  numero: number;
  status: 'aberta' | 'fechada';
  tenant_id: number;
  opened_at: string | null;
  comanda_id: number | null;
  total_itens: number;
  total_valor: number;
}

export interface ItemComanda {
  id: number;
  comanda_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price_at_time: number;
  created_at: string;
  observation?: string | null;
  variation_id?: number | null;
  obs_opcoes?: string | null;
}

/** Linha já calculada no PDV (mesmo contrato do carrinho / balcão: preco_final + obs_opcoes). */
export type MesaPickerLineSeed = {
  product_id: number;
  product_name: string;
  price_at_time: number;
  variation_id?: number | null;
  observation?: string;
  selecoes?: Selecoes;
};

// ─── [B] MODIFICAR TipoItem (~linha 915 em App.tsx) ──────────────────────────
// Substitua a linha:
//   type TipoItem = { type: string; label: string; emoji: string; cor: 'blue' | 'amber' | 'green' | 'purple' };
// Por:
//   type TipoItem = { type: string; label: string; emoji: string; cor: 'blue' | 'amber' | 'green' | 'purple'; usaMesas?: boolean };

// ─── [C] MODIFICAR SEGMENTO_CONFIG ───────────────────────────────────────────
// Em 'Restaurante/Food', altere o tipo 'Consumir no local':
//   { type: 'Consumir no local', label: 'No Local', emoji: '🍽️', cor: 'amber', usaMesas: true },
//
// Em 'Bar/Pub', altere o tipo 'Mesa':
//   { type: 'Mesa', label: 'Mesa', emoji: '🪑', cor: 'amber', usaMesas: true },

// ─── [D] MODIFICAR POSScreen ──────────────────────────────────────────────────
// 1. Adicione estes estados no início da função POSScreen (junto aos outros useState):
//
//   const [showMesaPicker, setShowMesaPicker] = useState(false);
//   const [pendingMesaProduct, setPendingMesaProduct] = useState<Product | null>(null);
//   const [mesaToast, setMesaToast] = useState<string | null>(null);
//
// 2. Substitua a função handleProductClick por esta versão:
//
//   const handleProductClick = (product: Product) => {
//     if (cfg.usaTipoItem && cfg.tiposItem.length > 1) {
//       setPendingProduct(product);
//     } else {
//       const tipo = cfg.tiposItem[0]?.type ?? 'Venda Direta';
//       setCart(prev => {
//         const existing = prev.find(i => i.product_id === product.id && i.type === tipo);
//         if (existing) return prev.map(i => i.product_id === product.id && i.type === tipo ? { ...i, quantity: i.quantity + 1 } : i);
//         return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, type: tipo, price_at_time: product.price }];
//       });
//     }
//   };
//
// 3. Substitua a função addToCartWithType por esta versão:
//
//   const addToCartWithType = (tipo: TipoItem) => {
//     if (!pendingProduct) return;
//     setPendingProduct(null);
//     if (tipo.usaMesas) {
//       // Abre o mesa picker em vez de adicionar ao carrinho local
//       setPendingMesaProduct(pendingProduct);
//       setShowMesaPicker(true);
//       return;
//     }
//     setCart(prev => {
//       const existing = prev.find(item => item.product_id === pendingProduct.id && item.type === tipo.type);
//       if (existing) {
//         return prev.map(item =>
//           (item.product_id === pendingProduct.id && item.type === tipo.type)
//             ? { ...item, quantity: item.quantity + 1 }
//             : item
//         );
//       }
//       return [...prev, {
//         product_id: pendingProduct.id,
//         product_name: pendingProduct.name,
//         quantity: 1,
//         type: tipo.type,
//         price_at_time: pendingProduct.price
//       }];
//     });
//   };
//
// ATENÇÃO: no JSX do modal de tipo, troque a chamada:
//   onClick={() => addToCartWithType(tipo.type as OrderType)}
// Por:
//   onClick={() => addToCartWithType(tipo)}
//
// 4. Cole o MesaPickerModal e o toast DENTRO do return do POSScreen,
//    logo após o AnimatePresence do modal de tipo (linha ~1452):
//
//   {/* Mesa Picker */}
//   {showMesaPicker && pendingMesaProduct && (
//     <MesaPickerModal
//       product={pendingMesaProduct}
//       token={token}
//       onClose={() => { setShowMesaPicker(false); setPendingMesaProduct(null); }}
//       onSuccess={(n) => {
//         setShowMesaPicker(false);
//         setPendingMesaProduct(null);
//         setMesaToast(`✓ Adicionado à Mesa ${n}`);
//         setTimeout(() => setMesaToast(null), 2500);
//       }}
//     />
//   )}
//   {/* Toast de confirmação */}
//   <AnimatePresence>
//     {mesaToast && (
//       <motion.div
//         initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
//         className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[200] font-bold text-sm"
//       >
//         {mesaToast}
//       </motion.div>
//     )}
//   </AnimatePresence>

// ─── [E] MODIFICAR SIDEBAR (~linha 370) ──────────────────────────────────────
// Após o NavItem de estoque, adicione (somente para restaurant/bar):
//
//   {(estabelecimentoSegmento === 'Restaurante/Food' || estabelecimentoSegmento === 'Bar/Pub') && (
//     <NavItem active={activeTab === 'mesas'} onClick={() => handleTabChange('mesas')} icon={<UtensilsCrossed size={20} />} label="Mesas" />
//   )}
//
// Lembre de importar UtensilsCrossed de lucide-react:
//   import { ..., UtensilsCrossed } from 'lucide-react';

// ─── [F] MODIFICAR main content (~linha 405) ─────────────────────────────────
// Adicione junto aos outros tabs:
//   {activeTab === 'mesas' && <MesasScreen token={token} />}

// ─── [G] COMPONENTES — cole após a função POSScreen ──────────────────────────

// ─── MESA PICKER MODAL ───────────────────────────────────────────────────────


export default function MesaPickerModal({
  product,
  lineSeed,
  token,
  onClose,
  onSuccess,
}: {
  product: any;
  /** Quando vem do modal de opções: preço unitário com adicionais e texto das seleções. */
  lineSeed?: MesaPickerLineSeed;
  token: string;
  onClose: () => void;
  onSuccess: (mesaNumero: number) => void;
}) {
  const [mesas, setMesas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/mesas', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setMesas(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const unitPrice = Number(
    lineSeed?.price_at_time ?? (product as { preco_final?: number }).preco_final ?? product.price
  );
  const displayName = String(lineSeed?.product_name || product.name || '');
  const lineObservation = lineSeed?.observation?.trim() || undefined;

  const handleSelectMesa = async (mesa: any) => {
    setAdding(mesa.id);
    try {
      const res = await fetch(`/api/mesas/${mesa.id}/comanda/adicionar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: lineSeed?.product_id ?? product.id,
          product_name: displayName,
          quantity: 1,
          price_at_time: unitPrice,
          observation: lineObservation,
          obs_opcoes: lineObservation,
          variation_id: lineSeed?.variation_id ?? null,
          selecoes: lineSeed?.selecoes,
        }),
      });
      let message = 'Não foi possível adicionar o item à mesa.';
      try {
        const data = (await res.json()) as { error?: string; message?: string };
        if (data?.error) message = String(data.error);
        else if (data?.message) message = String(data.message);
      } catch {
        if (!res.ok) message = res.statusText || message;
      }
      if (!res.ok) {
        alert(message);
        return;
      }
      onSuccess(mesa.numero);
    } catch {
      alert('Erro de rede ao adicionar à mesa. Verifique a conexão.');
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-0 sm:items-center sm:p-6">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="flex max-h-[min(88dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6 sm:pb-6"
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={lightModalTitleClass}>Selecionar Mesa</h3>
            <p className="mt-0.5 text-sm text-zinc-500">
              {displayName} · <span className="font-bold tabular-nums text-zinc-800">R$ {unitPrice.toFixed(2)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
          </div>
        ) : mesas.length === 0 ? (
          <div className="text-center py-14 text-zinc-400">
            <TableProperties size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma mesa configurada</p>
            <p className="text-xs mt-1">Vá até a aba Mesas para configurar</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {mesas.map(mesa => (
                <button
                  key={mesa.id}
                  onClick={() => handleSelectMesa(mesa)}
                  disabled={adding !== null}
                  className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4 transition-all active:scale-95 disabled:opacity-60 sm:min-h-0 ${
                    mesa.status === 'aberta'
                      ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-sm shadow-emerald-100'
                      : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'
                  }`}
                >
                  {/* Status indicator */}
                  <div
                    className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${
                      mesa.status === 'aberta' ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'
                    }`}
                  />

                  {adding === mesa.id ? (
                    <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="text-3xl font-black text-zinc-900 leading-none">{mesa.numero}</span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          mesa.status === 'aberta' ? 'text-emerald-600' : 'text-zinc-400'
                        }`}
                      >
                        {mesa.status === 'aberta' ? 'Aberta' : 'Livre'}
                      </span>
                      {mesa.status === 'aberta' && mesa.total_valor > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          R$ {Number(mesa.total_valor).toFixed(2)}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 py-2 text-zinc-400 hover:text-zinc-600 text-sm font-medium transition-colors"
        >
          Cancelar
        </button>
      </motion.div>
    </div>
  );
}

// ─── TELA DE MESAS ────────────────────────────────────────────────────────────

