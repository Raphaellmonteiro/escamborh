/**
 * ClienteMesaScreen — Mesa do Cliente (celular)
 * Rota pública: /mesa/:slug/:numero
 *
 * Duas abas:
 *  🍽️  Cardápio  — browse produtos, carrinho, enviar pedido
 *  🕐  Meu Pedido — acompanhar status em tempo real
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { normalizeProductPhotoPublicUrl } from '../../utils/productPhotoUrl';

/* ─────────────────────────────── tipos ──────────────────────────────── */
interface Produto  { id: number; name: string; price: number; category: string; photo_url?: string; }
interface Categoria { nome: string; itens: Produto[]; }
interface CardapioData { estabelecimento: string; categorias: Categoria[]; }

interface CartItem  { product_id: number; name: string; price_at_time: number; quantity: number; }

interface OrderItem { product_name: string; quantity: number; price_at_time: number; }
interface Order {
  id: number; senha_pedido: number; status: string;
  tipo_retirada: string; observation: string;
  created_at: string; total: number; items: OrderItem[];
}
interface KdsData { estabelecimento: string; orders: Order[]; }

/* ─────────────────────────── config status ──────────────────────────── */
const STATUS_CFG: Record<string, {
  label: string; sub: string; emoji: string;
  color: string; bg: string; border: string; glow: string;
}> = {
  'Criado':     { label: 'Pedido recebido',        sub: 'Seu pedido foi registrado e aguarda preparo.',  emoji: '📋', color: '#60a5fa', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  glow: 'rgba(59,130,246,0.1)'  },
  'Em Preparo': { label: 'Em preparo 🔥',           sub: 'A cozinha está preparando seu pedido agora.',  emoji: '👨‍🍳', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  glow: 'rgba(251,191,36,0.12)' },
  'Pronto':     { label: 'Pronto! Bom apetite 🎉', sub: 'Seu pedido está pronto e a caminho.',           emoji: '✅', color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.35)', glow: 'rgba(52,211,153,0.15)' },
  'Entregue':   { label: 'Entregue com sucesso',   sub: 'Aproveite! Obrigado pela preferência.',         emoji: '🍽️', color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', glow: 'rgba(0,0,0,0)'         },
};
const PIPELINE = ['Criado', 'Em Preparo', 'Pronto', 'Entregue'];

/* ─────────────────────────── helpers ────────────────────────────────── */
const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/* ═══════════════════════════ COMPONENTE PRINCIPAL ═══════════════════════ */
export default function ClienteMesaScreen({ slug, mesa }: { slug: string; mesa: string }) {
  const [aba, setAba]             = useState<'cardapio' | 'pedido'>('cardapio');
  const [cardapio, setCardapio]   = useState<CardapioData | null>(null);
  const [kds, setKds]             = useState<KdsData | null>(null);
  const [loadCard, setLoadCard]   = useState(true);
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [showCart, setShowCart]   = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [enviado, setEnviado]     = useState(false);
  const [erroPedido, setErroPedido] = useState('');
  const [catAtiva, setCatAtiva]   = useState('');
  const [busca, setBusca]         = useState('');

  /* ── fetch cardápio (uma vez) ─────────────────────────── */
  useEffect(() => {
    fetch(`/public/cardapio/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setCardapio(d); setCatAtiva(d.categorias[0]?.nome || ''); } })
      .finally(() => setLoadCard(false));
  }, [slug]);

  /* ── fetch kds (polling a cada 8s) ───────────────────── */
  const fetchKds = useCallback(async () => {
    try {
      const r = await fetch(`/public/kds/${slug}`);
      if (r.ok) setKds(await r.json());
    } catch {}
  }, [slug]);

  useEffect(() => {
    fetchKds();
    const id = setInterval(fetchKds, 8000);
    return () => clearInterval(id);
  }, [fetchKds]);

  /* ── pedido ativo da mesa ─────────────────────────────── */
  const order: Order | null = kds
    ? kds.orders.find(o => {
        const num = mesa.toString();
        if ((o.observation || '').toLowerCase() === `mesa ${num}`) return true;
        if (o.tipo_retirada === 'mesa' && (o.observation || '').includes(num)) return true;
        return false;
      }) ?? null
    : null;

  /* ── carrinho helpers ─────────────────────────────────── */
  const addToCart = (p: Produto) => {
    setCart(prev => {
      const ex = prev.find(i => i.product_id === p.id);
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, price_at_time: p.price, quantity: 1 }];
    });
  };
  const removeFromCart = (id: number) => {
    setCart(prev => {
      const ex = prev.find(i => i.product_id === id);
      if (!ex) return prev;
      if (ex.quantity === 1) return prev.filter(i => i.product_id !== id);
      return prev.map(i => i.product_id === id ? { ...i, quantity: i.quantity - 1 } : i);
    });
  };
  const qtyInCart = (id: number) => cart.find(i => i.product_id === id)?.quantity ?? 0;
  const cartTotal = cart.reduce((a, i) => a + i.price_at_time * i.quantity, 0);
  const cartCount = cart.reduce((a, i) => a + i.quantity, 0);

  /* ── enviar pedido ────────────────────────────────────── */
  const enviarPedido = async () => {
    if (cart.length === 0) return;
    setEnviando(true);
    setErroPedido('');
    try {
      const r = await fetch(`/public/mesa/${slug}/${mesa}/pedir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: cart }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || 'Erro ao enviar pedido');
      setCart([]);
      setShowCart(false);
      setEnviado(true);
      setTimeout(() => setEnviado(false), 4000);
      fetchKds();
      setAba('pedido');
    } catch (e: any) {
      setErroPedido(e.message || 'Erro ao enviar pedido');
    }
    setEnviando(false);
  };

  /* ── produtos filtrados ───────────────────────────────── */
  const produtosFiltrados: Produto[] = busca.trim()
    ? (cardapio?.categorias.flatMap(c => c.itens) ?? []).filter(p =>
        p.name.toLowerCase().includes(busca.toLowerCase()) ||
        p.category.toLowerCase().includes(busca.toLowerCase())
      )
    : (cardapio?.categorias.find(c => c.nome === catAtiva)?.itens ?? []);

  const estNome = cardapio?.estabelecimento || kds?.estabelecimento || '';

  /* ══════════════════════════ RENDER ══════════════════════ */
  return (
    <div style={S.root}>
      {/* ── HEADER ────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={S.logo}>Flow<span style={{ color: '#06b6d4' }}>PDV</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={S.estNome}>{estNome}</span>
          <span style={S.mesaBadgeSmall}>Mesa {mesa}</span>
        </div>
      </header>

      {/* ── TABS ──────────────────────────────────────────── */}
      <div style={S.tabs}>
        <button
          style={{ ...S.tab, ...(aba === 'cardapio' ? S.tabActive : {}) }}
          onClick={() => setAba('cardapio')}
        >
          🍽️ Cardápio
        </button>
        <button
          style={{ ...S.tab, ...(aba === 'pedido' ? S.tabActive : {}), position: 'relative' }}
          onClick={() => setAba('pedido')}
        >
          🕐 Meu Pedido
          {order && order.status !== 'Entregue' && (
            <span style={S.tabDot} />
          )}
        </button>
      </div>

      {/* ── CONTEÚDO ──────────────────────────────────────── */}
      <div style={{ flex: 1, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait">
          {aba === 'cardapio' ? (
            <motion.div key="cardapio" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <AbaCardapio
                loading={loadCard}
                cardapio={cardapio}
                catAtiva={catAtiva}
                setCatAtiva={setCatAtiva}
                busca={busca}
                setBusca={setBusca}
                produtosFiltrados={produtosFiltrados}
                qtyInCart={qtyInCart}
                addToCart={addToCart}
                removeFromCart={removeFromCart}
              />
            </motion.div>
          ) : (
            <motion.div key="pedido" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} style={{ flex: 1, overflow: 'auto' }}>
              <AbaMeuPedido order={order} kdsLoaded={kds !== null} mesa={mesa} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── TOAST ENVIADO ─────────────────────────────────── */}
      <AnimatePresence>
        {enviado && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={S.toast}
          >
            ✅ Pedido enviado para a cozinha!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTÃO CARRINHO FLUTUANTE ───────────────────────── */}
      {aba === 'cardapio' && cartCount > 0 && !showCart && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setShowCart(true)}
          style={S.cartFab}
        >
          <span style={{ fontSize: '1.4rem' }}>🛒</span>
          <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.9rem' }}>{fmt(cartTotal)}</span>
        </motion.button>
      )}

      {/* ── MODAL CARRINHO ────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={S.cartOverlay}
            onClick={() => setShowCart(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={S.cartSheet}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div style={S.cartHandle} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f0f4ff' }}>🛒 Seu carrinho</span>
                <button onClick={() => setShowCart(false)} style={S.closeBtn}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                {cart.map(it => (
                  <div key={it.product_id} style={S.cartRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>{it.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{fmt(it.price_at_time)} cada</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => removeFromCart(it.product_id)} style={S.qtyBtn}>−</button>
                      <span style={{ fontWeight: 700, color: '#f0f4ff', minWidth: 20, textAlign: 'center' }}>{it.quantity}</span>
                      <button onClick={() => addToCart({ id: it.product_id, name: it.name, price: it.price_at_time, category: '' })} style={S.qtyBtn}>+</button>
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8', minWidth: 64, textAlign: 'right' }}>{fmt(it.price_at_time * it.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.06em' }}>Total</span>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#f0f4ff' }}>{fmt(cartTotal)}</span>
              </div>

              {erroPedido && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: '0.85rem', marginBottom: 12 }}>
                  ⚠️ {erroPedido}
                </div>
              )}

              <button onClick={enviarPedido} disabled={enviando} style={{ ...S.sendBtn, opacity: enviando ? 0.7 : 1 }}>
                {enviando ? '⏳ Enviando...' : '✅ Confirmar Pedido'}
              </button>

              <button onClick={() => { setCart([]); setShowCart(false); }} style={S.clearBtn}>
                Limpar carrinho
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════ ABA CARDÁPIO ══════════════════════ */
function AbaCardapio({
  loading, cardapio, catAtiva, setCatAtiva,
  busca, setBusca, produtosFiltrados,
  qtyInCart, addToCart, removeFromCart,
}: {
  loading: boolean;
  cardapio: CardapioData | null;
  catAtiva: string;
  setCatAtiva: (c: string) => void;
  busca: string;
  setBusca: (b: string) => void;
  produtosFiltrados: Produto[];
  qtyInCart: (id: number) => number;
  addToCart: (p: Produto) => void;
  removeFromCart: (id: number) => void;
}) {
  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🍽️</div>
        <p style={{ fontFamily: 'monospace' }}>Carregando cardápio...</p>
      </div>
    </div>
  );

  if (!cardapio || cardapio.categorias.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>😔</div>
        <p>Cardápio não disponível</p>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Busca */}
      <div style={{ padding: '12px 16px 0' }}>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="🔍  Buscar no cardápio..."
          style={S.searchInput}
        />
      </div>

      {/* Categorias */}
      {!busca && (
        <div style={S.catScroll}>
          {cardapio.categorias.map(c => (
            <button
              key={c.nome}
              onClick={() => setCatAtiva(c.nome)}
              style={{ ...S.catBtn, ...(catAtiva === c.nome ? S.catBtnActive : {}) }}
            >
              {c.nome}
            </button>
          ))}
        </div>
      )}

      {/* Produtos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px' }}>
        {busca && (
          <p style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 10 }}>
            {produtosFiltrados.length} resultado{produtosFiltrados.length !== 1 ? 's' : ''} para &ldquo;{busca}&rdquo;
          </p>
        )}
        {produtosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#334155', paddingTop: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
            <p>Nenhum item encontrado</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {produtosFiltrados.map(p => {
              const qty = qtyInCart(p.id);
              const foto = normalizeProductPhotoPublicUrl(p.photo_url);
              return (
                <div key={p.id} style={S.prodCard}>
                  {foto ? (
                    <img src={foto} alt={p.name} style={S.prodImg} />
                  ) : (
                    <div style={{ ...S.prodImg, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                      🍽️
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.prodName}>{p.name}</div>
                    <div style={S.prodCat}>{p.category}</div>
                    <div style={S.prodPrice}>{fmt(p.price)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {qty > 0 ? (
                      <>
                        <button onClick={() => removeFromCart(p.id)} style={S.qtyBtnSm}>−</button>
                        <span style={{ fontWeight: 700, color: '#f0f4ff', minWidth: 18, textAlign: 'center' }}>{qty}</span>
                        <button onClick={() => addToCart(p)} style={{ ...S.qtyBtnSm, background: 'rgba(6,182,212,0.2)', borderColor: 'rgba(6,182,212,0.4)', color: '#06b6d4' }}>+</button>
                      </>
                    ) : (
                      <button onClick={() => addToCart(p)} style={S.addBtn}>+</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ ABA MEU PEDIDO ════════════════════ */
function AbaMeuPedido({ order, kdsLoaded, mesa }: { order: Order | null; kdsLoaded: boolean; mesa: string }) {
  if (!kdsLoaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#475569' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
        <p>Verificando pedido...</p>
      </div>
    </div>
  );

  if (!order) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', minHeight: 300 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>🪑</div>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f0f4ff', marginBottom: 8 }}>Mesa {mesa}</h2>
      <p style={{ color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6 }}>
        Nenhum pedido ativo no momento.<br />
        Vá até a aba <strong style={{ color: '#06b6d4' }}>Cardápio</strong> para fazer seu pedido!
      </p>
    </div>
  );

  const cfg     = STATUS_CFG[order.status] ?? STATUS_CFG['Criado'];
  const stepIdx = PIPELINE.indexOf(order.status);
  const total   = (order.items || []).reduce((a, it) => a + it.price_at_time * it.quantity, 0);

  return (
    <div style={{ padding: '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* status card */}
      <motion.div
        key={order.status}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ borderRadius: 20, border: `1px solid ${cfg.border}`, background: cfg.bg, boxShadow: `0 0 50px ${cfg.glow}`, padding: '24px 20px', textAlign: 'center' }}
      >
        <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>{cfg.emoji}</div>
        <div style={{ fontFamily: "'Syne', system-ui", fontSize: '1.3rem', fontWeight: 800, color: cfg.color, marginBottom: 4 }}>{cfg.label}</div>
        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{cfg.sub}</div>
      </motion.div>

      {/* pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        {PIPELINE.slice(0, 3).map((step, i) => {
          const done = stepIdx > i; const cur = stepIdx === i;
          const sc   = STATUS_CFG[step];
          return (
            <React.Fragment key={step}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', background: done ? 'rgba(52,211,153,0.2)' : cur ? sc.bg : 'rgba(255,255,255,0.04)', border: `2px solid ${done ? '#34d399' : cur ? sc.color : 'rgba(255,255,255,0.1)'}`, transition: 'all 0.4s' }}>
                  {done ? '✓' : sc.emoji}
                </div>
                <span style={{ fontSize: '0.6rem', fontWeight: cur ? 700 : 400, color: done ? '#34d399' : cur ? sc.color : '#334155', textAlign: 'center', maxWidth: 52 }}>
                  {step === 'Criado' ? 'Recebido' : step}
                </span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 2, borderRadius: 2, marginBottom: 18, background: done ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.06)', transition: 'background 0.4s' }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* itens */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontFamily: "'Syne', system-ui", fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seu pedido</span>
          <span style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600, background: 'rgba(59,130,246,0.1)', padding: '3px 10px', borderRadius: 100, border: '1px solid rgba(59,130,246,0.2)' }}>
            {(() => {
              const obs = order.observation || '';
              const m   = obs.match(/Mesa\s+(\d+)/i);
              if (order.senha_pedido && order.senha_pedido !== 0)
                return `Senha ${String(order.senha_pedido).padStart(3,'0')}`;
              if (m) return `Mesa ${m[1]}`;
              return `Pedido #${order.id}`;
            })()}
          </span>
        </div>
        <div style={{ padding: '8px 0' }}>
          {(order.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6', minWidth: 24 }}>{it.quantity}×</span>
              <span style={{ flex: 1, fontSize: '0.9rem', color: '#e2e8f0' }}>{it.product_name}</span>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{fmt(it.price_at_time * it.quantity)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
          <span style={{ fontFamily: "'Syne', system-ui", fontSize: '1.15rem', fontWeight: 800, color: '#f0f4ff' }}>{fmt(total)}</span>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#1e293b' }}>
        Atualizado automaticamente a cada 8 segundos
      </p>
    </div>
  );
}

/* ─────────────────────────── estilos ────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  root: {
    background: '#080c14',
    minHeight: '100vh',
    maxWidth: 480,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: '#f0f4ff',
    position: 'relative',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(13,18,32,0.9)',
    backdropFilter: 'blur(12px)',
    position: 'sticky', top: 0, zIndex: 20,
  },
  logo: { fontFamily: "'Syne', system-ui", fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f4ff' },
  estNome: { fontSize: '0.75rem', fontWeight: 600, color: '#64748b' },
  mesaBadgeSmall: {
    background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)',
    color: '#06b6d4', borderRadius: 100, padding: '3px 10px',
    fontSize: '0.72rem', fontWeight: 700,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(13,18,32,0.6)',
    position: 'sticky', top: 49, zIndex: 19,
  },
  tab: {
    flex: 1, padding: '13px 8px', background: 'none', border: 'none',
    color: '#475569', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
    borderBottom: '2px solid transparent', transition: 'all 0.2s', fontFamily: 'inherit',
  },
  tabActive: { color: '#06b6d4', borderBottom: '2px solid #06b6d4' },
  tabDot: {
    position: 'absolute', top: 8, right: 24,
    width: 8, height: 8, borderRadius: '50%', background: '#34d399',
  },
  searchInput: {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
    padding: '10px 14px', color: '#f0f4ff', fontSize: '0.9rem',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  },
  catScroll: { display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 16px', scrollbarWidth: 'none' },
  catBtn: {
    flexShrink: 0, padding: '6px 14px', borderRadius: 100,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#64748b', fontSize: '0.82rem', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s',
  },
  catBtnActive: { background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)', color: '#06b6d4' },
  prodCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 12,
  },
  prodImg:  { width: 60, height: 60, borderRadius: 10, objectFit: 'cover', flexShrink: 0 } as React.CSSProperties,
  prodName: { fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 2 },
  prodCat:  { fontSize: '0.72rem', color: '#475569', marginBottom: 4 },
  prodPrice:{ fontSize: '0.9rem', fontWeight: 700, color: '#06b6d4' },
  addBtn: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(6,182,212,0.2)', border: '1px solid rgba(6,182,212,0.4)',
    color: '#06b6d4', fontSize: '1.3rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  qtyBtnSm: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#94a3b8', fontSize: '1rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  cartFab: {
    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    maxWidth: 440, width: 'calc(100% - 40px)',
    background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
    border: 'none', borderRadius: 16, padding: '14px 20px',
    display: 'flex', alignItems: 'center', gap: 12,
    color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 8px 32px rgba(6,182,212,0.4)', zIndex: 30,
  },
  cartOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)', zIndex: 100,
    display: 'flex', alignItems: 'flex-end',
  },
  cartSheet: {
    width: '100%', maxWidth: 480, margin: '0 auto',
    background: '#0f172a', borderRadius: '24px 24px 0 0',
    padding: '12px 20px 40px', maxHeight: '85vh', overflowY: 'auto',
  },
  cartHandle: { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 16px' },
  cartRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12, padding: '10px 12px',
  },
  qtyBtn: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#94a3b8', fontSize: '1rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  sendBtn: {
    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff', fontWeight: 800, fontSize: '1rem',
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 20px rgba(16,185,129,0.4)', marginBottom: 10,
  },
  clearBtn: {
    width: '100%', padding: '10px', borderRadius: 12,
    background: 'none', border: '1px solid rgba(255,255,255,0.08)',
    color: '#475569', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
  },
  closeBtn: { background: 'none', border: 'none', color: '#475569', fontSize: '1.1rem', cursor: 'pointer', padding: 4 },
  toast: {
    position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(16,185,129,0.9)', backdropFilter: 'blur(8px)',
    color: '#fff', fontWeight: 700, padding: '12px 24px',
    borderRadius: 100, fontSize: '0.9rem', zIndex: 200,
    boxShadow: '0 8px 24px rgba(16,185,129,0.4)', whiteSpace: 'nowrap',
  },
};