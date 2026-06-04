/**
 * LoginScreen.tsx — Tela de login do Pratory com vídeo de apresentação.
 *
 * COMO USAR:
 * 1. Coloque o arquivo `Anunciopratory.mp4` em: public/videos/Anunciopratory.mp4
 * 2. Coloque o arquivo `logopratory.jpeg` em:   public/images/logopratory.jpeg
 * 3. Substitua o seu LoginScreen.tsx atual por este arquivo.
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface LoginScreenProps {
  onLogin: (token: string) => void;
  onShowSolicitacao?: () => void;
  onLicenseError?: (type: 'bloqueado' | 'trial_expirado') => void;
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function LoginScreen({ onLogin, onShowSolicitacao, onLicenseError }: LoginScreenProps) {
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [videoMuted, setVideoMuted] = useState(true);
  const videoRef                    = useRef<HTMLVideoElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Preencha usuário e senha.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.tipo === 'bloqueado' || data?.tipo === 'trial_expirado') {
          onLicenseError?.(data.tipo);
          return;
        }
        setError(data?.message || data?.error || 'Usuário ou senha incorretos.');
        return;
      }
      if (data?.token) onLogin(data.token);
      else setError('Resposta inválida do servidor.');
    } catch {
      setError('Erro de conexão. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMute = () => {
    setVideoMuted(v => {
      if (videoRef.current) videoRef.current.muted = !v;
      return !v;
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-zinc-950 overflow-hidden">

      {/* ── Lado esquerdo: vídeo ─────────────────────────────────────────── */}
      <div className="relative w-full lg:w-[58%] xl:w-[62%] flex-shrink-0 overflow-hidden
                      h-[38vh] sm:h-[44vh] lg:h-screen">

        {/* Vídeo de fundo */}
        <video
          ref={videoRef}
          src="/videos/Anunciopratory.mp4"
          autoPlay
          loop
          muted={videoMuted}
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Gradiente sobre o vídeo */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent lg:bg-gradient-to-r" />

        {/* Overlay de marca */}
        <div className="absolute bottom-6 left-6 right-6 lg:bottom-10 lg:left-10 z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-10 rounded-full bg-[#EA1D2C]" />
            <p className="text-white/60 text-sm font-medium tracking-wide uppercase">
              Sistema de Gestão
            </p>
          </div>
          <h1 className="text-white text-3xl lg:text-4xl xl:text-5xl font-black leading-tight tracking-tight">
            PDV, pedidos e delivery<br className="hidden lg:block" />
            <span className="text-[#EA1D2C]"> para seu negócio.</span>
          </h1>
          <p className="mt-3 text-white/50 text-sm lg:text-base max-w-md">
            Caixa, cozinha, cardápio online, mesas, estoque e relatórios — tudo em um lugar.
          </p>
        </div>

        {/* Botão de mudo */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={videoMuted ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center
                     rounded-full bg-black/40 text-white/70 hover:bg-black/60
                     hover:text-white transition-all backdrop-blur-sm"
        >
          {videoMuted ? (
            /* ícone mudo */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            /* ícone com som */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>

        {/* Badge LIVE / AO VIVO */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5
                        rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#EA1D2C] animate-pulse" />
          <span className="text-white/70 text-[11px] font-bold uppercase tracking-wider">Conheça o Pratory</span>
        </div>
      </div>

      {/* ── Lado direito: formulário ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center
                      px-6 py-10 lg:px-12 xl:px-16
                      bg-zinc-950 lg:bg-zinc-950">

        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <img
                src="/images/logopratory.jpeg"
                alt="Pratory"
                className="w-24 h-24 rounded-[28px] object-cover shadow-2xl
                           ring-2 ring-[#EA1D2C]/30"
              />
              {/* brilho decorativo */}
              <div className="absolute -inset-1 rounded-[32px] bg-[#EA1D2C]/10 blur-xl -z-10" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Pratory</h2>
            <p className="text-zinc-500 text-sm mt-1">Acesse sua conta</p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Usuário */}
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Usuário
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="seu-estabelecimento"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
                className="w-full h-12 px-4 rounded-xl bg-zinc-900 border border-zinc-800
                           text-white placeholder-zinc-600 text-sm
                           focus:outline-none focus:border-[#EA1D2C]/60 focus:ring-1
                           focus:ring-[#EA1D2C]/30 transition-all"
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full h-12 px-4 rounded-xl bg-zinc-900 border border-zinc-800
                           text-white placeholder-zinc-600 text-sm
                           focus:outline-none focus:border-[#EA1D2C]/60 focus:ring-1
                           focus:ring-[#EA1D2C]/30 transition-all"
              />
            </div>

            {/* Mensagem de erro */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-start gap-2 px-4 py-3 rounded-xl
                             bg-red-950/50 border border-red-800/60 text-red-300 text-sm"
                >
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botão entrar */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#EA1D2C] hover:bg-[#C9101E]
                         active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-black text-sm uppercase tracking-wider
                         transition-all shadow-lg shadow-[#EA1D2C]/20 mt-2"
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

          {/* Divisor */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs">ou</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Solicitar acesso */}
          {onShowSolicitacao && (
            <button
              type="button"
              onClick={onShowSolicitacao}
              className="w-full h-11 rounded-xl border border-zinc-800 text-zinc-400
                         hover:border-zinc-600 hover:text-zinc-200 hover:bg-zinc-900
                         text-sm font-semibold transition-all"
            >
              Solicitar acesso ao Pratory
            </button>
          )}

          {/* Rodapé */}
          <p className="text-center text-zinc-700 text-[11px] mt-8 leading-relaxed">
            Ao acessar, você concorda com os{' '}
            <a href="/termos" target="_blank" rel="noopener noreferrer"
               className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors">
              Termos de Uso
            </a>{' '}
            e{' '}
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