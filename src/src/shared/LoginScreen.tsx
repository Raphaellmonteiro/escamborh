/**
 * LoginScreen.tsx — Tela de login do Pratory
 */
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LoginScreenProps {
  onLogin: (token: string) => void;
  onShowSolicitacao?: () => void;
  onLicenseError?: (type: 'bloqueado' | 'trial_expirado') => void;
}

export default function LoginScreen({ onLogin, onShowSolicitacao, onLicenseError }: LoginScreenProps) {
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const videoRef                    = useRef<HTMLVideoElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Preencha usuário e senha.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.tipo === 'bloqueado' || data?.tipo === 'trial_expirado') { onLicenseError?.(data.tipo); return; }
        setError(data?.message || data?.error || 'Usuário ou senha incorretos.');
        return;
      }
      if (data?.token) onLogin(data.token);
      else setError('Resposta inválida do servidor.');
    } catch { setError('Erro de conexão. Verifique sua internet.'); }
    finally { setLoading(false); }
  };

  const toggleMute = () => {
    setVideoMuted(v => { if (videoRef.current) videoRef.current.muted = !v; return !v; });
  };

  const features = [
    { icon: '🧾', label: 'PDV & Caixa' },
    { icon: '🍽️', label: 'Cardápio Online' },
    { icon: '🛵', label: 'Delivery' },
    { icon: '📊', label: 'Relatórios' },
    { icon: '🤖', label: 'IA no WhatsApp' },
    { icon: '🍳', label: 'Cozinha' },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-zinc-950 overflow-hidden">

      {/* ── LADO ESQUERDO ─────────────────────────────────────────── */}
      <div className="relative w-full lg:w-[62%] flex-shrink-0 h-[55vh] sm:h-[60vh] lg:h-screen overflow-hidden">

        {/* Fundo: mascote usando PDV */}
        <img
          src="/images/mascote-pdv.jpeg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Gradiente escuro */}
        <div className="absolute inset-0"
             style={{ background: 'linear-gradient(135deg, rgba(9,9,11,0.15) 0%, rgba(9,9,11,0.05) 50%, rgba(9,9,11,0.75) 100%)' }} />

        {/* Gradiente lateral direito para fundir */}
        <div className="absolute inset-y-0 right-0 w-24"
             style={{ background: 'linear-gradient(to right, transparent, rgba(9,9,11,0.98))' }} />

        {/* ── Mascote sozinho — canto inferior esquerdo, fundo preto removido via screen ── */}
        <div className="absolute bottom-0 left-0 z-20 hidden sm:block pointer-events-none"
             style={{ width: '210px', marginBottom: '40px' }}>
          <img
            src="/images/mascote.png"
            alt="Mascote Pratory"
            className="w-full block"
            style={{ mixBlendMode: 'screen' }}
          />
        </div>

        {/* ── Vídeo flutuante — canto superior direito ── */}
        {!videoError && (
          <div className="absolute top-6 right-6 z-20 hidden lg:block"
               style={{ width: '260px' }}>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/20"
                 style={{ aspectRatio: '9/16' }}>
              <video
                ref={videoRef}
                src="/videos/Anunciopratory.mp4"
                autoPlay loop muted={videoMuted} playsInline preload="auto"
                onError={() => setVideoError(true)}
                className="w-full h-full object-cover"
              />
              <button
                type="button" onClick={toggleMute}
                aria-label={videoMuted ? 'Ativar som' : 'Silenciar'}
                className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center
                           rounded-full bg-black/60 text-white/80 hover:bg-black/80 transition-all"
              >
                {videoMuted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>
              <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5
                              rounded-full bg-black/60 border border-white/10">
                <span className="w-1 h-1 rounded-full bg-[#EA1D2C] animate-pulse" />
                <span className="text-white/70 text-[8px] font-bold uppercase tracking-wide">Ao vivo</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Textos — parte inferior, respeitando mascote ── */}
        <div className="absolute bottom-6 z-10 lg:bottom-8"
             style={{ left: '220px', right: '20px' }}>
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-2xl
                          bg-black/50 backdrop-blur-sm border border-white/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EA1D2C] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EA1D2C]" />
            </span>
            <span className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Vendas em tempo real</span>
            <span className="text-[#4ade80] text-xs font-black">R$ 1.162,31</span>
          </div>

          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-1 h-7 rounded-full bg-[#EA1D2C]" />
            <p className="text-white/60 text-xs font-medium tracking-widest uppercase">Sistema de Gestão</p>
          </div>
          <h1 className="text-white text-xl lg:text-2xl xl:text-3xl font-black leading-tight">
            PDV, pedidos e delivery<br />
            <span className="text-[#EA1D2C]">para seu negócio.</span>
          </h1>
          <p className="mt-2 text-white/50 text-xs max-w-xs">
            Caixa, cozinha, cardápio online, mesas, estoque e relatórios — tudo em um lugar.
          </p>
        </div>

        {/* Badge topo esquerdo */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5
                        rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#EA1D2C] animate-pulse" />
          <span className="text-white/70 text-[11px] font-bold uppercase tracking-wider">Conheça o Pratory</span>
        </div>
      </div>

      {/* ── LADO DIREITO ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center
                      px-6 py-8 lg:px-10 xl:px-14 bg-zinc-950">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative mb-3">
              <img
                src="/images/logopratory.jpeg"
                alt="Pratory"
                className="w-20 h-20 rounded-[24px] object-cover shadow-2xl ring-2 ring-[#EA1D2C]/40"
              />
              <div className="absolute -inset-1 rounded-[28px] bg-[#EA1D2C]/15 blur-xl -z-10" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">Pratory</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Acesse sua conta</p>
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {features.map(f => (
              <div key={f.label}
                   className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl
                              bg-zinc-900 border border-zinc-800">
                <span className="text-lg">{f.icon}</span>
                <span className="text-zinc-400 text-[10px] font-semibold text-center leading-tight">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Usuário</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="seu-estabelecimento"
                autoCapitalize="none" autoCorrect="off" autoComplete="username" required
                className="w-full h-11 px-4 rounded-xl bg-zinc-900 border border-zinc-800
                           text-white placeholder-zinc-600 text-sm
                           focus:outline-none focus:border-[#EA1D2C]/60 focus:ring-1
                           focus:ring-[#EA1D2C]/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Senha</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" required
                className="w-full h-11 px-4 rounded-xl bg-zinc-900 border border-zinc-800
                           text-white placeholder-zinc-600 text-sm
                           focus:outline-none focus:border-[#EA1D2C]/60 focus:ring-1
                           focus:ring-[#EA1D2C]/30 transition-all"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="flex items-start gap-2 px-4 py-3 rounded-xl
                             bg-red-950/50 border border-red-800/60 text-red-300 text-sm"
                >
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit" disabled={loading}
              className="w-full h-11 rounded-xl bg-[#EA1D2C] hover:bg-[#C9101E]
                         active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-black text-sm uppercase tracking-wider
                         transition-all shadow-lg shadow-[#EA1D2C]/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Entrando…
                </span>
              ) : 'Entrar no sistema'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs">ou</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {onShowSolicitacao && (
            <button
              type="button" onClick={onShowSolicitacao}
              className="w-full h-10 rounded-xl border border-zinc-800 text-zinc-400
                         hover:border-zinc-600 hover:text-zinc-200 hover:bg-zinc-900
                         text-sm font-semibold transition-all"
            >
              Solicitar acesso ao Pratory
            </button>
          )}

          <p className="text-center text-zinc-700 text-[11px] mt-6 leading-relaxed">
            Ao acessar, você concorda com os{' '}
            <a href="/termos" target="_blank" rel="noopener noreferrer"
               className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors">
              Termos de Uso
            </a>{' '}e{' '}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer"
               className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors">
              Política de Privacidade
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}