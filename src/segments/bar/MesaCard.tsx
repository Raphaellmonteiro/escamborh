import React, { memo } from 'react';
import {
  Plus,
  Clock,
  X,
  Printer,
} from 'lucide-react';
import { openPrintPreviewFromUrl } from '../../utils/print';

function MesaCard({
  mesa,
  onOpen,
  onClose,
  onClick,
  token,
}: {
  key?: React.Key;
  mesa: any;
  onOpen: (m: any) => void;
  onClose: (m: any) => void;
  onClick: (m: any) => void;
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
      className={`relative rounded-xl border overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg group ${
        isOpen
          ? 'border-l-4 border-l-red-400 bg-red-50/50 hover:bg-red-50/80'
          : 'border-l-4 border-l-emerald-400 bg-emerald-50/50 hover:bg-emerald-50/80'
      }`}
    >
      <div
        className={`absolute top-2 right-2 flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
          isOpen ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        <span className={`w-1 h-1 rounded-full shrink-0 ${isOpen ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
        {isOpen ? 'Ocupada' : 'Livre'}
      </div>

      <button
        onClick={() => onClick(mesa)}
        disabled={!isOpen}
        className={`w-full pt-5 pb-2 px-3 flex flex-col items-center transition-all active:scale-[0.98] ${
          isOpen ? 'hover:bg-red-100/50 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="text-2xl font-black text-zinc-900 leading-none">{mesa.numero}</span>
        <span className="text-[10px] font-bold text-zinc-500 mt-0.5 uppercase tracking-wider">Mesa</span>

        {isOpen && (
          <div className="mt-2 w-full space-y-0.5">
            {mesa.total_itens > 0 ? (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">{mesa.total_itens} item(s)</span>
                  <span className={`font-black ${hasExtras ? 'text-zinc-600' : 'text-zinc-900'}`}>R$ {subtotal.toFixed(2)}</span>
                </div>
                {valorTaxa > 0 && (
                  <div className="flex items-center justify-between text-[9px] text-zinc-400">
                    <span>Taxa</span>
                    <span>R$ {valorTaxa.toFixed(2)}</span>
                  </div>
                )}
                {valorCouvert > 0 && (
                  <div className="flex items-center justify-between text-[9px] text-zinc-400">
                    <span>Couvert</span>
                    <span>R$ {valorCouvert.toFixed(2)}</span>
                  </div>
                )}
                {hasExtras && (
                  <div className="flex items-center justify-between text-[11px] pt-0.5 border-t border-zinc-200">
                    <span className="font-semibold text-zinc-500">Total</span>
                    <span className="font-black text-zinc-900">R$ {Number(mesa.total_valor).toFixed(2)}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-zinc-400 text-center">Vazia</p>
            )}

            {mesa.opened_at && (
              <div className="flex items-center justify-center gap-0.5 text-[9px] text-zinc-500 mt-0.5">
                <Clock size={8} />
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

      <div className={`px-2 pb-2 flex gap-1.5 ${!isOpen ? 'pt-2' : ''}`}>
        {isOpen ? (
          <>
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-0.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 transition-all"
            >
              <Printer size={11} />
              Imprimir
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(mesa);
              }}
              className="flex-1 flex items-center justify-center gap-0.5 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg text-[10px] font-bold text-red-600 transition-all"
            >
              <X size={11} />
              Fechar
            </button>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen(mesa);
            }}
            className="w-full flex items-center justify-center gap-0.5 py-1.5 bg-zinc-900 hover:bg-zinc-700 text-white rounded-lg text-[10px] font-bold transition-all active:scale-95"
          >
            <Plus size={11} />
            Abrir Mesa
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(MesaCard);
