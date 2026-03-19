import React, { useState, useEffect, useCallback } from 'react';
import {
  TableProperties,
  Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MesaCard from './MesaCard';
import ComandaMesaModal from './ComandaMesaModal';
import type { Product, Category, OrderItem, OrderType, PaymentMethod, Order, DashboardStats, CashReport, Expense, Caixa, Ingrediente, MovimentacaoEstoque } from '../../types';

export default function MesasScreen({ token, taxasPagamento }: { token: string; taxasPagamento?: { debito: number; credito: number; pix: number } }) {
  const [mesas, setMesas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMesa, setSelectedMesa] = useState<any | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [qtdInput, setQtdInput] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  const fetchMesas = useCallback(async () => {
    try {
      const res = await fetch('/api/mesas', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setMesas(Array.isArray(data) ? data : []);
    } catch {
      setMesas([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchMesas(); }, [fetchMesas]);

  const handleAbrirMesa = async (mesa: any) => {
    await fetch(`/api/mesas/${mesa.id}/abrir`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
    fetchMesas();
  };

  const handleFecharMesa = async (mesa: any) => {
    if (!window.confirm(`Fechar Mesa ${mesa.numero}? Os itens não pagos serão descartados.`)) return;
    await fetch(`/api/mesas/${mesa.id}/fechar`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
    fetchMesas();
  };

  const handleConfigurar = async () => {
    const qtd = parseInt(qtdInput);
    if (!qtd || qtd < 1 || qtd > 200) return;
    setConfigLoading(true);
    try {
      await fetch('/api/mesas/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantidade: qtd }),
      });
      setShowConfig(false);
      fetchMesas();
    } catch {
      alert('Erro ao configurar mesas');
    } finally {
      setConfigLoading(false);
    }
  };

  const abertas = mesas.filter(m => m.status === 'aberta').length;
  const fechadas = mesas.filter(m => m.status === 'fechada').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-8 border-b border-zinc-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-zinc-900">Mesas</h1>
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {abertas} aberta{abertas !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {fechadas} livre{fechadas !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={() => { setQtdInput(String(mesas.length)); setShowConfig(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-semibold text-sm transition-all active:scale-95"
          >
            <Settings size={16} />
            Configurar Mesas
          </button>
        </div>
      </div>

      {/* Grid de mesas */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
          </div>
        ) : mesas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <TableProperties size={56} className="mb-4 opacity-20" />
            <p className="font-semibold text-lg">Nenhuma mesa configurada</p>
            <p className="text-sm mt-1">Clique em "Configurar Mesas" para começar</p>
            <button
              onClick={() => { setQtdInput('10'); setShowConfig(true); }}
              className="mt-6 px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all"
            >
              Configurar Agora
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {mesas.map(mesa => (
              <MesaCard
                key={mesa.id}
                mesa={mesa}
                onOpen={() => handleAbrirMesa(mesa)}
                onClose={() => handleFecharMesa(mesa)}
                onClick={() => setSelectedMesa(mesa)}
                token={token}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de Configuração */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-black text-zinc-900 mb-1">Configurar Mesas</h3>
              <p className="text-sm text-zinc-500 mb-6">
                {mesas.length > 0 ? `Atualmente: ${mesas.length} mesa(s)` : 'Defina quantas mesas seu estabelecimento tem.'}
              </p>
              <div className="space-y-2 mb-6">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Quantidade de Mesas</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={qtdInput}
                  onChange={e => setQtdInput(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfig(false)}
                  className="flex-1 px-4 py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl font-semibold text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfigurar}
                  disabled={configLoading}
                  className="flex-1 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                >
                  {configLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Comanda da Mesa */}
      <AnimatePresence>
        {selectedMesa && (
          <ComandaMesaModal
            mesa={selectedMesa}
            token={token}
            taxasPagamento={taxasPagamento}
            onClose={() => { setSelectedMesa(null); fetchMesas(); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── CARD DE MESA ─────────────────────────────────────────────────────────────