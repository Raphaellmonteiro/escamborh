/**
 * TabDisparos.tsx
 * Aba de Disparos e Campanhas — cria, agenda e monitora campanhas de WhatsApp.
 * Fase 7. Requer migration whatsappCampaigns.ts e endpoints /api/whatsapp/ai/campaigns.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, PlusCircle, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Card';
import { fieldInputClass, fieldLabelClass, fieldSelectClass } from '../../components/ui/fieldStyles';
import { Spinner } from '../../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../../components/ui/screenChrome';

type Campaign = {
  id: number;
  name: string;
  message: string;
  target_type: string;
  status: string;
  scheduled_at: string | null;
  sent_count: number;
  created_at: string;
};

type FormState = {
  name: string;
  message: string;
  target_type: string;
  scheduled_at: string;
};

const TARGET_LABELS: Record<string, string> = {
  all:          'Todos os clientes',
  inactive_30d: 'Inativos há 30 dias',
  inactive_60d: 'Inativos há 60 dias',
};

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-zinc-100 text-zinc-600',
  scheduled: 'bg-blue-100 text-blue-700',
  running:   'bg-amber-100 text-amber-700',
  done:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  draft:     'Rascunho',
  scheduled: 'Agendada',
  running:   'Enviando',
  done:      'Concluída',
  cancelled: 'Cancelada',
};

const EMPTY_FORM: FormState = { name: '', message: '', target_type: 'all', scheduled_at: '' };

type Props = { token: string };

export default function TabDisparos({ token }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [feedback,  setFeedback]  = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/whatsapp/ai/campaigns', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Erro ao carregar campanhas.');
      } else {
        setCampaigns(json.campaigns ?? []);
      }
    } catch {
      setError('Falha de conexão.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {
        name:        form.name,
        message:     form.message,
        target_type: form.target_type,
      };
      if (form.scheduled_at) body.scheduled_at = form.scheduled_at;

      const res  = await fetch('/api/whatsapp/ai/campaigns', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ type: 'error', text: json.error ?? 'Erro ao criar campanha.' });
      } else {
        setFeedback({ type: 'success', text: 'Campanha criada com sucesso.' });
        setForm(EMPTY_FORM);
        setShowForm(false);
        void load();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Falha de conexão.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: number) => {
    if (!window.confirm('Confirmar disparo imediato desta campanha?')) return;
    try {
      const res  = await fetch(`/api/whatsapp/ai/campaigns/${id}/send`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error ?? 'Erro ao disparar campanha.');
      } else {
        void load();
      }
    } catch {
      alert('Falha de conexão.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Cancelar e remover esta campanha?')) return;
    try {
      const res  = await fetch(`/api/whatsapp/ai/campaigns/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error ?? 'Erro ao remover campanha.');
      } else {
        void load();
      }
    } catch {
      alert('Falha de conexão.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className={`${adminOpsSurfaceCardClass} flex items-start justify-between gap-4 p-4 sm:p-5`}>
        <div>
          <p className={adminSectionEyebrowClass}>Campanhas</p>
          <h2 className="mt-1 text-base font-black text-fptext-primary">Disparos e Campanhas</h2>
          <p className="mt-1 text-sm text-fptext-muted">
            Crie mensagens de reativação, promoções e cupons para envio em massa via WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            <PlusCircle size={14} />
            <span className="ml-1.5">Nova campanha</span>
          </Button>
        </div>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
          <p className="mb-4 text-sm font-black text-fptext-primary">Nova campanha</p>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className={fieldLabelClass}>Nome da campanha</label>
              <input
                className={fieldInputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Promoção de fim de semana"
                required
              />
            </div>

            <div>
              <label className={fieldLabelClass}>Segmento de clientes</label>
              <select
                className={fieldSelectClass}
                value={form.target_type}
                onChange={(e) => setForm((f) => ({ ...f, target_type: e.target.value }))}
              >
                {Object.entries(TARGET_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={fieldLabelClass}>Mensagem</label>
              <textarea
                className={`${fieldInputClass} min-h-[5rem] resize-y`}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Olá! Temos uma promoção especial para você hoje 🎉"
                required
              />
              <p className="mt-1 text-xs text-fptext-muted">{form.message.length} caracteres</p>
            </div>

            <div>
              <label className={fieldLabelClass}>Agendamento (opcional)</label>
              <input
                type="datetime-local"
                className={fieldInputClass}
                value={form.scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              />
            </div>

            {feedback && (
              <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                {feedback.text}
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setFeedback(null); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner /> : <><PlusCircle size={14} /><span className="ml-1">Criar campanha</span></>}
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading && !showForm && (
        <div className="flex min-h-[10rem] items-center justify-center"><Spinner /></div>
      )}

      {!loading && error && (
        <div className={`${adminOpsInsetPanelClass} p-4 text-sm text-red-600`}>{error}</div>
      )}

      {!loading && !error && campaigns.length === 0 && !showForm && (
        <div className={`${adminOpsSurfaceCardClass} flex flex-col items-center gap-3 p-10 text-center`}>
          <Megaphone size={32} className="text-fptext-muted" />
          <p className="text-sm text-fptext-muted">Nenhuma campanha criada ainda.</p>
        </div>
      )}

      {!loading && campaigns.length > 0 && (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id} className={`${adminOpsSurfaceCardClass} flex items-start gap-3 p-4`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fptext-primary">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[c.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fptext-muted line-clamp-2">{c.message}</p>
                <p className="mt-1 text-[11px] text-fptext-muted">
                  {TARGET_LABELS[c.target_type] ?? c.target_type}
                  {c.scheduled_at && ` · Agendada: ${new Date(c.scheduled_at).toLocaleString('pt-BR')}`}
                  {c.sent_count > 0 && ` · ${c.sent_count} enviados`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {(c.status === 'draft' || c.status === 'scheduled') && (
                  <button
                    type="button"
                    onClick={() => void handleSend(c.id)}
                    title="Disparar agora"
                    className="flex items-center gap-1 rounded-lg bg-fp-accent px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  >
                    <Send size={12} /> Disparar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(c.id)}
                  title="Remover campanha"
                  className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
