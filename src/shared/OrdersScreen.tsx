import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Clock,
  FileText,
  ChevronRight,
  X,
  Printer,
  Monitor,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, Category, OrderItem, OrderType, PaymentMethod, Order, DashboardStats, CashReport, Expense, Caixa, Ingrediente, MovimentacaoEstoque } from '../types';
import { getSegCfg } from '../config/segmentos';
import { Card, Button, Input } from '../components/ui/Card';

export default function OrdersScreen({
  token, segmento: _segmento, displaySlug, onShowQR,
}: {
  token: string;
  segmento?: string;
  displaySlug?: string | null;
  onShowQR?: () => void;
}) {
  const cfg = getSegCfg(_segmento);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'receipts'>('active');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [orderToDelete, setOrderToDelete] = useState<number | null>(null);
  const [deleteStep, setDeleteStep] = useState<'password' | 'confirm1' | 'confirm2'>('password');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRestock, setCancelRestock] = useState(true);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    day: '', month: (new Date().getMonth() + 1).toString(), year: new Date().getFullYear().toString()
  });

  // Decode JWT to get slug for KDS link
  const kdsSlug = React.useMemo(() => {
    try { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')))?.username || ''; }
    catch { return ''; }
  }, [token]);

  // useCallback garante referência estável — sem isso fetchOrders é recriada
  // a cada render e o useEffect abaixo dispararia em loop infinito
  const fetchOrders = React.useCallback(async () => {
    let url = '/api/orders';
    if (activeTab === 'receipts') {
      const q = new URLSearchParams();
      if (filters.day) q.append('day', filters.day);
      if (filters.month) q.append('month', filters.month);
      if (filters.year) q.append('year', filters.year);
      url += '?' + q.toString();
    }
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } catch {}
  }, [token, activeTab, filters]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh active orders every 20s
  useEffect(() => {
    if (activeTab !== 'active') return;
    const id = setInterval(fetchOrders, 20000);
    return () => clearInterval(id);
  }, [activeTab, fetchOrders]);

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    fetchOrders();
  };

  const handleDeleteClick = (id: number) => {
    setOrderToDelete(id); setDeleteStep('password');
    setShowAuthModal(true); setAuthPassword('');
  };

  const handleCancelClick = (order: Order) => {
    setOrderToCancel(order);
    setCancelPassword('');
    setCancelReason('');
    setCancelRestock(order.status === 'Criado' || order.status === 'Pedido Recebido');
    setShowCancelModal(true);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ senha: authPassword }),
      });
      if (!res.ok) { alert('Senha incorreta!'); return; }
      setDeleteStep('confirm1');
    } catch {
      alert('Erro de conexão ao verificar senha.');
    }
  };

 const confirmDelete = async () => {
  if (deleteStep === 'confirm1') {
    setDeleteStep('confirm2');
    return;
  }

  if (!orderToDelete) return;

  try {
    const res = await fetch(`/api/orders/${orderToDelete}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subsenha: authPassword }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok) {
      fetchOrders();
      setShowAuthModal(false);
      setOrderToDelete(null);
      setAuthPassword('');
      setDeleteStep('password');
      return;
    }

    if (res.status === 403) {
      alert(data?.error || 'Subsenha inválida');
      return;
    }

    if (res.status === 400) {
      alert(data?.error || 'Dados inválidos');
      return;
    }

    alert(data?.error || 'Erro ao excluir pedido.');
  } catch {
    alert('Erro de conexão ao excluir pedido.');
  }
};

  const submitCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orderToCancel) return;

    if (!cancelReason.trim()) {
      alert('Informe o motivo do cancelamento.');
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderToCancel.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subsenha: cancelPassword,
          motivo: cancelReason.trim(),
          estoque_reposto: cancelRestock,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setShowCancelModal(false);
        setOrderToCancel(null);
        setCancelPassword('');
        setCancelReason('');
        fetchOrders();
        return;
      }

      alert(data?.error || 'Erro ao cancelar pedido.');
    } catch {
      alert('Erro de conexão ao cancelar pedido.');
    }
  };

  const PIPELINE = ['Criado', 'Em Preparo', 'Pronto', 'Entregue'];
  // Mapa de normalização delivery → pipeline padrão
  const STATUS_NORM_OS: Record<string,string> = {
    'Pedido Recebido': 'Criado',
    'Pronto para Entrega': 'Pronto',
    'Saiu para Entrega': 'Pronto',
    'Entregue': 'Entregue',
  };
  const normalizeStatus = (s: string) => STATUS_NORM_OS[s] || s;

  const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string; emoji: string }> = {
    'Criado':          { color: '#3b82f6', bg: '#eff6ff', dot: '#3b82f6', emoji: '🆕' },
    'Pedido Recebido': { color: '#3b82f6', bg: '#eff6ff', dot: '#3b82f6', emoji: '🛵' },
    'Em Preparo':      { color: '#d97706', bg: '#fffbeb', dot: '#f59e0b', emoji: '🔥' },
    'Pronto':          { color: '#059669', bg: '#ecfdf5', dot: '#10b981', emoji: '✅' },
    'Pronto para Entrega': { color: '#8b5cf6', bg: '#f5f3ff', dot: '#8b5cf6', emoji: '📦' },
    'Saiu para Entrega':   { color: '#f97316', bg: '#fff7ed', dot: '#f97316', emoji: '🛵' },
    'Entregue':        { color: '#71717a', bg: '#f9f9f9', dot: '#a1a1aa', emoji: '🎉' },
    'Cancelado':       { color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', emoji: 'X' },
  };

  const getStatusCfg = (s: string) => STATUS_CONFIG[s] || STATUS_CONFIG['Criado'];

  const STATUSES_FINAIS = ['Entregue', 'Concluído', 'concluido', 'cancelado', 'Cancelado', cfg.statusConcluido];
  const activeOrders = orders.filter(o => !STATUSES_FINAIS.includes(o.status));
  const nextStatus = (current: string) => {
    const norm = normalizeStatus(current);
    const idx = PIPELINE.indexOf(norm);
    if (idx >= 0 && idx < PIPELINE.length - 1) return PIPELINE[idx + 1];
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">{cfg.tituloPedidos}</h2>
          <p className="text-zinc-400 text-sm">Acompanhe e gerencie os pedidos do dia</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">

          {/* Tela Cliente — só para restaurante/bar com slug */}
          {displaySlug && (
            <a
              href={`/display/${displaySlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 transition-all"
            >
              <Monitor size={15} /> Tela Cliente
            </a>
          )}

          {/* QR das Mesas */}
          {onShowQR && (
            <button
              onClick={onShowQR}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 transition-all"
            >
              <span className="text-base leading-none">🪑</span> QR das Mesas
            </button>
          )}

          {/* Tela da Cozinha (KDS) */}
          {kdsSlug && (
            <button
              onClick={() => window.open(`/kds/${kdsSlug}`, '_blank', 'noopener')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: '#18181b', color: '#fff' }}
            >
              <Monitor size={15} /> Tela da Cozinha
            </button>
          )}

          {/* Tabs Pedidos / Histórico */}
          <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 gap-0.5">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'active' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-200'}`}
            >
              {cfg.tituloAtivos}
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'receipts' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-200'}`}
            >
              Histórico
            </button>
          </div>

        </div>
      </div>

      {/* Filtros (histórico) */}
      {activeTab === 'receipts' && (
        <Card className="p-4 mb-5 flex flex-wrap items-end gap-4 bg-zinc-50">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Dia</label>
            <input type="number" placeholder="Ex: 05" className="w-20 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none"
              value={filters.day} onChange={e => setFilters({...filters, day: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Mês</label>
            <select className="w-32 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none"
              value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}>
              <option value="">Todos</option>
              {Array.from({length:12},(_,i) => <option key={i+1} value={i+1}>{new Date(0,i).toLocaleString('pt-BR',{month:'long'})}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Ano</label>
            <input type="number" className="w-24 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none"
              value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})} />
          </div>
          <Button onClick={fetchOrders} variant="secondary" className="h-9">Filtrar</Button>
        </Card>
      )}

      {/* PEDIDOS ATIVOS — Kanban visual */}
      {activeTab === 'active' && (
        <div className="space-y-3">
          {activeOrders.length === 0 && (
            <div className="text-center py-20 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
              <span className="text-5xl block mb-3">🍽️</span>
              <p className="text-zinc-400 font-medium">Nenhum pedido ativo</p>
              <p className="text-zinc-300 text-sm mt-1">Os pedidos aparecerão aqui em tempo real</p>
            </div>
          )}
          {activeOrders.map(order => {
            const sc = getStatusCfg(order.status);
            const next = nextStatus(order.status);
            const pipeIdx = PIPELINE.indexOf(normalizeStatus(order.status));
            const isLevar = (order as any).tipo_retirada === 'levar';
            const isDelivery = (order as any).canal === 'delivery';
            const elapsed = Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000));
            return (
              <div key={order.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isDelivery ? 'border-orange-200' : 'border-zinc-100'}`}>
                {/* Top stripe — laranja para delivery */}
                <div className="h-1.5" style={{ background: isDelivery ? '#f97316' : sc.dot }} />
                {/* Banner delivery */}
                {isDelivery && (
                  <div className="bg-orange-50 border-b border-orange-100 px-4 py-2 flex items-center gap-2">
                    <span className="text-sm">🛵</span>
                    <span className="text-xs font-black text-orange-700 uppercase tracking-wider">Delivery</span>
                    {(order as any).cliente_nome && <span className="text-xs text-orange-600 font-semibold">— {(order as any).cliente_nome}</span>}
                    {(order as any).cliente_tel && <span className="text-xs text-orange-500 ml-1">({(order as any).cliente_tel})</span>}
                    {(order as any).pagamento_status === 'aguardando' && (
                      <span className="ml-auto text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⏳ PIX AGUARDANDO</span>
                    )}
                    {(order as any).pagamento_status === 'pago' && (
                      <span className="ml-auto text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✅ PIX PAGO</span>
                    )}
                    {(order as any).pagamento_status === 'na_entrega' && (
                      <span className="ml-auto text-[10px] font-black bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">💳 PAGAR NA ENTREGA</span>
                    )}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    {/* Esquerda: senha + tipo */}
                    <div className="flex items-center gap-3">
                      {/* Senha */}
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl shrink-0 font-black"
                        style={{ background: isDelivery ? '#fff7ed' : sc.bg, color: isDelivery ? '#ea580c' : sc.color }}>
                        {(() => {
                          const obs  = (order as any).observation || '';
                          const mesaMatch = obs.match(/Mesa\s+(\d+)/i);
                          const hasSenha  = (order as any).senha_pedido && (order as any).senha_pedido !== 0;
                          if (isDelivery) return (
                            <>
                              <span className="text-[8px] uppercase tracking-widest opacity-70">Deliv</span>
                              <span className="text-lg leading-none">🛵</span>
                            </>
                          );
                          if (hasSenha) return (
                            <>
                              <span className="text-[9px] uppercase tracking-widest opacity-70">Senha</span>
                              <span className="text-2xl leading-none">{String((order as any).senha_pedido).padStart(2,'0')}</span>
                            </>
                          );
                          if (mesaMatch) return (
                            <>
                              <span className="text-[9px] uppercase tracking-widest opacity-70">Mesa</span>
                              <span className="text-2xl leading-none">{mesaMatch[1]}</span>
                            </>
                          );
                          return (
                            <>
                              <span className="text-[9px] uppercase tracking-widest opacity-70">Pedido</span>
                              <span className="text-xl leading-none">#{order.id}</span>
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Tipo badge */}
                          {isDelivery ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">🛵 Delivery</span>
                          ) : (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{ background: isLevar ? '#fef3c7' : '#eff6ff', color: isLevar ? '#92400e' : '#1d4ed8' }}>
                              {isLevar ? '🛍️ Para Levar' : '🪑 Consumo Local'}
                            </span>
                          )}
                          {/* Status badge */}
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: sc.bg, color: sc.color }}>
                            {sc.emoji} {order.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-bold text-zinc-500">R$ {order.total_amount.toFixed(2)}</span>
                          <span className="text-xs text-zinc-300">·</span>
                          <span className="text-xs text-zinc-400" title={new Date(order.created_at).toLocaleString('pt-BR')}>
                            {elapsed === 0 ? 'agora' : `${elapsed}min atrás`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Direita: ações */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Avançar status */}
                      {next && (
                        <button onClick={() => updateStatus(order.id, next)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                          style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.dot}22` }}>
                          <ChevronRight size={14} /> {next}
                        </button>
                      )}
                      {/* Imprimir comanda */}
                      <button
                        onClick={async () => {
                          // Tenta impressora térmica; se não configurada, abre janela browser
                          try {
                            const r = await fetch(`/api/print/comanda/${order.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                            const d = await r.json();
                            if (!d.success) {
                              // Fallback: browser print
                              const rh = await fetch(`/api/print/comanda-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                              const html = await rh.text();
                              const w = window.open('', '_blank', 'width=420,height=600');
                              if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                            }
                          } catch {
                            const rh = await fetch(`/api/print/comanda-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            const html = await rh.text();
                            const w = window.open('', '_blank', 'width=420,height=600');
                            if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                          }
                        }}
                        className="p-2 hover:bg-zinc-100 text-zinc-400 rounded-lg transition-colors" title="Imprimir Comanda (Cozinha)">
                        <Printer size={16} />
                      </button>
                      <button onClick={async () => {
                          try {
                            const r = await fetch(`/api/print/cupom-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            const html = await r.text();
                            setSelectedReceipt(html);
                          } catch { setSelectedReceipt(order.receipt_text || 'Recibo não disponível'); }
                        }}
                        className="p-2 hover:bg-zinc-100 text-zinc-400 rounded-lg transition-colors" title="Ver Recibo">
                        <FileText size={16} />
                      </button>
                      <button onClick={() => handleCancelClick(order)}
                        className="p-2 hover:bg-amber-50 text-amber-500 rounded-lg transition-colors" title="Cancelar Pedido">
                        <X size={16} />
                      </button>
                      <button onClick={() => handleDeleteClick(order.id)}
                        className="p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors" title="Excluir Administrativamente">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Pipeline progress */}
                  <div className="mt-3 flex items-center gap-1">
                    {PIPELINE.map((step, i) => (
                      <React.Fragment key={step}>
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all"
                            style={i <= pipeIdx
                              ? { background: sc.dot, color: '#fff' }
                              : { background: '#f0f0f0', color: '#a1a1aa' }}>
                            {i < pipeIdx ? '✓' : i === pipeIdx ? '●' : '○'}
                          </div>
                          <span className="text-[8px] font-medium whitespace-nowrap" style={{ color: i <= pipeIdx ? sc.color : '#d1d5db' }}>{step}</span>
                        </div>
                        {i < PIPELINE.length - 1 && (
                          <div className="flex-1 h-0.5 mb-3 transition-all" style={{ background: i < pipeIdx ? sc.dot : '#f0f0f0' }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Itens */}
                  {(order.items || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(order.items || []).map((item: any, i: number) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-lg bg-zinc-50 text-zinc-600 border border-zinc-100">
                          {item.quantity}× {item.product_name}
                        </span>
                      ))}
                    </div>
                  )}

                  {order.observation && (
                    <div className={`mt-2 text-xs rounded-xl px-3 py-2 border ${isDelivery ? 'bg-orange-50 border-orange-100 text-orange-900' : 'bg-zinc-50 border-zinc-100 text-zinc-500 italic'}`}>
                      {isDelivery
                        ? order.observation.split('\n').map((line: string, i: number) => (
                            <p key={i} className={`${i === 0 ? 'font-black text-orange-800' : 'font-medium mt-0.5'}`}>{line}</p>
                          ))
                        : <span>📝 {order.observation}</span>
                      }
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HISTÓRICO */}
      {activeTab === 'receipts' && (
        <div className="space-y-2">
          {orders.length === 0 && (
            <div className="text-center py-20 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
              <Clock size={40} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-zinc-400">Nenhum pedido encontrado</p>
            </div>
          )}
          {orders.map(order => {
            const sc = getStatusCfg(order.status);
            const isLevar = (order as any).tipo_retirada === 'levar';
            return (
              <div key={order.id} className="bg-white rounded-xl border border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                  style={{ background: sc.bg, color: sc.color }}>
                  {(() => {
                    const obs2 = (order as any).observation || '';
                    const m2   = obs2.match(/Mesa\s+(\d+)/i);
                    const s    = (order as any).senha_pedido;
                    if (s && s !== 0) return String(s).padStart(2,'0');
                    if (m2) return `M${m2[1]}`;
                    return `#${order.id}`;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-zinc-700">#{order.order_number}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: sc.bg, color: sc.color }}>{order.status}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: isLevar ? '#fef3c7' : '#eff6ff', color: isLevar ? '#92400e' : '#1d4ed8' }}>
                      {isLevar ? '🛍️' : '🪑'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {new Date(order.created_at).toLocaleString('pt-BR')} · R$ {order.total_amount.toFixed(2)}
                  </p>
                  {order.cancelamento_motivo && (
                    <p className="text-[11px] text-red-500 mt-1 truncate">
                      Cancelado: {order.cancelamento_motivo}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                      <button onClick={async () => {
                          // Busca cupom HTML padrão e abre janela de impressão
                          try {
                            const r = await fetch(`/api/print/cupom-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            const html = await r.text();
                            const w = window.open('', '_blank', 'width=420,height=700');
                            if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                          } catch { /* fallback: receipt_text */ setSelectedReceipt(order.receipt_text || ''); }
                        }}
                        className="p-2 hover:bg-emerald-50 text-emerald-500 rounded-lg" title="Imprimir na tela">
                        <Printer size={15} />
                      </button>
                  <button onClick={async () => {
                      try {
                        const r = await fetch(`/api/print/cupom-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        const html = await r.text();
                        setSelectedReceipt(html);
                      } catch { setSelectedReceipt(order.receipt_text || ''); }
                    }}
                    className="p-2 hover:bg-zinc-100 text-zinc-400 rounded-lg"><FileText size={15} /></button>
                  <button onClick={() => handleDeleteClick(order.id)}
                    className="p-2 hover:bg-red-50 text-red-400 rounded-lg" title="Excluir Administrativamente"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Recibo */}
      <AnimatePresence>
        {selectedReceipt && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-zinc-900">Recibo do Pedido</h3>
                <button onClick={() => setSelectedReceipt(null)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-auto rounded-2xl border border-zinc-200 mb-5 bg-white" style={{minHeight: 220}}>
                <iframe
                  srcDoc={selectedReceipt.startsWith('<!DOCTYPE') || selectedReceipt.startsWith('<html') ? selectedReceipt : `<html><body><pre style="font-family:monospace;font-size:12px;padding:16px">${selectedReceipt}</pre></body></html>`}
                  style={{ width: '100%', minHeight: 280, border: 'none', borderRadius: 12 }}
                  title="Recibo"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={() => {
                  const win = window.open('', '_blank', 'width=420,height=700');
                  if (!win) return;
                  if (selectedReceipt.startsWith('<!DOCTYPE') || selectedReceipt.startsWith('<html')) win.document.write(selectedReceipt);
                  else win.document.write(`<html><body><pre style="font-family:monospace;font-size:12px;padding:16px">${selectedReceipt}</pre><script>window.print()<\/script></body></html>`);
                  win.document.close();
                }} variant="secondary" className="flex-1 flex items-center gap-2 justify-center"><Printer size={15}/> Imprimir</Button>
                <Button onClick={() => setSelectedReceipt(null)} className="flex-1">Fechar</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

{/* Modal de Autenticação para Exclusão */}
{/* Modal de Cancelamento */}
<AnimatePresence>
  {showCancelModal && orderToCancel && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[121] flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
      >
        <form onSubmit={submitCancelOrder} className="space-y-4">
          <div>
            <h3 className="text-xl font-bold text-zinc-900">Cancelar Pedido</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O pedido permanecerÃ¡ no histÃ³rico e serÃ¡ marcado como cancelado.
            </p>
            <p className="text-xs font-semibold text-zinc-400 mt-2">
              Pedido: #{orderToCancel.order_number}
            </p>
          </div>

          <Input
            label="Subsenha"
            type="password"
            value={cancelPassword}
            onChange={(e: any) => setCancelPassword(e.target.value)}
            autoFocus
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Motivo</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all resize-none"
              placeholder="Ex: cliente desistiu, item indisponÃ­vel, erro de lanÃ§amento"
            />
          </div>

          <label className="flex items-start gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
            <input
              type="checkbox"
              checked={cancelRestock}
              onChange={(e) => setCancelRestock(e.target.checked)}
              className="mt-1 rounded border-zinc-300"
            />
            <span>
              <span className="block text-sm font-semibold text-zinc-700">Repor estoque</span>
              <span className="block text-xs text-zinc-500">Use apenas se os itens realmente puderem voltar ao estoque.</span>
            </span>
          </label>

          <div className="flex gap-3">
            <Button type="submit" variant="danger" className="flex-1">
              Confirmar Cancelamento
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowCancelModal(false);
                setOrderToCancel(null);
                setCancelPassword('');
                setCancelReason('');
              }}
              variant="secondary"
              className="flex-1"
            >
              Fechar
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )}
</AnimatePresence>

{/* Modal de Cancelamento */}
{/* Modal de AutenticaÃ§Ã£o para ExclusÃ£o */}
<AnimatePresence>
  {showAuthModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
      >
        {deleteStep === 'password' && (
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <h3 className="text-xl font-bold text-zinc-900">Autenticação Necessária</h3>
            <p className="text-sm text-zinc-500">
              Insira a subsenha do usuário para excluir o pedido.
            </p>

            <Input
              label="Subsenha"
              type="password"
              value={authPassword}
              onChange={(e: any) => setAuthPassword(e.target.value)}
              autoFocus
            />

            <div className="flex gap-3">
              <Button type="submit" className="flex-1">
                Confirmar
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthPassword('');
                  setOrderToDelete(null);
                  setDeleteStep('password');
                }}
                variant="secondary"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {(deleteStep === 'confirm1' || deleteStep === 'confirm2') && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={28} className="text-red-600" />
            </div>

            <h3 className="text-xl font-bold text-zinc-900">
              {deleteStep === 'confirm1' ? 'Tem certeza?' : 'Última confirmação!'}
            </h3>

            <p className="text-sm text-zinc-500">
              {deleteStep === 'confirm1'
                ? 'Esta ação não pode ser desfeita.'
                : 'O pedido será excluído permanentemente.'}
            </p>

            <div className="flex gap-3">
              <Button onClick={confirmDelete} variant="danger" className="flex-1">
                {deleteStep === 'confirm1' ? 'Sim, excluir' : '⚠️ Confirmar exclusão'}
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthPassword('');
                  setOrderToDelete(null);
                setDeleteStep('password');
              }}
              variant="secondary"
              className="flex-1"
            >
              Cancelar
            </Button>
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
