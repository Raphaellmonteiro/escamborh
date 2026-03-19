import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, Button, Input } from "../../components/ui/Card";

export default function CloseCaixaModal({ onClose, onSuccess, token }: { onClose: () => void, onSuccess: () => void, token: string }) {
  const [contado, setContado] = useState<number>(0);
  const [obs, setObs] = useState('');
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      const res = await fetch('/api/caixa/hoje', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const caixa = await res.json();
      
      const salesRes = await fetch('/api/dashboard/cash-report', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sales = await salesRes.json();
      
      setSummary({
        fundo: caixa.fundo_inicial,
        vendasDinheiro: sales.cash,
        esperado: caixa.fundo_inicial + sales.cash
      });
    };
    fetchSummary();
  }, [token]);

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/caixa/fechar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ valor_contado: contado, observacao: obs })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Erro ao fechar caixa");
    }
  };

  if (!summary) return null;

  const diferenca = contado - summary.esperado;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
        <h3 className="text-2xl font-bold text-zinc-900 mb-6">Fechar Caixa</h3>
        
        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Fundo Inicial:</span>
            <span className="font-bold">R$ {summary.fundo.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Vendas em Dinheiro:</span>
            <span className="font-bold">R$ {summary.vendasDinheiro.toFixed(2)}</span>
          </div>
          <div className="pt-2 border-t border-zinc-200 flex justify-between">
            <span className="font-bold text-zinc-900">Total Esperado:</span>
            <span className="font-black text-zinc-900">R$ {summary.esperado.toFixed(2)}</span>
          </div>
        </div>

        <form onSubmit={handleClose} className="space-y-4">
          <Input 
            label="Valor Contado Fisicamente (R$)" 
            type="number" 
            step="0.01" 
            value={contado || ''} 
            onChange={(e: any) => setContado(parseFloat(e.target.value))} 
            required 
            autoFocus
          />

          <div className={`p-3 rounded-xl border flex items-center gap-3 ${
            diferenca === 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
            diferenca > 0 ? 'bg-blue-50 border-blue-100 text-blue-700' :
            'bg-red-50 border-red-100 text-red-700'
          }`}>
            <div className="font-bold text-sm">
              {diferenca === 0 ? '✅ Caixa correto' : 
               diferenca > 0 ? `⬆️ Sobra de R$ ${diferenca.toFixed(2)}` : 
               `⬇️ Falta de R$ ${Math.abs(diferenca).toFixed(2)}`}
            </div>
          </div>

          <Input 
            label="Observação (Opcional)" 
            value={obs} 
            onChange={(e: any) => setObs(e.target.value)} 
          />
          
          <div className="flex gap-3 pt-4">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1">Confirmar Fechamento</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// --- TELA DE PRODUTOS ---

