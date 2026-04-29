import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { PUBLIC_SEGMENT_NOTE, PUBLIC_SEGMENT_OPTIONS } from '../../config/publicSegments';
import { fieldInputClass, fieldLabelClass } from '../../components/ui/fieldStyles';

const SEGMENTOS_ATIVOS = PUBLIC_SEGMENT_OPTIONS;

const INITIAL_FORM = {
  segmento: '',
  nome_estabelecimento: '',
  razao_social: '',
  documento_tipo: 'CNPJ',
  documento_numero: '',
  nome_responsavel: '',
  email: '',
  whatsapp: '',
  cidade: '',
} as const;

function maskCNPJ(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCPF(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function maskPhone(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SolicitacaoModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...INITIAL_FORM });

  const set = (key: keyof typeof INITIAL_FORM, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetState = () => {
    setStep('form');
    setError('');
    setLoading(false);
    setForm({ ...INITIAL_FORM });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.segmento) {
      setError('Selecione o segmento da sua operação.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/public/solicitar-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Erro ao enviar');
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    window.setTimeout(resetState, 250);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="my-auto flex w-full max-w-lg min-h-0 max-h-[min(92dvh,100svh)] flex-col overflow-hidden rounded-t-2xl border border-fp-border bg-fp-card shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-fp-border px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-fptext-primary sm:text-xl">Solicitar acesso</h2>
                <p className="mt-1 text-sm text-fptext-muted">
                  Preencha os dados da sua operação para solicitar uma avaliação do Pratory.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="shrink-0 rounded-lg p-2 text-fptext-muted transition-colors hover:bg-fp-hover hover:text-fptext-primary"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
              {step === 'success' ? (
                <div className="space-y-4 text-center">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="mx-auto flex w-fit items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 p-3"
                    >
                      <CheckCircle2 size={32} className="text-emerald-700" />
                    </motion.div>
                    <h3 className="mt-4 text-lg font-black text-fptext-primary">Solicitação recebida</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fptext-muted">
                      Nossa equipe vai entrar em contato por WhatsApp ou e-mail para orientar os próximos passos.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="rounded-2xl border border-fp-border bg-fp-secondary px-4 py-4">
                    <p className="text-sm font-semibold text-fptext-primary">
                      Atendimento para operações de alimentação.
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                      O retorno é feito com base nas informações enviadas no cadastro.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className={`${fieldLabelClass} mb-2 block`}>Segmento da operação</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {SEGMENTOS_ATIVOS.map((seg) => {
                          const isSelected = form.segmento === seg.value;

                          return (
                            <button
                              key={seg.value}
                              type="button"
                              onClick={() => set('segmento', seg.value)}
                              aria-pressed={isSelected}
                              className={`relative flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-center transition-colors ${
                                isSelected
                                  ? 'border-fp-accent bg-fp-input text-fptext-primary'
                                  : 'border-fp-border bg-fp-secondary text-fptext-secondary hover:bg-fp-hover'
                              }`}
                            >
                              {isSelected ? (
                                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-fp-accent" />
                              ) : null}
                              <span className="text-xl leading-none">{seg.icon}</span>
                              <span className="text-[11px] font-semibold leading-tight">{seg.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <p className="rounded-xl border border-fp-border bg-fp-secondary px-3 py-2 text-xs leading-relaxed text-fptext-muted">
                      {PUBLIC_SEGMENT_NOTE}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className={fieldLabelClass}>Nome do estabelecimento *</label>
                    <input
                      required
                      value={form.nome_estabelecimento}
                      onChange={(e) => set('nome_estabelecimento', e.target.value)}
                      placeholder="Ex: Sabor da Praça"
                      className={fieldInputClass}
                    />
                    <p className="text-xs text-fptext-muted">Nome fantasia usado no atendimento.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className={fieldLabelClass}>Razão social</label>
                    <input
                      value={form.razao_social}
                      onChange={(e) => set('razao_social', e.target.value)}
                      placeholder="Opcional"
                      className={fieldInputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={fieldLabelClass}>Tipo de documento</label>
                      <div className="flex rounded-2xl border border-fp-border bg-fp-secondary p-1">
                        {(['CNPJ', 'CPF'] as const).map((tipo) => {
                          const isSelected = form.documento_tipo === tipo;

                          return (
                            <button
                              key={tipo}
                              type="button"
                              onClick={() => {
                                set('documento_tipo', tipo);
                                set('documento_numero', '');
                              }}
                              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                                isSelected
                                  ? 'bg-fp-card text-fptext-primary shadow-sm'
                                  : 'text-fptext-muted hover:bg-fp-hover hover:text-fptext-primary'
                              }`}
                            >
                              {tipo}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className={fieldLabelClass}>Número do {form.documento_tipo} *</label>
                      <input
                        required
                        value={form.documento_numero}
                        onChange={(e) =>
                          set(
                            'documento_numero',
                            form.documento_tipo === 'CNPJ'
                              ? maskCNPJ(e.target.value)
                              : maskCPF(e.target.value),
                          )
                        }
                        placeholder={
                          form.documento_tipo === 'CNPJ'
                            ? '00.000.000/0000-00'
                            : '000.000.000-00'
                        }
                        className={fieldInputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={fieldLabelClass}>Responsável *</label>
                      <input
                        required
                        value={form.nome_responsavel}
                        onChange={(e) => set('nome_responsavel', e.target.value)}
                        placeholder="Nome completo"
                        className={fieldInputClass}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={fieldLabelClass}>E-mail *</label>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => set('email', e.target.value)}
                        placeholder="seu@email.com"
                        className={fieldInputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={fieldLabelClass}>WhatsApp *</label>
                      <input
                        required
                        value={form.whatsapp}
                        onChange={(e) => set('whatsapp', maskPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        className={fieldInputClass}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={fieldLabelClass}>Cidade *</label>
                      <input
                        required
                        value={form.cidade}
                        onChange={(e) => set('cidade', e.target.value)}
                        placeholder="São Paulo - SP"
                        className={fieldInputClass}
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:pointer-events-none disabled:opacity-60"
                    >
                      {loading ? 'Enviando...' : 'Enviar solicitação'}
                    </button>

                    <p className="text-center text-xs text-fptext-muted">
                      Sem cartão de crédito · teste inicial sujeito à validação do cadastro.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
