import React, { useState } from 'react';
import { motion } from 'motion/react';
import type { Product } from '../../types';
import ClientesTab from './tabs/ClientesTab';
import FidelidadeTab from './tabs/FidelidadeTab';
import AssinaturasTab from './tabs/AssinaturasTab';
import RepasseTab from './tabs/RepasseTab';

// ─────────────────────────────────────────────────────────────────
// TELA DE CLIENTES + FIDELIDADE + ASSINATURAS
// ─────────────────────────────────────────────────────────────────
export default function ClientesBarberScreen({ token, products }: { token: string; products: Product[] }) {
  const [tab, setTab] = useState<'clientes' | 'fidelidade' | 'assinaturas'>('clientes');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-black text-zinc-900">Clientes & Fidelidade</h2>
        <div className="flex bg-white p-1 rounded-xl border border-zinc-200">
          {([
            ['clientes', '👤 Clientes'],
            ['fidelidade', '⭐ Fidelidade'],
            ['assinaturas', '💳 Assinaturas'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'clientes'   && <ClientesTab token={token} />}
      {tab === 'fidelidade' && <FidelidadeTab token={token} />}
      {tab === 'assinaturas' && <AssinaturasTab token={token} />}
    </motion.div>
  );
}


// ─── Aba Clientes ────────────────────────────────────────────────