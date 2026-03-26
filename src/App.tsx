/**
 * App.tsx - Roteador principal do FlowPDV.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, ShoppingCart, Package, LogOut, Archive,
  Settings, Monitor, UtensilsCrossed,
  DollarSign, Clock, History, BarChart2, FileText, Users, Lock, Bell, Bike,
  Menu, LayoutGrid, List, Volume2, VolumeX,
} from 'lucide-react';

import type { Product, Caixa, Order } from './types';
import NavItem from './components/ui/NavItem';
import PlanBadge from './components/ui/PlanBadge';
import { getSegCfg, getOperationalSegment } from './config/segmentos';
import { isKnownPlanFeature, type PlanFeature } from './config/planFeatures';
import { FLOWPDV_CENTRAL_CHANNEL_FILTER_KEY, mapOrderToCentralColumn } from './utils/orderCentralBoard';
import type { PlanProfileInfo } from './utils/planStatus';
import { playNewOrderSound } from './utils/sound';

// ── Telas compartilhadas (todos os segmentos) ─────────────────────
import LoginScreen           from './shared/LoginScreen';
import POSScreen             from './shared/POSScreen';
import OrdersScreen          from './shared/OrdersScreen';
import CentralPedidosScreen  from './shared/CentralPedidosScreen';
import DashboardScreen       from './shared/DashboardScreen';
import FinanceScreen         from './shared/FinanceScreen';
import EstoqueScreen         from './shared/EstoqueScreen';
import ProductsScreen        from './shared/ProductsScreen';
import AdminPanel            from './shared/AdminPanel';
import LicenseBlockedScreen  from './shared/LicenseBlockedScreen';
import ConfiguracoesScreen   from './shared/ConfiguracoesScreen';
import OpenCaixaModal        from './shared/modals/OpenCaixaModal';
import CloseCaixaModal       from './shared/modals/CloseCaixaModal';
import SolicitacaoModal      from './shared/modals/SolicitacaoModal';
import RHScreen           from './shared/RHScreen';
import SystemLogsScreen   from './shared/SystemLogsScreen';
import DeliveryScreen        from './shared/DeliveryScreen';
import DeliveryCardapio      from './segments/delivery/DeliveryCardapio';
import PedidoRastreamento    from './shared/PedidoRastreamento';

// ── Restaurante / Food Service ────────────────────────────────────
import KDSScreen             from './segments/restaurante/KDSScreen';
import ClienteDisplayScreen from './segments/restaurante/ClienteDisplayScreen';
import ClienteMesaScreen    from './segments/restaurante/ClienteMesaScreen';

// ── Bar / Pub ─────────────────────────────────────────────────────
import MesasScreen           from './segments/bar/MesasScreen';
import MesaPickerModal       from './segments/bar/MesaPickerModal';

import { Button }            from './components/ui/Card';
import { Input }             from './components/ui/Card';

// ── FlowAI ────────────────────────────────────────────────────────
import FlowAIPopup           from './shared/FlowAIPopup';
import NotificationCenter   from './shared/NotificationCenter';
import { useFlowAI }         from './hooks/useFlowAI';


export default function App() {
  const OPERATIONAL_ALERT_SOUND_KEY = 'flowpdv_operational_alert_sound';
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [estabelecimentoSegmento, setEstabelecimentoSegmento] = useState('Restaurante/Food');
  const [activeTab, setActiveTab] = useState<'pos' | 'dashboard' | 'products' | 'orders' | 'central' | 'finance' | 'estoque' | 'mesas' | 'funcionarios' | 'configuracoes' | 'logs' | 'delivery'>('pos')
  const [floatPos, setFloatPos]   = React.useState(() => {
    const saved = localStorage.getItem('orders_float_pos');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 80, y: window.innerHeight - 120 };
  });
  const floatDrag = React.useRef<{ dragging: boolean; ox: number; oy: number; hasDragged: boolean }>({ dragging: false, ox: 0, oy: 0, hasDragged: false });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<any>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [currentCaixa, setCurrentCaixa] = useState<Caixa | null>(null);
  const [showCaixaModal, setShowCaixaModal] = useState<'abrir' | 'fechar' | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showWatermarkSettings, setShowWatermarkSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === 'true');
  const [showQRModal, setShowQRModal] = useState(false);
  const [slugAtual, setSlugAtual] = useState<string>(() => {
    try {
      const t = localStorage.getItem('token');
      if (!t) return '';
      return (JSON.parse(atob(t.split('.')[1])) as any).username || '';
    } catch { return ''; }
  });

  // ── Permissões ────────────────────────────────────────────────────────────
  const [userCargo, setUserCargo]           = useState<string>(() => localStorage.getItem('user_cargo') || 'dono');
  const [userPermissoes, setUserPermissoes] = useState<string[] | null>(() => {
    try { const p = localStorage.getItem('user_permissoes'); return p ? JSON.parse(p) : null; } catch { return null; }
  });
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('user_nome') || '');
  const [estabelecimentoNome, setEstabelecimentoNome] = useState('FlowPDV');
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[] | null>(null);
  const [planProfile, setPlanProfile] = useState<PlanProfileInfo | null>(null);
  const [operationalAlertCount, setOperationalAlertCount] = useState(0);
  const [operationalNeedsAttention, setOperationalNeedsAttention] = useState(false);
  const [operationalSoundEnabled, setOperationalSoundEnabled] = useState(
    () => localStorage.getItem(OPERATIONAL_ALERT_SOUND_KEY) !== 'false'
  );
  const operationalAlertSnapshotRef = React.useRef('');
  const operationalAlertLoadedRef = React.useRef(false);
  const operationalSoundPlayedAtRef = React.useRef(0);

  const userAllows = (tab: string): boolean => !userPermissoes || userPermissoes.includes(tab);
  const normalizeAccessFeature = (tab: string): string => (tab === 'central' ? 'orders' : tab);
  const planAllows = (tab: string): boolean => {
    if (planFeatures === null) return true;
    const feature = normalizeAccessFeature(tab);
    if (!isKnownPlanFeature(feature)) return true;
    return planFeatures.includes(feature);
  };
  const canAccess = (tab: string): boolean => {
    const feature = normalizeAccessFeature(tab);
    return planAllows(feature) && userAllows(feature);
  };
  const aiEnabled = planFeatures !== null && canAccess('ai');
  const userRoleLabel =
    userCargo === 'dono' ? 'Proprietário' : userCargo === 'gerente' ? 'Gerente' : 'Atendente';
  const userDisplayName = userName || 'Sessão ativa';
  const userSecondaryLine = userRoleLabel || 'Painel operacional';
  const estabelecimentoMonogram = estabelecimentoNome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('') || 'FP';

  // ── FlowAI ────────────────────────────────────────────────────────────────
  const {
    avisoAtivo, avisos, avisosNaoLidos,
    historico, historicoTotal, carregandoHist,
    buscarAvisos, marcarLido, marcarTodosLidos,
    gerarAvisos, proximoAviso, buscarHistorico,
  } = useFlowAI(aiEnabled ? token : null);

  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Gera avisos ao logar e a cada 30 minutos — com fallback silencioso
  useEffect(() => {
    if (!token) return;
    const rodar = () =>
      gerarAvisos()
        .then(() => buscarAvisos())
        .catch(() => {
          // Falha silenciosa — ANTHROPIC_API_KEY ausente ou rede indisponível
          // não polui o console de produção
        });
    // Aguarda 3s após login para não competir com fetchProducts/fetchCaixa/fetchPerfil
    const init = setTimeout(rodar, 3000);
    const iv   = setInterval(rodar, 30 * 60 * 1000);
    return () => { clearTimeout(init); clearInterval(iv); };
  }, [token]);

  // Após login como cliente (admin): abre Estoque ou Pedidos para deeplink
  useEffect(() => {
    if (!token) return;
    try {
      const nav = localStorage.getItem('flowpdv_initial_nav_tab') || sessionStorage.getItem('flowpdv_initial_nav_tab');
      if (nav === 'estoque' && canAccess('estoque')) {
        localStorage.removeItem('flowpdv_initial_nav_tab');
        sessionStorage.removeItem('flowpdv_initial_nav_tab');
        setActiveTab('estoque');
      } else if (nav === 'orders' && canAccess('orders')) {
        localStorage.removeItem('flowpdv_initial_nav_tab');
        sessionStorage.removeItem('flowpdv_initial_nav_tab');
        setActiveTab('orders');
      }
    } catch {
      /* ignore */
    }
  }, [token, userPermissoes, planFeatures]);

  // ── Injeta/remove tema escuro no <html> ──────────────────────────────────
  useEffect(() => {
    const el = document.documentElement;
    if (darkMode) {
      el.classList.add('flowpdv-dark', 'dark');
      localStorage.setItem('dark_mode', 'true');
    } else {
      el.classList.remove('flowpdv-dark', 'dark');
      localStorage.setItem('dark_mode', 'false');
    }
  }, [darkMode]);

  // ── CSS do tema escuro (injetado uma vez) ────────────────────────────────
  useEffect(() => {
    const id = 'flowpdv-dark-css';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .flowpdv-dark {
        --bg-app:      #0f0f0f;
        --bg-panel:    #141414;
        --bg-card:     #1a1a1a;
        --bg-input:    #222222;
        --bg-hover:    #252525;
        --bg-active:   #2a2a2a;
        --border:      #2e2e2e;
        --border-soft: #242424;
        --text-primary:   #f0f0f0;
        --text-secondary: #a0a0a0;
        --text-muted:     #606060;
        --accent:      #ffffff;
      }

      /* Layout base */
      .flowpdv-dark body,
      .flowpdv-dark #root { background: var(--bg-app) !important; }

      /* Backgrounds */
      .flowpdv-dark .bg-white          { background-color: var(--bg-card)  !important; }
      .flowpdv-dark .bg-zinc-50        { background-color: var(--bg-panel) !important; }
      .flowpdv-dark .bg-zinc-100       { background-color: var(--bg-input) !important; }
      .flowpdv-dark .bg-zinc-200       { background-color: var(--bg-active)!important; }
      .flowpdv-dark .bg-zinc-800       { background-color: #181818        !important; }
      /* bg-zinc-900 handled per-element below */

      /* Texto */
      .flowpdv-dark .text-zinc-900     { color: var(--text-primary)   !important; }
      .flowpdv-dark .text-zinc-800     { color: var(--text-primary)   !important; }
      .flowpdv-dark .text-zinc-700     { color: #c8c8c8               !important; }
      .flowpdv-dark .text-zinc-600     { color: #a0a0a0               !important; }
      .flowpdv-dark .text-zinc-500     { color: var(--text-secondary) !important; }
      .flowpdv-dark .text-zinc-400     { color: #666666               !important; }
      .flowpdv-dark .text-zinc-300     { color: #505050               !important; }

      /* Botão primário (zinc-900 bg) — no dark mode fica cinza escuro com texto branco */
      .flowpdv-dark button.bg-zinc-900,
      .flowpdv-dark a.bg-zinc-900 { background-color: #2e2e2e !important; color: #ffffff !important; }
      .flowpdv-dark .hover\\:bg-zinc-800:hover { background-color: #3a3a3a !important; }

      /* Bordas */
      .flowpdv-dark .border-zinc-100   { border-color: var(--border-soft) !important; }
      .flowpdv-dark .border-zinc-200   { border-color: var(--border)      !important; }
      .flowpdv-dark .border-zinc-300   { border-color: #3a3a3a            !important; }
      .flowpdv-dark .divide-zinc-100 > * + * { border-color: var(--border-soft) !important; }
      .flowpdv-dark .divide-zinc-200 > * + * { border-color: var(--border)      !important; }

      /* Hover states */
      .flowpdv-dark .hover\\:bg-zinc-50:hover  { background-color: var(--bg-hover)  !important; }
      .flowpdv-dark .hover\\:bg-zinc-100:hover { background-color: var(--bg-active) !important; }
      .flowpdv-dark .hover\\:bg-zinc-200:hover { background-color: #303030          !important; }

      /* Inputs */
      .flowpdv-dark input:not([type=range]),
      .flowpdv-dark textarea,
      .flowpdv-dark select {
        background-color: var(--bg-input) !important;
        border-color:     var(--border)   !important;
        color:            var(--text-primary) !important;
      }
      .flowpdv-dark input::placeholder,
      .flowpdv-dark textarea::placeholder { color: #555 !important; }

      /* Cards / panels */
      .flowpdv-dark .shadow-sm  { box-shadow: 0 1px 3px rgba(0,0,0,.5) !important; }
      .flowpdv-dark .shadow-lg  { box-shadow: 0 8px 32px rgba(0,0,0,.6) !important; }
      .flowpdv-dark .shadow-xl  { box-shadow: 0 16px 48px rgba(0,0,0,.7) !important; }
      .flowpdv-dark .shadow-2xl { box-shadow: 0 24px 64px rgba(0,0,0,.8) !important; }

      /* Sidebar link active */
      .flowpdv-dark .bg-zinc-900:not(.mesa-card-shell) span,
      .flowpdv-dark .bg-zinc-900:not(.mesa-card-shell) svg { color: #111 !important; }

      /* Amber / yellow tones (keep warm) */
      .flowpdv-dark .bg-amber-50  { background-color: #1e1800 !important; }
      .flowpdv-dark .border-amber-200 { border-color: #3d2f00 !important; }
      .flowpdv-dark .text-amber-600   { color: #f59e0b !important; }
      .flowpdv-dark .text-amber-800   { color: #fbbf24 !important; }
      .flowpdv-dark .text-amber-900   { color: #fcd34d !important; }
      .flowpdv-dark .bg-amber-400     { background-color: #d97706 !important; }

      /* Green tones */
      .flowpdv-dark .bg-green-50  { background-color: #001a08 !important; }
      .flowpdv-dark .bg-green-100 { background-color: #002610 !important; }
      .flowpdv-dark .text-green-700 { color: #34d399 !important; }
      .flowpdv-dark .text-green-600 { color: #10b981 !important; }
      .flowpdv-dark .bg-green-600   { background-color: #059669 !important; }
      .flowpdv-dark .hover\\:bg-green-700:hover { background-color: #047857 !important; }

      /* Red tones */
      .flowpdv-dark .bg-red-50  { background-color: #1a0000 !important; }
      .flowpdv-dark .text-red-500 { color: #f87171 !important; }
      .flowpdv-dark .text-red-600 { color: #ef4444 !important; }
      .flowpdv-dark .hover\\:bg-red-50:hover { background-color: #1a0000 !important; }
      .flowpdv-dark .hover\\:text-red-600:hover { color: #f87171 !important; }

      /* Blue tones */
      .flowpdv-dark .bg-blue-50  { background-color: #00081a !important; }
      .flowpdv-dark .text-blue-700 { color: #60a5fa !important; }

      /* Purple / fidelidade */
      .flowpdv-dark .bg-purple-100 { background-color: #150024 !important; }
      .flowpdv-dark .text-purple-700 { color: #c084fc !important; }

      /* Gradients — sidebar dark stripe */
      .flowpdv-dark .from-zinc-900, .flowpdv-dark .to-zinc-900 { --tw-gradient-from: #0d0d0d; --tw-gradient-to: #0d0d0d; }
      .flowpdv-dark .from-zinc-800  { --tw-gradient-from: #141414; }

      /* Modals backdrop already dark — keep */
      /* Ring */
      .flowpdv-dark .ring-zinc-900 { --tw-ring-color: rgba(240,240,240,.3) !important; }

      /* Scrollbar */
      .flowpdv-dark ::-webkit-scrollbar { width: 6px; height: 6px; }
      .flowpdv-dark ::-webkit-scrollbar-track { background: #111; }
      .flowpdv-dark ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      .flowpdv-dark ::-webkit-scrollbar-thumb:hover { background: #555; }

      /* dark: usa Tailwind nativo; não sobrescrever bg-zinc-900 de cards/containers */
    `;
    document.head.appendChild(style);
  }, []);
  const [showSolicitacao, setShowSolicitacao] = useState(false);
  const [licenseError, setLicenseError] = useState<'bloqueado' | 'trial_expirado' | null>(null);
  const [taxasPagamento, setTaxasPagamento] = useState({ debito: 0, credito: 0, pix: 0 });
  const [senhaPadrao, setSenhaPadrao]       = useState(false);
  const path = window.location.pathname;
  const isAdmin = path.startsWith('/admin');
  const bookingMatch = path.match(/^\/agendar\/(.+)$/);
  const bookingSlug  = bookingMatch ? bookingMatch[1] : null;
  const kdsMatch     = path.match(/^\/kds\/(.+)$/);
  const kdsSlug      = kdsMatch ? kdsMatch[1] : null;
  const pontoMatch   = path.match(/^\/kiosk\/ponto\/(.+)$/) || path.match(/^\/public\/ponto\/(.+)$/);
  const isPonto      = !!pontoMatch;
  const displayMatch = path.match(/^\/display\/([^/]+)$/);
  const mesaMatch    = path.match(/^\/mesa\/([^/]+)\/([^/]+)$/);
  // Verifica pathname E query param (fallback para quando o servidor redireciona em dev)
  const _deliverySlugQS = new URLSearchParams(window.location.search).get('delivery_slug');
  const deliveryMatch  = path.match(/^\/delivery\/([^/]+)$/) || (_deliverySlugQS ? [null, _deliverySlugQS] : null);
  // Rastreamento público: /delivery/:slug/pedido/:id
  const trackingMatch  = path.match(/^\/delivery\/([^/]+)\/pedido\/(\d+)$/);

  // ── Títulos por rota ──────────────────────────────────────────────────────────
  if (isAdmin)          document.title = 'Admin — FlowPDV';
  else if (kdsSlug)     document.title = 'Tela de Pedidos — FlowPDV';
  else if (bookingSlug) document.title = 'Agendamento Online — FlowPDV';
  else if (isPonto)     document.title = 'Sistema de Ponto — FlowPDV';
  else if (displayMatch)  document.title = 'Painel do Salão — FlowPDV';
  else if (mesaMatch)     document.title = 'Sua Mesa — FlowPDV';
  else if (trackingMatch) document.title = 'Acompanhar Pedido Online — FlowPDV';
  else if (deliveryMatch) document.title = 'Peça Online — FlowPDV';
  else                    document.title = 'FlowPDV';

  const segmentoOperacional = getOperationalSegment(estabelecimentoSegmento);
  const segCfg = getSegCfg(segmentoOperacional);
  const permiteMesas = segmentoOperacional === 'Restaurante/Food' || segmentoOperacional === 'Bar/Pub';
  const permiteDelivery = permiteMesas;
  const isOperationTab = activeTab === 'orders' || activeTab === 'central';

  // ── Título dinâmico + alerta operacional incremental ─────────────────────
React.useEffect(() => {
    if (!token || isAdmin) return;

    const fetchOperationalAlerts = async () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const from = `${yyyy}-${mm}-${dd} 00:00:00`;
      const to = `${yyyy}-${mm}-${dd} 23:59:59`;

      try {
        const qs = new URLSearchParams({ from, to, limit: '250' });
        const res = await fetch(`/api/orders?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const orders = Array.isArray(data) ? data : [];
        const actionableOrders = orders.filter((order: Order) => {
          const column = mapOrderToCentralColumn(order, { segmentFinalStatus: segCfg.statusConcluido });
          return column === 'a_confirmar' || column === 'entrada';
        });
        const actionableIds = actionableOrders
          .map((order: Order) => Number(order.id))
          .filter((id) => Number.isFinite(id))
          .sort((a, b) => a - b);
        const previousIds = new Set(
          operationalAlertSnapshotRef.current
            .split(',')
            .map((value) => Number(value))
            .filter((id) => Number.isFinite(id))
        );
        const hasNewOperationalItem =
          operationalAlertLoadedRef.current && actionableIds.some((id) => !previousIds.has(id));

        operationalAlertSnapshotRef.current = actionableIds.join(',');
        operationalAlertLoadedRef.current = true;
        setOperationalAlertCount(actionableOrders.length);

        if (isOperationTab) {
          setOperationalNeedsAttention(false);
          document.title = 'FlowPDV';
          return;
        }

        if (hasNewOperationalItem) {
          setOperationalNeedsAttention(true);
          const currentTime = Date.now();
          if (operationalSoundEnabled && currentTime - operationalSoundPlayedAtRef.current > 3000) {
            operationalSoundPlayedAtRef.current = currentTime;
            playNewOrderSound();
          }
        }

        document.title = actionableOrders.length > 0
          ? `Operação (${actionableOrders.length}) — FlowPDV`
          : 'FlowPDV';
      } catch {}
    };

    fetchOperationalAlerts();
    const id = setInterval(fetchOperationalAlerts, 30000);
    return () => clearInterval(id);
  }, [token, isAdmin, isOperationTab, operationalSoundEnabled, segCfg.statusConcluido]);

  useEffect(() => {
    if (isOperationTab) {
      setOperationalNeedsAttention(false);
    }
  }, [isOperationTab]);

  useEffect(() => {
    localStorage.setItem(OPERATIONAL_ALERT_SOUND_KEY, String(operationalSoundEnabled));
  }, [operationalSoundEnabled]);
  
  // ── Rotas públicas — Tela Cliente ────────────────────────────────────────────
  // /delivery/:slug/pedido/:id → rastreamento do pedido pelo cliente
  if (trackingMatch) return <PedidoRastreamento slug={trackingMatch[1]} pedidoId={Number(trackingMatch[2])} />;
  // /delivery/:slug → PÚBLICO — deve vir ANTES de qualquer check de token
  if (deliveryMatch) return <DeliveryCardapio />;
  if (displayMatch) return <ClienteDisplayScreen slug={displayMatch[1]} />;
  // /mesa/:slug/:numero  →  Display individual da mesa (celular do cliente)
  if (mesaMatch)    return <ClienteMesaScreen slug={mesaMatch[1]} mesa={mesaMatch[2]} />;

  // ── Site público de agendamento ──────────────────────────────────────────────
  if (bookingSlug) return <SegmentDisabledNotice />;
  if (kdsSlug)     return <KDSScreen slug={kdsSlug} />;

  const fetchCaixa = async () => {
    try {
      const res = await fetch('/api/caixa/hoje', {
        headers: { Authorization: "Bearer " + localStorage.getItem('token') }
      });
      const data = await res.json();
      setCurrentCaixa(data);
    } catch (err) {
      console.error("Erro ao carregar caixa", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchProducts();
      fetchCaixa();
      fetchLogo();
      fetchPerfil();
    }
  }, [token]);

const fetchPerfil = async () => {
    try {
      const res = await fetch('/api/settings/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.nome_estabelecimento) setEstabelecimentoNome(data.nome_estabelecimento);
        if (data.segmento) setEstabelecimentoSegmento(getOperationalSegment(data.segmento));
        setPlanFeatures(Array.isArray(data.plan_features) ? data.plan_features : null);
        setPlanProfile({
          plano: data.plano || 'completo',
          trial_ativo: !!data.trial_ativo,
          trial_fim: data.trial_fim || null,
          vencimento: data.vencimento || null,
        });
        setTaxasPagamento({
          debito:  data.taxa_debito  || 0,
          credito: data.taxa_credito || 0,
          pix:     data.taxa_pix     || 0,
        });

        // Não armazenamos senhas no localStorage — verificação sempre server-side
        setSenhaPadrao(!!data.senha_padrao);

        const cargo = data.cargo || 'dono';
        const perms = data.permissoes || null;
        const nome  = data.nome_usuario || '';
        setUserCargo(cargo);
        setUserPermissoes(perms);
        setUserName(nome);
        localStorage.setItem('user_cargo', cargo);
        localStorage.setItem('user_permissoes', perms ? JSON.stringify(perms) : '');
        localStorage.setItem('user_nome', nome);
      }
    } catch (err) { }
  };

  const fetchLogo = async () => {
    try {
      const res = await fetch('/api/settings/logo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.logo_url) setLogoUrl(data.logo_url);
    } catch (err) {
      console.error("Erro ao carregar logo", err);
    }
  };

const fetchProducts = async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch('/api/products', {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      const data = await res.json();
      
      // TRAVA DE SEGURANÇA: Só aceita se for uma lista (array)
      if (Array.isArray(data)) {
        setProducts(data);
      } else {
        setProducts([]); // Evita tela branca
      }
    } catch (err) {
      console.error("Erro ao carregar produtos", err);
      setProducts([]); 
    }
  };

  const handleTabChange = (tab: any) => {
    if (!canAccess(tab)) {
      return;
    }
    if (tab === 'abrir-caixa' || tab === 'fechar-caixa') {
      setPendingTab(tab);
      setShowAuthModal(true);
      setAuthPassword('');
      return;
    }
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  useEffect(() => {
    if (!token) return;
    if (canAccess(activeTab)) return;

    const fallbackTabs = ['pos', 'orders', 'dashboard', 'products', 'configuracoes'];
    const fallback = fallbackTabs.find((tab) => canAccess(tab));
    if (fallback) {
      setActiveTab(fallback as typeof activeTab);
    }
  }, [token, activeTab, userPermissoes, planFeatures]);

const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingTab === 'abrir-caixa' || pendingTab === 'fechar-caixa') {
      try {
        const res = await fetch('/api/auth/verify-caixa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ senha: authPassword }),
        });
        if (res.ok) {
          setShowCaixaModal(pendingTab === 'abrir-caixa' ? 'abrir' : 'fechar');
          setShowAuthModal(false);
          setAuthPassword('');
          setPendingTab(null);
        } else {
          alert('Senha do caixa incorreta!');
        }
      } catch {
        alert('Erro de conexão ao verificar senha.');
      }
    }
  };

  // ── Registra log de atividade ─────────────────────────────────────────────
  const postLog = (acao: string, detalhes?: string) => {
    if (!token) return;
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_nome: userName || 'Usuário', cargo: userCargo, acao, detalhes }),
    }).catch(() => {});
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_cargo');
    localStorage.removeItem('user_permissoes');
    localStorage.removeItem('user_nome');
    setUserCargo('dono');
    setUserPermissoes(null);
    setUserName('');
    setPlanFeatures(null);
    setPlanProfile(null);
    setToken(null);
  };

  const isProtectedApiUrl = (url: string) =>
    url.includes('/api/')
    && !url.includes('/api/login')
    && !url.includes('/api/admin');

  const isSessionInvalidResponse = async (response: Response) => {
    if (response.status === 401) return true;
    if (response.status !== 403) return false;

    try {
      const cloned = response.clone();
      const contentType = cloned.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await cloned.json()
        : { error: await cloned.text() };
      const message = String(payload?.error || payload?.message || '').trim().toLowerCase();

      return (
        message.includes('token inválido')
        || message.includes('token invalido')
        || message.includes('token expirado')
        || message.includes('sessão inválida')
        || message.includes('sessao invalida')
        || message.includes('sessão expirada')
        || message.includes('sessao expirada')
      );
    } catch {
      return false;
    }
  };

  // ── Interceptor global: sessão inválida → logout automático ───────────────
  // O backend pode responder 401 ou 403 para token inválido/expirado.
  // Fazemos logout apenas quando a resposta indica de fato sessão inválida,
  // sem derrubar o usuário em 403 de regra de negócio (ex.: bloqueio/trial).
  useEffect(() => {
    // Guard contra registro duplo (React StrictMode monta/desmonta duas vezes em dev)
    const INTERCEPTED = Symbol.for('flowpdv_fetch_intercepted');
    if ((window.fetch as any)[INTERCEPTED]) return;

    const originalFetch = window.fetch;
    const intercepted = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

      if (isProtectedApiUrl(url) && await isSessionInvalidResponse(response)) {
        console.warn('[Auth] Sessão inválida detectada — fazendo logout automático.');
        handleLogout();
      }
      return response;
    };
    (intercepted as any)[INTERCEPTED] = true;
    window.fetch = intercepted;
    return () => { window.fetch = originalFetch; };
  }, []); // sem deps — usa handleLogout via closure estável

  if (isAdmin) return <AdminPanel />;
  if (licenseError) return <LicenseBlockedScreen type={licenseError} onBack={() => { setLicenseError(null); handleLogout(); }} />;

  if (!token) {
    return (
      <>
        <LoginScreen 
          onLogin={(t) => {
              setToken(t);
              localStorage.setItem('token', t);
              try { setSlugAtual((JSON.parse(atob(t.split('.')[1])) as any).username || ''); } catch {}
            }} 
          onShowSolicitacao={() => setShowSolicitacao(true)}
          onLicenseError={(type) => setLicenseError(type)}
        />
        <SolicitacaoModal isOpen={showSolicitacao} onClose={() => setShowSolicitacao(false)} />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden flex-col lg:flex-row">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 max-w-[85vw] bg-white border-r border-zinc-200 flex flex-col h-screen shrink-0
          transition-transform duration-200 ease-out
          ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="border-b border-zinc-100 bg-zinc-50 p-5">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
            <label className="cursor-pointer group relative" title="Clique para trocar a logo">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('logo', file);
                  const res = await fetch('/api/settings/logo', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                  });
                  const data = await res.json();
                  if (data.success) setLogoUrl(data.logo_url + '?t=' + Date.now()); // cache bust
                }}
              />
              {logoUrl ? (
                <div className="h-14 w-14 overflow-hidden rounded-2xl ring-2 ring-transparent transition-all group-hover:ring-zinc-400">
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-black uppercase tracking-[0.18em] text-white transition-colors group-hover:bg-zinc-700">
                  {estabelecimentoMonogram}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </label>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Seu painel</p>
              <h1 className="mt-1 truncate text-lg font-black leading-tight text-zinc-900">{estabelecimentoNome}</h1>
              <p className="mt-2 truncate text-sm font-semibold text-zinc-700">{userDisplayName}</p>
              <p className="mt-1 text-xs text-zinc-500">{userSecondaryLine}</p>
            </div>
          </div>
            <div className="mt-4">
              <PlanBadge profile={planProfile} compact />
            </div>
          </div>
        </div>

        {/* Status do Caixa */}
        <div className="px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${currentCaixa?.status === 'aberto' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs font-bold text-zinc-900">
                {currentCaixa?.status === 'aberto' ? 'Caixa Aberto' : 'Caixa Fechado'}
              </span>
            </div>
          </div>
          {currentCaixa?.status === 'aberto' ? (
            <div className="space-y-1 mb-3">
              <p className="text-[10px] text-zinc-400 uppercase font-bold">Início: {new Date(currentCaixa.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-[10px] text-zinc-400 uppercase font-bold">Fundo: R$ {currentCaixa.fundo_inicial.toFixed(2)}</p>
            </div>
          ) : null}
          
          {currentCaixa?.status === 'aberto' ? (
            <Button 
              variant="secondary" 
              className="w-full py-1.5 text-[10px] uppercase tracking-wider"
              onClick={() => {
                setPendingTab('fechar-caixa');
                setShowAuthModal(true);
              }}
            >
              Fechar Caixa
            </Button>
          ) : (
            <Button 
              variant="primary" 
              className="w-full py-1.5 text-[10px] uppercase tracking-wider"
              onClick={() => {
                setPendingTab('abrir-caixa');
                setShowAuthModal(true);
              }}
              disabled={currentCaixa?.status === 'fechado'}
            >
              {currentCaixa?.status === 'fechado' ? 'Caixa Encerrado' : 'Abrir Caixa'}
            </Button>
          )}
        </div>

     <nav className="flex-1 p-4 space-y-2 overflow-y-auto min-h-0">
          {(() => { return (<> 
            {canAccess('pos')    && <NavItem active={activeTab === 'pos'}    onClick={() => handleTabChange('pos')}    icon={<ShoppingCart size={20} />} label={segCfg.labelSidebarPOS} />}
            {canAccess('orders') && (
              <>
                <NavItem
                  active={activeTab === 'central'}
                  attention={operationalNeedsAttention}
                  badgeCount={operationalAlertCount > 0 ? operationalAlertCount : undefined}
                  onClick={() => handleTabChange('central')}
                  icon={<LayoutGrid size={20} />}
                  label="Operação"
                />
                <NavItem
                  active={activeTab === 'orders'}
                  onClick={() => handleTabChange('orders')}
                  icon={<List size={20} />}
                  label="Consulta de pedidos"
                />
              </>
            )}
            {canAccess('delivery') && permiteDelivery && (
              <NavItem active={activeTab === 'delivery'} onClick={() => handleTabChange('delivery')} icon={<Bike size={20} />} label="Delivery" />
            )}
            {permiteMesas && canAccess('mesas') && (
              <NavItem active={activeTab === 'mesas'} onClick={() => handleTabChange('mesas')} icon={<UtensilsCrossed size={20} />} label="Mesas" />
            )}
            {canAccess('products') && <NavItem active={activeTab === 'products'} onClick={() => handleTabChange('products')} icon={<Package size={20} />} label={segCfg.labelSidebarProdutos} />}
            {canAccess('estoque')  && <NavItem active={activeTab === 'estoque'}  onClick={() => handleTabChange('estoque')}  icon={<Archive size={20} />}  label="Estoque" />}
          </>); })()}
          {canAccess('nfse') && (
            <a href="https://www.nfse.gov.br/EmissorNacional" target="_blank" rel="noopener noreferrer"
              onClick={() => setMobileNavOpen(false)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 min-h-[44px]">
              <FileText size={20} />
              <span className="font-medium">NFS-e</span>
            </a>
          )}
          {canAccess('dashboard')    && <NavItem active={activeTab === 'dashboard'}    onClick={() => handleTabChange('dashboard')}    icon={<LayoutDashboard size={20} />} label="Dashboard" />}
          {canAccess('finance')      && <NavItem active={activeTab === 'finance'}      onClick={() => handleTabChange('finance')}      icon={<DollarSign size={20} />}      label="Financeiro" />}
          {canAccess('funcionarios') && <NavItem active={activeTab === 'funcionarios'} onClick={() => handleTabChange('funcionarios')} icon={<Users size={20} />}           label="RH" />}
          {canAccess('logs')         && <NavItem active={activeTab === 'logs'}         onClick={() => handleTabChange('logs')}         icon={<History size={20} />}         label="Logs" />}
          {canAccess('configuracoes')&& <NavItem active={activeTab === 'configuracoes'} onClick={() => handleTabChange('configuracoes')}  icon={<Settings size={20} />}        label="Configurações" />}
        </nav>

        <div className="border-t border-zinc-100 p-4 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Utilitários</p>
            <p className="text-[10px] text-zinc-400">Tema, alertas e sessão</p>
          </div>
          <div className={`grid gap-2 ${canAccess('ai') ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {canAccess('ai') && (
              <button
                onClick={() => setNotifCenterOpen(true)}
                title="Central de Notificações"
                className="relative flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Bell size={16} />
                <span>Alertas</span>
                {avisosNaoLidos > 0 && (
                  <span className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white">
                    {avisosNaoLidos > 9 ? '9+' : avisosNaoLidos}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setOperationalSoundEnabled((value) => !value)}
              title={operationalSoundEnabled ? 'Desativar som da Operação' : 'Ativar som da Operação'}
              className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-semibold transition-all ${
                operationalSoundEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {operationalSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span>{operationalSoundEnabled ? 'Som Operação' : 'Som mudo'}</span>
            </button>
            <button
              onClick={() => setDarkMode(v => !v)}
              title={darkMode ? 'Modo claro' : 'Modo escuro'}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              {darkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
              <span>{darkMode ? 'Tema claro' : 'Tema escuro'}</span>
            </button>
            <button
              onClick={handleLogout}
              title="Sair do sistema"
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden lg:min-h-0">
        <header className="lg:hidden flex items-center gap-3 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] border-b border-zinc-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="p-2.5 rounded-xl border border-zinc-200 text-zinc-800 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 active:bg-zinc-100"
            aria-label="Abrir menu"
          >
            <Menu size={22} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-900 truncate leading-tight">{estabelecimentoNome}</p>
            <p className="text-[11px] text-zinc-500 truncate">{`${userDisplayName} · ${userSecondaryLine}`}</p>
          </div>
        </header>

      {/* Botão flutuante — atalho para Operação (visão ao vivo) */}
      {canAccess('orders') && (
        <div
          title="Operação — visão ao vivo (atalho)"
          style={{ position: 'fixed', left: floatPos.x, top: floatPos.y, zIndex: 999, cursor: floatDrag.current.dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          onMouseDown={(e) => {
            floatDrag.current = { dragging: true, ox: e.clientX - floatPos.x, oy: e.clientY - floatPos.y, hasDragged: false };
            const onMove = (ev: MouseEvent) => {
              if (!floatDrag.current.dragging) return;
              const nx = Math.max(0, Math.min(window.innerWidth - 56, ev.clientX - floatDrag.current.ox));
              const ny = Math.max(0, Math.min(window.innerHeight - 56, ev.clientY - floatDrag.current.oy));
              floatDrag.current.hasDragged = true;
              setFloatPos({ x: nx, y: ny });
            };
            const onUp = () => {
              floatDrag.current.dragging = false;
              localStorage.setItem('orders_float_pos', JSON.stringify(floatPos));
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          onClick={() => {
            // hasDragged garante que um drag longo não abre a tela ao soltar
            if (!floatDrag.current.hasDragged) handleTabChange('central');
            floatDrag.current.hasDragged = false;
          }}
        >
          <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xl transition-all hover:scale-110 active:scale-95 ${
            activeTab === 'orders' || activeTab === 'central'
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : operationalNeedsAttention
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-zinc-200 bg-white text-zinc-700'
          }`}>
            {operationalAlertCount > 0 && (
              <span className={`absolute -right-1 -top-1 min-w-[20px] rounded-full px-1 py-0.5 text-center text-[10px] font-black leading-none ${
                operationalNeedsAttention ? 'bg-amber-500 text-white animate-pulse' : 'bg-zinc-900 text-white'
              }`}>
                {operationalAlertCount > 99 ? '99+' : operationalAlertCount}
              </span>
            )}
            <LayoutGrid size={22} strokeWidth={2.2} />
          </div>
        </div>
      )}



      {/* Área de Conteúdo Principal */}
      <main className="flex-1 overflow-auto relative flex flex-col" style={{ zIndex: 2 }}>

        {/* ── Banner senha padrão ───────────────────────────────────── */}
        {senhaPadrao && userCargo === 'dono' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
            <span className="text-amber-600 shrink-0">⚠️</span>
            <p className="text-xs text-amber-800 font-medium flex-1">
              <strong>Senha padrão detectada.</strong> Acesse <strong>Configurações → Alterar senhas</strong> para proteger o sistema.
            </p>
            <button
              onClick={() => handleTabChange('configuracoes')}
              className="text-[11px] font-black text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-2 rounded-lg transition-all shrink-0 self-start sm:self-auto min-h-[40px]"
            >
              Alterar agora →
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'pos' && canAccess('pos') && <POSScreen token={token} products={products} estabelecimentoSegmento={segmentoOperacional} taxasPagamento={taxasPagamento} />}
          {activeTab === 'orders' && canAccess('orders') && <OrdersScreen token={token} segmento={segmentoOperacional} displaySlug={slugAtual} onShowQR={() => setShowQRModal(true)} />}
          {activeTab === 'central' && canAccess('orders') && <CentralPedidosScreen token={token} segmento={segmentoOperacional} />}
          {activeTab === 'dashboard' && canAccess('dashboard') && <DashboardScreen token={token} segmento={segmentoOperacional} onGoToPOS={() => handleTabChange('pos')} />}
          {activeTab === 'products' && canAccess('products') && <ProductsScreen products={products} onUpdate={fetchProducts} token={token} />}
          {activeTab === 'estoque' && canAccess('estoque') && <EstoqueScreen token={token} segmento={segmentoOperacional} />}
          {activeTab === 'delivery' && canAccess('delivery') && permiteDelivery && (
            <DeliveryScreen
              token={token}
              slug={slugAtual}
              onOpenCentralBalcao={() => {
                sessionStorage.setItem(FLOWPDV_CENTRAL_CHANNEL_FILTER_KEY, 'balcao');
                handleTabChange('central');
                setMobileNavOpen(false);
              }}
            />
          )}
          {activeTab === 'mesas' && canAccess('mesas') && permiteMesas && <MesasScreen token={token} taxasPagamento={taxasPagamento} />}
          {activeTab === 'finance' && canAccess('finance') && <FinanceScreen token={token} segmento={segmentoOperacional} />}
          {activeTab === 'funcionarios' && canAccess('funcionarios') && <RHScreen token={token} />}
          {activeTab === 'logs' && canAccess('logs') && <SystemLogsScreen token={token} />}
          {activeTab === 'configuracoes' && canAccess('configuracoes') && <ConfiguracoesScreen token={token} darkMode={darkMode} setDarkMode={setDarkMode} />}
        </AnimatePresence>

        {/* Modal de Autenticação para Áreas Restritas */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl max-h-[min(90dvh,560px)] overflow-y-auto my-auto"
              >
                <div className="w-16 h-16 bg-zinc-100 text-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Lock size={32} />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 text-center">Área Restrita</h3>
                <p className="text-zinc-500 text-center mt-2 mb-8">Digite a senha de acesso para continuar.</p>
                
                <form onSubmit={handleAuth} className="space-y-4">
                  <Input 
                    label="Senha de Acesso" 
                    type="password" 
                    value={authPassword} 
                    onChange={(e: any) => setAuthPassword(e.target.value)}
                    placeholder="••••••"
                    autoFocus
                    required
                  />
                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" className="flex-1" onClick={() => { setShowAuthModal(false); setAuthPassword(''); }}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1">
                      Acessar
                    </Button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modais de Caixa */}
        <AnimatePresence>
          {showCaixaModal === 'abrir' && (
            <OpenCaixaModal 
              onClose={() => setShowCaixaModal(null)} 
              onSuccess={() => {
                setShowCaixaModal(null);
                fetchCaixa();
                postLog('CAIXA_ABERTO', `${userName || 'Usuário'} abriu o caixa`);
              }}
              token={token}
            />
          )}
          {showCaixaModal === 'fechar' && (
            <CloseCaixaModal 
              onClose={() => setShowCaixaModal(null)} 
              onSuccess={() => {
                setShowCaixaModal(null);
                fetchCaixa();
                postLog('CAIXA_FECHADO', `${userName || 'Usuário'} fechou o caixa`);
              }}
              token={token}
            />
          )}
        </AnimatePresence>
      </main>

      {/* ── Modal QR das Mesas ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showQRModal && (
          <QRMesasModal slug={slugAtual} token={token} onClose={() => setShowQRModal(false)} />
        )}
      </AnimatePresence>

      {/* ── FlowAI Popup proativo ─────────────────────────────────────────── */}
      <AnimatePresence>
        {canAccess('ai') && avisoAtivo && (
          <FlowAIPopup
            aviso={avisoAtivo}
            onDismiss={(id) => { marcarLido(id); proximoAviso(); }}
            onAcao={(rota) => {
              const tab = rota.replace('/', '') as any;
              handleTabChange(tab);
              if (avisoAtivo) { marcarLido(avisoAtivo.id); proximoAviso(); }
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Central de Notificações ───────────────────────────────────────── */}
      {canAccess('ai') && (
        <NotificationCenter
          open={notifCenterOpen}
          onClose={() => setNotifCenterOpen(false)}
          historico={historico}
          carregandoHist={carregandoHist}
          avisosNaoLidos={avisosNaoLidos}
          onMarcarLido={marcarLido}
          onMarcarTodosLidos={marcarTodosLidos}
          onAcao={(rota) => {
            const tab = rota.replace('/', '') as any;
            handleTabChange(tab);
            setNotifCenterOpen(false);
          }}
          onRefresh={() => buscarHistorico(100, 0)}
        />
      )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTES DE UI ---

// Constante global para contato comercial
const WA_NUMBER = '5500000000000';
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=Olá!%20Tenho%20interesse%20no%20FlowPDV`;

function SegmentDisabledNotice() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-zinc-200 rounded-3xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-zinc-100 flex items-center justify-center text-3xl">
          🍽️
        </div>
        <h1 className="text-2xl font-black text-zinc-900">Agendamento indisponivel</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Esta pagina publica de agendamento nao esta disponivel nesta versao do FlowPDV.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center mt-6 px-5 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors"
        >
          Voltar ao inicio
        </a>
      </div>
    </div>
  );
}

function QRMesasModal({ slug, token, onClose }: { slug: string; token: string | null; onClose: () => void }) {
  const [mesas, setMesas] = React.useState<{ numero: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const baseUrl = window.location.origin;

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mesas', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setMesas((data as any[]).map((m: any) => ({ numero: m.numero })));
        }
      } catch { /* sem mesas */ }
      setLoading(false);
    })();
  }, [token]);

  const mesaUrl = (num: number) => `${baseUrl}/mesa/${slug}/${num}`;
  const qrSrc   = (url: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=8`;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-100">
          <div>
            <h2 className="text-xl font-black text-zinc-900">🪑 QR Codes das Mesas</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Imprima e cole em cada mesa. O cliente escaneia e acompanha o pedido.</p>
          </div>
          <div className="flex items-center gap-3">
            <a href={`/display/${slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors">
              <Monitor size={15} /> Tela Cliente
            </a>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
              🖨️ Imprimir
            </button>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors font-bold">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400">
              <div className="text-center"><div className="text-4xl mb-3">⏳</div><p className="text-sm">Carregando mesas...</p></div>
            </div>
          ) : mesas.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="text-5xl mb-3">🪑</div>
                <p className="font-semibold text-zinc-600">Nenhuma mesa configurada</p>
                <p className="text-sm text-zinc-400 mt-1">Configure as mesas em <strong>Mesas → Configurar</strong> primeiro.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {mesas.map(({ numero }) => {
                const url = mesaUrl(numero);
                return (
                  <div key={numero} className="border-2 border-zinc-200 rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-zinc-400 transition-colors">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Mesa</div>
                    <div className="text-4xl font-black text-zinc-900 leading-none">{numero}</div>
                    <img src={qrSrc(url)} alt={`QR Mesa ${numero}`} className="w-[150px] h-[150px] rounded-xl mt-1" loading="lazy" />
                    <p className="text-[9px] text-zinc-400 text-center break-all leading-tight">{url}</p>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline font-semibold">Testar link →</a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-8 py-4 border-t border-zinc-100 rounded-b-3xl bg-zinc-50">
          <p className="text-[11px] text-zinc-400">
            📺 <strong>Tela Cliente:</strong> {baseUrl}/display/{slug} &nbsp;·&nbsp; 📱 <strong>Mesa (ex):</strong> {baseUrl}/mesa/{slug}/1
          </p>
        </div>
      </motion.div>
    </div>
  );
}
