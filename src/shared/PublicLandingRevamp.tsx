import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import {
  type LucideIcon,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Beer,
  BellRing,
  Bike,
  Boxes,
  ChefHat,
  Coffee,
  CreditCard,
  LayoutDashboard,
  Link2,
  QrCode,
  Receipt,
  Sandwich,
  ShieldCheck,
  Sparkles,
  Store,
  TabletSmartphone,
  Truck,
  UtensilsCrossed,
  WalletCards,
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

interface OperationPillar {
  icon: LucideIcon;
  title: string;
  description: string;
}

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

const OPERATION_PILLARS: OperationPillar[] = [
  {
    icon: Store,
    title: 'Venda e atendimento',
    description: 'PDV para balcão, mesa e retirada com pagamento, desconto e rotina de caixa no mesmo fluxo.',
  },
  {
    icon: ChefHat,
    title: 'Produção sem ruído',
    description: 'Central de pedidos e cozinha com status claros para acompanhar o rush sem perder ritmo.',
  },
  {
    icon: Bike,
    title: 'Delivery conectado',
    description: 'Cardápio online com link próprio e QR Code, sem pedido solto fora da operação.',
  },
];

const FEATURES: Feature[] = [
  {
    icon: Receipt,
    title: 'PDV para balcão, mesa e retirada',
    description: 'Venda rápida com carrinho, descontos, múltiplos meios de pagamento e rotina de caixa.',
    wide: true,
  },
  {
    icon: Link2,
    title: 'Cardápio online para delivery e retirada',
    description: 'Link e QR Code para o cliente pedir online com entrada direta na operação.',
  },
  {
    icon: ChefHat,
    title: 'Central de pedidos e cozinha',
    description: 'Pedidos por etapa, visão do rush e acompanhamento da produção em tempo real.',
  },
  {
    icon: WalletCards,
    title: 'Caixa e financeiro do dia',
    description: 'Abertura, fechamento, sangria, suprimento e visão prática do movimento.',
  },
  {
    icon: Boxes,
    title: 'Estoque e insumos',
    description: 'Baixas, mínimos e movimentações alinhados ao cardápio e à cozinha.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard e relatórios',
    description: 'Vendas, ticket médio, itens fortes e leitura rápida para decidir melhor.',
  },
  {
    icon: Sparkles,
    title: 'FlowAI e alertas operacionais',
    description: 'Avisos baseados em dados de vendas, estoque, caixa e rotina dentro do painel.',
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
    .lp-segment-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 900px) {
    .lp-proof-grid,
    .lp-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lp-feature-wide { grid-column: span 2; }
    .lp-segment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
    .lp-segment-grid { grid-template-columns: 1fr; }
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
                Ver o que o sistema cobre
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
            className="lp-surface lp-hero-panel"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="lp-overline" style={{ marginBottom: 8 }}>
                  Visão da operação
                </div>
                <div className="lp-font-display" style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
                  Tudo no mesmo painel
                </div>
              </div>
              <span className="lp-chip-muted">
                <span
                  className="lp-live-dot"
                  style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: '#34d399' }}
                />
                Ao vivo
              </span>
            </div>

            <div className="lp-kpi-grid">
              {HERO_METRICS.map((metric) => (
                <div key={metric.label} className="lp-kpi-card">
                  <div
                    style={{
                      fontSize: '0.7rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#64748b',
                      marginBottom: 6,
                    }}
                  >
                    {metric.label}
                  </div>
                  <div
                    className="lp-font-display"
                    style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}
                  >
                    {metric.value}
                  </div>
                  <div style={{ fontSize: '0.77rem', color: '#86efac' }}>{metric.detail}</div>
                </div>
              ))}
            </div>

            <div className="lp-surface-soft" style={{ padding: 18, marginBottom: 16 }}>
              <div
                style={{
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#64748b',
                  marginBottom: 12,
                }}
              >
                Fluxo principal
              </div>

              <div className="lp-stack">
                {[
                  {
                    icon: Receipt,
                    title: 'Atendimento entra com contexto',
                    description: 'Balcão, mesa ou cardápio online começam no mesmo fluxo.',
                  },
                  {
                    icon: ChefHat,
                    title: 'Cozinha acompanha sem ruído',
                    description: 'Pedidos seguem por status e ajudam a organizar o rush.',
                  },
                  {
                    icon: LayoutDashboard,
                    title: 'Gestão olha o dia no mesmo painel',
                    description: 'Caixa, indicadores e alertas ficam juntos para agir mais rápido.',
                  },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="lp-stack-card">
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#7dd3fc',
                        background: 'rgba(37,99,235,0.14)',
                        border: '1px solid rgba(96,165,250,0.18)',
                      }}
                    >
                      <Icon size={18} />
                    </span>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>{title}</div>
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.55, color: '#94a3b8' }}>{description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lp-stack">
              {[
                {
                  icon: Link2,
                  title: 'Cardápio online ativo',
                  description: 'Link e QR Code para retirada e delivery conectados à operação.',
                },
                {
                  icon: BellRing,
                  title: 'Central do rush',
                  description: '14 pedidos em preparo e 5 em entrega agora.',
                },
                {
                  icon: Sparkles,
                  title: 'FlowAI',
                  description: 'Alerta de reposição para o item house antes do pico da noite.',
                },
              ].map(({ icon: Icon, title, description }) => (
                <div key={title} className="lp-stack-card">
                  <span
                    style={{
                      width: 38,
                      height: 38,
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
                    <Icon size={17} />
                  </span>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc', marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: '0.77rem', lineHeight: 1.55, color: '#94a3b8' }}>{description}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="lp-section" style={{ paddingTop: 28 }} id="lp-destaques">
        <div className="lp-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 26 }}>
              <div className="lp-overline" style={{ marginBottom: 16 }}>
                O que sustenta a rotina
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
                O FlowPDV ajuda sua operação a <span className="lp-gradient-text">vender, produzir e acompanhar melhor</span>.
              </h2>
              <p style={{ maxWidth: 620, fontSize: '1rem', lineHeight: 1.7, color: '#94a3b8', margin: 0 }}>
                Blocos centrais do food service no mesmo sistema, sem empilhar soluções desconectadas na frente, na cozinha e no caixa.
              </p>
            </motion.div>

            <motion.div className="lp-proof-grid" variants={stagger}>
              {OPERATION_PILLARS.map(({ icon: Icon, title, description }) => (
                <motion.div
                  key={title}
                  variants={fadeUp}
                  className="lp-surface"
                  style={{ padding: 24 }}
                  whileHover={{ y: -4, borderColor: 'rgba(96,165,250,0.26)' }}
                >
                  <span
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#7dd3fc',
                      background: 'rgba(37,99,235,0.14)',
                      border: '1px solid rgba(96,165,250,0.18)',
                      marginBottom: 16,
                    }}
                  >
                    <Icon size={20} />
                  </span>
                  <div className="lp-font-display" style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 }}>
                    {title}
                  </div>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.65 }}>{description}</p>
                </motion.div>
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
              {FEATURES.map(({ icon: Icon, title, description, wide }) => (
                <motion.div
                  key={title}
                  variants={fadeUp}
                  className={`lp-surface ${wide ? 'lp-feature-wide' : ''}`}
                  style={{
                    padding: 24,
                    background: wide
                      ? 'linear-gradient(135deg, rgba(15,23,42,0.94) 0%, rgba(6,95,70,0.3) 100%)'
                      : undefined,
                  }}
                  whileHover={{ y: -4, borderColor: 'rgba(52,211,153,0.24)' }}
                >
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: wide ? '#86efac' : '#7dd3fc',
                      background: wide ? 'rgba(16,185,129,0.12)' : 'rgba(37,99,235,0.12)',
                      border: wide
                        ? '1px solid rgba(52,211,153,0.18)'
                        : '1px solid rgba(96,165,250,0.18)',
                      marginBottom: 16,
                    }}
                  >
                    <Icon size={20} />
                  </span>
                  <div className="lp-font-display" style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 }}>
                    {title}
                  </div>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.65 }}>{description}</p>
                </motion.div>
              ))}
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
            className="lp-surface"
            style={{ padding: 28 }}
          >
            <div className="lp-overline" style={{ marginBottom: 14 }}>
              Painel com alertas
            </div>
            <div className="lp-font-display" style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 }}>
              FlowAI no contexto da operação
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.7 }}>
              Alertas e leituras rápidas com base nos dados de estoque, vendas, caixa e rotina que já estão no sistema.
            </p>

            <div className="lp-alert-grid">
              {ALERTS.map(({ title, description }) => (
                <div key={title} className="lp-surface-soft" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#7dd3fc',
                        background: 'rgba(37,99,235,0.12)',
                        border: '1px solid rgba(96,165,250,0.16)',
                      }}
                    >
                      <BellRing size={17} />
                    </span>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>{title}</div>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.6 }}>{description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
