import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  X,
  Pencil,
  CreditCard,
  Repeat,
  BarChart2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import type { AssinaturaPlan, PlanoServico, Product, BarberCliente } from '../../../types';
import { Card, Button } from '../../../components/ui/Card';

export default function AssinaturasTab({ token }: { token: string }) {
  const [planos, setPlanos] = useState<AssinaturaPlan[]>([]);
  const [assinantes, setAssinantes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<BarberCliente[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [showPlano, setShowPlano] = useState(false);
  const [showAssinar, setShowAssinar] = useState(false);
  const [showRelatorio, setShowRelatorio] = useState(false);
  const [relatorio, setRelatorio] = useState<any | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugData, setDebugData] = useState<any | null>(null);
  const [usosMes, setUsosMes] = useState<number>(0);
  const [editPlano, setEditPlano] = useState<AssinaturaPlan | null>(null);
  const [planoForm, setPlanoForm] = useState<{nome:string;descricao:string;valor_mensal:number;tipo_plano:'pacote'|'ilimitado'}>({ nome: '', descricao: '', valor_mensal: 0, tipo_plano: 'pacote' });
  const [planoServicos, setPlanoServicos] = useState<{produto_id:number;produto_nome:string;quantidade:number}[]>([]);
  const [assinarForm, setAssinarForm] = useState({ cliente_id: '', plano_id: '', data_inicio: '', data_vencimento: '' });
  const [expandedAssinante, setExpandedAssinante] = useState<number | null>(null);
  const [filtroAssinante, setFiltroAssinante] = useState<string>('ativa');
  const [assinanteUsos, setAssinanteUsos] = useState<Record<number, any>>({});

  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];

  const h = { Authorization: `Bearer ${token}` };

  const safeJson = async (url: string, fallback: any = null) => {
    try { const r = await fetch(url, { headers: h }); return r.ok ? await r.json() : fallback; }
    catch { return fallback; }
  };

  const fetchAll = async () => {
    const firstDay = today.slice(0, 7) + '-01';
    // planos-detalhados -> fallback para /planos se rota ainda nao existir
    const p = await safeJson('/api/barber/assinaturas/planos-detalhados')
              ?? await safeJson('/api/barber/assinaturas/planos', []);
    const [a, c, pr, rel] = await Promise.all([
      safeJson('/api/barber/assinaturas/assinantes', []),
      safeJson('/api/barber/clientes', []),
      safeJson('/api/products', []),
      safeJson(`/api/barber/assinaturas/relatorio?inicio=${firstDay}&fim=${today}`, { total_usos: 0 }),
    ]);
    setPlanos(Array.isArray(p) ? p : []);
    setAssinantes(Array.isArray(a) ? a : []);
    setClientes(Array.isArray(c) ? c : []);
    setProdutos((Array.isArray(pr) ? pr : []).filter((x: Product) => x.active && (x.category as string) !== 'PRODUTO FISICO'));
    setUsosMes(rel?.total_usos || 0);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchUsos = async (assinanteId: number) => {
    const res = await fetch(`/api/barber/assinaturas/uso-cliente/${assinanteId}`, { headers: h });
    if (res.ok) {
      const d = await res.json();
      setAssinanteUsos(prev => ({ ...prev, [assinanteId]: d }));
    }
  };

  const toggleAssinante = (clienteId: number) => {
    if (expandedAssinante === clienteId) { setExpandedAssinante(null); return; }
    setExpandedAssinante(clienteId);
    fetchUsos(clienteId);
  };

  const savePlano = async () => {
    if (!planoForm.nome) return;
    const url = editPlano ? `/api/barber/assinaturas/planos/${editPlano.id}` : '/api/barber/assinaturas/planos';
    const method = editPlano ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(planoForm) });
    if (!res.ok) { alert('Erro ao salvar plano'); return; }
    const saved = await res.json();
    const planoId = editPlano?.id || saved.id;

    // Salvar serviços: remover todos e reinserir
    if (editPlano) {
      // Buscar serviços atuais e remover
      const svcs: any[] = await fetch(`/api/barber/assinaturas/planos/${planoId}/servicos`, { headers: h }).then(r => r.json());
      await Promise.all(svcs.map(s => fetch(`/api/barber/assinaturas/planos/${planoId}/servicos/${s.id}`, { method: 'DELETE', headers: h })));
    }
    await Promise.all(planoServicos.map(s =>
      fetch(`/api/barber/assinaturas/planos/${planoId}/servicos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify(s)
      })
    ));
    setShowPlano(false); setEditPlano(null); fetchAll();
  };

  const openEditPlano = (p: AssinaturaPlan) => {
    setEditPlano(p);
    setPlanoForm({ nome: p.nome, descricao: p.descricao || '', valor_mensal: p.valor_mensal, tipo_plano: p.tipo_plano || 'pacote' });
    setPlanoServicos((p.servicos || []).map(s => ({ produto_id: s.produto_id, produto_nome: s.produto_nome, quantidade: s.quantidade })));
    setShowPlano(true);
  };

  const addServicoToPlano = (prodId: number) => {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;
    if (planoServicos.find(s => s.produto_id === prodId)) return;
    setPlanoServicos(prev => [...prev, { produto_id: prodId, produto_nome: prod.name, quantidade: planoForm.tipo_plano === 'ilimitado' ? 0 : 1 }]);
  };

  const assinar = async () => {
    await fetch('/api/barber/assinaturas/assinar', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(assinarForm) });
    setShowAssinar(false); fetchAll();
  };

  const cancelar = async (id: number) => {
    if (!confirm('Cancelar esta assinatura?')) return;
    await fetch(`/api/barber/assinaturas/${id}/cancelar`, { method: 'PATCH', headers: h });
    fetchAll();
  };

  const renovar = async (id: number) => {
    const novoVenc = new Date(); novoVenc.setMonth(novoVenc.getMonth() + 1);
    await fetch(`/api/barber/assinaturas/${id}/renovar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ data_vencimento: novoVenc.toISOString().split('T')[0] }) });
    fetchAll();
  };

  const fetchRelatorio = async () => {
    const firstDay = today.slice(0, 7) + '-01';
    const res = await fetch(`/api/barber/assinaturas/relatorio?inicio=${firstDay}&fim=${today}`, { headers: h });
    if (res.ok) { setRelatorio(await res.json()); setShowRelatorio(true); }
  };

  const fetchDebug = async () => {
    const res = await fetch('/api/barber/debug/pacotes', { headers: h });
    if (res.ok) { setDebugData(await res.json()); setShowDebug(true); }
    else alert('Erro ao carregar diagnóstico: ' + res.status);
  };

  const ativasCount = assinantes.filter(a => a.status === 'ativa').length;
  const receitaMensal = assinantes.filter(a => a.status === 'ativa').reduce((s, a) => s + (a.valor_mensal || 0), 0);

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          ['Assinaturas Ativas', ativasCount, 'bg-green-50 border-green-200', 'text-green-900'],
          ['Receita Mensal', `R$ ${receitaMensal.toFixed(2)}`, 'bg-amber-50 border-amber-200', 'text-amber-900'],
          ['Planos Disponíveis', planos.filter(p => p.ativo).length, 'bg-blue-50 border-blue-200', 'text-blue-900'],
          ['Usos este mês', usosMes, 'bg-purple-50 border-purple-200', 'text-purple-900'],
        ].map(([label, value, bg, text]) => (
          <div key={label as string} className={`rounded-2xl border p-4 ${bg}`}>
            <p className={`text-2xl font-black ${text}`}>{value}</p>
            <p className={`text-xs font-medium mt-1 ${text} opacity-70`}>{label}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end mb-3 gap-2">
        <button onClick={fetchRelatorio} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-colors">
          <BarChart2 size={14} /> Relatório de Uso
        </button>
        <button onClick={fetchDebug} className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-colors">
          🔍 Diagnóstico
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Planos */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-black text-zinc-900">Planos</h3>
            <Button onClick={() => { setEditPlano(null); setPlanoForm({ nome: '', descricao: '', valor_mensal: 0, tipo_plano: 'pacote' }); setPlanoServicos([]); setShowPlano(true); }}>
              <Plus size={14} /> Novo Plano
            </Button>
          </div>
          <div className="space-y-3">
            {planos.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-zinc-200 p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-black text-zinc-900">{p.nome}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.tipo_plano === 'ilimitado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.tipo_plano === 'ilimitado' ? '♾️ Ilimitado' : '📦 Pacote'}
                      </span>
                    </div>
                    {p.descricao && <p className="text-xs text-zinc-500 mt-0.5">{p.descricao}</p>}
                    <p className="text-xl font-black text-zinc-900 mt-1">R$ {p.valor_mensal.toFixed(2)}<span className="text-sm font-normal text-zinc-400">/mês</span></p>
                    {/* Serviços do plano */}
                    {(p.servicos || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(p.servicos || []).map(s => (
                          <span key={s.id} className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {s.produto_nome}
                            {s.quantidade === 0 ? ' ∞' : ` ×${s.quantidade}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button onClick={() => openEditPlano(p)} className="p-1.5 text-zinc-300 hover:text-zinc-700"><Pencil size={13} /></button>
                    <button onClick={async () => { if (confirm('Excluir plano?')) { await fetch(`/api/barber/assinaturas/planos/${p.id}`, { method: 'DELETE', headers: h }); fetchAll(); } }}
                      className="p-1.5 text-zinc-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
            {planos.length === 0 && <p className="text-sm text-zinc-400 text-center py-8">Nenhum plano criado</p>}
          </div>
        </div>

        {/* Assinantes */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-black text-zinc-900">Assinantes</h3>
            <Button variant="secondary" onClick={() => { setAssinarForm({ cliente_id: '', plano_id: '', data_inicio: today, data_vencimento: nextMonthStr }); setShowAssinar(true); }}>
              <CreditCard size={14} /> Assinar
            </Button>
          </div>

          {/* Filtros */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {([ ['ativa', '✅ Ativos', 'bg-green-600 text-white', 'bg-zinc-100 text-zinc-600 hover:bg-green-50 hover:text-green-700'],
                ['vencendo', '⚠️ A renovar', 'bg-amber-500 text-white', 'bg-zinc-100 text-zinc-600 hover:bg-amber-50 hover:text-amber-700'],
                ['cancelada', '⛔ Cancelados', 'bg-red-500 text-white', 'bg-zinc-100 text-zinc-600 hover:bg-red-50 hover:text-red-700'],
                ['todos', 'Todos', 'bg-zinc-900 text-white', 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'],
            ] as [string,string,string,string][]).map(([val, label, activeClass, inactiveClass]) => {
              const count = val === 'todos' ? assinantes.length
                : val === 'vencendo' ? assinantes.filter(a => a.status === 'ativa' && new Date(a.data_vencimento) < new Date(Date.now() + 7*86400000)).length
                : assinantes.filter(a => a.status === val).length;
              return (
                <button key={val} onClick={() => setFiltroAssinante(val)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${filtroAssinante === val ? activeClass : inactiveClass}`}>
                  {label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${filtroAssinante === val ? 'bg-white/20' : 'bg-white/80 text-zinc-700'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {assinantes
              .filter(a => {
                if (filtroAssinante === 'todos') return true;
                if (filtroAssinante === 'vencendo') return a.status === 'ativa' && new Date(a.data_vencimento) < new Date(Date.now() + 7*86400000);
                return a.status === filtroAssinante;
              })
              .map(a => {
              const vencendo = new Date(a.data_vencimento) < new Date(Date.now() + 7 * 86400000);
              const vencido = new Date(a.data_vencimento) < new Date();
              const usos = assinanteUsos[a.cliente_id];
              const isExpanded = expandedAssinante === a.cliente_id;
              const borderClass = a.status === 'cancelada' ? 'border-zinc-200 opacity-60'
                : vencido ? 'border-red-300'
                : vencendo ? 'border-amber-200'
                : 'border-zinc-200';
              return (
                <div key={a.id} className={`bg-white rounded-2xl border p-4 transition-all ${borderClass}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-900 text-sm">{a.cliente_nome}</p>
                      <p className="text-xs text-zinc-500">{a.plano_nome} · R$ {a.valor_mensal?.toFixed(2)}/mês</p>
                      <p className={`text-[10px] mt-0.5 font-bold ${vencido ? 'text-red-600' : vencendo ? 'text-amber-600' : 'text-green-600'}`}>
                        {a.status === 'ativa' ? (vencido ? '❌ Vencida' : vencendo ? '⚠️ Vencendo em breve' : '✅ Ativa') : '⛔ Cancelada'}
                        {a.status === 'ativa' && ` · vence ${new Date(a.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button onClick={() => toggleAssinante(a.cliente_id)} className="text-[10px] bg-zinc-50 text-zinc-600 px-2 py-1 rounded-lg font-bold hover:bg-zinc-100">
                        {isExpanded ? '▲ Ocultar' : '📊 Ver uso'}
                      </button>
                      {a.status === 'ativa' && <>
                        <button onClick={() => renovar(a.id)} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-0.5"><Repeat size={9} />Renovar</button>
                        <button onClick={() => cancelar(a.id)} className="text-[10px] bg-red-50 text-red-700 px-2 py-1 rounded-lg font-bold hover:bg-red-100">Cancelar</button>
                      </>}
                    </div>
                  </div>
                  {/* Painel de uso do plano */}
                  {isExpanded && usos && (
                    <div className="mt-3 pt-3 border-t border-zinc-100">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Uso do plano · {usos.assinatura?.data_inicio} a {usos.assinatura?.data_vencimento}
                      </p>
                      {(usos.servicos || []).length === 0 && (
                        <p className="text-xs text-zinc-400">Nenhum serviço definido neste plano.</p>
                      )}
                      <div className="space-y-2">
                        {(usos.servicos || []).map((s: any) => {
                          const pct = s.limite === 0 ? 100 : Math.min(100, Math.round((s.qtd_usado / s.limite) * 100));
                          const esgotado = s.limite > 0 && s.qtd_usado >= s.limite;
                          return (
                            <div key={s.produto_id}>
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="font-semibold text-zinc-700">{s.produto_nome}</span>
                                <span className={`font-black ${esgotado ? 'text-red-600' : 'text-zinc-900'}`}>
                                  {s.limite === 0 ? `${s.qtd_usado} usos (ilimitado)` : `${s.qtd_usado}/${s.limite}${esgotado ? ' — Esgotado' : ''}`}
                                </span>
                              </div>
                              {s.limite > 0 && (
                                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${esgotado ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                                    style={{ width: `${pct}%` }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {assinantes.length === 0 && <p className="text-sm text-zinc-400 text-center py-8">Nenhum assinante ainda</p>}
          </div>
        </div>
      </div>

      {/* Modal: novo / editar plano */}
      <AnimatePresence>
        {showPlano && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-2xl font-black text-zinc-900 mb-6">{editPlano ? 'Editar Plano' : 'Novo Plano'}</h3>
              <div className="space-y-4">
                {/* Tipo do plano */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo do Plano</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[['pacote','📦 Pacote','Quantidade limitada por serviço'],['ilimitado','♾️ Ilimitado','Serviços sem limite de uso']].map(([val, label, desc]) => (
                      <button key={val} type="button"
                        onClick={() => { setPlanoForm(p => ({ ...p, tipo_plano: val as 'pacote'|'ilimitado' }));
                          if (val === 'ilimitado') setPlanoServicos(prev => prev.map(s => ({ ...s, quantidade: 0 }))); }}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${planoForm.tipo_plano === val ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                        <p className="font-black text-zinc-900 text-sm">{label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome do plano</label>
                  <input type="text" placeholder="Ex: Plano Bronze" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={planoForm.nome} onChange={e => setPlanoForm(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Descrição</label>
                  <input type="text" placeholder="Ex: 2 cortes + 1 barba por mês" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={planoForm.descricao} onChange={e => setPlanoForm(p => ({ ...p, descricao: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor mensal (R$)</label>
                  <input type="number" step="0.01" min="0" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={planoForm.valor_mensal} onChange={e => setPlanoForm(p => ({ ...p, valor_mensal: parseFloat(e.target.value) || 0 }))} />
                </div>

                {/* Serviços incluídos */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Serviços incluídos</label>
                  {planoServicos.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {planoServicos.map((s, i) => (
                        <div key={s.produto_id} className="flex items-center gap-2 bg-zinc-50 rounded-xl p-2.5 border border-zinc-200">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-zinc-900">{s.produto_nome}</p>
                          </div>
                          {planoForm.tipo_plano === 'pacote' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-zinc-500">Qtd/mês:</span>
                              <input type="number" min="1" max="99"
                                className="w-14 text-center text-sm font-bold bg-white border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none"
                                value={s.quantidade || 1}
                                onChange={e => setPlanoServicos(prev => prev.map((sv, idx) => idx === i ? { ...sv, quantidade: parseInt(e.target.value) || 1 } : sv))} />
                            </div>
                          ) : (
                            <span className="text-xs font-black text-green-700 bg-green-50 px-2 py-1 rounded-lg">♾️ Ilimitado</span>
                          )}
                          <button onClick={() => setPlanoServicos(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-zinc-300 hover:text-red-500"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm text-zinc-500"
                    value=""
                    onChange={e => { if (e.target.value) addServicoToPlano(parseInt(e.target.value)); }}>
                    <option value="">+ Adicionar serviço ao plano...</option>
                    {produtos.filter(p => !planoServicos.find(s => s.produto_id === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.name} — R$ {p.price.toFixed(2)}</option>
                    ))}
                  </select>
                  {planoServicos.length === 0 && (
                    <p className="text-xs text-zinc-400">Selecione os serviços cobertos por este plano acima. O sistema usará esses serviços para identificar automaticamente quando não cobrar o cliente.</p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowPlano(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={savePlano}>Salvar Plano</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: assinar */}
      <AnimatePresence>
        {showAssinar && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <h3 className="text-2xl font-black text-zinc-900 mb-6">Nova Assinatura</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cliente</label>
                  <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={assinarForm.cliente_id} onChange={e => setAssinarForm(p => ({ ...p, cliente_id: e.target.value }))}>
                    <option value="">Selecione o cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</label>
                  <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={assinarForm.plano_id} onChange={e => setAssinarForm(p => ({ ...p, plano_id: e.target.value }))}>
                    <option value="">Selecione o plano...</option>
                    {planos.filter(p => p.ativo).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — R$ {p.valor_mensal.toFixed(2)}/mês
                        {p.tipo_plano === 'ilimitado' ? ' (Ilimitado)' : ''}
                      </option>
                    ))}
                  </select>
                  {/* Preview do plano selecionado */}
                  {assinarForm.plano_id && (() => {
                    const pl = planos.find(p => String(p.id) === assinarForm.plano_id);
                    return pl && (pl.servicos || []).length > 0 ? (
                      <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Inclui:</p>
                        {(pl.servicos || []).map(s => (
                          <p key={s.id} className="text-xs text-zinc-700">• {s.produto_nome} {s.quantidade === 0 ? '(ilimitado)' : `× ${s.quantidade}`}</p>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Início</label>
                    <input type="date" className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={assinarForm.data_inicio} onChange={e => setAssinarForm(p => ({ ...p, data_inicio: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Vencimento</label>
                    <input type="date" className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={assinarForm.data_vencimento} onChange={e => setAssinarForm(p => ({ ...p, data_vencimento: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowAssinar(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={assinar} disabled={!assinarForm.cliente_id || !assinarForm.plano_id}>Assinar</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Diagnóstico de Pacotes */}
      <AnimatePresence>
        {showDebug && debugData && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-black text-zinc-900">🔍 Diagnóstico do Sistema de Pacotes</h3>
                <button onClick={() => setShowDebug(false)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={20} /></button>
              </div>

              <div className="space-y-5 text-sm">
                {/* Plano Serviços */}
                <div>
                  <p className="font-black text-zinc-900 mb-2">📋 Serviços cadastrados nos planos ({debugData.planoServicos?.length || 0})</p>
                  {(debugData.planoServicos || []).length === 0
                    ? <p className="text-red-600 font-bold">⚠️ NENHUM SERVIÇO CADASTRADO — Abra o plano, clique em editar e adicione os serviços.</p>
                    : (
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="bg-zinc-50 text-zinc-500 uppercase text-[10px]">
                          <th className="p-2 text-left border border-zinc-100">Plano</th>
                          <th className="p-2 text-left border border-zinc-100">Serviço (nome)</th>
                          <th className="p-2 text-left border border-zinc-100">produto_id (BD)</th>
                          <th className="p-2 text-left border border-zinc-100">Nome atual produto</th>
                          <th className="p-2 text-left border border-zinc-100">Qtd</th>
                        </tr></thead>
                        <tbody>
                          {(debugData.planoServicos || []).map((s: any, i: number) => (
                            <tr key={i} className="border-b border-zinc-50">
                              <td className="p-2 border border-zinc-100">{s.plano_nome}</td>
                              <td className="p-2 border border-zinc-100">{s.produto_nome}</td>
                              <td className="p-2 border border-zinc-100 font-mono text-blue-600">{s.produto_id}</td>
                              <td className="p-2 border border-zinc-100">{s.produto_name_atual || <span className="text-red-500">ID não encontrado!</span>}</td>
                              <td className="p-2 border border-zinc-100">{s.quantidade === 0 ? '∞' : s.quantidade}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>

                {/* Assinaturas ativas */}
                <div>
                  <p className="font-black text-zinc-900 mb-2">👤 Assinaturas ativas ({debugData.assinaturas?.length || 0})</p>
                  {(debugData.assinaturas || []).length === 0
                    ? <p className="text-amber-600">Nenhuma assinatura ativa.</p>
                    : (
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="bg-zinc-50 text-zinc-500 uppercase text-[10px]">
                          <th className="p-2 text-left border border-zinc-100">Cliente</th>
                          <th className="p-2 text-left border border-zinc-100">cliente_id</th>
                          <th className="p-2 text-left border border-zinc-100">plano_id</th>
                          <th className="p-2 text-left border border-zinc-100">Plano</th>
                          <th className="p-2 text-left border border-zinc-100">Vence</th>
                        </tr></thead>
                        <tbody>
                          {(debugData.assinaturas || []).map((a: any, i: number) => (
                            <tr key={i} className="border-b border-zinc-50">
                              <td className="p-2 border border-zinc-100 font-bold">{a.cliente_nome}</td>
                              <td className="p-2 border border-zinc-100 font-mono text-blue-600">{a.cliente_id}</td>
                              <td className="p-2 border border-zinc-100 font-mono text-purple-600">{a.plano_id}</td>
                              <td className="p-2 border border-zinc-100">{a.plano_nome}</td>
                              <td className="p-2 border border-zinc-100">{a.data_vencimento}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>

                {/* Produtos ativos */}
                <div>
                  <p className="font-black text-zinc-900 mb-2">🛠️ Serviços/Produtos ativos no sistema ({debugData.produtos?.length || 0})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(debugData.produtos || []).map((p: any) => (
                      <span key={p.id} className="text-[10px] bg-zinc-100 text-zinc-700 px-2 py-1 rounded-full font-mono">
                        ID:{p.id} — {p.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Usos registrados */}
                <div>
                  <p className="font-black text-zinc-900 mb-2">📝 Últimos usos registrados em pacote_usos ({debugData.usos?.length || 0})</p>
                  {(debugData.usos || []).length === 0
                    ? <p className="text-amber-600 font-bold">⚠️ NENHUM USO REGISTRADO — Confirme que os serviços do plano têm o mesmo ID dos produtos do PDV.</p>
                    : (
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="bg-zinc-50 text-zinc-500 uppercase text-[10px]">
                          <th className="p-2 text-left border border-zinc-100">Cliente</th>
                          <th className="p-2 text-left border border-zinc-100">Serviço</th>
                          <th className="p-2 text-left border border-zinc-100">Fonte</th>
                          <th className="p-2 text-left border border-zinc-100">Data</th>
                        </tr></thead>
                        <tbody>
                          {(debugData.usos || []).map((u: any, i: number) => (
                            <tr key={i} className="border-b border-zinc-50">
                              <td className="p-2 border border-zinc-100">{u.cliente_nome}</td>
                              <td className="p-2 border border-zinc-100">{u.produto_nome}</td>
                              <td className="p-2 border border-zinc-100"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${u.fonte === 'agendamento' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-700'}`}>{u.fonte}</span></td>
                              <td className="p-2 border border-zinc-100 text-zinc-400">{u.created_at}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>

                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 mb-1">💡 Como interpretar:</p>
                  <p className="text-xs text-blue-700">O <strong>produto_id</strong> em "Serviços dos planos" deve coincidir com o <strong>ID</strong> do mesmo produto em "Produtos ativos". Se os IDs não coincidirem, recadastre os serviços no plano.</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Relatório de uso */}
      <AnimatePresence>
        {showRelatorio && relatorio && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-zinc-900">📊 Relatório de Uso — Mês Atual</h3>
                <button onClick={() => setShowRelatorio(false)} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-purple-50 rounded-2xl p-4"><p className="text-2xl font-black text-purple-900">{relatorio.total_usos}</p><p className="text-xs text-purple-600 mt-1">Usos registrados</p></div>
                <div className="bg-green-50 rounded-2xl p-4"><p className="text-2xl font-black text-green-900">{relatorio.assinantes_ativos}</p><p className="text-xs text-green-600 mt-1">Assinantes ativos</p></div>
              </div>
              <p className="text-sm font-black text-zinc-900 mb-3">Histórico de usos</p>
              {relatorio.usos.length === 0 ? (
                <p className="text-zinc-400 text-center py-6">Nenhum uso registrado neste período.</p>
              ) : (
                <div className="space-y-2">
                  {relatorio.usos.map((u: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{u.cliente_nome}</p>
                        <p className="text-xs text-zinc-500">{u.produto_nome} · {u.plano_nome}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-zinc-400">{new Date(u.created_at).toLocaleDateString('pt-BR')}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.fonte === 'agendamento' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{u.fonte === 'agendamento' ? 'Agenda' : 'PDV'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
// ─── Aba Funcionários & Produção ─────────────────────────────────