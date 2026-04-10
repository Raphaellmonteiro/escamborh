/**
 * PedidoRastreamento.tsx
 * Rota pública: /delivery/:slug/pedido/:id
 * O cliente vê o status em tempo real (polling 5s).
 * A timeline segue o tipo de atendimento: entrega, retirada ou consumo no local.
 */
import React, { useEffect, useState, useRef, useMemo } from 'react';

type AtendimentoTimeline = 'entrega' | 'retirada' | 'consumo_local';

interface PublicPixConfig {
  pix_chave?: string;
  pix_nome?: string;
  pix_cidade?: string;
  pix_payload_estatico?: string;
  qr_code_image_base64?: string | null;
  payment_provider?: string | null;
  payment_external_id?: string | null;
  payment_external_reference?: string | null;
  payment_status?: string | null;
  payment_expires_at?: string | null;
  whatsapp?: string;
  desconto_pix?: number;
}

interface PublicPixPayment {
  id?: string | null;
  payment_id?: string | null;
  provider?: string | null;
  external_id?: string | null;
  external_reference?: string | null;
  status?: string | null;
  qr_code_text?: string | null;
  qr_code_base64?: string | null;
  qr_code_image_base64?: string | null;
  expires_at?: string | null;
}

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
  /** `delivery` | `retirada` (cardápio online). */
  canal?: string | null;
  /** Com `canal=retirada`: `levar` = retirada no balcão; `local` = consumo no estabelecimento. Com entrega costuma ser `local` (legado). */
  tipo_retirada?: string | null;
  observation?: string | null;
  payment_pix?: PublicPixPayment | null;
  config_pix?: PublicPixConfig | null;
}

type PedidoTrackingApiPedido = Omit<PedidoData, 'estabelecimento' | 'payment_pix' | 'config_pix'> & {
  estabelecimento?: string;
};

/** Resposta de GET /public/delivery/:slug/pedido/:id (pedido vem aninhado). */
interface PedidoTrackingApiResponse {
  pedido: PedidoTrackingApiPedido;
  nome_estabelecimento?: string | null;
  payment_pix?: PublicPixPayment | null;
  config_pix?: PublicPixConfig | null;
}

interface RegeneratePixApiResponse {
  success?: boolean;
  error?: string;
  pagamento_status?: string | null;
  payment_pix?: PublicPixPayment | null;
  config_pix?: PublicPixConfig | null;
}

type TimeField = 'created_at' | 'saiu_entrega_at' | 'entregue_at';

interface StepDef {
  id: string;
  /** Status já normalizados (aliases aplicados). */
  matchStatuses: string[];
  label: string;
  desc: string;
  emoji: string;
  timeField?: TimeField;
}

// Compatibiliza nomes de status com o pipeline (mesmos valores usados em Operações/Cozinha)
const ALIAS: Record<string, string> = {
  Pronto: 'Pronto para Entrega',
  'Concluído': 'Entregue',
  concluido: 'Entregue',
};

const PIX_WAITING_PAYMENT_STATUSES = new Set([
  'aguardando_pagamento',
  'aguardando_confirmacao',
  'pending',
  'pendente',
  'in_process',
]);

const PIX_PAID_PAYMENT_STATUSES = new Set([
  'pago',
  'paid',
  'approved',
]);

function normalizeStatus(s: string): string {
  const t = String(s || '').trim();
  return ALIAS[t] ?? t;
}

function resolveAtendimentoTimeline(pedido: Pick<PedidoData, 'canal' | 'tipo_retirada' | 'observation' | 'endereco'>): AtendimentoTimeline {
  const canal = String(pedido.canal || '').trim().toLowerCase();
  const tipo = String(pedido.tipo_retirada || '').trim().toLowerCase();
  if (canal === 'delivery') return 'entrega';
  if (canal === 'retirada') {
    if (tipo === 'local') return 'consumo_local';
    const obs = String(pedido.observation || '').trim();
    if (/^consumo no local\.?/i.test(obs)) return 'consumo_local';
    return 'retirada';
  }
  const end = String(pedido.endereco || '').trim();
  if (end) return 'entrega';
  return 'retirada';
}

const STEPS_ENTREGA: StepDef[] = [
  { id: 'enviado', matchStatuses: ['Criado'], label: 'Pedido enviado', emoji: '01', desc: 'Seu pedido foi enviado e aguarda confirmação do restaurante.' },
  { id: 'recebido', matchStatuses: ['Pedido Recebido'], label: 'Pedido recebido', emoji: '02', desc: 'O restaurante aceitou seu pedido.' },
  { id: 'preparo', matchStatuses: ['Em Preparo'], label: 'Em preparo', emoji: '03', desc: 'A cozinha está preparando seu pedido.' },
  { id: 'pronto', matchStatuses: ['Pronto para Entrega'], label: 'Pronto', emoji: '04', desc: 'Pedido pronto e aguardando envio para entrega.' },
  { id: 'saiu', matchStatuses: ['Saiu para Entrega'], label: 'Saiu para entrega', emoji: '05', desc: 'Seu pedido está a caminho.', timeField: 'saiu_entrega_at' },
  { id: 'entregue', matchStatuses: ['Entregue'], label: 'Entregue', emoji: '06', desc: 'Pedido entregue no endereço.', timeField: 'entregue_at' },
];

const STEPS_RETIRADA: StepDef[] = [
  { id: 'enviado', matchStatuses: ['Criado'], label: 'Pedido enviado', emoji: '01', desc: 'Seu pedido foi enviado e aguarda confirmação do restaurante.' },
  { id: 'recebido', matchStatuses: ['Pedido Recebido'], label: 'Pedido recebido', emoji: '02', desc: 'O restaurante aceitou seu pedido.' },
  { id: 'preparo', matchStatuses: ['Em Preparo'], label: 'Em preparo', emoji: '03', desc: 'A cozinha está preparando seu pedido.' },
  {
    id: 'pronto_retirada',
    matchStatuses: ['Pronto para Entrega', 'Saiu para Entrega'],
    label: 'Pronto para retirada',
    emoji: '04',
    desc: 'Seu pedido está pronto para ser retirado no estabelecimento.',
    timeField: 'saiu_entrega_at',
  },
  { id: 'retirado', matchStatuses: ['Entregue'], label: 'Retirado', emoji: '05', desc: 'Pedido retirado. Bom apetite!', timeField: 'entregue_at' },
];

const STEPS_CONSUMO_LOCAL: StepDef[] = [
  { id: 'enviado', matchStatuses: ['Criado'], label: 'Pedido enviado', emoji: '01', desc: 'Seu pedido foi enviado e aguarda confirmação do restaurante.' },
  { id: 'recebido', matchStatuses: ['Pedido Recebido'], label: 'Pedido recebido', emoji: '02', desc: 'O restaurante aceitou seu pedido.' },
  { id: 'preparo', matchStatuses: ['Em Preparo'], label: 'Em preparo', emoji: '03', desc: 'A cozinha está preparando seu pedido.' },
  {
    id: 'pronto_local',
    matchStatuses: ['Pronto para Entrega', 'Saiu para Entrega'],
    label: 'Pronto no local',
    emoji: '04',
    desc: 'Pedido pronto para consumo no estabelecimento.',
    timeField: 'saiu_entrega_at',
  },
  { id: 'concluido', matchStatuses: ['Entregue'], label: 'Concluído', emoji: '05', desc: 'Pedido finalizado. Obrigado!', timeField: 'entregue_at' },
];

function stepsForTimeline(mode: AtendimentoTimeline): StepDef[] {
  if (mode === 'retirada') return STEPS_RETIRADA;
  if (mode === 'consumo_local') return STEPS_CONSUMO_LOCAL;
  return STEPS_ENTREGA;
}

function getCurrentStepIndex(status: string, defs: StepDef[]): number {
  const norm = normalizeStatus(status);
  for (let i = defs.length - 1; i >= 0; i--) {
    if (defs[i].matchStatuses.includes(norm)) return i;
  }
  return 0;
}

function normalizePaymentStatus(status: unknown): string {
  return String(status || '').trim().toLowerCase();
}

function isPixPaidStatus(status: unknown): boolean {
  return PIX_PAID_PAYMENT_STATUSES.has(normalizePaymentStatus(status));
}

function isPixWaitingStatus(status: unknown): boolean {
  const key = normalizePaymentStatus(status);
  return key ? PIX_WAITING_PAYMENT_STATUSES.has(key) : false;
}

function parseDateValue(d?: string | null): Date | null {
  if (!d) return null;
  const value = d.includes('T') ? d : d.replace(' ', 'T');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtHora(d?: string | null): string {
  const date = parseDateValue(d);
  return date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

const fmt = (v: number) => `R$ ${(Number.isFinite(v) ? v : 0).toFixed(2).replace('.', ',')}`;

function fmtDataHora(d?: string | null): string {
  const date = parseDateValue(d);
  return date
    ? date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
}

function getDeliveryClienteToken(slug: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return localStorage.getItem(`dc_token_${slug}`);
  } catch {
    return null;
  }
}

interface Props {
  slug: string;
  pedidoId: number;
  /** Layout compacto dentro de modal (sem cabeçalho de página inteira). */
  embedded?: boolean;
}

export default function PedidoRastreamento({ slug, pedidoId, embedded }: Props) {
  const [pedido, setPedido]     = useState<PedidoData | null>(null);
  const [error, setError]       = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pixRegenerando, setPixRegenerando] = useState(false);
  const [pixRegenerarErro, setPixRegenerarErro] = useState<string | null>(null);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimeoutRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPedidoResponse = (body: PedidoTrackingApiResponse) => {
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
      payment_pix: body.payment_pix ?? null,
      config_pix: body.config_pix ?? null,
    };
    setPedido(mapped);
    setError(false);
  };

  const fetchPedido = async () => {
    try {
      const res = await fetch(`/public/delivery/${slug}/pedido/${pedidoId}`);
      if (!res.ok) { setError(true); return; }
      const body = (await res.json()) as PedidoTrackingApiResponse;
      applyPedidoResponse(body);
    } catch { setError(true); }
  };

  useEffect(() => {
    fetchPedido();
    intervalRef.current = setInterval(() => { fetchPedido(); }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [slug, pedidoId]);

  // Relógio vivo
  const [hora, setHora] = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const rootStyle: React.CSSProperties = embedded
    ? { ...s.root, minHeight: 0, background: '#09090b' }
    : s.root;

  const timelineMode = useMemo(
    () => (pedido ? resolveAtendimentoTimeline(pedido) : 'entrega'),
    [pedido]
  );

  const steps = useMemo(() => stepsForTimeline(timelineMode), [timelineMode]);

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

  const stepIdx    = getCurrentStepIndex(pedido.status, steps);
  const stNorm     = String(pedido.status || '').trim().toLowerCase();
  const isCancelado = stNorm === 'cancelado';
  const isEntregue  = stNorm === 'entregue' || stNorm.startsWith('conclu');
  const step        = steps[stepIdx];
  const isPix = String(pedido.pagamento_tipo || '').trim().toLowerCase() === 'pix';
  const paymentPix = pedido.payment_pix ?? null;
  const configPix = pedido.config_pix ?? null;
  const pixStatusKeys = [
    normalizePaymentStatus(pedido.pagamento_status),
    normalizePaymentStatus(configPix?.payment_status),
    normalizePaymentStatus(paymentPix?.status),
  ].filter(Boolean);
  const pixPago = isPix && (
    isPixPaidStatus(pedido.pagamento_status)
    || isPixPaidStatus(configPix?.payment_status)
    || isPixPaidStatus(paymentPix?.status)
  );
  const pixPendente = isPix && !pixPago && (
    isPixWaitingStatus(pedido.pagamento_status)
    || isPixWaitingStatus(configPix?.payment_status)
    || isPixWaitingStatus(paymentPix?.status)
    || (pixStatusKeys.length === 0 && Boolean(paymentPix || configPix))
  );
  const pixExpiresAt = paymentPix?.expires_at || configPix?.payment_expires_at || null;
  const pixStatusAtual = normalizePaymentStatus(paymentPix?.status || configPix?.payment_status);
  const pixExpirado = isPix && !pixPago && (
    (() => {
      if (pixStatusAtual === 'expired') return true;
      const expiresAt = parseDateValue(pixExpiresAt);
      return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
    })()
  );
  const pixPayload = String(paymentPix?.qr_code_text || configPix?.pix_payload_estatico || '').trim();
  const pixQrImageBase64 =
    paymentPix?.qr_code_base64 ||
    paymentPix?.qr_code_image_base64 ||
    configPix?.qr_code_image_base64 ||
    null;
  const mostrarPixPendente = isPix && pixPendente && !pixExpirado && Boolean(pixPayload || pixQrImageBase64);
  const pagamentoConcluido = isPix ? pixPago : pedido.pagamento_status === 'pago';

  const copiarPix = async () => {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = pixPayload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setPixCopiado(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setPixCopiado(false), 4000);
  };

  const gerarNovoPix = async () => {
    if (pixRegenerando) return;

    setPixRegenerarErro(null);
    setPixRegenerando(true);

    try {
      const clienteToken = getDeliveryClienteToken(slug);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (clienteToken) {
        headers.Authorization = `Bearer ${clienteToken}`;
      }

      const res = await fetch(`/public/delivery/${slug}/pedido/${pedidoId}/gerar-novo-pix`, {
        method: 'POST',
        headers,
      });

      const body = (await res.json().catch(() => null)) as RegeneratePixApiResponse | null;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || 'Nao foi possivel gerar um novo Pix agora.');
      }

      setPixCopiado(false);
      setPedido((current) => {
        if (!current) return current;
        return {
          ...current,
          pagamento_status: String(body.pagamento_status ?? current.pagamento_status ?? ''),
          payment_pix: body.payment_pix ?? null,
          config_pix: body.config_pix ?? null,
        };
      });
    } catch (err) {
      setPixRegenerarErro(err instanceof Error ? err.message : 'Nao foi possivel gerar um novo Pix agora.');
    } finally {
      setPixRegenerando(false);
    }
  };

  const tipoAtendimentoLabel =
    timelineMode === 'entrega'
      ? 'Entrega no endereço'
      : timelineMode === 'retirada'
        ? 'Retirada no estabelecimento'
        : 'Consumo no local';

  const enderecoTitulo = timelineMode === 'entrega' ? 'Endereço de entrega' : 'Local';

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
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 10 }}>{tipoAtendimentoLabel}</div>
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
              {steps.map((st, i) => {
                const done    = i < stepIdx;
                const current = i === stepIdx;
                const timeVal = st.timeField ? pedido[st.timeField] : undefined;
                return (
                  <div key={st.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: i < steps.length - 1 ? 0 : 0 }}>
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
                      {i < steps.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 24, background: done ? '#4ade80' : 'rgba(255,255,255,0.08)', margin: '3px 0' }} />
                      )}
                    </div>
                    {/* Conteúdo */}
                    <div style={{ paddingTop: 4, paddingBottom: i < steps.length - 1 ? 20 : 4 }}>
                        <div style={{ fontSize: 14, fontWeight: current ? 700 : 500, color: done ? '#4ade80' : current ? '#fafafa' : '#71717a' }}>
                        {st.label}
                      </div>
                      {current && !isEntregue && (
                        <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 2, animation: 'pulse 2s infinite' }}>
                          ● Em andamento
                        </div>
                      )}
                      {st.id === 'enviado' && (
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{fmtHora(pedido.created_at)}</div>
                      )}
                      {timeVal && st.timeField && st.id !== 'enviado' && (
                        <div style={{ fontSize: 11, color: st.timeField === 'entregue_at' ? '#67e8f9' : '#475569', marginTop: 2 }}>{fmtHora(timeVal)}</div>
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
          {pedido.endereco && timelineMode === 'entrega' && (
            <div style={{ ...s.section, marginTop: 12 }}>
              <div style={s.sectionTitle}>{enderecoTitulo}</div>
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
                background: pagamentoConcluido
                  ? 'rgba(34,211,238,0.15)'
                  : pixExpirado
                    ? 'rgba(239,68,68,0.15)'
                    : 'rgba(251,191,36,0.15)',
                color: pagamentoConcluido
                  ? '#67e8f9'
                  : pixExpirado
                    ? '#fca5a5'
                    : '#fbbf24',
              }}>
                {pagamentoConcluido ? '✓ Pago' : pixExpirado ? 'Pix expirado' : 'Aguardando'}
              </span>
            </div>
          </div>

          {mostrarPixPendente && (
            <div style={{ ...s.section, marginTop: 12, border: '1px solid rgba(251,191,36,0.28)', background: 'rgba(251,191,36,0.08)' }}>
              <div style={s.sectionTitle}>Retomar pagamento Pix</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#fcd34d', fontSize: 16, fontWeight: 900 }}>Pix pendente</div>
                  <div style={{ color: '#fde68a', fontSize: 13, marginTop: 4 }}>
                    Continue o pagamento com o mesmo QR Code deste pedido.
                  </div>
                  {pixExpiresAt && (
                    <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700, marginTop: 8 }}>
                      Válido até {fmtDataHora(pixExpiresAt)}
                    </div>
                  )}
                </div>
                <div style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(251,191,36,0.16)',
                  border: '1px solid rgba(251,191,36,0.26)',
                  color: '#fcd34d',
                  fontSize: 11,
                  fontWeight: 800,
                }}>
                  Aguardando pagamento
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <div style={{ background: '#ffffff', borderRadius: 18, padding: 14, boxShadow: '0 18px 40px rgba(0,0,0,0.18)' }}>
                  <img
                    src={
                      pixQrImageBase64
                        ? `data:image/png;base64,${pixQrImageBase64}`
                        : `https://api.qrserver.com/v1/create-qr-code/?size=192x192&ecc=M&data=${encodeURIComponent(pixPayload)}`
                    }
                    alt="QR Code Pix do pedido"
                    width={192}
                    height={192}
                    style={{ width: 192, height: 192, maxWidth: '100%', borderRadius: 12, objectFit: 'contain', display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              </div>

              {pixPayload && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#fde68a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Pix copia e cola
                  </div>
                  <div style={{
                    marginTop: 8,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(9,9,11,0.86)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f4f4f5',
                    fontSize: 12,
                    lineHeight: 1.55,
                    fontFamily: "'Roboto Mono', monospace",
                    wordBreak: 'break-all',
                  }}>
                    {pixPayload}
                  </div>
                  <button
                    type="button"
                    onClick={copiarPix}
                    style={{
                      width: '100%',
                      marginTop: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: 'none',
                      background: pixCopiado ? '#0891b2' : '#f8fafc',
                      color: pixCopiado ? '#ecfeff' : '#09090b',
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {pixCopiado ? 'Código Pix copiado' : 'Copiar código Pix'}
                  </button>
                </div>
              )}
            </div>
          )}

          {isPix && pixExpirado && !pagamentoConcluido && (
            <div style={{ ...s.section, marginTop: 12, border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.08)' }}>
              <div style={s.sectionTitle}>Pix expirado</div>
              <div style={{ color: '#fca5a5', fontSize: 16, fontWeight: 900 }}>A cobranca Pix deste pedido expirou.</div>
              <div style={{ color: '#fecaca', fontSize: 13, marginTop: 6 }}>
                Gere um novo Pix para continuar o pagamento deste mesmo pedido.
              </div>
              {pixExpiresAt && (
                <div style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700, marginTop: 10 }}>
                  Expirado em {fmtDataHora(pixExpiresAt)}
                </div>
              )}
              {pixRegenerarErro && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(127,29,29,0.32)',
                  border: '1px solid rgba(248,113,113,0.25)',
                  color: '#fecaca',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}>
                  {pixRegenerarErro}
                </div>
              )}
              <button
                type="button"
                onClick={gerarNovoPix}
                disabled={pixRegenerando}
                style={{
                  width: '100%',
                  marginTop: 14,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: 'none',
                  background: pixRegenerando ? 'rgba(248,250,252,0.25)' : '#f8fafc',
                  color: pixRegenerando ? '#e4e4e7' : '#09090b',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: pixRegenerando ? 'wait' : 'pointer',
                }}
              >
                {pixRegenerando ? 'Gerando novo Pix...' : 'Gerar novo Pix'}
              </button>
            </div>
          )}

          {/* Botão refazer pedido */}
          <a href={`/delivery/${slug}`} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:24, padding:'14px', background:'rgba(255,255,255,0.92)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, color:'#09090b', fontWeight:800, fontSize:14, textDecoration:'none', transition:'all .2s' }}>
            Fazer novo pedido
          </a>
        </div>

        {/* Rodapé */}
        <div style={{ textAlign:'center', color:'#a1a1aa', fontSize:11, padding:'16px 0 32px' }}>
          Atualização automática a cada 5 segundos · Pedido online
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
