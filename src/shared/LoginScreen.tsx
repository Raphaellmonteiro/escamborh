import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { fieldInputClass, fieldLabelClass } from '../components/ui/fieldStyles';
import LandingPage from './LandingPage';

export default function LoginScreen({
  onLogin,
  onShowSolicitacao,
  onLicenseError,
}: {
  onLogin: (token: string) => void;
  onShowSolicitacao: () => void;
  onLicenseError: (type: 'bloqueado' | 'trial_expirado') => void;
}) {
  const view = window.location.pathname === '/login' ? 'login' : 'landing';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (username === 'admin@rmpvd') {
      window.location.href = '/admin';
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.user) {
          localStorage.setItem('user_cargo', data.user.cargo || 'dono');
          localStorage.setItem('user_nome', data.user.nome || data.user.username);
          localStorage.setItem(
            'user_permissoes',
            data.user.permissoes ? JSON.stringify(data.user.permissoes) : '',
          );
        }
        onLogin(data.token);
        return;
      }

      if (data.status === 'bloqueado' || data.message === 'Acesso bloqueado') {
        onLicenseError('bloqueado');
      } else if (data.status === 'trial_expirado' || data.message === 'Trial expirado') {
        onLicenseError('trial_expirado');
      } else {
        setError(data.message || 'Usuário ou senha não conferem');
      }
    } catch {
      setError('Não foi possível conectar. Tente de novo.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    window.location.href = '/';
  };

  if (view === 'login') {
    return (
      <div className="pratori-public-light flex min-h-screen items-center justify-center bg-fp-app px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-1.5 text-center">
            <div className="pratori-text-brand text-2xl font-bold tracking-tight">Pratori</div>
            <p className="text-xs font-medium text-fptext-secondary">Entrar na sua loja · RM Tecnologia</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-fp-border bg-fp-card shadow-[0_8px_28px_rgba(63,62,62,0.07)]">
            <div className="pratori-card-accent-bar w-full" />
            <div className="p-6 sm:p-8">
              <h2 className="mb-1 text-lg font-bold tracking-tight text-fptext-primary">Entrar</h2>
              <p className="mb-6 text-sm leading-relaxed text-fptext-secondary">
                Digite o usuário e a senha da sua loja (fornecidos pela RM Tecnologia).
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={`${fieldLabelClass} mb-1.5 block`}>Usuário</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu.usuario"
                    autoComplete="username"
                    autoCapitalize="none"
                    required
                    className={fieldInputClass}
                  />
                </div>

                <div>
                  <label className={`${fieldLabelClass} mb-1.5 block`}>Senha</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Sua senha"
                      autoComplete="current-password"
                      required
                      className={`${fieldInputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-fptext-muted transition-colors hover:bg-fp-hover hover:text-fptext-primary"
                      aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div className="pratori-alert flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-medium">
                    <AlertCircle size={14} className="shrink-0" />
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="pratori-btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleBack}
              className="flex-1 py-2 text-left text-xs text-fptext-muted transition-colors hover:text-fptext-primary"
            >
              Voltar
            </button>

            <div className="h-4 w-px bg-fp-border" />

            <a
              href="/admin"
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-end gap-1 py-2 text-right text-xs text-fptext-muted transition-colors hover:text-fptext-primary"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Painel Admin
            </a>
          </div>

          <div className="pratori-card-soft mt-4 rounded-2xl p-4 text-center">
            <p className="text-sm font-semibold text-fptext-primary">Quer testar o Pratori?</p>
            <p className="mt-1 text-xs leading-relaxed text-fptext-secondary">
              Peça acesso e a gente explica certinho para o seu negócio.
            </p>
            <button
              type="button"
              onClick={onShowSolicitacao}
              className="pratori-btn-secondary mt-3 inline-flex min-h-[42px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              Pedir acesso
            </button>
          </div>

          <div className="pratori-footer-links mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium">
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Política de Privacidade
            </a>
            <span className="text-fp-border" aria-hidden>
              ·
            </span>
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Termos de Uso
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <LandingPage onShowSolicitacao={onShowSolicitacao} />;
}
