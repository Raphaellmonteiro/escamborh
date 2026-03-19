import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Search,
  Pencil,
  Users2,
  Phone,
  Crown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { BarberCliente, FidelidadeCartao } from '../types';
import { Card, Button } from '../../../components/ui/Card';

export default function ClientesTab({ token }: { token: string }) {
  const [clientes, setClientes] = useState<BarberCliente[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', observacoes: '' });
  const [editId, setEditId] = useState<number | null>(null);

  const fetchClientes = async (q = '') => {
    const url = q ? `/api/barber/clientes?q=${encodeURIComponent(q)}` : '/api/barber/clientes';
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setClientes(await res.json());
  };

  useEffect(() => { fetchClientes(); }, []);

  const fetchDetalhes = async (id: number) => {
    const res = await fetch(`/api/barber/clientes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setSelected(await res.json());
  };

  const handleSave = async () => {
    const url = editId ? `/api/barber/clientes/${editId}` : '/api/barber/clientes';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      setShowForm(false); setEditId(null);
      setForm({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', observacoes: '' });
      fetchClientes(search);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este cliente? Seus agendamentos serão mantidos.')) return;
    await fetch(`/api/barber/clientes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchClientes(search);
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="flex gap-6">
      {/* Lista */}
      <div className="flex-1">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" placeholder="Buscar por nome, CPF ou telefone..."
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none"
              value={search} onChange={e => { setSearch(e.target.value); fetchClientes(e.target.value); }} />
          </div>
          <Button onClick={() => { setEditId(null); setForm({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', observacoes: '' }); setShowForm(true); }}>
            <Plus size={16} /> Novo
          </Button>
        </div>

        <div className="space-y-2">
          {clientes.length === 0 && (
            <div className="text-center py-16 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
              <Users2 size={40} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-zinc-400">Nenhum cliente cadastrado</p>
            </div>
          )}
          {clientes.map(c => (
            <div key={c.id} onClick={() => fetchDetalhes(c.id)}
              className={`bg-white rounded-2xl border p-4 flex items-center justify-between cursor-pointer transition-all hover:shadow-md ${selected?.id === c.id ? 'border-zinc-900 ring-1 ring-zinc-900' : 'border-zinc-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-lg font-black text-zinc-700">
                  {c.nome[0]}
                </div>
                <div>
                  <p className="font-bold text-zinc-900">{c.nome}</p>
                  <p className="text-xs text-zinc-400">{c.cpf || c.telefone || 'Sem dados adicionais'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.tem_assinatura ? (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full flex items-center gap-1">
                    <Crown size={9} /> {c.plano_nome}
                  </span>
                ) : null}
                <button onClick={e => { e.stopPropagation(); setEditId(c.id); setForm({ nome: c.nome, cpf: c.cpf||'', telefone: c.telefone||'', email: c.email||'', data_nascimento: c.data_nascimento||'', observacoes: c.observacoes||'' }); setShowForm(true); }}
                  className="p-1.5 text-zinc-300 hover:text-zinc-700 transition-colors"><Pencil size={14} /></button>
                <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                  className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Painel de detalhes */}
{selected && (
  <div className="w-80 shrink-0">
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 sticky top-6 space-y-4">

      {/* Avatar + nome + telefone */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center text-white text-xl font-black">
          {selected.nome[0]}
        </div>
        <div>
          <p className="font-black text-zinc-900">{selected.nome}</p>
          {selected.telefone && (
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <Phone size={10} /> {selected.telefone}
            </p>
          )}
        </div>
      </div>
      {selected.cpf && <p className="text-xs text-zinc-500">CPF: {selected.cpf}</p>}

      {/* KPI: Total de cortes concluídos */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 flex items-center gap-3">
        <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white text-lg">✂️</div>
        <div>
          <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Total de cortes</p>
          <p className="text-2xl font-black text-zinc-900">{selected.historico?.length || 0}</p>
        </div>
      </div>

      {/* Plano / Assinatura ativa */}
      {selected.assinatura ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-1">
            <Crown size={11} /> Assinatura Ativa
          </p>
          <p className="text-base font-black text-amber-900 mt-1">{selected.assinatura.plano_nome}</p>
          <div className="flex justify-between mt-1">
            <p className="text-xs text-amber-600">Vence em</p>
            <p className="text-xs font-black text-amber-800">
              {new Date(selected.assinatura.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>
          {(() => {
            const dias = Math.ceil(
              (new Date(selected.assinatura.data_vencimento).getTime() - Date.now()) / 86400000
            );
            return dias <= 7 ? (
              <p className={`text-[10px] font-bold mt-1 ${dias <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                {dias <= 0 ? '⚠️ Plano vencido!' : `⏳ Vence em ${dias} dia(s)`}
              </p>
            ) : null;
          })()}
        </div>
      ) : (
        <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-zinc-400">Sem assinatura ativa</p>
        </div>
      )}

      {/* Cartões de fidelidade com barra de progresso */}
      {selected.cartoes?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">⭐ Fidelidade</p>
          {selected.cartoes.map((c: FidelidadeCartao) => {
            const pct = Math.min(100, Math.round((c.contagem / c.meta) * 100));
            return (
              <div key={c.id} className="mb-3 bg-zinc-50 rounded-xl p-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-zinc-700">{c.regra_nome}</span>
                  <span className="font-black text-zinc-900">{c.contagem}/{c.meta}</span>
                </div>
                <div className="h-3 bg-zinc-200 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-zinc-900'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <p className="text-[10px] text-zinc-400">
                    {c.meta - c.contagem > 0 ? `Faltam ${c.meta - c.contagem} para o grátis` : '🎁 Grátis disponível!'}
                  </p>
                  {c.total_ganhos > 0 && (
                    <p className="text-[10px] text-green-600 font-bold">🎁 {c.total_ganhos} ganho(s)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico de atendimentos com barbeiro */}
      <div>
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
          Últimos atendimentos ({selected.historico?.length || 0})
        </p>
        {(!selected.historico || selected.historico.length === 0) ? (
          <p className="text-xs text-zinc-400">Nenhum atendimento ainda</p>
        ) : selected.historico.slice(0, 5).map((h: any) => (
          <div key={h.id}
            className="flex justify-between items-center py-1.5 border-b border-zinc-100 last:border-0">
            <div>
              <p className="text-xs font-medium text-zinc-800">{h.servico_nome}</p>
              <p className="text-[10px] text-zinc-400">
                {new Date(h.data + 'T12:00:00').toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-zinc-900">R$ {h.valor?.toFixed(2) || '0,00'}</span>
              {h.barbeiro && <p className="text-[9px] text-zinc-400">✂️ {h.barbeiro}</p>}
            </div>
          </div>
        ))}
      </div>

    </div>
  </div>
)}

      {/* Modal form cliente */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-2xl font-black text-zinc-900 mb-6">{editId ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <div className="space-y-4">
                {[
                  ['nome', 'Nome completo *', 'text', 'Ex: João Silva'],
                  ['cpf', 'CPF', 'text', '000.000.000-00'],
                  ['telefone', 'Telefone / WhatsApp', 'text', '(00) 90000-0000'],
                  ['email', 'E-mail', 'email', 'joao@email.com'],
                  ['data_nascimento', 'Data de nascimento', 'date', ''],
                ].map(([field, label, type, placeholder]) => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>
                    <input type={type} placeholder={placeholder}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={(form as any)[field]}
                      onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Observações</label>
                  <textarea rows={2} placeholder="Preferências, alergias, observações..."
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm resize-none"
                    value={form.observacoes} onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={handleSave}>Salvar</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── Aba Fidelidade ──────────────────────────────────────────────
