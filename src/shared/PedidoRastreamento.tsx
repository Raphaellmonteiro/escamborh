/**
 * PedidoRastreamento.tsx
 * Rota pública: /delivery/:slug/pedido/:id
 * O cliente vê o status em tempo real: Recebido → Em preparo → Saiu → Entregue
 * Sem login. Polling a cada 5s.
 */
import React, { useEffect, useState, useRef } from 'react';

interface PedidoData {
  id: number;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  cliente_nome?: string;
  endereco?: string;
  pagamento_tipo?: string;
  pagamento_status?: string;
  taxa_entrega?: number;
  saiu_entrega_at?: string;
  entregue_at?: string;
  resumo_itens?: string;
  estabelecimento: string;
}

// Pipeline de status (ordem dos passos)
const STEPS = [
  { key: 'Criado',              label: 'Recebido',         emoji: '🧾', desc: 'Seu pedido foi recebido pelo restaurante.' },
  { key: 'Em Preparo',          label: 'Em preparo',       emoji: '👨‍🍳', desc: 'A cozinha está preparando seu pedido.' },
  { key: 'Pronto para Entrega', label: 'Pronto',           emoji: '📦', desc: 'Pedido pronto! Aguardando motoboy.' },
  { key: 'Saiu para Entrega',   label: 'Saiu para entrega',emoji: '🛵', desc: 'Seu pedido está a caminho!' },
  { key: 'Entregue',            label: 'Entregue',         emoji: '✅', desc: 'Pedido entregue. Bom apetite!' },
];

// Aliases legacy
const ALIAS: Record<string, string> = {
  'Pedido Recebido': 'Criado',
};

function normalizeStatus(s: string): string {
  return ALIAS[s] ?? s;
}

function getCurrentStepIndex(status: string): number {
  const norm = normalizeStatus(status);
  const idx  = STEPS.findIndex(s => s.key === norm);
  return idx >= 0 ? idx : 0;
}

function fmtHora(d?: string | null): string {
  if (!d) return '';
  try {
    const date = new Date(d.includes('T') ? d : d.replace(' ', 'T'));
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

const fmt = (v: number) => `R$ ${(v||0).toFixed(2).replace('.', ',')}`;

interface Props {
  slug: string;
  pedidoId: number;
}

export default function PedidoRastreamento({ slug, pedidoId }: Props) {
  const [pedido, setPedido]     = useState<PedidoData | null>(null);
  const [error, setError]       = useState(false);
  const [lastTick, setLastTick] = useState(0);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef           = useRef<string | null>(null);

  const fetchPedido = async () => {
    try {
      const res = await fetch(`/public/delivery/${slug}/pedido/${pedidoId}`);
      if (!res.ok) { setError(true); return; }
      const data: PedidoData = await res.json();
      setPedido(data);
      setError(false);
      prevStatusRef.current = data.status;
    } catch { setError(true); }
  };

  useEffect(() => {
    fetchPedido();
    intervalRef.current = setInterval(() => {
      fetchPedido();
      setLastTick(t => t + 1);
    }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [slug, pedidoId]);

  // Relógio vivo
  const [hora, setHora] = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(id);
  }, []);

  if (error && !pedido) return (
    <div style={s.root}>
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>Pedido não encontrado</p>
        <p style={{ color: '#64748b', marginTop: 8, fontSize: 14 }}>Verifique o número do pedido.</p>
        <a href={`/delivery/${slug}`} style={{ display:'inline-block', marginTop:24, padding:'12px 28px', background:'#06b6d4', color:'#fff', borderRadius:12, fontWeight:700, textDecoration:'none' }}>
          Fazer novo pedido
        </a>
      </div>
    </div>
  );

  if (!pedido) return (
    <div style={s.root}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
        <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid #1e293b', borderTopColor:'#06b6d4', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  const stepIdx    = getCurrentStepIndex(pedido.status);
  const isCancelado = pedido.status === 'Cancelado';
  const isEntregue  = pedido.status === 'Entregue';
  const step        = STEPS[stepIdx];

  return (
    <div style={s.root}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>
          Flow<span style={{ color: '#06b6d4' }}>PDV</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{pedido.estabelecimento}</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{hora}</div>
        </div>
      </header>

      <div style={s.content}>

        {/* Card principal */}
        <div style={{ ...s.card, animation: 'slideUp 0.4s ease' }}>

          {/* Número do pedido */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Acompanhe seu pedido
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#f0f4ff', letterSpacing: '-0.02em' }}>
              #{pedido.order_number}
            </div>
            {pedido.cliente_nome && (
              <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>Olá, {pedido.cliente_nome.split(' ')[0]}! 👋</div>
            )}
          </div>

          {/* Status atual em destaque */}
          {isCancelado ? (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '20px', textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 40 }}>❌</div>
              <div style={{ color: '#f87171', fontWeight: 900, fontSize: 20, marginTop: 8 }}>Pedido Cancelado</div>
              <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 6 }}>Entre em contato com o restaurante.</div>
            </div>
          ) : (
            <div style={{
              background: isEntregue ? 'rgba(52,211,153,0.1)' : 'rgba(6,182,212,0.08)',
              border: `1px solid ${isEntregue ? 'rgba(52,211,153,0.3)' : 'rgba(6,182,212,0.2)'}`,
              borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 24,
            }}>
              <div style={{ fontSize: 48, marginBottom: 10, animation: isEntregue ? 'none' : 'pulse 2s infinite' }}>
                {step.emoji}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: isEntregue ? '#34d399' : '#06b6d4', marginBottom: 6 }}>
                {step.label}
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8' }}>{step.desc}</div>
            </div>
          )}

          {/* Timeline de progresso */}
          {!isCancelado && (
            <div style={{ marginBottom: 28 }}>
              {STEPS.map((st, i) => {
                const done    = i < stepIdx;
                const current = i === stepIdx;
                const future  = i > stepIdx;
                return (
                  <div key={st.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: i < STEPS.length - 1 ? 0 : 0 }}>
                    {/* Coluna esquerda: bolinha + linha */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: done ? 14 : 16,
                        background: done ? '#34d399' : current ? '#06b6d4' : 'rgba(255,255,255,0.06)',
                        border: `2px solid ${done ? '#34d399' : current ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
                        transition: 'all 0.4s ease',
                        flexShrink: 0,
                      }}>
                        {done ? '✓' : st.emoji}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 24, background: done ? '#34d399' : 'rgba(255,255,255,0.08)', margin: '3px 0' }} />
                      )}
                    </div>
                    {/* Conteúdo */}
                    <div style={{ paddingTop: 4, paddingBottom: i < STEPS.length - 1 ? 20 : 4 }}>
                      <div style={{ fontSize: 14, fontWeight: current ? 700 : 500, color: done ? '#34d399' : current ? '#f0f4ff' : '#475569' }}>
                        {st.label}
                      </div>
                      {current && !isEntregue && (
                        <div style={{ fontSize: 12, color: '#06b6d4', marginTop: 2, animation: 'pulse 2s infinite' }}>
                          ● Em andamento
                        </div>
                      )}
                      {i === 0 && (
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{fmtHora(pedido.created_at)}</div>
                      )}
                      {i === 3 && pedido.saiu_entrega_at && (
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{fmtHora(pedido.saiu_entrega_at)}</div>
                      )}
                      {i === 4 && pedido.entregue_at && (
                        <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>🎉 {fmtHora(pedido.entregue_at)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resumo do pedido */}
          <div style={s.section}>
            <div style={s.sectionTitle}>🛍️ Seu Pedido</div>
            {pedido.resumo_itens && (
              <div style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
                {pedido.resumo_itens.split(', ').map((item, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: i < pedido.resumo_itens!.split(', ').length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    {item}
                  </div>
                ))}
              </div>
            )}
            {pedido.taxa_entrega > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.08)', fontSize:13, color:'#64748b' }}>
                <span>Taxa de entrega</span><span>{fmt(pedido.taxa_entrega)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:16, fontWeight:900, color:'#f0f4ff' }}>
              <span>Total</span><span>{fmt(pedido.total_amount)}</span>
            </div>
          </div>

          {/* Endereço */}
          {pedido.endereco && (
            <div style={{ ...s.section, marginTop: 12 }}>
              <div style={s.sectionTitle}>📍 Endereço de entrega</div>
              <div style={{ color: '#94a3b8', fontSize: 14 }}>{pedido.endereco}</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.endereco)}`}
                target="_blank" rel="noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:10, fontSize:12, fontWeight:700, color:'#60a5fa', textDecoration:'none' }}
              >
                🗺️ Ver no Maps
              </a>
            </div>
          )}

          {/* Pagamento */}
          <div style={{ ...s.section, marginTop: 12 }}>
            <div style={s.sectionTitle}>💳 Pagamento</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color:'#94a3b8', fontSize:14 }}>
                {{ pix:'PIX', dinheiro:'Dinheiro', cartao:'Cartão' }[pedido.pagamento_tipo||''] || pedido.pagamento_tipo}
              </span>
              <span style={{
                padding:'3px 10px', borderRadius:100, fontSize:11, fontWeight:700,
                background: pedido.pagamento_status==='pago' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                color:       pedido.pagamento_status==='pago' ? '#34d399' : '#fbbf24',
              }}>
                {pedido.pagamento_status==='pago' ? '✓ Pago' : 'Aguardando'}
              </span>
            </div>
          </div>

          {/* Botão refazer pedido */}
          <a href={`/delivery/${slug}`} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:24, padding:'14px', background:'rgba(6,182,212,0.12)', border:'1px solid rgba(6,182,212,0.25)', borderRadius:14, color:'#06b6d4', fontWeight:700, fontSize:14, textDecoration:'none', transition:'all .2s' }}>
            🍽️ Fazer novo pedido
          </a>
        </div>

        {/* Rodapé */}
        <div style={{ textAlign:'center', color:'#1e293b', fontSize:11, padding:'16px 0 32px' }}>
          Atualização automática a cada 5 segundos · FlowPDV
        </div>
      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    background: '#080c14',
    minHeight: '100vh',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: '#f0f4ff',
  },
  header: {
    background: 'rgba(13,18,32,0.95)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  logo: {
    fontFamily: "'Syne', system-ui, sans-serif",
    fontSize: '1.3rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#f0f4ff',
  },
  content: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '24px 16px',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: '28px 24px',
  },
  section: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '16px',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 800,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 10,
  },
};
