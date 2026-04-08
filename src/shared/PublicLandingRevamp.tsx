import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import {
  type LucideIcon,
  ArrowRight,
  BadgeCheck,
  Beer,
  Bike,
  Boxes,
  ChefHat,
  Coffee,
  CreditCard,
  Link2,
  QrCode,
  Receipt,
  Sandwich,
  ShieldCheck,
  Store,
  TabletSmartphone,
  Truck,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import {
  PUBLIC_SEGMENT_NOTE,
  PUBLIC_SEGMENT_OPTIONS,
  type PublicSegmentValue,
} from '../config/publicSegments';

interface Segment {
  value: PublicSegmentValue;
  icon: LucideIcon;
  label: string;
  description: string;
}

type FeatureTone = 'emerald' | 'sky' | 'amber' | 'violet';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  wide?: boolean;
}

interface Differential {
  title: string;
  description: string;
}

interface Alert {
  title: string;
  description: string;
}

interface HeroMetric {
  label: string;
  value: string;
  detail: string;
}

interface DashboardSignal {
  label: string;
  value: string;
  detail: string;
}

interface FeaturePreviewMeta {
  eyebrow: string;
  bullets: string[];
  tone: FeatureTone;
}

const FEATURE_TONE_STYLES: Record<
  FeatureTone,
  { color: string; background: string; border: string }
> = {
  emerald: {
    color: '#86efac',
    background: 'rgba(16,185,129,0.12)',
    border: '1px solid rgba(52,211,153,0.18)',
  },
  sky: {
    color: '#7dd3fc',
    background: 'rgba(37,99,235,0.12)',
    border: '1px solid rgba(96,165,250,0.18)',
  },
  amber: {
    color: '#fde68a',
    background: 'rgba(245,158,11,0.12)',
    border: '1px solid rgba(245,158,11,0.18)',
  },
  violet: {
    color: '#ddd6fe',
    background: 'rgba(124,58,237,0.12)',
    border: '1px solid rgba(167,139,250,0.18)',
  },
};

const SEGMENT_ICON_BY_VALUE: Record<PublicSegmentValue, LucideIcon> = {
  Restaurante: UtensilsCrossed,
  'Fast Food': Sandwich,
  Bar: Beer,
  Adega: Wine,
  'Padaria/Café': Coffee,
  'Buffet/Self-service': ChefHat,
  'Food Truck': Truck,
};

const SEGMENTS: Segment[] = PUBLIC_SEGMENT_OPTIONS.map((segment) => ({
  value: segment.value,
  icon: SEGMENT_ICON_BY_VALUE[segment.value],
  label: segment.label,
  description: segment.description,
}));

const HERO_POINTS = [
  'Balcão, mesas, retirada e delivery no mesmo fluxo',
  'Cardápio online com link e QR Code conectado à operação',
  'Caixa, estoque e relatórios no dia a dia do food service',
];

const HERO_BADGES: Array<{ icon: LucideIcon; text: string }> = [
  { icon: BadgeCheck, text: '7 dias de teste' },
  { icon: CreditCard, text: 'Sem cartão' },
  { icon: QrCode, text: 'Link e QR Code' },
  { icon: TabletSmartphone, text: 'Desktop, tablet e celular' },
];

const HERO_METRICS: HeroMetric[] = [
  { label: 'Vendas hoje', value: 'R$ 3.840', detail: '+12% vs ontem' },
  { label: 'Pedidos em preparo', value: '14', detail: 'salão, retirada e delivery' },
  { label: 'Ticket médio', value: 'R$ 48,20', detail: 'mês atual' },
  { label: 'Caixa', value: 'Aberto', detail: 'desde 08:00' },
];

const FEATURES: Feature[] = [
  {
    icon: Receipt,
    title: 'PDV para balcao, mesa e retirada',
    description: 'Venda rapida com carrinho, desconto, multiplos pagamentos e rotina de caixa no mesmo fluxo.',
    wide: true,
  },
  {
    icon: Link2,
    title: 'Cardapio online para delivery e retirada',
    description: 'Link e QR Code para o cliente pedir online com entrada direta na operacao.',
  },
  {
    icon: ChefHat,
    title: 'Central de pedidos e cozinha',
    description: 'Pedidos por etapa, visao do rush e acompanhamento da producao em tempo real.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Mesas e comandas abertas',
    description: 'Visao pratica do salao com consumo por mesa, comandas ativas e fechamento mais rapido.',
  },
  {
    icon: Boxes,
    title: 'Estoque e insumos',
    description: 'Baixas, minimos e movimentacoes alinhados ao cardapio e a cozinha.',
  },
  {
    icon: Bike,
    title: 'Central de pedidos e delivery',
    description: 'Pedidos por canal, status, retirada e entrega no mesmo painel para acompanhar o rush sem perder contexto.',
    wide: true,
  },
];

const DIFFERENTIALS: Differential[] = [
  {
    title: 'Feito para operação de comida',
    description: 'A linguagem e os fluxos seguem a rotina de restaurante, hamburgueria, lanchonete, bar, adega, padaria/café, buffet por comanda e food truck.',
  },
  {
    title: 'Menos retrabalho entre frente e produção',
    description: 'O pedido do balcão, da mesa ou do cardápio online segue até cozinha e caixa no mesmo fluxo.',
  },
  {
    title: 'Mais leitura de operação no dia a dia',
    description: 'Painel, estoque, caixa e relatórios ajudam a agir rápido sem depender de controles soltos.',
  },
  {
    title: 'Implantação acompanhada no contexto brasileiro',
    description: 'Teste inicial, suporte em português e acompanhamento aderente à operação local.',
  },
];

const ALERTS: Alert[] = [
  { title: 'Estoque', description: 'Pão brioche próximo do mínimo para o pico da noite.' },
  { title: 'Vendas', description: 'Combo house puxando ticket médio nas últimas 48 horas.' },
  { title: 'Operação', description: 'Faixa entre 19h e 21h concentrando mais pedidos em preparo.' },
  { title: 'Delivery', description: 'Retirada ganhando volume e pedindo mais destaque no cardápio online.' },
];

const FEATURE_PREVIEW_META: FeaturePreviewMeta[] = [
  {
    eyebrow: 'Frente de caixa',
    bullets: ['mesa, balcao e retirada', 'PIX, dinheiro e cartao', 'caixa aberto e fechamento'],
    tone: 'emerald',
  },
  {
    eyebrow: 'Canal digital',
    bullets: ['link proprio', 'pedido cai no painel', 'retirada e delivery'],
    tone: 'amber',
  },
  {
    eyebrow: 'Producao',
    bullets: ['KDS por etapa', 'tickets no rush', 'fila de preparo'],
    tone: 'violet',
  },
  {
    eyebrow: 'Salao',
    bullets: ['ocupacao do salao', 'consumo por mesa', 'comanda integrada ao caixa'],
    tone: 'sky',
  },
  {
    eyebrow: 'Backoffice',
    bullets: ['minimos e reposicao', 'baixa de insumos', 'giro mais visivel'],
    tone: 'amber',
  },
  {
    eyebrow: 'Operacao conectada',
    bullets: ['painel por etapa', 'retirada e motoboy', 'visao do rush em tempo real'],
    tone: 'sky',
  },
];

const DASHBOARD_SIGNALS: DashboardSignal[] = [
  { label: 'Faturamento', value: 'R$ 3.840', detail: 'hoje ate 21:10' },
  { label: 'Pedidos', value: '67', detail: '14 ainda ativos' },
  { label: 'Ticket medio', value: 'R$ 48,20', detail: '+8% na semana' },
  { label: 'Caixa', value: 'Aberto', detail: 'sangria as 16:42' },
];

const DASHBOARD_CHANNELS = [
  { label: 'Balcao', value: 'R$ 1.220', width: '78%' },
  { label: 'Mesas', value: 'R$ 920', width: '63%' },
  { label: 'Retirada', value: 'R$ 640', width: '47%' },
  { label: 'Delivery', value: 'R$ 1.060', width: '69%' },
];

const TOP_ITEMS = [
  { label: 'Combo house', value: '18 vendas' },
  { label: 'Prato executivo', value: '14 vendas' },
  { label: 'Pizza calabresa', value: '11 vendas' },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

  .lp-root * { box-sizing: border-box; }
  .lp-root {
    font-family: 'DM Sans', system-ui, sans-serif;
    color: #f8fafc;
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
    background:
      radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 32%),
      radial-gradient(circle at 85% 10%, rgba(16, 185, 129, 0.14), transparent 28%),
      linear-gradient(180deg, #05070b 0%, #09111a 48%, #05070b 100%);
  }
  .lp-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
    opacity: 0.4;
    pointer-events: none;
    z-index: 0;
  }
  .lp-font-display { font-family: 'Syne', system-ui, sans-serif; }
  .lp-gradient-text {
    background: linear-gradient(135deg, #34d399 0%, #38bdf8 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  @keyframes lp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.82)} }
  .lp-live-dot { animation: lp-pulse 2s infinite; }
  .lp-section { padding: 96px 5%; position: relative; z-index: 1; }
  .lp-inner { max-width: 1180px; margin: 0 auto; }
  .lp-nav {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 5%;
    background: rgba(5, 10, 15, 0.72);
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    backdrop-filter: blur(18px);
  }
  .lp-nav-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .lp-nav-actions { display: flex; align-items: center; gap: 12px; }
  .lp-nav-link {
    background: transparent;
    border: none;
    color: #cbd5e1;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
  }
  .lp-surface {
    background:
      radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 28%),
      linear-gradient(180deg, rgba(10, 18, 30, 0.88) 0%, rgba(7, 13, 24, 0.92) 100%);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 26px;
    box-shadow: 0 24px 60px rgba(2, 6, 23, 0.42);
    backdrop-filter: blur(18px);
  }
  .lp-surface-soft {
    background: rgba(15, 23, 42, 0.58);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 18px;
    backdrop-filter: blur(14px);
  }
  .lp-chip,
  .lp-chip-muted {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 500;
  }
  .lp-chip {
    border: 1px solid rgba(96, 165, 250, 0.22);
    background: rgba(8, 15, 28, 0.6);
    color: #dbeafe;
  }
  .lp-chip-muted {
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(15, 23, 42, 0.48);
    color: #cbd5e1;
  }
  .lp-button-primary,
  .lp-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 24px;
    border-radius: 14px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background-color .18s ease;
    font-family: 'DM Sans', system-ui, sans-serif;
  }
  .lp-button-primary {
    color: #fff;
    border: none;
    background: linear-gradient(135deg, #2563eb 0%, #059669 100%);
    box-shadow: 0 18px 40px rgba(37, 99, 235, 0.28);
  }
  .lp-button-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 22px 44px rgba(37, 99, 235, 0.34);
  }
  .lp-button-secondary {
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(8, 15, 28, 0.52);
  }
  .lp-button-secondary:hover,
  .lp-nav-link:hover {
    color: #fff;
    border-color: rgba(96, 165, 250, 0.24);
  }
  .lp-overline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #86efac;
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .lp-overline::before {
    content: '';
    width: 20px;
    height: 1px;
    background: rgba(52, 211, 153, 0.88);
  }
  .lp-hero-grid { display: grid; grid-template-columns: minmax(0, 1.08fr) 440px; gap: 56px; align-items: center; }
  .lp-hero-panel { padding: 28px; position: relative; overflow: hidden; }
  .lp-hero-panel::after {
    content: '';
    position: absolute;
    inset: auto -60px -120px auto;
    width: 240px;
    height: 240px;
    background: radial-gradient(circle, rgba(52, 211, 153, 0.16) 0%, transparent 72%);
    pointer-events: none;
  }
  .lp-hero-actions,
  .lp-meta-row { display: flex; flex-wrap: wrap; gap: 12px; }
  .lp-point-list {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lp-point-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: #dbe4f0;
    font-size: 0.92rem;
    line-height: 1.6;
  }
  .lp-kpi-grid,
  .lp-proof-grid,
  .lp-feature-grid,
  .lp-segment-grid,
  .lp-diff-grid,
  .lp-alert-grid {
    display: grid;
    gap: 18px;
  }
  .lp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 24px 0; }
  .lp-kpi-card {
    padding: 16px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-stack { display: grid; gap: 12px; }
  .lp-stack-card {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 15px 16px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.62);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-proof-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-feature-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-feature-wide { grid-column: span 2; }
  .lp-segment-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .lp-diff-grid { grid-template-columns: minmax(0, 1fr) 420px; align-items: center; }
  .lp-alert-grid { margin-top: 20px; }
  .lp-hero-panel-rich { padding: 0; overflow: visible; background: transparent; border: none; box-shadow: none; }
  .lp-system-stage { position: relative; min-height: 620px; display: flex; align-items: center; justify-content: center; }
  .lp-window-shell {
    width: 100%;
    position: relative;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(8,15,28,0.94) 0%, rgba(5,10,18,0.98) 100%);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 28px;
    box-shadow: 0 26px 70px rgba(2, 6, 23, 0.46);
  }
  .lp-window-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    background: linear-gradient(180deg, rgba(15,23,42,0.8) 0%, rgba(8,15,28,0.64) 100%);
  }
  .lp-window-dots { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .lp-window-dots span {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.4);
  }
  .lp-window-meta { min-width: 0; flex: 1; }
  .lp-window-title { font-size: 0.9rem; font-weight: 600; color: #f8fafc; }
  .lp-window-subtitle { margin-top: 2px; font-size: 0.76rem; color: #64748b; }
  .lp-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 600;
    border: 1px solid rgba(52, 211, 153, 0.18);
    background: rgba(16, 185, 129, 0.1);
    color: #a7f3d0;
  }
  .lp-window-body { padding: 18px; display: grid; gap: 14px; }
  .lp-hero-cockpit { display: grid; grid-template-columns: minmax(0, 1.38fr) 200px; gap: 14px; }
  .lp-preview-panel,
  .lp-mini-card,
  .lp-feature-visual,
  .lp-alert-card-rich {
    padding: 14px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.68);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-mini-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .lp-preview-kpi-label,
  .lp-preview-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #64748b;
  }
  .lp-preview-kpi-value {
    margin-top: 8px;
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 1.14rem;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .lp-preview-kpi-detail { margin-top: 4px; font-size: 0.76rem; color: #86efac; }
  .lp-order-board,
  .lp-preview-board,
  .lp-kds-grid { display: grid; gap: 10px; }
  .lp-order-board,
  .lp-preview-board { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-kds-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-order-column,
  .lp-preview-column {
    padding: 12px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.56);
    border: 1px solid rgba(148, 163, 184, 0.1);
  }
  .lp-order-column-head,
  .lp-preview-topline,
  .lp-stock-item-row,
  .lp-channel-row,
  .lp-top-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .lp-order-column-head { margin-bottom: 10px; font-size: 0.78rem; color: #cbd5e1; font-weight: 600; }
  .lp-order-count {
    min-width: 28px;
    height: 28px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    color: #dbeafe;
    background: rgba(37, 99, 235, 0.16);
    border: 1px solid rgba(96, 165, 250, 0.18);
  }
  .lp-order-stack,
  .lp-feature-bullets,
  .lp-side-list,
  .lp-stock-list,
  .lp-dashboard-alerts { display: grid; gap: 10px; }
  .lp-order-ticket,
  .lp-preview-ticket,
  .lp-table-card-rich {
    padding: 10px;
    border-radius: 14px;
    background: rgba(8, 15, 28, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.1);
  }
  .lp-order-ticket strong,
  .lp-preview-ticket strong,
  .lp-table-card-rich strong,
  .lp-alert-card-rich strong { display: block; font-size: 0.8rem; color: #f8fafc; font-weight: 600; }
  .lp-order-ticket span,
  .lp-preview-ticket span,
  .lp-table-card-rich span,
  .lp-alert-card-rich span { display: block; margin-top: 4px; font-size: 0.73rem; color: #94a3b8; line-height: 1.45; }
  .lp-side-list div strong,
  .lp-stock-item-row strong,
  .lp-channel-row strong,
  .lp-top-item-row strong { font-size: 0.82rem; color: #f8fafc; font-weight: 600; }
  .lp-side-list div span,
  .lp-stock-item-row span,
  .lp-channel-row span,
  .lp-top-item-row span { font-size: 0.74rem; color: #94a3b8; }
  .lp-floating-card { position: absolute; z-index: 3; }
  .lp-floating-phone { left: -20px; bottom: 12px; width: 214px; }
  .lp-floating-kds { right: -12px; top: 48px; width: 236px; }
  .lp-phone-shell,
  .lp-kds-shell {
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 20px 52px rgba(2, 6, 23, 0.44);
  }
  .lp-phone-shell {
    padding: 12px;
    border-radius: 32px;
    background: linear-gradient(180deg, rgba(8,15,28,0.96) 0%, rgba(15,23,42,0.94) 100%);
  }
  .lp-phone-notch {
    width: 92px;
    height: 18px;
    margin: 0 auto 12px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.14);
  }
  .lp-phone-screen {
    padding: 14px;
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(8,15,28,0.94) 100%);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-phone-banner {
    padding: 12px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(37,99,235,0.16) 100%);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-phone-banner strong { display: block; font-size: 0.88rem; color: #fef3c7; }
  .lp-phone-banner span { display: block; margin-top: 4px; font-size: 0.72rem; color: #cbd5e1; }
  .lp-preview-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .lp-preview-chip,
  .lp-feature-pill,
  .lp-table-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    font-size: 0.72rem;
    color: #cbd5e1;
    background: rgba(15, 23, 42, 0.62);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-kds-shell {
    padding: 14px;
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(11,17,32,0.98) 0%, rgba(15,23,42,0.95) 100%);
  }
  .lp-kds-ticket {
    padding: 12px;
    border-radius: 16px;
    background: rgba(8, 15, 28, 0.76);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-kds-ticket-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 0.76rem; font-weight: 600; color: #f8fafc; }
  .lp-kds-ticket-time { color: #fde68a; font-size: 0.7rem; }
  .lp-kds-ticket ul { margin: 0; padding-left: 16px; display: grid; gap: 4px; color: #94a3b8; font-size: 0.72rem; line-height: 1.45; }
  .lp-feature-card { padding: 0 !important; overflow: hidden; }
  .lp-feature-visual { border-radius: 0; border: none; border-bottom: 1px solid rgba(148, 163, 184, 0.1); background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 30%), linear-gradient(180deg, rgba(8,15,28,0.86) 0%, rgba(8,15,28,0.72) 100%); }
  .lp-feature-body { padding: 22px; }
  .lp-feature-title-row { display: flex; align-items: flex-start; gap: 14px; margin-top: 18px; }
  .lp-feature-title-row h3 { margin: 6px 0 10px; font-family: 'Syne', system-ui, sans-serif; font-size: 1.08rem; line-height: 1.12; letter-spacing: -0.04em; }
  .lp-feature-desc { margin: 0; color: #94a3b8; font-size: 0.88rem; line-height: 1.65; }
  .lp-tone-icon { width: 48px; height: 48px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .lp-pos-layout { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(190px, 0.92fr); gap: 12px; }
  .lp-pos-products { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
  .lp-cart-line,
  .lp-cart-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.78rem;
    color: #cbd5e1;
  }
  .lp-cart-total { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.1); color: #f8fafc; font-weight: 600; }
  .lp-table-grid-rich { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
  .lp-stock-progress { width: 84px; height: 6px; border-radius: 999px; overflow: hidden; background: rgba(51, 65, 85, 0.72); }
  .lp-stock-progress span,
  .lp-channel-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #34d399 0%, #38bdf8 100%); }
  .lp-channel-bar { flex: 1; height: 8px; border-radius: 999px; overflow: hidden; background: rgba(51, 65, 85, 0.72); }
  .lp-dashboard-grid-rich { display: grid; gap: 14px; }
  .lp-dashboard-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .lp-dashboard-split { display: grid; grid-template-columns: minmax(0, 1.04fr) minmax(220px, 0.96fr); gap: 14px; }
  .lp-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 28px 5%;
    position: relative;
    z-index: 1;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }
  @media (max-width: 1100px) {
    .lp-hero-grid,
    .lp-diff-grid { grid-template-columns: 1fr; }
    .lp-hero-panel {
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
    }
    .lp-system-stage {
      min-height: auto;
      max-width: 760px;
      margin: 0 auto;
      padding: 0 10px 18px;
    }
    .lp-segment-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 900px) {
    .lp-proof-grid,
    .lp-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-feature-wide { grid-column: span 2; }
    .lp-segment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-hero-cockpit,
    .lp-pos-layout,
    .lp-dashboard-split { grid-template-columns: 1fr; }
    .lp-dashboard-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-section { padding: 78px 5%; }
  }
  @media (max-width: 720px) {
    .lp-nav {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .lp-nav-actions {
      width: 100%;
      justify-content: space-between;
    }
    .lp-nav-brand { flex-wrap: wrap; }
    .lp-floating-card {
      position: static;
      width: 100%;
    }
    .lp-system-stage {
      display: grid;
      gap: 16px;
    }
    .lp-order-board,
    .lp-preview-board,
    .lp-kds-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .lp-section { padding: 60px 5%; }
    .lp-hero-actions {
      flex-direction: column;
      align-items: stretch;
    }
    .lp-button-primary,
    .lp-button-secondary { width: 100%; }
    .lp-kpi-grid,
    .lp-proof-grid,
    .lp-feature-grid,
    .lp-segment-grid,
    .lp-dashboard-metrics,
    .lp-table-grid-rich,
    .lp-mini-card-grid { grid-template-columns: 1fr; }
    .lp-feature-wide { grid-column: span 1; }
    .lp-meta-row {
      flex-direction: column;
      align-items: flex-start;
    }
    .lp-footer {
      flex-direction: column;
      align-items: flex-start;
    }
  }
`;

function HeroSystemPreview() {
  return (
    <div className="lp-system-stage">
      <div className="lp-window-shell">
        <div className="lp-window-bar">
          <div className="lp-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="lp-window-meta">
            <div className="lp-window-title">FlowPDV / Operacao de hoje</div>
            <div className="lp-window-subtitle">dashboard, pedidos, mesas, delivery e caixa</div>
          </div>
          <span className="lp-status-pill">
            <span
              className="lp-live-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                display: 'inline-block',
                background: '#34d399',
              }}
            />
            Ao vivo
          </span>
        </div>

        <div className="lp-window-body">
          <div className="lp-hero-cockpit">
            <div className="lp-dashboard-grid-rich">
              <div className="lp-mini-card-grid">
                {HERO_METRICS.map((metric) => (
                  <div key={metric.label} className="lp-mini-card">
                    <div className="lp-preview-kpi-label">{metric.label}</div>
                    <div className="lp-preview-kpi-value">{metric.value}</div>
                    <div className="lp-preview-kpi-detail">{metric.detail}</div>
                  </div>
                ))}
              </div>

              <div className="lp-preview-panel">
                <div className="lp-preview-label">Fluxo operacional</div>
                <div className="lp-order-board" style={{ marginTop: 12 }}>
                  {[
                    {
                      title: 'Entrada',
                      count: '08',
                      items: [
                        { code: '#1842', title: 'Mesa 08', detail: '2 pratos executivos' },
                        { code: '#1843', title: 'Retirada', detail: '1 combo smash house' },
                      ],
                    },
                    {
                      title: 'Producao',
                      count: '04',
                      items: [
                        { code: '#1839', title: 'Balcao', detail: '3 burgers + 2 fritas' },
                        { code: '#1840', title: 'Delivery', detail: 'pizza grande + refri 2L' },
                      ],
                    },
                    {
                      title: 'Saida',
                      count: '02',
                      items: [
                        { code: '#1834', title: 'Motoboy', detail: 'saiu ha 6 min' },
                        { code: '#1836', title: 'Mesa 03', detail: 'pronto para servir' },
                      ],
                    },
                  ].map((column) => (
                    <div key={column.title} className="lp-order-column">
                      <div className="lp-order-column-head">
                        <span>{column.title}</span>
                        <span className="lp-order-count">{column.count}</span>
                      </div>
                      <div className="lp-order-stack">
                        {column.items.map((item) => (
                          <div key={item.code} className="lp-order-ticket">
                            <strong>{item.code}</strong>
                            <span>{item.title}</span>
                            <span>{item.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lp-dashboard-grid-rich">
              <div className="lp-preview-panel">
                <div className="lp-preview-label">Canais ativos</div>
                <div className="lp-side-list" style={{ marginTop: 12 }}>
                  {[
                    { label: 'Balcao', value: '23 atendimentos' },
                    { label: 'Mesas', value: '11 comandas abertas' },
                    { label: 'Retirada', value: '6 pedidos agendados' },
                    { label: 'Delivery', value: '5 em rota agora' },
                  ].map((item) => (
                    <div key={item.label} className="lp-channel-row">
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lp-preview-panel">
                <div className="lp-preview-label">Estoque critico</div>
                <div className="lp-stock-list">
                  {[
                    { label: 'Pao brioche', value: 'baixo', width: '28%' },
                    { label: 'Blend 120g', value: 'ok', width: '74%' },
                    { label: 'Batata palito', value: 'atencao', width: '42%' },
                  ].map((item) => (
                    <div key={item.label} className="lp-stock-item-row">
                      <div style={{ display: 'grid', gap: 6, flex: 1 }}>
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                      <div className="lp-stock-progress">
                        <span style={{ width: item.width }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-floating-card lp-floating-phone">
        <div className="lp-phone-shell">
          <div className="lp-phone-notch" />
          <div className="lp-phone-screen">
            <div className="lp-preview-topline" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: '0.86rem', color: '#f8fafc' }}>Cardapio online</strong>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>retirada + delivery</span>
            </div>
            <div className="lp-phone-banner">
              <strong>Combo smash + frita</strong>
              <span>mais pedido nas ultimas 48h</span>
            </div>
            <div className="lp-preview-chip-row" style={{ margin: '12px 0' }}>
              {['Burgers', 'Pizzas', 'Bebidas'].map((item) => (
                <span key={item} className="lp-preview-chip">
                  {item}
                </span>
              ))}
            </div>
            <div className="lp-order-ticket">
              <strong>Smash house</strong>
              <span>pao brioche, blend 120g, cheddar e molho da casa</span>
            </div>
            <button
              style={{
                width: '100%',
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 14,
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb 0%, #059669 100%)',
                color: '#fff',
                fontSize: '0.76rem',
                fontWeight: 700,
                fontFamily: 'DM Sans, system-ui, sans-serif',
              }}
            >
              Adicionar ao pedido
            </button>
          </div>
        </div>
      </div>

      <div className="lp-floating-card lp-floating-kds">
        <div className="lp-kds-shell">
          <div className="lp-preview-topline" style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: '0.86rem', color: '#f8fafc' }}>Cozinha / KDS</strong>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>fila em preparo</span>
          </div>
          <div className="lp-kds-grid">
            <div className="lp-kds-ticket">
              <div className="lp-kds-ticket-head">
                <span>#1840 Delivery</span>
                <span className="lp-kds-ticket-time">09 min</span>
              </div>
              <ul>
                <li>1 pizza calabresa grande</li>
                <li>1 refri 2L</li>
              </ul>
            </div>
            <div className="lp-kds-ticket">
              <div className="lp-kds-ticket-head">
                <span>#1842 Mesa 08</span>
                <span className="lp-kds-ticket-time">05 min</span>
              </div>
              <ul>
                <li>2 pratos executivos</li>
                <li>1 suco natural</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderFeatureVisual(index: number) {
  if (index === 0) {
    return (
      <div className="lp-pos-layout">
        <div className="lp-preview-panel">
          <div className="lp-preview-topline">
            <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>PDV / Caixa 01</strong>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>balcao</span>
          </div>
          <div className="lp-preview-chip-row" style={{ marginTop: 10 }}>
            {['Burgers', 'Executivos', 'Bebidas'].map((item) => (
              <span key={item} className="lp-preview-chip">
                {item}
              </span>
            ))}
          </div>
          <div className="lp-pos-products">
            {[
              ['Smash house', 'R$ 28,90'],
              ['Combo executivo', 'R$ 34,00'],
              ['Batata cheddar', 'R$ 16,00'],
              ['Refri 2L', 'R$ 12,00'],
            ].map(([title, price]) => (
              <div key={title} className="lp-order-ticket">
                <strong>{title}</strong>
                <span>{price}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-preview-panel">
          <div className="lp-preview-topline">
            <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Comanda 12</strong>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Mesa 04</span>
          </div>
          <div className="lp-order-stack" style={{ marginTop: 10 }}>
            {[
              ['2x smash house', 'R$ 57,80'],
              ['1x frita cheddar', 'R$ 16,00'],
              ['1x refri 2L', 'R$ 12,00'],
            ].map(([item, value]) => (
              <div key={item} className="lp-cart-line">
                <strong>{item}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
          <div className="lp-cart-total">
            <span>Total</span>
            <strong>R$ 85,80</strong>
          </div>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="lp-phone-shell" style={{ maxWidth: 248, margin: '0 auto' }}>
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen">
          <div className="lp-preview-topline" style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Flow Burgers</strong>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>retirada em 25 min</span>
          </div>
          <div className="lp-phone-banner">
            <strong>Peca no celular</strong>
            <span>link proprio e QR Code na mesa</span>
          </div>
          <div className="lp-preview-chip-row" style={{ margin: '12px 0' }}>
            {['Smash', 'Pizzas', 'Bebidas'].map((item) => (
              <span key={item} className="lp-preview-chip">
                {item}
              </span>
            ))}
          </div>
          <div className="lp-order-ticket">
            <strong>Pizza calabresa</strong>
            <span>grande, borda recheada e retirada ou delivery</span>
          </div>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="lp-preview-panel">
        <div className="lp-preview-topline">
          <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>KDS da cozinha</strong>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>producao</span>
        </div>
        <div className="lp-kds-grid" style={{ marginTop: 12 }}>
          <div className="lp-kds-ticket">
            <div className="lp-kds-ticket-head">
              <span>#1839 Balcao</span>
              <span className="lp-kds-ticket-time">07 min</span>
            </div>
            <ul>
              <li>3 burgers da casa</li>
              <li>2 batatas grandes</li>
            </ul>
          </div>
          <div className="lp-kds-ticket">
            <div className="lp-kds-ticket-head">
              <span>#1841 Mesa 03</span>
              <span className="lp-kds-ticket-time">04 min</span>
            </div>
            <ul>
              <li>1 prato executivo</li>
              <li>1 suco natural</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="lp-preview-panel">
        <div className="lp-preview-topline">
          <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Salao / Mesas</strong>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>11 ocupadas</span>
        </div>
        <div className="lp-table-grid-rich">
          {[
            ['Mesa 01', 'R$ 92,00', 'consumindo'],
            ['Mesa 03', 'R$ 48,00', 'aguardando prato'],
            ['Mesa 08', 'R$ 126,00', 'fechamento'],
            ['Mesa 10', 'R$ 0,00', 'livre'],
            ['Comanda 12', 'R$ 85,80', 'aberta'],
            ['Comanda 14', 'R$ 37,00', 'retirada'],
          ].map(([table, value, status]) => (
            <div key={table} className="lp-table-card-rich">
              <strong>{table}</strong>
              <span>{value}</span>
              <span className="lp-table-status" style={{ marginTop: 8 }}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="lp-preview-panel">
        <div className="lp-preview-topline">
          <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Estoque</strong>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>itens criticos</span>
        </div>
        <div className="lp-stock-list">
          {[
            ['Pao brioche', '8 un · minimo 20', '24%'],
            ['Blend bovino', '42 un · ok', '78%'],
            ['Batata palito', '2 pct · atencao', '38%'],
            ['Molho especial', '1,2 L · repor', '29%'],
          ].map(([name, detail, width]) => (
            <div key={name} className="lp-stock-item-row">
              <div style={{ display: 'grid', gap: 6, flex: 1 }}>
                <strong>{name}</strong>
                <span>{detail}</span>
              </div>
              <div className="lp-stock-progress">
                <span style={{ width }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 5) {
    return (
      <div className="lp-preview-panel">
        <div className="lp-preview-topline">
          <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Central de pedidos</strong>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>rush do dia</span>
        </div>
        <div className="lp-preview-board" style={{ marginTop: 12 }}>
          {[
            {
              title: 'Recebidos',
              count: '06',
              items: [
                ['#1844 Retirada', 'agendado para 21:25'],
                ['#1845 Delivery', 'bairro Centro'],
              ],
            },
            {
              title: 'Producao',
              count: '04',
              items: [
                ['#1840 Delivery', 'pizza grande + refri 2L'],
                ['#1842 Mesa 08', '2 pratos executivos'],
              ],
            },
            {
              title: 'Saida',
              count: '03',
              items: [
                ['#1834 Motoboy Carlos', 'em rota ha 6 min'],
                ['#1836 Mesa 03', 'pronto para servir'],
              ],
            },
          ].map((column) => (
            <div key={column.title} className="lp-preview-column">
              <div className="lp-order-column-head">
                <span>{column.title}</span>
                <span className="lp-order-count">{column.count}</span>
              </div>
              <div className="lp-order-stack">
                {column.items.map(([title, detail]) => (
                  <div key={title} className="lp-preview-ticket">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lp-preview-panel">
      <div className="lp-preview-label">Painel do dia</div>
    </div>
  );
}

function DashboardVisualPreview() {
  return (
    <div className="lp-window-shell">
      <div className="lp-window-bar">
        <div className="lp-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="lp-window-meta">
          <div className="lp-window-title">Painel gerencial</div>
          <div className="lp-window-subtitle">vendas, canais, caixa e alertas</div>
        </div>
        <span className="lp-status-pill">Caixa aberto</span>
      </div>

      <div className="lp-window-body">
        <div className="lp-dashboard-metrics">
          {DASHBOARD_SIGNALS.map((signal) => (
            <div key={signal.label} className="lp-mini-card">
              <div className="lp-preview-kpi-label">{signal.label}</div>
              <div className="lp-preview-kpi-value">{signal.value}</div>
              <div className="lp-preview-kpi-detail">{signal.detail}</div>
            </div>
          ))}
        </div>

        <div className="lp-dashboard-split">
          <div className="lp-preview-panel">
            <div className="lp-preview-label">Vendas por canal</div>
            <div className="lp-stock-list" style={{ marginTop: 12 }}>
              {DASHBOARD_CHANNELS.map((item) => (
                <div key={item.label} className="lp-channel-row">
                  <strong>{item.label}</strong>
                  <div className="lp-channel-bar">
                    <span style={{ width: item.width }} />
                  </div>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-preview-panel">
            <div className="lp-preview-label">Itens fortes</div>
            <div className="lp-stock-list" style={{ marginTop: 12 }}>
              {TOP_ITEMS.map((item) => (
                <div key={item.label} className="lp-top-item-row">
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lp-preview-panel">
          <div className="lp-preview-label">Alertas operacionais</div>
          <div className="lp-dashboard-alerts" style={{ marginTop: 12 }}>
            {ALERTS.slice(0, 3).map((alert) => (
              <div key={alert.title} className="lp-alert-card-rich">
                <strong>{alert.title}</strong>
                <span>{alert.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicLandingRevamp({
  onShowSolicitacao,
}: {
  onShowSolicitacao: () => void;
}) {
  useEffect(() => {
    const id = 'flowpdv-lp-css';
    if (document.getElementById(id)) return;
    const element = document.createElement('style');
    element.id = id;
    element.textContent = CSS;
    document.head.appendChild(element);

    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  const goToLogin = () => {
    window.location.href = '/login';
  };

  const goToSolicitar = onShowSolicitacao;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const stagger = {
    visible: {
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  return (
    <div className="lp-root">
      <nav className="lp-nav">
        <div className="lp-nav-brand lp-font-display">
          <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Flow<span className="lp-gradient-text">PDV</span>
          </div>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#64748b',
              border: '1px solid rgba(148,163,184,0.16)',
              padding: '4px 10px',
              borderRadius: 999,
            }}
          >
            RM Tecnologia
          </span>
        </div>

        <div className="lp-nav-actions">
          <button className="lp-nav-link" onClick={goToLogin}>
            Entrar
          </button>
          <button className="lp-button-primary" onClick={goToSolicitar}>
            Solicitar teste
          </button>
        </div>
      </nav>

      <section
        className="lp-section"
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 128, paddingBottom: 48 }}
      >
        <div className="lp-inner lp-hero-grid">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp}>
              <span className="lp-chip">
                <Store size={15} />
                Sistema para food service
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="lp-font-display"
              style={{
                fontSize: 'clamp(2.7rem, 6vw, 4.7rem)',
                lineHeight: 1.03,
                letterSpacing: '-0.05em',
                fontWeight: 800,
                margin: '20px 0 18px',
                maxWidth: 760,
              }}
            >
              Pedido, produção e caixa no mesmo ritmo do seu <span className="lp-gradient-text">food service</span>.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              style={{
                fontSize: '1.06rem',
                lineHeight: 1.72,
                color: '#cbd5e1',
                maxWidth: 640,
                margin: '0 0 26px',
              }}
            >
              O FlowPDV centraliza PDV, cardápio online, delivery, mesas, retirada, estoque e relatórios
              para operações de comida que precisam vender com mais controle no dia a dia.
            </motion.p>

            <motion.ul variants={stagger} className="lp-point-list" style={{ marginBottom: 30 }}>
              {HERO_POINTS.map((point) => (
                <motion.li key={point} variants={fadeUp} className="lp-point-item">
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 10,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(52,211,153,0.2)',
                      color: '#86efac',
                    }}
                  >
                    <BadgeCheck size={16} />
                  </span>
                  <span>{point}</span>
                </motion.li>
              ))}
            </motion.ul>

            <motion.div variants={fadeUp} className="lp-hero-actions">
              <button className="lp-button-primary" onClick={goToSolicitar}>
                Solicitar teste de 7 dias
                <ArrowRight size={16} />
              </button>
              <button className="lp-button-secondary" onClick={() => scrollToSection('lp-modulos')}>
                Ver areas do sistema
              </button>
            </motion.div>

            <motion.div variants={fadeUp} className="lp-meta-row" style={{ marginTop: 22 }}>
              {HERO_BADGES.map(({ icon: Icon, text }) => (
                <span key={text} className="lp-chip-muted">
                  <Icon size={15} />
                  {text}
                </span>
              ))}
            </motion.div>

            <motion.p
              variants={fadeUp}
              style={{
                marginTop: 22,
                maxWidth: 700,
                color: '#94a3b8',
                fontSize: '0.86rem',
                lineHeight: 1.7,
              }}
            >
              Atende hoje restaurante, hamburgueria/lanchonete, bar, adega, padaria/café, buffet por comanda e food truck.
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="lp-hero-panel-rich"
          >
            <HeroSystemPreview />
          </motion.div>
        </div>
      </section>

      <section className="lp-section" id="lp-modulos">
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 26 }}>
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Módulos principais
              </div>
              <h2
                className="lp-font-display"
                style={{
                  fontSize: 'clamp(2rem, 4vw, 3rem)',
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  lineHeight: 1.08,
                  margin: '0 0 12px',
                  maxWidth: 700,
                }}
              >
                O que o sistema já coloca <span className="lp-gradient-text">no mesmo fluxo</span>.
              </h2>
              <p style={{ maxWidth: 640, fontSize: '1rem', lineHeight: 1.7, color: '#94a3b8', margin: 0 }}>
                Sem promessa vaga: estes são os blocos centrais que o FlowPDV entrega hoje para a operação de comida.
              </p>
            </motion.div>

            <motion.div className="lp-feature-grid" variants={stagger}>
              {FEATURES.map(({ icon: Icon, title, description, wide }, index) => {
                const meta = FEATURE_PREVIEW_META[index] ?? FEATURE_PREVIEW_META[0];
                const tone = FEATURE_TONE_STYLES[meta.tone];

                return (
                  <motion.div
                    key={title}
                    variants={fadeUp}
                    className={`lp-surface lp-feature-card ${wide ? 'lp-feature-wide' : ''}`}
                    style={{
                      background: wide
                        ? 'linear-gradient(135deg, rgba(15,23,42,0.94) 0%, rgba(6,95,70,0.22) 100%)'
                        : undefined,
                    }}
                    whileHover={{ y: -4, borderColor: 'rgba(52,211,153,0.24)' }}
                  >
                    <div className="lp-feature-visual">{renderFeatureVisual(index)}</div>
                    <div className="lp-feature-body">
                      <span
                        className="lp-chip-muted"
                        style={{ color: tone.color, background: tone.background, border: tone.border }}
                      >
                        {meta.eyebrow}
                      </span>

                      <div className="lp-feature-title-row">
                        <span
                          className="lp-tone-icon"
                          style={{ color: tone.color, background: tone.background, border: tone.border }}
                        >
                          <Icon size={20} />
                        </span>
                        <div>
                          <div
                            className="lp-font-display"
                            style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 }}
                          >
                            {title}
                          </div>
                          <p className="lp-feature-desc">{description}</p>
                        </div>
                      </div>

                      <div className="lp-feature-bullets" style={{ marginTop: 18 }}>
                        {meta.bullets.map((bullet) => (
                          <span key={bullet} className="lp-feature-pill">
                            {bullet}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section
        className="lp-section"
        id="lp-segmentos"
        style={{
          background: 'linear-gradient(180deg, rgba(8,15,28,0.28) 0%, rgba(8,15,28,0.1) 100%)',
          borderTop: '1px solid rgba(148,163,184,0.08)',
          borderBottom: '1px solid rgba(148,163,184,0.08)',
        }}
      >
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 26 }}>
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Segmentos atendidos
              </div>
              <h2
                className="lp-font-display"
                style={{
                  fontSize: 'clamp(2rem, 4vw, 3rem)',
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  lineHeight: 1.08,
                  margin: '0 0 12px',
                  maxWidth: 720,
                }}
              >
                Onde o FlowPDV já se encaixa <span className="lp-gradient-text">com clareza hoje</span>.
              </h2>
              <p style={{ maxWidth: 640, fontSize: '1rem', lineHeight: 1.7, color: '#94a3b8', margin: 0 }}>
                O posicionamento fica mais forte quando a landing mostra aderência real ao food service e evita vender fluxo que o produto ainda não cobre.
              </p>
            </motion.div>

            <motion.div className="lp-segment-grid" variants={stagger}>
              {SEGMENTS.map(({ value, icon: Icon, label, description }) => (
                <motion.div
                  key={value}
                  variants={fadeUp}
                  className="lp-surface"
                  style={{ padding: 22 }}
                  whileHover={{ y: -4, borderColor: 'rgba(96,165,250,0.24)' }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#c4b5fd',
                      background: 'rgba(15,23,42,0.82)',
                      border: '1px solid rgba(148,163,184,0.14)',
                      marginBottom: 14,
                    }}
                  >
                    <Icon size={19} />
                  </span>
                  <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>
                    {label}
                  </div>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.62 }}>{description}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div variants={fadeUp} className="lp-surface-soft" style={{ padding: 20, marginTop: 18 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#fde68a',
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.18)',
                  }}
                >
                  <ShieldCheck size={19} />
                </span>
                <div>
                  <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>
                    Transparência comercial
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.65 }}>
                    {PUBLIC_SEGMENT_NOTE}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-inner lp-diff-grid">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Valor percebido
              </div>
              <h2
                className="lp-font-display"
                style={{
                  fontSize: 'clamp(2rem, 4vw, 3rem)',
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  lineHeight: 1.08,
                  margin: '0 0 12px',
                  maxWidth: 620,
                }}
              >
                Por que a operação sente valor <span className="lp-gradient-text">mais rápido</span>.
              </h2>
              <p style={{ maxWidth: 580, fontSize: '1rem', lineHeight: 1.7, color: '#94a3b8', margin: 0 }}>
                O ganho comercial fica mais claro quando o sistema junta rotinas que normalmente estariam espalhadas.
              </p>
            </motion.div>

            <motion.div variants={stagger} className="lp-stack">
              {DIFFERENTIALS.map(({ title, description }) => (
                <motion.div key={title} variants={fadeUp} className="lp-surface-soft" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#86efac',
                        background: 'rgba(16,185,129,0.12)',
                        border: '1px solid rgba(52,211,153,0.18)',
                      }}
                    >
                      <BadgeCheck size={17} />
                    </span>
                    <div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>{title}</div>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.86rem', lineHeight: 1.65 }}>{description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          >
            <DashboardVisualPreview />
          </motion.div>
        </div>
      </section>

      <section className="lp-section" style={{ paddingTop: 16 }}>
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="lp-surface"
            style={{
              padding: '40px clamp(24px, 5vw, 44px)',
              textAlign: 'center',
              background:
                'radial-gradient(circle at top center, rgba(56,189,248,0.16), transparent 34%), linear-gradient(180deg, rgba(8,15,28,0.96) 0%, rgba(7,13,24,0.98) 100%)',
            }}
          >
            <motion.div variants={fadeUp}>
              <span className="lp-chip">
                <BadgeCheck size={15} />
                Teste de 7 dias · sem cartão · implantação acompanhada
              </span>
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="lp-font-display"
              style={{
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1.08,
                margin: '20px auto 12px',
                maxWidth: 760,
              }}
            >
              Quer ver o FlowPDV funcionando na sua <span className="lp-gradient-text">operação de comida</span>?
            </motion.h2>

            <motion.p
              variants={fadeUp}
              style={{
                maxWidth: 680,
                margin: '0 auto 26px',
                fontSize: '1rem',
                lineHeight: 1.72,
                color: '#94a3b8',
              }}
            >
              Solicite o teste para avaliar PDV, cardápio online, cozinha, delivery, mesas, retirada,
              estoque e caixa no mesmo sistema.
            </motion.p>

            <motion.div variants={fadeUp} className="lp-hero-actions" style={{ justifyContent: 'center' }}>
              <button className="lp-button-primary" onClick={goToSolicitar}>
                Solicitar teste de 7 dias
                <ArrowRight size={16} />
              </button>
              <button className="lp-button-secondary" onClick={goToLogin}>
                Entrar na operação
              </button>
            </motion.div>

            <motion.p variants={fadeUp} style={{ margin: '18px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
              Após o trial, planos mensais. A RM Tecnologia acompanha a implantação.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-font-display" style={{ fontSize: '1.02rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Flow<span className="lp-gradient-text">PDV</span>
        </div>

        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          © {new Date().getFullYear()} RM Tecnologia · Todos os direitos reservados.
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a href="/privacidade" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.84rem', fontWeight: 500 }}>
            Privacidade
          </a>
          <a href="/termos" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.84rem', fontWeight: 500 }}>
            Termos de uso
          </a>
          <button
            onClick={goToSolicitar}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#7dd3fc',
              fontSize: '0.84rem',
              fontWeight: 600,
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}
          >
            Solicitar teste
          </button>
        </div>
      </footer>
    </div>
  );
}
