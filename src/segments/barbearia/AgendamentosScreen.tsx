import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Search,
  ExternalLink,
  Pencil,
  Printer,
  CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product } from '../../types';
import type { Agendamento, BarberCliente } from './types';
import { Card, Button } from '../../components/ui/Card';

export default function AgendamentosScreen({ token, products }: { token: string; products: Product[] }) {
  const today = new Date().toISOString().split('T')[0];
  // ── estado de venda de produto avulso ───────────────────────────
  const [vendaAgendamento, setVendaAgendamento] = useState<any | null>(null); // agendamento alvo
  const [vendaCart, setVendaCart]   = useState<{produto: any, qty: number}[]>([]);
  const [vendaForma, setVendaForma] = useState('Dinheiro');
  const [vendaObs, setVendaObs]     = useState('');
  const [vendaSaving, setVendaSaving] = useState(false);
  const [vendaRecibo, setVendaRecibo] = useState<any | null>(null);
  const [produtosComEstoque, setProdutosComEstoque] = useState<number[]>([]);
  const [searchProdutoVenda, setSearchProdutoVenda] = useState('');

  useEffect(() => {
    fetch('/api/barber/produtos-com-estoque', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setProdutosComEstoque(d.ids || [])).catch(() => {});
  }, [token]);

  const produtosFiltradosVenda = useMemo(() => {
    const ativos = products.filter(p => p.active);
    if (!searchProdutoVenda.trim()) return ativos;
    const t = searchProdutoVenda.toLowerCase();
    return ativos.filter(p => p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t));
  }, [products, searchProdutoVenda]);

  const addProdutoVenda = (produto: any) => {
    setVendaCart(prev => {
      const ex = prev.find(i => i.produto.id === produto.id);
      if (ex) return prev.map(i => i.produto.id === produto.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { produto, qty: 1 }];
    });
  };

  const totalVenda = vendaCart.reduce((s, i) => s + i.produto.price * i.qty, 0);

  const finalizarVendaProduto = async () => {
    if (vendaCart.length === 0) return;
    setVendaSaving(true);
    const items = vendaCart.map(i => ({ produto_id: i.produto.id, nome: i.produto.name, qty: i.qty, preco: i.produto.price }));
    try {
      const res = await fetch('/api/barber/venda-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agendamento_id: vendaAgendamento?.id || null,
          cliente_nome:   vendaAgendamento?.cliente_nome || null,
          items, forma_pagamento: vendaForma, observacao: vendaObs,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setVendaRecibo({ items, total: totalVenda, forma: vendaForma, cliente: vendaAgendamento?.cliente_nome, id: d.id, data: new Date().toLocaleDateString('pt-BR'), hora: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) });
        setVendaAgendamento(null);
        setVendaCart([]);
        setVendaObs('');
      } else { alert(d.error || 'Erro ao registrar venda'); }
    } catch { alert('Erro de conexão'); }
    setVendaSaving(false);
  };

  const imprimirReciboVenda = (r: any) => {
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) return;
    const itensHTML = r.items.map((i: any) =>
      `<div class="row"><span>${i.qty > 1 ? `${i.qty}x ` : ''}${i.nome}</span><span>R$ ${(i.qty*i.preco).toFixed(2).replace('.',',')}</span></div>`
    ).join('');
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Recibo de Venda</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { font-family:'Courier New',Courier,monospace; font-size:13px; width:80mm; max-width:80mm; margin:0 auto; padding:6mm 4mm; background:#fff!important; color:#111!important; }
  h1 { text-align:center; font-size:15px; font-weight:900; margin:0 0 2px; letter-spacing:1px; }
  .subtitle { text-align:center; font-size:11px; color:#555; margin-bottom:2px; }
  hr { border:none; border-top:1px dashed #333; margin:6px 0; }
  .row { display:flex; justify-content:space-between; margin:3px 0; gap:4px; }
  .row span:first-child { flex:1; word-break:break-word; }
  .row span:last-child { white-space:nowrap; }
  .label { color:#555; }
  .section-title { font-weight:900; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#444; margin:5px 0 2px; }
  .total-row { font-size:15px; font-weight:900; margin:4px 0; }
  .footer { text-align:center; color:#999; font-size:10px; margin-top:8px; }
</style></head>
<body>
  <h1>VENDA DE PRODUTO</h1>
  <p class="subtitle">✂️ Comprovante</p>
  ${r.cliente ? `<p style="text-align:center;font-size:11px;color:#555">Cliente: <b>${r.cliente}</b></p>` : ''}
  <p style="text-align:center;font-size:11px;color:#555">${r.data} às ${r.hora}</p>
  <hr/>
  <div class="section-title">Produtos</div>
  ${itensHTML}
  <hr/>
  <div class="row total-row"><span>TOTAL:</span><span>R$ ${Number(r.total).toFixed(2).replace('.',',')}</span></div>
  <hr/>
  <div class="section-title">Pagamento</div>
  <div class="row"><span class="label">${r.forma}:</span><span>R$ ${Number(r.total).toFixed(2).replace('.',',')}</span></div>
  <hr/>
  <p class="footer">FlowPDV — Sistema de Gestão</p>
  <script>window.onload=function(){window.print()}</script>
</body></html>`);
    w.document.close();
  };
  const [selectedDate, setSelectedDate] = useState(today);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<BarberCliente[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editando, setEditando] = useState<Agendamento | null>(null);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [bookingLink, setBookingLink] = useState('');

  const [limiteHorario, setLimiteHorario] = useState(1);
  const [editandoLimite, setEditandoLimite] = useState(false);
  const [limiteTemp, setLimiteTemp] = useState(1);

  useEffect(() => {
    fetch('/api/barber/booking-link', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.slug) setBookingLink(`${window.location.origin}/agendar/${d.slug}`);
        if (d?.limite_por_horario) { setLimiteHorario(d.limite_por_horario); setLimiteTemp(d.limite_por_horario); }
      })
      .catch(() => {});
  }, [token]);

  const salvarLimite = async () => {
    const res = await fetch('/api/barber/booking-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ limite_por_horario: limiteTemp }),
    });
    if (res.ok) { setLimiteHorario(limiteTemp); setEditandoLimite(false); }
  };

  const horas = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
    '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
    '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00'];

  const [form, setForm] = useState({
    cliente_id: '', cliente_nome: '', servico_nome: '', produto_id: '' as string|number, barbeiro: '',
    funcionario_id: '',
    data: today, hora: '09:00', observacao: '', valor: 0
  });

  const services = (Array.isArray(products) ? products : []).filter(p => p.active);

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pendente:        { label: 'Pendente',        color: 'text-amber-700',   bg: 'bg-amber-100' },
    confirmado:      { label: 'Confirmado',       color: 'text-blue-700',    bg: 'bg-blue-100' },
    em_atendimento:  { label: 'Em atendimento',   color: 'text-purple-700',  bg: 'bg-purple-100' },
    concluido:       { label: 'Concluído',         color: 'text-green-700',   bg: 'bg-green-100' },
    cancelado:       { label: 'Cancelado',         color: 'text-red-700',     bg: 'bg-red-100' },
  };

  const fetchAgendamentos = async () => {
    const res = await fetch(`/api/barber/agendamentos?data=${selectedDate}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setAgendamentos(await res.json());
  };

  useEffect(() => { fetchAgendamentos(); }, [selectedDate]);

  useEffect(() => {
    fetch('/api/barber/clientes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setClientes).catch(() => {});
    fetch('/api/barber/funcionarios', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setFuncionarios).catch(() => {});
  }, []);

  const handleSave = async () => {
    const body = { ...form, valor: Number(form.valor) };
    const url = editando ? `/api/barber/agendamentos/${editando.id}` : '/api/barber/agendamentos';
    const method = editando ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      setShowNew(false); setEditando(null);
      setForm({ cliente_id: '', cliente_nome: '', servico_nome: '', produto_id: '', barbeiro: '', funcionario_id: '', data: today, hora: '09:00', observacao: '', valor: 0 });
      fetchAgendamentos();
    }
  };

  const changeStatus = async (id: number, status: string) => {
  const res = await fetch(`/api/barber/agendamentos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
  if (res.ok) {
    const data = await res.json();
    if (status === 'concluido' && data.fidelidade_ganhou) {
      alert(`🎉 ${data.fidelidade_cliente} atingiu a meta de fidelidade!\nUm serviço grátis foi liberado!`);
    }
  }
  fetchAgendamentos();
};

  const deleteAgendamento = async (id: number) => {
    if (!confirm('Excluir este agendamento?')) return;
    await fetch(`/api/barber/agendamentos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchAgendamentos();
  };

  // Navegação por semana
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + i);
    return d.toISOString().split('T')[0];
  });

  const formatDate = (d: string) => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  };
  const dayLabel = (d: string) => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(d + 'T12:00:00').getDay()];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black text-zinc-900">Agendamentos</h2>
          <p className="text-zinc-500 text-sm mt-1">{agendamentos.length} agendamento(s) em {formatDate(selectedDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          {bookingLink && (
            <a href={bookingLink} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-bold transition-colors">
              <ExternalLink size={15} />
              Site de Agendamento
            </a>
          )}
          {/* Limite de vagas por horário */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm">
            <span className="text-zinc-500 font-medium">Vagas/horário:</span>
            {editandoLimite ? (
              <>
                <input
                  type="number" min={1} max={20} value={limiteTemp}
                  onChange={e => setLimiteTemp(Number(e.target.value))}
                  className="w-14 px-2 py-1 border border-zinc-300 rounded-lg text-center text-sm font-bold focus:outline-none focus:border-zinc-900"
                />
                <button onClick={salvarLimite} className="px-3 py-1 bg-zinc-900 text-white rounded-lg text-xs font-bold hover:bg-zinc-700">Salvar</button>
                <button onClick={() => { setEditandoLimite(false); setLimiteTemp(limiteHorario); }} className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-bold">✕</button>
              </>
            ) : (
              <>
                <span className="font-black text-zinc-900">{limiteHorario}</span>
                <button onClick={() => { setEditandoLimite(true); setLimiteTemp(limiteHorario); }} className="p-1 text-zinc-400 hover:text-zinc-700" title="Editar limite">
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
          <Button onClick={() => { setEditando(null); setForm(f => ({ ...f, data: selectedDate })); setShowNew(true); }}>
            <Plus size={18} /> Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Seletor de semana */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {weekDays.map(d => {
          const count = agendamentos.filter(a => a.data === d).length;
          const isToday = d === today;
          return (
            <button key={d} onClick={() => setSelectedDate(d)}
              className={`flex-shrink-0 flex flex-col items-center p-3 rounded-2xl border-2 min-w-[64px] transition-all font-bold
                ${selectedDate === d ? 'bg-zinc-900 border-zinc-900 text-white' : isToday ? 'border-zinc-400 text-zinc-700' : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
              <span className="text-[10px] uppercase">{dayLabel(d)}</span>
              <span className="text-lg leading-tight">{d.split('-')[2]}</span>
              {count > 0 && <span className={`text-[9px] font-black mt-0.5 ${selectedDate === d ? 'text-white/70' : 'text-zinc-400'}`}>{count}x</span>}
            </button>
          );
        })}
      </div>

      {/* Lista de agendamentos */}
      <div className="space-y-3">
        {agendamentos.length === 0 ? (
          <div className="text-center py-20 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
            <CalendarDays size={48} className="mx-auto text-zinc-300 mb-4" />
            <p className="text-zinc-400 font-medium">Nenhum agendamento para esse dia</p>
            <p className="text-zinc-300 text-sm mt-1">Clique em "Novo Agendamento" para adicionar</p>
          </div>
        ) : agendamentos.map(ag => {
          const sc = statusConfig[ag.status] || statusConfig.pendente;
          return (
            <div key={ag.id}
            
  className={`bg-white rounded-2xl border-2 p-4 flex items-center gap-4
    shadow-sm hover:shadow-md transition-all
    ${ag.status === 'concluido'      ? 'border-green-200 bg-green-50/30'
    : ag.status === 'cancelado'      ? 'border-red-100 opacity-60'
    : ag.status === 'em_atendimento' ? 'border-purple-200'
    : ag.status === 'confirmado'     ? 'border-blue-200'
    : 'border-zinc-200'}`}>

  <div className="w-16 text-center shrink-0">
    <p className="text-2xl font-black text-zinc-900">{ag.hora}</p>
  </div>

  <div className="flex-1 min-w-0">
    <p className="font-black text-zinc-900 truncate">{ag.cliente_nome}</p>
    <p className="text-sm text-zinc-500">
      {ag.servico_nome}
      {ag.barbeiro && ag.barbeiro !== 'Qualquer' && (
        <span className="ml-1 px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[10px] font-bold">
          ✂️ {ag.barbeiro}
        </span>
      )}
    </p>
    {ag.observacao && <p className="text-xs text-zinc-400 mt-0.5 truncate">{ag.observacao}</p>}
  </div>

  <div className="flex items-center gap-2 shrink-0">
    {ag.valor > 0 && <span className="font-black text-zinc-900 text-sm">R$ {ag.valor.toFixed(2)}</span>}
    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${sc.bg} ${sc.color}`}>{sc.label}</span>

    {ag.status !== 'concluido' && ag.status !== 'cancelado' && (
      <button
        onClick={() => changeStatus(ag.id, 'concluido')}
        title="Marcar como concluído"
        className="p-1.5 bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
        <CheckCircle2 size={16} />
      </button>
    )}
    {ag.status === 'concluido' && (
      <span className="p-1.5 text-green-500"><CheckCircle2 size={16} /></span>
    )}
    {ag.status === 'concluido' && (
      <button
        onClick={() => { setVendaAgendamento(ag); setVendaCart([]); setVendaForma('Dinheiro'); setVendaObs(''); setSearchProdutoVenda(''); }}
        title="Vender produto ao cliente"
        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-black transition-colors whitespace-nowrap">
        📦 + Produto
      </button>
    )}

    <select
      value={ag.status}
      onChange={e => changeStatus(ag.id, e.target.value)}
      className="text-xs border border-zinc-200 rounded-lg px-2 py-1 bg-zinc-50 focus:outline-none">
      <option value="pendente">Pendente</option>
      <option value="confirmado">Confirmado</option>
      <option value="em_atendimento">Em atendimento</option>
      <option value="concluido">Concluído</option>
      <option value="cancelado">Cancelado</option>
    </select>

    <button onClick={() => deleteAgendamento(ag.id)}
      className="text-zinc-300 hover:text-red-500 transition-colors">
      <Trash2 size={16} />
    </button>
  </div>
</div>
          );
        })}
      </div>

      {/* ── Modal: Venda de Produto ao Cliente ──────────────────────────── */}
      <AnimatePresence>
        {vendaAgendamento && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-black text-zinc-900">Venda de Produto 📦</h3>
                  <p className="text-sm text-zinc-400">Cliente: <b className="text-zinc-700">{vendaAgendamento.cliente_nome}</b></p>
                </div>
                <button onClick={() => setVendaAgendamento(null)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18} /></button>
              </div>

              {/* Busca de produto */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={searchProdutoVenda} onChange={e => setSearchProdutoVenda(e.target.value)}
                  placeholder="Buscar produto..." autoFocus
                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400" />
              </div>

              {/* Grade de produtos */}
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto mb-4">
                {produtosFiltradosVenda.map((p: any) => (
                  <button key={p.id} onClick={() => addProdutoVenda(p)}
                    className="text-left p-3 border-2 border-zinc-100 hover:border-emerald-400 hover:bg-emerald-50 rounded-xl transition-all">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-zinc-900 text-sm leading-tight">{p.name}</span>
                      {produtosComEstoque.includes(p.id) && <span className="text-[9px] text-emerald-600 font-black shrink-0">📦</span>}
                    </div>
                    <p className="font-black text-emerald-700 text-sm mt-1">R$ {Number(p.price).toFixed(2)}</p>
                  </button>
                ))}
              </div>

              {/* Carrinho */}
              {vendaCart.length > 0 && (
                <div className="bg-zinc-50 rounded-2xl p-4 mb-4 space-y-2 border border-zinc-200">
                  <p className="text-xs font-black text-zinc-500 uppercase tracking-wider mb-2">Carrinho</p>
                  {vendaCart.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-zinc-900">{item.produto.name}</p>
                        <p className="text-xs text-zinc-400">R$ {Number(item.produto.price).toFixed(2)} un.</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setVendaCart(prev => prev.map((i, j) => j === idx ? { ...i, qty: Math.max(1, i.qty - 1) } : i))}
                          className="w-6 h-6 bg-zinc-200 hover:bg-zinc-300 rounded-md text-sm font-black flex items-center justify-center">−</button>
                        <span className="w-6 text-center font-black text-sm">{item.qty}</span>
                        <button onClick={() => setVendaCart(prev => prev.map((i, j) => j === idx ? { ...i, qty: i.qty + 1 } : i))}
                          className="w-6 h-6 bg-zinc-200 hover:bg-zinc-300 rounded-md text-sm font-black flex items-center justify-center">+</button>
                      </div>
                      <p className="font-black text-zinc-900 text-sm w-16 text-right">R$ {(item.produto.price * item.qty).toFixed(2)}</p>
                      <button onClick={() => setVendaCart(prev => prev.filter((_, j) => j !== idx))} className="text-zinc-300 hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                  <div className="border-t border-zinc-300 pt-2 flex justify-between">
                    <span className="font-black text-zinc-900">TOTAL</span>
                    <span className="font-black text-emerald-700 text-lg">R$ {totalVenda.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Forma de pagamento */}
              {vendaCart.length > 0 && (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-black text-zinc-500 uppercase tracking-wider">Forma de Pagamento</label>
                    <select value={vendaForma} onChange={e => setVendaForma(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none">
                      {['Dinheiro','Pix','Cartão Débito','Cartão Crédito','Outro'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-black text-zinc-500 uppercase tracking-wider">Observação</label>
                    <input value={vendaObs} onChange={e => setVendaObs(e.target.value)} placeholder="Opcional..."
                      className="w-full mt-1.5 px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none" />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setVendaAgendamento(null)} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-50 transition-colors">Cancelar</button>
                <button onClick={finalizarVendaProduto} disabled={vendaCart.length === 0 || vendaSaving}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black transition-colors">
                  {vendaSaving ? 'Registrando...' : `✅ Finalizar Venda`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Recibo de Venda ─────────────────────────────────────────── */}
      <AnimatePresence>
        {vendaRecibo && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl">
              <div className="text-center mb-5">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl">🎉</div>
                <h3 className="text-xl font-black text-zinc-900">Venda Registrada!</h3>
                {vendaRecibo.cliente && <p className="text-zinc-500 text-sm mt-1">Cliente: <b>{vendaRecibo.cliente}</b></p>}
              </div>
              <div className="bg-zinc-50 rounded-2xl p-4 font-mono text-sm space-y-1 border border-zinc-200 mb-5">
                <p className="text-center font-black mb-2">📦 RECIBO DE VENDA</p>
                {vendaRecibo.items.map((i: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{i.qty}x {i.nome}</span>
                    <span>R$ {(i.qty * i.preco).toFixed(2)}</span>
                  </div>
                ))}
                <hr className="border-dashed border-zinc-300 my-2" />
                <div className="flex justify-between font-black text-base">
                  <span>TOTAL</span><span className="text-emerald-700">R$ {Number(vendaRecibo.total).toFixed(2)}</span>
                </div>
                <p className="text-zinc-400 text-xs">Pagamento: {vendaRecibo.forma}</p>
                <p className="text-zinc-400 text-xs">{vendaRecibo.data} às {vendaRecibo.hora}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setVendaRecibo(null)} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-50 transition-colors">Fechar</button>
                <button onClick={() => imprimirReciboVenda(vendaRecibo)} className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-black flex items-center justify-center gap-2 transition-colors">
                  <Printer size={16} /> Imprimir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal novo / editar agendamento */}
      <AnimatePresence>
        {showNew && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-2xl font-black text-zinc-900 mb-6">Novo Agendamento</h3>
              <div className="space-y-4">
                {/* Cliente */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cliente</label>
                  <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={form.cliente_id}
                    onChange={e => {
                      const c = clientes.find(c => String(c.id) === e.target.value);
                      setForm(prev => ({ ...prev, cliente_id: e.target.value, cliente_nome: c ? c.nome : prev.cliente_nome }));
                    }}>
                    <option value="">Selecionar cliente cadastrado...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <input type="text" placeholder="Ou digitar nome manualmente"
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={form.cliente_nome}
                    onChange={e => setForm(prev => ({ ...prev, cliente_nome: e.target.value, cliente_id: '' }))}
                  />
                </div>

                {/* Serviço */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Serviço</label>
                  <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={form.servico_nome}
                    onChange={e => {
                      const p = services.find(s => s.name === e.target.value);
                      setForm(prev => ({ ...prev, servico_nome: e.target.value, produto_id: p ? p.id : '', valor: p ? p.price : prev.valor }));
                    }}>
                    <option value="">Selecionar serviço...</option>
                    {services.map(s => <option key={s.id} value={s.name}>{s.name} — R$ {s.price.toFixed(2)}</option>)}
                  </select>
                </div>

                {/* Data, Hora, Barbeiro */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data</label>
                    <input type="date" className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={form.data} onChange={e => setForm(prev => ({ ...prev, data: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Hora</label>
                    <select className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={form.hora} onChange={e => setForm(prev => ({ ...prev, hora: e.target.value }))}>
                      {horas.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                    <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Funcionário</label>
                    <select
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={form.funcionario_id}
                      onChange={e => {
                        const f = funcionarios.find(f => String(f.id) === e.target.value);
                        setForm(prev => ({ ...prev, funcionario_id: e.target.value, barbeiro: f ? f.nome : prev.barbeiro }));
                      }}>
                      <option value="">Qualquer</option>
                      {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome} · {f.cargo}</option>)}
                    </select>
                  </div>
                </div>

                {/* Valor */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor (R$)</label>
                  <input type="number" step="0.01"
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={form.valor} onChange={e => setForm(prev => ({ ...prev, valor: parseFloat(e.target.value) || 0 }))} />
                </div>

                {/* Observação */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Observação</label>
                  <textarea rows={2} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm resize-none"
                    value={form.observacao} onChange={e => setForm(prev => ({ ...prev, observacao: e.target.value }))} />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowNew(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={handleSave}>Salvar</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

