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
    <div className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="my-auto flex w-full max-w-md min-h-0 flex-col overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl max-h-[min(92dvh,100svh)] sm:max-h-[min(90dvh,640px)] sm:rounded-3xl sm:p-8 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <h3 className="mb-4 text-xl font-bold text-zinc-900 sm:mb-6 sm:text-2xl">Abrir Caixa</h3>
        <form onSubmit={handleOpen} className="min-h-0 space-y-4">
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

