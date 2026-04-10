import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CreditCard,
  MessageSquareText,
  RefreshCw,
  Save,
  Store,
} from 'lucide-react';
import { Button } from '../components/ui/Card';
import { fieldInputClass, fieldLabelClass, fieldSelectClass } from '../components/ui/fieldStyles';
import { Spinner } from '../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../components/ui/screenChrome';

type JsonRecord = Record<string, unknown>;

type ChatbotApiResponse = {
  success?: boolean;
  configured?: boolean;
  defaults?: {
    chatbot_enabled?: boolean;
    provider?: string | null;
    model?: string | null;
    system_prompt?: string | null;
    provider_config_json?: string | null;
  } | null;
  config?: {
    tenant_id?: number;
    chatbot_enabled?: boolean;
    provider?: string | null;
    model?: string | null;
    system_prompt?: string | null;
    provider_config_json?: string | null;
    updated_at?: string | null;
  } | null;
  runtime_context?: {
    tenantId?: number;
    tenantName?: string | null;
    slug?: string | null;
    whatsapp?: string | null;
    deliveryEnabled?: boolean;
    pixEnabled?: boolean;
    deliveryConfig?: JsonRecord;
  } | null;
  payment_methods?: string[] | null;
  error?: string;
};

type FormState = {
  chatbotEnabled: boolean;
  provider: string;
  model: string;
  systemPrompt: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  baseUrl: string;
  endpoint: string;
  temperature: string;
  maxTokens: string;
  extraProviderConfig: JsonRecord;
};

type PanelMeta = {
  configured: boolean;
  updatedAt: string | null;
  runtimeContext: ChatbotApiResponse['runtime_context'];
  paymentMethods: string[];
};

type FeedbackState =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

const DEFAULT_PROVIDER = 'groq';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_ENDPOINT = 'chat/completions';
const PROVIDER_SECRET_PLACEHOLDER = '__FLOWPDV_REDACTED__';
const WHATSAPP_AI_API_PATH = '/api/whatsapp/ai';

const API_KEY_KEYS = ['api_key', 'apiKey', 'token', 'access_token', 'accessToken'] as const;
const BASE_URL_KEYS = ['base_url', 'baseUrl', 'url', 'api_url'] as const;
const ENDPOINT_KEYS = ['endpoint', 'path'] as const;
const TEMPERATURE_KEYS = ['temperature'] as const;
const MAX_TOKENS_KEYS = ['max_tokens', 'maxTokens', 'max_completion_tokens'] as const;
const KNOWN_PROVIDER_KEYS = [
  ...API_KEY_KEYS,
  ...BASE_URL_KEYS,
  ...ENDPOINT_KEYS,
  ...TEMPERATURE_KEYS,
  ...MAX_TOKENS_KEYS,
  'model',
] as const;

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeProviderValue(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return DEFAULT_PROVIDER;

  const provider = normalized.toLowerCase().replace(/[\s-]+/g, '_');
  if (provider === 'groq_api' || provider === 'groqcloud') return DEFAULT_PROVIDER;

  return provider === DEFAULT_PROVIDER ? provider : DEFAULT_PROVIDER;
}

function parseProviderConfigJson(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return {} as JsonRecord;

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(parsed as JsonRecord) };
    }
  } catch {
    return {} as JsonRecord;
  }

  return {} as JsonRecord;
}

function getConfigText(config: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = normalizeOptionalText(config[key]);
    if (value) return value;
  }

  return null;
}

function getConfigNumber(config: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = Number(config[key]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function omitKnownProviderKeys(config: JsonRecord) {
  const next = { ...config };

  for (const key of KNOWN_PROVIDER_KEYS) {
    delete next[key];
  }

  return next;
}

function formatNumericInput(value: number | null) {
  return value === null ? '' : String(value);
}

function parseOptionalNumberInput(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFormState(response: ChatbotApiResponse): FormState {
  const defaults = response.defaults || {};
  const config = response.config || {};
  const providerConfig = parseProviderConfigJson(config.provider_config_json ?? defaults.provider_config_json);
  const storedApiKeyValue = getConfigText(providerConfig, API_KEY_KEYS);
  const apiKeyConfigured = storedApiKeyValue === PROVIDER_SECRET_PLACEHOLDER || Boolean(storedApiKeyValue);

  return {
    chatbotEnabled: Boolean(config.chatbot_enabled ?? defaults.chatbot_enabled ?? false),
    provider: normalizeProviderValue(config.provider ?? defaults.provider),
    model: normalizeOptionalText(config.model) ?? getConfigText(providerConfig, ['model']) ?? '',
    systemPrompt: normalizeOptionalText(config.system_prompt) ?? normalizeOptionalText(defaults.system_prompt) ?? '',
    apiKey: storedApiKeyValue && storedApiKeyValue !== PROVIDER_SECRET_PLACEHOLDER ? storedApiKeyValue : '',
    apiKeyConfigured,
    baseUrl: getConfigText(providerConfig, BASE_URL_KEYS) ?? '',
    endpoint: getConfigText(providerConfig, ENDPOINT_KEYS) ?? '',
    temperature: formatNumericInput(getConfigNumber(providerConfig, TEMPERATURE_KEYS)),
    maxTokens: formatNumericInput(getConfigNumber(providerConfig, MAX_TOKENS_KEYS)),
    extraProviderConfig: omitKnownProviderKeys(providerConfig),
  };
}

function buildProviderConfigPayload(
  form: FormState,
  parsedValues: {
    temperature: number | null;
    maxTokens: number | null;
  }
) {
  const next = { ...form.extraProviderConfig };

  for (const key of KNOWN_PROVIDER_KEYS) {
    delete next[key];
  }

  const apiKey = normalizeOptionalText(form.apiKey);
  const baseUrl = normalizeOptionalText(form.baseUrl);
  const endpoint = normalizeOptionalText(form.endpoint);

  if (apiKey) next.api_key = apiKey;
  if (baseUrl) next.base_url = baseUrl;
  if (endpoint) next.endpoint = endpoint;
  if (parsedValues.temperature !== null) next.temperature = parsedValues.temperature;
  if (parsedValues.maxTokens !== null) next.max_tokens = parsedValues.maxTokens;

  return Object.keys(next).length > 0 ? next : null;
}

function buildPayloadSnapshot(form: FormState) {
  const temperature = parseOptionalNumberInput(form.temperature);
  const maxTokens = parseOptionalNumberInput(form.maxTokens);
  const providerConfig = buildProviderConfigPayload(form, { temperature, maxTokens });

  return JSON.stringify({
    chatbot_enabled: form.chatbotEnabled,
    provider: normalizeProviderValue(form.provider),
    model: normalizeOptionalText(form.model),
    system_prompt: normalizeOptionalText(form.systemPrompt),
    provider_config_json: providerConfig,
  });
}

function formatDateTime(value: string | null) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return 'Ainda nao salva';

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;

  return parsed.toLocaleString('pt-BR');
}

function statusToneClass(enabled: boolean) {
  return enabled
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
    : 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300';
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <div className={`${adminOpsInsetPanelClass} p-3`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-fptext-muted">{label}</p>
      <div className="mt-1 text-sm font-black text-fptext-primary">{value}</div>
      {helper ? <p className="mt-1 text-xs leading-relaxed text-fptext-muted">{helper}</p> : null}
    </div>
  );
}

function FormField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={fieldLabelClass}>{label}</label>
      {children}
      {helper ? <p className="text-xs leading-relaxed text-fptext-muted">{helper}</p> : null}
    </div>
  );
}

export default function WhatsAppChatbotPanel({ token }: { token: string }) {
  const [form, setForm] = useState<FormState>({
    chatbotEnabled: false,
    provider: DEFAULT_PROVIDER,
    model: '',
    systemPrompt: '',
    apiKey: '',
    apiKeyConfigured: false,
    baseUrl: '',
    endpoint: '',
    temperature: '',
    maxTokens: '',
    extraProviderConfig: {},
  });
  const [meta, setMeta] = useState<PanelMeta>({
    configured: false,
    updatedAt: null,
    runtimeContext: null,
    paymentMethods: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [initialSnapshot, setInitialSnapshot] = useState(() => buildPayloadSnapshot({
    chatbotEnabled: false,
    provider: DEFAULT_PROVIDER,
    model: '',
    systemPrompt: '',
    apiKey: '',
    apiKeyConfigured: false,
    baseUrl: '',
    endpoint: '',
    temperature: '',
    maxTokens: '',
    extraProviderConfig: {},
  }));

  useEffect(() => {
    if (!feedback) return undefined;

    const timeoutId = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    const abortController = new AbortController();

    const loadConfig = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const response = await fetch(WHATSAPP_AI_API_PATH, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
        const data = (await response.json().catch(() => ({}))) as ChatbotApiResponse;

        if (!response.ok || data.success === false) {
          throw new Error(data.error || 'Nao foi possivel carregar a configuracao do chatbot.');
        }

        const nextForm = buildFormState(data);

        setForm(nextForm);
        setInitialSnapshot(buildPayloadSnapshot(nextForm));
        setMeta({
          configured: Boolean(data.configured),
          updatedAt: normalizeOptionalText(data.config?.updated_at) ?? null,
          runtimeContext: data.runtime_context ?? null,
          paymentMethods: Array.isArray(data.payment_methods) ? data.payment_methods.filter(Boolean) : [],
        });
      } catch (error) {
        if (abortController.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Falha ao carregar o chatbot.');
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadConfig();

    return () => abortController.abort();
  }, [token]);

  const isDirty = buildPayloadSnapshot(form) !== initialSnapshot;
  const runtimeContext = meta.runtimeContext;
  const paymentMethods = meta.paymentMethods;
  const extraConfigCount = Object.keys(form.extraProviderConfig).length;
  const effectiveModel = normalizeOptionalText(form.model) ?? DEFAULT_MODEL;
  const effectiveBaseUrl = normalizeOptionalText(form.baseUrl) ?? DEFAULT_BASE_URL;
  const effectiveEndpoint = normalizeOptionalText(form.endpoint) ?? DEFAULT_ENDPOINT;
  const hasConfiguredApiKey = form.apiKeyConfigured || Boolean(normalizeOptionalText(form.apiKey));

  const applyResponse = (data: ChatbotApiResponse, successMessage?: string) => {
    const nextForm = buildFormState(data);

    setForm(nextForm);
    setInitialSnapshot(buildPayloadSnapshot(nextForm));
    setMeta({
      configured: Boolean(data.configured),
      updatedAt: normalizeOptionalText(data.config?.updated_at) ?? null,
      runtimeContext: data.runtime_context ?? null,
      paymentMethods: Array.isArray(data.payment_methods) ? data.payment_methods.filter(Boolean) : [],
    });
    setLoadError(null);

    if (successMessage) {
      setFeedback({ type: 'success', text: successMessage });
    }
  };

  const handleReload = async () => {
    try {
      setRefreshing(true);

      const response = await fetch(WHATSAPP_AI_API_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => ({}))) as ChatbotApiResponse;

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Nao foi possivel recarregar a configuracao.');
      }

      applyResponse(data, 'Configuracao recarregada.');
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao recarregar o chatbot.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    const parsedTemperature = parseOptionalNumberInput(form.temperature);
    const parsedMaxTokens = parseOptionalNumberInput(form.maxTokens);

    if (form.temperature.trim() && parsedTemperature === null) {
      setFeedback({ type: 'error', text: 'Informe uma temperatura valida.' });
      return;
    }

    if (form.maxTokens.trim() && parsedMaxTokens === null) {
      setFeedback({ type: 'error', text: 'Informe um valor valido para max tokens.' });
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(WHATSAPP_AI_API_PATH, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatbot_enabled: form.chatbotEnabled,
          provider: normalizeProviderValue(form.provider),
          model: normalizeOptionalText(form.model),
          system_prompt: normalizeOptionalText(form.systemPrompt),
          provider_config_json: buildProviderConfigPayload(form, {
            temperature: parsedTemperature,
            maxTokens: parsedMaxTokens,
          }),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ChatbotApiResponse;

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Nao foi possivel salvar a configuracao do chatbot.');
      }

      applyResponse(data, 'Configuracao do chatbot salva com sucesso.');
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao salvar a configuracao do chatbot.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
        <div className="flex min-h-[18rem] items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-fptext-muted">
            <Spinner className="h-5 w-5" />
            Carregando configuracao do chatbot...
          </div>
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
        <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle size={22} />
          </div>
          <div className="space-y-1">
            <p className="text-base font-black text-fptext-primary">Nao foi possivel carregar o chatbot</p>
            <p className="text-sm leading-relaxed text-fptext-muted">{loadError}</p>
          </div>
          <Button onClick={() => void handleReload()}>
            <RefreshCw size={16} />
            Tentar novamente
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <form
        className={`${adminOpsSurfaceCardClass} min-w-0 p-4 sm:p-5`}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={adminSectionEyebrowClass}>Configuracao</p>
            <h2 className="mt-2 flex items-center gap-2 text-lg font-black text-fptext-primary">
              <Bot size={18} className="shrink-0" />
              Chatbot Groq
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fptext-muted">
              Esta etapa habilita apenas a configuracao do chatbot por tenant. O inbound e a operacao do canal
              continuam fora do escopo desta entrega.
            </p>
          </div>

          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${statusToneClass(form.chatbotEnabled)}`}
          >
            {form.chatbotEnabled ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {form.chatbotEnabled ? 'Chatbot ativo' : 'Chatbot desligado'}
          </div>
        </div>

        {feedback ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
            }`}
          >
            {feedback.text}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          <div className={`${adminOpsInsetPanelClass} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-fptext-primary">Ativar chatbot neste tenant</p>
              <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                Quando desligado, a configuracao continua salva, mas o chatbot nao responde automaticamente.
              </p>
            </div>

            <button
              type="button"
              aria-pressed={form.chatbotEnabled}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  chatbotEnabled: !current.chatbotEnabled,
                }))
              }
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors ${
                form.chatbotEnabled
                  ? 'border-emerald-500 bg-emerald-600'
                  : 'border-fp-border bg-fp-secondary'
              }`}
            >
              <span
                className={`absolute top-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow transition-transform ${
                  form.chatbotEnabled ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Provider" helper="Nesta etapa o frontend trabalha apenas com Groq.">
              <select
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                className={fieldSelectClass}
                disabled={saving || refreshing}
              >
                <option value="groq">Groq</option>
              </select>
            </FormField>

            <FormField
              label="Modelo"
              helper={`Se ficar vazio, o backend usa ${DEFAULT_MODEL}.`}
            >
              <input
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                className={fieldInputClass}
                placeholder={DEFAULT_MODEL}
                disabled={saving || refreshing}
              />
            </FormField>

            <FormField
              label="Groq API Key"
              helper="Se ficar vazio, a tela preserva a chave ja salva. O backend tambem pode usar a chave de ambiente."
            >
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                className={fieldInputClass}
                placeholder={form.apiKeyConfigured ? 'Chave ja configurada' : 'gsk_...'}
                autoComplete="off"
                disabled={saving || refreshing}
              />
            </FormField>

            <FormField
              label="Base URL"
              helper={`Padrao do backend: ${DEFAULT_BASE_URL}.`}
            >
              <input
                value={form.baseUrl}
                onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                className={fieldInputClass}
                placeholder={DEFAULT_BASE_URL}
                disabled={saving || refreshing}
              />
            </FormField>

            <FormField
              label="Endpoint"
              helper={`Padrao do backend: ${DEFAULT_ENDPOINT}.`}
            >
              <input
                value={form.endpoint}
                onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))}
                className={fieldInputClass}
                placeholder={DEFAULT_ENDPOINT}
                disabled={saving || refreshing}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
              <FormField label="Temperature" helper="Opcional. Informe apenas se quiser sobrescrever o padrao da Groq.">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.temperature}
                  onChange={(event) => setForm((current) => ({ ...current, temperature: event.target.value }))}
                  className={fieldInputClass}
                  placeholder="0.2"
                  disabled={saving || refreshing}
                />
              </FormField>

              <FormField label="Max tokens" helper="Opcional. O backend envia como max_tokens quando informado.">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.maxTokens}
                  onChange={(event) => setForm((current) => ({ ...current, maxTokens: event.target.value }))}
                  className={fieldInputClass}
                  placeholder="512"
                  disabled={saving || refreshing}
                />
              </FormField>
            </div>

            <div className="md:col-span-2">
              <FormField
                label="System prompt"
                helper="Se ficar vazio, o backend monta um prompt padrao usando o contexto do tenant."
              >
                <textarea
                  value={form.systemPrompt}
                  onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))}
                  className={`${fieldInputClass} min-h-[12rem] resize-y`}
                  placeholder="Instrua a IA sobre tom, limites e regras do atendimento."
                  disabled={saving || refreshing}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-fp-border pt-4">
          <div className="text-xs leading-relaxed text-fptext-muted">
            {isDirty ? 'Existem alteracoes pendentes.' : 'Sem alteracoes pendentes.'}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleReload()}
              disabled={saving || refreshing}
            >
              {refreshing ? <Spinner className="h-4 w-4" label="Recarregando" /> : <RefreshCw size={16} />}
              Recarregar
            </Button>
            <Button type="submit" disabled={saving || refreshing || !isDirty}>
              {saving ? <Spinner className="h-4 w-4" label="Salvando" /> : <Save size={16} />}
              {saving ? 'Salvando...' : 'Salvar configuracao'}
            </Button>
          </div>
        </div>
      </form>

      <aside className="min-w-0 space-y-4">
        <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
          <p className={adminSectionEyebrowClass}>Resumo</p>
          <div className="mt-4 grid gap-3">
            <SummaryCard
              label="Status"
              value={form.chatbotEnabled ? 'Ativo' : 'Desligado'}
              helper={meta.configured ? 'Configuracao ja persistida neste tenant.' : 'Tenant ainda usa defaults do backend.'}
            />
            <SummaryCard
              label="Modelo efetivo"
              value={effectiveModel}
              helper="Valor salvo no campo model ou fallback padrao do servico."
            />
            <SummaryCard
              label="Conexao Groq"
              value={hasConfiguredApiKey ? 'Chave configurada' : 'Sem chave no tenant'}
              helper={`${effectiveBaseUrl}/${effectiveEndpoint}`}
            />
            <SummaryCard
              label="Ultima atualizacao"
              value={formatDateTime(meta.updatedAt)}
              helper={extraConfigCount > 0 ? `${extraConfigCount} chave(s) extra(s) preservadas no provider_config_json.` : 'Nenhuma chave extra preservada.'}
            />
          </div>
        </section>

        <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
          <p className={adminSectionEyebrowClass}>Contexto do tenant</p>
          <div className="mt-4 space-y-3">
            <div className={`${adminOpsInsetPanelClass} flex items-start gap-3 p-3`}>
              <Store size={16} className="mt-0.5 shrink-0 text-fptext-muted" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fptext-primary">
                  {normalizeOptionalText(runtimeContext?.tenantName) ?? 'Estabelecimento nao informado'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                  Slug: {normalizeOptionalText(runtimeContext?.slug) ?? 'nao informado'}
                </p>
                <p className="text-xs leading-relaxed text-fptext-muted">
                  WhatsApp: {normalizeOptionalText(runtimeContext?.whatsapp) ?? 'nao informado'}
                </p>
              </div>
            </div>

            <div className={`${adminOpsInsetPanelClass} flex items-start gap-3 p-3`}>
              <CreditCard size={16} className="mt-0.5 shrink-0 text-fptext-muted" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fptext-primary">Pagamentos conhecidos</p>
                {paymentMethods.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {paymentMethods.map((method) => (
                      <span
                        key={method}
                        className="rounded-full border border-fp-border bg-fp-secondary px-2.5 py-1 text-xs font-semibold text-fptext-secondary"
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                    Nenhuma forma de pagamento retornada pelo backend.
                  </p>
                )}
              </div>
            </div>

            <div className={`${adminOpsInsetPanelClass} flex items-start gap-3 p-3`}>
              <MessageSquareText size={16} className="mt-0.5 shrink-0 text-fptext-muted" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fptext-primary">Escopo desta etapa</p>
                <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                  Carregar e salvar a configuracao do chatbot, sem alterar inbound, roteamento de conversas ou
                  operacao humana do canal.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                  Delivery ativo: {runtimeContext?.deliveryEnabled ? 'sim' : 'nao'} - Pix ativo:{' '}
                  {runtimeContext?.pixEnabled ? 'sim' : 'nao'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
