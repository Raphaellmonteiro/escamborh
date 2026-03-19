/**
 * ClienteDisplayScreen — Painel de Chamada (TV no salão)
 * Rota pública: /display/:slug
 * Sem autenticação. Atualiza a cada 5 segundos.
 *
 * Uso: instalar um tablet/TV no salão apontando para
 *   http://localhost:3001/display/SLUG_DO_RESTAURANTE
 */

import React, { useEffect, useState, useRef } from 'react';

/* ─── tipos ─────────────────────────────────────────── */
interface Item { product_name: string; quantity: number; }
interface Order {
  id: number;
  senha_pedido: number;
  status: string;
  tipo_retirada: string;
  observation: string;
  created_at: string;
  items: Item[];
}

interface ApiData {
  estabelecimento: string;
  orders: Order[];
}

/* ─── constantes de status ───────────────────────────── */
const STATUS_CFG: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  'Criado':     { label: 'Aguardando',  emoji: '🕐', color: '#60a5fa', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)'  },
  'Em Preparo': { label: 'Em Preparo',  emoji: '🔥', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)' },
  'Pronto':     { label: 'Pronto! 🎉', emoji: '✅', color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.35)' },
};

const COLS = ['Criado', 'Em Preparo', 'Pronto'];

/* ─── helpers ────────────────────────────────────────── */
function getMesaLabel(order: Order): string {
  if (order.tipo_retirada === 'levar') return '🛍️ Viagem';
  if ((order.observation || '').startsWith('Mesa ')) return `🪑 ${order.observation}`;
  if (order.senha_pedido) return `Senha ${String(order.senha_pedido).padStart(3, '0')}`;
  return `Pedido #${order.id}`;
}

/* ─── componente principal ───────────────────────────── */
export default function ClienteDisplayScreen({ slug }: { slug: string }) {
  const [data, setData]         = useState<ApiData | null>(null);
  const [tick, setTick]         = useState(0);          // força re-render a cada segundo
  const [lastFetch, setLastFetch] = useState(new Date());
  const [error, setError]       = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`/public/kds/${slug}`);
      if (!res.ok) { setError(true); return; }
      setData(await res.json());
      setLastFetch(new Date());
      setError(false);
    } catch { setError(true); }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [slug]);

  // tick a cada segundo para atualizar o relógio
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── tela de carregamento ─────────────────────────── */
  if (!data && !error) return (
    <div style={styles.root}>
      <div style={{ textAlign: 'center', color: '#555' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🍽️</div>
        <p style={{ fontFamily: 'monospace', letterSpacing: 2 }}>Conectando...</p>
      </div>
    </div>
  );

  if (error && !data) return (
    <div style={styles.root}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: '#ef4444', fontFamily: 'monospace' }}>Não foi possível conectar</p>
        <p style={{ color: '#444', fontSize: 12, marginTop: 8 }}>Slug: {slug}</p>
      </div>
    </div>
  );

  const orders   = data!.orders ?? [];
  const prontos  = orders.filter(o => o.status === 'Pronto').length;

  /* ── layout principal ─────────────────────────────── */
  return (
    <div style={styles.root}>

      {/* ── HEADER ─────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={styles.headerLogo}>
            Flow<span style={{ color: '#06b6d4' }}>PDV</span>
          </div>
          <div style={styles.headerSep} />
          <div>
            <div style={styles.headerTitle}>{data!.estabelecimento}</div>
            <div style={styles.headerSub}>PAINEL DE CHAMADAS</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* pill "X prontos" piscando */}
          {prontos > 0 && (
            <div style={styles.readyPill}>
              ✅ {prontos} {prontos === 1 ? 'pedido pronto' : 'pedidos prontos'}
            </div>
          )}
          {/* relógio */}
          <div style={styles.clock}>
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {/* dot de sync */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569' }}>
            <span style={{ ...styles.syncDot, background: error ? '#ef4444' : '#10b981' }} />
            {lastFetch.toLocaleTimeString('pt-BR')}
          </div>
        </div>
      </header>

      {/* ── GRID DE COLUNAS ────────────────────────────── */}
      {orders.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#2d3748' }}>Tudo em dia!</p>
          <p style={{ fontSize: 15, color: '#4a5568', marginTop: 8 }}>Nenhum pedido no momento</p>
        </div>
      ) : (
        <div style={styles.colGrid}>
          {COLS.map(col => {
            const cfg  = STATUS_CFG[col];
            const list = orders.filter(o => o.status === col);
            return (
              <div key={col} style={styles.col}>
                {/* cabeçalho da coluna */}
                <div style={{ ...styles.colHeader, borderColor: cfg.border }}>
                  <span style={{ fontSize: '1.2rem' }}>{cfg.emoji}</span>
                  <span style={{ ...styles.colHeaderLabel, color: cfg.color }}>{cfg.label}</span>
                  <span style={{ ...styles.colCount, background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                    {list.length}
                  </span>
                </div>

                {/* cards */}
                <div style={styles.cardList}>
                  {list.length === 0 && (
                    <div style={styles.emptyCol}>nenhum</div>
                  )}
                  {list.map(order => {
                    const isPronte = order.status === 'Pronto';
                    const elapsed  = Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000));
                    return (
                      <div key={order.id} style={{
                        ...styles.card,
                        background: isPronte ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
                        borderColor: isPronte ? 'rgba(52,211,153,0.4)' : cfg.border,
                        boxShadow: isPronte ? '0 0 32px rgba(52,211,153,0.15)' : 'none',
                      }}>
                        {/* senha / mesa */}
                        <div style={{ ...styles.cardSenha, color: cfg.color }}>
                          {(() => {
                            const obs = order.observation || '';
                            const m   = obs.match(/Mesa\s+(\d+)/i);
                            if (order.senha_pedido && order.senha_pedido !== 0)
                              return `${String(order.senha_pedido).padStart(3,'0')}`;
                            if (m) return `Mesa ${m[1]}`;
                            return `#${order.id}`;
                          })()}
                        </div>

                        {/* tipo */}
                        <div style={{ ...styles.cardTag, background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                          {getMesaLabel(order)}
                        </div>

                        {/* itens resumidos */}
                        <div style={styles.cardItems}>
                          {(order.items || []).slice(0, 3).map((it, i) => (
                            <span key={i} style={styles.cardItem}>
                              {it.quantity}× {it.product_name}
                            </span>
                          ))}
                          {(order.items || []).length > 3 && (
                            <span style={{ ...styles.cardItem, color: '#64748b' }}>
                              +{order.items.length - 3} itens
                            </span>
                          )}
                        </div>

                        {/* tempo */}
                        <div style={{ ...styles.cardTime, color: elapsed >= 20 ? '#ef4444' : '#475569' }}>
                          {elapsed === 0 ? 'agora' : `${elapsed} min`}
                          {elapsed > 0 && elapsed >= 20 && ' ⚠️'}
                        </div>

                        {/* banner "RETIRE SEU PEDIDO" se pronto */}
                        {isPronte && (
                          <div style={styles.readyBanner}>
                            🎉 RETIRE SEU PEDIDO
                          </div>
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

      {/* ── RODAPÉ ─────────────────────────────────────── */}
      <footer style={styles.footer}>
        <span>Acompanhe seu pedido pelo número da senha</span>
        <span style={{ color: '#334155' }}>·</span>
        <span>Atualização automática a cada 5 segundos</span>
      </footer>
    </div>
  );
}

/* ─── estilos ────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    background: '#080c14',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: '#f0f4ff',
    userSelect: 'none',
  },
  header: {
    background: 'rgba(13,18,32,0.95)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    padding: '14px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerLogo: {
    fontFamily: "'Syne', system-ui, sans-serif",
    fontSize: '1.3rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#f0f4ff',
  },
  headerSep: {
    width: 1,
    height: 28,
    background: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#f0f4ff',
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: '#475569',
    textTransform: 'uppercase',
  },
  readyPill: {
    background: 'rgba(52,211,153,0.15)',
    border: '1px solid rgba(52,211,153,0.4)',
    color: '#34d399',
    borderRadius: 100,
    padding: '5px 14px',
    fontSize: '0.8rem',
    fontWeight: 700,
    animation: 'pulse 2s infinite',
  },
  clock: {
    fontFamily: "'Syne', system-ui, sans-serif",
    fontSize: '1.5rem',
    fontWeight: 800,
    color: '#f0f4ff',
    letterSpacing: '-0.02em',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    display: 'inline-block',
  },
  colGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 0,
  },
  col: {
    borderRight: '1px solid rgba(255,255,255,0.05)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  colHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 20px',
    borderBottom: '2px solid',
    background: 'rgba(255,255,255,0.02)',
  },
  colHeaderLabel: {
    fontFamily: "'Syne', system-ui, sans-serif",
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '0.04em',
    flex: 1,
  },
  colCount: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 100,
    border: '1px solid',
  },
  cardList: {
    flex: 1,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflowY: 'auto',
  },
  card: {
    borderRadius: 14,
    border: '1px solid',
    padding: '16px',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
  },
  cardSenha: {
    fontFamily: "'Syne', system-ui, sans-serif",
    fontSize: '2.5rem',
    fontWeight: 900,
    lineHeight: 1,
    marginBottom: 8,
    letterSpacing: '-0.02em',
  },
  cardTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.72rem',
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 100,
    border: '1px solid',
    marginBottom: 10,
  },
  cardItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    marginBottom: 8,
  },
  cardItem: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  cardTime: {
    fontSize: '0.72rem',
    fontWeight: 500,
  },
  readyBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(52,211,153,0.2)',
    borderTop: '1px solid rgba(52,211,153,0.3)',
    color: '#34d399',
    textAlign: 'center',
    fontSize: '0.72rem',
    fontWeight: 900,
    letterSpacing: '0.12em',
    padding: '6px 0',
  },
  emptyCol: {
    textAlign: 'center',
    color: '#1e293b',
    fontSize: '0.85rem',
    padding: '24px 0',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#1e293b',
  },
  footer: {
    borderTop: '1px solid rgba(255,255,255,0.05)',
    padding: '10px 28px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: '0.72rem',
    color: '#334155',
    background: 'rgba(13,18,32,0.8)',
  },
};