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

interface HeroTimelineEntry {
  time: string;
  title: string;
  detail: string;
  tone: FeatureTone;
}

interface HeroFlowColumn {
  title: string;
  count: string;
  items: Array<{
    code: string;
    title: string;
    detail: string;
  }>;
}

interface HeroChannel {
  label: string;
  value: string;
  detail: string;
  width: string;
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

interface VisualStory {
  eyebrow: string;
  title: string;
  detail: string;
  caption: string;
  image: string;
}

const FEATURE_TONE_STYLES: Record<
  FeatureTone,
  { color: string; background: string; border: string }
> = {
  emerald: {
    color: '#d7e7df',
    background: 'linear-gradient(180deg, rgba(29,45,45,0.74) 0%, rgba(19,30,31,0.84) 100%)',
    border: '1px solid rgba(129,160,153,0.22)',
  },
  sky: {
    color: '#d8e7f2',
    background: 'linear-gradient(180deg, rgba(26,42,58,0.72) 0%, rgba(18,29,42,0.84) 100%)',
    border: '1px solid rgba(116,154,182,0.22)',
  },
  amber: {
    color: '#edd5c2',
    background: 'linear-gradient(180deg, rgba(72,45,34,0.76) 0%, rgba(47,28,23,0.86) 100%)',
    border: '1px solid rgba(199,138,108,0.22)',
  },
  violet: {
    color: '#e8d8e6',
    background: 'linear-gradient(180deg, rgba(56,35,45,0.74) 0%, rgba(38,22,32,0.84) 100%)',
    border: '1px solid rgba(164,128,156,0.22)',
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

const HERO_TIMELINE: HeroTimelineEntry[] = [
  {
    time: '19:05',
    title: 'Rush no balcao',
    detail: '+4 pedidos em 8 min',
    tone: 'amber',
  },
  {
    time: '19:18',
    title: 'Retirada em dia',
    detail: '2 agendados confirmados',
    tone: 'sky',
  },
  {
    time: '19:26',
    title: 'Cozinha no ritmo',
    detail: 'fila principal em 14 itens',
    tone: 'emerald',
  },
];

const HERO_FLOW_COLUMNS: HeroFlowColumn[] = [
  {
    title: 'Entrada',
    count: '08',
    items: [
      { code: '#1842', title: 'Mesa 08', detail: '2 pratos executivos' },
      { code: '#1843', title: 'Retirada', detail: '1 combo smash house' },
    ],
  },
  {
    title: 'Preparo',
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
];

const HERO_CHANNELS: HeroChannel[] = [
  {
    label: 'Balcao',
    value: '23 atendimentos',
    detail: 'caixa 01 puxando o pico',
    width: '78%',
  },
  {
    label: 'Mesas',
    value: '11 abertas',
    detail: 'salao com giro constante',
    width: '63%',
  },
  {
    label: 'Retirada',
    value: '6 agendados',
    detail: 'fluxo concentrado ate 21:30',
    width: '47%',
  },
  {
    label: 'Delivery',
    value: '5 em rota',
    detail: 'bairro Centro liderando agora',
    width: '69%',
  },
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

const HERO_PRODUCT_VISUAL = {
  image: '/landing/hero-burger-plated.png',
  eyebrow: 'Apresentacao comercial',
  title: 'Produto real ajuda o cardapio a vender melhor',
  detail: 'Hamburgueria, retirada e salao ganham mais apelo quando a landing mistura software com imagem de verdade.',
};

const PHONE_PRODUCT_VISUAL = {
  image: '/landing/cardapio-burger-close.jpeg',
  label: 'mais pedido hoje',
};

const VISUAL_STORIES: VisualStory[] = [
  {
    eyebrow: 'Hamburgueria',
    title: 'Combo, salao e retirada no mesmo ritmo do rush',
    detail: 'A apresentacao fica mais crivel quando o sistema aparece junto de produto real, pronto para vender.',
    caption: 'pedido no balcao, QR Code e giro no jantar',
    image: '/landing/hero-burger-plated.png',
  },
  {
    eyebrow: 'Restaurante e pratos',
    title: 'Producao por etapa para prato executivo, grelha e cozinha',
    detail: 'O visual aproxima a proposta da pratica de quem precisa coordenar preparo, saida e tempo de mesa.',
    caption: 'cozinha organizada para servico a la carte',
    image: '/landing/restaurante-skewers.png',
  },
  {
    eyebrow: 'Petiscos e conveniencia',
    title: 'Itens de giro rapido com apresentacao mais apetitiva',
    detail: 'Fotos bem usadas reforcam mix, combos e decisao de compra sem transformar a landing em galeria.',
    caption: 'petisco, combo e venda por impulso no atendimento',
    image: '/landing/petisco-fries.jpeg',
  },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

  .lp-root * { box-sizing: border-box; }
  .lp-root {
    font-family: 'DM Sans', system-ui, sans-serif;
    --lp-text-main: #f5f7fa;
    --lp-text-soft: #d5dce6;
    --lp-text-muted: #93a0ae;
    --lp-border-soft: rgba(148, 163, 184, 0.14);
    --lp-border-strong: rgba(148, 163, 184, 0.22);
    --lp-surface-1: rgba(14, 18, 25, 0.9);
    --lp-surface-2: rgba(9, 12, 18, 0.96);
    --lp-accent: #c78a6c;
    --lp-accent-strong: #9c604f;
    --lp-accent-soft: #e7cbb4;
    --lp-cool: #7ea3b9;
    --lp-cool-strong: #4f6981;
    color: var(--lp-text-main);
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
    background:
      radial-gradient(circle at 14% 0%, rgba(156, 96, 79, 0.22), transparent 24%),
      radial-gradient(circle at 82% 10%, rgba(79, 105, 129, 0.18), transparent 28%),
      radial-gradient(circle at 50% 86%, rgba(199, 138, 108, 0.1), transparent 34%),
      linear-gradient(180deg, #06080c 0%, #0b1119 46%, #06080c 100%);
  }
  .lp-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
    opacity: 0.24;
    mix-blend-mode: screen;
    pointer-events: none;
    z-index: 0;
  }
  .lp-root::after {
    content: '';
    position: fixed;
    inset: 0;
    background: linear-gradient(180deg, rgba(5, 7, 11, 0) 0%, rgba(5, 7, 11, 0.12) 42%, rgba(5, 7, 11, 0.38) 100%);
    pointer-events: none;
    z-index: 0;
  }
  .lp-font-display { font-family: 'Manrope', system-ui, sans-serif; }
  .lp-gradient-text {
    background: linear-gradient(135deg, #f1d8c4 0%, #c78a6c 42%, #7ea3b9 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .lp-balance { text-wrap: balance; }
  @keyframes lp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.82)} }
  .lp-live-dot { animation: lp-pulse 2s infinite; }
  .lp-section { padding: 110px 5.25%; position: relative; z-index: 1; }
  .lp-section-hero {
    min-height: 100vh;
    display: flex;
    align-items: center;
    padding-top: 148px;
    padding-bottom: 88px;
  }
  .lp-section-band {
    background: linear-gradient(180deg, rgba(10, 16, 24, 0.58) 0%, rgba(10, 16, 24, 0.18) 100%);
    border-top: 1px solid rgba(148, 163, 184, 0.08);
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  }
  .lp-section-compact { padding-top: 26px; }
  .lp-inner { max-width: 1220px; margin: 0 auto; }
  .lp-section-heading { margin-bottom: 34px; max-width: 760px; }
  .lp-hero-title {
    font-size: clamp(2.85rem, 5.85vw, 4.72rem);
    line-height: 1.01;
    letter-spacing: -0.055em;
    font-weight: 800;
    margin: 22px 0 20px;
    max-width: 12ch;
    text-shadow: 0 18px 38px rgba(2, 6, 23, 0.22);
  }
  .lp-section-title {
    font-size: clamp(1.98rem, 3.8vw, 3rem);
    font-weight: 800;
    letter-spacing: -0.045em;
    line-height: 1.08;
    margin: 0 0 14px;
    max-width: 14ch;
  }
  .lp-copy-lg {
    margin: 0;
    max-width: 660px;
    font-size: 1.02rem;
    line-height: 1.74;
    color: var(--lp-text-soft);
  }
  .lp-copy-sm {
    margin: 0;
    max-width: 700px;
    font-size: 0.87rem;
    line-height: 1.7;
    color: var(--lp-text-muted);
  }
  .lp-hero-note {
    margin-top: 24px;
    max-width: 700px;
    color: var(--lp-text-muted);
    font-size: 0.86rem;
    line-height: 1.76;
  }
  .lp-nav {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 16px 5.25%;
    background: rgba(6, 10, 16, 0.72);
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    box-shadow: 0 16px 34px rgba(2, 6, 23, 0.22);
    backdrop-filter: blur(20px);
  }
  .lp-nav-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .lp-brand-pill {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #98a8bb;
    border: 1px solid rgba(148, 163, 184, 0.14);
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(10, 15, 23, 0.54);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .lp-nav-actions { display: flex; align-items: center; gap: 10px; }
  .lp-nav-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid transparent;
    background: transparent;
    font-family: 'DM Sans', system-ui, sans-serif;
    color: #cbd5e1;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
  }
  .lp-surface {
    background:
      radial-gradient(circle at top right, rgba(199, 138, 108, 0.09), transparent 30%),
      radial-gradient(circle at bottom left, rgba(79, 105, 129, 0.09), transparent 24%),
      linear-gradient(180deg, rgba(13, 18, 27, 0.92) 0%, rgba(8, 12, 18, 0.98) 100%);
    border: 1px solid var(--lp-border-strong);
    border-radius: 28px;
    box-shadow: 0 30px 72px rgba(2, 6, 23, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(20px);
    transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
  }
  .lp-surface-soft {
    background: linear-gradient(180deg, rgba(16, 22, 32, 0.78) 0%, rgba(11, 16, 25, 0.86) 100%);
    border: 1px solid var(--lp-border-soft);
    border-radius: 22px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    backdrop-filter: blur(16px);
    transition: transform .22s ease, border-color .22s ease;
  }
  .lp-chip,
  .lp-chip-muted {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 15px;
    border-radius: 999px;
    font-size: 0.79rem;
    font-weight: 600;
  }
  .lp-chip {
    border: 1px solid rgba(199, 138, 108, 0.28);
    background: linear-gradient(180deg, rgba(45, 28, 24, 0.78) 0%, rgba(18, 22, 33, 0.68) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    color: #f0d7c4;
  }
  .lp-chip-muted {
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(12, 18, 28, 0.72);
    color: #d9e1ea;
  }
  .lp-button-primary,
  .lp-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 54px;
    padding: 15px 26px;
    border-radius: 16px;
    font-size: 0.96rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background-color .18s ease;
    font-family: 'DM Sans', system-ui, sans-serif;
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }
  .lp-button-primary {
    color: #fff;
    border: 1px solid rgba(199, 138, 108, 0.22);
    background: linear-gradient(135deg, #c78a6c 0%, #9c604f 44%, #4f6981 100%);
    box-shadow: 0 20px 44px rgba(89, 55, 47, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  }
  .lp-button-primary::after,
  .lp-button-secondary::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    pointer-events: none;
    z-index: -1;
  }
  .lp-button-primary::after {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 42%);
  }
  .lp-button-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 24px 48px rgba(89, 55, 47, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
  .lp-button-secondary {
    color: #eef6fb;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: linear-gradient(180deg, rgba(14, 22, 33, 0.82) 0%, rgba(9, 14, 22, 0.92) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .lp-button-secondary::after {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 55%);
  }
  .lp-button-secondary:hover,
  .lp-nav-link:hover {
    color: #fff;
    border-color: rgba(199, 138, 108, 0.22);
    background: rgba(18, 27, 39, 0.9);
  }
  .lp-button-primary:focus-visible,
  .lp-button-secondary:focus-visible,
  .lp-nav-link:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(199, 138, 108, 0.16);
  }
  .lp-overline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #d7b7a2;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .lp-overline::before {
    content: '';
    width: 26px;
    height: 1px;
    background: linear-gradient(90deg, rgba(199, 138, 108, 0.92), rgba(126, 163, 185, 0.56));
  }
  .lp-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(540px, 590px); gap: 72px; align-items: center; }
  .lp-hero-panel { padding: 28px; position: relative; overflow: hidden; }
  .lp-hero-panel::after {
    content: '';
    position: absolute;
    inset: auto -60px -120px auto;
    width: 240px;
    height: 240px;
    background: radial-gradient(circle, rgba(126, 163, 185, 0.16) 0%, transparent 72%);
    pointer-events: none;
  }
  .lp-hero-actions,
  .lp-meta-row { display: flex; flex-wrap: wrap; gap: 12px; }
  .lp-point-list {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lp-point-item {
    display: flex;
    align-items: flex-start;
    gap: 13px;
    color: var(--lp-text-soft);
    font-size: 0.96rem;
    line-height: 1.64;
  }
  .lp-kpi-grid,
  .lp-proof-grid,
  .lp-feature-grid,
  .lp-segment-grid,
  .lp-diff-grid,
  .lp-alert-grid {
    display: grid;
    gap: 20px;
  }
  .lp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 24px 0; }
  .lp-kpi-card {
    padding: 18px;
    border-radius: 20px;
    background: rgba(16, 24, 36, 0.74);
    border: 1px solid rgba(148, 163, 184, 0.12);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }
  .lp-stack { display: grid; gap: 14px; }
  .lp-stack-card {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 16px 18px;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.62);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-proof-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-feature-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-feature-wide { grid-column: span 2; }
  .lp-segment-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .lp-diff-grid { grid-template-columns: minmax(0, 1fr) 420px; align-items: center; }
  .lp-alert-grid { margin-top: 20px; }
  .lp-hero-panel-rich {
    width: 100%;
    max-width: 590px;
    margin-left: auto;
    padding: 0;
    overflow: visible;
    background: transparent;
    border: none;
    box-shadow: none;
    position: relative;
  }
  .lp-system-stage { position: relative; }
  .lp-system-stage::before {
    content: '';
    position: absolute;
    inset: 42px 18px 18px;
    border-radius: 38px;
    background:
      radial-gradient(circle at top left, rgba(199, 138, 108, 0.16), transparent 42%),
      radial-gradient(circle at bottom right, rgba(126, 163, 185, 0.12), transparent 42%);
    filter: blur(24px);
    opacity: 0.9;
    pointer-events: none;
  }
  .lp-window-shell {
    width: 100%;
    position: relative;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(11, 16, 24, 0.96) 0%, rgba(7, 10, 16, 0.99) 100%);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 34px;
    box-shadow: 0 34px 82px rgba(2, 6, 23, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .lp-window-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    background: linear-gradient(180deg, rgba(17, 24, 39, 0.86) 0%, rgba(10, 15, 24, 0.72) 100%);
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
  .lp-window-subtitle { margin-top: 2px; font-size: 0.76rem; color: var(--lp-text-muted); }
  .lp-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 600;
    border: 1px solid rgba(199, 138, 108, 0.24);
    background: rgba(78, 46, 38, 0.28);
    color: #efd4c0;
  }
  .lp-window-body { padding: 22px; display: grid; gap: 16px; }
  .lp-window-body-hero { gap: 18px; }
  .lp-hero-cockpit { display: grid; grid-template-columns: minmax(0, 1.18fr) 220px; gap: 16px; align-items: start; }
  .lp-hero-primary-stack,
  .lp-hero-rail-stack { display: grid; gap: 16px; }
  .lp-preview-panel,
  .lp-mini-card,
  .lp-feature-visual,
  .lp-alert-card-rich {
    padding: 16px;
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(15, 22, 33, 0.8) 0%, rgba(10, 15, 24, 0.88) 100%);
    border: 1px solid rgba(148, 163, 184, 0.12);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }
  .lp-mini-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .lp-preview-kpi-label,
  .lp-preview-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #7f93aa;
    font-weight: 600;
  }
  .lp-preview-kpi-value {
    margin-top: 8px;
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 1.18rem;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .lp-preview-kpi-detail { margin-top: 4px; font-size: 0.76rem; color: #c9d9e5; }
  .lp-hero-summary-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .lp-hero-summary-title {
    margin-top: 8px;
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 1.18rem;
    line-height: 1.08;
    letter-spacing: -0.035em;
    color: #f8fafc;
  }
  .lp-hero-summary-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(126, 163, 185, 0.18);
    background: rgba(26, 42, 58, 0.38);
    color: #d8e7f2;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .lp-hero-summary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .lp-hero-summary-text {
    margin: 0;
    color: #d7e3ee;
    font-size: 0.84rem;
    line-height: 1.72;
  }
  .lp-hero-goal-card {
    width: min(100%, 220px);
    padding: 14px;
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(13, 21, 33, 0.92) 0%, rgba(9, 15, 25, 0.98) 100%);
    border: 1px solid rgba(148, 163, 184, 0.1);
    display: grid;
    gap: 8px;
    justify-self: end;
  }
  .lp-hero-goal-bar {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(51, 65, 85, 0.72);
  }
  .lp-hero-goal-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #c78a6c 0%, #7ea3b9 100%);
  }
  .lp-hero-goal-note {
    font-size: 0.72rem;
    line-height: 1.55;
    color: #94a3b8;
  }
  .lp-hero-timeline {
    margin-top: 14px;
    display: grid;
    gap: 10px;
  }
  .lp-hero-timeline-row {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    align-items: start;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(8, 15, 28, 0.62);
    border: 1px solid rgba(148, 163, 184, 0.08);
  }
  .lp-hero-timeline-meta {
    display: grid;
    justify-items: start;
    gap: 8px;
    padding-top: 2px;
  }
  .lp-hero-timeline-time {
    font-size: 0.7rem;
    font-weight: 600;
    color: #d7b7a2;
    letter-spacing: 0.04em;
  }
  .lp-hero-timeline-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    box-shadow: 0 0 0 6px rgba(15, 23, 42, 0.34);
  }
  .lp-hero-timeline-body strong,
  .lp-hero-timeline-body span {
    display: block;
  }
  .lp-hero-timeline-body {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .lp-hero-timeline-body strong {
    font-size: 0.81rem;
    color: #f8fafc;
    font-weight: 600;
    line-height: 1.3;
    text-wrap: pretty;
    word-break: normal;
  }
  .lp-hero-timeline-body span {
    font-size: 0.72rem;
    color: #94a3b8;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .lp-order-board,
  .lp-preview-board,
  .lp-kds-grid { display: grid; gap: 10px; }
  .lp-order-board,
  .lp-preview-board { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-kds-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-order-column,
  .lp-preview-column {
    padding: 12px;
    border-radius: 20px;
    background: rgba(14, 22, 34, 0.62);
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
    color: #f0d7c4;
    background: rgba(199, 138, 108, 0.12);
    border: 1px solid rgba(199, 138, 108, 0.2);
  }
  .lp-order-stack,
  .lp-feature-bullets,
  .lp-side-list,
  .lp-stock-list,
  .lp-dashboard-alerts { display: grid; gap: 10px; }
  .lp-hero-order-board { margin-top: 14px; }
  .lp-order-ticket,
  .lp-preview-ticket,
  .lp-table-card-rich {
    padding: 10px;
    border-radius: 14px;
    background: rgba(8, 15, 28, 0.74);
    border: 1px solid rgba(148, 163, 184, 0.1);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
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
  .lp-hero-channel-stack { margin-top: 14px; display: grid; gap: 10px; }
  .lp-hero-channel-card {
    padding: 12px;
    border-radius: 18px;
    background: rgba(8, 15, 28, 0.64);
    border: 1px solid rgba(148, 163, 184, 0.08);
  }
  .lp-hero-channel-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .lp-hero-channel-top strong {
    font-size: 0.79rem;
    color: #f8fafc;
    font-weight: 600;
  }
  .lp-hero-channel-top span {
    font-size: 0.72rem;
    color: #cbd5e1;
  }
  .lp-hero-channel-bar {
    width: 100%;
    height: 7px;
    margin-top: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(51, 65, 85, 0.72);
  }
  .lp-hero-channel-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7ea3b9 0%, #c78a6c 100%);
  }
  .lp-hero-channel-meta {
    margin-top: 8px;
    font-size: 0.71rem;
    color: #94a3b8;
    line-height: 1.45;
  }
  .lp-hero-menu-note {
    margin-top: 12px;
    font-size: 0.72rem;
    line-height: 1.55;
    color: #cbd5e1;
  }
  .lp-floating-card { position: absolute; z-index: 3; }
  .lp-floating-phone { left: -14px; bottom: 16px; width: 218px; }
  .lp-floating-kds { right: -8px; top: 56px; width: 238px; }
  .lp-phone-shell,
  .lp-kds-shell {
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 24px 54px rgba(2, 6, 23, 0.44);
  }
  .lp-phone-shell {
    padding: 12px;
    border-radius: 32px;
    background: linear-gradient(180deg, rgba(9, 15, 24, 0.96) 0%, rgba(13, 20, 32, 0.94) 100%);
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
    background: linear-gradient(135deg, rgba(199, 138, 108, 0.22) 0%, rgba(79, 105, 129, 0.14) 100%);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-phone-banner strong { display: block; font-size: 0.88rem; color: #f1d8c4; }
  .lp-phone-banner span { display: block; margin-top: 4px; font-size: 0.72rem; color: #cbd5e1; }
  .lp-phone-product-shot {
    position: relative;
    overflow: hidden;
    margin-bottom: 12px;
    border-radius: 18px;
    min-height: 132px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(8, 15, 28, 0.7);
  }
  .lp-phone-product-shot img {
    width: 100%;
    height: 132px;
    object-fit: cover;
    display: block;
    filter: saturate(0.92) contrast(1.02);
  }
  .lp-phone-shot-tag {
    position: absolute;
    left: 10px;
    top: 10px;
    display: inline-flex;
    align-items: center;
    padding: 7px 10px;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    color: #f7efe8;
    background: rgba(12, 18, 28, 0.74);
    border: 1px solid rgba(199, 138, 108, 0.22);
    backdrop-filter: blur(12px);
  }
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
    color: #d6dfe8;
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
    background: rgba(8, 15, 28, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.12);
  }
  .lp-kds-ticket-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 0.76rem; font-weight: 600; color: #f8fafc; }
  .lp-kds-ticket-time { color: #e8c7b0; font-size: 0.7rem; }
  .lp-kds-ticket ul { margin: 0; padding-left: 16px; display: grid; gap: 4px; color: #94a3b8; font-size: 0.72rem; line-height: 1.45; }
  .lp-feature-card { padding: 0 !important; overflow: hidden; height: 100%; }
  .lp-feature-visual {
    min-height: 208px;
    border-radius: 0;
    border: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    background:
      radial-gradient(circle at top right, rgba(199, 138, 108, 0.12), transparent 34%),
      linear-gradient(180deg, rgba(8, 15, 28, 0.88) 0%, rgba(8, 15, 28, 0.74) 100%);
  }
  .lp-feature-body { padding: 24px 24px 26px; }
  .lp-feature-title-row { display: flex; align-items: flex-start; gap: 16px; margin-top: 18px; }
  .lp-feature-title-row h3 { margin: 6px 0 10px; font-family: 'Manrope', system-ui, sans-serif; font-size: 1.08rem; line-height: 1.16; letter-spacing: -0.035em; }
  .lp-feature-desc { margin: 0; color: #a8b8c8; font-size: 0.9rem; line-height: 1.72; }
  .lp-tone-icon {
    width: 50px;
    height: 50px;
    border-radius: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
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
  .lp-channel-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #c78a6c 0%, #7ea3b9 100%); }
  .lp-channel-bar { flex: 1; height: 8px; border-radius: 999px; overflow: hidden; background: rgba(51, 65, 85, 0.72); }
  .lp-dashboard-grid-rich { display: grid; gap: 14px; }
  .lp-dashboard-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .lp-dashboard-split { display: grid; grid-template-columns: minmax(0, 1.04fr) minmax(220px, 0.96fr); gap: 14px; }
  .lp-hero-photo-card,
  .lp-food-story-card {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 26px 58px rgba(2, 6, 23, 0.28);
  }
  .lp-hero-photo-card {
    min-height: 236px;
    border-radius: 24px;
    background: rgba(10, 15, 24, 0.86);
  }
  .lp-hero-photo-image,
  .lp-food-story-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: saturate(0.9) contrast(1.02);
  }
  .lp-hero-photo-overlay,
  .lp-food-story-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(8, 12, 18, 0.08) 0%, rgba(8, 12, 18, 0.36) 38%, rgba(8, 12, 18, 0.92) 100%);
  }
  .lp-hero-photo-body {
    position: absolute;
    inset: auto 0 0 0;
    z-index: 1;
    display: grid;
    gap: 8px;
    padding: 18px;
  }
  .lp-hero-photo-label,
  .lp-food-story-eyebrow {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 7px 10px;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f3dfd1;
    background: rgba(12, 18, 28, 0.72);
    border: 1px solid rgba(199, 138, 108, 0.22);
    backdrop-filter: blur(14px);
  }
  .lp-hero-photo-title {
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 1.02rem;
    line-height: 1.2;
    letter-spacing: -0.03em;
    color: #f7f7f8;
    font-weight: 700;
  }
  .lp-hero-photo-detail {
    font-size: 0.78rem;
    line-height: 1.58;
    color: #d5dce6;
  }
  .lp-food-story-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }
  .lp-food-story-card {
    min-height: 360px;
    border-radius: 28px;
    transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
    background: rgba(10, 15, 24, 0.84);
  }
  .lp-food-story-card:hover {
    border-color: rgba(199, 138, 108, 0.32);
    box-shadow: 0 30px 64px rgba(2, 6, 23, 0.34);
  }
  .lp-food-story-body {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
    padding: 22px;
  }
  .lp-food-story-title {
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 1.18rem;
    font-weight: 800;
    line-height: 1.16;
    letter-spacing: -0.035em;
    color: #f6f7f9;
  }
  .lp-food-story-detail {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.68;
    color: #d4dce6;
  }
  .lp-food-story-caption {
    font-size: 0.74rem;
    line-height: 1.5;
    color: #a6b2bf;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .lp-cta-shell {
    padding: 44px clamp(24px, 5vw, 46px);
    text-align: center;
    background:
      radial-gradient(circle at top center, rgba(199, 138, 108, 0.2), transparent 32%),
      radial-gradient(circle at 82% 16%, rgba(126, 163, 185, 0.12), transparent 28%),
      linear-gradient(180deg, rgba(9, 15, 24, 0.98) 0%, rgba(7, 12, 20, 1) 100%);
  }
  .lp-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 34px 5.25% 40px;
    position: relative;
    z-index: 1;
    border-top: 1px solid rgba(148, 163, 184, 0.08);
  }
  .lp-footer-link {
    color: #cbd5e1;
    text-decoration: none;
    font-size: 0.84rem;
    font-weight: 500;
    transition: color .18s ease;
  }
  .lp-footer-link:hover {
    color: #f2ded0;
  }
  @media (max-width: 1100px) {
    .lp-hero-grid,
    .lp-diff-grid { grid-template-columns: 1fr; }
    .lp-hero-grid { gap: 48px; }
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
    .lp-hero-panel-rich {
      max-width: 760px;
      margin: 0 auto;
    }
    .lp-segment-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .lp-section-title,
    .lp-section-heading { max-width: none; }
  }
  @media (max-width: 900px) {
    .lp-proof-grid,
    .lp-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-feature-wide { grid-column: span 2; }
    .lp-segment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-food-story-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-hero-cockpit,
    .lp-hero-summary-grid,
    .lp-pos-layout,
    .lp-dashboard-split { grid-template-columns: 1fr; }
    .lp-hero-goal-card {
      width: 100%;
      justify-self: stretch;
    }
    .lp-dashboard-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-section { padding: 86px 5.25%; }
    .lp-section-hero {
      min-height: auto;
      padding-top: 136px;
      padding-bottom: 78px;
    }
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
    .lp-hero-title { max-width: none; }
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
    .lp-section { padding: 68px 5.25%; }
    .lp-section-hero {
      padding-top: 124px;
      padding-bottom: 64px;
    }
    .lp-hero-actions {
      flex-direction: column;
      align-items: stretch;
    }
    .lp-button-primary,
    .lp-button-secondary,
    .lp-nav-link { width: 100%; }
    .lp-kpi-grid,
    .lp-proof-grid,
    .lp-feature-grid,
    .lp-segment-grid,
    .lp-food-story-grid,
    .lp-dashboard-metrics,
    .lp-table-grid-rich,
    .lp-mini-card-grid { grid-template-columns: 1fr; }
    .lp-feature-wide { grid-column: span 1; }
    .lp-food-story-card { min-height: 320px; }
    .lp-meta-row {
      flex-direction: column;
      align-items: flex-start;
    }
    .lp-footer {
      flex-direction: column;
      align-items: flex-start;
    }
    .lp-brand-pill { padding-inline: 10px; }
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
            <div className="lp-window-title">FlowPDV / Operacao central</div>
            <div className="lp-window-subtitle">pedidos, canais, cozinha e caixa na mesma leitura</div>
          </div>
          <span className="lp-status-pill">
            <span
              className="lp-live-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                display: 'inline-block',
                background: '#7ea3b9',
              }}
            />
            Ao vivo
          </span>
        </div>

        <div className="lp-window-body lp-window-body-hero">
          <div className="lp-dashboard-metrics">
            {HERO_METRICS.map((metric) => (
              <div key={metric.label} className="lp-mini-card">
                <div className="lp-preview-kpi-label">{metric.label}</div>
                <div className="lp-preview-kpi-value">{metric.value}</div>
                <div className="lp-preview-kpi-detail">{metric.detail}</div>
              </div>
            ))}
          </div>

          <div className="lp-hero-cockpit">
            <div className="lp-hero-primary-stack">
              <div className="lp-preview-panel">
                <div className="lp-hero-summary-head">
                  <div>
                    <div className="lp-preview-label">Operacao de hoje</div>
                    <div className="lp-hero-summary-title">Uma tela para ler o turno e agir rapido</div>
                  </div>
                  <span className="lp-hero-summary-badge">turno noite</span>
                </div>

                <div className="lp-hero-summary-grid">
                  <div>
                    <p className="lp-hero-summary-text">
                      Balcao, mesas, retirada e delivery entram no mesmo fluxo e seguem para cozinha, saida
                      e caixa sem repasse manual entre telas.
                    </p>

                    <div className="lp-hero-timeline">
                      {HERO_TIMELINE.map((entry) => (
                        <div key={entry.time} className="lp-hero-timeline-row">
                          <div className="lp-hero-timeline-meta">
                            <span className="lp-hero-timeline-time">{entry.time}</span>
                            <span
                              className="lp-hero-timeline-dot"
                              style={{ background: FEATURE_TONE_STYLES[entry.tone].color }}
                            />
                          </div>
                          <div className="lp-hero-timeline-body">
                            <strong>{entry.title}</strong>
                            <span>{entry.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lp-hero-goal-card">
                    <div className="lp-preview-kpi-label">Meta do turno</div>
                    <div className="lp-preview-kpi-value">73%</div>
                    <div className="lp-preview-kpi-detail">R$ 3.840 de R$ 5.200</div>
                    <div className="lp-hero-goal-bar">
                      <span style={{ width: '73%' }} />
                    </div>
                    <div className="lp-hero-goal-note">pico entre 19h e 21h sustentando o ritmo</div>
                  </div>
                </div>
              </div>

              <div className="lp-preview-panel">
                <div className="lp-preview-topline">
                  <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Pedidos em movimento</strong>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>entrada, preparo e saida</span>
                </div>

                <div className="lp-order-board lp-hero-order-board">
                  {HERO_FLOW_COLUMNS.map((column) => (
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

            <div className="lp-hero-rail-stack">
              <div className="lp-preview-panel">
                <div className="lp-preview-topline">
                  <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Canais conectados</strong>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>atendimento em curso</span>
                </div>

                <div className="lp-hero-channel-stack">
                  {HERO_CHANNELS.map((item) => (
                    <div key={item.label} className="lp-hero-channel-card">
                      <div className="lp-hero-channel-top">
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                      <div className="lp-hero-channel-bar">
                        <span style={{ width: item.width }} />
                      </div>
                      <div className="lp-hero-channel-meta">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lp-hero-photo-card">
                <img
                  src={HERO_PRODUCT_VISUAL.image}
                  alt="Hamburguer servido em prato com fritas"
                  className="lp-hero-photo-image"
                  loading="lazy"
                />
                <div className="lp-hero-photo-overlay" />
                <div className="lp-hero-photo-body">
                  <span className="lp-hero-photo-label">{HERO_PRODUCT_VISUAL.eyebrow}</span>
                  <strong className="lp-hero-photo-title">{HERO_PRODUCT_VISUAL.title}</strong>
                  <span className="lp-hero-photo-detail">{HERO_PRODUCT_VISUAL.detail}</span>
                </div>
              </div>

              <div className="lp-preview-panel">
                <div className="lp-preview-topline">
                  <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>Leitura do turno</strong>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>acoes que pedem resposta</span>
                </div>

                <div className="lp-dashboard-alerts" style={{ marginTop: 14 }}>
                  {ALERTS.slice(0, 2).map((alert) => (
                    <div key={alert.title} className="lp-alert-card-rich">
                      <strong>{alert.title}</strong>
                      <span>{alert.description}</span>
                    </div>
                  ))}
                </div>
              </div>
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
          <div className="lp-phone-product-shot">
            <img
              src={PHONE_PRODUCT_VISUAL.image}
              alt="Hamburguer artesanal para cardapio digital"
              loading="lazy"
            />
            <span className="lp-phone-shot-tag">{PHONE_PRODUCT_VISUAL.label}</span>
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
          <span className="lp-brand-pill">
            RM Tecnologia
          </span>
        </div>

        <div className="lp-nav-actions">
          <button type="button" className="lp-nav-link" onClick={goToLogin}>
            Entrar
          </button>
          <button type="button" className="lp-button-primary" onClick={goToSolicitar}>
            Solicitar teste
          </button>
        </div>
      </nav>

      <section className="lp-section lp-section-hero">
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
              className="lp-font-display lp-hero-title lp-balance"
            >
              Atendimento, produção e caixa conectados na rotina do seu <span className="lp-gradient-text">food service</span>.
            </motion.h1>

            <motion.p variants={fadeUp} className="lp-copy-lg" style={{ marginBottom: 28 }}>
              O FlowPDV reúne PDV, cardápio online, delivery, mesas, retirada, estoque e relatórios
              em uma operação pensada para restaurante, hamburgueria, pratos executivos e serviço por comanda.
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
                      background: 'rgba(199,138,108,0.12)',
                      border: '1px solid rgba(199,138,108,0.22)',
                      color: '#f0d7c4',
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

            <motion.p variants={fadeUp} className="lp-hero-note">
              Atende hoje restaurante, hamburgueria/lanchonete, bar, adega, padaria/cafe, buffet por comanda e food truck.
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

      <section className="lp-section lp-section-band">
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="lp-section-heading" style={{ maxWidth: 720 }}>
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Operação na prática
              </div>
              <h2 className="lp-font-display lp-section-title lp-balance" style={{ maxWidth: '13ch' }}>
                Software para venda e salão com <span className="lp-gradient-text">contexto visual real</span>.
              </h2>
              <p className="lp-copy-lg" style={{ maxWidth: 690 }}>
                Em vez de depender só de mockup, a landing agora usa imagens reais de produto onde elas reforçam a leitura comercial de restaurante,
                hamburgueria e operações com pratos e petiscos.
              </p>
            </motion.div>

            <motion.div className="lp-food-story-grid" variants={stagger}>
              {VISUAL_STORIES.map((story) => (
                <motion.article
                  key={story.title}
                  variants={fadeUp}
                  className="lp-food-story-card"
                  whileHover={{ y: -4 }}
                >
                  <img
                    src={story.image}
                    alt={story.title}
                    className="lp-food-story-image"
                    loading="lazy"
                  />
                  <div className="lp-food-story-overlay" />
                  <div className="lp-food-story-body">
                    <span className="lp-food-story-eyebrow">{story.eyebrow}</span>
                    <div className="lp-food-story-title">{story.title}</div>
                    <p className="lp-food-story-detail">{story.detail}</p>
                    <span className="lp-food-story-caption">{story.caption}</span>
                  </div>
                </motion.article>
              ))}
            </motion.div>
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
            <motion.div variants={fadeUp} className="lp-section-heading">
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Módulos principais
              </div>
              <h2 className="lp-font-display lp-section-title lp-balance">
                Os módulos que sustentam a <span className="lp-gradient-text">operação em um só sistema</span>.
              </h2>
              <p className="lp-copy-lg">
                Sem promessa vaga: estes são os blocos que o FlowPDV já conecta hoje para venda, produção e gestão do food service.
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
                        ? 'linear-gradient(135deg, rgba(15,23,42,0.94) 0%, rgba(91,57,46,0.24) 46%, rgba(79,105,129,0.18) 100%)'
                        : undefined,
                    }}
                    whileHover={{ y: -4, borderColor: 'rgba(199,138,108,0.24)' }}
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

      <section className="lp-section lp-section-band" id="lp-segmentos">
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="lp-section-heading">
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Segmentos atendidos
              </div>
              <h2 className="lp-font-display lp-section-title lp-balance" style={{ maxWidth: '12.8ch' }}>
                Onde o FlowPDV já opera com <span className="lp-gradient-text">aderência real</span>.
              </h2>
              <p className="lp-copy-lg">
                O posicionamento fica mais forte quando a landing mostra com clareza o tipo de operação que o produto cobre hoje.
              </p>
            </motion.div>

            <motion.div className="lp-segment-grid" variants={stagger}>
              {SEGMENTS.map(({ value, icon: Icon, label, description }) => (
                <motion.div
                  key={value}
                  variants={fadeUp}
                  className="lp-surface"
                  style={{ padding: 22 }}
                  whileHover={{ y: -4, borderColor: 'rgba(199,138,108,0.22)' }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f0d7c4',
                      background: 'linear-gradient(180deg, rgba(72,45,34,0.78) 0%, rgba(30,24,25,0.92) 100%)',
                      border: '1px solid rgba(199,138,108,0.22)',
                      marginBottom: 14,
                    }}
                  >
                    <Icon size={19} />
                  </span>
                  <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>
                    {label}
                  </div>
                  <p style={{ margin: 0, color: '#a8b8c8', fontSize: '0.85rem', lineHeight: 1.68 }}>{description}</p>
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
                    color: '#e8d7cb',
                    background: 'rgba(199,138,108,0.12)',
                    border: '1px solid rgba(199,138,108,0.2)',
                  }}
                >
                  <ShieldCheck size={19} />
                </span>
                <div>
                  <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>
                    Transparência comercial
                  </div>
                  <p style={{ margin: 0, color: '#d7e3ee', fontSize: '0.9rem', lineHeight: 1.7 }}>
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
            <motion.div variants={fadeUp} className="lp-section-heading" style={{ marginBottom: 28 }}>
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                Valor percebido
              </div>
              <h2 className="lp-font-display lp-section-title lp-balance" style={{ maxWidth: '11.5ch' }}>
                Por que o valor aparece <span className="lp-gradient-text">mais rápido na operação</span>.
              </h2>
              <p className="lp-copy-lg" style={{ maxWidth: 580 }}>
                A percepção comercial melhora quando frente de atendimento, cozinha, delivery e caixa deixam de depender de repasse manual.
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
                        color: '#d8e7f2',
                        background: 'rgba(79,105,129,0.18)',
                        border: '1px solid rgba(126,163,185,0.2)',
                      }}
                    >
                      <BadgeCheck size={17} />
                    </span>
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>{title}</div>
                      <p style={{ margin: 0, color: '#a8b8c8', fontSize: '0.87rem', lineHeight: 1.7 }}>{description}</p>
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

      <section className="lp-section lp-section-compact">
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="lp-surface lp-cta-shell"
          >
            <motion.div variants={fadeUp}>
              <span className="lp-chip">
                <BadgeCheck size={15} />
                Teste de 7 dias · sem cartão · implantação acompanhada
              </span>
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="lp-font-display lp-section-title lp-balance"
              style={{ margin: '20px auto 12px', maxWidth: '14ch' }}
            >
              Veja o FlowPDV aplicado à sua <span className="lp-gradient-text">operação de comida</span>.
            </motion.h2>

            <motion.p variants={fadeUp} className="lp-copy-lg" style={{ maxWidth: 680, margin: '0 auto 28px' }}>
              Solicite o teste para avaliar PDV, cardápio online, cozinha, delivery, mesas, retirada,
              estoque e caixa em um fluxo único.
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

            <motion.p variants={fadeUp} className="lp-copy-sm" style={{ margin: '18px auto 0', maxWidth: 460 }}>
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
          <a href="/privacidade" className="lp-footer-link">
            Privacidade
          </a>
          <a href="/termos" className="lp-footer-link">
            Termos de uso
          </a>
          <button
            type="button"
            onClick={goToSolicitar}
            className="lp-footer-link"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9bb7c8', fontFamily: 'DM Sans, system-ui, sans-serif' }}
          >
            Solicitar teste
          </button>
        </div>
      </footer>
    </div>
  );
}
