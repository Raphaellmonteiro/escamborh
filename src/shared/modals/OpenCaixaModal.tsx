import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Card, Button, Input } from "../../components/ui/Card";

export default function OpenCaixaModal({ onClose, onSuccess, token }: { onClose: () => void, onSuccess: () => void, token: string }) {
  const [fundo, setFundo] = useState<number>(0);
  const [obs, setObs] = useState('');

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/caixa/abrir', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fundo_inicial: fundo, observacao: obs })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Erro ao abrir caixa");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
        <h3 className="text-2xl font-bold text-zinc-900 mb-6">Abrir Caixa</h3>
        <form onSubmit={handleOpen} className="space-y-4">
          <Input 
            label="Fundo de Caixa Inicial (R$)" 
            type="number" 
            step="0.01" 
            value={fundo || ''} 
            onChange={(e: any) => setFundo(parseFloat(e.target.value))} 
            required 
            autoFocus
          />
          <Input 
            label="Observação (Opcional)" 
            value={obs} 
            onChange={(e: any) => setObs(e.target.value)} 
          />
          <div className="flex gap-3 pt-4">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1">Confirmar Abertura</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

