import React, { useEffect, useRef, useState } from 'react';

const PIX_CODE = '00020126330014BR.GOV.BCB.PIX0111121043554355204000053039865802BR5925Ruy Raphaell Silva Montei6009SAO PAULO62140510phJM5ietZS63040573';

type Usage = { used: number; limit: number; reset_date: string } | null;

function getColor(pct: number) {
  if (pct >= 85) return { stroke: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', label: 'Crítico', pulse: true };
  if (pct >= 60) return { stroke: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.25)', label: 'Atenção', pulse: false };
  return { stroke: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)', label: 'Normal', pulse: false };
}

function MiniPizza({ pct, color, size = 36 }: { pct: number; color: string; size?: number }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--fp-border-default)" strokeWidth="4" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)' }}
      />
    </svg>
  );
}

export default function AIUsageBanner({ token }: { token: string }) {
  const [usage, setUsage] = useState<Usage>(null);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/whatsapp-ai/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.usage) setUsage(data.usage);
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    fetchUsage();
    intervalRef.current = setInterval(fetchUsage, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [token]);

  if (!usage) return null;

  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const { stroke, bg, border, label, pulse } = getColor(pct);
  const showReload = pct >= 80;

  const handleCopy = () => {
    navigator.clipboard.writeText(PIX_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <>
      {/* Banner horizontal compacto */}
      <div
        className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
        style={{ background: bg, border: `1px solid ${border}` }}
        onClick={() => setShowModal(true)}
        title="Consumo da IA WhatsApp — clique para detalhes"
      >
        {/* Pizza mini */}
        <div className="relative shrink-0">
          <MiniPizza pct={pct} color={stroke} size={36} />
          <span
            className="absolute inset-0 flex items-center justify-center text-[9px] font-black"
            style={{ color: stroke }}
          >
            {pct}%
          </span>
        </div>

        {/* Barra de progresso + info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stroke }}>
              IA WhatsApp · {label}
              {pulse && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
            </span>
            <span className="text-[10px] text-fptext-muted font-semibold">
              {usage.used.toLocaleString('pt-BR')} / {usage.limit.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--fp-border-default)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: stroke }}
            />
          </div>
        </div>

        {/* Botão recarregar */}
        {showReload && (
          <button
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95"
            style={{ background: stroke }}
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
          >
            Recarregar
          </button>
        )}
      </div>

      {/* Modal PIX */}
      {showModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-fp-border bg-fp-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-fptext-muted">Recarregar IA</p>
                <h2 className="text-lg font-black text-fptext-primary mt-0.5">Pacotes de Mensagens</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="h-8 w-8 rounded-xl border border-fp-border flex items-center justify-center text-fptext-muted hover:bg-fp-hover transition-colors"
              >✕</button>
            </div>

            {/* Uso atual */}
            <div className="rounded-2xl p-3 mb-5 flex items-center gap-3" style={{ background: bg, border: `1px solid ${border}` }}>
              <div className="relative shrink-0">
                <MiniPizza pct={pct} color={stroke} size={52} />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black" style={{ color: stroke }}>
                  {pct}%
                </span>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: stroke }}>Uso atual: {label}</p>
                <p className="text-[11px] text-fptext-muted">{usage.used.toLocaleString('pt-BR')} de {usage.limit.toLocaleString('pt-BR')} mensagens</p>
                <p className="text-[10px] text-fptext-muted mt-0.5">Renova em {new Date(usage.reset_date).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            {/* Pacotes */}
            <div className="space-y-2 mb-5">
              {[
                { label: 'Básico', msgs: '1.000 msgs', price: 'R$ 29', desc: 'Ideal para baixo volume' },
                { label: 'Profissional', msgs: '3.000 msgs', price: 'R$ 59', desc: 'Para operação diária', destaque: true },
                { label: 'Premium', msgs: '8.000 msgs', price: 'R$ 129', desc: 'Alto volume de atendimento' },
              ].map((p) => (
                <div key={p.label} className={`rounded-2xl border p-3 flex items-center justify-between ${p.destaque ? 'border-[#ea1d2c] bg-[#ea1d2c]/5' : 'border-fp-border bg-fp-secondary'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-fptext-primary">{p.label}</span>
                      {p.destaque && <span className="rounded-full bg-[#ea1d2c] px-2 py-0.5 text-[9px] font-black uppercase text-white">Popular</span>}
                    </div>
                    <p className="text-[10px] text-fptext-muted mt-0.5">{p.msgs} · {p.desc}</p>
                  </div>
                  <span className="text-sm font-black text-fptext-primary">{p.price}</span>
                </div>
              ))}
            </div>

            {/* PIX */}
            <div className="rounded-2xl border border-fp-border bg-fp-secondary p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-fptext-muted mb-2">Pague via PIX</p>
              <p className="text-[10px] text-fptext-muted mb-3 leading-relaxed">
                Copie o código PIX, informe o pacote no comprovante e envie para o suporte. Saldo creditado em até 1h útil.
              </p>
              <div className="rounded-xl border border-fp-border bg-fp-card p-2.5 mb-2">
                <p className="text-[9px] font-mono text-fptext-muted break-all leading-relaxed select-all">{PIX_CODE}</p>
              </div>
              <button
                onClick={handleCopy}
                className="w-full rounded-xl py-2.5 text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95"
                style={{ background: copied ? '#22c55e' : '#ea1d2c' }}
              >
                {copied ? '✓ Código copiado!' : 'Copiar código PIX'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
