import React, { useEffect, useRef } from 'react';
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
  { icon: '🛒', name: 'PDV Completo',         span2: true,
    desc: 'Interface de venda rápida com busca de produtos, carrinho, desconto e múltiplas formas de pagamento — dinheiro, Pix, débito e crédito. Recibo automático ao finalizar. Funciona no computador, tablet e celular, sem instalar nada.' },
  { icon: '💰', name: 'Caixa & Financeiro',
    desc: 'Abertura e fechamento com fundo inicial, sangria e suprimento. Relatório do dia com total de vendas e lucro.' },
  { icon: '📦', name: 'Estoque Inteligente',
    desc: 'Baixa automática a cada venda. Alerta de ruptura quando o produto está acabando. Histórico completo.' },
  { icon: '📊', name: 'Dashboard & Relatórios',
    desc: 'Vendas do dia, ticket médio e produtos mais vendidos em tempo real. Gráficos por semana e mês.' },
  { icon: '📄', name: 'Recibo PDF & Térmica',
    desc: 'Impressão automática em impressoras 58/80mm. Exportação PDF e XML no padrão NF-e/NFS-e.' },
  { icon: '👥', name: 'Gestão de Equipe',
    desc: 'Cadastro com foto e cargo. Níveis: Dono, Gerente e Atendente. Permissões por tela configuráveis.' },
  { icon: '🔒', name: 'Permissões Granulares',
    desc: 'O dono define quem acessa cada módulo. Bloqueio imediato ao desativar um funcionário.' },
  { icon: '🕐', name: 'Logs do Sistema',
    desc: 'Registro completo de todas as ações: login, caixa e acesso a módulos sensíveis, com hora e usuário.' },
];

const DIFFERENTIALS: Differential[] = [
  { num: '01', title: 'Multi-segmento real',        desc: 'Cada tipo de negócio tem suas próprias telas e fluxos — não é só trocar o nome.' },
  { num: '02', title: 'Roda no navegador',           desc: 'Sem instalação, sem atualização manual. Acesse de computador, tablet ou celular.' },
  { num: '03', title: 'NF-e / NFS-e integrado',     desc: 'Exportação fiscal em XML sem precisar de outro sistema. Padrão brasileiro nativo.' },
  { num: '04', title: 'Dados isolados por cliente', desc: 'Cada estabelecimento tem seu ambiente separado. Segurança e privacidade garantidas.' },
  { num: '05', title: 'Preço acessível — SaaS BR',  desc: 'Desenvolvido pela RM Tecnologia para o mercado brasileiro. Suporte em português.' },
];

const AI_ALERTS: AIAlert[] = [
  { icon: '📉', text: 'Queda de 18% nas vendas às terças — reveja o cardápio ou promoções.' },
  { icon: '📦', text: 'Estoque de frango abaixo do mínimo para o fim de semana.' },
  { icon: '🕐', text: 'Pico de atendimento entre 19h e 21h — prepare a equipe.' },
  { icon: '🏆', text: 'Hambúrguer Artesanal é o item mais vendido este mês.' },
  { icon: '💳', text: '84% dos pagamentos via Pix — considere reduzir taxas de cartão.' },
  { icon: '🔁', text: '3 clientes com mais de 10 visitas este mês. Hora do programa de fidelidade!' },
];

/* ─── estilos (CSS-in-JS, sem dependências externas) ─────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

  .lp-root * { box-sizing: border-box; }
  .lp-root {
    font-family: 'DM Sans', system-ui, sans-serif;
    background: #080c14;
    color: #f0f4ff;
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
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 5%', background: 'rgba(8,12,20,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div className="lp-font-display" style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          Flow<span style={{ color: '#06b6d4' }}>PDV</span>
          <span style={{ fontSize: '0.62rem', fontFamily: 'DM Sans, sans-serif', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 4 }}>
            RM Tecnologia
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button onClick={goToLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#94a3b8', fontFamily: 'DM Sans, sans-serif' }}>
            Entrar
          </button>
          <button onClick={goToSolicitar} style={{
            background: 'linear-gradient(135deg,#3b82f6,#0ea5e9)', color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600,
            fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 4px 16px rgba(59,130,246,0.35)', transition: 'transform .15s',
          }}>
            Solicitar Acesso
          </button>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 120, paddingBottom: 80 }}>
        {/* glows */}
        <div style={{ position: 'absolute', top: -200, left: -100, width: 700, height: 700, background: 'radial-gradient(circle,rgba(59,130,246,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, right: -100, width: 500, height: 500, background: 'radial-gradient(circle,rgba(6,182,212,.09) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div className="lp-inner lp-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '4rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* LEFT */}
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 100, padding: '5px 14px 5px 5px', marginBottom: 24,
                fontSize: '0.78rem', color: '#93c5fd', letterSpacing: '0.04em', fontWeight: 500,
              }}>
                <span style={{ width: 20, height: 20, background: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', flexShrink: 0 }}>✦</span>
                Sistema PDV SaaS · RM Tecnologia
              </div>
            </motion.div>

            <motion.h1 variants={fadeUp} className="lp-font-display" style={{ fontSize: 'clamp(2.4rem,5vw,3.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '1.2rem' }}>
              Gerencie seu{' '}
              <span style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>negócio</span>
              <br/>com inteligência.
            </motion.h1>

            <motion.p variants={fadeUp} style={{ fontSize: '1.05rem', color: '#94a3b8', lineHeight: 1.7, maxWidth: 520, marginBottom: '1.75rem', fontWeight: 300 }}>
              O <strong style={{ color: '#f0f4ff', fontWeight: 500 }}>FlowPDV</strong> é o sistema de gestão para restaurantes, fast food, bares, pubs e adegas. <strong style={{ color: '#f0f4ff', fontWeight: 500 }}>Caixa, estoque, equipe e PDV</strong> — tudo em um lugar, direto no navegador.
            </motion.p>

            <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={goToSolicitar}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg,#3b82f6,#0ea5e9)', color: '#fff',
                  padding: '14px 28px', borderRadius: 10, fontSize: '0.95rem', fontWeight: 600,
                  border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(59,130,246,.35)',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                🚀 Solicitar Acesso Gratuito
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={goToLogin}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', color: '#94a3b8',
                  padding: '14px 22px', borderRadius: 10, fontSize: '0.95rem', fontWeight: 500,
                  border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                Já tenho acesso →
              </motion.button>
            </motion.div>

            <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
              {['✓ 7 dias grátis','✓ Sem cartão','✓ Sem instalação','✓ Funciona no celular'].map(t => (
                <span key={t} style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>{t}</span>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — dashboard mock */}
          <motion.div className="lp-hero-card" initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.22,1,0.36,1] }}
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#3b82f6,#06b6d4)' }} />
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span className="lp-font-display" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Dashboard</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#10b981', fontWeight: 500 }}>
                <span className="lp-live-dot" style={{ width: 7, height: 7, background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />Ao vivo
              </span>
            </div>
            {/* stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label:'Vendas hoje',   val:'R$ 3.840', color:'#10b981', change:'▲ +12% vs ontem' },
                { label:'Ticket médio',  val:'R$ 48,20', color:'#60a5fa', change:'▲ +5% este mês'  },
                { label:'Pedidos',       val:'79',        color:'#f0f4ff', change:'Hoje'            },
                { label:'Caixa',         val:'Aberto',    color:'#10b981', change:'Desde 08:00'    },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div className="lp-font-display" style={{ fontSize: '1.35rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: '0.68rem', color: '#10b981', marginTop: 2 }}>{s.change}</div>
                </div>
              ))}
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '16px 0' }} />
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 10 }}>Últimas vendas</div>
            {[
              { name:'Mesa 04 — Combo',        tag:'Crédito', val:'R$ 96,00' },
              { name:'Balcão — Corte + Barba', tag:'Pix',     val:'R$ 65,00' },
              { name:'Comanda 12 — Cervejas',  tag:'Dinheiro',val:'R$ 48,00' },
            ].map(r => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                <span style={{ color: '#94a3b8' }}>{r.name}</span>
                <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(6,182,212,0.12)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.2)', marginLeft: 8 }}>{r.tag}</span>
                <span style={{ color: '#f0f4ff', fontWeight: 500, marginLeft: 8 }}>{r.val}</span>
              </div>
            ))}
            <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16 }}>
              <div style={{ width: 28, height: 28, background: 'rgba(59,130,246,0.2)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', flexShrink: 0 }}>🤖</div>
              <div style={{ fontSize: '0.78rem', color: '#93c5fd', lineHeight: 1.5 }}><strong style={{ color: '#bfdbfe' }}>FlowAI:</strong> Estoque de limão abaixo do mínimo. Pico de vendas previsto às 19h.</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── SEGMENTOS ────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: '#0d1220', borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="lp-inner">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#06b6d4', marginBottom: 16 }}>
                <span style={{ display: 'block', width: 20, height: 1, background: '#06b6d4' }} />Segmentos
              </div>
              <h2 className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
                Um sistema feito para o{' '}
                <span style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>seu negócio</span>
              </h2>
              <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: 560, lineHeight: 1.7, fontWeight: 300, marginBottom: '2.5rem' }}>
                Cada operação de alimentação e bebidas tem telas, fluxos e terminologia próprios. Não é só trocar o nome — o sistema respeita a rotina de cada casa.
              </p>
            </motion.div>
            <motion.div className="lp-seg-grid" variants={stagger} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {SEGMENTS.map(s => (
                <motion.div key={s.label} variants={fadeUp}
                  style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 18px', transition: 'border-color .25s, transform .2s', cursor: 'default' }}
                  whileHover={{ borderColor: 'rgba(99,179,255,0.3)', y: -3 }}>
                  <span style={{ fontSize: '1.75rem', marginBottom: 10, display: 'block' }}>{s.icon}</span>
                  <div className="lp-font-display" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f0f4ff', marginBottom: 6 }}>{s.label}</div>
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#06b6d4', marginBottom: 16 }}>
                <span style={{ display: 'block', width: 20, height: 1, background: '#06b6d4' }} />Funcionalidades
              </div>
              <h2 className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
                Tudo que seu negócio{' '}
                <span style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>precisa, em um lugar</span>
              </h2>
              <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: 560, lineHeight: 1.7, fontWeight: 300, marginBottom: '2.5rem' }}>
                PDV, caixa, estoque, equipe e relatórios — integrados e funcionando em tempo real, sem instalar nada.
              </p>
            </motion.div>
            <motion.div className="lp-feat-grid" variants={stagger} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
              {FEATURES.map(f => (
                <motion.div key={f.name} variants={fadeUp}
                  className={f.span2 ? 'lp-feat-span2' : ''}
                  style={{
                    gridColumn: f.span2 ? 'span 2' : 'span 1',
                    background: f.span2 ? 'linear-gradient(135deg,rgba(59,130,246,0.08),rgba(6,182,212,0.05))' : '#111827',
                    border: f.span2 ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14, padding: '26px 22px',
                  }}
                  whileHover={{ borderColor: 'rgba(255,255,255,0.14)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: 14, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    {f.icon}
                  </div>
                  <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f4ff', marginBottom: 8 }}>{f.name}</div>
                  <div style={{ fontSize: '0.84rem', color: '#64748b', lineHeight: 1.6 }}>{f.desc}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── DIFERENCIAIS ─────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: '#0d1220', borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="lp-inner lp-diff-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3.5rem', alignItems: 'center' }}>
          {/* left */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#06b6d4', marginBottom: 16 }}>
                <span style={{ display: 'block', width: 20, height: 1, background: '#06b6d4' }} />Diferenciais
              </div>
              <h2 className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
                Por que escolher o{' '}
                <span style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>FlowPDV</span>?
              </h2>
              <p style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.7, fontWeight: 300, marginBottom: '2rem' }}>
                Feito para o mercado brasileiro, com funcionalidades que sistemas genéricos não têm.
              </p>
            </motion.div>
            <motion.ul variants={stagger} style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {DIFFERENTIALS.map(d => (
                <motion.li key={d.num} variants={fadeUp} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div className="lp-font-display" style={{ fontWeight: 700, fontSize: '0.7rem', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    {d.num}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.92rem', fontWeight: 600, color: '#f0f4ff', marginBottom: 3 }}>{d.title}</strong>
                    <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.55 }}>{d.desc}</span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          {/* right — FlowAI card */}
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, ease: [0.22,1,0.36,1] }}
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#06b6d4,#3b82f6)' }} />
            <div className="lp-font-display" style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>🤖 FlowAI</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 20 }}>Inteligência artificial analisando seu negócio em tempo real — 12 regras adaptadas por segmento</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {AI_ALERTS.map(a => (
                <motion.div key={a.icon} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '11px 14px', fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                  whileHover={{ borderColor: 'rgba(59,130,246,0.25)' }}>
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
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 800, height: 400, background: 'radial-gradient(ellipse,rgba(59,130,246,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <motion.div className="lp-inner" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} style={{ maxWidth: 680, position: 'relative', zIndex: 1 }}>
          <motion.div variants={fadeUp}>
            <span style={{ display: 'inline-block', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 100, padding: '6px 16px', fontSize: '0.78rem', color: '#6ee7b7', fontWeight: 500, letterSpacing: '0.05em', marginBottom: 20 }}>
              ✦ 7 dias grátis · sem cartão · sem complicação
            </span>
          </motion.div>
          <motion.h2 variants={fadeUp} className="lp-font-display" style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: '0.75rem' }}>
            Pronto para organizar seu{' '}
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>negócio de vez</span>?
          </motion.h2>
          <motion.p variants={fadeUp} style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.7, fontWeight: 300, marginBottom: '1.75rem' }}>
            Solicite seu acesso agora e comece a usar o FlowPDV em minutos. Seu caixa, seu estoque, sua equipe — na palma da mão.
          </motion.p>
          <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
              onClick={goToSolicitar}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: 'linear-gradient(135deg,#3b82f6,#0ea5e9)', color: '#fff',
                padding: '15px 36px', borderRadius: 12, fontSize: '1rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', boxShadow: '0 4px 24px rgba(59,130,246,.4)',
                fontFamily: 'DM Sans, sans-serif',
              }}>
              🚀 Solicitar Acesso Gratuito
            </motion.button>
          </motion.div>
          <motion.p variants={fadeUp} style={{ fontSize: '0.78rem', color: '#475569', marginTop: '1.2rem' }}>
            Após o trial, planos mensais acessíveis. Fale com a RM Tecnologia.
          </motion.p>
        </motion.div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '28px 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <div className="lp-font-display" style={{ fontSize: '1rem', fontWeight: 800, color: '#f0f4ff' }}>
          Flow<span style={{ color: '#06b6d4' }}>PDV</span>
        </div>
        <span style={{ fontSize: '0.78rem', color: '#475569' }}>© {new Date().getFullYear()} RM Tecnologia · Todos os direitos reservados.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href={WA_LINK} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#4ade80', textDecoration: 'none', fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.552 4.197 1.602 6.023L0 24l6.135-1.61A11.793 11.793 0 0012.05 24c6.634 0 12.048-5.414 12.048-12.05a11.77 11.77 0 00-3.535-8.525z"/></svg>
            Falar com Consultor
          </a>
          <button onClick={goToSolicitar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#3b82f6', fontFamily: 'DM Sans, sans-serif' }}>
            Solicitar Acesso →
          </button>
        </div>
      </footer>
    </div>
  );
}
