import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2 } from 'lucide-react';

// ── Segmentos disponíveis e em produção ───────────────────────────────────────
const SEGMENTOS_ATIVOS = [
  { value: 'Restaurante',    icon: '🍽️', label: 'Restaurante' },
  { value: 'Fast Food',      icon: '🍔', label: 'Fast Food' },
  { value: 'Bar',            icon: '🍺', label: 'Bar & Pub' },
  { value: 'Adega',          icon: '🍷', label: 'Adega de Bebidas' },
  { value: 'Barbearia',      icon: '✂️', label: 'Barbearia' },
  { value: 'Comércio Geral', icon: '🏪', label: 'Comércio Geral' },
];

const SEGMENTOS_PRODUCAO = [
  { value: 'Salao',    icon: '💇', label: 'Salão de Beleza' },
  { value: 'Mercadinho', icon: '🛒', label: 'Mercadinho' },
  { value: 'Padaria',  icon: '🥐', label: 'Padaria' },
  { value: 'Varejo',   icon: '👗', label: 'Varejo de Roupas' },
];

// ── Máscaras ──────────────────────────────────────────────────────────────────
function maskCNPJ(v: string) {
  return v.replace(/\D/g, '').slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
function maskCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}
function maskPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SolicitacaoModal({ isOpen, onClose }: Props) {
  const [step, setStep]         = useState<'form' | 'success'>('form');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const [form, setForm] = useState({
    segmento:            '',
    nome_estabelecimento:'',
    razao_social:        '',
    documento_tipo:      'CNPJ',
    documento_numero:    '',
    nome_responsavel:    '',
    email:               '',
    whatsapp:            '',
    cidade:              '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.segmento) { setError('Selecione o segmento do seu negócio.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/public/solicitar-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao enviar');
      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => { setStep('form'); setError(''); setForm({ segmento:'', nome_estabelecimento:'', razao_social:'', documento_tipo:'CNPJ', documento_numero:'', nome_responsavel:'', email:'', whatsapp:'', cidade:'' }); }, 400);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl relative"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 pb-4">
              <div>
                <h2 className="text-xl font-black text-white">Solicitar Acesso Gratuito</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>
                  Experimente o FlowPDV por 7 dias sem compromisso
                </p>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors mt-0.5">
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            {/* Success state */}
            {step === 'success' ? (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                  <CheckCircle2 size={56} className="text-emerald-400 mb-4" />
                </motion.div>
                <h3 className="text-lg font-black text-white mb-2">Solicitação enviada!</h3>
                <p className="text-sm mb-6" style={{ color: 'rgba(148,163,184,0.7)' }}>
                  Entraremos em contato em breve pelo WhatsApp ou e-mail para liberar seu acesso.
                </p>
                <button onClick={handleClose}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)' }}>
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">

                {/* Segmentos */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3"
                    style={{ color: 'rgba(148,163,184,0.5)' }}>
                    Qual o segmento do seu negócio?
                  </p>

                  {/* Ativos */}
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span style={{ color: 'rgba(52,211,153,0.8)' }}>Disponíveis</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {SEGMENTOS_ATIVOS.map(seg => (
                      <button key={seg.value} type="button"
                        onClick={() => set('segmento', seg.value)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all relative"
                        style={{
                          background: form.segmento === seg.value ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.04)',
                          border: form.segmento === seg.value ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                        }}>
                        {form.segmento === seg.value && (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
                        )}
                        <span className="text-xl">{seg.icon}</span>
                        <span className="text-[11px] font-semibold leading-tight" style={{ color: form.segmento === seg.value ? '#93c5fd' : 'rgba(203,213,225,0.8)' }}>
                          {seg.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Em produção */}
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    <span style={{ color: 'rgba(251,191,36,0.7)' }}>Em produção</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {SEGMENTOS_PRODUCAO.map(seg => (
                      <div key={seg.value}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center relative opacity-50 cursor-not-allowed"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <span className="absolute top-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                          Em produção
                        </span>
                        <span className="text-xl grayscale">{seg.icon}</span>
                        <span className="text-[11px] font-semibold leading-tight" style={{ color: 'rgba(148,163,184,0.5)' }}>
                          {seg.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nome do Estabelecimento */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                    style={{ color: 'rgba(148,163,184,0.5)' }}>
                    🏢 Nome do Estabelecimento *
                  </label>
                  <input required value={form.nome_estabelecimento}
                    onChange={e => set('nome_estabelecimento', e.target.value)}
                    placeholder="Ex: Restaurante da Sônia"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(100,116,139,0.6)' }}>
                    Nome fantasia — aparecerá nos recibos
                  </p>
                </div>

                {/* Razão Social */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                    style={{ color: 'rgba(148,163,184,0.5)' }}>
                    Razão Social (Opcional)
                  </label>
                  <input value={form.razao_social}
                    onChange={e => set('razao_social', e.target.value)}
                    placeholder="Ex: Sônia Silva ME"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(100,116,139,0.6)' }}>
                    Opcional — usado em notas fiscais
                  </p>
                </div>

                {/* Documento */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                      style={{ color: 'rgba(148,163,184,0.5)' }}>Tipo de Documento</label>
                    <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                      {['CNPJ','CPF'].map(tipo => (
                        <button key={tipo} type="button" onClick={() => { set('documento_tipo', tipo); set('documento_numero', ''); }}
                          className="flex-1 py-3 text-sm font-black transition-all"
                          style={{
                            background: form.documento_tipo === tipo ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.03)',
                            color: form.documento_tipo === tipo ? '#93c5fd' : 'rgba(148,163,184,0.5)',
                          }}>
                          {tipo}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                      style={{ color: 'rgba(148,163,184,0.5)' }}>
                      Número do {form.documento_tipo} *
                    </label>
                    <input required value={form.documento_numero}
                      onChange={e => set('documento_numero', form.documento_tipo === 'CNPJ' ? maskCNPJ(e.target.value) : maskCPF(e.target.value))}
                      placeholder={form.documento_tipo === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                </div>

                {/* Responsável + Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                      style={{ color: 'rgba(148,163,184,0.5)' }}>👤 Nome do Responsável *</label>
                    <input required value={form.nome_responsavel}
                      onChange={e => set('nome_responsavel', e.target.value)}
                      placeholder="Seu nome completo"
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                      style={{ color: 'rgba(148,163,184,0.5)' }}>✉️ E-mail *</label>
                    <input required type="email" value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                </div>

                {/* WhatsApp + Cidade */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                      style={{ color: 'rgba(148,163,184,0.5)' }}>📱 WhatsApp *</label>
                    <input required value={form.whatsapp}
                      onChange={e => set('whatsapp', maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                      style={{ color: 'rgba(148,163,184,0.5)' }}>📍 Cidade *</label>
                    <input required value={form.cidade}
                      onChange={e => set('cidade', e.target.value)}
                      placeholder="São Paulo - SP"
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                </div>

                {/* Erro */}
                {error && (
                  <div className="px-4 py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                    ⚠️ {error}
                  </div>
                )}

                {/* Submit */}
                <motion.button
                  type="submit" disabled={loading}
                  whileHover={{ scale: loading ? 1 : 1.01 }} whileTap={{ scale: loading ? 1 : 0.98 }}
                  className="w-full py-4 rounded-2xl font-black text-white text-sm relative overflow-hidden disabled:opacity-60 disabled:pointer-events-none"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #0ea5e9 100%)', boxShadow: '0 8px 32px rgba(37,99,235,0.4)' }}>
                  {loading ? '⏳ Enviando...' : '🚀 Solicitar Acesso Gratuito'}
                </motion.button>

                <p className="text-center text-[10px]" style={{ color: 'rgba(100,116,139,0.5)' }}>
                  Sem cartão de crédito · 7 dias grátis · Cancele quando quiser
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}