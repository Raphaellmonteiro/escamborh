/**
 * TabPedidos.tsx
 * Aba de Pedidos — lista pedidos criados pela IA (source = 'whatsapp_ai').
 * Fase 3: monitoramento. Botões de ação (Aceitar/Cancelar) serão adicionados
 * conforme a integração com o fluxo do Balcão PDV for finalizada.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import { Button } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../../components/ui/screenChrome';

type OrderItem = {
  product_id: number;
  name: string;
  qty: number;
  unit_price: number;
};

type AIOrder = {
  id: number;
  customer_phone: string;
  status: string;
  payment_method: string | null;
  payment_confirmed: boolean;
  total: number;
  created_at: string;
  items: OrderItem[];
};

type APIResponse = {
  success?: boolean;
  orders?: AIOrder[];
  error?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pendente:    'Pendente',
  confirmado:  'Confirmado',
  preparando:  'Preparando',
  entrega:     'Em entrega',
  finalizado:  'Finalizado',
  cancelado:   'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
  pendente:    'bg-amber-100 text-amber-700',
  confirmado:  'bg-blue-100 text-blue-700',
  preparando:  'bg-violet-100 text-violet-700',
  entrega:     'bg-sky-100 text-sky-700',
  finalizado:  'bg-emerald-100 text-emerald-700',
  cancelado:   'bg-red-100 text-red-700',
};

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
}

type Props = { token: string };

export default function TabPedidos({ token }: Props) {
  const [data,    setData]    = useState<AIOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/ai/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: APIResponse = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Erro ao carregar pedidos.');
      } else {
        setData(json.orders ?? []);
      }
    } catch {
      setError('Falha de conexão ao carregar pedidos.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className={`${adminOpsSurfaceCardClass} flex items-start justify-between gap-4 p-4 sm:p-5`}>
        <div>
          <p className={adminSectionEyebrowClass}>Pedidos via WhatsApp IA</p>
          <h2 className="mt-1 text-base font-black text-fptext-primary">
            Pedidos criados automaticamente
          </h2>
          <p className="mt-1 text-sm text-fptext-muted">
            Pedidos gerados pela IA durante conversas no WhatsApp.
            O Balcão PDV também recebe esses pedidos em tempo real.
          </p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading} className="shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1.5 hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {loading && (
        <div className="flex min-h-[10rem] items-center justify-center">
          <Spinner />
        </div>
      )}

      {!loading && error && (
        <div className={`${adminOpsInsetPanelClass} p-4 text-sm text-red-600`}>{error}</div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className={`${adminOpsSurfaceCardClass} flex flex-col items-center gap-3 p-10 text-center`}>
          <ShoppingBag size={32} className="text-fptext-muted" />
          <p className="text-sm text-fptext-muted">Nenhum pedido via WhatsApp IA encontrado.</p>
          <p className="text-xs text-fptext-muted">
            Quando a IA criar pedidos durante conversas, eles aparecerão aqui.
          </p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((order) => {
            const isOpen = expanded.has(order.id);
            const statusKey = order.status?.toLowerCase() ?? 'pendente';
            return (
              <li key={order.id} className={`${adminOpsSurfaceCardClass} overflow-hidden`}>
                {/* Linha resumo */}
                <button
                  type="button"
                  onClick={() => toggleExpand(order.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fp-hover transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fptext-primary">
                        #{order.id} — {formatPhone(order.customer_phone)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[statusKey] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        {STATUS_LABEL[statusKey] ?? order.status}
                      </span>
                      {order.payment_confirmed && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          PIX confirmado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-fptext-muted">
                      {new Date(order.created_at).toLocaleString('pt-BR')}
                      {order.payment_method && ` · ${order.payment_method}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-fptext-primary">
                    {formatBRL(order.total)}
                  </span>
                  <span className="shrink-0 text-fptext-muted text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Itens expandidos */}
                {isOpen && (
                  <div className="border-t border-fp-border-soft px-4 py-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-fptext-muted">
                      Itens do pedido
                    </p>
                    <ul className="space-y-1">
                      {(order.items ?? []).map((item, i) => (
                        <li key={i} className="flex justify-between text-sm">
                          <span className="text-fptext-primary">
                            {item.qty}× {item.name}
                          </span>
                          <span className="text-fptext-muted">
                            {formatBRL(item.unit_price * item.qty)}
                          </span>
                        </li>
                      ))}
                    </ul>
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
