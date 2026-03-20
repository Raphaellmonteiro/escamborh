import React from 'react';
import {
  Plus,
  Clock,
  X,
  Printer,
} from 'lucide-react';
import { openPrintPreviewFromUrl } from '../../utils/print';

export default function MesaCard({
  mesa,
  onOpen,
  onClose,
  onClick,
  token,
}: {
  key?: React.Key;
  mesa: any;
  onOpen: () => void;
  onClose: () => void;
  onClick: () => void;
  token: string;
}) {
  const isOpen = mesa.status === 'aberta';
  const subtotal = Number(mesa.subtotal_valor ?? mesa.total_valor ?? 0);
  const valorTaxa = Number(mesa.valor_taxa_servico || 0);
  const valorCouvert = Number(mesa.valor_couvert || 0);
  const hasExtras = valorTaxa > 0 || valorCouvert > 0;

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const win = await openPrintPreviewFromUrl(`/api/mesas/${mesa.id}/comanda-html`, token);

      if (!win) {
        alert('Permita popups para imprimir.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('(404)')) {
        alert('Mesa vazia - sem itens para imprimir.');
        return;
      }

      alert('Erro ao gerar impressao da comanda.');
    }
  };

  return (
    <div
      className={`relative rounded-2xl border-2 overflow-hidden transition-all group ${
        isOpen
          ? 'border-emerald-200 bg-white shadow-md shadow-emerald-50'
          : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <div
        className={`absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-500'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
        {isOpen ? 'ABERTA' : 'LIVRE'}
      </div>

      <button
        onClick={onClick}
        disabled={!isOpen}
        className={`w-full pt-7 pb-4 px-4 flex flex-col items-center transition-all ${
          isOpen ? 'hover:bg-emerald-50 active:scale-95 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="text-4xl font-black text-zinc-900 leading-none">{mesa.numero}</span>
        <span className="text-[11px] font-semibold text-zinc-400 mt-1 uppercase tracking-wider">Mesa</span>

        {isOpen && (
          <div className="mt-3 w-full space-y-1">
            {mesa.total_itens > 0 ? (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{mesa.total_itens} item(s)</span>
                  <span className={`font-black ${hasExtras ? 'text-zinc-500' : 'text-emerald-700'}`}>R$ {subtotal.toFixed(2)}</span>
                </div>
                {valorTaxa > 0 && (
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Taxa</span>
                    <span>R$ {valorTaxa.toFixed(2)}</span>
                  </div>
                )}
                {valorCouvert > 0 && (
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Couvert</span>
                    <span>R$ {valorCouvert.toFixed(2)}</span>
                  </div>
                )}
                {hasExtras && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-100">
                    <span className="font-semibold text-zinc-500">Total</span>
                    <span className="font-black text-emerald-700">R$ {Number(mesa.total_valor).toFixed(2)}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[11px] text-zinc-400 text-center">Vazia</p>
            )}

            {mesa.opened_at && (
              <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400">
                <Clock size={9} />
                {new Date(
                  mesa.opened_at + (mesa.opened_at.includes('Z') ? '' : '-03:00')
                ).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Sao_Paulo',
                })}
              </div>
            )}
          </div>
        )}
      </button>

      <div className={`px-3 pb-3 flex gap-2 ${!isOpen ? 'pt-3' : ''}`}>
        {isOpen ? (
          <>
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-600 transition-all"
            >
              <Printer size={13} />
              Imprimir
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-bold text-red-600 transition-all"
            >
              <X size={13} />
              Fechar
            </button>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="w-full flex items-center justify-center gap-1 py-2 bg-zinc-900 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            <Plus size={13} />
            Abrir Mesa
          </button>
        )}
      </div>
    </div>
  );
}
