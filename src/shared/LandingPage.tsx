import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { ACTIVE_SEGMENT_OPTIONS } from '../config/segmentos';

const WA_NUMBER = '5500000000000'; // ← substitua pelo número real
const WA_LINK   = `https://wa.me/${WA_NUMBER}?text=Olá!%20Tenho%20interesse%20no%20FlowPDV`;

/* ─── tipos internos ─────────────────────────────────────────────── */
interface Segment { icon: string; label: string; available: boolean; }
interface Feature { icon: string; name: string; desc: string; span2?: boolean; }
interface Differential { num: string; title: string; desc: string; }
interface AIAlert { icon: string; text: string; }

/* ─── dados ──────────────────────────────────────────────────────── */
const SEGMENTS: Segment[] = ACTIVE_SEGMENT_OPTIONS.map((segment) => ({
  icon: segment.icon,
  label: segment.label,
  available: true,
}));

const FEATURES: Feature[] = [
  { icon: '🛒', name: 'PDV de balcão & mesa', span2: true,
    desc: 'Venda rápida para balcão, mesas e retirada com busca, carrinho, descontos e recebimento em Pix, cartão e dinheiro.' },
  { icon: '📱', name: 'Cardápio online & delivery',
    desc: 'Cardápio online com link e QR Code para delivery e retirada, com pedidos caindo direto na operação.' },
  { icon: '👨‍🍳', name: 'Pedidos, KDS e central',
    desc: 'Fila de produção, status em tempo real e quadro de pedidos para não perder nada no rush.' },
  { icon: '💰', name: 'Caixa & financeiro',
    desc: 'Abertura e fechamento, sangria e suprimento, visão do dia e integração com a rotina do caixa.' },
  { icon: '📦', name: 'Estoque & insumos',
    desc: 'Baixa na venda, mínimos, movimentações e controle alinhado ao cardápio e à cozinha.' },
  { icon: '📊', name: 'Dashboard & relatórios',
    desc: 'Vendas, ticket médio, itens fortes e tendências — leitura rápida para decisão no dia a dia.' },
  { icon: '🤖', name: 'FlowAI & alertas',
    desc: 'Avisos inteligentes sobre estoque, vendas e operação; central de notificações no painel.' },
];

const DIFFERENTIALS: Differential[] = [
  { num: '01', title: 'Feito para food service', desc: 'Fluxos pensados para restaurante, hamburgueria, lanchonete, bar e adega, sem cara de varejo genérico.' },
  { num: '02', title: 'PDV, cozinha e delivery juntos', desc: 'O pedido do balcão, da mesa ou do cardápio online segue no mesmo fluxo até a produção e o caixa.' },
  { num: '03', title: 'Operação pronta para o rush', desc: 'Central de pedidos, KDS, mesas, retirada e delivery organizados para acompanhar picos com mais controle.' },
  { num: '04', title: 'Configuração por segmento', desc: 'Os blocos e a linguagem acompanham a operação de cada casa, de restaurante a adega.' },
  { num: '05', title: 'RM Tecnologia, suporte BR', desc: 'Produto e atendimento em português, focados na rotina de operações brasileiras de food service.' },
];

const AI_ALERTS: AIAlert[] = [
  { icon: '📉', text: 'Queda nas vendas de terça — vale revisar cardápio ou promoção do dia.' },
  { icon: '📦', text: 'Insumo abaixo do mínimo para o pico do fim de semana.' },
  { icon: '🕐', text: 'Pico entre 19h e 21h — escala e estoque de bebida alinhados?' },
  { icon: '🏆', text: 'Combo house lidera o mês — destaque no cardápio online.' },
  { icon: '💳', text: 'Alta concentração em Pix — boa hora de negociar taxas de cartão.' },
  { icon: '🔁', text: 'Clientes recorrentes no delivery — considere cupom ou clube.' },
];

/* ─── estilos (CSS-in-JS, sem dependências externas) ─────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

  .lp-root * { box-sizing: border-box; }
  .lp-root {
    font-family: 'DM Sans', system-ui, sans-serif;
    background: #09090b;
    color: #fafafa;
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
  }
  .lp-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
    opacity: 0.35;
  }
  .lp-font-display { font-family: 'Syne', system-ui, sans-serif; }

  /* live dot */
  @keyframes lp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
  .lp-live-dot { animation: lp-pulse 2s infinite; }

  /* shimmer button */
  @keyframes lp-shimmer { from{background-position-x:200%} to{background-position-x:-200%} }
  .lp-shimmer { animation: lp-shimmer 2.5s linear infinite; }

  /* scroll reveal handled by framer-motion */
  .lp-section { padding: 100px 5%; position: relative; z-index: 1; }
  .lp-inner { max-width: 1200px; margin: 0 auto; }

  @media (max-width: 960px) {
    .lp-hero-grid { grid-template-columns: 1fr !important; }
    .lp-hero-card { display: none !important; }
    .lp-feat-span2 { grid-column: span 2 !important; }
    .lp-diff-grid  { grid-template-columns: 1fr !important; }
    .lp-section { padding: 72px 5%; }
  }
  @media (max-width: 600px) {
    .lp-feat-grid { grid-template-columns: 1fr !important; }
    .lp-feat-span2 { grid-column: span 1 !important; }
    .lp-seg-grid  { grid-template-columns: 1fr 1fr !important; }
    .lp-section { padding: 56px 5%; }
  }
  @media (max-width: 720px) {
    .lp-nav {
      height: auto !important;
      padding: 12px 5% !important;
      align-items: flex-start !important;
      flex-wrap: wrap;
      gap: 12px;
    }
    .lp-nav-brand {
      flex: 1 1 auto;
      min-width: 0;
      align-items: flex-start !important;
      flex-wrap: wrap;
      gap: 8px !important;
    }
    .lp-nav-brand-main {
      font-size: 1.05rem !important;
    }
    .lp-nav-badge {
      font-size: 0.56rem !important;
      padding: 3px 6px !important;
    }
    .lp-nav-actions {
      width: 100%;
      justify-content: space-between;
      gap: 10px !important;
    }
    .lp-nav-link {
      font-size: 0.82rem !important;
    }
    .lp-nav-cta {
      padding: 8px 14px !important;
      font-size: 0.82rem !important;
    }
  }
`;

/* ─── componente principal ───────────────────────────────────────── */
export default function LandingPage({
  onShowSolicitacao,
}: {
  onShowSolicitacao: () => void;
}) {
  /* injeta CSS uma única vez */
  useEffect(() => {
    const id = 'flowpdv-lp-css';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  const goToLogin     = () => { window.location.href = '/login'; };
  const goToSolicitar = onShowSolicitacao;

  /* framer variants */
  const fadeUp = {
    hidden:  { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  };
  const stagger = { visible: { transition: { staggerChildren: 0.07 } } };

  return (
    <div className="lp-root">
      {/* ── NAV ─────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 5%', background: 'rgba(9,9,11,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div className="lp-nav-brand lp-font-display" style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="lp-nav-brand-main">
            Flow<span style={{ background: 'linear-gradient(135deg,#34d399,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>PDV</span>
          </div>
          <span className="lp-nav-badge" style={{ fontSize: '0.62rem', fontFamily: 'DM Sans, sans-serif', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#71717a', border: '1px solid rgba(63,63,70,0.9)', padding: '3px 8px', borderRadius: 4 }}>
            RM Tecnologia
          </span>
        </div>
        <div className="lp-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="lp-nav-link" onClick={goToLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#a1a1aa', fontFamily: 'DM Sans, sans-serif' }}>
            Entrar
          </button>
          <button className="lp-nav-cta" onClick={goToSolicitar} style={{
            background: 'linear-gradient(135deg,#2563eb,#059669)', color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600,
            fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 4px 20px rgba(37,99,235,0.35)', transition: 'transform .15s',
          }}>
            Solicitar acesso
          </button>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 120, paddingBottom: 80 }}>
        {/* glows */}
        <div style={{ position: 'absolute', top: -200, left: -100, width: 700, height: 700, background: 'radial-gradient(circle,rgba(37,99,235,.14) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, right: -100, width: 500, height: 500, background: 'radial-gradient(circle,rgba(16,185,129,.1) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div className="lp-inner lp-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '4rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* LEFT */}
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(52,211,153,0.28)',
                borderRadius: 100, padding: '5px 14px 5px 5px', marginBottom: 24,
                fontSize: '0.78rem', color: '#6ee7b7', letterSpacing: '0.04em', fontWeight: 500,
              }}>
                <span style={{ width: 20, height: 20, background: 'linear-gradient(135deg,#059669,#2563eb)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', flexShrink: 0 }}>✦</span>
                Software para food service no Brasil
              </div>
            </motion.div>

            <motion.h1 variants={fadeUp} className="lp-font-display" style={{ fontSize: 'clamp(2.4rem,5vw,3.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '1.2rem' }}>
              PDV, cozinha e{' '}
              <span style={{ background: 'linear-gradient(135deg,#34d399,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>delivery</span>
              <br/>no mesmo sistema.
            </motion.h1>

            <motion.p variants={fadeUp} style={{ fontSize: '1.05rem', color: '#a1a1aa', lineHeight: 1.7, maxWidth: 540, marginBottom: '1.75rem', fontWeight: 300 }}>
              <strong style={{ color: '#fafafa', fontWeight: 500 }}>FlowPDV</strong> ajuda restaurantes, hamburguerias, lanchonetes, bares e adegas a vender e operar melhor com <strong style={{ color: '#fafafa', fontWeight: 500 }}>PDV, pedidos, delivery, cardápio online com link e QR Code, cozinha/KDS, mesas e estoque</strong> no mesmo sistema.
            </motion.p>

            <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={goToSolicitar}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg,#2563eb,#059669)', color: '#fff',
                  padding: '14px 28px', borderRadius: 10, fontSize: '0.95rem', fontWeight: 600,
                  border: 'none', cursor: 'pointer', boxShadow: '0 4px 24px rgba(37,99,235,.38)',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                Solicitar acesso grátis
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={goToLogin}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', color: '#a1a1aa',
                  padding: '14px 22px', borderRadius: 10, fontSize: '0.95rem', fontWeight: 500,
                  border: '1px solid rgba(63,63,70,0.85)', cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                Já tenho acesso →
              </motion.button>
            </motion.div>

            <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
              {['✓ 7 dias grátis','✓ Sem cartão','✓ Link e QR Code','✓ Tablet e celular'].map(t => (
                <span key={t} style={{ fontSize: '0.8rem', color: '#71717a', display: 'flex', alignItems: 'center', gap: 5 }}>{t}</span>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — dashboard mock */}
          <motion.div className="lp-hero-card" initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.22,1,0.36,1] }}
            style={{ background: '#18181b', border: '1px solid rgba(39,39,42,0.95)', borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#2563eb,#10b981)' }} />
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span className="lp-font-display" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#71717a' }}>Dashboard</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#10b981', fontWeight: 500 }}>
                <span className="lp-live-dot" style={{ width: 7, height: 7, background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />Ao vivo
              </span>
            </div>
            {/* stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label:'Vendas hoje',   val:'R$ 3.840', color:'#10b981', change:'▲ +12% vs ontem' },
                { label:'Ticket médio',  val:'R$ 48,20', color:'#60a5fa', change:'▲ +5% este mês'  },
                { label:'Pedidos',       val:'79',        color:'#fafafa', change:'Hoje'            },
                { label:'Caixa',         val:'Aberto',    color:'#10b981', change:'Desde 08:00'    },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(39,39,42,0.9)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div className="lp-font-display" style={{ fontSize: '1.35rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: '0.68rem', color: '#10b981', marginTop: 2 }}>{s.change}</div>
                </div>
              ))}
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid rgba(39,39,42,0.95)', margin: '16px 0' }} />
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#71717a', marginBottom: 10 }}>Últimas vendas</div>
            {[
              { name:'Delivery #1842 — Combo', tag:'Pix',      val:'R$ 62,00' },
              { name:'Balcão — Smash duplo',   tag:'Débito',   val:'R$ 44,90' },
              { name:'Mesa 08 — Chopp + porção', tag:'Crédito', val:'R$ 58,00' },
            ].map(r => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(39,39,42,0.7)', fontSize: '0.8rem' }}>
                <span style={{ color: '#a1a1aa' }}>{r.name}</span>
                <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.22)', marginLeft: 8 }}>{r.tag}</span>
                <span style={{ color: '#fafafa', fontWeight: 500, marginLeft: 8 }}>{r.val}</span>
              </div>
            ))}
            <div style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16 }}>
              <div style={{ width: 28, height: 28, background: 'rgba(16,185,129,0.15)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', flexShrink: 0 }}>🤖</div>
              <div style={{ fontSize: '0.78rem', color: '#93c5fd', lineHeight: 1.5 }}><strong style={{ color: '#a5b4fc' }}>FlowAI:</strong> Chopp retornável perto do mínimo. Pico entre 19h–21h — reforçar caixa.</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── SEGMENTOS ────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: '#0c0c0f', borderTop: '1px solid rgba(39,39,42,0.85)', borderBottom: '1px solid rgba(39,39,42,0.85)' }}>
        <div className="lp-inner">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34d399', marginBottom: 16 }}>
                <span style={{ display: 'block', width: 20, height: 1, background: '#34d399' }} />Segmentos atendidos
              </div>
              <h2 className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
                Do balcão à adega,{' '}
                <span style={{ background: 'linear-gradient(135deg,#34d399,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>no mesmo produto</span>
              </h2>
              <p style={{ fontSize: '1rem', color: '#a1a1aa', maxWidth: 560, lineHeight: 1.7, fontWeight: 300, marginBottom: '2.5rem' }}>
                PDV, cozinha, delivery e estoque falam a língua do seu segmento, com mesas quando faz sentido, adega com foco em bebidas e fast food no ritmo do balcão.
              </p>
            </motion.div>
            <motion.div className="lp-seg-grid" variants={stagger} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {SEGMENTS.map(s => (
                <motion.div key={s.label} variants={fadeUp}
                  style={{ background: '#18181b', border: '1px solid rgba(39,39,42,0.95)', borderRadius: 14, padding: '22px 18px', transition: 'border-color .25s, transform .2s', cursor: 'default' }}
                  whileHover={{ borderColor: 'rgba(52,211,153,0.35)', y: -3 }}>
                  <span style={{ fontSize: '1.75rem', marginBottom: 10, display: 'block' }}>{s.icon}</span>
                  <div className="lp-font-display" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fafafa', marginBottom: 6 }}>{s.label}</div>
                  <span style={{
                    display: 'inline-block', marginTop: 8, fontSize: '0.63rem', padding: '2px 8px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                    ...(s.available
                      ? { background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.2)' }
                      : { background: 'rgba(234,179,8,0.10)', color: '#fde68a',  border: '1px solid rgba(234,179,8,0.2)'  }),
                  }}>
                    {s.available ? 'Disponível' : 'Em breve'}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FUNCIONALIDADES ──────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-inner">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34d399', marginBottom: 16 }}>
                <span style={{ display: 'block', width: 20, height: 1, background: '#34d399' }} />Funcionalidades
              </div>
              <h2 className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
                Da cozinha ao caixa,{' '}
                <span style={{ background: 'linear-gradient(135deg,#34d399,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>sem lacunas</span>
              </h2>
              <p style={{ fontSize: '1rem', color: '#a1a1aa', maxWidth: 580, lineHeight: 1.7, fontWeight: 300, marginBottom: '2.5rem' }}>
                Os blocos centrais da operação: PDV, cardápio online, KDS, pedidos, caixa, estoque e relatórios para o dia a dia do food service.
              </p>
            </motion.div>
            <motion.div className="lp-feat-grid" variants={stagger} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
              {FEATURES.map(f => (
                <motion.div key={f.name} variants={fadeUp}
                  className={f.span2 ? 'lp-feat-span2' : ''}
                  style={{
                    gridColumn: f.span2 ? 'span 2' : 'span 1',
                    background: f.span2 ? 'linear-gradient(135deg,rgba(37,99,235,0.1),rgba(16,185,129,0.06))' : '#18181b',
                    border: f.span2 ? '1px solid rgba(59,130,246,0.28)' : '1px solid rgba(39,39,42,0.95)',
                    borderRadius: 14, padding: '26px 22px',
                  }}
                  whileHover={{ borderColor: 'rgba(63,63,70,0.95)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: 14, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(52,211,153,0.22)' }}>
                    {f.icon}
                  </div>
                  <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>{f.name}</div>
                  <div style={{ fontSize: '0.84rem', color: '#a1a1aa', lineHeight: 1.6 }}>{f.desc}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── DIFERENCIAIS ─────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: '#0c0c0f', borderTop: '1px solid rgba(39,39,42,0.85)', borderBottom: '1px solid rgba(39,39,42,0.85)' }}>
        <div className="lp-inner lp-diff-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3.5rem', alignItems: 'center' }}>
          {/* left */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34d399', marginBottom: 16 }}>
                <span style={{ display: 'block', width: 20, height: 1, background: '#34d399' }} />Diferenciais
              </div>
              <h2 className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
                Por que escolher o{' '}
                <span style={{ background: 'linear-gradient(135deg,#34d399,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>FlowPDV</span>?
              </h2>
              <p style={{ fontSize: '1rem', color: '#a1a1aa', lineHeight: 1.7, fontWeight: 300, marginBottom: '2rem' }}>
                Especialização em food service e bebidas, com fluxo pensado para a operação brasileira.
              </p>
            </motion.div>
            <motion.ul variants={stagger} style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {DIFFERENTIALS.map(d => (
                <motion.li key={d.num} variants={fadeUp} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div className="lp-font-display" style={{ fontWeight: 700, fontSize: '0.7rem', color: '#34d399', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(52,211,153,0.25)', width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    {d.num}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.92rem', fontWeight: 600, color: '#fafafa', marginBottom: 3 }}>{d.title}</strong>
                    <span style={{ fontSize: '0.82rem', color: '#a1a1aa', lineHeight: 1.55 }}>{d.desc}</span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          {/* right — FlowAI card */}
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, ease: [0.22,1,0.36,1] }}
            style={{ background: '#18181b', border: '1px solid rgba(39,39,42,0.95)', borderRadius: 20, padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#10b981,#2563eb)' }} />
            <div className="lp-font-display" style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>🤖 FlowAI</div>
            <div style={{ fontSize: '0.82rem', color: '#a1a1aa', marginBottom: 20 }}>Alertas e insights a partir dos seus dados de estoque, vendas, caixa e rotina da operação, com avisos na central do sistema.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {AI_ALERTS.map((a, i) => (
                <motion.div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(39,39,42,0.9)', borderRadius: 10, padding: '11px 14px', fontSize: '0.8rem', color: '#a1a1aa', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                  whileHover={{ borderColor: 'rgba(59,130,246,0.28)' }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>{a.icon}</span>
                  {a.text}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────────────── */}
      <section className="lp-section" style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 800, height: 400, background: 'radial-gradient(ellipse,rgba(37,99,235,.12) 0%,rgba(16,185,129,.06) 45%,transparent 70%)', pointerEvents: 'none' }} />
        <motion.div className="lp-inner" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} style={{ maxWidth: 700, position: 'relative', zIndex: 1 }}>
          <motion.div variants={fadeUp}>
            <span style={{ display: 'inline-block', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(52,211,153,0.28)', borderRadius: 100, padding: '6px 16px', fontSize: '0.78rem', color: '#6ee7b7', fontWeight: 500, letterSpacing: '0.05em', marginBottom: 20 }}>
              ✦ 7 dias grátis · sem cartão · implantação acompanhada
            </span>
          </motion.div>
          <motion.h2 variants={fadeUp} className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
            Pronto para{' '}
            <span style={{ background: 'linear-gradient(135deg,#34d399,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>organizar o food service da sua operação</span>?
          </motion.h2>
          <motion.p variants={fadeUp} style={{ fontSize: '1rem', color: '#a1a1aa', lineHeight: 1.7, fontWeight: 300, marginBottom: '1.75rem' }}>
            Teste o FlowPDV na sua operação de food service. PDV, cardápio online, cozinha, delivery e estoque no mesmo sistema.
          </motion.p>
          <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
              onClick={goToSolicitar}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: 'linear-gradient(135deg,#2563eb,#059669)', color: '#fff',
                padding: '15px 36px', borderRadius: 12, fontSize: '1rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', boxShadow: '0 4px 28px rgba(37,99,235,.42)',
                fontFamily: 'DM Sans, sans-serif',
              }}>
              Solicitar acesso para food service
            </motion.button>
          </motion.div>
          <motion.p variants={fadeUp} style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '1.2rem' }}>
            Após o trial, planos mensais. RM Tecnologia acompanha sua implantação.
          </motion.p>
        </motion.div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(39,39,42,0.85)', padding: '28px 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 800, color: '#fafafa' }}>
          Flow<span style={{ background: 'linear-gradient(135deg,#34d399,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>PDV</span>
        </div>
        <span style={{ fontSize: '0.78rem', color: '#71717a' }}>© {new Date().getFullYear()} RM Tecnologia · Todos os direitos reservados.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <a
            href="/privacidade"
            style={{ fontSize: '0.78rem', color: '#a1a1aa', textDecoration: 'none', fontWeight: 500 }}
          >
            Privacidade
          </a>
          <span style={{ color: '#3f3f46' }} aria-hidden>·</span>
          <a
            href="/termos"
            style={{ fontSize: '0.78rem', color: '#a1a1aa', textDecoration: 'none', fontWeight: 500 }}
          >
            Termos de uso
          </a>
          <span style={{ color: '#3f3f46' }} aria-hidden>·</span>
          <a href={WA_LINK} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#4ade80', textDecoration: 'none', fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.552 4.197 1.602 6.023L0 24l6.135-1.61A11.793 11.793 0 0012.05 24c6.634 0 12.048-5.414 12.048-12.05a11.77 11.77 0 00-3.535-8.525z"/></svg>
            Falar com Consultor
          </a>
          <button onClick={goToSolicitar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#60a5fa', fontFamily: 'DM Sans, sans-serif' }}>
            Solicitar acesso →
          </button>
        </div>
      </footer>
    </div>
  );
}
