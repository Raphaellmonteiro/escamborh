/**
 * TabIntegracoes.tsx
 * Aba de Integrações — N8N, OpenAI/GPT e webhooks personalizados.
 * Fase 8. Requer migration whatsappIntegrations.ts e endpoints /api/whatsapp/ai/integrations.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plug, RefreshCw, Save, Zap } from 'lucide-react';
import { Button } from '../../components/ui/Card';
import { fieldInputClass, fieldLabelClass, fieldSelectClass } from '../../components/ui/fieldStyles';
import { Spinner } from '../../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../../components/ui/screenChrome';

type Integration = {
  id: number;
  type: 'n8n' | 'openai' | 'webhook_custom';
  config_json: Record<string, unknown>;
  enabled: boolean;
};

type IntegrationMap = Record<'n8n' | 'openai' | 'webhook_custom', Integration | null>;

type APIResponse = {
  success?: boolean;
  integrations?: Integration[];
  error?: string;
};

const PROVIDER_SECRET = '__FLOWPDV_REDACTED__';

type Props = { token: string };

export default function TabIntegracoes({ token }: Props) {
  const [data,     setData]     = useState<IntegrationMap>({ n8n: null, openai: null, webhook_custom: null });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [testing,  setTesting]  = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

  // Local form state — keyed by integration type
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({
    n8n:            { webhook_url: '', token: '', events: 'message,order_created' },
    openai:         { api_key: '', model: 'gpt-4o-mini', temperature: '0.7', max_tokens: '1000', custom_prompt: '' },
    webhook_custom: { url: '', secret: '' },
  });
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    n8n: false, openai: false, webhook_custom: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/whatsapp/ai/integrations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: APIResponse = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Erro ao carregar integrações.');
        return;
      }
      const map: IntegrationMap = { n8n: null, openai: null, webhook_custom: null };
      const nextEnabled: Record<string, boolean> = { n8n: false, openai: false, webhook_custom: false };
      const nextForms = { ...forms };

      for (const int of json.integrations ?? []) {
        map[int.type] = int;
        nextEnabled[int.type] = int.enabled;
        const cfg = int.config_json as Record<string, string>;
        if (int.type === 'n8n') {
          nextForms.n8n = {
            webhook_url: String(cfg.webhook_url ?? ''),
            token:       String(cfg.token ?? ''),
            events:      Array.isArray(cfg.events) ? (cfg.events as string[]).join(',') : String(cfg.events ?? 'message,order_created'),
          };
        } else if (int.type === 'openai') {
          nextForms.openai = {
            api_key:       cfg.api_key === PROVIDER_SECRET ? '' : String(cfg.api_key ?? ''),
            model:         String(cfg.model ?? 'gpt-4o-mini'),
            temperature:   String(cfg.temperature ?? '0.7'),
            max_tokens:    String(cfg.max_tokens ?? '1000'),
            custom_prompt: String(cfg.custom_prompt ?? ''),
          };
        } else if (int.type === 'webhook_custom') {
          nextForms.webhook_custom = {
            url:    String(cfg.url ?? ''),
            secret: cfg.secret === PROVIDER_SECRET ? '' : String(cfg.secret ?? ''),
          };
        }
      }
      setData(map);
      setEnabled(nextEnabled);
      setForms(nextForms);
    } catch {
      setError('Falha de conexão.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const setField = (type: string, key: string, value: string) =>
    setForms((f) => ({ ...f, [type]: { ...f[type], [key]: value } }));

  const handleSave = async (type: 'n8n' | 'openai' | 'webhook_custom') => {
    setSaving(type);
    setFeedback((f) => ({ ...f, [type]: undefined as any }));
    try {
      let config: Record<string, unknown> = {};
      if (type === 'n8n') {
        config = {
          webhook_url: forms.n8n.webhook_url,
          token:       forms.n8n.token,
          events:      forms.n8n.events.split(',').map((s) => s.trim()).filter(Boolean),
        };
      } else if (type === 'openai') {
        config = {
          api_key:       forms.openai.api_key || PROVIDER_SECRET,
          model:         forms.openai.model,
          temperature:   parseFloat(forms.openai.temperature) || 0.7,
          max_tokens:    parseInt(forms.openai.max_tokens, 10) || 1000,
          custom_prompt: forms.openai.custom_prompt,
        };
      } else {
        config = {
          url:    forms.webhook_custom.url,
          secret: forms.webhook_custom.secret || PROVIDER_SECRET,
        };
      }

      const existing = data[type];
      const method   = existing ? 'PUT' : 'POST';
      const url      = existing
        ? `/api/whatsapp/ai/integrations/${existing.id}`
        : '/api/whatsapp/ai/integrations';

      const res  = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, config_json: config, enabled: enabled[type] }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback((f) => ({ ...f, [type]: { type: 'error', text: json.error ?? 'Erro ao salvar.' } }));
      } else {
        setFeedback((f) => ({ ...f, [type]: { type: 'success', text: 'Salvo com sucesso.' } }));
        void load();
      }
    } catch {
      setFeedback((f) => ({ ...f, [type]: { type: 'error', text: 'Falha de conexão.' } }));
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (type: string, id: number) => {
    setTesting(type);
    try {
      const res  = await fetch(`/api/whatsapp/ai/integrations/${id}/test`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error ?? 'Erro no teste.');
      } else {
        alert('Evento de teste enviado com sucesso!');
      }
    } catch {
      alert('Falha de conexão.');
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <div className="flex min-h-[10rem] items-center justify-center"><Spinner /></div>;
  if (error)   return <div className={`${adminOpsInsetPanelClass} p-4 text-sm text-red-600`}>{error}</div>;

  // ── Toggle helper ───────────────────────────────────────────────────────
  const ToggleSwitch = ({ type }: { type: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={enabled[type]}
      onClick={() => setEnabled((e) => ({ ...e, [type]: !e[type] }))}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled[type] ? 'bg-fp-accent' : 'bg-fp-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled[type] ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
        <p className={adminSectionEyebrowClass}>Integrações externas</p>
        <h2 className="mt-1 text-base font-black text-fptext-primary">N8N, OpenAI e Webhooks</h2>
        <p className="mt-1 text-sm text-fptext-muted">
          Conecte o WhatsApp IA com serviços externos. As chaves de API são criptografadas antes de serem salvas.
        </p>
      </div>

      {/* ── N8N ──────────────────────────────────────────────────────────── */}
      <div className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-fptext-muted" />
            <h3 className="text-sm font-black text-fptext-primary">N8N</h3>
            {data.n8n?.enabled && <CheckCircle2 size={14} className="text-emerald-500" />}
          </div>
          <ToggleSwitch type="n8n" />
        </div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabelClass}>Webhook URL</label>
            <input className={fieldInputClass} placeholder="https://seu-n8n.com/webhook/..." value={forms.n8n?.webhook_url ?? ''} onChange={(e) => setField('n8n', 'webhook_url', e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelClass}>Token de autenticação (opcional)</label>
            <input className={fieldInputClass} type="password" placeholder="••••••" value={forms.n8n?.token ?? ''} onChange={(e) => setField('n8n', 'token', e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelClass}>Eventos (vírgula)</label>
            <input className={fieldInputClass} placeholder="message,order_created" value={forms.n8n?.events ?? ''} onChange={(e) => setField('n8n', 'events', e.target.value)} />
            <p className="mt-1 text-xs text-fptext-muted">Ex.: message, order_created, order_status_changed</p>
          </div>
        </div>
        {feedback.n8n && (
          <p className={`mt-3 text-sm ${feedback.n8n.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
            {feedback.n8n.text}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => handleSave('n8n')} disabled={saving === 'n8n'}>
            {saving === 'n8n' ? <Spinner /> : <><Save size={13} /><span className="ml-1">Salvar</span></>}
          </Button>
          {data.n8n && (
            <Button variant="ghost" onClick={() => handleTest('n8n', data.n8n!.id)} disabled={testing === 'n8n'}>
              {testing === 'n8n' ? <Spinner /> : 'Testar'}
            </Button>
          )}
        </div>
      </div>

      {/* ── OpenAI / GPT ─────────────────────────────────────────────────── */}
      <div className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <h3 className="text-sm font-black text-fptext-primary">OpenAI / GPT</h3>
            {data.openai?.enabled && <CheckCircle2 size={14} className="text-emerald-500" />}
          </div>
          <ToggleSwitch type="openai" />
        </div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabelClass}>API Key</label>
            <input className={fieldInputClass} type="password" placeholder="sk-..." value={forms.openai?.api_key ?? ''} onChange={(e) => setField('openai', 'api_key', e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={fieldLabelClass}>Modelo</label>
              <select className={fieldSelectClass} value={forms.openai?.model ?? 'gpt-4o-mini'} onChange={(e) => setField('openai', 'model', e.target.value)}>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
              </select>
            </div>
            <div>
              <label className={fieldLabelClass}>Temperatura</label>
              <input className={fieldInputClass} type="number" step="0.1" min="0" max="2" value={forms.openai?.temperature ?? '0.7'} onChange={(e) => setField('openai', 'temperature', e.target.value)} />
            </div>
            <div>
              <label className={fieldLabelClass}>Max tokens</label>
              <input className={fieldInputClass} type="number" step="100" min="100" max="4000" value={forms.openai?.max_tokens ?? '1000'} onChange={(e) => setField('openai', 'max_tokens', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={fieldLabelClass}>Prompt personalizado (opcional)</label>
            <textarea className={`${fieldInputClass} min-h-[4rem] resize-y`} placeholder="Instrução adicional para o GPT..." value={forms.openai?.custom_prompt ?? ''} onChange={(e) => setField('openai', 'custom_prompt', e.target.value)} />
          </div>
        </div>
        {feedback.openai && (
          <p className={`mt-3 text-sm ${feedback.openai.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
            {feedback.openai.text}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => handleSave('openai')} disabled={saving === 'openai'}>
            {saving === 'openai' ? <Spinner /> : <><Save size={13} /><span className="ml-1">Salvar</span></>}
          </Button>
          {data.openai && (
            <Button variant="ghost" onClick={() => handleTest('openai', data.openai!.id)} disabled={testing === 'openai'}>
              {testing === 'openai' ? <Spinner /> : 'Testar'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Webhook personalizado ─────────────────────────────────────────── */}
      <div className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug size={16} className="text-fptext-muted" />
            <h3 className="text-sm font-black text-fptext-primary">Webhook personalizado</h3>
            {data.webhook_custom?.enabled && <CheckCircle2 size={14} className="text-emerald-500" />}
          </div>
          <ToggleSwitch type="webhook_custom" />
        </div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabelClass}>URL do webhook</label>
            <input className={fieldInputClass} placeholder="https://..." value={forms.webhook_custom?.url ?? ''} onChange={(e) => setField('webhook_custom', 'url', e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelClass}>Secret (opcional)</label>
            <input className={fieldInputClass} type="password" placeholder="••••••" value={forms.webhook_custom?.secret ?? ''} onChange={(e) => setField('webhook_custom', 'secret', e.target.value)} />
          </div>
        </div>
        {feedback.webhook_custom && (
          <p className={`mt-3 text-sm ${feedback.webhook_custom.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
            {feedback.webhook_custom.text}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => handleSave('webhook_custom')} disabled={saving === 'webhook_custom'}>
            {saving === 'webhook_custom' ? <Spinner /> : <><Save size={13} /><span className="ml-1">Salvar</span></>}
          </Button>
          {data.webhook_custom && (
            <Button variant="ghost" onClick={() => handleTest('webhook_custom', data.webhook_custom!.id)} disabled={testing === 'webhook_custom'}>
              {testing === 'webhook_custom' ? <Spinner /> : 'Testar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
