/**
 * TabIA.tsx — Fase 2b
 *
 * Aba de Inteligência Artificial.
 * Exibe barra de uso de mensagens da IA (verde/amarelo/vermelho)
 * e botão "Recarregar" acima de 80% de uso.
 * O painel de configuração existente (WhatsAppChatbotPanel) permanece intacto.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { Spinner } from '../../components/ui/Spinner';
import {
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../../components/ui/screenChrome';
import WhatsAppChatbotPanel from '../WhatsAppChatbotPanel';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type UsageData = {
  used: number;
  limit: number;
  reset_date: string | null;
};

type UsageBarProps = {
  usage: UsageData;
  onReload?: () => void;
};

// ─── Barra de uso ─────────────────────────────────────────────────────────────

function formatResetDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function UsageBar({ usage, onReload }: UsageBarProps) {
  const pct = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0;

  const barColor =
    pct >= 85
      ? 'bg-red-500'
      : pct >= 60
        ? 'bg-yellow-400'
        : 'bg-green-500';

  const textColor =
    pct >= 85
      ? 'text-red-600 dark:text-red-400'
      : pct >= 60
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-green-600 dark:text-green-400';

  const showReloadButton = pct >= 80;
  const resetLabel = formatResetDate(usage.reset_date);

  return (
    <div className={`${adminOpsSurfaceCardClass} mb-4 space-y-3`}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-fp-accent shrink-0" />
          <span className={`${adminSectionEyebrowClass}`}>Uso da IA este mês</span>
        </div>
        {showReloadButton && (
          <button
            onClick={onReload}
            className="flex items-center gap-1.5 rounded-md bg-fp-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={12} />
            Recarregar
          </button>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="h-2.5 w-full rounded-full bg-fp-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>

      {/* Texto de contagem */}
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${textColor}`}>
          {usage.used.toLocaleString('pt-BR')} de {usage.limit.toLocaleString('pt-BR')} mensagens usadas
        </span>
        {resetLabel && (
          <span className="text-fptext-muted">
            Ciclo desde {resetLabel}
          </span>
        )}
      </div>

      {/* Aviso crítico */}
      {pct >= 85 && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Limite quase atingido. A IA pode parar de responder. Clique em{' '}
            <strong>Recarregar</strong> para adquirir mais mensagens.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Modal de recarga (MVP: Pix manual) ───────────────────────────────────────

function ReloadModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className={`${adminOpsSurfaceCardClass} w-full max-w-sm space-y-4`}>
        <h2 className="text-base font-semibold text-fptext-primary">Recarregar mensagens da IA</h2>

        <p className="text-sm text-fptext-muted">
          Escolha um pacote e faça o pagamento via Pix. Após a confirmação, os créditos
          serão adicionados manualmente em até 1 hora útil.
        </p>

        <div className="space-y-2">
          {[
            { label: '500 mensagens', price: 'R$ 29,00' },
            { label: '1.500 mensagens', price: 'R$ 59,00' },
            { label: '4.000 mensagens', price: 'R$ 129,00' },
          ].map((pkg) => (
            <div
              key={pkg.label}
              className="flex items-center justify-between rounded-lg border border-fp-border px-3 py-2.5 text-sm"
            >
              <span className="font-medium text-fptext-primary">{pkg.label}</span>
              <span className="text-fp-accent font-semibold">{pkg.price}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-fptext-muted">
          Entre em contato pelo WhatsApp do suporte para efetuar o pagamento e liberar os créditos.
        </p>

        <button
          onClick={onClose}
          className="w-full rounded-md border border-fp-border py-2 text-sm text-fptext-muted hover:text-fptext-primary transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Props = { token: string };

export default function TabIA({ token }: Props) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [showReloadModal, setShowReloadModal] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      setLoadingUsage(true);
      const res = await fetch('/api/whatsapp/ai/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { usage?: UsageData };
      if (data.usage) setUsage(data.usage);
    } catch {
      /* silencioso — não bloqueia o painel principal */
    } finally {
      setLoadingUsage(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  return (
    <>
      {/* Barra de uso */}
      {loadingUsage ? (
        <div className="mb-4 flex items-center gap-2 text-xs text-fptext-muted">
          <Spinner size="sm" />
          <span>Carregando uso da IA…</span>
        </div>
      ) : usage ? (
        <UsageBar usage={usage} onReload={() => setShowReloadModal(true)} />
      ) : null}

      {/* Painel existente de configuração */}
      <WhatsAppChatbotPanel token={token} />

      {/* Modal de recarga */}
      {showReloadModal && <ReloadModal onClose={() => setShowReloadModal(false)} />}
    </>
  );
}
