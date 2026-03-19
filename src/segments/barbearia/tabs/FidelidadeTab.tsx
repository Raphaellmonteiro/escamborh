import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Star,
  Gift,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { FidelidadeRegra, FidelidadeCartao, BarberCliente } from '../../../types';
import { Card, Button } from '../../../components/ui/Card';

export default function FidelidadeTab({ token }: { token: string }) {
  const [regras, setRegras] = useState<FidelidadeRegra[]>([]);
  const [clientes, setClientes] = useState<BarberCliente[]>([]);
  const [showRegra, setShowRegra] = useState(false);
  const [showUso, setShowUso] = useState(false);
  const [editRegra, setEditRegra] = useState<FidelidadeRegra | null>(null);
  const [regraForm, setRegraForm] = useState({ nome: '', meta: 10, descricao: '' });
  const [usoForm, setUsoForm] = useState({ cliente_id: '', regra_id: '', servico_nome: '' });
  const [usoResult, setUsoResult] = useState<{ ganhou: boolean; contagem: number; meta: number } | null>(null);

  const fetchRegras = async () => {
    const res = await fetch('/api/barber/fidelidade/regras', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRegras(await res.json());
  };

  useEffect(() => {
    fetchRegras();
    fetch('/api/barber/clientes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setClientes).catch(() => {});
  }, []);

  const saveRegra = async () => {
    const url = editRegra ? `/api/barber/fidelidade/regras/${editRegra.id}` : '/api/barber/fidelidade/regras';
    const method = editRegra ? 'PUT' : 'POST';
    await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(regraForm)
    });
    setShowRegra(false); setEditRegra(null); fetchRegras();
  };

  const deleteRegra = async (id: number) => {
    if (!confirm('Excluir esta regra?')) return;
    await fetch(`/api/barber/fidelidade/regras/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchRegras();
  };

  const registrarUso = async () => {
    const res = await fetch('/api/barber/fidelidade/uso', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(usoForm)
    });
    if (res.ok) {
      const data = await res.json();
      setUsoResult(data);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-zinc-500 text-sm">Configure as regras de fidelidade e registre usos para seus clientes.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowUso(true)}><Gift size={16} /> Registrar Uso</Button>
          <Button onClick={() => { setEditRegra(null); setRegraForm({ nome: '', meta: 10, descricao: '' }); setShowRegra(true); }}><Plus size={16} /> Nova Regra</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {regras.length === 0 && (
          <div className="col-span-full text-center py-16 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
            <Star size={40} className="mx-auto text-zinc-300 mb-3" />
            <p className="text-zinc-400">Nenhuma regra configurada</p>
            <p className="text-zinc-300 text-sm">Crie uma regra como: "10 cortes → 1 grátis"</p>
          </div>
        )}
        {regras.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-zinc-200 p-6">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-black text-zinc-900 text-lg">{r.nome}</p>
                {r.descricao && <p className="text-sm text-zinc-500 mt-0.5">{r.descricao}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditRegra(r); setRegraForm({ nome: r.nome, meta: r.meta, descricao: r.descricao || '' }); setShowRegra(true); }}
                  className="p-1.5 text-zinc-300 hover:text-zinc-700"><Pencil size={14} /></button>
                <button onClick={() => deleteRegra(r.id)} className="p-1.5 text-zinc-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="bg-zinc-50 rounded-xl p-4 text-center">
              <p className="text-4xl font-black text-zinc-900">{r.meta}</p>
              <p className="text-zinc-500 text-sm">atendimentos para ganhar 1 grátis</p>
            </div>
            <div className="flex gap-1 mt-3">
              {Array.from({ length: Math.min(r.meta, 12) }).map((_, i) => (
                <div key={i} className="h-2 flex-1 rounded-full bg-zinc-200" />
              ))}
              {r.meta > 12 && <span className="text-zinc-400 text-[10px] self-end">+{r.meta - 12}</span>}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 text-right">🎁 = 1 grátis a cada {r.meta} atendimentos</p>
          </div>
        ))}
      </div>

      {/* Modal: nova / editar regra */}
      <AnimatePresence>
        {showRegra && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <h3 className="text-2xl font-black text-zinc-900 mb-6">{editRegra ? 'Editar Regra' : 'Nova Regra'}</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome da regra</label>
                  <input type="text" placeholder="Ex: Corte de Cabelo" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={regraForm.nome} onChange={e => setRegraForm(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Meta (quantos até ganhar 1 grátis)</label>
                  <input type="number" min="2" max="50" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={regraForm.meta} onChange={e => setRegraForm(p => ({ ...p, meta: parseInt(e.target.value) || 10 }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Descrição (opcional)</label>
                  <input type="text" placeholder="Ex: Válido para qualquer corte" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                    value={regraForm.descricao} onChange={e => setRegraForm(p => ({ ...p, descricao: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowRegra(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={saveRegra}>Salvar</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: registrar uso */}
      <AnimatePresence>
        {showUso && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              {usoResult ? (
                <div className="text-center py-4">
                  <div className={`text-6xl mb-4 ${usoResult.ganhou ? 'animate-bounce' : ''}`}>{usoResult.ganhou ? '🎉' : '⭐'}</div>
                  <h3 className="text-2xl font-black text-zinc-900 mb-2">{usoResult.ganhou ? 'PARABÉNS! Grátis!' : 'Registrado!'}</h3>
                  <p className="text-zinc-500">{usoResult.ganhou ? 'O cliente ganhou um serviço grátis!' : `Progresso: ${usoResult.contagem} / ${usoResult.meta}`}</p>
                  <div className="flex gap-1 mt-4 mb-6">
                    {Array.from({ length: usoResult.meta }).map((_, i) => (
                      <div key={i} className={`h-3 flex-1 rounded-sm ${i < usoResult.contagem ? 'bg-zinc-900' : 'bg-zinc-100'}`} />
                    ))}
                  </div>
                  <Button className="w-full" onClick={() => { setUsoResult(null); setShowUso(false); }}>Fechar</Button>
                </div>
              ) : (
                <>
                  <h3 className="text-2xl font-black text-zinc-900 mb-6">Registrar Uso de Fidelidade</h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cliente</label>
                      <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                        value={usoForm.cliente_id} onChange={e => setUsoForm(p => ({ ...p, cliente_id: e.target.value }))}>
                        <option value="">Selecione o cliente...</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Regra de fidelidade</label>
                      <select className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                        value={usoForm.regra_id} onChange={e => setUsoForm(p => ({ ...p, regra_id: e.target.value }))}>
                        <option value="">Selecione a regra...</option>
                        {regras.map(r => <option key={r.id} value={r.id}>{r.nome} (meta: {r.meta})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Serviço realizado</label>
                      <input type="text" placeholder="Ex: Corte degradê"
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none text-sm"
                        value={usoForm.servico_nome} onChange={e => setUsoForm(p => ({ ...p, servico_nome: e.target.value }))} />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setShowUso(false)}>Cancelar</Button>
                      <Button className="flex-1" onClick={registrarUso} disabled={!usoForm.cliente_id || !usoForm.regra_id}>Registrar</Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── Aba Assinaturas ─────────────────────────────────────────────