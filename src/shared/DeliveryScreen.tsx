import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bike, Package, Clock, CheckCircle2, XCircle, MapPin,
  Phone, Settings, RefreshCw, ChevronRight,
  User, CreditCard, Banknote, Smartphone, Check,
  Truck, AlertCircle, DollarSign, TrendingUp, Users, Search,
  Printer, Navigation, MessageCircle, BarChart2, Tag, Plus, Trash2,
  Zap, Globe, Bell, BellOff, Map,
} from 'lucide-react';
import { openPrintPreview } from '../utils/print';
import OrdersScreen from './OrdersScreen';

// ─── Sound utils (inline — sem dep externa) ───────────────────────────────────
function playNewOrderSound() {
  try {
    const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const beep = (freq: number, start: number, dur: number, vol: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
    };
    beep(440, 0.00, 0.14, 0.35);
    beep(660, 0.18, 0.14, 0.40);
    beep(880, 0.36, 0.22, 0.50);
  } catch {}
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Pedido {
  id: number; order_number: string; status: string; total_amount: number;
  cliente_nome?: string; cliente_tel?: string; endereco?: string;
  pagamento_tipo?: string; pagamento_status?: string; taxa_entrega?: number;
  motoboy_id?: number; saiu_entrega_at?: string; entregue_at?: string;
  created_at: string; resumo_itens?: string; observation?: string;
  delivery_checkout_snapshot?: DeliveryCheckoutSnapshot | string | null;
}
interface Motoboy { id: number; nome: string; cargo: string; }
interface DeliveryConfig {
  ativo: boolean; taxa_entrega?: number; pedido_minimo?: number;
  tempo_preparo?: number; whatsapp?: string; pix_chave?: string;
  pix_nome?: string; pix_cidade?: string; pix_payload_estatico?: string;
  desconto_pix?: number; horario_abertura?: string; horario_fechamento?: string;
  modelo_entrega?: 'bairro_fixo';
  bairros_atendidos?: string; valor_por_entrega?: number;
  zonas_entrega?: Array<{ nome: string; taxa: number }>;
  desconto_primeiro_cliente_ativo?: boolean;
  desconto_primeiro_cliente_tipo?: 'percentual'|'fixo'|'frete_gratis';
  desconto_primeiro_cliente_valor?: number;
  desconto_primeiro_cliente_min_pedido?: number;
  evolution_url?: string; evolution_token?: string; evolution_instance?: string;
}
interface Dashboard {
  pedidos_hoje: number; faturamento_hoje: number;
  em_preparo: number; em_rota: number;
  top_motoboy: { nome: string; entregas: number } | null;
  ticket_medio: number;
}
interface Cupom {
  id: number; codigo: string; tipo: 'percentual'|'fixo'|'frete_gratis';
  valor: number; min_pedido: number; limite_uso: number|null;
  uso_atual: number; ativo: number; validade: string|null; created_at: string;
}
interface DeliveryCheckoutSnapshot {
  modelo_entrega?: 'bairro_fixo';
  bairro_entrega?: string | null;
  taxa_entrega?: number;
  zona_entrega?: { nome: string; taxa: number } | null;
  desconto_pix?: number;
  desconto_cupom?: number;
  desconto_primeiro_cliente?: number;
  total?: number;
  primeiro_cliente?: {
    descricao?: string;
    mensagem?: string;
  } | null;
}
interface DeliveryCustomer {
  id: number;
  nome: string;
  telefone: string;
  email?: string | null;
  observacoes?: string | null;
  origem_cadastro?: string | null;
  primeira_compra_at?: string | null;
  ultima_compra_at?: string | null;
  ultimo_pedido?: string | null;
  dias_sem_comprar?: number | null;
  status_atividade?: string | null;
  cliente_recorrente?: boolean;
  total_pedidos?: number;
  total_pedidos_validos?: number;
  total_gasto?: number;
  sem_historico?: boolean;
}
interface CustomerOrderHistory {
  id: number;
  order_number: string;
  created_at: string;
  total_amount: number;
  resumo_itens?: string | null;
}

// ─── Config de status ─────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; next?: string }> = {
  'Criado':              { label: 'Recebido',     color: '#3b82f6', bg: '#eff6ff', icon: <Package size={14}/>,      next: 'Em Preparo' },
  'Pedido Recebido':     { label: 'Recebido',     color: '#3b82f6', bg: '#eff6ff', icon: <Package size={14}/>,      next: 'Em Preparo' },
  'Em Preparo':          { label: 'Em Preparo',   color: '#f59e0b', bg: '#fffbeb', icon: <Clock size={14}/>,         next: 'Pronto para Entrega' },
  'Pronto para Entrega': { label: 'Pronto',       color: '#8b5cf6', bg: '#f5f3ff', icon: <CheckCircle2 size={14}/>,  next: 'Saiu para Entrega' },
  'Saiu para Entrega':   { label: 'Em Rota',      color: '#f97316', bg: '#fff7ed', icon: <Bike size={14}/>,          next: 'Entregue' },
  'Entregue':            { label: 'Entregue',     color: '#10b981', bg: '#ecfdf5', icon: <CheckCircle2 size={14}/>,  next: undefined },
  'Cancelado':           { label: 'Cancelado',    color: '#ef4444', bg: '#fef2f2', icon: <XCircle size={14}/>,       next: undefined },
};

const PAGS: Record<string, { label: string; icon: React.ReactNode }> = {
  pix:      { label: 'Pix',            icon: <Smartphone size={12}/> },
  dinheiro: { label: 'Dinheiro',       icon: <Banknote size={12}/>   },
  cartao:   { label: 'Cartão entrega', icon: <CreditCard size={12}/> },
};

const fmt      = (v: number) => `R$ ${(v||0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtHour  = (d?: string) => d ? new Date(d.includes('T')?d:d.replace(' ','T')).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
const parseDeliveryCheckoutSnapshot = (value: Pedido['delivery_checkout_snapshot']) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as DeliveryCheckoutSnapshot;
    } catch {
      return null;
    }
  }
  return value;
};
const CUSTOMER_ACTIVITY_CFG: Record<string, { label: string; tone: string; helper: string }> = {
  ativo:      { label: 'Ativo',      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', helper: 'Comprou recentemente' },
  em_risco:   { label: 'Em risco',   tone: 'bg-amber-50 text-amber-700 border-amber-200',       helper: 'Vale acompanhar' },
  inativo:    { label: 'Inativo',    tone: 'bg-rose-50 text-rose-700 border-rose-200',          helper: 'Bom candidato a reativacao' },
  sem_compra: { label: 'Sem compra', tone: 'bg-zinc-100 text-zinc-600 border-zinc-200',         helper: 'Ainda sem historico valido' },
};
const CUSTOMER_ORIGIN_LABELS: Record<string, string> = {
  delivery_online: 'Cardapio online',
  pedido_manual: 'Pedido manual',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  telefone: 'Telefone',
  balcao: 'Balcao',
};
const parseDateValue = (d?: string | null) => {
  if (!d) return null;
  const value = String(d);
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};
const fmtDate = (d?: string | null) => {
  const value = parseDateValue(d);
  return value ? value.toLocaleDateString('pt-BR') : '—';
};
const getCustomerActivityMeta = (status?: string | null) =>
  CUSTOMER_ACTIVITY_CFG[String(status || '').trim()] || CUSTOMER_ACTIVITY_CFG.sem_compra;
const getCustomerOriginLabel = (origem?: string | null) => {
  const normalized = String(origem || '').trim().toLowerCase();
  if (!normalized) return 'Nao informado';
  if (CUSTOMER_ORIGIN_LABELS[normalized]) return CUSTOMER_ORIGIN_LABELS[normalized];
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};
const getDaysWithoutPurchaseLabel = (dias?: number | null) => {
  if (dias === null || dias === undefined) return 'Sem historico';
  if (dias <= 0) return 'Comprou hoje';
  if (dias === 1) return '1 dia sem comprar';
  return `${dias} dias sem comprar`;
};
const getCustomerPurchaseSummary = (customer: DeliveryCustomer) =>
  customer.ultima_compra_at || customer.ultimo_pedido ? getDaysWithoutPurchaseLabel(customer.dias_sem_comprar) : 'Sem compras registradas';

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function DeliveryScreen({ token, slug }: { token: string; slug?: string }) {
  const [tab, setTab] = useState<'orders'|'painel'|'clientes'|'motoboys'|'relatorio'|'config'>('orders');

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="h-full overflow-y-auto bg-zinc-50">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-zinc-900 flex items-center gap-2"><Bike size={24}/>Delivery</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Gestão de pedidos, motoboys e configurações</p>
          </div>
          {slug && (
            <a href={`/delivery/${slug}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors">
              <MapPin size={14}/> Ver Cardápio Online
            </a>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-white border border-zinc-200 rounded-xl p-1 gap-0.5 w-fit flex-wrap">
          {([
            { key:'orders',    label:'Pedidos Balcao', icon:<Package size={14}/> },
            { key:'painel',    label:'Painel',         icon:<Package size={14}/> },
            { key:'clientes',  label:'Clientes',        icon:<Users size={14}/> },
            { key:'motoboys',  label:'Motoboys',        icon:<Truck size={14}/> },
            { key:'relatorio', label:'Relatório',       icon:<BarChart2 size={14}/> },
            { key:'config',    label:'Configurações',  icon:<Settings size={14}/> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab===t.key?'bg-zinc-900 text-white':'text-zinc-500 hover:bg-zinc-50'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'orders'    && <OrdersScreen token={token} channelFilter="non_delivery" />}
        {tab === 'painel'    && <TabPainel   token={token} />}
        {tab === 'clientes'  && <TabClientes token={token} />}
        {tab === 'motoboys'  && <TabMotoboys token={token} />}
        {tab === 'relatorio' && <TabRelatorio token={token} />}
        {tab === 'config'    && <TabConfig   token={token} slug={slug} />}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA PAINEL — com SSE + som + reimprimir
// ═══════════════════════════════════════════════════════════════════════════════
function TabPainel({ token }: { token: string }) {
  const [pedidos, setPedidos]           = useState<Pedido[]>([]);
  const [motoboys, setMotoboys]         = useState<Motoboy[]>([]);
  const [dash, setDash]                 = useState<Dashboard | null>(null);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ativos');
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [sseConectado, setSseConectado] = useState(false);
  const [somAtivo, setSomAtivo]         = useState(() => localStorage.getItem('delivery_som') !== 'false');
  const esRef                           = useRef<EventSource | null>(null);
  const reconnRef                       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedidosRef                      = useRef<Pedido[]>([]);
  pedidosRef.current                    = pedidos;
  const hdrs = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, mRes, dRes] = await Promise.all([
        fetch('/api/delivery/pedidos', { headers: hdrs }),
        fetch('/api/delivery/motoboys', { headers: hdrs }),
        fetch('/api/delivery/dashboard', { headers: hdrs }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); if (Array.isArray(d)) setPedidos(d); }
      if (mRes.ok) { const d = await mRes.json(); if (Array.isArray(d)) setMotoboys(d); }
      if (dRes.ok) { const d = await dRes.json(); setDash(d); }
    } catch {}
    setLoading(false);
  }, [token]);

  // ── SSE ───────────────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;
    es.addEventListener('connected', () => setSseConectado(true));
    es.addEventListener('ping', () => {});
    es.addEventListener('novo_pedido', (e) => {
      setSseConectado(true);
      fetchAll();
      if (somAtivo && localStorage.getItem('delivery_som') !== 'false') playNewOrderSound();
    });
    es.addEventListener('status_pedido', () => { fetchAll(); });
    es.onerror = () => {
      setSseConectado(false);
      es.close(); esRef.current = null;
      reconnRef.current = setTimeout(connectSSE, 5000);
    };
  }, [token, fetchAll]);

  useEffect(() => {
    fetchAll();
    connectSSE();
    // Fallback polling a cada 30s caso SSE falhe
    const iv = setInterval(fetchAll, 30000);
    return () => {
      clearInterval(iv);
      if (esRef.current) esRef.current.close();
      if (reconnRef.current) clearTimeout(reconnRef.current);
    };
  }, [fetchAll, connectSSE]);

  const toggleSom = () => {
    const novo = !somAtivo;
    setSomAtivo(novo);
    localStorage.setItem('delivery_som', String(novo));
    if (novo) playNewOrderSound();
  };

  const mudarStatus = async (id: number, status: string, motoboyId?: number) => {
    const body: any = { status };
    if (motoboyId) body.motoboy_id = motoboyId;
    await fetch(`/api/delivery/pedidos/${id}/status`, {
      method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    fetchAll();
    if (selectedPedido?.id === id) setSelectedPedido(p => p ? { ...p, status } : null);
  };

  const marcarPago = async (id: number) => {
    await fetch(`/api/delivery/pedidos/${id}/pagamento`, {
      method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagamento_status: 'pago' }),
    });
    fetchAll();
  };

  const reimprimir = async (pedidoId: number) => {
    try {
      const r = await fetch(`/api/print/cupom-html/${pedidoId}`, { headers: hdrs });
      const html = await r.text();
      openPrintPreview(html, 'width=420,height=700,toolbar=0,menubar=0,location=0');
    } catch { alert('Erro ao reimprimir'); }
  };

  const ATIVOS  = ['Criado','Pedido Recebido','Em Preparo','Pronto para Entrega','Saiu para Entrega'];
  const filtrados = statusFilter === 'ativos' ? pedidos.filter(p => ATIVOS.includes(p.status))
    : statusFilter === 'todos'           ? pedidos
    : statusFilter === 'Pedido Recebido' ? pedidos.filter(p => p.status==='Criado'||p.status==='Pedido Recebido')
    : pedidos.filter(p => p.status === statusFilter);
  const COLUNAS = ['Criado','Em Preparo','Pronto para Entrega','Saiu para Entrega'];
  const selectedPedidoSnapshot = parseDeliveryCheckoutSnapshot(selectedPedido?.delivery_checkout_snapshot);

  return (
    <div className="space-y-5">
      {/* Dashboard */}
      {dash && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <DCard label="Pedidos Hoje"  value={String(dash.pedidos_hoje)}   color="blue"    icon={<Package size={16}/>} />
          <DCard label="Faturamento"   value={fmt(dash.faturamento_hoje)}  color="emerald" icon={<DollarSign size={16}/>} />
          <DCard label="Em Preparo"    value={String(dash.em_preparo)}     color="amber"   icon={<Clock size={16}/>} />
          <DCard label="Em Rota"       value={String(dash.em_rota)}        color="orange"  icon={<Bike size={16}/>} />
          <DCard label="Ticket Médio"  value={fmt(dash.ticket_medio)}      color="purple"  icon={<TrendingUp size={16}/>} />
          <DCard label="Top Motoboy"   value={dash.top_motoboy ? `${dash.top_motoboy.nome.split(' ')[0]} (${dash.top_motoboy.entregas})` : '—'} color="zinc" icon={<User size={16}/>} />
        </div>
      )}

      {/* Barra de controles */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key:'ativos',  label:'Ativos' },
          { key:'todos',   label:'Todos'  },
          ...Object.entries(STATUS_CFG).filter(([k]) => k !== 'Pedido Recebido').map(([k,v]) => ({ key:k, label:v.label })),
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${statusFilter===f.key?'bg-zinc-900 text-white':'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {/* Indicador SSE */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold ${sseConectado?'bg-emerald-50 text-emerald-700':'bg-zinc-100 text-zinc-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sseConectado?'bg-emerald-500 animate-pulse':'bg-zinc-400'}`}/>
            {sseConectado?'Ao vivo':'Polling'}
          </div>
          {/* Toggle som */}
          <button onClick={toggleSom} title={somAtivo?'Desativar som':'Ativar som'}
            className={`p-2 rounded-xl text-xs font-bold transition-all ${somAtivo?'bg-emerald-50 text-emerald-700':'bg-zinc-100 text-zinc-400'}`}>
            {somAtivo ? <Bell size={15}/> : <BellOff size={15}/>}
          </button>
          <button onClick={fetchAll} className="p-2 bg-white border border-zinc-200 rounded-xl text-zinc-400 hover:text-zinc-700">
            <RefreshCw size={15}/>
          </button>
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>
      ) : statusFilter === 'ativos' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUNAS.map(col => {
            const colPedidos = col==='Criado'
              ? pedidos.filter(p => p.status==='Criado'||p.status==='Pedido Recebido')
              : pedidos.filter(p => p.status===col);
            const cfg = STATUS_CFG[col];
            return (
              <div key={col} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2" style={{ borderLeftWidth:3, borderLeftColor:cfg.color }}>
                  <span style={{ color:cfg.color }}>{cfg.icon}</span>
                  <span className="font-black text-sm text-zinc-900">{cfg.label}</span>
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:cfg.bg, color:cfg.color }}>{colPedidos.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[120px] max-h-[60vh] overflow-y-auto">
                  {colPedidos.length===0 ? (
                    <p className="text-center text-xs text-zinc-300 py-8">Nenhum pedido</p>
                  ) : colPedidos.map(p => (
                    <PedidoCard key={p.id} pedido={p} motoboys={motoboys}
                      onDetail={() => setSelectedPedido(p)}
                      onAvancar={(mbId) => cfg.next && mudarStatus(p.id, cfg.next!, mbId)}
                      onReimprimir={() => reimprimir(p.id)}
                      cfg={cfg}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Pedido</th>
              <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Cliente</th>
              <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Pagamento</th>
              <th className="text-right px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3"/>
            </tr></thead>
            <tbody className="divide-y divide-zinc-50">
              {filtrados.map(p => {
                const cfg = STATUS_CFG[p.status] || STATUS_CFG['Pedido Recebido'];
                return (
                  <tr key={p.id} className="hover:bg-zinc-50 cursor-pointer" onClick={() => setSelectedPedido(p)}>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-800">#{p.order_number}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.cliente_nome || '—'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background:cfg.bg, color:cfg.color }}>{cfg.label}</span></td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{PAGS[p.pagamento_tipo||'']?.label || p.pagamento_tipo}</td>
                    <td className="px-4 py-3 font-bold text-zinc-800 text-right">{fmt(p.total_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={(e) => { e.stopPropagation(); reimprimir(p.id); }}
                          className="p-1.5 hover:bg-emerald-50 text-emerald-500 rounded-lg" title="Reimprimir">
                          <Printer size={14}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalhe do pedido */}
      <AnimatePresence>
        {selectedPedido && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSelectedPedido(null)}>
            <motion.div onClick={e=>e.stopPropagation()}
              initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.9, opacity:0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-zinc-900">Pedido #{selectedPedido.order_number}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => reimprimir(selectedPedido.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all">
                    <Printer size={12}/> Reimprimir
                  </button>
                  <button onClick={() => setSelectedPedido(null)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400">✕</button>
                </div>
              </div>

              {(() => {
                const cfg = STATUS_CFG[selectedPedido.status] || STATUS_CFG['Pedido Recebido'];
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4" style={{ background:cfg.bg }}>
                    <span style={{ color:cfg.color }}>{cfg.icon}</span>
                    <span className="font-black text-sm" style={{ color:cfg.color }}>{cfg.label}</span>
                    <span className="text-xs text-zinc-400 ml-auto">{fmtHour(selectedPedido.created_at)}</span>
                  </div>
                );
              })()}

              <div className="space-y-3 text-sm">
                <div className="bg-zinc-50 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Cliente</p>
                  <p className="font-bold text-zinc-900">{selectedPedido.cliente_nome || '—'}</p>
                  {selectedPedido.cliente_tel && <p className="text-zinc-500 flex items-center gap-1"><Phone size={12}/>{selectedPedido.cliente_tel}</p>}
                  {selectedPedido.endereco && <p className="text-zinc-500 flex items-center gap-1"><MapPin size={12}/>{selectedPedido.endereco}</p>}
                  {selectedPedido.endereco && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPedido.endereco)}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all">
                        <Navigation size={12}/> Ver no Maps
                      </a>
                      {selectedPedido.cliente_tel && (
                        <a href={`https://wa.me/${selectedPedido.cliente_tel.replace(/\D/g,'')}?text=${encodeURIComponent(`🛵 *Seu pedido #${selectedPedido.order_number} saiu para entrega!*\n\n📍 ${selectedPedido.endereco}\n💰 Total: ${fmt(selectedPedido.total_amount)}\n\nPrevisão: em breve ✅`)}`}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 transition-all">
                          <MessageCircle size={12}/> Avisar cliente
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {selectedPedido.resumo_itens && (
                  <div className="bg-zinc-50 rounded-xl p-3">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Itens</p>
                    <p className="text-zinc-700">{selectedPedido.resumo_itens}</p>
                    {selectedPedido.observation && (
                      <div className="mt-2 space-y-0.5">
                        {selectedPedido.observation.split('\n').filter((l:string) => !l.startsWith('🛵')).map((l:string,i:number) => (
                          <p key={i} className="text-zinc-500 text-xs">{l}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-zinc-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-0.5">Pagamento</p>
                    <p className="font-bold text-zinc-900">{PAGS[selectedPedido.pagamento_tipo||'']?.label || selectedPedido.pagamento_tipo}</p>
                    {selectedPedido.taxa_entrega > 0 && <p className="text-xs text-zinc-400">Taxa: {fmt(selectedPedido.taxa_entrega)}</p>}
                    {selectedPedido.observation && (() => {
                      const m = selectedPedido.observation.match(/Troco para R\$\s*([\d,\.]+)/i);
                      return m ? <p className="text-xs font-bold text-amber-600 mt-0.5">💰 Troco p/ R${m[1]}</p> : null;
                    })()}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-zinc-900">{fmt(selectedPedido.total_amount)}</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selectedPedido.pagamento_status==='pago'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                      {selectedPedido.pagamento_status==='pago'?'✓ Pago':'Aguardando'}
                    </span>
                  </div>
                </div>

                {selectedPedidoSnapshot && (
                  <div className="bg-zinc-50 rounded-xl p-3 space-y-1.5">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Resumo comercial</p>
                    <p className="text-xs text-zinc-500">
                      Modelo atual: bairro com taxa fixa
                      {selectedPedidoSnapshot.zona_entrega?.nome
                        ? ` · ${selectedPedidoSnapshot.zona_entrega.nome}`
                        : selectedPedidoSnapshot.bairro_entrega
                          ? ` · ${selectedPedidoSnapshot.bairro_entrega}`
                          : ''}
                    </p>
                    {Number(selectedPedidoSnapshot.desconto_pix || 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-emerald-600 font-semibold">
                        <span>Desconto Pix</span>
                        <span>-{fmt(Number(selectedPedidoSnapshot.desconto_pix || 0))}</span>
                      </div>
                    )}
                    {Number(selectedPedidoSnapshot.desconto_cupom || 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-emerald-600 font-semibold">
                        <span>Cupom</span>
                        <span>-{fmt(Number(selectedPedidoSnapshot.desconto_cupom || 0))}</span>
                      </div>
                    )}
                    {Number(selectedPedidoSnapshot.desconto_primeiro_cliente || 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-amber-600 font-semibold">
                        <span>Primeira compra</span>
                        <span>-{fmt(Number(selectedPedidoSnapshot.desconto_primeiro_cliente || 0))}</span>
                      </div>
                    )}
                    {selectedPedidoSnapshot.primeiro_cliente?.mensagem && (
                      <p className="text-[11px] text-zinc-500">{selectedPedidoSnapshot.primeiro_cliente.mensagem}</p>
                    )}
                  </div>
                )}

                {/* Mapa para motoboy */}
                {selectedPedido.endereco && (() => {
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPedido.endereco)}`;
                  const pagInfo = selectedPedido.pagamento_status==='pago' ? '✅ JÁ PAGO'
                    : selectedPedido.pagamento_tipo==='dinheiro' ? `💵 COBRAR R$ ${selectedPedido.total_amount.toFixed(2).replace('.',',')} em dinheiro`
                    : `💳 COBRAR R$ ${selectedPedido.total_amount.toFixed(2).replace('.',',')} no cartão`;
                  const msg = `🛵 *ENTREGA #${selectedPedido.order_number}*\n\n👤 ${selectedPedido.cliente_nome}\n📱 ${selectedPedido.cliente_tel||'—'}\n\n📍 *Endereço:*\n${selectedPedido.endereco}\n🗺️ ${mapsUrl}\n\n${pagInfo}\n\n${selectedPedido.resumo_itens||''}`;
                  return (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="text-[10px] font-black text-orange-600 uppercase tracking-wider mb-2">📦 Enviar rota para motoboy</p>
                      <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-all">
                        <MessageCircle size={14}/> Enviar pelo WhatsApp
                      </a>
                    </div>
                  );
                })()}

                {selectedPedido.pagamento_tipo==='pix' && selectedPedido.pagamento_status!=='pago' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold text-blue-700 mb-2">Pagamento via Pix pendente</p>
                    <button onClick={() => marcarPago(selectedPedido.id)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors">
                      ✓ Confirmar Pagamento Pix
                    </button>
                  </div>
                )}

                {/* Link de rastreamento para o cliente */}
                {(() => {
                  try {
                    const slug = JSON.parse(atob(token.split('.')[1])).username;
                    const url  = `${window.location.origin}/delivery/${slug}/pedido/${selectedPedido.id}`;
                    return (
                      <div className="bg-zinc-50 rounded-xl p-3">
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">🔗 Link de rastreamento</p>
                        <div className="flex items-center gap-2">
                          <input readOnly value={url}
                            className="flex-1 text-xs text-zinc-600 bg-white border border-zinc-200 rounded-lg px-3 py-2 font-mono"/>
                          <button onClick={() => { navigator.clipboard.writeText(url); }}
                            className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-500 transition-colors flex-shrink-0" title="Copiar">
                            <Check size={13}/>
                          </button>
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* Ações de status */}
                {(() => {
                  const cfg = STATUS_CFG[selectedPedido.status] || STATUS_CFG['Pedido Recebido'];
                  if (!cfg.next) return null;
                  return (
                    <button onClick={() => { mudarStatus(selectedPedido.id, cfg.next!); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-95"
                      style={{ background:cfg.color, color:'#fff' }}>
                      <ChevronRight size={16}/> Avançar para {cfg.next}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PedidoCard ───────────────────────────────────────────────────────────────
function PedidoCard({ pedido, motoboys, onDetail, onAvancar, onReimprimir, cfg }: {
  key?: React.Key;
  pedido: Pedido; motoboys: Motoboy[];
  onDetail: () => void; onAvancar: (mbId?: number) => void | Promise<void>;
  onReimprimir: () => void | Promise<void>;
  cfg: any;
}) {
  const [selectedMotoboy, setSelectedMotoboy] = useState<number | ''>('');
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000));
  return (
    <div className="bg-white rounded-xl border border-zinc-100 p-3 hover:border-zinc-300 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-black text-zinc-900 text-sm">#{pedido.order_number}</p>
          {pedido.cliente_nome && <p className="text-xs text-zinc-500">{pedido.cliente_nome}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-[10px] font-bold ${elapsed>=20?'text-red-500':'text-zinc-400'}`}>{elapsed===0?'agora':`${elapsed}min`}</span>
          <button onClick={onReimprimir} className="p-1 hover:bg-emerald-50 text-emerald-500 rounded" title="Reimprimir"><Printer size={12}/></button>
          <button onClick={onDetail} className="p-1 hover:bg-zinc-100 text-zinc-400 rounded"><ChevronRight size={14}/></button>
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-1 truncate">{pedido.resumo_itens || '—'}</p>
      <div className="flex items-center justify-between">
        <span className="font-black text-sm text-zinc-800">{fmt(pedido.total_amount)}</span>
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${pedido.pagamento_status==='pago'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
          {pedido.pagamento_status==='pago'?'Pago':'Aguardando'}
        </span>
      </div>
      {cfg.next && (
        <div className="mt-2 space-y-1">
          {cfg.next==='Saiu para Entrega' && (
            <select value={selectedMotoboy} onChange={e=>setSelectedMotoboy(e.target.value?Number(e.target.value):'')}
              className={`w-full text-xs px-2 py-1.5 border rounded-lg bg-zinc-50 transition-all ${!selectedMotoboy?'border-amber-300 bg-amber-50':'border-zinc-200'}`}>
              <option value="">⚠️ Selecione o motoboy...</option>
              {motoboys.length===0
                ? <option disabled>Nenhum motoboy cadastrado</option>
                : motoboys.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)
              }
            </select>
          )}
          {(() => {
            const precisaMotoboy = cfg.next==='Saiu para Entrega';
            const bloqueado = precisaMotoboy && (!selectedMotoboy || motoboys.length===0);
            return (
              <button
                onClick={() => { if (!bloqueado) onAvancar(selectedMotoboy||undefined); }}
                disabled={bloqueado}
                title={bloqueado ? 'Selecione um motoboy antes de despachar' : undefined}
                className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  bloqueado
                    ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
                    : 'hover:opacity-90 active:scale-95'
                }`}
                style={!bloqueado ? { background:cfg.color, color:'#fff' } : {}}>
                <ChevronRight size={12}/>
                {bloqueado
                  ? 'Selecione o motoboy'
                  : cfg.next==='Em Preparo'?'Preparar'
                  : cfg.next==='Pronto para Entrega'?'Pronto'
                  : cfg.next==='Saiu para Entrega'?'Despachar'
                  : 'Entregar'}
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── DCard ────────────────────────────────────────────────────────────────────
function DCard({ label, value, color, icon }: { label:string; value:string; color:string; icon:React.ReactNode }) {
  const C: Record<string,{bg:string;text:string}> = {
    blue:{'bg':'bg-blue-50','text':'text-blue-600'}, emerald:{'bg':'bg-emerald-50','text':'text-emerald-600'},
    amber:{'bg':'bg-amber-50','text':'text-amber-600'}, orange:{'bg':'bg-orange-50','text':'text-orange-600'},
    purple:{'bg':'bg-purple-50','text':'text-purple-600'}, zinc:{'bg':'bg-zinc-100','text':'text-zinc-600'},
  };
  const c = C[color]||C.zinc;
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-4">
      <div className={`w-8 h-8 ${c.bg} ${c.text} rounded-xl flex items-center justify-center mb-2`}>{icon}</div>
      <p className="text-xl font-black text-zinc-900 leading-none">{value}</p>
      <p className="text-[11px] text-zinc-400 mt-1 font-medium">{label}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA CLIENTES
// ═══════════════════════════════════════════════════════════════════════════════
function TabClientes({ token }: { token: string }) {
  const [clientes, setClientes]   = useState<DeliveryCustomer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<DeliveryCustomer|null>(null);
  const [pedidos, setPedidos]     = useState<CustomerOrderHistory[]>([]);
  const hdrs = { Authorization: `Bearer ${token}` };

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/delivery/clientes${q}`, { headers: hdrs });
      if (res.ok) {
        const d = await res.json();
        setClientes(Array.isArray(d) ? d : []);
      }
    } catch {}
    setLoading(false);
  }, [token, search]);

  const fetchPedidos = async (id: number) => {
    setPedidos([]);
    try {
      const res = await fetch(`/api/delivery/clientes/${id}/pedidos`, { headers: hdrs });
      if (res.ok) {
        const d = await res.json();
        setPedidos(Array.isArray(d) ? d : []);
      }
    } catch {}
  };

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const ativos = clientes.filter((c) => c.status_atividade === 'ativo').length;
  const emRisco = clientes.filter((c) => c.status_atividade === 'em_risco').length;
  const inativos = clientes.filter((c) => c.status_atividade === 'inativo').length;
  const semCompra = clientes.filter((c) => c.status_atividade === 'sem_compra').length;
  const recorrentes = clientes.filter((c) => c.cliente_recorrente).length;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&fetchClientes()}
            placeholder="Buscar por nome, telefone ou observacoes..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
        </div>
        <button onClick={fetchClientes} className="px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors">Buscar</button>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <DCard label="Ativos" value={String(ativos)} color="emerald" icon={<CheckCircle2 size={16}/>}/>
          <DCard label="Em risco" value={String(emRisco)} color="amber" icon={<AlertCircle size={16}/>}/>
          <DCard label="Inativos" value={String(inativos)} color="orange" icon={<Clock size={16}/>}/>
          <DCard label="Sem compra" value={String(semCompra)} color="zinc" icon={<Package size={16}/>}/>
          <DCard label="Recorrentes" value={String(recorrentes)} color="blue" icon={<TrendingUp size={16}/>}/>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead><tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Telefone</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Relacionamento</th>
                <th className="text-right px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Pedidos</th>
                <th className="text-right px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Total gasto</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Ultima compra</th>
                <th className="px-4 py-3"/>
              </tr></thead>
              <tbody className="divide-y divide-zinc-50">
                {clientes.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-zinc-800">{c.nome}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100">
                          {getCustomerOriginLabel(c.origem_cadastro)}
                        </span>
                        {c.cliente_recorrente && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-50 text-violet-700 border border-violet-100">
                            Recorrente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-zinc-600 font-mono text-xs">{c.telefone || '—'}</p>
                      {c.observacoes && (
                        <p className="text-[11px] text-zinc-400 mt-1 max-w-[220px] truncate" title={c.observacoes}>
                          {c.observacoes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const status = getCustomerActivityMeta(c.status_atividade);
                        return (
                          <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${status.tone}`}>
                              {status.label}
                            </span>
                            <p className="text-[11px] text-zinc-500 mt-1">{getDaysWithoutPurchaseLabel(c.dias_sem_comprar)}</p>
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 font-bold text-right">{c.total_pedidos||0}</td>
                    <td className="px-4 py-3 font-bold text-emerald-700 text-right">{fmt(c.total_gasto||0)}</td>
                    <td className="px-4 py-3">
                      <p className="text-zinc-600 text-xs font-semibold">{fmtDate(c.ultima_compra_at || c.ultimo_pedido)}</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{getCustomerPurchaseSummary(c)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelected(c); fetchPedidos(c.id); }}
                        className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-xs font-bold text-zinc-600 transition-all">
                        Ver historico
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {clientes.length===0 && <p className="text-center text-zinc-400 py-12 text-sm">Nenhum cliente encontrado</p>}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={()=>setSelected(null)}>
            <motion.div onClick={e=>e.stopPropagation()}
              initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
              className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black text-zinc-900">{selected.nome}</h3>
                  <p className="text-sm text-zinc-400 font-mono">{selected.telefone}</p>
                </div>
                <button onClick={()=>setSelected(null)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400">✕</button>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {(() => {
                  const status = getCustomerActivityMeta(selected.status_atividade);
                  return (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border ${status.tone}`}>
                      {status.label}
                    </span>
                  );
                })()}
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-100">
                  {getCustomerOriginLabel(selected.origem_cadastro)}
                </span>
                {selected.cliente_recorrente && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-violet-50 text-violet-700 border border-violet-100">
                    Cliente recorrente
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <div className="bg-zinc-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-zinc-900">{selected.total_pedidos||0}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Pedidos</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-emerald-700">{fmt(selected.total_gasto||0)}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Total gasto</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-black text-blue-700">{fmtDate(selected.ultima_compra_at || selected.ultimo_pedido)}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Ultima compra</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-black text-amber-700">{getDaysWithoutPurchaseLabel(selected.dias_sem_comprar)}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Recencia</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
                <div className="bg-zinc-50 rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Leitura operacional</p>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-zinc-500">Status</span>
                    <span className="text-sm font-bold text-zinc-800 text-right">{getCustomerActivityMeta(selected.status_atividade).helper}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-zinc-500">Primeira compra</span>
                    <span className="text-sm font-bold text-zinc-800 text-right">{fmtDate(selected.primeira_compra_at)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-zinc-500">Origem</span>
                    <span className="text-sm font-bold text-zinc-800 text-right">{getCustomerOriginLabel(selected.origem_cadastro)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-zinc-500">Perfil</span>
                    <span className="text-sm font-bold text-zinc-800 text-right">{selected.cliente_recorrente ? 'Recorrente' : 'Pontual'}</span>
                  </div>
                </div>

                <div className="bg-zinc-50 rounded-xl p-4">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">Observacoes</p>
                  {selected.observacoes ? (
                    <p className="text-sm text-zinc-700 whitespace-pre-wrap break-words">{selected.observacoes}</p>
                  ) : (
                    <p className="text-sm text-zinc-400">Nenhuma observacao cadastrada.</p>
                  )}
                </div>
              </div>

              <p className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">Historico de pedidos</p>
              <div className="space-y-2">
                {pedidos.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-zinc-800">#{p.order_number}</p>
                      <p className="text-xs text-zinc-400">{p.resumo_itens||'—'}</p>
                      <p className="text-[10px] text-zinc-300 mt-0.5">{fmtDate(p.created_at)}</p>
                    </div>
                    <span className="font-black text-sm text-zinc-700">{fmt(p.total_amount)}</span>
                  </div>
                ))}
                {pedidos.length===0 && <p className="text-center text-zinc-300 text-sm py-6">Sem pedidos anteriores</p>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MOTOBOYS
// ═══════════════════════════════════════════════════════════════════════════════
function TabMotoboys({ token }: { token: string }) {
  const [relatorio, setRelatorio] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [mes, setMes]             = useState(new Date().getMonth()+1);
  const [ano, setAno]             = useState(new Date().getFullYear());
  const hdrs = { Authorization: `Bearer ${token}` };

  const fetch_relatorio = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery/motoboys/relatorio?month=${mes}&year=${ano}`, { headers: hdrs });
      if (res.ok) setRelatorio(await res.json());
    } catch {}
    setLoading(false);
  }, [token, mes, ano]);

  useEffect(() => { fetch_relatorio(); }, [fetch_relatorio]);

  const total_entregas = relatorio.reduce((a,r)=>a+(r.total_entregas||0),0);
  const total_pagar    = relatorio.reduce((a,r)=>a+(r.total_a_pagar||0),0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={mes} onChange={e=>setMes(Number(e.target.value))}
          className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none">
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(0,i).toLocaleString('pt-BR',{month:'long'})}</option>)}
        </select>
        <input type="number" value={ano} onChange={e=>setAno(Number(e.target.value))}
          className="w-24 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none"/>
        <button onClick={fetch_relatorio} className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors">Filtrar</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <p className="text-3xl font-black text-zinc-900">{total_entregas}</p>
          <p className="text-sm text-zinc-400 mt-1">Total de entregas</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <p className="text-3xl font-black text-emerald-700">{fmt(total_pagar)}</p>
          <p className="text-sm text-zinc-400 mt-1">Total a pagar</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Motoboy</th>
              <th className="text-right px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Entregas</th>
              <th className="text-right px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Valor/entrega</th>
              <th className="text-right px-4 py-3 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-50">
              {relatorio.map((r:any) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-bold text-zinc-800">{r.nome}</td>
                  <td className="px-4 py-3 text-zinc-700 font-bold text-right">{r.total_entregas||0}</td>
                  <td className="px-4 py-3 text-zinc-500 text-right">{fmt(r.valor_por_entrega||0)}</td>
                  <td className="px-4 py-3 font-black text-emerald-700 text-right">{fmt(r.total_a_pagar||0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {relatorio.length===0&&<p className="text-center text-zinc-400 py-10 text-sm">Nenhum motoboy com entregas no período</p>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA RELATÓRIO — faturamento, produtos, horários
// ═══════════════════════════════════════════════════════════════════════════════
function TabRelatorio({ token }: { token: string }) {
  const [periodo, setPeriodo] = useState<string>('7d');
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const hdrs = { Authorization: `Bearer ${token}` };

  const fetchRelatorio = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery/relatorio?periodo=${periodo}`, { headers: hdrs });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [token, periodo]);

  useEffect(() => { fetchRelatorio(); }, [fetchRelatorio]);

  const periodos = [
    { key:'hoje', label:'Hoje' },
    { key:'7d',   label:'7 dias' },
    { key:'30d',  label:'30 dias' },
    { key:'mes',  label:'Este mês' },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>;

  const resumo = data?.resumo || {};
  const topProdutos: any[] = data?.topProdutos || [];
  const porDia: any[]      = data?.porDia       || [];
  const porHora: any[]     = data?.porHora      || [];
  const porPag: any[]      = data?.porPagamento || [];

  const maxFat  = Math.max(...porDia.map((d:any)=>d.faturamento||0), 1);
  const maxHora = Math.max(...porHora.map((h:any)=>h.pedidos||0), 1);

  return (
    <div className="space-y-5">
      {/* Filtro período */}
      <div className="flex gap-1.5">
        {periodos.map(p=>(
          <button key={p.key} onClick={()=>setPeriodo(p.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${periodo===p.key?'bg-zinc-900 text-white':'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DCard label="Pedidos"         value={String(resumo.total_pedidos||0)}                  color="blue"    icon={<Package size={16}/>}/>
        <DCard label="Faturamento"     value={fmt(resumo.faturamento_total||0)}                  color="emerald" icon={<DollarSign size={16}/>}/>
        <DCard label="Ticket médio"    value={fmt(resumo.ticket_medio||0)}                       color="purple"  icon={<TrendingUp size={16}/>}/>
        <DCard label="Clientes únicos" value={String(resumo.clientes_unicos||0)}                 color="amber"   icon={<Users size={16}/>}/>
        <DCard label="Entregues"       value={String(resumo.entregues||0)}                       color="zinc"    icon={<CheckCircle2 size={16}/>}/>
        <DCard label="Cancelados"      value={String(resumo.cancelados||0)}                      color="zinc"    icon={<XCircle size={16}/>}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Faturamento por dia */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-sm font-black text-zinc-900 mb-4">Faturamento por dia</h3>
          {porDia.length===0 ? <p className="text-zinc-400 text-sm text-center py-6">Sem dados</p> : (
            <div className="space-y-2">
              {porDia.map((d:any,i:number)=>(
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-20 shrink-0">
                    {new Date(d.dia+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                  </span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-6 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full flex items-center pl-2 transition-all"
                      style={{ width:`${Math.max((d.faturamento/maxFat)*100, 4)}%` }}>
                      <span className="text-[9px] font-bold text-white whitespace-nowrap">{fmt(d.faturamento)}</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-zinc-500 w-8 text-right shrink-0">{d.pedidos}p</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Horário de pico */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-sm font-black text-zinc-900 mb-4">Horário de pico</h3>
          {porHora.length===0 ? <p className="text-zinc-400 text-sm text-center py-6">Sem dados</p> : (
            <div className="flex items-end gap-1 h-40">
              {Array.from({length:24},(_,h)=>{
                const entry = porHora.find((x:any)=>x.hora===h);
                const count = entry?.pedidos||0;
                const height = count ? Math.max((count/maxHora)*100, 8) : 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${h}h: ${count} pedido${count!==1?'s':''}`}>
                    <div className="w-full rounded-sm transition-all"
                      style={{ height:`${height}%`, background:count>0?'#3b82f6':'#f4f4f5', minHeight:count?4:0 }}/>
                    {h%4===0&&<span className="text-[8px] text-zinc-400">{h}h</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top produtos */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-sm font-black text-zinc-900 mb-4">Produtos mais vendidos</h3>
          {topProdutos.length===0 ? <p className="text-zinc-400 text-sm text-center py-6">Sem dados</p> : (
            <div className="space-y-2">
              {topProdutos.slice(0,8).map((p:any,i:number)=>(
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-black flex items-center justify-center shrink-0">{i+1}</span>
                  <span className="flex-1 text-sm text-zinc-700 font-medium truncate">{p.name}</span>
                  <span className="text-xs font-bold text-zinc-500 shrink-0">{p.qtd}x</span>
                  <span className="text-xs font-black text-emerald-600 shrink-0">{fmt(p.receita)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formas de pagamento */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-sm font-black text-zinc-900 mb-4">Formas de pagamento</h3>
          {porPag.length===0 ? <p className="text-zinc-400 text-sm text-center py-6">Sem dados</p> : (
            <div className="space-y-3">
              {porPag.map((p:any,i:number)=>{
                const label: Record<string,string> = { pix:'Pix', dinheiro:'Dinheiro', cartao:'Cartão' };
                const colors = ['bg-blue-500','bg-emerald-500','bg-amber-500','bg-purple-500'];
                const totalGeral = porPag.reduce((a:number,x:any)=>a+(x.qtd||0),0)||1;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700">{label[p.pagamento_tipo]||p.pagamento_tipo}</span>
                      <span className="font-bold text-zinc-500">{p.qtd} · {fmt(p.total)}</span>
                    </div>
                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors[i%colors.length]}`}
                        style={{ width:`${(p.qtd/totalGeral)*100}%` }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA CONFIG — zonas, cupons, evolution API, opções gerais
// ═══════════════════════════════════════════════════════════════════════════════
function TabConfig({ token, slug }: { token: string; slug?: string }) {
  const [cfg, setCfg]         = useState<DeliveryConfig>({ ativo: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [activeSection, setActiveSection] = useState<'geral'|'zonas'|'cupons'|'evolution'>('geral');

  // Cupons
  const [cupons, setCupons]     = useState<Cupom[]>([]);
  const [novoCupom, setNovoCupom] = useState({ codigo:'', tipo:'percentual' as const, valor:'', min_pedido:'', limite_uso:'', validade:'' });
  const [addingCupom, setAddingCupom] = useState(false);

  // Zonas
  const [zonas, setZonas]         = useState<Array<{nome:string;taxa:number}>>([]);
  const [novaZona, setNovaZona]   = useState({ nome:'', taxa:'' });

  const hdrs = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, cuponsRes] = await Promise.all([
          fetch('/api/delivery/config',  { headers: hdrs }),
          fetch('/api/delivery/cupons',  { headers: hdrs }),
        ]);
        if (cfgRes.ok) {
          const d = await cfgRes.json();
          setCfg(d);
          setZonas(Array.isArray(d.zonas_entrega) ? d.zonas_entrega : []);
        }
        if (cuponsRes.ok) setCupons(await cuponsRes.json());
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...cfg, zonas_entrega: zonas };
      await fetch('/api/delivery/config', {
        method:'PUT', headers:{...hdrs,'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
      setSaved(true); setTimeout(()=>setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const addCupom = async () => {
    if (!novoCupom.codigo.trim()) return;
    setAddingCupom(true);
    try {
      const res = await fetch('/api/delivery/cupons', {
        method:'POST', headers:{...hdrs,'Content-Type':'application/json'},
        body: JSON.stringify({
          codigo:     novoCupom.codigo,
          tipo:       novoCupom.tipo,
          valor:      parseFloat(novoCupom.valor||'0'),
          min_pedido: parseFloat(novoCupom.min_pedido||'0'),
          limite_uso: novoCupom.limite_uso ? parseInt(novoCupom.limite_uso) : null,
          validade:   novoCupom.validade||null,
        }),
      });
      if (res.ok) {
        setNovoCupom({ codigo:'', tipo:'percentual', valor:'', min_pedido:'', limite_uso:'', validade:'' });
        const r = await fetch('/api/delivery/cupons', { headers: hdrs });
        if (r.ok) setCupons(await r.json());
      } else { const e = await res.json(); alert(e.error); }
    } catch {}
    setAddingCupom(false);
  };

  const toggleCupom = async (id: number, ativo: number) => {
    await fetch(`/api/delivery/cupons/${id}`, {
      method:'PATCH', headers:{...hdrs,'Content-Type':'application/json'},
      body: JSON.stringify({ ativo: ativo?0:1 }),
    });
    setCupons(prev => prev.map(c => c.id===id ? {...c,ativo:ativo?0:1} : c));
  };

  const deleteCupom = async (id: number) => {
    if (!confirm('Excluir cupom?')) return;
    await fetch(`/api/delivery/cupons/${id}`, { method:'DELETE', headers: hdrs });
    setCupons(prev => prev.filter(c => c.id!==id));
  };

  const addZona = () => {
    if (!novaZona.nome.trim()) return;
    setZonas(prev => [...prev, { nome: novaZona.nome.trim(), taxa: parseFloat(novaZona.taxa||'0') }]);
    setNovaZona({ nome:'', taxa:'' });
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>;

  const SectionBtn = ({ k, label, icon }: { k: typeof activeSection; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setActiveSection(k)}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeSection===k?'bg-zinc-900 text-white':'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Seções */}
      <div className="flex gap-2 flex-wrap">
        <SectionBtn k="geral"     label="Geral"       icon={<Settings size={14}/>}/>
        <SectionBtn k="zonas"     label="Zonas"       icon={<Map size={14}/>}/>
        <SectionBtn k="cupons"    label="Cupons"      icon={<Tag size={14}/>}/>
        <SectionBtn k="evolution" label="WhatsApp Auto" icon={<Zap size={14}/>}/>
      </div>

      {/* ── GERAL ─────────────────────────────────────────────────── */}
      {activeSection === 'geral' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
          <h3 className="text-base font-black text-zinc-900">Configurações gerais</h3>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <p className="font-bold text-blue-900">Modelo atual da entrega</p>
            <p className="text-xs text-blue-700 mt-1">
              Nesta fase o FlowPDV calcula o delivery por bairro com taxa fixa. A taxa padrão abaixo entra apenas quando nenhum bairro cadastrado casar com o endereço do cliente. Não há cálculo por km/raio ainda.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-zinc-800">Delivery ativo</p>
              <p className="text-xs text-zinc-400">Permite receber pedidos online</p>
            </div>
            <button onClick={() => setCfg(c=>({...c,ativo:!c.ativo}))}
              className={`w-12 h-6 rounded-full transition-all relative ${cfg.ativo?'bg-emerald-500':'bg-zinc-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${cfg.ativo?'left-6':'left-0.5'}`}/>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Taxa padrão (R$)" value={String(cfg.taxa_entrega||'')} onChange={v=>setCfg(c=>({...c,taxa_entrega:parseFloat(v)||0}))} type="number" placeholder="0"/>
            <Field label="Pedido mínimo (R$)"   value={String(cfg.pedido_minimo||'')} onChange={v=>setCfg(c=>({...c,pedido_minimo:parseFloat(v)||0}))} type="number" placeholder="0"/>
            <Field label="Tempo de preparo (min)" value={String(cfg.tempo_preparo||'')} onChange={v=>setCfg(c=>({...c,tempo_preparo:parseInt(v)||0}))} type="number" placeholder="40"/>
            <Field label="Desconto Pix (%)"     value={String(cfg.desconto_pix||'')} onChange={v=>setCfg(c=>({...c,desconto_pix:parseFloat(v)||0}))} type="number" placeholder="0"/>
            <Field label="Horário abertura"     value={cfg.horario_abertura||''} onChange={v=>setCfg(c=>({...c,horario_abertura:v}))} type="time"/>
            <Field label="Horário fechamento"   value={cfg.horario_fechamento||''} onChange={v=>setCfg(c=>({...c,horario_fechamento:v}))} type="time"/>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-zinc-800">Desconto automÃ¡tico de primeira compra</p>
                <p className="text-xs text-zinc-500">Calculado no backend e aplicado apenas na primeira compra válida do cliente, entrando corretamente no total final do pedido.</p>
              </div>
              <button
                onClick={() => setCfg(c=>({...c,desconto_primeiro_cliente_ativo:!c.desconto_primeiro_cliente_ativo}))}
                className={`w-12 h-6 rounded-full transition-all relative ${cfg.desconto_primeiro_cliente_ativo?'bg-emerald-500':'bg-zinc-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${cfg.desconto_primeiro_cliente_ativo?'left-6':'left-0.5'}`}/>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Tipo do desconto</label>
                <select
                  value={cfg.desconto_primeiro_cliente_tipo || 'percentual'}
                  disabled={!cfg.desconto_primeiro_cliente_ativo}
                  onChange={e=>setCfg(c=>({...c,desconto_primeiro_cliente_tipo:e.target.value as DeliveryConfig['desconto_primeiro_cliente_tipo']}))}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  <option value="percentual">% Percentual</option>
                  <option value="fixo">R$ Valor fixo</option>
                  <option value="frete_gratis">Frete grÃ¡tis</option>
                </select>
              </div>

              {cfg.desconto_primeiro_cliente_tipo !== 'frete_gratis' ? (
                <Field
                  label={cfg.desconto_primeiro_cliente_tipo === 'fixo' ? 'Valor do desconto (R$)' : 'Valor do desconto (%)'}
                  value={String(cfg.desconto_primeiro_cliente_valor||'')}
                  onChange={v=>setCfg(c=>({...c,desconto_primeiro_cliente_valor:parseFloat(v)||0}))}
                  type="number"
                  placeholder="0"
                />
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 flex items-center">
                  O frete da primeira compra serÃ¡ zerado quando houver taxa.
                </div>
              )}

              <Field
                label="Pedido mÃ­nimo para aplicar (R$)"
                value={String(cfg.desconto_primeiro_cliente_min_pedido||'')}
                onChange={v=>setCfg(c=>({...c,desconto_primeiro_cliente_min_pedido:parseFloat(v)||0}))}
                type="number"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">WhatsApp do restaurante</label>
            <input value={cfg.whatsapp||''} onChange={e=>setCfg(c=>({...c,whatsapp:e.target.value}))}
              placeholder="55119XXXXXXXX" className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Chave Pix"  value={cfg.pix_chave||''}  onChange={v=>setCfg(c=>({...c,pix_chave:v}))}  placeholder="email@ou.cpf"/>
            <Field label="Nome Pix"   value={cfg.pix_nome||''}   onChange={v=>setCfg(c=>({...c,pix_nome:v}))}   placeholder="Nome do recebedor"/>
            <Field label="Cidade Pix" value={cfg.pix_cidade||''} onChange={v=>setCfg(c=>({...c,pix_cidade:v}))} placeholder="Cidade"/>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
              Payload PIX estático (QR Code fixo)
            </label>
            <textarea
              value={cfg.pix_payload_estatico||''}
              onChange={e=>setCfg(c=>({...c,pix_payload_estatico:e.target.value}))}
              placeholder="00020126580014BR.GOV.BCB.PIX..."
              rows={3}
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono focus:outline-none focus:border-zinc-400 resize-none"
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              Cole aqui o payload completo do seu QR Code PIX. Quando preenchido, o cliente vê o QR Code gerado automaticamente com o valor do carrinho.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Valor por entrega (motoboy) R$</label>
            <input type="number" value={cfg.valor_por_entrega||''} onChange={e=>setCfg(c=>({...c,valor_por_entrega:parseFloat(e.target.value)||0}))}
              placeholder="0" className="w-40 px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
          </div>

          {slug && (
            <div className="bg-zinc-50 rounded-xl p-3">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Link do cardápio</p>
              <p className="text-xs text-zinc-600 font-mono">{window.location.origin}/delivery/{slug}</p>
            </div>
          )}
        </div>
      )}

      {/* ── ZONAS ─────────────────────────────────────────────────── */}
      {activeSection === 'zonas' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-black text-zinc-900">Bairros e taxas fixas</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Modelo atual: bairro cadastrado = taxa fixa. Se nenhum bairro casar, o sistema usa a taxa padrão de {fmt(Number(cfg.taxa_entrega || 0))}. Sem km/raio nesta fase.</p>
          </div>

          {/* Lista de zonas */}
          {zonas.length > 0 && (
            <div className="space-y-2">
              {zonas.map((z,i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
                  <span className="flex-1 font-medium text-zinc-800 text-sm">{z.nome}</span>
                  <span className="text-sm text-zinc-500">{fmt(z.taxa)}</span>
                  <button onClick={() => setZonas(prev=>prev.filter((_,j)=>j!==i))}
                    className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors">
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar zona */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Bairro atendido</label>
              <input value={novaZona.nome} onChange={e=>setNovaZona(v=>({...v,nome:e.target.value}))}
                placeholder="Ex: Centro, Vila X..."
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
            </div>
            <div className="w-28">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Taxa R$</label>
              <input type="number" value={novaZona.taxa} onChange={e=>setNovaZona(v=>({...v,taxa:e.target.value}))}
                placeholder="0"
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
            </div>
            <button onClick={addZona}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors flex-shrink-0">
              <Plus size={14}/> Adicionar
            </button>
          </div>
          {zonas.length===0&&<p className="text-xs text-zinc-400">Nenhum bairro com taxa fixa cadastrado ainda. A taxa padrão será usada em todas as entregas.</p>}
        </div>
      )}

      {/* ── CUPONS ─────────────────────────────────────────────────── */}
      {activeSection === 'cupons' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-black text-zinc-900">Cupons de desconto</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Clientes digitam o código no cardápio online para ganhar desconto.</p>
          </div>

          {/* Novo cupom */}
          <div className="bg-zinc-50 rounded-xl p-4 space-y-3 border border-zinc-100">
            <p className="text-xs font-black text-zinc-500 uppercase tracking-wider">Novo cupom</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Código</label>
                <input value={novoCupom.codigo} onChange={e=>setNovoCupom(v=>({...v,codigo:e.target.value.toUpperCase()}))}
                  placeholder="PROMO10" maxLength={20}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-mono focus:outline-none focus:border-zinc-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Tipo</label>
                <select value={novoCupom.tipo} onChange={e=>setNovoCupom(v=>({...v,tipo:e.target.value as any}))}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400">
                  <option value="percentual">% Percentual</option>
                  <option value="fixo">R$ Valor fixo</option>
                  <option value="frete_gratis">Frete grátis</option>
                </select>
              </div>
              {novoCupom.tipo !== 'frete_gratis' && (
                <Field label={novoCupom.tipo==='percentual'?'Desconto (%)':'Desconto (R$)'}
                  value={novoCupom.valor} onChange={v=>setNovoCupom(x=>({...x,valor:v}))} type="number" placeholder="0"/>
              )}
              <Field label="Mínimo do pedido R$" value={novoCupom.min_pedido} onChange={v=>setNovoCupom(x=>({...x,min_pedido:v}))} type="number" placeholder="0"/>
              <Field label="Limite de usos (vazio=∞)" value={novoCupom.limite_uso} onChange={v=>setNovoCupom(x=>({...x,limite_uso:v}))} type="number" placeholder="∞"/>
              <Field label="Validade" value={novoCupom.validade} onChange={v=>setNovoCupom(x=>({...x,validade:v}))} type="date"/>
            </div>
            <button onClick={addCupom} disabled={addingCupom||!novoCupom.codigo.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors disabled:opacity-50">
              <Plus size={14}/> {addingCupom?'Salvando...':'Criar cupom'}
            </button>
          </div>

          {/* Lista de cupons */}
          <div className="space-y-2">
            {cupons.length===0 && <p className="text-sm text-zinc-400 text-center py-4">Nenhum cupom criado</p>}
            {cupons.map(c=>(
              <div key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${c.ativo?'bg-white border-zinc-100':'bg-zinc-50 border-zinc-100 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-zinc-800 text-sm">{c.codigo}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${c.ativo?'bg-emerald-100 text-emerald-700':'bg-zinc-100 text-zinc-500'}`}>
                      {c.ativo?'Ativo':'Inativo'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {c.tipo==='percentual'?`${c.valor}% de desconto`:c.tipo==='fixo'?`R$ ${c.valor} de desconto`:'Frete grátis'}
                    {c.min_pedido>0&&` · Mín: ${fmt(c.min_pedido)}`}
                    {c.limite_uso&&` · ${c.uso_atual}/${c.limite_uso} usos`}
                    {c.validade&&` · Válido até ${new Date(c.validade+'T12:00:00').toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <button onClick={()=>toggleCupom(c.id,c.ativo)}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${c.ativo?'bg-amber-50 text-amber-600 hover:bg-amber-100':'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                  {c.ativo?'Pausar':'Ativar'}
                </button>
                <button onClick={()=>deleteCupom(c.id)} className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors">
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EVOLUTION API (WhatsApp automático) ─────────────────── */}
      {activeSection === 'evolution' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-black text-zinc-900 flex items-center gap-2"><Zap size={16}/>WhatsApp automático</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Quando um pedido chega, a mensagem é enviada automaticamente ao WhatsApp do restaurante via <strong>Evolution API</strong> (open source, gratuito).
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
            <p className="font-bold">Como configurar a Evolution API:</p>
            <p>1. Instale: <code className="bg-amber-100 px-1 rounded">docker run -d evolutionapi/evolution-api</code></p>
            <p>2. Acesse o painel e crie uma instância com seu número</p>
            <p>3. Cole a URL, token e nome da instância abaixo</p>
            <a href="https://doc.evolution-api.com" target="_blank" rel="noreferrer" className="underline font-bold flex items-center gap-1">
              <Globe size={11}/> Documentação Evolution API
            </a>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">URL da API</label>
              <input value={cfg.evolution_url||''} onChange={e=>setCfg(c=>({...c,evolution_url:e.target.value}))}
                placeholder="https://api.meuservidor.com"
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Token (apikey)</label>
              <input type="password" value={cfg.evolution_token||''} onChange={e=>setCfg(c=>({...c,evolution_token:e.target.value}))}
                placeholder="seu-token-aqui"
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Nome da instância</label>
              <input value={cfg.evolution_instance||''} onChange={e=>setCfg(c=>({...c,evolution_instance:e.target.value}))}
                placeholder="meu-restaurante"
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
            </div>
          </div>

          {cfg.evolution_url && cfg.evolution_token && cfg.evolution_instance && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
              <Check size={14} className="text-emerald-600"/>
              <p className="text-xs font-bold text-emerald-700">Evolution API configurada. Mensagens serão enviadas automaticamente.</p>
            </div>
          )}
        </div>
      )}

      {/* Botão salvar (exceto cupons que salvam individualmente) */}
      {activeSection !== 'cupons' && (
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold text-sm hover:bg-zinc-700 transition-all disabled:opacity-50 active:scale-95">
          {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Salvando...</>
            : saved ? <><Check size={16}/>Salvo!</> : 'Salvar configurações'}
        </button>
      )}
    </div>
  );
}

// ─── Utilitário de campo ─────────────────────────────────────────────────────
function Field({ label, value, onChange, type='text', placeholder='' }: {
  label: string; value: string; onChange: (v:string)=>void; type?:string; placeholder?:string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"/>
    </div>
  );
}
