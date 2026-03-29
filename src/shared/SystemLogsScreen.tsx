import React, { useEffect, useState } from 'react';
import { Activity, Search, RefreshCw } from 'lucide-react';

interface Log {
  id: number;
  usuario_nome: string;
  cargo: string;
  acao: string;
  detalhes: string;
  created_at: string;
}

const ACAO_LABEL: Record<string, { label: string; cor: string }> = {
  LOGIN:          { label: 'Login',          cor: 'bg-blue-100 text-blue-700'       },
  LOGOUT:         { label: 'Logout',         cor: 'bg-zinc-100 text-zinc-600'       },
  VENDA:          { label: 'Venda',          cor: 'bg-emerald-100 text-emerald-700' },
  CANCELAMENTO:   { label: 'Cancelamento',   cor: 'bg-red-100 text-red-700'         },
  CAIXA_ABERTO:   { label: 'Caixa Aberto',   cor: 'bg-amber-100 text-amber-700'     },
  CAIXA_FECHADO:  { label: 'Caixa Fechado',  cor: 'bg-orange-100 text-orange-700'   },
  ACESSO_CRIADO:  { label: 'Acesso Criado',  cor: 'bg-violet-100 text-violet-700'   },
  SUPERVISAO:     { label: 'Supervisao',     cor: 'bg-pink-100 text-pink-700'       },
};

const CARGO_COR: Record<string, string> = {
  dono:      'bg-amber-100 text-amber-800',
  gerente:   'bg-blue-100 text-blue-800',
  atendente: 'bg-zinc-100 text-zinc-700',
};

interface Props {
  token: string;
}

export default function SystemLogsScreen({ token }: Props) {
  const [logs, setLogs]       = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]         = useState('');
  const [dateFilter, setDateFilter] = useState<'hoje'|'semana'|'mes'|'tudo'>('tudo');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs?limite=300', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtrados = logs.filter((l) => {
    // Filtro de data
    if (dateFilter !== 'tudo') {
      const d     = new Date(l.created_at);
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dateFilter === 'hoje' && d < today) return false;
      if (dateFilter === 'semana') {
        const start = new Date(today); start.setDate(today.getDate() - today.getDay());
        if (d < start) return false;
      }
      if (dateFilter === 'mes' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
    }
    // Filtro de texto
    if (!busca) return true;
    const t = busca.toLowerCase();
    return (
      (l.usuario_nome || '').toLowerCase().includes(t) ||
      (l.acao || '').toLowerCase().includes(t) ||
      (l.detalhes || '').toLowerCase().includes(t)
    );
  });

  const fmt = (dt: string) =>
    new Date(dt).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="h-full flex flex-col bg-zinc-50">
      <div className="bg-white border-b border-zinc-200 px-8 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-zinc-900">Logs do Sistema</h1>
            <p className="text-xs text-zinc-400">{filtrados.length} registro(s)</p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="px-8 py-4 shrink-0 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por usuario, acao..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 transition-all w-64"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {([
            { key: 'hoje',   label: 'Hoje'       },
            { key: 'semana', label: 'Esta semana' },
            { key: 'mes',    label: 'Este mês'    },
            { key: 'tudo',   label: 'Tudo'        },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setDateFilter(key)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${dateFilter === key ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-zinc-400 text-sm sm:py-14 2xl:py-20">Carregando logs...</div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-400 sm:py-14 2xl:py-20">
            <Activity size={40} className="mb-3 opacity-20" />
            <p className="font-semibold">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-2 text-[11px] font-black text-zinc-400 uppercase tracking-wider sm:px-5 sm:py-2.5 2xl:px-5 2xl:py-3">Data/Hora</th>
                  <th className="text-left px-4 py-2 text-[11px] font-black text-zinc-400 uppercase tracking-wider sm:px-5 sm:py-2.5 2xl:px-5 2xl:py-3">Usuario</th>
                  <th className="text-left px-4 py-2 text-[11px] font-black text-zinc-400 uppercase tracking-wider sm:px-5 sm:py-2.5 2xl:px-5 2xl:py-3">Cargo</th>
                  <th className="text-left px-4 py-2 text-[11px] font-black text-zinc-400 uppercase tracking-wider sm:px-5 sm:py-2.5 2xl:px-5 2xl:py-3">Acao</th>
                  <th className="text-left px-4 py-2 text-[11px] font-black text-zinc-400 uppercase tracking-wider sm:px-5 sm:py-2.5 2xl:px-5 2xl:py-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filtrados.map((log) => {
                  const acaoCfg = ACAO_LABEL[log.acao] || { label: log.acao, cor: 'bg-zinc-100 text-zinc-600' };
                  const cargoCor = CARGO_COR[log.cargo] || CARGO_COR.atendente;
                  return (
                    <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap sm:px-5 sm:py-2.5 2xl:py-3">{fmt(log.created_at)}</td>
                      <td className="px-4 py-2 font-bold text-zinc-800 sm:px-5 sm:py-2.5 2xl:py-3">{log.usuario_nome}</td>
                      <td className="px-4 py-2 sm:px-5 sm:py-2.5 2xl:py-3">
                        <span className={'px-2 py-0.5 rounded-lg text-[10px] font-black capitalize ' + cargoCor}>
                          {log.cargo}
                        </span>
                      </td>
                      <td className="px-4 py-2 sm:px-5 sm:py-2.5 2xl:py-3">
                        <span className={'px-2.5 py-1 rounded-lg text-[10px] font-black ' + acaoCfg.cor}>
                          {acaoCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-zinc-500 text-xs max-w-xs truncate sm:px-5 sm:py-2.5 2xl:py-3">{log.detalhes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}