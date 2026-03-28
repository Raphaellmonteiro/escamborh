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

/** Resposta de GET /public/delivery/:slug/pedido/:id (pedido vem aninhado). */
interface PedidoTrackingApiResponse {
  pedido: Omit<PedidoData, 'estabelecimento'> & { estabelecimento?: string };
  nome_estabelecimento?: string | null;
}

// Pipeline de status (ordem dos passos): "Criado" = enviado pelo cliente; "Pedido Recebido" = aceito pelo restaurante
const STEPS = [
  { key: 'Criado',              label: 'Pedido enviado',    emoji: '01', desc: 'Seu pedido foi enviado e aguarda confirmação do restaurante.' },
  { key: 'Pedido Recebido',     label: 'Pedido recebido',   emoji: '02', desc: 'O restaurante aceitou seu pedido.' },
  { key: 'Em Preparo',          label: 'Em preparo',        emoji: '03', desc: 'A cozinha está preparando seu pedido.' },
  { key: 'Pronto para Entrega', label: 'Pronto',            emoji: '04', desc: 'Pedido pronto e aguardando envio.' },
  { key: 'Saiu para Entrega',   label: 'Saiu para entrega', emoji: '05', desc: 'Seu pedido está a caminho.' },
  { key: 'Entregue',            label: 'Entregue',          emoji: '06', desc: 'Pedido entregue.' },
];

// Compatibiliza nomes de status com o pipeline (mesmos valores usados em Operações/Cozinha)
const ALIAS: Record<string, string> = {
  Pronto: 'Pronto para Entrega',
  'Concluído': 'Entregue',
  concluido: 'Entregue',
};

function normalizeStatus(s: string): string {
  const t = String(s || '').trim();
  return ALIAS[t] ?? t;
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

const fmt = (v: number) => `R$ ${(Number.isFinite(v) ? v : 0).toFixed(2).replace('.', ',')}`;

interface Props {
  slug: string;
  pedidoId: number;
  /** Layout compacto dentro de modal (sem cabeçalho de página inteira). */
  embedded?: boolean;
}

export default function PedidoRastreamento({ slug, pedidoId, embedded }: Props) {
  const [pedido, setPedido]     = useState<PedidoData | null>(null);
  const [error, setError]       = useState(false);
  const [lastTick, setLastTick] = useState(0);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef           = useRef<string | null>(null);

  const fetchPedido = async () => {
    try {
      const res = await fetch(`/public/delivery/${slug}/pedido/${pedidoId}`);
      if (!res.ok) { setError(true); return; }
      const body = (await res.json()) as PedidoTrackingApiResponse;
      const p = body?.pedido;
      if (!p || typeof p.id !== 'number') {
        setError(true);
        return;
      }
      const total = Number(p.total_amount);
      const taxa = Number(p.taxa_entrega);
      const mapped: PedidoData = {
        ...p,
        total_amount: Number.isFinite(total) ? total : 0,
        taxa_entrega: Number.isFinite(taxa) ? taxa : 0,
        estabelecimento: String(body.nome_estabelecimento ?? p.estabelecimento ?? ''),
      };
      setPedido(mapped);
      setError(false);
      prevStatusRef.current = mapped.status;
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

  const rootStyle: React.CSSProperties = embedded
    ? { ...s.root, minHeight: 0, background: '#09090b' }
    : s.root;

  if (error && !pedido) return (
    <div style={rootStyle}>
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ ...s.badgeBox, width: 64, height: 64, margin: '0 auto 16px', fontSize: 12, fontWeight: 800, letterSpacing: '0.18em' }}>PED</div>
        <p style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>Pedido não encontrado</p>
        <p style={{ color: '#71717a', marginTop: 8, fontSize: 14 }}>Verifique o número do pedido ou volte para o cardápio.</p>
        <a href={`/delivery/${slug}`} style={{ display:'inline-block', marginTop:24, padding:'12px 28px', background:'#ffffff', color:'#09090b', borderRadius:14, fontWeight:800, textDecoration:'none', boxShadow:'0 18px 40px rgba(255,255,255,0.08)' }}>
          Fazer novo pedido
        </a>
      </div>
    </div>
  );

  if (!pedido) return (
    <div style={rootStyle}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
        <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid #1e293b', borderTopColor:'#06b6d4', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  const stepIdx    = getCurrentStepIndex(pedido.status);
  const stNorm     = String(pedido.status || '').trim().toLowerCase();
  const isCancelado = stNorm === 'cancelado';
  const isEntregue  = stNorm === 'entregue' || stNorm.startsWith('conclu');
  const step        = STEPS[stepIdx];

  return (
    <div style={rootStyle}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header (página cheia; omitido no modal para não duplicar título) */}
      {!embedded && (
        <header style={s.header}>
          <div style={s.logo}>
            Pedido<span style={{ color: '#67e8f9' }}>Online</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fafafa' }}>{pedido.estabelecimento}</div>
            <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>{hora}</div>
          </div>
        </header>
      )}

      <div style={embedded ? { ...s.content, padding: '12px 12px 8px' } : s.content}>

        {/* Card principal */}
        <div style={{ ...s.card, animation: 'slideUp 0.4s ease' }}>

          {/* Número do pedido */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Acompanhe seu pedido
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fafafa', letterSpacing: '-0.02em' }}>
              #{pedido.order_number}
            </div>
            {pedido.cliente_nome && (
              <div style={{ fontSize: 14, color: '#a1a1aa', marginTop: 4 }}>Olá, {pedido.cliente_nome.split(' ')[0]}.</div>
            )}
          </div>

          {/* Status atual em destaque */}
          {isCancelado ? (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '20px', textAlign: 'center', marginBottom: 24 }}>
              <div style={{ ...s.badgeBox, width: 48, height: 48, margin: '0 auto', fontSize: 11, fontWeight: 800 }}>PED</div>
              <div style={{ color: '#f87171', fontWeight: 900, fontSize: 20, marginTop: 8 }}>Pedido Cancelado</div>
              <div style={{ color: '#a1a1aa', fontSize: 13, marginTop: 6 }}>Entre em contato com o restaurante para mais detalhes.</div>
            </div>
          ) : (
            <div style={{
              background: isEntregue ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.10)',
              border: `1px solid ${isEntregue ? 'rgba(34,197,94,0.35)' : 'rgba(251,191,36,0.35)'}`,
              borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 24,
            }}>
              <div style={{
                ...s.badgeBox,
                width: 56, height: 56, margin: '0 auto 10px',
                animation: isEntregue ? 'none' : 'pulse 2s infinite',
                background: isEntregue ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.18)',
                borderColor: isEntregue ? 'rgba(34,197,94,0.4)' : 'rgba(251,191,36,0.45)',
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.08em' }}>{step.emoji}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: isEntregue ? '#86efac' : '#fcd34d', marginBottom: 6 }}>
                {step.label}
              </div>
              <div style={{ fontSize: 14, color: '#a1a1aa' }}>{step.desc}</div>
              {!isEntregue && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginTop: 10 }}>
                  Acompanhe abaixo — atualização automática a cada poucos segundos.
                </div>
              )}
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
                        fontSize: done ? 11 : 11,
                        fontWeight: 800,
                        background: done ? '#22c55e' : current ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                        border: `2px solid ${done ? '#16a34a' : current ? '#d97706' : 'rgba(255,255,255,0.1)'}`,
                        transition: 'all 0.4s ease',
                        flexShrink: 0,
                      }}>
                        {done ? 'OK' : st.emoji}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 24, background: done ? '#4ade80' : 'rgba(255,255,255,0.08)', margin: '3px 0' }} />
                      )}
                    </div>
                    {/* Conteúdo */}
                    <div style={{ paddingTop: 4, paddingBottom: i < STEPS.length - 1 ? 20 : 4 }}>
                        <div style={{ fontSize: 14, fontWeight: current ? 700 : 500, color: done ? '#4ade80' : current ? '#fafafa' : '#71717a' }}>
                        {st.label}
                      </div>
                      {current && !isEntregue && (
                        <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 2, animation: 'pulse 2s infinite' }}>
                          ● Em andamento
                        </div>
                      )}
                      {i === 0 && (
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{fmtHora(pedido.created_at)}</div>
                      )}
                      {i === 4 && pedido.saiu_entrega_at && (
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{fmtHora(pedido.saiu_entrega_at)}</div>
                      )}
                      {i === 5 && pedido.entregue_at && (
                        <div style={{ fontSize: 11, color: '#67e8f9', marginTop: 2 }}>{fmtHora(pedido.entregue_at)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resumo do pedido */}
          <div style={s.section}>
              <div style={s.sectionTitle}>Seu pedido</div>
            {pedido.resumo_itens && (
              <div style={{ color: '#e4e4e7', fontSize: 14, lineHeight: 1.6 }}>
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
              <div style={s.sectionTitle}>Endereço de entrega</div>
              <div style={{ color: '#a1a1aa', fontSize: 14 }}>{pedido.endereco}</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.endereco)}`}
                target="_blank" rel="noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:10, fontSize:12, fontWeight:700, color:'#67e8f9', textDecoration:'none' }}
              >
                Ver no Maps
              </a>
            </div>
          )}

          {/* Pagamento */}
          <div style={{ ...s.section, marginTop: 12 }}>
            <div style={s.sectionTitle}>Pagamento</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color:'#a1a1aa', fontSize:14 }}>
                {{ pix:'PIX', dinheiro:'Dinheiro', cartao:'Cartão' }[pedido.pagamento_tipo||''] || pedido.pagamento_tipo}
              </span>
              <span style={{
                padding:'3px 10px', borderRadius:100, fontSize:11, fontWeight:700,
                background: pedido.pagamento_status==='pago' ? 'rgba(34,211,238,0.15)' : 'rgba(251,191,36,0.15)',
                color:       pedido.pagamento_status==='pago' ? '#67e8f9' : '#fbbf24',
              }}>
                {pedido.pagamento_status==='pago' ? '✓ Pago' : 'Aguardando'}
              </span>
            </div>
          </div>

          {/* Botão refazer pedido */}
          <a href={`/delivery/${slug}`} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:24, padding:'14px', background:'rgba(255,255,255,0.92)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, color:'#09090b', fontWeight:800, fontSize:14, textDecoration:'none', transition:'all .2s' }}>
            Fazer novo pedido
          </a>
        </div>

        {/* Rodapé */}
        <div style={{ textAlign:'center', color:'#a1a1aa', fontSize:11, padding:'16px 0 32px' }}>
          Atualização automática a cada 5 segundos · Delivery online
        </div>
      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    background: '#09090b',
    minHeight: '100vh',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: '#fafafa',
  },
  header: {
    background: 'rgba(9,9,11,0.94)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
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
    color: '#fafafa',
  },
  content: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '24px 16px',
  },
  card: {
    background: 'rgba(24,24,27,0.96)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: '28px 24px',
    boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
  },
  section: {
    background: 'rgba(9,9,11,0.7)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '16px',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 800,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 10,
  },
  badgeBox: {
    background: 'rgba(34,211,238,0.12)',
    border: '1px solid rgba(34,211,238,0.24)',
    borderRadius: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ecfeff',
  },
};
