import React, { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Button, Input } from '../../../components/ui/Card';

export default function FuncionariosTab({ token }: { token: string }) {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = today.slice(0, 7) + '-01';
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [producao, setProducao] = useState<any[]>([]);
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [inicio, setInicio] = useState(firstDay);
  const [fim, setFim] = useState(today);
  const [selectedFunc, setSelectedFunc] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: '', cargo: 'Barbeiro', telefone: '', percentual_repasse: 50, comissao_produto: 0 });
  const cores = ['zinc', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
  const [formCor, setFormCor] = useState('zinc');

  const corMap: Record<string, string> = {
    zinc: 'bg-zinc-500', red: 'bg-red-500', orange: 'bg-orange-500',
    yellow: 'bg-yellow-500', green: 'bg-green-500', blue: 'bg-blue-500',
    purple: 'bg-purple-500', pink: 'bg-pink-500',
  };

  const fetchFuncionarios = async () => {
    const res = await fetch('/api/barber/funcionarios', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setFuncionarios(await res.json());
  };

  const fetchProducao = async () => {
    const url = `/api/barber/producao?inicio=${inicio}&fim=${fim}${selectedFunc ? '&funcionario_id=' + selectedFunc : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setProducao(data.funcionarios || []);
      setAtendimentos(data.atendimentos || []);
    }
  };

  useEffect(() => { fetchFuncionarios(); }, []);
  useEffect(() => { fetchProducao(); }, [inicio, fim, selectedFunc]);

  const saveFunc = async () => {
    const url = editId ? `/api/barber/funcionarios/${editId}` : '/api/barber/funcionarios';
    const method = editId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, cor: formCor }) });
    setShowForm(false); setEditId(null); setForm({ nome: '', cargo: 'Barbeiro', telefone: '', percentual_repasse: 50, comissao_produto: 0 }); fetchFuncionarios(); fetchProducao();
  };

  const totalProducao = producao.reduce((s: number, f: any) => s + (f.total_produzido || 0), 0);
  const totalRepasse = producao.reduce((s: number, f: any) => s + (f.valor_repasse || 0), 0);

  function getCorClass(cor: string) { return corMap[cor] || 'bg-zinc-500'; }

  return (
    <div>
      {/* Cadastro de funcionários */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-black text-zinc-900">Funcionários</h3>
        <Button onClick={() => { setEditId(null); setForm({ nome: '', cargo: 'Barbeiro', telefone: '', percentual_repasse: 50, comissao_produto: 0 }); setFormCor('zinc'); setShowForm(true); }}>
          <Plus size={16} /> Novo Funcionário
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        {funcionarios.map((f: any) => (
          <div key={f.id} className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-3 min-w-[200px]">
            <div className={['w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm', getCorClass(f.cor)].join(' ')}>{f.nome[0]}</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-zinc-900 text-sm truncate">{f.nome}</p>
              <p className="text-xs text-zinc-500">{f.cargo} · {f.percentual_repasse}% serviços{f.comissao_produto > 0 ? ` · ${f.comissao_produto}% produto` : ''}</p>
            </div>
            <button
              onClick={() => { setEditId(f.id); setForm({ nome: f.nome, cargo: f.cargo, telefone: f.telefone || '', percentual_repasse: f.percentual_repasse, comissao_produto: f.comissao_produto || 0 }); setFormCor(f.cor || 'zinc'); setShowForm(true); }}
              className="p-1.5 text-zinc-300 hover:text-zinc-700"
            ><Pencil size={13} /></button>
          </div>
        ))}
      </div>

      {/* Filtros de produção */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-5 mb-4">
        <p className="text-sm font-black text-zinc-900 mb-3">📊 Produção por Período</p>
        <div className="flex gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">De</label>
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Até</label>
            <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Funcionário</label>
            <select value={selectedFunc} onChange={e => setSelectedFunc(e.target.value)} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none">
              <option value="">Todos</option>
              {funcionarios.map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-2xl font-black text-white">R$ {totalProducao.toFixed(2)}</p>
          <p className="text-xs text-zinc-400 mt-1">Total produzido no período</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-2xl font-black text-amber-900">R$ {totalRepasse.toFixed(2)}</p>
          <p className="text-xs text-amber-600 mt-1">Total a repassar</p>
        </div>
      </div>

      {/* Tabela de produção */}
      <div className="space-y-3">
        {producao.map((f: any) => (
          <div key={f.id} className="bg-white rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className={['w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm', getCorClass(f.cor)].join(' ')}>{f.nome[0]}</div>
              <div className="flex-1">
                <p className="font-black text-zinc-900">{f.nome}</p>
                <p className="text-xs text-zinc-500">{f.cargo} · {f.qtd_atendimentos || 0} atendimentos</p>
              </div>
              <div className="text-right">
                <p className="font-black text-zinc-900">R$ {(f.total_produzido || 0).toFixed(2)}</p>
                <p className="text-xs text-amber-600 font-bold">Repasse ({f.percentual_repasse}%): R$ {(f.valor_repasse || 0).toFixed(2)}</p>
              </div>
            </div>
            {totalProducao > 0 && (
              <div className="mt-3 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-900 rounded-full transition-all"
                  style={{ width: ((f.total_produzido || 0) / totalProducao * 100).toFixed(0) + '%' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detalhe de atendimentos ao filtrar 1 funcionário */}
      {selectedFunc && atendimentos.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-black text-zinc-900 mb-3">Atendimentos do período</p>
          <div className="space-y-2">
            {atendimentos.map((a: any) => (
              <div key={a.id} className="bg-white rounded-xl border border-zinc-200 p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-zinc-900">{a.cliente_nome}</p>
                  <p className="text-xs text-zinc-500">{a.servico_nome} · {a.data} às {a.hora}</p>
                </div>
                <span className="font-black text-zinc-900">R$ {(a.valor || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal form funcionário */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <h3 className="text-2xl font-black text-zinc-900 mb-6">{editId ? 'Editar' : 'Novo'} Funcionário</h3>
              <div className="space-y-4">
                {[['nome', 'Nome completo *', 'text', 'Ex: Carlos'], ['cargo', 'Cargo', 'text', 'Barbeiro / Cabeleireiro...'], ['telefone', 'Telefone', 'text', '(00) 90000-0000']].map(([field, label, type, placeholder]) => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>
                    <input type={type} placeholder={placeholder} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                      value={(form as any)[field]} onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">% Repasse (Serviços)</label>
                  <input type="number" min="0" max="100" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={form.percentual_repasse} onChange={e => setForm(prev => ({ ...prev, percentual_repasse: parseFloat(e.target.value) || 50 }))} />
                  <p className="text-xs text-zinc-400">Ex: 50 = recebe 50% do valor de cada atendimento</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">% Comissão (Produtos Físicos)</label>
                  <input type="number" min="0" max="100" step="0.5" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={form.comissao_produto} onChange={e => setForm(prev => ({ ...prev, comissao_produto: parseFloat(e.target.value) || 0 }))} />
                  <p className="text-xs text-zinc-400">Ex: 10 = recebe 10% sobre cada produto físico vendido</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cor</label>
                  <div className="flex gap-2">
                    {cores.map(c => (
                      <button key={c} onClick={() => setFormCor(c)} type="button"
                        className={['w-7 h-7 rounded-full transition-all', corMap[c], formCor === c ? 'ring-2 ring-offset-2 ring-zinc-900 scale-110' : ''].join(' ')} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={saveFunc}>Salvar</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Aba Repasse (usada dentro do FinanceScreen) ─────────────────