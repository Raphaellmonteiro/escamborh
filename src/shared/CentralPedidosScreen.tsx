import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, LayoutGrid, X, ChevronRight, Clock, Printer, BadgeCheck, ReceiptText, MapPinned, MessageCircle, QrCode, ListTree, ChefHat } from 'lucide-react';
import type { Order } from '../types';
import { Card, Button } from '../components/ui/Card';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import {
  adminOpsInsetPanelClass,
  adminScreenMetaHintClass,
  adminSectionEyebrowClass,
} from '../components/ui/screenChrome';
import {
  canCentralNotifyCustomer,
  canCentralOpenCustomerWhatsApp,
  canCentralOpenMaps,
  canCentralConfirmPayment,
  canCentralPrintCupom,
  canCentralPrintProducao,
  canCentralPrintProof,
  executeCentralConfirmPayment,
  executeCentralPrintAction,
  executeCentralPrimaryAction,
  getCentralCustomerWhatsAppChatUrl,
  getCentralMapsUrl,
  getCentralNotifyCustomerUrl,
  getCentralPrimaryAction,
} from '../utils/orderCentralActions';
import { OrderAutomationBadges, orderHasAutomationBadges } from '../components/OrderAutomationBadges';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusChip } from '../components/ui/StatusChip';
import { Spinner } from '../components/ui/Spinner';
import { getSegCfg } from '../config/segmentos';
import {
  FLOWPDV_CENTRAL_CHANNEL_FILTER_KEY,
  type CentralChannelFilter,
  type CentralColumnId,
  type CentralQuickFilter,
  getCentralOrderKind,
  getOrderAgeMinutes,
  groupOrdersByCentralColumn,
  isOrderFullyPaid,
  isOrderWithoutAssignedMotoboy,
  isPaymentPendingOrder,
  isPendingQrMesaOrder,
  isUrgentOrder,
  passesCentralQuickFilter,
  passesCentralChannelFilter,
} from '../utils/orderCentralBoard';
import {
  getOrderItemDetailText,
  orderHasAnyItemCustomization,
  splitOrderItemDetailLines,
} from '../utils/orderItemDisplay';

const TZ = 'America/Sao_Paulo';
const CENTRAL_ORDERS_LIMIT = 300;

function getTodayRangeQuery(): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  const day = `${y}-${m}-${d}`;
  return { from: day, to: day };
}

function formatMoney(value: number) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function formatCreatedAtPtBr(createdIso: string | null | undefined): string {
  const raw = String(createdIso ?? '').trim();
  if (!raw) return '—';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function formatElapsed(createdIso: string | null | undefined) {
  const raw = String(createdIso ?? '').trim();
  if (!raw) return '—';
  const t = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return '—';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60} min`;
}

function getElapsedMeta(createdIso: string | null | undefined): { label: string; tone: string; dot: string } {
  const raw = String(createdIso ?? '').trim();
  if (!raw) {
    return {
      label: '—',
      tone: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
      dot: 'bg-zinc-400',
    };
  }
  const t = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) {
    return {
      label: '—',
      tone: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
      dot: 'bg-zinc-400',
    };
  }
  const m = Math.floor((Date.now() - t) / 60000);
  if (m >= 45) {
    return {
      label: formatElapsed(raw),
      tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30',
      dot: 'bg-red-500',
    };
  }
  if (m >= 25) {
    return {
      label: formatElapsed(raw),
      tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
      dot: 'bg-amber-500',
    };
  }
  return {
    label: formatElapsed(raw),
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
  };
}

function channelBadgeMeta(order: Order): { label: string; className: string } {
  const kind = getCentralOrderKind(order);
  if (kind === 'mesa') {
    return { label: 'Mesa', className: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-500/30' };
  }
  if (kind === 'delivery') {
    return { label: 'Delivery', className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-500/30' };
  }
  if (kind === 'retirada') {
    return { label: 'Retirada', className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/30' };
  }
  return { label: 'Balcão', className: 'bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600' };
}

function getOrderNumberLine(order: Order) {
  const num = String(order.order_number || '').trim();
  const senha = order.senha_pedido != null && Number(order.senha_pedido) !== 0
    ? String(order.senha_pedido).padStart(2, '0')
    : '';
  if (senha) return `${num} · Senha ${senha}`;
  return num || `#${order.id}`;
}

function getClienteLine(order: Order) {
  const nome = String(order.cliente_nome || '').trim();
  if (nome) return nome;
  const tel = order.cliente_tel;
  if (tel && String(tel).trim()) return String(tel).trim();
  return '—';
}

function getMesaReference(order: Order) {
  const mesaId = Number((order as { mesa_id?: number | null }).mesa_id || 0);
  if (mesaId > 0) return String(mesaId);
  const observation = String(order.observation || '');
  const mesaMatch = observation.match(/Mesa\s+(\d+)/i);
  return mesaMatch ? mesaMatch[1] : null;
}

function paymentMetodoUpper(tipo: string): string {
  const k = String(tipo || '').trim().toLowerCase();
  if (k === 'dinheiro') return 'DINHEIRO';
  if (k === 'pix') return 'PIX';
  if (k === 'cartao' || k === 'cartão') return 'CARTÃO';
  const u = String(tipo || '').trim().toUpperCase();
  return u || 'PAGAMENTO';
}

function getPagamentoLine(order: Order) {
  const tipo = order.pagamento_tipo;
  const status = order.pagamento_status;
  const t = String(tipo || '').trim();
  const s = String(status || '').trim();
  const totalPaid = Number(order.payment_total_paid || 0);
  const totalAmount = Number(order.total_amount || 0);
  if (isOrderFullyPaid(order)) {
    if (t) {
      if (totalPaid > 0) return `${paymentMetodoUpper(t)} — PAGO (${formatMoney(totalPaid)})`;
      return `${paymentMetodoUpper(t)} — PAGO`;
    }
    if (totalPaid > 0) return `PAGO (${formatMoney(totalPaid)})`;
    return 'PAGO';
  }
  if (totalPaid > 0 && totalAmount > 0) {
    return `${t ? paymentMetodoUpper(t) : 'PAGAMENTO'} — ${formatMoney(totalPaid)} / ${formatMoney(totalAmount)}`;
  }
  if (t) return `${paymentMetodoUpper(t)} — PENDENTE`;
  if (!t && !s) return null;
  if (s) return `${s.toUpperCase()}`;
  return null;
}

function getPaymentBadgeMeta(order: Order): { label: string; className: string } | null {
  const tipo = String(order.pagamento_tipo || '').trim();
  const status = String(order.pagamento_status || '').trim().toLowerCase();
  const fullyPaid = isOrderFullyPaid(order);
  const totalPaid = Number(order.payment_total_paid || 0);
  const totalAmount = Number(order.total_amount || 0);
  if (!tipo && !status && !fullyPaid) return null;
  if (fullyPaid) {
    return {
      label: tipo
        ? totalPaid > 0
          ? `${paymentMetodoUpper(tipo)} — PAGO · ${formatMoney(totalPaid)}`
          : `${paymentMetodoUpper(tipo)} — PAGO`
        : totalPaid > 0
          ? `PAGO · ${formatMoney(totalPaid)}`
          : 'PAGO',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30',
    };
  }
  if (totalPaid > 0 && totalPaid + 0.01 < totalAmount) {
    return {
      label: `PARCIAL · ${formatMoney(totalPaid)} / ${formatMoney(totalAmount)}`,
      className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
    };
  }
  if (tipo) {
    return {
      label: `${paymentMetodoUpper(tipo)} — PENDENTE`,
      className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
    };
  }
  if (status) {
    return {
      label: status.toUpperCase(),
      className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
    };
  }
  return {
    label: 'PAGAMENTO',
    className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30',
  };
}

function getColumnTone(columnId: CentralColumnId): { shell: string; header: string; count: string; empty: string } {
  if (columnId === 'a_confirmar') {
    return {
      shell: 'border-cyan-200/80 dark:border-cyan-500/20 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-cyan-100 dark:border-cyan-500/20 bg-cyan-50/70 dark:bg-cyan-500/10',
      count: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200',
      empty: 'border-cyan-100/80 text-cyan-300 dark:border-cyan-500/20 dark:text-cyan-700/70',
    };
  }
  if (columnId === 'entrada') {
    return {
      shell: 'border-sky-200/80 dark:border-sky-500/20 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-sky-100 dark:border-sky-500/20 bg-sky-50/70 dark:bg-sky-500/10',
      count: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200',
      empty: 'border-sky-100/80 text-sky-300 dark:border-sky-500/20 dark:text-sky-700/70',
    };
  }
  if (columnId === 'em_preparo') {
    return {
      shell: 'border-amber-200/80 dark:border-amber-500/20 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-500/10',
      count: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
      empty: 'border-amber-100/80 text-amber-300 dark:border-amber-500/20 dark:text-amber-700/70',
    };
  }
  if (columnId === 'pronto') {
    return {
      shell: 'border-violet-200/80 dark:border-violet-500/20 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-violet-100 dark:border-violet-500/20 bg-violet-50/70 dark:bg-violet-500/10',
      count: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
      empty: 'border-violet-100/80 text-violet-300 dark:border-violet-500/20 dark:text-violet-700/70',
    };
  }
  if (columnId === 'rota') {
    return {
      shell: 'border-orange-200/80 dark:border-orange-500/20 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-orange-100 dark:border-orange-500/20 bg-orange-50/70 dark:bg-orange-500/10',
      count: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200',
      empty: 'border-orange-100/80 text-orange-300 dark:border-orange-500/20 dark:text-orange-700/70',
    };
  }
  if (columnId === 'outros') {
    return {
      shell: 'border-amber-200/80 dark:border-amber-500/20 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/10',
      count: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
      empty: 'border-amber-100/80 text-amber-300 dark:border-amber-500/20 dark:text-amber-700/70',
    };
  }
  if (columnId === 'encerrado') {
    return {
      shell: 'border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/80',
      header: 'border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900',
      count: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      empty: 'border-zinc-200/80 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700/70',
    };
  }
  return {
    shell: 'border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/80',
    header: 'border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900',
    count: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    empty: 'border-zinc-200/80 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700/70',
  };
}

const COLUMN_DEF: { id: CentralColumnId; title: string; hint?: string }[] = [
  { id: 'a_confirmar', title: 'A confirmar', hint: 'Pedidos QR da mesa aguardando validação' },
  { id: 'entrada', title: 'Entrada', hint: 'Novos e confirmação' },
  { id: 'em_preparo', title: 'Em preparo' },
  { id: 'pronto', title: 'Pronto' },
  { id: 'rota', title: 'Rota', hint: 'Delivery em deslocamento' },
  { id: 'encerrado', title: 'Encerrado' },
  { id: 'outros', title: 'A revisar', hint: 'Status não mapeado no fluxo' },
];

const FILTERS: { id: CentralChannelFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'balcao', label: 'Presencial' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'retirada', label: 'Retirada' },
];

const QUICK_FILTERS: { id: CentralQuickFilter; label: string }[] = [
  { id: 'todos', label: 'Tudo' },
  { id: 'urgentes', label: 'Urgentes' },
  { id: 'pagamento_pendente', label: 'Pagamento pendente' },
  { id: 'qr_pendente', label: 'QR pendente' },
  { id: 'sem_motoboy', label: 'Sem motoboy' },
];

export default function CentralPedidosScreen({
  token,
  segmento,
  hasMotoboyFeature = true,
}: {
  token: string;
  /** Segmento operacional — define status final do segmento (ex.: Entregue vs Concluído). */
  segmento?: string;
  hasMotoboyFeature?: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [channelFilter, setChannelFilter] = useState<CentralChannelFilter>('todos');
  const [quickFilter, setQuickFilter] = useState<CentralQuickFilter>('todos');
  const [detail, setDetail] = useState<Order | null>(null);
  const [motoboys, setMotoboys] = useState<Array<{ id: number; nome: string }>>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLOWPDV_CENTRAL_CHANNEL_FILTER_KEY);
      if (
        raw === 'todos' ||
        raw === 'balcao' ||
        raw === 'delivery' ||
        raw === 'retirada'
      ) {
        setChannelFilter(raw as CentralChannelFilter);
      }
      sessionStorage.removeItem(FLOWPDV_CENTRAL_CHANNEL_FILTER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const segCfg = useMemo(() => getSegCfg(segmento || 'Restaurante/Food'), [segmento]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      const { from, to } = getTodayRangeQuery();
      const qs = new URLSearchParams({ from, to, limit: String(CENTRAL_ORDERS_LIMIT) });
      const res = await fetch(`/api/orders?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Não foi possível carregar os pedidos.');
        setOrders([]);
        return;
      }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setError('Erro de conexão ao carregar pedidos.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!token) return;
    if (!hasMotoboyFeature) {
      setMotoboys([]);
      return;
    }
    void (async () => {
      try {
        const res = await fetch('/api/delivery/motoboys', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!Array.isArray(data)) return;
        setMotoboys(
          data.map((m: { id: number; nome: string }) => ({ id: m.id, nome: String(m.nome || '') }))
        );
      } catch {
        /* ignore */
      }
    })();
  }, [token, hasMotoboyFeature]);

  useEffect(() => {
    if (!hasMotoboyFeature && quickFilter === 'sem_motoboy') {
      setQuickFilter('todos');
    }
  }, [hasMotoboyFeature, quickFilter]);

  const quickFilters = useMemo(
    () => (hasMotoboyFeature ? QUICK_FILTERS : QUICK_FILTERS.filter((f) => f.id !== 'sem_motoboy')),
    [hasMotoboyFeature]
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchOrders();
    }, 30000);
    return () => window.clearInterval(id);
  }, [fetchOrders]);

  const filtered = useMemo(
    () => orders.filter((o) =>
      passesCentralChannelFilter(o, channelFilter) &&
      passesCentralQuickFilter(o, quickFilter, hasMotoboyFeature)
    ),
    [orders, channelFilter, quickFilter, hasMotoboyFeature]
  );

  const buckets = useMemo(
    () => groupOrdersByCentralColumn(filtered, {
      segmentFinalStatus: segCfg.statusConcluido,
      requireMotoboy: hasMotoboyFeature,
    }),
    [filtered, segCfg.statusConcluido, hasMotoboyFeature]
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-0 flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="min-w-0 shrink-0 border-b border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900 sm:px-3 sm:py-2.5 2xl:px-6 2xl:py-3.5">
        <ScreenHeader
          titleAs="h1"
          className="gap-1.5 sm:gap-2 2xl:gap-3"
          titleClassName="flex items-center gap-1.5 2xl:gap-2 text-base 2xl:text-2xl"
          title={
            <>
              <LayoutGrid className="shrink-0 text-zinc-700 dark:text-zinc-300" size={18} strokeWidth={2.25} />
              Operação
            </>
          }
          subtitle={
            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 mt-0.5 2xl:text-sm 2xl:mt-0.5">
              Ao vivo · hoje · ações no card
            </p>
          }
          meta={
            <span className={`${adminScreenMetaHintClass} hidden sm:inline`}>
              Até {CENTRAL_ORDERS_LIMIT} pedidos (hoje)
            </span>
          }
          actions={
            <Button
              type="button"
              variant="secondary"
              className="!min-h-[34px] !px-2.5 !py-1.5 !text-[11px] 2xl:!min-h-[40px] 2xl:!px-3 2xl:!py-2 2xl:!text-xs"
              onClick={() => void fetchOrders()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </Button>
          }
        />

        <div className="mt-2 flex flex-wrap gap-1 sm:mt-2.5 sm:gap-1.5 2xl:mt-3 2xl:gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setChannelFilter(f.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border min-h-[34px] 2xl:min-h-[40px] 2xl:rounded-xl 2xl:px-3.5 2xl:py-2 2xl:text-xs transition-colors ${
                channelFilter === f.id
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                  : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowClosed((current) => !current)}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border min-h-[34px] 2xl:min-h-[40px] 2xl:rounded-xl 2xl:px-3 2xl:py-2 2xl:text-xs transition-colors ${
              showClosed
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            title={showClosed ? 'Ocultar pedidos encerrados' : 'Mostrar pedidos encerrados'}
          >
            {showClosed ? 'Ocultar encerrados' : `Encerrados (${buckets.encerrado.length})`}
          </button>
          <button
            type="button"
            onClick={() => setCompactMode((current) => !current)}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border min-h-[34px] 2xl:min-h-[40px] 2xl:rounded-xl 2xl:px-3 2xl:py-2 2xl:text-xs transition-colors ${
              compactMode
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            title={compactMode ? 'Voltar ao modo normal' : 'Reduzir altura dos cards'}
          >
            {compactMode ? 'Compacto' : 'Compactar'}
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:mt-2 sm:gap-1.5 2xl:mt-3 2xl:gap-2">
          <span className={`${adminSectionEyebrowClass} text-[10px] 2xl:text-xs`}>Filtros</span>
          {quickFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setQuickFilter(f.id)}
              className={`min-h-[34px] rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors sm:min-h-0 sm:py-1 2xl:min-h-0 2xl:px-3 2xl:py-1.5 2xl:text-xs ${
                quickFilter === f.id
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                  : 'bg-white/80 text-zinc-600 border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:space-y-2.5 sm:p-3 sm:pb-3 2xl:space-y-4 2xl:p-6 2xl:pb-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-10 sm:py-12 2xl:py-16">
            <Spinner />
          </div>
        ) : !loading && orders.length === 0 && !error ? (
          <EmptyState
            title="Nenhum pedido hoje"
            description="Ainda não há pedidos registrados para hoje neste estabelecimento."
          />
        ) : (
          <>
            {!loading && orders.length > 0 && filtered.length === 0 && (
              <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mb-1 2xl:text-sm 2xl:mb-2">
                Nenhum pedido corresponde ao filtro selecionado.
              </p>
            )}
            <div className="px-0.5 text-[10px] font-medium text-zinc-400 lg:hidden">
              Deslize lateralmente para ver as próximas colunas
            </div>
            <div className="-mx-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-2 pb-3 touch-pan-x [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] sm:pb-3 lg:mx-0 lg:px-0 lg:pb-2 2xl:-mx-0 2xl:pb-2">
              <div className="flex min-w-max items-start gap-2 pr-3 lg:min-w-0 lg:grid lg:grid-cols-3 lg:gap-2.5 lg:pr-0 xl:grid-cols-4 xl:gap-2.5 2xl:grid-cols-4 2xl:gap-3 min-[1800px]:grid-cols-6">
                {COLUMN_DEF.filter((col) => showClosed || col.id !== 'encerrado').map((col) => {
                  const tone = getColumnTone(col.id);
                  return (
                  <div
                    key={col.id}
                    className={`flex w-[min(calc(100vw-1.5rem),272px)] flex-shrink-0 flex-col rounded-xl border shadow-sm shadow-zinc-950/[0.02] min-h-[min(260px,46vh)] max-h-none sm:w-[280px] md:w-[296px] lg:w-auto lg:min-h-[min(300px,50vh)] lg:max-h-[min(640px,70vh)] 2xl:rounded-2xl 2xl:min-h-[min(420px,62vh)] 2xl:max-h-[min(720px,78vh)] ${tone.shell}`}
                  >
                    <div className={`shrink-0 px-2 py-1.5 2xl:px-3 2xl:py-2.5 ${tone.header}`}>
                      <div className="flex items-center justify-between gap-1.5 2xl:gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 2xl:text-[11px]">
                          {col.title}
                        </span>
                        <span className={`text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md 2xl:text-[10px] 2xl:px-2 2xl:rounded-lg ${tone.count}`}>
                          {buckets[col.id].length}
                        </span>
                      </div>
                      {col.hint && (
                        <p className="hidden text-[10px] text-zinc-400 mt-0.5 leading-tight 2xl:block">{col.hint}</p>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 space-y-1 p-1 sm:p-1.5 lg:overflow-y-auto lg:overscroll-y-contain 2xl:space-y-2 2xl:p-2">
                      {buckets[col.id].length === 0 ? (
                        <div className={`mx-0.5 rounded-lg border border-dashed py-2.5 px-2 text-center text-[10px] leading-snug 2xl:mx-1 2xl:rounded-2xl 2xl:py-5 2xl:px-3 2xl:text-[11px] ${tone.empty}`}>
                          Sem pedidos nesta etapa
                        </div>
                      ) : (
                        buckets[col.id].map((order) => (
                          <Fragment key={order.id}>
                            <OrderCard
                              order={order}
                              columnId={col.id}
                              token={token}
                              segmentFinalStatus={segCfg.statusConcluido}
                              motoboys={motoboys}
                              hasMotoboyFeature={hasMotoboyFeature}
                              compactMode={compactMode}
                              onOpenDetail={() => setDetail(order)}
                              onActionDone={() => void fetchOrders()}
                            />
                          </Fragment>
                        ))
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {detail && (
          <OrderDetailModal
            order={detail}
            token={token}
            onClose={() => setDetail(null)}
            onRefresh={() => void fetchOrders()}
            onOrderPatch={(patch) => setDetail((current) => (current ? { ...current, ...patch } : current))}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OrderCard({
  order,
  columnId,
  token,
  segmentFinalStatus,
  motoboys,
  hasMotoboyFeature,
  compactMode,
  onOpenDetail,
  onActionDone,
}: {
  order: Order;
  columnId: CentralColumnId;
  token: string;
  segmentFinalStatus: string;
  motoboys: Array<{ id: number; nome: string }>;
  hasMotoboyFeature: boolean;
  compactMode: boolean;
  onOpenDetail: () => void;
  onActionDone: () => void;
}) {
  const badge = channelBadgeMeta(order);
  const paymentBadge = getPaymentBadgeMeta(order);
  const elapsed = getElapsedMeta(order.created_at);
  const mesaReference = getMesaReference(order);
  const isQrPending = isPendingQrMesaOrder(order);
  const urgent = isUrgentOrder(order);
  const paymentPending = isPaymentPendingOrder(order);
  const withoutMotoboy = isOrderWithoutAssignedMotoboy(order, hasMotoboyFeature);
  const ageMinutes = getOrderAgeMinutes(order);
  const hasItemCustomization = orderHasAnyItemCustomization(order);
  const hasAutomationBadges = orderHasAutomationBadges(order);
  const statusRaw = String(order.status || '').trim() || '—';
  const paymentPendingLabel = Number(order.payment_total_paid || 0) > 0
    ? 'Pagamento parcial'
    : String(order.pagamento_tipo || '').trim().toLowerCase() === 'pix'
      ? 'Pix pendente'
      : 'Pagamento pendente';
  const statusTone =
    columnId === 'a_confirmar'
      ? 'border-cyan-200 bg-cyan-50/90 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-100'
      : columnId === 'outros'
      ? 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100'
      : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100';

  const primary = useMemo(
    () => getCentralPrimaryAction(order, { columnId, segmentFinalStatus, requireMotoboy: hasMotoboyFeature }),
    [order, columnId, segmentFinalStatus, hasMotoboyFeature]
  );

  const [motoboyId, setMotoboyId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [busyQuickAction, setBusyQuickAction] = useState<'payment' | 'cupom' | 'comprovante' | 'producao' | null>(null);

  const needsMotoboy =
    primary?.kind === 'patch_delivery' && primary.needsMotoboy;
  const bloqueadoMotoboy =
    Boolean(needsMotoboy) && (!motoboyId || motoboys.length === 0);
  const canConfirmPayment = canCentralConfirmPayment(order);
  const canPrintCupom = canCentralPrintCupom(order);
  const canPrintProducao = canCentralPrintProducao(order);
  const canPrintProof = canCentralPrintProof(order);
  const mapsUrl = getCentralMapsUrl(order);
  const notifyUrl = getCentralNotifyCustomerUrl(order);

  const handlePrimary = async () => {
    if (!primary || busy) return;
    if (bloqueadoMotoboy) return;
    setBusy(true);
    const r = await executeCentralPrimaryAction({
      token,
      order,
      action: primary,
      motoboyId: needsMotoboy ? Number(motoboyId) : undefined,
    });
    setBusy(false);
    if (!r.ok) {
      alert(r.error || 'Não foi possível concluir a ação.');
      return;
    }
    onActionDone();
  };

  const handleQuickPayment = async () => {
    if (busyQuickAction) return;
    setBusyQuickAction('payment');
    const r = await executeCentralConfirmPayment({ token, order });
    setBusyQuickAction(null);
    if (!r.ok) {
      alert(r.error || 'Não foi possível confirmar o pagamento.');
      return;
    }
    onActionDone();
  };

  const handleQuickPrint = async (document: 'cupom' | 'comprovante' | 'producao') => {
    if (busyQuickAction) return;
    setBusyQuickAction(document);
    const r = await executeCentralPrintAction({ token, order, document });
    setBusyQuickAction(null);
    if (!r.ok) {
      alert(r.error || 'Não foi possível abrir a impressão.');
    }
  };

  const openExternalUrl = (url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className={`!shadow-none !rounded-xl 2xl:!rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
      urgent
        ? 'ring-1 ring-red-200/80 border-red-200 dark:ring-red-500/20 dark:border-red-500/30'
        : 'hover:border-zinc-300 dark:hover:border-zinc-600'
    }`}>
      <div className={compactMode ? 'p-2.5' : 'p-2.5 sm:p-3 2xl:p-3.5'}>
        <button
          type="button"
          onClick={onOpenDetail}
          className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50"
        >
          {compactMode ? (
            <>
              {(urgent || paymentPending || withoutMotoboy || isQrPending || hasItemCustomization || hasAutomationBadges) && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {urgent && (
                    <StatusChip variant="error" size="sm">
                      {ageMinutes >= 45 ? 'Crítico' : 'Urgente'}
                    </StatusChip>
                  )}
                  {paymentPending && (
                    <StatusChip variant="warning" size="sm" emphasis="bold">
                      {paymentPendingLabel}
                    </StatusChip>
                  )}
                  {withoutMotoboy && (
                    <StatusChip
                      size="sm"
                      emphasis="bold"
                      toneClassName="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200"
                    >
                      Sem motoboy
                    </StatusChip>
                  )}
                  {isQrPending && mesaReference && (
                    <StatusChip
                      size="sm"
                      icon={QrCode}
                      toneClassName="border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-200"
                    >
                      Mesa {mesaReference}
                    </StatusChip>
                  )}
                  {hasItemCustomization && (
                    <StatusChip
                      size="sm"
                      icon={ListTree}
                      toneClassName="border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200"
                    >
                      Itens c/ obs.
                    </StatusChip>
                  )}
                  <OrderAutomationBadges order={order} compact />
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="min-w-0 truncate text-[12px] font-black leading-tight tracking-tight text-zinc-900 dark:text-zinc-100">
                      {getOrderNumberLine(order)}
                    </p>
                    <StatusChip rounded="md" size="sm" toneClassName={badge.className} emphasis="bold" className="shrink-0">
                      {badge.label}
                    </StatusChip>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {getClienteLine(order)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusChip
                    size="sm"
                    toneClassName={elapsed.tone}
                    className="tabular-nums gap-1"
                    uppercase={false}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${elapsed.dot}`} />
                    {elapsed.label}
                  </StatusChip>
                  <p className="mt-1 text-[14px] font-black tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatMoney(order.total_amount)}
                  </p>
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-1.5">
                <StatusChip
                  rounded="lg"
                  size="sm"
                  toneClassName={statusTone}
                  className="min-w-0 inline-flex max-w-full flex-1 px-2 py-0.5 leading-tight"
                  title={statusRaw}
                >
                  <span className="truncate">{columnId === 'a_confirmar' ? 'Aguardando confirmação' : statusRaw}</span>
                </StatusChip>
                {paymentBadge && (
                  <StatusChip rounded="md" size="sm" toneClassName={paymentBadge.className} emphasis="semibold" className="shrink-0">
                    {paymentBadge.label}
                  </StatusChip>
                )}
              </div>
            </>
          ) : (
            <>
              {(urgent || paymentPending || withoutMotoboy || hasItemCustomization || hasAutomationBadges) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {urgent && (
                    <StatusChip variant="error" size="md">
                      {ageMinutes >= 45 ? 'Crítico' : 'Urgente'}
                    </StatusChip>
                  )}
                  {paymentPending && (
                    <StatusChip variant="warning" size="md" emphasis="bold">
                      {paymentPendingLabel}
                    </StatusChip>
                  )}
                  {withoutMotoboy && (
                    <StatusChip
                      size="md"
                      emphasis="bold"
                      toneClassName="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200"
                    >
                      Sem motoboy
                    </StatusChip>
                  )}
                  {hasItemCustomization && (
                    <StatusChip
                      size="md"
                      icon={ListTree}
                      toneClassName="border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200"
                    >
                      Itens personalizados
                    </StatusChip>
                  )}
                  <OrderAutomationBadges order={order} />
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isQrPending && mesaReference && (
                    <div className="mb-1.5">
                      <StatusChip
                        size="md"
                        icon={QrCode}
                        toneClassName="border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-200"
                      >
                        Mesa {mesaReference}
                      </StatusChip>
                    </div>
                  )}
                  <p className="text-[13px] font-black text-zinc-900 dark:text-zinc-100 truncate leading-tight tracking-tight">
                    {getOrderNumberLine(order)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500 mt-1">Cliente</p>
                  <p className="text-sm mt-0.5 font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                    {getClienteLine(order)}
                  </p>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  <StatusChip
                    size="md"
                    toneClassName={elapsed.tone}
                    className="gap-1 px-2 py-1 tabular-nums"
                    uppercase={false}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${elapsed.dot}`} />
                    <Clock size={10} className="shrink-0" strokeWidth={2.25} />
                    {elapsed.label}
                  </StatusChip>
                  <ChevronRight size={16} className="shrink-0 text-zinc-300 dark:text-zinc-600 mt-1" />
                </div>
              </div>

              <div className="mt-2 w-full min-w-0">
                <StatusChip
                  rounded="xl"
                  size="sm"
                  toneClassName={statusTone}
                  className="inline-flex w-full max-w-full px-2.5 py-1 leading-tight"
                  title={statusRaw}
                >
                  <span className="truncate">{columnId === 'a_confirmar' ? 'Aguardando confirmação da mesa' : statusRaw}</span>
                </StatusChip>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <StatusChip rounded="lg" size="sm" toneClassName={badge.className} emphasis="bold">
                  {badge.label}
                </StatusChip>
                {paymentBadge && (
                  <StatusChip rounded="lg" size="sm" toneClassName={paymentBadge.className} emphasis="semibold">
                    {paymentBadge.label}
                  </StatusChip>
                )}
              </div>

              <div className={`mt-3 px-3 py-2.5 ${adminOpsInsetPanelClass}`}>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-[0.18em]">Total</p>
                  </div>
                  <p className="text-base font-black text-zinc-900 dark:text-zinc-50 tabular-nums">
                    {formatMoney(order.total_amount)}
                  </p>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">Detalhes</span>
                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">Abrir pedido</span>
              </div>
            </>
          )}
        </button>

        {(canConfirmPayment || canPrintCupom || canPrintProducao || canPrintProof || canCentralOpenMaps(order) || canCentralNotifyCustomer(order) || primary) && (
          <div
            className={`${compactMode ? 'mt-2 pt-2 space-y-1.5' : 'mt-3 pt-3 space-y-2'} border-t border-zinc-100 dark:border-zinc-800`}
            onClick={(e) => e.stopPropagation()}
          >
            {compactMode && !needsMotoboy ? (
              <div className="flex items-center gap-1.5">
                {(canConfirmPayment || canPrintCupom || canPrintProducao || canPrintProof || mapsUrl || notifyUrl) && (
                  <div className="flex flex-wrap gap-1">
                    {canConfirmPayment && (
                      <button
                        type="button"
                        title="Confirmar pagamento"
                        aria-label="Confirmar pagamento"
                        onClick={() => void handleQuickPayment()}
                        disabled={busyQuickAction !== null}
                        className="min-h-[40px] min-w-[40px] lg:min-h-[30px] lg:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-emerald-200/90 bg-emerald-50 text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
                      >
                        <BadgeCheck size={14} className={busyQuickAction === 'payment' ? 'animate-pulse' : ''} />
                      </button>
                    )}
                    {canPrintCupom && (
                      <button
                        type="button"
                        title="Imprimir cupom"
                        aria-label="Imprimir cupom"
                        onClick={() => void handleQuickPrint('cupom')}
                        disabled={busyQuickAction !== null}
                        className="min-h-[40px] min-w-[40px] lg:min-h-[30px] lg:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        <Printer size={14} className={busyQuickAction === 'cupom' ? 'animate-pulse' : ''} />
                      </button>
                    )}
                    {canPrintProducao && (
                      <button
                        type="button"
                        title="Imprimir produção (cozinha)"
                        aria-label="Imprimir produção"
                        onClick={() => void handleQuickPrint('producao')}
                        disabled={busyQuickAction !== null}
                        className="min-h-[40px] min-w-[40px] lg:min-h-[30px] lg:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100"
                      >
                        <ChefHat size={14} className={busyQuickAction === 'producao' ? 'animate-pulse' : ''} />
                      </button>
                    )}
                    {canPrintProof && (
                      <button
                        type="button"
                        title="Imprimir comprovante"
                        aria-label="Imprimir comprovante"
                        onClick={() => void handleQuickPrint('comprovante')}
                        disabled={busyQuickAction !== null}
                        className="min-h-[40px] min-w-[40px] lg:min-h-[30px] lg:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        <ReceiptText size={14} className={busyQuickAction === 'comprovante' ? 'animate-pulse' : ''} />
                      </button>
                    )}
                    {mapsUrl && (
                      <button
                        type="button"
                        title="Ver mapa"
                        aria-label="Ver mapa"
                        onClick={() => openExternalUrl(mapsUrl)}
                        className="min-h-[40px] min-w-[40px] lg:min-h-[30px] lg:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200"
                      >
                        <MapPinned size={14} />
                      </button>
                    )}
                    {notifyUrl && (
                      <button
                        type="button"
                        title="Avisar cliente"
                        aria-label="Avisar cliente"
                        onClick={() => openExternalUrl(notifyUrl)}
                        className="min-h-[40px] min-w-[40px] lg:min-h-[30px] lg:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-green-200 bg-green-50 text-green-700 shadow-sm transition-colors hover:bg-green-100 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-200"
                      >
                        <MessageCircle size={14} />
                      </button>
                    )}
                  </div>
                )}
                {primary && (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy || bloqueadoMotoboy}
                    className="!min-h-[44px] lg:!min-h-[34px] !py-2 lg:!py-1.5 !px-3 !text-[11px] !font-black shadow-sm flex-1"
                    onClick={() => void handlePrimary()}
                  >
                    <ChevronRight size={13} className={busy ? 'animate-pulse' : ''} />
                    {bloqueadoMotoboy ? 'Selecione o motoboy' : primary.label}
                  </Button>
                )}
              </div>
            ) : (
              <>
            {(canConfirmPayment || canPrintCupom || canPrintProducao || canPrintProof || mapsUrl || notifyUrl) && (
              <div className="flex flex-wrap gap-1.5">
                {canConfirmPayment && (
                  <button
                    type="button"
                    title="Confirmar pagamento"
                    aria-label="Confirmar pagamento"
                    onClick={() => void handleQuickPayment()}
                    disabled={busyQuickAction !== null}
                    className={`${compactMode ? 'min-h-[40px] min-w-[40px] lg:min-h-[32px] lg:min-w-[32px]' : 'min-h-[44px] px-3 gap-2 lg:min-h-[36px]'} inline-flex items-center justify-center rounded-xl border border-emerald-200/90 bg-emerald-50 text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200`}
                  >
                    <BadgeCheck size={15} className={busyQuickAction === 'payment' ? 'animate-pulse' : ''} />
                    {!compactMode && (
                      <span className="text-[11px] font-black uppercase tracking-wide">Confirmar pagamento</span>
                    )}
                  </button>
                )}
                {canPrintCupom && (
                  <button
                    type="button"
                    title="Imprimir cupom"
                    aria-label="Imprimir cupom"
                    onClick={() => void handleQuickPrint('cupom')}
                    disabled={busyQuickAction !== null}
                    className={`${compactMode ? 'min-h-[40px] min-w-[40px] lg:min-h-[32px] lg:min-w-[32px]' : 'min-h-[44px] min-w-[44px] lg:min-h-[36px] lg:min-w-[36px]'} inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}
                  >
                    <Printer size={15} className={busyQuickAction === 'cupom' ? 'animate-pulse' : ''} />
                  </button>
                )}
                {canPrintProducao && (
                  <button
                    type="button"
                    title="Imprimir produção (cozinha)"
                    aria-label="Imprimir produção"
                    onClick={() => void handleQuickPrint('producao')}
                    disabled={busyQuickAction !== null}
                    className={`${compactMode ? 'min-h-[40px] min-w-[40px] lg:min-h-[32px] lg:min-w-[32px]' : 'min-h-[44px] min-w-[44px] lg:min-h-[36px] lg:min-w-[36px]'} inline-flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100`}
                  >
                    <ChefHat size={15} className={busyQuickAction === 'producao' ? 'animate-pulse' : ''} />
                  </button>
                )}
                {canPrintProof && (
                  <button
                    type="button"
                    title="Imprimir comprovante"
                    aria-label="Imprimir comprovante"
                    onClick={() => void handleQuickPrint('comprovante')}
                    disabled={busyQuickAction !== null}
                    className={`${compactMode ? 'min-h-[40px] min-w-[40px] lg:min-h-[32px] lg:min-w-[32px]' : 'min-h-[44px] min-w-[44px] lg:min-h-[36px] lg:min-w-[36px]'} inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}
                  >
                    <ReceiptText size={15} className={busyQuickAction === 'comprovante' ? 'animate-pulse' : ''} />
                  </button>
                )}
                {mapsUrl && (
                  <button
                    type="button"
                    title="Ver mapa"
                    aria-label="Ver mapa"
                    onClick={() => openExternalUrl(mapsUrl)}
                    className={`${compactMode ? 'min-h-[40px] min-w-[40px] lg:min-h-[32px] lg:min-w-[32px]' : 'min-h-[44px] min-w-[44px] lg:min-h-[36px] lg:min-w-[36px]'} inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200`}
                  >
                    <MapPinned size={15} />
                  </button>
                )}
                {notifyUrl && (
                  <button
                    type="button"
                    title="Avisar cliente"
                    aria-label="Avisar cliente"
                    onClick={() => openExternalUrl(notifyUrl)}
                    className={`${compactMode ? 'min-h-[40px] min-w-[40px] lg:min-h-[32px] lg:min-w-[32px]' : 'min-h-[44px] min-w-[44px] lg:min-h-[36px] lg:min-w-[36px]'} inline-flex items-center justify-center rounded-xl border border-green-200 bg-green-50 text-green-700 shadow-sm transition-colors hover:bg-green-100 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-200`}
                  >
                    <MessageCircle size={15} />
                  </button>
                )}
              </div>
            )}
            {needsMotoboy && (
              <select
                value={motoboyId}
                onChange={(e) => setMotoboyId(e.target.value ? Number(e.target.value) : '')}
                className={`w-full text-xs px-2.5 ${compactMode ? 'py-1.5 min-h-[36px]' : 'py-2 min-h-[40px]'} rounded-xl border bg-white dark:bg-zinc-800 dark:border-zinc-700 ${
                  bloqueadoMotoboy ? 'border-amber-400 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-500/10' : ''
                }`}
              >
                <option value="">Motoboy…</option>
                {motoboys.length === 0 ? (
                  <option value="" disabled>
                    Nenhum motoboy cadastrado
                  </option>
                ) : (
                  motoboys.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))
                )}
              </select>
            )}
            {primary && (
              <Button
                type="button"
                variant="primary"
                disabled={busy || bloqueadoMotoboy}
                className={`${compactMode ? '!min-h-[38px] !py-2' : '!min-h-[42px] !py-2.5'} !w-full !text-xs !font-black shadow-sm`}
                onClick={() => void handlePrimary()}
              >
                <ChevronRight size={14} className={busy ? 'animate-pulse' : ''} />
                {bloqueadoMotoboy ? 'Selecione o motoboy' : primary.label}
              </Button>
            )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function OrderDetailModal({
  order,
  token,
  onClose,
  onRefresh,
  onOrderPatch,
}: {
  order: Order;
  token: string;
  onClose: () => void;
  onRefresh: () => void;
  onOrderPatch: (patch: Partial<Order>) => void;
}) {
  const badge = channelBadgeMeta(order);
  const pag = getPagamentoLine(order);
  const [busyPayment, setBusyPayment] = useState(false);
  const [busyPrint, setBusyPrint] = useState<'cupom' | 'comprovante' | 'producao' | null>(null);
  const canConfirmPayment = canCentralConfirmPayment(order);
  const canPrintProof = canCentralPrintProof(order);
  const canPrintProducaoModal = canCentralPrintProducao(order);
  const canWhatsAppCliente = canCentralOpenCustomerWhatsApp(order);

  const handleConfirmPayment = async () => {
    if (busyPayment) return;
    setBusyPayment(true);
    const result = await executeCentralConfirmPayment({ token, order });
    setBusyPayment(false);
    if (!result.ok) {
      alert(result.error || 'Não foi possível confirmar o pagamento.');
      return;
    }
    if (result.orderPatch) onOrderPatch(result.orderPatch);
    else onOrderPatch({ pagamento_status: 'pago' } as Partial<Order>);
    onRefresh();
  };

  const handlePrint = async (document: 'cupom' | 'comprovante' | 'producao') => {
    if (busyPrint) return;
    setBusyPrint(document);
    const result = await executeCentralPrintAction({ token, order, document });
    setBusyPrint(null);
    if (!result.ok) {
      alert(result.error || 'Não foi possível abrir a impressão.');
    }
  };

  const openClienteWhatsApp = () => {
    const url = getCentralCustomerWhatsAppChatUrl(order);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="flex max-h-[min(92dvh,100svh)] w-full min-h-0 flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:max-w-lg sm:rounded-2xl sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pedido</p>
            <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 truncate">{getOrderNumberLine(order)}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${badge.className}`}>
                {badge.label}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600">
                {String(order.status || '—')}
              </span>
              {orderHasAnyItemCustomization(order) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200">
                  <ListTree size={12} />
                  Itens personalizados
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Cliente</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 break-words">{getClienteLine(order)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Criado</p>
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCreatedAtPtBr(order.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Tempo</p>
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">{formatElapsed(order.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Total</p>
              <p className="font-black text-zinc-900 dark:text-zinc-100">{formatMoney(order.total_amount)}</p>
            </div>
          </div>

          {pag && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Pagamento</p>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{pag}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Ações operacionais</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                className="!justify-start !px-3 !text-xs"
                onClick={() => void handlePrint('cupom')}
                disabled={busyPrint !== null}
              >
                <Printer size={14} className={busyPrint === 'cupom' ? 'animate-pulse' : ''} />
                Imprimir cupom
              </Button>
              {canPrintProducaoModal && (
                <Button
                  type="button"
                  variant="secondary"
                  className="!justify-start !px-3 !text-xs border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                  onClick={() => void handlePrint('producao')}
                  disabled={busyPrint !== null}
                >
                  <ChefHat size={14} className={busyPrint === 'producao' ? 'animate-pulse' : ''} />
                  Imprimir produção
                </Button>
              )}
              {canPrintProof && (
                <Button
                  type="button"
                  variant="secondary"
                  className="!justify-start !px-3 !text-xs"
                  onClick={() => void handlePrint('comprovante')}
                  disabled={busyPrint !== null}
                >
                  <ReceiptText size={14} className={busyPrint === 'comprovante' ? 'animate-pulse' : ''} />
                  Imprimir comprovante
                </Button>
              )}
              {canWhatsAppCliente && (
                <Button
                  type="button"
                  variant="secondary"
                  className="!justify-start !px-3 !text-xs"
                  onClick={openClienteWhatsApp}
                >
                  <MessageCircle size={14} />
                  Abrir WhatsApp
                </Button>
              )}
              {canConfirmPayment && (
                <Button
                  type="button"
                  variant="success"
                  className="!justify-start !px-3 !text-xs sm:col-span-2"
                  onClick={() => void handleConfirmPayment()}
                  disabled={busyPayment}
                >
                  <BadgeCheck size={14} className={busyPayment ? 'animate-pulse' : ''} />
                  Confirmar pagamento
                </Button>
              )}
            </div>
          </div>

          {/* Itens — mesma lista que OrdersScreen usa em conceito */}
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Itens</p>
            <ul className="space-y-3">
              {(order.items || []).map((it, idx) => {
                const label = it.name || (it as { product_name?: string }).product_name || 'Item';
                const ext = it as {
                  observation?: string | null;
                  obs_opcoes?: string | null;
                  item_display_details?: string[];
                };
                const detail = getOrderItemDetailText(ext);
                const lines =
                  Array.isArray(ext.item_display_details) && ext.item_display_details.length > 0
                    ? ext.item_display_details
                    : splitOrderItemDetailLines(detail);
                const unit = Number(it.price_at_time || 0);
                const lineTotal = unit * Number(it.quantity);
                return (
                  <li
                    key={`${it.product_id}-${idx}`}
                    className="border-b border-zinc-100 dark:border-zinc-800 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300 min-w-0 font-semibold">
                        {label} ×{it.quantity}
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums shrink-0">
                        {formatMoney(lineTotal)}
                      </span>
                    </div>
                    {lines.length > 0 ? (
                      <>
                        <ul className="mt-1.5 ml-1 space-y-0.5 text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
                          {lines.map((line, j) => (
                            <li key={j} className="flex gap-1.5">
                              <span className="text-zinc-400 shrink-0" aria-hidden>–</span>
                              <span className="min-w-0">{line}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                          Unitário {formatMoney(unit)} (congelado na venda); à direita, total da linha.
                        </p>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {(order.items || []).length === 0 && (
              <p className="text-sm text-zinc-400">Sem itens na lista.</p>
            )}
          </div>

          {order.observation && String(order.observation).trim() && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Observação</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{order.observation}</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
