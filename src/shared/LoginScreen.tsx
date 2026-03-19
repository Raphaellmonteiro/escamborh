import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LandingPage from './LandingPage';

const WA_NUMBER = '5500000000000'; // ← substitua pelo número real
const WA_LINK   = `https://wa.me/${WA_NUMBER}?text=Olá!%20Tenho%20interesse%20no%20FlowPDV`;

export default function LoginScreen({
  onLogin,
  onShowSolicitacao,
  onLicenseError,
}: {
  onLogin: (token: string) => void;
  onShowSolicitacao: () => void;
  onLicenseError: (type: 'bloqueado' | 'trial_expirado') => void;
}) {
  // Se acessou /login diretamente, já abre na tela de login
  const view = window.location.pathname === '/login' ? 'login' : 'landing';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Credencial admin → redireciona para o painel
    if (username === 'admin@rmpvd') {
      window.location.href = '/admin';
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.user) {
          localStorage.setItem('user_cargo',     data.user.cargo      || 'dono');
          localStorage.setItem('user_nome',       data.user.nome       || data.user.username);
          localStorage.setItem('user_permissoes', data.user.permissoes ? JSON.stringify(data.user.permissoes) : '');
        }
        onLogin(data.token);
      } else {
        if (data.status === 'bloqueado'           || data.message === 'Acesso bloqueado') onLicenseError('bloqueado');
        else if (data.status === 'trial_expirado' || data.message === 'Trial expirado')   onLicenseError('trial_expirado');
        else setError(data.message || 'Usuário ou senha incorretos');
      }
    } catch {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    window.location.href = '/';
  };

  // ══════════════════════════════════════════════════════════════════
  // ── TELA DE LOGIN — visual idêntico ao sistema (zinc/white) ───────
  // ══════════════════════════════════════════════════════════════════
  if (view === 'login') return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7" style={{ gap: 8 }}>
          <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f4ff' }}>
            Flow<span style={{ color: '#06b6d4' }}>PDV</span>
          </div>
          <span style={{ fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: 4 }}>
            RM Tecnologia
          </span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="h-[3px] w-full bg-zinc-900" />
          <div className="p-7">
            <h2 className="text-base font-bold text-zinc-900 mb-0.5">Entrar no sistema</h2>
            <p className="text-xs text-zinc-400 mb-6">Usuário e senha para acessar o FlowPDV</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Usuário */}
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Usuário
                </label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="seu.usuario"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 text-sm placeholder:text-zinc-300 outline-none focus:border-zinc-400 focus:bg-white transition-colors"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 text-sm placeholder:text-zinc-300 outline-none focus:border-zinc-400 focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Erro */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-medium"
                  >
                    <AlertCircle size={13} className="flex-shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Botão */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {loading
                  ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Verificando...</>
                  : 'Entrar'}
              </button>
            </form>
          </div>
        </div>

        {/* Ações abaixo do card */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex-1 py-2 text-xs text-zinc-400 hover:text-zinc-600 transition-colors text-left"
          >
            ← Voltar
          </button>

          <div className="w-px h-4 bg-zinc-200" />

          {/* Link admin — abre /admin em nova aba */}
          <a
            href="/admin"
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-2 text-xs text-zinc-400 hover:text-zinc-700 transition-colors text-right flex items-center justify-end gap-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Painel Admin
          </a>
        </div>
      </motion.div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // ── LANDING — renderiza o novo componente premium ─────────────────
  // ══════════════════════════════════════════════════════════════════
  return <LandingPage onShowSolicitacao={onShowSolicitacao} />;
}