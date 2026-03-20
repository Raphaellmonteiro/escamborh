import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  X,
  Settings,
  Printer,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Product, Category, OrderItem, OrderType, PaymentMethod, Order, DashboardStats, CashReport, Expense, Caixa, Ingrediente, MovimentacaoEstoque } from '../../types';
import { Card, Button } from '../../components/ui/Card';
import { openPrintPreview, openPrintPreviewFromUrl } from '../../utils/print';

// â”€â”€ Cupom HTML padrÃ£o 80mm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ComandaMesaModal({
  mesa,
  token,
  taxasPagamento,
  onClose,
}: {
  mesa: any;
  token: string;
  taxasPagamento?: { debito: number; credito: number; pix: number };
  onClose: () => void;
}) {
const [itens, setItens] = useState<any[]>([]);
  const [comanda, setComanda] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payments, setPayments] = useState<{ method: string; amount_paid: number }[]>([]);
  const [payMethod, setPayMethod] = useState('PIX');


  const [payAmount, setPayAmount] = useState<number>(0);
  const [finalizando, setFinalizando] = useState(false);

  // â”€â”€ Extras: Taxa de ServiÃ§o e Couvert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [usaTaxa, setUsaTaxa]           = useState(true);
  const [percTaxa, setPercTaxa]         = useState(10);
  const [usaCouvert, setUsaCouvert]     = useState(false);
  const [couvertUn, setCouvertUn]       = useState(15);
  const [couvertPessoas, setCouvertPessoas] = useState(1);
  const lastSavedExtrasRef = useRef('');
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const subtotal = Number(
    comanda?.subtotal ??
      itens.reduce((acc, item) => acc + Number(item.quantity || 0) * Number(item.price_at_time || 0), 0)
  );
  const valorTaxa = Number(comanda?.valor_taxa_servico || 0);
  const valorCouvert = Number(comanda?.valor_couvert || 0);
  const total = Number(comanda?.total_com_extras ?? subtotal + valorTaxa + valorCouvert);

  const totalPago = payments.reduce((a, p) => a + p.amount_paid, 0);
  const troco = Math.max(0, totalPago - total);
  const restante = Math.max(0, total - totalPago);

  // â”€â”€ Taxa da forma de pagamento selecionada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getTaxaCartao = (method: string): number => {
    return 0;
    if (method === 'DÃ©bito')  return taxasPagamento.debito  || 0;
    if (method === 'CrÃ©dito') return taxasPagamento.credito || 0;
    if (method === 'PIX')     return taxasPagamento.pix     || 0;
    return 0;
  };
  // Soma das taxas sobre cada pagamento jÃ¡ adicionado
  const taxasJaAdicionadas = payments.reduce((acc, p) => {
    const perc = getTaxaCartao(p.method);
    return acc + (perc > 0 ? p.amount_paid * perc / 100 : 0);
  }, 0);

  // Taxa sobre o valor que estÃ¡ sendo digitado agora (preview)
  const taxaCartaoAtual    = getTaxaCartao(payMethod);
  const taxaPreview        = taxaCartaoAtual > 0 ? (payAmount || 0) * taxaCartaoAtual / 100 : 0;

  // Total a pagar = subtotal + extras + taxas de todos os pagamentos jÃ¡ adicionados + taxa do atual em digitaÃ§Ã£o
  const totalComTaxas      = total + taxasJaAdicionadas + taxaPreview;
  // Quanto o cliente jÃ¡ pagou (valor bruto + taxas jÃ¡ calculadas)
  const totalPagoComTaxas  = payments.reduce((acc, p) => {
    const perc = getTaxaCartao(p.method);
    return acc + p.amount_paid + (perc > 0 ? p.amount_paid * perc / 100 : 0);
  }, 0);
  const restanteComTaxa    = Math.max(0, totalComTaxas - totalPagoComTaxas);
  const trocoComTaxa       = Math.max(0, totalPagoComTaxas - totalComTaxas);

  const buildExtrasPayload = useCallback(() => ({
    taxa_servico_ativa: usaTaxa,
    taxa_servico_percentual: percTaxa,
    couvert_ativo: usaCouvert,
    couvert_valor_unitario: couvertUn,
    couvert_quantidade_pessoas: couvertPessoas,
  }), [usaTaxa, percTaxa, usaCouvert, couvertUn, couvertPessoas]);

  const persistExtras = useCallback(async (force = false) => {
    if (!comanda?.id) return true;

    const payload = buildExtrasPayload();
    const serialized = JSON.stringify(payload);
    if (!force && serialized === lastSavedExtrasRef.current) return true;

    try {
      const res = await fetch(`/api/mesas/${mesa.id}/comanda/extras`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: serialized,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return false;
      if (data?.comanda) setComanda(data.comanda);
      if (Array.isArray(data?.itens)) setItens(data.itens);
      lastSavedExtrasRef.current = serialized;
      return true;
    } catch {
      return false;
    }
  }, [buildExtrasPayload, comanda?.id, mesa.id, token]);

  const fetchComanda = useCallback(async () => {
    
  try {
      const res = await fetch(`/api/mesas/${mesa.id}/comanda`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setComanda(data.comanda);
      setItens(data.itens || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [mesa.id, token]);

  useEffect(() => { fetchComanda(); }, [fetchComanda]);

  useEffect(() => {
    if (!comanda) return;

    const nextState = {
      taxa_servico_ativa: Boolean(Number(comanda.taxa_servico_ativa ?? 1)),
      taxa_servico_percentual: Math.max(0, Number(comanda.taxa_servico_percentual ?? 10)),
      couvert_ativo: Boolean(Number(comanda.couvert_ativo ?? 0)),
      couvert_valor_unitario: Math.max(0, Number(comanda.couvert_valor_unitario ?? 15)),
      couvert_quantidade_pessoas: Math.max(1, Number(comanda.couvert_quantidade_pessoas ?? 1)),
    };

    lastSavedExtrasRef.current = JSON.stringify(nextState);
    setUsaTaxa(nextState.taxa_servico_ativa);
    setPercTaxa(nextState.taxa_servico_percentual);
    setUsaCouvert(nextState.couvert_ativo);
    setCouvertUn(nextState.couvert_valor_unitario);
    setCouvertPessoas(nextState.couvert_quantidade_pessoas);
  }, [
    comanda?.id,
    comanda?.taxa_servico_ativa,
    comanda?.taxa_servico_percentual,
    comanda?.couvert_ativo,
    comanda?.couvert_valor_unitario,
    comanda?.couvert_quantidade_pessoas,
  ]);

  useEffect(() => {
    if (!comanda?.id) return;

    const timeoutId = window.setTimeout(() => {
      void persistExtras();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [comanda?.id, persistExtras]);

 const handleRemoveItem = async (itemId: number) => {
    await fetch(`/api/mesas/comanda/item/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchComanda();
  };

 const handleQtyChange = async (itemId: number, qty: number) => {
    await fetch(`/api/mesas/comanda/item/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quantity: qty }),
    });
    fetchComanda();
  };

// Monta array de extras ativos para enviar ao servidor
  const buildExtras = () => {
    const ex: { name: string; value: number }[] = [];
    if (usaTaxa && valorTaxa > 0)
      ex.push({ name: `Taxa de ServiÃ§o (${percTaxa}%)`, value: valorTaxa });
    if (usaCouvert && valorCouvert > 0)
      ex.push({ name: `Couvert (${couvertPessoas} pessoa${couvertPessoas > 1 ? 's' : ''})`, value: valorCouvert });
    return ex;
  };

  const handleFinalizar = async () => {
    if (totalPago < total - 0.01) return;
    setFinalizando(true);
    try {
      await persistExtras(true);

      const res = await fetch(`/api/mesas/${mesa.id}/comanda/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          payments,
          observation: `Mesa ${mesa.numero}`,
          extras: buildExtrasPayload(),
        }),
      });

    const data = await res.json();
      if (data.success) {
        if (data.receipt) openPrintPreview(data.receipt);
        onClose();
      } else {
        alert(data.message || 'Erro ao finalizar');
      }
    } catch {
      alert('Erro ao finalizar comanda');
    } finally {
      setFinalizando(false);
    }
  };

const handlePrintComanda = async () => {
    try {
      const win = await openPrintPreviewFromUrl(`/api/mesas/${mesa.id}/comanda-html`, token);
      if (!win) {
        alert('Permita popups para imprimir.');
      }
    } catch {
      alert('Erro ao gerar impressao da comanda.');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className={`p-6 flex items-center justify-between border-b border-zinc-100 ${
          mesa.status === 'aberta' ? 'bg-emerald-50' : 'bg-zinc-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-2xl ${
              mesa.status === 'aberta' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'
            }`}>
              {mesa.numero}
            </div>
            <div>
              <h2 className="font-black text-zinc-900 text-lg">Mesa {mesa.numero}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${
                  mesa.status === 'aberta' ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'
                }`} />
                <span className={`text-xs font-bold ${
                  mesa.status === 'aberta' ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {mesa.status === 'aberta' ? 'Aberta' : 'Fechada'}
                </span>
                {comanda?.created_at && (
                  <span className="text-xs text-zinc-400">
                    Â· desde {new Date((comanda?.created_at ?? '') + ((comanda?.created_at ?? '').includes('Z') ? '' : '-03:00')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-xl text-zinc-400">
            <X size={20} />
          </button>
        </div>

        {/* Itens da comanda */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-7 h-7 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
            </div>
          ) : itens.length === 0 ? (
            <div className="text-center py-10 text-zinc-400">
              <p className="font-medium">Comanda vazia</p>
              <p className="text-xs mt-1">Adicione itens pelo PDV ou pelo cardÃ¡pio</p>
            </div>
          ) : (
            <div className="space-y-2">
              {itens.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-zinc-900 truncate">{item.product_name}</p>
                    <p className="text-xs text-zinc-400">R$ {item.price_at_time.toFixed(2)} un.</p>
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5">
                    <button
                      onClick={() => handleQtyChange(item.id, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-zinc-100 rounded-md transition-all text-zinc-600"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-7 text-center font-bold text-sm">{item.quantity}</span>
                    <button
                      onClick={() => handleQtyChange(item.id, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-zinc-100 rounded-md transition-all text-zinc-600"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <p className="w-20 text-right font-black text-sm text-zinc-900">
                    R$ {(item.quantity * item.price_at_time).toFixed(2)}
                  </p>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-zinc-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {itens.length > 0 && (
          <div className="border-t border-zinc-200 p-5 space-y-4 bg-zinc-50">

            {/* â”€â”€ CobranÃ§as Adicionais â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center gap-2">
                <Settings size={13} className="text-zinc-400" />
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">CobranÃ§as adicionais</span>
              </div>

              {/* Taxa de ServiÃ§o */}
              <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-100">
                <button
                  onClick={() => setUsaTaxa(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${usaTaxa ? 'bg-emerald-500' : 'bg-zinc-200'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${usaTaxa ? 'left-4' : 'left-0.5'}`} />
                </button>
                <div className="flex-1">
                  <p className="text-xs font-bold text-zinc-700">Taxa de ServiÃ§o / GarÃ§om</p>
                  <p className={`text-[10px] ${usaTaxa ? 'text-emerald-600 font-semibold' : 'text-zinc-400'}`}>
                    {usaTaxa ? `+ R$ ${valorTaxa.toFixed(2)}` : 'Desativado'}
                  </p>
                </div>
                {usaTaxa && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPercTaxa(v => Math.max(1, v - 1))}
                      className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-xs font-bold"
                    >âˆ’</button>
                    <span className="w-10 text-center text-sm font-black text-zinc-800">{percTaxa}%</span>
                    <button
                      onClick={() => setPercTaxa(v => Math.min(30, v + 1))}
                      className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-xs font-bold"
                    >+</button>
                  </div>
                )}
              </div>

              {/* Couvert */}
              <div className="px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => setUsaCouvert(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${usaCouvert ? 'bg-emerald-500' : 'bg-zinc-200'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${usaCouvert ? 'left-4' : 'left-0.5'}`} />
                </button>
                <div className="flex-1">
                  <p className="text-xs font-bold text-zinc-700">Couvert ArtÃ­stico</p>
                  <p className={`text-[10px] ${usaCouvert ? 'text-emerald-600 font-semibold' : 'text-zinc-400'}`}>
                    {usaCouvert ? `R$ ${couvertUn.toFixed(2)} Ã— ${couvertPessoas} pessoa${couvertPessoas > 1 ? 's' : ''} = R$ ${valorCouvert.toFixed(2)}` : 'Desativado'}
                  </p>
                </div>
                {usaCouvert && (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-400 uppercase">Valor/px</span>
                      <input
                        type="number"
                        value={couvertUn}
                        onChange={e => setCouvertUn(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-16 text-right text-xs font-bold border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900/10"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-400 uppercase">Pessoas</span>
                      <button
                        onClick={() => setCouvertPessoas(v => Math.max(1, v - 1))}
                        className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-xs font-bold"
                      >âˆ’</button>
                      <span className="w-5 text-center text-sm font-black text-zinc-800">{couvertPessoas}</span>
                      <button
                        onClick={() => setCouvertPessoas(v => v + 1)}
                        className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-xs font-bold"
                      >+</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

            {/* Resumo de valores */}
            <div className="space-y-1">
              {(usaTaxa || usaCouvert) && (
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Subtotal</span>
                  <span>R$ {subtotal.toFixed(2)}</span>
                </div>
              )}
              {usaTaxa && valorTaxa > 0 && (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Taxa de ServiÃ§o ({percTaxa}%)</span>
                  <span>R$ {valorTaxa.toFixed(2)}</span>
                </div>
              )}
              {usaCouvert && valorCouvert > 0 && (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Couvert ({couvertPessoas} px)</span>
                  <span>R$ {valorCouvert.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold text-zinc-500">Total</span>
                <span className="text-2xl font-black text-zinc-900">R$ {total.toFixed(2)}</span>
              </div>
            </div>

            {!showPayment ? (
              <div className="flex gap-2">
                <button
                  onClick={handlePrintComanda}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl font-bold text-sm text-zinc-700 transition-all"
                >
                  <Printer size={15} />
                  Imprimir
                </button>
                <button
                  onClick={() => setShowPayment(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-bold text-sm transition-all"
                >
                  <CheckCircle2 size={15} />
                  Fechar Conta
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Pagamento</p>

                <div className="grid grid-cols-4 gap-1.5">
                  {['Dinheiro', 'PIX', 'DÃ©bito', 'CrÃ©dito'].map(m => (
                    <button
                      key={m}
                      onClick={() => setPayMethod(m)}
                      className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                        payMethod === m ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
                      }`}
                    >
                      <span>{m}</span>
                      {getTaxaCartao(m) > 0 && (
                        <span className={`block text-[9px] font-bold mt-0.5 ${payMethod === m ? 'text-zinc-300' : 'text-amber-500'}`}>
                          +{getTaxaCartao(m)}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Valor"
                    value={payAmount || ''}
                    onChange={e => setPayAmount(parseFloat(e.target.value))}
                    className="flex-1 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                  <button
                    onClick={() => {
                      if (payAmount > 0) {
                        setPayments(prev => [...prev, { method: payMethod, amount_paid: payAmount }]);
                        setPayAmount(0);
                      }
                    }}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold transition-all"
                  >
                    + Add
                  </button>
                </div>

                {payments.map((p, i) => {
                  const perc = getTaxaCartao(p.method);
                  const taxa = perc > 0 ? p.amount_paid * perc / 100 : 0;
                  return (
                    <div key={i} className="bg-white rounded-lg p-2 text-sm border border-zinc-100">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-700">{p.method}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">R$ {p.amount_paid.toFixed(2)}</span>
                          <button onClick={() => setPayments(prev => prev.filter((_, j) => j !== i))} className="text-red-400">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                      {taxa > 0 && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-amber-600 font-bold">Taxa {p.method} ({perc}%)</span>
                          <span className="text-[10px] text-amber-600 font-bold">+ R$ {taxa.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Preview taxa do mÃ©todo atual sendo digitado */}
                {taxaPreview > 0 && (
                  <div className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <span className="text-amber-700 font-bold">Taxa {payMethod} ({taxaCartaoAtual}%) s/ R$ {(payAmount||0).toFixed(2)}</span>
                    <span className="text-amber-700 font-bold">+ R$ {taxaPreview.toFixed(2)}</span>
                  </div>
                )}
                {/* Total consolidado */}
                {(taxasJaAdicionadas + taxaPreview) > 0 && (
                  <div className="flex items-center justify-between text-sm font-bold border-t border-zinc-100 pt-1">
                    <span className="text-zinc-500">Total c/ taxas</span>
                    <span className="text-zinc-900">R$ {totalComTaxas.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold">
                  <span className={restanteComTaxa > 0 ? 'text-red-500' : 'text-zinc-400'}>
                    Restante: R$ {restanteComTaxa.toFixed(2)}
                  </span>
                  {trocoComTaxa > 0 && (
                    <span className="text-emerald-600">Troco: R$ {trocoComTaxa.toFixed(2)}</span>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setShowPayment(false); setPayments([]); setPayAmount(0); }}
                    className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl font-bold text-sm transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleFinalizar}
                    disabled={finalizando || restanteComTaxa > 0.01}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                  >
                    {finalizando ? 'Finalizando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
