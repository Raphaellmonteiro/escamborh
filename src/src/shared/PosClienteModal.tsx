import React, { useEffect, useState, useCallback } from 'react';
import { X, UserPlus, Search } from 'lucide-react';
import { posModalFormLabelClass, posModalTitleClass } from '../components/ui/screenChrome';

export type PosClienteMetricasResumo = {
  total_pedidos: number;
  total_gasto: number;
  ticket_medio: number;
};

export type PosClienteSelecionado = {
  id: number;
  nome: string;
  telefone: string;
  fidelizacao?: { tier: string; label: string };
  metricas?: PosClienteMetricasResumo;
};

type ApiCliente = {
  id: number;
  nome: string;
  telefone: string;
  metricas?: PosClienteMetricasResumo & {
    ultimo_pedido_em?: string | null;
    primeira_compra_em?: string | null;
    canais_usados?: string[];
  };
  fidelizacao?: { tier: string; label: string };
};

function fmtTelDisplay(digits: string) {
  const d = digits.replace(/\D/g, '');
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function fetchClienteDetalhe(token: string, id: number): Promise<ApiCliente | null> {
  const res = await fetch(`/api/clientes/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ApiCliente;
  return data?.id ? data : null;
}

function clienteJaTemMetricasNoCache(cached: PosClienteSelecionado | null | undefined, id: number): boolean {
  return Boolean(cached && cached.id === id && cached.metricas);
}

/** Evita GET /clientes/:id quando o PDV já carregou métricas do mesmo cliente nesta sessão. */
async function fetchClienteDetalheIfNeeded(
  token: string,
  id: number,
  minimal: Pick<ApiCliente, 'id' | 'nome' | 'telefone'>,
  cached: PosClienteSelecionado | null | undefined
): Promise<ApiCliente | null> {
  if (clienteJaTemMetricasNoCache(cached, id)) {
    const c = cached!;
    return {
      ...minimal,
      metricas: {
        total_pedidos: c.metricas!.total_pedidos,
        total_gasto: c.metricas!.total_gasto,
        ticket_medio: c.metricas!.ticket_medio,
      },
      fidelizacao: c.fidelizacao,
    };
  }
  return fetchClienteDetalhe(token, id);
}

function pickResumoParaPedido(row: ApiCliente): Pick<PosClienteSelecionado, 'fidelizacao' | 'metricas'> {
  const m = row.metricas;
  if (!m) return {};
  return {
    metricas: {
      total_pedidos: m.total_pedidos,
      total_gasto: m.total_gasto,
      ticket_medio: m.ticket_medio,
    },
    fidelizacao: row.fidelizacao,
  };
}

export default function PosClienteModal({
  open,
  token,
  clienteAtual,
  onClose,
  onSelect,
}: {
  open: boolean;
  token: string;
  /** Cliente já no pedido (com métricas), para não refazer GET ao buscar o mesmo contato. */
  clienteAtual?: PosClienteSelecionado | null;
  onClose: () => void;
  onSelect: (c: PosClienteSelecionado | null) => void;
}) {
  const [telefone, setTelefone] = useState('');
  const [nomeBusca, setNomeBusca] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [encontrado, setEncontrado] = useState<ApiCliente | null>(null);
  const [carregandoMetricas, setCarregandoMetricas] = useState(false);
  const [listaNome, setListaNome] = useState<ApiCliente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTelefone('');
    setNomeBusca('');
    setNomeNovo('');
    setEncontrado(null);
    setListaNome([]);
    setErro(null);
    setCarregando(false);
    setCarregandoMetricas(false);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = document.getElementById('pos-cliente-tel');
      el?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [open]);

  const buscarPorTelefone = async () => {
    setErro(null);
    setListaNome([]);
    const digits = telefone.replace(/\D/g, '');
    if (digits.length < 8) {
      setEncontrado(null);
      setErro('Digite o telefone com DDD (mín. 8 dígitos)');
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch(`/api/clientes/lookup?telefone=${encodeURIComponent(digits)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setEncontrado(null);
        setErro(typeof data?.error === 'string' ? data.error : 'Erro ao buscar');
        return;
      }
      const base = data && data.id ? (data as ApiCliente) : null;
      setEncontrado(base);
      if (base?.id) {
        setCarregandoMetricas(true);
        try {
          const full = await fetchClienteDetalheIfNeeded(token, base.id, base, clienteAtual ?? null);
          if (full) setEncontrado(full);
        } finally {
          setCarregandoMetricas(false);
        }
      }
      if (!data?.id && !nomeNovo.trim()) {
        setNomeNovo('');
      }
    } catch {
      setEncontrado(null);
      setErro('Falha na busca');
    } finally {
      setCarregando(false);
    }
  };

  const buscarPorNome = async () => {
    setErro(null);
    setEncontrado(null);
    const q = nomeBusca.trim();
    if (q.length < 2) {
      setListaNome([]);
      setErro('Digite ao menos 2 letras');
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setListaNome([]);
        setErro('Erro ao buscar por nome');
        return;
      }
      setListaNome(Array.isArray(data) ? data : []);
    } catch {
      setListaNome([]);
      setErro('Falha na busca');
    } finally {
      setCarregando(false);
    }
  };

  const salvarEUso = async () => {
    setErro(null);
    const digits = telefone.replace(/\D/g, '');
    const nome = nomeNovo.trim();
    if (digits.length < 8) {
      setErro('Telefone inválido');
      return;
    }
    if (!nome) {
      setErro('Informe o nome');
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome, telefone: digits }),
      });
      const data = await res.json();
      if (!res.ok || !data?.customer?.id) {
        setErro(data?.error || 'Não foi possível salvar');
        return;
      }
      const c = data.customer as ApiCliente;
      const full = await fetchClienteDetalhe(token, c.id);
      const row = full || c;
      onSelect({
        id: row.id,
        nome: String(row.nome || nome),
        telefone: String(row.telefone || digits),
        ...pickResumoParaPedido(row),
      });
      onClose();
    } catch {
      setErro('Falha ao salvar');
    } finally {
      setCarregando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 md:items-center md:p-4">
      <div
        className="flex max-h-[min(96dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl md:max-h-[min(92dvh,640px)] md:max-w-md md:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-cliente-titulo"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserPlus size={18} className="text-amber-400 shrink-0" />
            <h2 id="pos-cliente-titulo" className={`${posModalTitleClass} truncate`}>
              Cliente no pedido
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 md:pb-4">
          <div>
            <label className={`${posModalFormLabelClass} block mb-1.5`}>
              Telefone (principal)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="pos-cliente-tel"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="11999998888"
                value={fmtTelDisplay(telefone)}
                onChange={(e) => setTelefone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void buscarPorTelefone();
                }}
                className="min-h-[48px] flex-1 min-w-0 rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 md:min-h-0 md:py-2.5 md:text-sm"
              />
              <button
                type="button"
                onClick={() => void buscarPorTelefone()}
                disabled={carregando}
                className="flex min-h-[48px] w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-900 disabled:opacity-50 sm:w-auto md:min-h-0 md:px-3 md:text-xs"
              >
                <Search size={14} /> Buscar
              </button>
            </div>
          </div>

          {encontrado && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">Cliente encontrado</p>
              <p className="font-bold text-zinc-100">{encontrado.nome || 'Sem nome'}</p>
              <p className="text-sm text-zinc-400">{fmtTelDisplay(encontrado.telefone)}</p>
              {carregandoMetricas && (
                <p className="text-xs text-zinc-500">Carregando histórico…</p>
              )}
              {!carregandoMetricas && encontrado.metricas && (
                <div className="rounded-lg bg-zinc-900/50 border border-zinc-700/80 px-2.5 py-2 space-y-1">
                  <p className={`${posModalFormLabelClass} tracking-wide`}>Fidelização</p>
                  <p className="text-xs text-zinc-300">
                    <span className="font-semibold text-zinc-100">{encontrado.metricas.total_pedidos}</span> pedidos
                    {' · '}
                    <span className="tabular-nums">{fmtBRL(encontrado.metricas.total_gasto)}</span> total
                    {encontrado.metricas.total_pedidos > 0 && (
                      <>
                        {' · '}
                        <span className="tabular-nums">{fmtBRL(encontrado.metricas.ticket_medio)}</span> médio
                      </>
                    )}
                  </p>
                  {encontrado.fidelizacao?.label && (
                    <p className="text-[11px] font-bold text-amber-400/90">{encontrado.fidelizacao.label}</p>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onSelect({
                    id: encontrado.id,
                    nome: String(encontrado.nome || ''),
                    telefone: String(encontrado.telefone || ''),
                    ...pickResumoParaPedido(encontrado),
                  });
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
              >
                Selecionar cliente
              </button>
            </div>
          )}

          {!encontrado && telefone.replace(/\D/g, '').length >= 8 && (
            <div>
              <label className={`${posModalFormLabelClass} block mb-1.5`}>
                Nome (cadastro rápido)
              </label>
              <input
                type="text"
                placeholder="Nome do cliente"
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <button
                type="button"
                onClick={() => void salvarEUso()}
                disabled={carregando}
                className="w-full mt-2 py-2.5 rounded-xl bg-zinc-100 text-zinc-900 font-bold text-sm disabled:opacity-50"
              >
                Salvar e usar
              </button>
            </div>
          )}

          <div className="border-t border-zinc-800 pt-4">
            <label className={`${posModalFormLabelClass} block mb-1.5`}>
              Buscar por nome
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: Maria"
                value={nomeBusca}
                onChange={(e) => setNomeBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void buscarPorNome();
                }}
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <button
                type="button"
                onClick={() => void buscarPorNome()}
                disabled={carregando}
                className="inline-flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-700 px-3 py-2 text-zinc-100 font-bold text-xs disabled:opacity-50 md:min-h-0 md:min-w-0"
              >
                Buscar
              </button>
            </div>
            {listaNome.length > 0 && (
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {listaNome.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          setCarregando(true);
                          try {
                            const full = await fetchClienteDetalheIfNeeded(
                              token,
                              c.id,
                              { id: c.id, nome: c.nome, telefone: c.telefone },
                              clienteAtual ?? null
                            );
                            const row = full || (c as ApiCliente);
                            onSelect({
                              id: row.id,
                              nome: String(row.nome || ''),
                              telefone: String(row.telefone || ''),
                              ...pickResumoParaPedido(row),
                            });
                            onClose();
                          } finally {
                            setCarregando(false);
                          }
                        })();
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-sm"
                    >
                      <span className="font-semibold text-zinc-100">{c.nome}</span>
                      <span className="text-zinc-500 text-xs block">{fmtTelDisplay(c.telefone)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {erro && <p className="text-xs text-red-400">{erro}</p>}
        </div>

        <div className="border-t border-zinc-800 p-3 shrink-0 bg-zinc-950 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className="w-full min-h-[44px] py-2.5 rounded-xl text-zinc-400 hover:text-zinc-200 text-sm font-medium md:min-h-0"
          >
            Continuar sem cliente
          </button>
        </div>
      </div>
    </div>
  );
}
