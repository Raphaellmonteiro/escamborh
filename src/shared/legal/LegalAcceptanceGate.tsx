import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, Shield } from 'lucide-react';
import { LEGAL_ACCEPTANCE_BUNDLE_LABEL, LEGAL_ACCEPTANCE_SUMMARY } from '../../legal/legalAcceptSummaries';
import { LEGAL_BUNDLE_VERSION } from '../../legal/legalBundleVersion';
import { Button } from '../../components/ui/Card';

export default function LegalAcceptanceGate({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checked || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/legal/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bundle_version: LEGAL_BUNDLE_VERSION }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'Não foi possível registrar o aceite. Tente novamente.');
        return;
      }
      onAccepted();
    } catch {
      setError('Erro de conexão. Verifique a internet e tente de novo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-y-auto bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[min(92dvh,640px)] sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-zinc-100 bg-zinc-50 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-white">
              <Shield size={22} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-zinc-900">Privacidade e Termos</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Pacote legal <span className="font-mono font-semibold text-zinc-700">{LEGAL_ACCEPTANCE_BUNDLE_LABEL}</span>
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Resumo</p>
            <div className="mt-2 max-h-[min(42vh,320px)] overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm leading-relaxed text-zinc-700 sm:max-h-[min(50vh,380px)]">
              {LEGAL_ACCEPTANCE_SUMMARY.split('\n\n').map((block, i) => (
                <p key={i} className={i > 0 ? 'mt-3' : ''}>
                  {block}
                </p>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-100 bg-white px-3 py-3">
              <p className="text-xs font-semibold text-zinc-600">Documentos completos</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <a
                  href="/privacidade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
                >
                  <FileText size={16} aria-hidden />
                  Política de Privacidade
                </a>
                <a
                  href="/termos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
                >
                  <FileText size={16} aria-hidden />
                  Termos de Uso
                </a>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 transition-colors hover:border-zinc-300">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-sm leading-snug text-zinc-800">
                Li o resumo acima e concordo com a <strong>Política de Privacidade</strong> e os <strong>Termos de Uso</strong>{' '}
                na versão <span className="font-mono text-zinc-600">{LEGAL_BUNDLE_VERSION}</span>. Confirmo que posso abrir os
                textos completos nos links.
              </span>
            </label>

            {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
          </div>

          <div className="shrink-0 border-t border-zinc-100 bg-white px-5 py-4 sm:px-6">
            <Button type="submit" className="w-full py-3 text-sm font-bold" disabled={!checked || loading}>
              {loading ? 'Registrando…' : 'Continuar para o sistema'}
            </Button>
            <p className="mt-2 text-center text-[11px] text-zinc-400">O aceite é registrado com seu usuário e data no servidor.</p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
