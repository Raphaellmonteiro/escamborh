/**
 * TabLogs.tsx
 * Aba de Histórico e Logs — feed de eventos recentes do módulo WhatsApp IA.
 * Fase 9. Requer endpoint GET /api/whatsapp/ai/logs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Card';
import { fieldSelectClass } from '../../components/ui/fieldStyles';
import { Spinner } from '../../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../../components/ui/screenChrome';

type LogType = 'all' | 'order' | 'campaign' | 'error' | 'message';

type LogEntry = {
  id: number;
  type: string;
  summary: string;
  detail?: string | null;
  phone?: string | null;
  created_at: string;
};

type APIResponse = {
  success?: boolean;
  logs?: LogEntry[];
  total?: number;
  error?: string;
};

const TYPE_COLOR: Record<string, string> = {
  order:    'bg-blue-100 text-blue-700',
  campaign: 'bg-violet-100 text-violet-700',
  error:    'bg-red-100 text-red-700',
  message:  'bg-zinc-100 text-zinc-600',
};

const TYPE_ICON: Record<string, string> = {
  order:    '🛍️',
  campaign: '📣',
  error:    '⚠️',
  message:  '💬',
};

type Props = { token: string };

export default function TabLogs({ token }: Props) {
  const [logs,     setLogs]     = useState<LogEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [typeFilter, setType]   = useState<LogType>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: '1', limit: '50' });
      if (typeFilter !== 'all') qs.set('type', typeFilter);

      const res  = await fetch(`/api/whatsapp/ai/logs?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: APIResponse = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Erro ao carregar logs.');
      } else {
        setLogs(json.logs ?? []);
      }
    } catch {
      setError('Falha de conexão.');
    } finally {
      setLoading(false);
    }
  }, [token, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className={`${adminOpsSurfaceCardClass} flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5`}>
        <div>
          <p className={adminSectionEyebrowClass}>Histórico</p>
          <h2 className="mt-1 text-base font-black text-fptext-primary">Logs e Eventos</h2>
          <p className="mt-1 text-sm text-fptext-muted">
            Pedidos criados pela IA, campanhas disparadas, mensagens e erros recentes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            className={`${fieldSelectClass} w-36`}
            value={typeFilter}
            onChange={(e) => setType(e.target.value as LogType)}
          >
            <option value="all">Todos</option>
            <option value="message">Mensagens</option>
            <option value="order">Pedidos</option>
            <option value="campaign">Campanhas</option>
            <option value="error">Erros</option>
          </select>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[10rem] items-center justify-center"><Spinner /></div>
      )}

      {!loading && error && (
        <div className={`${adminOpsInsetPanelClass} p-4 text-sm text-red-600`}>{error}</div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className={`${adminOpsSurfaceCardClass} flex flex-col items-center gap-3 p-10 text-center`}>
          <History size={32} className="text-fptext-muted" />
          <p className="text-sm text-fptext-muted">Nenhum evento registrado ainda.</p>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <ul className="space-y-1.5">
          {logs.map((log) => {
            const isOpen = expanded.has(log.id);
            const typeKey = log.type?.toLowerCase() ?? 'message';
            return (
              <li key={log.id} className={`${adminOpsSurfaceCardClass} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => log.detail ? toggleExpand(log.id) : undefined}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left ${log.detail ? 'hover:bg-fp-hover transition-colors' : ''}`}
                >
                  <span className="mt-0.5 text-base leading-none" aria-hidden>
                    {TYPE_ICON[typeKey] ?? '🔔'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fptext-primary">{log.summary}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TYPE_COLOR[typeKey] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        {typeKey}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fptext-muted">
                      <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                      {log.phone && <span>· {log.phone}</span>}
                    </div>
                  </div>
                  {log.detail && (
                    <span className="shrink-0 text-xs text-fptext-muted">{isOpen ? '▲' : '▼'}</span>
                  )}
                </button>

                {isOpen && log.detail && (
                  <div className="border-t border-fp-border-soft bg-fp-secondary px-4 py-3">
                    <pre className="whitespace-pre-wrap text-xs text-fptext-muted font-mono leading-relaxed">
                      {log.detail}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
