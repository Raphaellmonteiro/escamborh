import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trash2,
  Bike,
  Clock,
  FileText,
  ChevronRight,
  X,
  Printer,
  Monitor,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, Category, OrderItem, OrderType, PaymentMethod, Order, DashboardStats, CashReport, Expense, Caixa, Ingrediente, MovimentacaoEstoque } from '../types';
import { getSegCfg } from '../config/segmentos';
import { Card, Button, Input } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { getNonDeliveryNextStatus, normalizeStatusForPipeline, ORDER_PIPELINE_STEPS } from '../utils/orderNonDeliveryNextStatus';
import { openPrintPreview, ensurePrintableHtmlDocument, isPrintableHtmlDocument } from '../utils/print';

type OrderWithRefund = Order & {
  reembolso_status?: string | null;
  valor_reembolsado?: number | null;
  reembolsado_at?: string | null;
  reembolso_motivo?: string | null;
};

type OrderHistoryEvent = {
  id: number | string;
  tipo: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  valor?: number | null;
  motivo?: string | null;
  estoque_reposto?: boolean;
  payload?: Record<string, unknown> | null;
  usuario_id?: number | null;
  created_at: string;
  synthetic?: boolean;
};

type OrderScreenItem = OrderItem & {
  product_name?: string | null;
  product_category?: string | null;
  production_type?: string | null;
  requires_preparation?: number | boolean | null;
};

type HistoryDetail = {
  label: string;
  value: string;
};

type OrderChannelMeta = {
  kind: 'delivery' | 'pickup' | 'dine_in' | 'counter';
  label: string;
  icon: React.ElementType;
  badgeClassName: string;
  detailClassName: string;
};

export default function OrdersScreen({
  token, segmento: _segmento, displaySlug, onShowQR, channelFilter = 'all',
}: {
  token: string;
  segmento?: string;
  displaySlug?: string | null;
  onShowQR?: () => void;
  channelFilter?: 'all' | 'non_delivery';
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
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundPassword, setRefundPassword] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [orderToRefund, setOrderToRefund] = useState<OrderWithRefund | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);
  const [historyEvents, setHistoryEvents] = useState<OrderHistoryEvent[]>([]);
  const [filters, setFilters] = useState({
    day: '', month: (new Date().getMonth() + 1).toString(), year: new Date().getFullYear().toString()
  });

  const pdvDeeplinkOrderIdRef = useRef<number | null>(null);

  // Deeplink admin → aba Pedidos e rolar até o pedido (quando estiver na lista)
  useEffect(() => {
    if (!token) return;
    try {
      const raw = localStorage.getItem('flowpdv_orders_deeplink') || sessionStorage.getItem('flowpdv_orders_deeplink');
      if (!raw) return;
      localStorage.removeItem('flowpdv_orders_deeplink');
      sessionStorage.removeItem('flowpdv_orders_deeplink');
      const o = JSON.parse(raw) as { orderId?: number; tab?: 'active' | 'receipts'; orderCreatedAt?: string };
      const oid = Number(o.orderId);
      if (!Number.isFinite(oid)) return;
      pdvDeeplinkOrderIdRef.current = oid;
      const tab = o.tab === 'receipts' ? 'receipts' : 'active';
      setActiveTab(tab);
      if (tab === 'receipts' && o.orderCreatedAt) {
        const d = new Date(o.orderCreatedAt);
        setFilters({
          day: String(d.getDate()),
          month: String(d.getMonth() + 1),
          year: String(d.getFullYear()),
        });
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    const oid = pdvDeeplinkOrderIdRef.current;
    if (oid == null) return;
    const found = orders.some((o) => Number(o.id) === oid);
    if (!found) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-pdv-order-id="${oid}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      pdvDeeplinkOrderIdRef.current = null;
    }, 400);
    return () => window.clearTimeout(t);
  }, [orders]);

  // Decode JWT to get slug for KDS link
  const kdsSlug = React.useMemo(() => {
    try { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')))?.username || ''; }
    catch { return ''; }
  }, [token]);

  const isDeliveryOrder = React.useCallback(
    (order: Order) => (order as any).canal === 'delivery',
    []
  );

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
      if (Array.isArray(data)) {
        const filteredOrders = channelFilter === 'non_delivery'
          ? data.filter((order) => !isDeliveryOrder(order))
          : data;
        setOrders(filteredOrders);
      }
    } catch {}
  }, [token, activeTab, filters, channelFilter, isDeliveryOrder]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh active orders every 20s
  useEffect(() => {
    if (activeTab !== 'active') return;
    const id = setInterval(fetchOrders, 20000);
    return () => clearInterval(id);
  }, [activeTab, fetchOrders]);

  const formatMoney = (value: number) => `R$ ${value.toFixed(2)}`;
  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString('pt-BR') : '';

  const getRefundMeta = (order: OrderWithRefund) => {
    const refundedAmount = Number(order.valor_reembolsado || 0);
    const refundStatus = String(order.reembolso_status || '').trim().toLowerCase();

    if (refundStatus !== 'parcial' && refundStatus !== 'total') {
      return null;
    }

    return {
      refundedAmount,
      isTotal: refundStatus === 'total',
      label: refundStatus === 'total' ? 'Reembolso total' : 'Reembolso parcial',
      tone: refundStatus === 'total'
        ? { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
        : { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    };
  };

  const getMesaReference = (order: Order) => {
    const mesaId = (order as any).mesa_id;
    if (mesaId) return String(mesaId);

    const observation = String((order as any).observation || '');
    const mesaMatch = observation.match(/Mesa\s+(\d+)/i);
    return mesaMatch ? mesaMatch[1] : null;
  };

  const getOrderReference = (order: Order, isDelivery: boolean) => {
    const mesaReference = getMesaReference(order);
    const senhaPedido = (order as any).senha_pedido;
    const hasSenha = senhaPedido && senhaPedido !== 0;

    if (isDelivery) {
      return { label: 'Canal', value: 'DEL' };
    }

    if (hasSenha) {
      return { label: 'Senha', value: String(senhaPedido).padStart(2, '0') };
    }

    if (mesaReference) {
      return { label: 'Mesa', value: mesaReference };
    }

    return { label: 'Pedido', value: String(order.id) };
  };

  const getOrderChannelMeta = (order: Order): OrderChannelMeta => {
    const isDelivery = (order as any).canal === 'delivery';
    const isLevar = (order as any).tipo_retirada === 'levar';
    const mesaReference = getMesaReference(order);

    if (isDelivery) {
      return {
        kind: 'delivery',
        label: 'Entrega',
        icon: Bike,
        badgeClassName: 'bg-orange-100 text-orange-700 border-orange-200',
        detailClassName: 'text-orange-700',
      };
    }

    if (isLevar) {
      return {
        kind: 'pickup',
        label: 'Retirada no local',
        icon: ShoppingBag,
        badgeClassName: 'bg-amber-100 text-amber-700 border-amber-200',
        detailClassName: 'text-amber-700',
      };
    }

    if (mesaReference) {
      return {
        kind: 'dine_in',
        label: 'Consumo no local',
        icon: UtensilsCrossed,
        badgeClassName: 'bg-blue-100 text-blue-700 border-blue-200',
        detailClassName: 'text-blue-700',
      };
    }

    return {
      kind: 'counter',
      label: 'Balcao',
      icon: Store,
      badgeClassName: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      detailClassName: 'text-zinc-700',
    };
  };

  const getElapsedLabel = (createdAt: string) => {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));

    if (elapsed === 0) return 'Agora';
    if (elapsed === 1) return '1 min';
    if (elapsed < 60) return `${elapsed} min`;

    const hours = Math.floor(elapsed / 60);
    const minutes = elapsed % 60;

    if (minutes === 0) return `${hours}h`;

    return `${hours}h ${minutes}min`;
  };

  const primaryActionClassName =
    'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors';
  const secondaryActionClassName =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50';
  const warningActionClassName =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100';
  const dangerActionClassName =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100';

  const closeRefundModal = () => {
    setShowRefundModal(false);
    setOrderToRefund(null);
    setRefundPassword('');
    setRefundReason('');
    setRefundAmount('');
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setHistoryOrder(null);
    setHistoryEvents([]);
    setHistoryError('');
    setHistoryLoading(false);
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setOrderToCancel(null);
    setCancelPassword('');
    setCancelReason('');
  };

  const openHistoryModal = async (order: Order) => {
    setHistoryOrder(order);
    setHistoryEvents([]);
    setHistoryError('');
    setHistoryLoading(true);
    setShowHistoryModal(true);

    try {
      const res = await fetch(`/api/orders/${order.id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setHistoryError(data?.error || 'Nao foi possivel carregar o historico do pedido.');
        return;
      }

      setHistoryEvents(Array.isArray(data) ? data : []);
    } catch {
      setHistoryError('Erro de conexao ao carregar o historico do pedido.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || 'Erro ao atualizar status do pedido.');
      return;
    }
    fetchOrders();
  };

const handleConfirmOrder = async (id: number) => {
    try {
      const res = await fetch(`/api/orders/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Erro ao confirmar pedido.');
        return;
      }
      fetchOrders(); // Atualiza a tela com o novo status
    } catch (error) {
      alert('Erro de conexão ao confirmar pedido.');
    }
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

  const handleRefundClick = (order: OrderWithRefund) => {
    setOrderToRefund(order);
    setRefundPassword('');
    setRefundReason('');
    setRefundAmount('');
    setShowRefundModal(true);
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
        closeCancelModal();
        fetchOrders();
        return;
      }

      alert(data?.error || 'Erro ao cancelar pedido.');
    } catch {
      alert('Erro de conexão ao cancelar pedido.');
    }
  };

  const submitRefundOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orderToRefund) return;

    const parsedAmount = Number(refundAmount.replace(',', '.'));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert('Informe um valor de reembolso valido.');
      return;
    }

    if (!refundReason.trim()) {
      alert('Informe o motivo do reembolso.');
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderToRefund.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subsenha: refundPassword,
          motivo: refundReason.trim(),
          valor: parsedAmount,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        closeRefundModal();
        fetchOrders();
        return;
      }

      alert(data?.error || 'Erro ao registrar reembolso.');
    } catch {
      alert('Erro de conexão ao registrar reembolso.');
    }
  };

  const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string; emoji: string }> = {
    'Aguardando confirmação': { color: '#0369a1', bg: '#e0f2fe', dot: '#0ea5e9', emoji: '🔔' },
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

  const getHistoryTone = (event: OrderHistoryEvent) => {
    if (event.tipo === 'CANCELAMENTO') {
      return { bg: 'bg-red-50', border: 'border-red-100', badge: 'bg-red-100 text-red-700' };
    }

    if (event.tipo === 'REEMBOLSO') {
      return { bg: 'bg-orange-50', border: 'border-orange-100', badge: 'bg-orange-100 text-orange-700' };
    }

    if (event.tipo === 'STATUS') {
      return { bg: 'bg-blue-50', border: 'border-blue-100', badge: 'bg-blue-100 text-blue-700' };
    }

    return { bg: 'bg-zinc-50', border: 'border-zinc-100', badge: 'bg-zinc-100 text-zinc-700' };
  };

  const getHistoryCategoryLabel = (event: OrderHistoryEvent) => {
    if (event.tipo === 'STATUS') return 'Operacional';
    if (event.tipo === 'REEMBOLSO') return 'Financeiro';
    if (event.tipo === 'CANCELAMENTO') return 'Cancelamento';
    if (event.tipo === 'CRIACAO') return 'Criacao';
    return 'Auditoria';
  };

  const getHistoryTitle = (event: OrderHistoryEvent) => {
    if (event.tipo === 'CRIACAO') return 'Pedido criado';
    if (event.tipo === 'STATUS') {
      const nextStatusLabel = event.status_novo || 'Status atualizado';
      return `Status alterado para ${nextStatusLabel}`;
    }
    if (event.tipo === 'CANCELAMENTO') return 'Pedido cancelado';
    if (event.tipo === 'REEMBOLSO') return 'Reembolso registrado';
    return event.tipo;
  };

  const getHistoryDetails = (event: OrderHistoryEvent): HistoryDetail[] => {
    const details: HistoryDetail[] = [];

    if (event.tipo === 'CRIACAO') {
      details.push({ label: 'Resumo', value: 'Registro inicial do pedido.' });
    }

    if (event.tipo === 'STATUS' && event.status_anterior && event.status_novo) {
      details.push({
        label: 'Transicao',
        value: `${event.status_anterior} -> ${event.status_novo}`,
      });
    }

    if (event.valor && event.valor > 0) {
      details.push({ label: 'Valor', value: formatMoney(Number(event.valor)) });
    }

    if (event.motivo) {
      details.push({ label: 'Motivo', value: event.motivo });
    }

    if (event.estoque_reposto) {
      details.push({ label: 'Estoque', value: 'Itens repostos ao estoque.' });
    }

    if (event.usuario_id) {
      details.push({ label: 'Usuario', value: `#${event.usuario_id}` });
    }

    return details;
  };

  const STATUSES_FINAIS = ['Entregue', 'Concluído', 'concluido', 'cancelado', 'Cancelado', cfg.statusConcluido];
  const normalizeOrderStatus = (status?: string | null) =>
    String(status || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const isFinalOrderStatus = (status?: string | null) => {
    const normalizedStatus = normalizeOrderStatus(status);
    const normalizedSegmentFinalStatus = normalizeOrderStatus(cfg.statusConcluido);

    return normalizedStatus === 'entregue'
      || normalizedStatus === 'concluido'
      || normalizedStatus === 'cancelado'
      || normalizedStatus === normalizedSegmentFinalStatus;
  };

  const activeOrders = orders.filter((order) => !isFinalOrderStatus(order.status));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{cfg.tituloPedidos}</h2>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">Consulta detalhada e histórico — a fila ao vivo está em Operação</p>
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
            <div className="rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/90 dark:border-zinc-700 dark:bg-zinc-900/40">
              <EmptyState
                icon={UtensilsCrossed}
                title="Nenhum pedido ativo"
                description="Os pedidos aparecerão aqui em tempo real."
              />
            </div>
          )}
          {activeOrders.map(order => {
            const orderWithRefund = order as OrderWithRefund;
            const sc = getStatusCfg(order.status);
            const isLevar = (order as any).tipo_retirada === 'levar';
            const channelMeta = getOrderChannelMeta(order);
            const ChannelIcon = channelMeta.icon;
            const isDelivery = channelMeta.kind === 'delivery';
            const next = isDelivery ? null : getNonDeliveryNextStatus(order);
            const pipeIdx = (ORDER_PIPELINE_STEPS as readonly string[]).indexOf(
              normalizeStatusForPipeline(order.status)
            );
            const elapsed = Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000));
            const refundMeta = getRefundMeta(orderWithRefund);
            const orderReference = getOrderReference(order, isDelivery);
            return (
              <div
                key={order.id}
                data-pdv-order-id={order.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isDelivery ? 'border-orange-200' : 'border-zinc-100'}`}
              >
                {/* Top stripe — laranja para delivery */}
                <div className="h-1.5" style={{ background: isDelivery ? '#f97316' : sc.dot }} />
                {/* Banner delivery */}
                {isDelivery && (
                  <div className="bg-orange-50 border-b border-orange-100 px-4 py-2 flex items-center gap-2 flex-wrap">
                    <span className="text-sm">🛵</span>
                    <Bike size={14} className="text-orange-700" />
                    <span className="text-xs font-black text-orange-700 uppercase tracking-wider">{channelMeta.label}</span>
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
                              <span className="text-[8px] uppercase tracking-widest opacity-70">Canal</span>
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
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Tipo badge */}
                          {false ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">🛵 Delivery</span>
                          ) : (
                            <span className="hidden text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{ background: isLevar ? '#fef3c7' : '#eff6ff', color: isLevar ? '#92400e' : '#1d4ed8' }}>
                              {isLevar ? '🛍️ Para Levar' : '🪑 Consumo Local'}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 rounded-full border ${channelMeta.badgeClassName}`}>
                            <ChannelIcon size={12} />
                            {channelMeta.label}
                          </span>
                          {/* Status badge */}
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: sc.bg, color: sc.color }}>
                            {sc.emoji} {order.status}
                          </span>
                          {refundMeta && (
                            <span
                              className="text-[10px] font-black px-2 py-0.5 rounded-full border"
                              style={{
                                background: refundMeta.tone.bg,
                                color: refundMeta.tone.color,
                                borderColor: refundMeta.tone.border,
                              }}
                            >
                              {refundMeta.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs font-bold text-zinc-500">{formatMoney(order.total_amount)}</span>
                          <span className="text-xs text-zinc-300">·</span>
                          <span className="text-xs text-zinc-400" title={new Date(order.created_at).toLocaleString('pt-BR')}>
                            {elapsed === 0 ? 'agora' : `${elapsed}min atrás`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Direita: ações */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Avançar / Confirmar status */}
                      {order.status === 'Aguardando confirmação' ? (
                        <button onClick={() => handleConfirmOrder(order.id)}
                          className={primaryActionClassName}
                          style={{ background: '#0ea5e9', color: '#fff', border: `1px solid #0284c7` }}>
                          🔔 Confirmar Pedido
                        </button>
                      ) : next && (
                        <button onClick={() => updateStatus(order.id, next)}
                          className={primaryActionClassName}
                          style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.dot}22` }}>
                          <ChevronRight size={14} /> Avancar para {next}
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
                              openPrintPreview(html, 'width=420,height=600');
                            }
                          } catch {
                            const rh = await fetch(`/api/print/comanda-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            const html = await rh.text();
                            openPrintPreview(html, 'width=420,height=600');
                          }
                        }}
                        className={secondaryActionClassName} title="Imprimir Comanda (Cozinha)">
                        <Printer size={15} /> Comanda
                      </button>
                      <button onClick={async () => {
                          try {
                            const r = await fetch(`/api/print/cupom-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            const html = await r.text();
                            setSelectedReceipt(html);
                          } catch { setSelectedReceipt(order.receipt_text || 'Recibo não disponível'); }
                        }}
                        className={secondaryActionClassName} title="Ver Recibo">
                        <FileText size={15} /> Recibo
                      </button>
                      <button
                        onClick={() => openHistoryModal(order)}
                        className={secondaryActionClassName}
                        title="Ver histórico do pedido"
                      >
                        <Clock size={15} /> Historico
                      </button>
                      <button onClick={() => handleCancelClick(order)}
                        className={warningActionClassName} title="Cancelar Pedido">
                        <X size={15} /> Cancelar
                      </button>
                      <button onClick={() => handleDeleteClick(order.id)}
                        className={dangerActionClassName} title="Excluir Administrativamente">
                        <Trash2 size={15} /> Excluir admin
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Operacao</p>
                      <p className="mt-1 text-sm font-bold" style={{ color: sc.color }}>
                        {order.status}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Canal</p>
                      <div className={`mt-1 inline-flex items-center gap-2 text-sm font-bold ${channelMeta.detailClassName}`}>
                        <ChannelIcon size={14} />
                        <span>{channelMeta.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {orderReference.label}: {orderReference.value}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Aberto ha {getElapsedLabel(order.created_at)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Valor total</p>
                      <p className="mt-1 text-sm font-bold text-zinc-900">{formatMoney(order.total_amount)}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Reembolso</p>
                      <p className="mt-1 text-sm font-bold" style={{ color: refundMeta ? refundMeta.tone.color : '#18181b' }}>
                        {refundMeta ? formatMoney(refundMeta.refundedAmount) : 'Sem reembolso'}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {refundMeta ? refundMeta.label : 'Sem ajuste financeiro'}
                      </p>
                    </div>
                  </div>

                  {/* Pipeline progress */}
                  <div className="mt-3 flex items-center gap-1">
                    {ORDER_PIPELINE_STEPS.map((step, i) => (
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
                        {i < ORDER_PIPELINE_STEPS.length - 1 && (
                          <div className="flex-1 h-0.5 mb-3 transition-all" style={{ background: i < pipeIdx ? sc.dot : '#f0f0f0' }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Itens */}
                  {(order.items || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(order.items || []).map((item: any, i: number) => (
                        <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-zinc-50 text-zinc-600 border border-zinc-100">
                          {item.quantity}× {item.product_name}
                        </span>
                      ))}
                    </div>
                  )}

                  {refundMeta && (
                    <div
                      className="mt-2 text-xs rounded-xl px-3 py-2 border"
                      style={{
                        background: refundMeta.tone.bg,
                        color: refundMeta.tone.color,
                        borderColor: refundMeta.tone.border,
                      }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Financeiro</p>
                      <p className="mt-1 font-semibold">
                        {refundMeta.label}: {formatMoney(refundMeta.refundedAmount)}
                      </p>
                      {orderWithRefund.reembolso_motivo ? ` • ${orderWithRefund.reembolso_motivo}` : ''}
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
                  {false && refundMeta && (
                    <p className="text-[11px] mt-1 truncate" style={{ color: refundMeta.tone.color }}>
                      {refundMeta.label}: {formatMoney(refundMeta.refundedAmount)}
                      {orderWithRefund.reembolso_motivo ? ` • ${orderWithRefund.reembolso_motivo}` : ''}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-zinc-50 text-zinc-700 border border-zinc-100">
                      Total: {formatMoney(order.total_amount)}
                    </span>
                    {refundMeta && (
                      <span
                        className="text-[11px] font-semibold px-2 py-1 rounded-lg border"
                        style={{
                          background: refundMeta.tone.bg,
                          color: refundMeta.tone.color,
                          borderColor: refundMeta.tone.border,
                        }}
                      >
                        Reembolsado: {formatMoney(refundMeta.refundedAmount)}
                      </span>
                    )}
                    {order.cancelamento_motivo && (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-100">
                        Motivo do cancelamento: {order.cancelamento_motivo}
                      </span>
                    )}
                  </div>
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
            <div className="rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/90 dark:border-zinc-700 dark:bg-zinc-900/40">
              <EmptyState
                icon={Clock}
                title="Nenhum pedido encontrado"
                description="Ajuste o período ou os filtros para ver outros resultados."
              />
            </div>
          )}
          {orders.map(order => {
            const orderWithRefund = order as OrderWithRefund;
            const sc = getStatusCfg(order.status);
            const isLevar = (order as any).tipo_retirada === 'levar';
            const channelMeta = getOrderChannelMeta(order);
            const ChannelIcon = channelMeta.icon;
            const refundMeta = getRefundMeta(orderWithRefund);
            return (
              <div key={order.id} data-pdv-order-id={order.id} className="bg-white rounded-xl border border-zinc-100 px-4 py-3 flex items-center gap-3 shadow-sm">
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
                      style={{ background: sc.bg, color: sc.color }}>Operacao: {order.status}</span>
                    {false && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: isLevar ? '#fef3c7' : '#eff6ff', color: isLevar ? '#92400e' : '#1d4ed8' }}>
                      {isLevar ? '🛍️' : '🪑'}
                    </span>}
                    <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${channelMeta.badgeClassName}`}>
                      <ChannelIcon size={11} />
                      {channelMeta.label}
                    </span>
                  </div>
                  {refundMeta && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
                      style={{
                        background: refundMeta.tone.bg,
                        color: refundMeta.tone.color,
                        borderColor: refundMeta.tone.border,
                      }}
                    >
                      {refundMeta.label}
                    </span>
                  )}
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {new Date(order.created_at).toLocaleString('pt-BR')} · R$ {order.total_amount.toFixed(2)}
                  </p>
                  {order.cancelamento_motivo && (
                    <p className="text-[11px] text-red-500 mt-1 truncate">
                      Cancelado: {order.cancelamento_motivo}
                    </p>
                  )}
                  {refundMeta && (
                    <p className="text-[11px] mt-1 truncate" style={{ color: refundMeta.tone.color }}>
                      {refundMeta.label}: {formatMoney(refundMeta.refundedAmount)}
                      {orderWithRefund.reembolso_motivo ? ` • ${orderWithRefund.reembolso_motivo}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                      <button onClick={async () => {
                          // Busca cupom HTML padrão e abre janela de impressão
                          try {
                            const r = await fetch(`/api/print/cupom-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            const html = await r.text();
                            openPrintPreview(html);
                          } catch { /* fallback: receipt_text */ setSelectedReceipt(order.receipt_text || ''); }
                        }}
                        className={secondaryActionClassName} title="Imprimir na tela">
                        <Printer size={15} /> Imprimir
                      </button>
                  <button onClick={async () => {
                      try {
                        const r = await fetch(`/api/print/cupom-html/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        const html = await r.text();
                        setSelectedReceipt(html);
                      } catch { setSelectedReceipt(order.receipt_text || ''); }
                    }}
                    className={secondaryActionClassName}><FileText size={15} /> Recibo</button>
                  <button
                    onClick={() => openHistoryModal(order)}
                    className={secondaryActionClassName}
                    title="Ver histórico do pedido"
                  >
                    <Clock size={15} /> Historico
                  </button>
                  {refundMeta?.isTotal !== true && (
                    <button
                      onClick={() => handleRefundClick(orderWithRefund)}
                      className={warningActionClassName}
                      title="Registrar Reembolso"
                    >
                      Reembolso
                    </button>
                  )}
                  <button onClick={() => handleDeleteClick(order.id)}
                    className={dangerActionClassName} title="Excluir Administrativamente"><Trash2 size={15} /> Excluir admin</button>
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
                  srcDoc={ensurePrintableHtmlDocument(selectedReceipt)}
                  style={{ width: '100%', minHeight: 280, border: 'none', borderRadius: 12 }}
                  title="Recibo"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={() => {
                  openPrintPreview(isPrintableHtmlDocument(selectedReceipt) ? selectedReceipt : ensurePrintableHtmlDocument(selectedReceipt));
                }} variant="secondary" className="flex-1 flex items-center gap-2 justify-center"><Printer size={15}/> Imprimir</Button>
                <Button onClick={() => setSelectedReceipt(null)} className="flex-1">Fechar</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

<AnimatePresence>
  {showHistoryModal && historyOrder && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[112] flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-zinc-100">
          <div>
            <h3 className="text-xl font-bold text-zinc-900">Historico do Pedido</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Pedido #{historyOrder.order_number} • {formatMoney(historyOrder.total_amount)}
            </p>
          </div>
          <button
            onClick={closeHistoryModal}
            className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {historyLoading && (
            <div className="text-center py-16 text-zinc-400">
              <Clock size={28} className="mx-auto mb-3 opacity-50" />
              <p>Carregando historico...</p>
            </div>
          )}

          {!historyLoading && historyError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {historyError}
            </div>
          )}

          {!historyLoading && !historyError && historyEvents.length === 0 && (
            <div className="text-center py-16 text-zinc-400">
              <Clock size={28} className="mx-auto mb-3 opacity-50" />
              <p>Nenhum evento encontrado para este pedido.</p>
            </div>
          )}

          {!historyLoading && !historyError && historyEvents.map((event) => {
            const tone = getHistoryTone(event);
            const details = getHistoryDetails(event);

            return (
              <div
                key={String(event.id)}
                className={`rounded-2xl border px-4 py-3 ${tone.bg} ${tone.border}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${tone.badge}`}>
                        {event.tipo}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {getHistoryCategoryLabel(event)}
                      </span>
                      {event.synthetic && (
                        <span className="text-[10px] font-semibold text-zinc-400">
                          base
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 mt-2">
                      {getHistoryTitle(event)}
                    </p>
                  </div>
                  <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                    {formatDateTime(event.created_at)}
                  </span>
                </div>

                {details.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {details.map((detail, index) => (
                      <div key={`${event.id}-${index}`} className="rounded-xl bg-white/70 px-3 py-2 border border-white/80">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                          {detail.label}
                        </p>
                        <p className="mt-1 text-xs text-zinc-700">
                          {detail.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-zinc-100">
          <Button onClick={closeHistoryModal} className="w-full">
            Fechar
          </Button>
        </div>
      </motion.div>
    </div>
  )}
</AnimatePresence>

{/* Modal de Autenticação para Exclusão */}
<AnimatePresence>
  {showRefundModal && orderToRefund && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[115] flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
      >
        <form onSubmit={submitRefundOrder} className="space-y-4">
          <div>
            <h3 className="text-xl font-bold text-zinc-900">Registrar Reembolso</h3>
            <p className="text-sm text-zinc-500 mt-1">
              O reembolso fica separado do status operacional do pedido.
            </p>
            <p className="text-xs font-semibold text-zinc-400 mt-2">
              Pedido: #{orderToRefund.order_number}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Total do pedido: {formatMoney(orderToRefund.total_amount)}
            </p>
            {Number(orderToRefund.valor_reembolsado || 0) > 0 && (
              <p className="text-xs text-orange-600 mt-1">
                Ja reembolsado: {formatMoney(Number(orderToRefund.valor_reembolsado || 0))}
              </p>
            )}
          </div>

          <Input
            label="Subsenha"
            type="password"
            value={refundPassword}
            onChange={(e: any) => setRefundPassword(e.target.value)}
            autoFocus
          />

          <Input
            label="Valor"
            type="number"
            min="0.01"
            step="0.01"
            value={refundAmount}
            onChange={(e: any) => setRefundAmount(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Motivo</label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all resize-none"
              placeholder="Ex: cobranca indevida, item devolvido, ajuste financeiro"
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1">
              Confirmar Reembolso
            </Button>
            <Button
              type="button"
              onClick={closeRefundModal}
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
              onClick={closeCancelModal}
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
