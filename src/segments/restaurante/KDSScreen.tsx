import React, { useRef } from 'react';

interface KDSItem  { product_name: string; quantity: number; }
interface KDSOrder {
  id: number; senha_pedido: number; status: string;
  tipo_retirada: string; observation: string; created_at: string; items: KDSItem[];
}

const PIPELINE = ['Criado', 'Em Preparo', 'Pronto', 'Entregue'];
const STATUS: Record<string, { label: string; emoji: string; color: string; bg: string; border: string; glow: string; }> = {
  'Criado':     { label: 'AGUARDANDO', emoji: '•', color: '#ea1d2c', bg: 'rgba(234,29,44,0.06)',  border: 'rgba(234,29,44,0.25)', glow: 'transparent' },
  'Em Preparo': { label: 'EM PREPARO', emoji: '•', color: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.35)', glow: 'rgba(251,191,36,0.15)' },
  'Pronto':     { label: 'PRONTO',     emoji: '•', color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.35)',  glow: 'rgba(34,197,94,0.16)'  },
};
const COLS = ['Criado', 'Em Preparo', 'Pronto'];

function elapsedMin(created_at: string) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
}
function tipoInfo(order: KDSOrder) {
  if (order.tipo_retirada === 'levar') return { label: 'VIAGEM', emoji: '•', color: '#fb923c' };
  if ((order.observation || '').startsWith('Mesa ')) return { label: order.observation.toUpperCase(), emoji: '•', color: '#a02331' };
  return { label: 'BALCÃO', emoji: '•', color: '#ea1d2c' };
}

export default function KDSScreen({ slug }: { slug: string }) {
  const [data, setData]             = React.useState<{ estabelecimento: string; orders: KDSOrder[] } | null>(null);
  const [loading, setLoading]       = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState(new Date());
  const [advancing, setAdvancing]   = React.useState<number | null>(null);

  const prevCountRef = useRef<number>(-1);
  const audioCtxRef  = useRef<AudioContext | null>(null);

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      [0, 0.18].forEach(off => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = 880; osc.type = 'sine';
        g.gain.setValueAtTime(0.35, ctx.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + off + 0.15);
        osc.start(ctx.currentTime + off); osc.stop(ctx.currentTime + off + 0.16);
      });
    } catch {}
  };

  const fetchOrders = React.useCallback(async () => {
    try {
      const res = await fetch(`/public/kds/${slug}`);
      if (!res.ok) { setData(null); return; }
      const json = await res.json();
      if (prevCountRef.current >= 0 && json.orders) {
        const n = json.orders.filter((o: any) => o.status === 'Criado').length;
        if (n > prevCountRef.current) playBeep();
        prevCountRef.current = n;
      } else if (prevCountRef.current === -1 && json.orders) {
        prevCountRef.current = json.orders.filter((o: any) => o.status === 'Criado').length;
      }
      setData(json); setLastUpdate(new Date());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [slug]);

  React.useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Polling base sempre ativo para garantir sincronização,
  // mesmo quando o SSE estiver conectado mas sem eventos úteis.
  React.useEffect(() => {
    const pollId = setInterval(fetchOrders, 10000);
    return () => clearInterval(pollId);
  }, [fetchOrders]);

  // ── SSE: recebe eventos do servidor instantaneamente ─────────────────────
  // A rota /public/kds não usa JWT — slug identifica o tenant.
  // Conectamos ao SSE público separado para o KDS.
  React.useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/public/kds/${slug}/events`);

      es.addEventListener('new_order',    () => fetchOrders());
      es.addEventListener('status_change', () => fetchOrders());
      es.addEventListener('ping', () => {});

      es.onerror = () => {
        es?.close();
        // Tenta reconectar em 5s
        retryTimeout = setTimeout(() => {
          connect();
        }, 5000);
      };

      es.onopen = () => {
        void fetchOrders();
      };
    };

    connect();
    return () => {
      closed = true;
      es?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [slug, fetchOrders]);

  // Tick a cada segundo para atualizar relógio e cronômetros
  React.useEffect(() => { const id = setInterval(() => setData(d => d ? { ...d } : d), 1000); return () => clearInterval(id); }, []);

  const advance = async (id: number) => {
    setAdvancing(id);
    try { await fetch(`/public/kds/${slug}/orders/${id}/advance`, { method: 'PATCH' }); await fetchOrders(); }
    finally { setAdvancing(null); }
  };

  if (loading) return (
    <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#334155' }}>
        <div style={{ ...S.logoBox, width: 56, height: 56, margin: '0 auto 16px', fontSize: 12, fontWeight: 800, letterSpacing: '0.18em' }}>KDS</div>
        <p style={{ fontFamily: 'monospace', letterSpacing: 2 }}>Conectando à cozinha...</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ ...S.logoBox, width: 56, height: 56, margin: '0 auto 16px', fontSize: 14, fontWeight: 800 }}>KDS</div>
        <p style={{ color: '#ef4444', fontFamily: 'monospace' }}>Restaurante não encontrado — slug: {slug}</p>
      </div>
    </div>
  );

  const orders = data.orders || [];

  return (
    <div style={S.root}>

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ ...S.logoBox, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em' }}>KDS</div>
          <div>
            <div style={S.hTitle}>{data.estabelecimento}</div>
            <div style={S.hSub}>TELA DA COZINHA — KDS</div>
          </div>
          <div style={S.sep} />
          {COLS.map(col => {
            const sc = STATUS[col];
            const n  = orders.filter(o => o.status === col).length;
            return (
              <div key={col} style={{ ...S.pill, borderColor: sc.border, background: sc.bg }}>
                <span style={{ fontSize: 16 }}>{sc.emoji}</span>
                <span style={{ color: sc.color, fontWeight: 900, fontSize: 20, fontFamily: 'monospace', lineHeight: 1 }}>{n}</span>
                <span style={{ color: '#475569', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1 }}>{sc.label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={S.clock}>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          <div style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace' }}>↻ {lastUpdate.toLocaleTimeString('pt-BR')}</div>
        </div>
      </header>

      {/* ── EMPTY ───────────────────────────────────────────────── */}
      {orders.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.logoBox, width: 72, height: 72, marginBottom: 20, fontSize: 14, fontWeight: 800, letterSpacing: '0.18em' }}>KDS</div>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#1e293b' }}>Tudo em dia!</p>
          <p style={{ fontSize: 14, color: '#334155', marginTop: 8 }}>Nenhum pedido pendente no momento</p>
        </div>
      ) : (
        <div style={S.colGrid}>
          {COLS.map(col => {
            const sc   = STATUS[col];
            const list = orders.filter(o => o.status === col);
            const next = PIPELINE[PIPELINE.indexOf(col) + 1];
            return (
              <div key={col} style={{ ...S.col, borderTopColor: sc.color }}>

                {/* col header */}
                <div style={{ ...S.colHead, borderBottomColor: sc.border }}>
                  <span style={{ fontSize: 18 }}>{sc.emoji}</span>
                  <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: 900, color: sc.color, letterSpacing: '0.1em' }}>{sc.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 100, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{list.length}</span>
                </div>

                {/* cards */}
                <div style={S.cardArea}>
                  {list.length === 0 && <div style={S.emptyCol}>— nenhum —</div>}

                  {list.map(order => {
                    const min    = elapsedMin(order.created_at);
                    const urgent = min >= 15 && col !== 'Pronto';
                    const tipo   = tipoInfo(order);
                    const isAdv  = advancing === order.id;

                    return (
                      <div key={order.id} style={{
                        ...S.card,
                        background: col === 'Pronto' ? 'rgba(34,197,94,0.08)' : sc.bg,
                        borderColor: urgent ? '#ef4444' : sc.border,
                        boxShadow:   urgent ? '0 0 24px rgba(239,68,68,0.25)' : col === 'Pronto' ? '0 0 28px rgba(34,197,94,0.16)' : 'none',
                      }}>

                        {/* topo: senha + tipo + tempo */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>

                          {/* senha + badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                              background: sc.color + '18', border: `2px solid ${sc.color}44`,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {(() => {
                                const obs = order.observation || '';
                                const mesaMatch = obs.match(/Mesa\s+(\d+)/i);
                                const hasSenha = order.senha_pedido && order.senha_pedido !== 0;
                                if (hasSenha) return (
                                  <>
                                    <span style={{ fontSize: 8, color: sc.color, opacity: 0.6, fontWeight: 700, letterSpacing: 1 }}>SENHA</span>
                                    <span style={{ fontSize: 20, fontWeight: 900, color: sc.color, lineHeight: 1, fontFamily: 'monospace' }}>
                                      {String(order.senha_pedido).padStart(2,'0')}
                                    </span>
                                  </>
                                );
                                if (mesaMatch) return (
                                  <>
                                    <span style={{ fontSize: 8, color: sc.color, opacity: 0.6, fontWeight: 700, letterSpacing: 1 }}>MESA</span>
                                    <span style={{ fontSize: 20, fontWeight: 900, color: sc.color, lineHeight: 1, fontFamily: 'monospace' }}>
                                      {mesaMatch[1]}
                                    </span>
                                  </>
                                );
                                return (
                                  <>
                                    <span style={{ fontSize: 8, color: sc.color, opacity: 0.6, fontWeight: 700, letterSpacing: 1 }}>PED</span>
                                    <span style={{ fontSize: 18, fontWeight: 900, color: sc.color, lineHeight: 1, fontFamily: 'monospace' }}>
                                      #{order.id}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: tipo.color + '18', border: `1px solid ${tipo.color}44`,
                                borderRadius: 100, padding: '2px 8px',
                              }}>
                                <span style={{ fontSize: 10 }}>{tipo.emoji}</span>
                                <span style={{ fontSize: 10, fontWeight: 800, color: tipo.color }}>{tipo.label}</span>
                              </div>
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: sc.color + '12', border: `1px solid ${sc.color}30`,
                                borderRadius: 100, padding: '2px 8px',
                              }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: sc.color }}>{sc.emoji} {sc.label}</span>
                              </div>
                            </div>
                          </div>

                          {/* contador de tempo */}
                          <div style={{
                            background: urgent ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 8, padding: '5px 10px', textAlign: 'center', minWidth: 50, flexShrink: 0,
                          }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: urgent ? '#ef4444' : '#64748b', fontFamily: 'monospace', lineHeight: 1 }}>
                              {Math.max(0, min)}
                            </div>
                            <div style={{ fontSize: 9, color: urgent ? '#ef4444' : '#475569', fontWeight: 600, letterSpacing: 0.5 }}>
                              {urgent ? 'ATRASO' : 'MIN'}
                            </div>
                          </div>
                        </div>

                        {/* divisor */}
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />

                        {/* itens */}
                        <div style={{ marginBottom: 10 }}>
                          {(order.items || []).map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span style={{
                                fontSize: 12, fontWeight: 900, color: sc.color,
                                background: sc.color + '16', borderRadius: 5, padding: '1px 7px', minWidth: 28, textAlign: 'center',
                              }}>
                                {item.quantity}×
                              </span>
                              <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{item.product_name}</span>
                            </div>
                          ))}
                          {(order.items || []).length === 0 && <p style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>Sem itens</p>}
                        </div>

                        {/* observação */}
                        {order.observation && (
                          <div style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 8, padding: '5px 10px', fontSize: 11, color: '#94a3b8',
                            fontStyle: 'italic', marginBottom: 10,
                          }}>
                            Obs.: {order.observation}
                          </div>
                        )}

                        {/* botão avançar */}
                        {next && next !== 'Entregue' && (
                          <button onClick={() => advance(order.id)} disabled={isAdv} style={{
                            width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                            cursor: isAdv ? 'wait' : 'pointer',
                            background: isAdv ? '#1e293b' : sc.color,
                            color: '#020617', fontWeight: 900, fontSize: 13,
                            opacity: isAdv ? 0.5 : 1, transition: 'all 0.2s', letterSpacing: 0.5,
                          }}>
                            {isAdv ? '...' : `Avançar para ${next}`}
                          </button>
                        )}
                        {col === 'Pronto' && (
                          <button onClick={() => advance(order.id)} disabled={isAdv} style={{
                            width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                            cursor: isAdv ? 'wait' : 'pointer',
                            background: isAdv ? '#1e293b' : '#22c55e',
                            color: '#020617', fontWeight: 900, fontSize: 13, opacity: isAdv ? 0.5 : 1,
                          }}>
                            {isAdv ? '...' : 'Marcar como entregue'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer style={S.footer}>
        <span>Pratory · Tela da Cozinha</span>
        <span style={{ color: '#475569' }}>·</span>
        <span>Atualização a cada 10 segundos</span>
        <span style={{ color: '#475569' }}>·</span>
        <span style={{ color: '#f87171', fontWeight: 600 }}>Vermelho = acima de 15 min</span>
      </footer>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root:    { background: '#090e17', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#f0f4ff', userSelect: 'none' },
  header:  { background: 'rgba(9,14,23,0.97)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(148,163,184,0.12)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, gap: 12 },
  logoBox: { width: 38, height: 38, background: 'rgba(234,29,44,0.08)', border: '1px solid rgba(234,29,44,0.18)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  hTitle:  { fontSize: '0.9rem', fontWeight: 800, color: '#f0f4ff' },
  hSub:    { fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' },
  sep:     { width: 1, height: 30, background: 'rgba(148,163,184,0.16)', margin: '0 4px' },
  pill:    { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 10, border: '1px solid' },
  clock:   { fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 900, color: '#f0f4ff', letterSpacing: '-0.02em' },
  colGrid: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', overflow: 'hidden' },
  col:     { borderRight: '1px solid rgba(148,163,184,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '3px solid transparent' },
  colHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid', background: 'rgba(15,23,42,0.45)', flexShrink: 0 },
  cardArea:{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  card:    { borderRadius: 14, border: '1px solid', padding: 14, transition: 'all 0.3s ease', background: 'rgba(15,23,42,0.55)' },
  emptyCol:{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '32px 0', fontStyle: 'italic' },
  footer:  { borderTop: '1px solid rgba(148,163,184,0.1)', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.68rem', color: '#94a3b8', background: 'rgba(9,14,23,0.94)', flexShrink: 0 },
};