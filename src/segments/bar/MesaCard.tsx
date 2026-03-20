import React from 'react';
import {
  Plus,
  Clock,
  X,
  Printer,
} from 'lucide-react';
import type { Product, Category, OrderItem, OrderType, PaymentMethod, Order, DashboardStats, CashReport, Expense, Caixa, Ingrediente, MovimentacaoEstoque } from '../../types';
import { openPrintPreview } from '../../utils/print';

// ── Função utilitária de cupom HTML padrão 80mm ───────────────────────────────
function gerarCupomHtml(opts: {
  titulo: string; estabelecimento?: string; orderNumber: string; data: string;
  itens: { qtd: number; nome: string; valor?: number }[];
  totais?: { label: string; valor: number; destaque?: boolean }[];
  pagamentos?: { metodo: string; valor: number; troco?: number }[];
  rodape?: string;
}): string {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const H = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const itensHtml = opts.itens.map(it => `
    <div class="item-row">
      <span class="item-nome">${it.qtd}x ${H(it.nome)}</span>
      ${it.valor !== undefined ? `<span class="item-val">${fmt(it.valor)}</span>` : ''}
    </div>`).join('');
  const totaisHtml = (opts.totais||[]).map(t =>
    `<div class="row${t.destaque?' destaque':''}"><span>${H(t.label)}</span><span>${fmt(t.valor)}</span></div>`
  ).join('');
  const pagHtml = (opts.pagamentos||[]).map(p => `
    <div class="row"><span>${H(p.metodo)}</span><span>${fmt(p.valor)}</span></div>
    ${p.troco && p.troco > 0 ? `
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:6px;padding:5px 7px;margin:3px 0">
      <div style="color:#c2410c;font-weight:bold">💰 LEVAR TROCO</div>
      <div class="row destaque"><span>Troco a dar:</span><span>${fmt(p.troco)}</span></div>
    </div>` : ''}
  `).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${H(opts.titulo)}</title>
<style>
  @page{margin:3mm;size:80mm auto;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.5;width:72mm;padding:2mm;color:#000;}
  .center{text-align:center;} .bold{font-weight:bold;}
  .sep{border-top:1px dashed #000;margin:4px 0;} .sep2{border-top:1px dotted #999;margin:3px 0;}
  .row{display:flex;justify-content:space-between;padding:1px 0;}
  .destaque{font-size:14px;font-weight:bold;margin-top:2px;}
  .titulo{font-size:15px;font-weight:bold;}
  .item-row{display:flex;justify-content:space-between;}
  .item-nome{flex:1;word-break:break-word;padding-right:4px;}
  .item-val{white-space:nowrap;}
  .secao{font-weight:bold;font-size:11px;color:#555;letter-spacing:.5px;margin-top:4px;}
  .rodape{text-align:center;font-size:10px;color:#777;margin-top:4px;}
</style></head><body>
<div class="center">
  ${opts.estabelecimento ? `<div style="font-size:13px;font-weight:bold">${H(opts.estabelecimento.toUpperCase())}</div>` : ''}
  <div class="titulo">${H(opts.titulo)}</div>
  <div style="font-size:11px;color:#555">#${H(opts.orderNumber)} &nbsp;|&nbsp; ${H(opts.data)}</div>
</div>
<div class="sep"></div>
<div class="secao">ITENS</div>
${itensHtml}
${opts.totais?.length ? `<div class="sep"></div>${totaisHtml}` : ''}
${opts.pagamentos?.length ? `<div class="sep"></div><div class="secao">PAGAMENTO</div>${pagHtml}` : ''}
<div class="sep"></div>
<div class="rodape">${opts.rodape ? H(opts.rodape) : 'Obrigado pela preferência!'}</div>
<div class="rodape">FlowPDV &bull; ${H(opts.data)}</div>
</body></html>`;
}

export default function MesaCard({
  mesa,
  onOpen,
  onClose,
  onClick,
  token,
}: {

  key?: React.key;
  mesa: any
  onOpen: () => void;
  onClose: () => void;
  onClick: () => void;
  token: string;
}) {

   const isOpen = mesa.status === 'aberta';
   const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = window.open('', '_blank', 'width=420,height=620,toolbar=0,menubar=0,location=0,status=0,scrollbars=1,resizable=1');
    if (!win) { alert('Popup bloqueado! Permita popups para este site.'); return; }
    try {
      const res = await fetch(`/api/mesas/${mesa.id}/comanda`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.comanda || !data.itens || data.itens.length === 0) {
        win.close(); alert('Mesa vazia — sem itens para imprimir.'); return;
      }
      const total = data.itens.reduce((a: number, i: any) => a + i.quantity * i.price_at_time, 0);
      const abertura = data.comanda.created_at
        ? new Date(data.comanda.created_at + (data.comanda.created_at.includes('Z') ? '' : '-03:00'))
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
        : '--:--';
      const agora = new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' });
      const html = gerarCupomHtml({
        titulo: `MESA ${mesa.numero}`,
        orderNumber: `Aberta: ${abertura}`,
        data: agora,
        itens: data.itens.map((it: any) => ({ qtd: it.quantity, nome: it.product_name, valor: it.quantity * it.price_at_time })),
        totais: [{ label: 'TOTAL', valor: total, destaque: true }],
      });
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    } catch { win.close(); alert('Erro ao buscar dados da comanda.'); }
  };

  return (
    <div
      className={`relative rounded-2xl border-2 overflow-hidden transition-all group ${
        isOpen
          ? 'border-emerald-200 bg-white shadow-md shadow-emerald-50'
          : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      {/* Status badge */}
      <div
        className={`absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-500'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
        {isOpen ? 'ABERTA' : 'LIVRE'}
      </div>

      {/* Número da mesa — clicável para abrir comanda */}
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
                  <span className="font-black text-emerald-700">R$ {Number(mesa.total_valor).toFixed(2)}</span>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-zinc-400 text-center">Vazia</p>
            )}
            {mesa.opened_at && (
              <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400">
                <Clock size={9} />
                {new Date(mesa.opened_at + (mesa.opened_at.includes('Z') ? '' : '-03:00')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </div>
            )}
          </div>
        )}
      </button>

      {/* Actions */}
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
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-bold text-red-600 transition-all"
            >
              <X size={13} />
              Fechar
            </button>
          </>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
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

// ─── MODAL DE COMANDA DA MESA ─────────────────────────────────────────────────
