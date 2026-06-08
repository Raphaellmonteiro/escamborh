import React, { useEffect, useState, useRef } from 'react';

const PIX_CODE = '00020126330014BR.GOV.BCB.PIX0111121043554355204000053039865802BR5925Ruy Raphaell Silva Montei6009SAO PAULO62140510phJM5ietZS63040573';

type Usage = { used: number; limit: number; reset_date: string } | null;

function getColor(pct: number) {
  if (pct >= 85) return { stroke: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'Crítico' };
  if (pct >= 60) return { stroke: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Atenção' };
  return { stroke: '#22c55e', text: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'Normal' };
}

function PizzaChart({ pct, color }: { pct: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--fp-border-default)" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={color} strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)' }}
      />
    </svg>
  );
}

export default function AIUsageWidget({ token }: { token: string }) {
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
  const { stroke, text, bg, label } = getColor(pct);
  const showReload = pct >= 80;

  const handleCopy = () => {
    navigator.clipboard.writeText(PIX_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <>
      {/* Widget na sidebar */}
      <div
        style={{ background: bg, borderColor: stroke + '33' }}
        className="mx-3 my-2 rounded-2xl border p-3 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
        onClick={() => setShowModal(true)}
        title="Consumo da IA — clique para detalhes"
      >
        <div className="flex items-center gap-3">
          {/* Pizza */}
          <div className="relative shrink-0">
            <PizzaChart pct={pct} color={stroke} />
            <span
              className="absolute inset-0 flex items-center justify-center text-[11px] font-black"
              style={{ color: text }}
            >
              {pct}%
            </span>
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-fptext-muted">IA WhatsApp</p>
            <p className="text-xs font-bold mt-0.5" style={{ color: text }}>{label}</p>
            <p className="text-[10px] text-fptext-muted mt-0.5">
              {usage.used.toLocaleString('pt-BR')} / {usage.limit.toLocaleString('pt-BR')} msgs
            </p>
            {showReload && (
              <button
                className="mt-1.5 w-full rounded-lg py-1 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95"
                style={{ background: stroke }}
                onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
              >
                Recarregar
              </button>
            )}
          </div>
        </div>
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
            {/* Header */}
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
            <div
              className="rounded-2xl p-3 mb-5 flex items-center gap-3"
              style={{ background: bg, borderColor: stroke + '44', border: '1px solid' }}
            >
              <div className="relative shrink-0">
                <PizzaChart pct={pct} color={stroke} />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black" style={{ color: text }}>
                  {pct}%
                </span>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: text }}>Uso atual: {label}</p>
                <p className="text-[11px] text-fptext-muted">{usage.used.toLocaleString('pt-BR')} de {usage.limit.toLocaleString('pt-BR')} mensagens</p>
                <p className="text-[10px] text-fptext-muted mt-0.5">
                  Renova em {new Date(usage.reset_date).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>

            {/* Pacotes */}
            <div className="space-y-2 mb-5">
              {[
                { label: 'Básico', msgs: '1.000 msgs', price: 'R$ 29', desc: 'Ideal para baixo volume' },
                { label: 'Profissional', msgs: '3.000 msgs', price: 'R$ 59', desc: 'Para operação diária', destaque: true },
                { label: 'Premium', msgs: '8.000 msgs', price: 'R$ 129', desc: 'Alto volume de atendimento' },
              ].map((p) => (
                <div
                  key={p.label}
                  className={`rounded-2xl border p-3 flex items-center justify-between transition-all ${
                    p.destaque
                      ? 'border-[#ea1d2c] bg-[#ea1d2c]/5'
                      : 'border-fp-border bg-fp-secondary'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-fptext-primary">{p.label}</span>
                      {p.destaque && (
                        <span className="rounded-full bg-[#ea1d2c] px-2 py-0.5 text-[9px] font-black uppercase text-white">Popular</span>
                      )}
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
                Copie o código PIX abaixo, informe o pacote desejado no comprovante e envie para o suporte. Seu saldo será creditado em até 1h útil.
              </p>
              <div className="rounded-xl border border-fp-border bg-fp-card p-2.5 mb-2">
                <p className="text-[9px] font-mono text-fptext-muted break-all leading-relaxed select-all">
                  {PIX_CODE}
                </p>
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
