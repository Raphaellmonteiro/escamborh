import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  MessageSquare,
  QrCode,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { Button } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../components/ui/screenChrome';

type ConnectionInfoResponse = {
  success?: boolean;
  source?: 'tenant_whatsapp_config' | 'legacy';
  configured?: boolean;
  whatsapp_enabled?: boolean;
  provider?: string | null;
  supported?: boolean;
  instance_name?: string | null;
  active_number?: string | null;
  channel_identifier?: string | null;
  has_base_url?: boolean;
  has_api_key?: boolean;
  updated_at?: string | null;
  status?: {
    state?: string | null;
    connected?: boolean;
    source?: 'provider' | 'database' | 'unavailable';
    http_status?: number | null;
  } | null;
  error?: string;
};

type QrCodeResponse = {
  qrcode?: unknown | null;
  pairingCode?: string | null;
  raw?: unknown;
  status?: number;
  error?: string;
};

type CreateInstanceResponse = {
  success?: boolean;
  instanceName?: string | null;
  created?: boolean;
  alreadyExisted?: boolean;
  error?: string;
};

type FeedbackState =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type QrCodeState = {
  imageSrc: string | null;
  pairingCode: string | null;
  capturedAt: string | null;
  hasRawValue: boolean;
};

const WHATSAPP_CONNECTION_API_PATH = '/api/whatsapp/connection';
const WHATSAPP_PROVISION_API_PATH = '/api/whatsapp/create';
const WHATSAPP_QR_CODE_API_PATH = '/api/whatsapp/qrcode';

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function formatDateTime(value: string | null) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return 'Nao informado';

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;

  return parsed.toLocaleString('pt-BR');
}

function formatProviderLabel(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return 'Nao informado';

  if (normalized.toLowerCase() === 'evolution_api') {
    return 'Evolution API';
  }

  return normalized
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatConnectionStateLabel(connection: ConnectionInfoResponse | null) {
  if (!connection?.supported) return 'Provider nao suportado';
  if (!connection?.configured) return 'Nao configurado';
  if (connection.status?.connected) return 'Conectado';

  const state = normalizeOptionalText(connection.status?.state)?.toLowerCase();
  if (!state) return 'Aguardando conexao';
  if (state === 'connecting') return 'Conectando';
  if (state === 'close' || state === 'closed') return 'Desconectado';
  if (state === 'open') return 'Conectado';

  return state.charAt(0).toUpperCase() + state.slice(1);
}

function getStatusToneClass(connection: ConnectionInfoResponse | null) {
  if (!connection?.supported) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
  }

  if (connection?.status?.connected) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  }

  if (!connection?.configured) {
    return 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
}

function formatStatusSource(value: ConnectionInfoResponse['status'] extends { source?: infer T } ? T : never) {
  if (value === 'provider') return 'Provider';
  if (value === 'database') return 'Base local';
  return 'Indisponivel';
}

function normalizeQrCodeImageSrc(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (/^data:image\//i.test(normalized) || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (/^<svg[\s>]/i.test(normalized)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
  }

  const base64Candidate = normalized.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(base64Candidate) && base64Candidate.length >= 100) {
    return `data:image/png;base64,${base64Candidate}`;
  }

  return null;
}

function shouldProvisionInstance(connection: ConnectionInfoResponse | null) {
  if (!connection?.supported) {
    return false;
  }

  if (normalizeOptionalText(connection.instance_name)) {
    return false;
  }

  const provider = normalizeOptionalText(connection.provider)?.toLowerCase();
  return provider === 'evolution_api' || Boolean(connection.has_base_url || connection.has_api_key);
}

function canPrepareConnection(connection: ConnectionInfoResponse | null) {
  if (!connection?.supported) {
    return false;
  }

  if (normalizeOptionalText(connection.instance_name)) {
    return true;
  }

  return shouldProvisionInstance(connection);
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

const emptyQrCodeState: QrCodeState = {
  imageSrc: null,
  pairingCode: null,
  capturedAt: null,
  hasRawValue: false,
};

export default function WhatsAppConnectionPanel({ token }: { token: string }) {
  const [connection, setConnection] = useState<ConnectionInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [qrCode, setQrCode] = useState<QrCodeState>(emptyQrCodeState);

  const maybeProvisionInstance = async (
    currentConnection: ConnectionInfoResponse,
    options?: {
      signal?: AbortSignal;
      suppressFeedback?: boolean;
      force?: boolean;
    }
  ) => {
    const shouldAttemptProvision = options?.force
      ? canPrepareConnection(currentConnection)
      : shouldProvisionInstance(currentConnection);

    if (!shouldAttemptProvision) {
      if (options?.force && !options.suppressFeedback) {
        setFeedback({
          type: 'error',
          text: 'Defina o provider e as credenciais do tenant antes de preparar a conexao do WhatsApp.',
        });
      }

      return {
        connection: currentConnection,
        attempted: false,
        provisioned: false,
      };
    }

    const provisionResponse = await fetch(WHATSAPP_PROVISION_API_PATH, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: options?.signal,
    });
    const provisionData = (await provisionResponse.json().catch(() => ({}))) as CreateInstanceResponse;

    if (!provisionResponse.ok) {
      if (!options?.suppressFeedback) {
        setFeedback({
          type: 'error',
          text: provisionData.error || 'Nao foi possivel provisionar a instancia do WhatsApp.',
        });
      }

      return {
        connection: currentConnection,
        attempted: true,
        provisioned: false,
      };
    }

    const refreshedResponse = await fetch(WHATSAPP_CONNECTION_API_PATH, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options?.signal,
    });
    const refreshedData = (await refreshedResponse.json().catch(() => ({}))) as ConnectionInfoResponse;

    if (!refreshedResponse.ok || refreshedData.success === false) {
      if (!options?.suppressFeedback) {
        setFeedback({
          type: 'error',
          text: refreshedData.error || 'Nao foi possivel recarregar a conexao apos provisionar a instancia.',
        });
      }

      return {
        connection: currentConnection,
        attempted: true,
        provisioned: false,
      };
    }

    const provisioned = Boolean(normalizeOptionalText(refreshedData.instance_name));

    if (!provisioned) {
      if (!options?.suppressFeedback) {
        setFeedback({
          type: 'error',
          text: 'A instancia foi solicitada, mas o backend ainda nao retornou um instance_name valido.',
        });
      }

      return {
        connection: refreshedData,
        attempted: true,
        provisioned: false,
      };
    }

    if (!options?.suppressFeedback) {
      setFeedback({
        type: 'success',
        text:
          provisionData.alreadyExisted || provisionData.created === false
            ? 'Instancia do WhatsApp ja estava preparada para este tenant. Status recarregado com sucesso.'
            : 'Instancia do WhatsApp provisionada para este tenant.',
      });
    }

    return {
      connection: refreshedData,
      attempted: true,
      provisioned: true,
    };
  };

  useEffect(() => {
    if (!feedback) return undefined;

    const timeoutId = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!connection?.status?.connected) return;
    setQrCode(emptyQrCodeState);
  }, [connection?.status?.connected]);

  useEffect(() => {
    const abortController = new AbortController();

    const loadConnectionInfo = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setConnection(null);
        setQrCode(emptyQrCodeState);

        const response = await fetch(WHATSAPP_CONNECTION_API_PATH, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
        const data = (await response.json().catch(() => ({}))) as ConnectionInfoResponse;

        if (!response.ok || data.success === false) {
          throw new Error(data.error || 'Nao foi possivel carregar a conexao do WhatsApp.');
        }

        const provisionResult = await maybeProvisionInstance(data, {
          signal: abortController.signal,
          suppressFeedback: true,
        });

        if (abortController.signal.aborted) return;
        setConnection(provisionResult.connection);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Falha ao carregar a conexao do WhatsApp.');
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadConnectionInfo();

    return () => abortController.abort();
  }, [token]);

  const refreshConnectionInfo = async (suppressErrorFeedback = false) => {
    try {
      setRefreshing(true);
      setLoadError(null);

      const response = await fetch(WHATSAPP_CONNECTION_API_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => ({}))) as ConnectionInfoResponse;

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Nao foi possivel atualizar o status do WhatsApp.');
      }

      const provisionResult = await maybeProvisionInstance(data, {
        suppressFeedback: suppressErrorFeedback,
      });

      setConnection(provisionResult.connection);
      if (!suppressErrorFeedback && !provisionResult.attempted) {
        setFeedback({ type: 'success', text: 'Status do WhatsApp recarregado.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao atualizar o status do WhatsApp.';
      if (!suppressErrorFeedback) {
        setFeedback({ type: 'error', text: message });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handlePrepareConnection = async () => {
    if (!connection) {
      return;
    }

    try {
      setCreatingInstance(true);
      setLoadError(null);
      setFeedback(null);

      const provisionResult = await maybeProvisionInstance(connection, {
        force: true,
      });

      setConnection(provisionResult.connection);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao preparar a conexao do WhatsApp.',
      });
    } finally {
      setCreatingInstance(false);
    }
  };

  const handleGenerateQrCode = async () => {
    try {
      setQrLoading(true);
      setFeedback(null);

      const response = await fetch(WHATSAPP_QR_CODE_API_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => ({}))) as QrCodeResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel gerar um novo QR Code.');
      }

      const imageSrc = normalizeQrCodeImageSrc(data.qrcode);
      const pairingCode = normalizeOptionalText(data.pairingCode);
      const hasRawValue = data.qrcode !== undefined && data.qrcode !== null;

      setQrCode({
        imageSrc,
        pairingCode,
        capturedAt: new Date().toISOString(),
        hasRawValue,
      });

      if (imageSrc || pairingCode) {
        setFeedback({ type: 'success', text: 'Novo QR Code solicitado com sucesso.' });
      } else if (hasRawValue) {
        setFeedback({ type: 'success', text: 'QR Code retornado, mas sem formato visual compativel para esta tela.' });
      } else {
        setFeedback({ type: 'error', text: 'O backend nao retornou um QR Code visual para este tenant.' });
      }

      await refreshConnectionInfo(true);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao gerar um novo QR Code.',
      });
    } finally {
      setQrLoading(false);
    }
  };

  const statusLabel = formatConnectionStateLabel(connection);
  const statusToneClass = getStatusToneClass(connection);
  const canPrepare = !loading && canPrepareConnection(connection);
  const canGenerateQrCode =
    !loading && Boolean(connection?.supported && normalizeOptionalText(connection?.instance_name));
  const rawState = normalizeOptionalText(connection?.status?.state) ?? 'Nao informado';
  const statusHttpCode = connection?.status?.http_status ?? null;

  return (
    <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className={adminSectionEyebrowClass}>Conectar WhatsApp</p>
          <h2 className="mt-2 text-lg font-black text-fptext-primary">Status da instancia e QR Code</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fptext-muted">
            Este bloco consulta o endpoint agregado de conexao/status por tenant e permite solicitar um novo QR Code
            sem alterar a configuracao do chatbot Groq.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void handlePrepareConnection()}
            variant="secondary"
            disabled={!canPrepare || loading || refreshing || creatingInstance || qrLoading}
          >
            {creatingInstance ? (
              <Spinner className="h-4 w-4 border-[1.5px]" label="Preparando conexao" />
            ) : (
              <Link2 size={16} />
            )}
            Preparar conexao
          </Button>
          <Button
            onClick={() => void refreshConnectionInfo()}
            variant="secondary"
            disabled={loading || refreshing || creatingInstance}
          >
            {refreshing ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Recarregar status
          </Button>
          <Button
            onClick={() => void handleGenerateQrCode()}
            disabled={!canGenerateQrCode || qrLoading || creatingInstance}
          >
            {qrLoading ? <Spinner className="h-4 w-4 border-[1.5px]" label="Gerando QR Code" /> : <QrCode size={16} />}
            Gerar novo QR Code
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Falha ao carregar a conexao</p>
            <p className="mt-1 text-xs leading-relaxed">{loadError}</p>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <p className="text-sm font-medium">{feedback.text}</p>
        </div>
      ) : null}

      {loading ? (
        <div className={`${adminOpsInsetPanelClass} mt-4 flex min-h-40 items-center justify-center p-4`}>
          <div className="flex items-center gap-3 text-sm text-fptext-muted">
            <Spinner />
            Carregando status da conexao...
          </div>
        </div>
      ) : connection ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${statusToneClass}`}
            >
              {connection?.status?.connected ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
              {statusLabel}
            </span>

            <span className="text-xs font-medium text-fptext-muted">
              Estado reportado: <span className="font-bold text-fptext-primary">{rawState}</span>
            </span>

            <span className="text-xs font-medium text-fptext-muted">
              Origem: <span className="font-bold text-fptext-primary">{formatStatusSource(connection?.status?.source)}</span>
            </span>

            {statusHttpCode !== null ? (
              <span className="text-xs font-medium text-fptext-muted">
                HTTP: <span className="font-bold text-fptext-primary">{statusHttpCode}</span>
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Numero"
              value={normalizeOptionalText(connection?.active_number) ?? 'Nao informado'}
              helper="Numero ativo retornado pelo backend do tenant."
            />
            <SummaryCard
              label="Instancia"
              value={normalizeOptionalText(connection?.instance_name) ?? 'Nao informada'}
              helper={normalizeOptionalText(connection?.channel_identifier) ? `Canal: ${connection?.channel_identifier}` : undefined}
            />
            <SummaryCard
              label="Provider"
              value={formatProviderLabel(connection?.provider)}
              helper={connection?.source === 'tenant_whatsapp_config' ? 'Configuracao dedicada do tenant.' : 'Fallback legado.'}
            />
            <SummaryCard
              label="Atualizado"
              value={formatDateTime(connection?.updated_at ?? null)}
              helper={`Canal ${connection?.whatsapp_enabled ? 'habilitado' : 'desabilitado'} para este tenant.`}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <div className={`${adminOpsInsetPanelClass} p-4`}>
              <div className="flex items-start gap-3">
                <MessageSquare size={18} className="mt-0.5 shrink-0 text-fptext-muted" />
                <div>
                  <p className="text-sm font-bold text-fptext-primary">Leitura segura por tenant</p>
                  <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                    A tela usa o agregado de conexao/status para evitar chamadas separadas de diagnostico no
                    carregamento inicial. A solicitacao de novo QR Code continua isolada no endpoint proprio.
                  </p>
                </div>
              </div>

              {!connection?.supported ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  O provider configurado para este tenant ainda nao e suportado por este fluxo visual de conexao.
                </div>
              ) : null}

              {connection?.supported && !normalizeOptionalText(connection?.instance_name) ? (
                <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
                  Use <code>Preparar conexao</code> para solicitar o <code>POST /api/whatsapp/create</code> com a
                  sessao autenticada atual. Depois disso, a tela recarrega o <code>instance_name</code> e libera a
                  geracao do QR Code.
                </div>
              ) : null}

              {connection?.status?.connected ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  A conexao esta aberta. Quando isso acontece, o QR Code deixa de ser exibido para evitar leitura de
                  um codigo antigo.
                </div>
              ) : null}
            </div>

            <div className={`${adminOpsInsetPanelClass} p-4`}>
              <div className="flex items-start gap-3">
                <Smartphone size={18} className="mt-0.5 shrink-0 text-fptext-muted" />
                <div>
                  <p className="text-sm font-bold text-fptext-primary">QR Code da instancia</p>
                  <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                    Gere um novo QR Code quando a instancia estiver pronta e desconectada.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex min-h-72 items-center justify-center rounded-xl border border-dashed border-fp-border bg-fp-card/80 p-4">
                {qrLoading ? (
                  <div className="flex flex-col items-center gap-3 text-center text-sm text-fptext-muted">
                    <Spinner />
                    Solicitando QR Code...
                  </div>
                ) : qrCode.imageSrc ? (
                  <div className="w-full space-y-3 text-center">
                    <img
                      src={qrCode.imageSrc}
                      alt="QR Code do WhatsApp"
                      className="mx-auto h-auto max-h-64 w-full max-w-64 rounded-xl border border-fp-border bg-white p-3 shadow-sm"
                    />
                    <p className="text-xs text-fptext-muted">QR atualizado em {formatDateTime(qrCode.capturedAt)}</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-center">
                    <QrCode size={28} className="mx-auto text-fptext-muted" />
                    <p className="text-sm font-medium text-fptext-primary">Nenhum QR Code carregado</p>
                    <p className="mx-auto max-w-xs text-xs leading-relaxed text-fptext-muted">
                      Use o botao acima para solicitar um novo QR Code quando a instancia estiver disponivel.
                    </p>
                  </div>
                )}
              </div>

              {qrCode.pairingCode ? (
                <div className="mt-3 rounded-xl border border-fp-border bg-fp-card px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-fptext-muted">Pairing code</p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold text-fptext-primary">{qrCode.pairingCode}</p>
                </div>
              ) : null}

              {!qrCode.imageSrc && qrCode.hasRawValue ? (
                <p className="mt-3 text-xs leading-relaxed text-fptext-muted">
                  O backend retornou um QR Code, mas o formato nao foi reconhecido como imagem renderizavel nesta UI.
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className={`${adminOpsInsetPanelClass} mt-4 flex min-h-40 items-center justify-center p-4`}>
          <div className="max-w-md text-center">
            <p className="text-sm font-semibold text-fptext-primary">Status indisponivel no momento</p>
            <p className="mt-2 text-xs leading-relaxed text-fptext-muted">
              Nao foi possivel montar o resumo da conexao com os dados atuais. Use o botao de recarga para tentar
              novamente.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
