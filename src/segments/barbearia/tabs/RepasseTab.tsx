import React, { useState, useEffect } from 'react';
import {
  Check,
  Printer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Button } from '../../../components/ui/Card';

export default function RepasseTab({ token }: { token: string }) {
  const today      = new Date().toISOString().split('T')[0];
  const firstDay   = today.slice(0, 7) + '-01';
  const [inicio, setInicio]     = useState(firstDay);
  const [fim, setFim]           = useState(today);
  const [producao, setProducao] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [paying, setPaying]     = useState<any | null>(null);   // funcionário sendo pago
  const [formaPagto, setFormaPagto] = useState('Dinheiro');
  const [obsPayment, setObsPayment] = useState('');
  const [receipt, setReceipt]   = useState<any | null>(null);   // recibo aberto
  const corMap: Record<string, string> = {
    zinc:'bg-zinc-500', red:'bg-red-500', orange:'bg-orange-500',
    yellow:'bg-yellow-500', green:'bg-green-500', blue:'bg-blue-500',
    purple:'bg-purple-500', pink:'bg-pink-500',
  };

  const fetchProducao = async () => {
    setLoading(true);
    const res = await fetch(`/api/barber/producao?inicio=${inicio}&fim=${fim}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); setProducao(d.funcionarios || []); }
    setLoading(false);
  };
  const fetchHistorico = async () => {
    const res = await fetch('/api/barber/pagamentos-funcionario', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setHistorico(await res.json());
  };
  useEffect(() => { fetchProducao(); fetchHistorico(); }, [inicio, fim]);

  const producaoComRepasse = producao.filter((f: any) => (f.valor_repasse_total ?? f.valor_repasse ?? 0) > 0);
  const producaoPendente = producaoComRepasse.filter((f: any) => (f.valor_repasse_pendente ?? 0) > 0.009);
  const totalRepasse = producaoPendente.reduce((s: number, f: any) => s + (f.valor_repasse_pendente ?? 0), 0);
  const totalProd    = producao.reduce((s: number, f: any) => s + (f.total_produzido || 0), 0);

  // Confirmar pagamento ao funcionário
  const confirmarPagamento = async () => {
    if (!paying) return;
    const body = {
      funcionario_id:    paying.id,
      periodo_inicio:    inicio,
      periodo_fim:       fim,
      qtd_atendimentos:  paying.qtd_atendimentos,
      total_produzido:   paying.total_produzido,
      percentual_repasse: paying.percentual_repasse,
      valor_repasse:     paying.valor_repasse_pendente ?? paying.valor_repasse_total ?? paying.valor_repasse,
      forma_pagamento:   formaPagto,
      observacao:        obsPayment,
      // breakdown para o recibo
      repasse_servicos:  paying.valor_repasse || 0,
      comissao_produto:  paying.comissao_produto || 0,
      total_vendas_produto: paying.total_vendas_produto || 0,
      qtd_vendas_produto: paying.qtd_vendas_produto || 0,
    };
    const res = await fetch('/api/barber/pagamentos-funcionario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const saved = await res.json();
      const receiptData = {
        ...body,
        funcionario_nome: paying.nome,
        cargo: paying.cargo,
        id: saved.id,
        data_pagamento: new Date().toLocaleDateString('pt-BR'),
      };
      setPaying(null);
      setObsPayment('');
      setFormaPagto('Dinheiro');
      setReceipt(receiptData);
      fetchHistorico();
      fetchProducao();
    } else {
      alert('Erro ao registrar pagamento');
    }
  };

  const imprimirRecibo = (r: any) => {
    const w = window.open('', '_blank', 'width=420,height=650');
    if (!w) return;
    const repasseServicos = r.repasse_servicos ?? (Number(r.total_produzido) * Number(r.percentual_repasse) / 100);
    w.document.write(`
      <html><head><title>Recibo de Pagamento</title>
      <style>
        body{font-family:monospace;padding:24px;max-width:380px;margin:auto;background:#fff!important;color:#111!important;}
        h2{text-align:center;margin-bottom:4px}
        hr{border:1px dashed #ccc;margin:8px 0}
        .row{display:flex;justify-content:space-between;margin:3px 0;font-size:.92em}
        .label{color:#555}
        .section{font-size:.75em;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 2px}
        .total{font-size:1.25em;font-weight:bold;margin-top:4px}
        .sub{color:#888;font-size:.8em;text-align:center;margin-top:12px}
      </style></head>
      <body>
        <h2>✂️ RECIBO DE PAGAMENTO</h2>
        <hr/>
        <p style="margin:2px 0"><b>Funcionário:</b> ${r.funcionario_nome}</p>
        <p style="margin:2px 0"><b>Cargo:</b> ${r.cargo || 'Barbeiro'}</p>
        <p style="margin:2px 0"><b>Período:</b> ${r.periodo_inicio} → ${r.periodo_fim}</p>
        <hr/>
        <div class="section">Serviços</div>
        <div class="row"><span class="label">Atendimentos:</span><span><b>${r.qtd_atendimentos}</b></span></div>
        <div class="row"><span class="label">Total Serviços:</span><span>R$ ${Number(r.total_produzido || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label">Repasse (${r.percentual_repasse}%):</span><span><b>R$ ${repasseServicos.toFixed(2)}</b></span></div>
        ${(r.comissao_produto || 0) > 0 ? `
        <hr/>
        <div class="section">Produtos Físicos</div>
        <div class="row"><span class="label">Qtd. vendas:</span><span>${r.qtd_vendas_produto || 0} produto(s)</span></div>
        <div class="row"><span class="label">Total Vendas:</span><span>R$ ${Number(r.total_vendas_produto || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label">Comissão Produtos:</span><span><b>R$ ${Number(r.comissao_produto).toFixed(2)}</b></span></div>
        ` : ''}
        <hr/>
        <div class="row total"><span>VALOR PAGO:</span><span>R$ ${Number(r.valor_repasse).toFixed(2)}</span></div>
        <hr/>
        <div class="row"><span class="label">Forma:</span><span>${r.forma_pagamento}</span></div>
        ${r.observacao ? `<div class="row"><span class="label">Obs:</span><span>${r.observacao}</span></div>` : ''}
        <div class="row"><span class="label">Data:</span><span>${r.data_pagamento || new Date().toLocaleDateString('pt-BR')}</span></div>
        <p class="sub">FlowPDV — Sistema de Gestão</p>
        <script>window.print()</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex gap-3 items-end flex-wrap">
        {[['De', inicio, setInicio], ['Até', fim, setFim]].map(([lbl, val, set]: any) => (
          <div key={lbl} className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{lbl}</label>
            <input type="date" value={val} onChange={e => set(e.target.value)} className="px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none" />
          </div>
        ))}
        <button onClick={() => { const d = new Date(); d.setDate(d.getDate()-6); setInicio(d.toISOString().split('T')[0]); setFim(today); }}
          className="px-4 py-2.5 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">Últimos 7 dias</button>
        <button onClick={() => { setInicio(firstDay); setFim(today); }}
          className="px-4 py-2.5 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">Este mês</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card, #f4f4f5)', border: '1px solid var(--border, rgba(0,0,0,0.07))' }}>
          <p className="text-3xl font-black text-zinc-900" style={{ color: 'var(--text-primary, #18181b)' }}>R$ {totalProd.toFixed(2)}</p>
          <p className="text-xs text-zinc-500 mt-1">✂️ Total produzido no período</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card, #fffbeb)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <p className="text-3xl font-black" style={{ color: '#d97706' }}>R$ {totalRepasse.toFixed(2)}</p>
          <p className="text-xs mt-1" style={{ color: '#d97706', opacity: 0.8 }}>💸 Total a repassar no período</p>
        </div>
      </div>

      {/* Cards de produção + botão pagar */}
      {loading ? (
        <p className="text-center text-zinc-400 py-8">Calculando...</p>
      ) : producao.length === 0 ? (
        <p className="text-center text-zinc-400 py-12">Nenhum atendimento no período.</p>
      ) : (
        <div className="space-y-4">
          {producaoComRepasse.length === 0 && (
            <p className="text-center text-zinc-400 py-8">Nenhuma produção no período selecionado.</p>
          )}
          {producaoComRepasse.length > 0 && producaoPendente.length === 0 && (
            <p className="text-center text-emerald-600 font-bold py-4">✅ Todos os repasses do período estão em dia.</p>
          )}
          {producaoComRepasse.map((f: any) => (
            <div key={f.id} className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className={['w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg', corMap[f.cor] || 'bg-zinc-500'].join(' ')}>{f.nome[0]}</div>
                <div className="flex-1">
                  <p className="text-lg font-black text-zinc-900">{f.nome}</p>
                  <p className="text-sm text-zinc-500">{f.cargo} · {f.qtd_atendimentos || 0} atend. · {f.percentual_repasse}% serviços{(f.qtd_vendas_produto||0) > 0 ? ` · ${f.qtd_vendas_produto} produto(s)` : ''}</p>
                </div>
                <div className="text-right mr-2 space-y-0.5">
                  <p className="text-xs text-zinc-400">Serviços</p>
                  <p className="font-black text-zinc-900">R$ {(f.total_produzido || 0).toFixed(2)}</p>
                  {(f.total_vendas_produto || 0) > 0 && (
                    <p className="text-xs text-zinc-400">+Produtos: <span className="font-bold text-zinc-700">R$ {(f.total_vendas_produto || 0).toFixed(2)}</span></p>
                  )}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-right min-w-[120px]">
                  <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wide">A pagar</p>
                  <p className="text-xl font-black text-amber-900">R$ {(f.valor_repasse_pendente ?? 0).toFixed(2)}</p>
                  {(f.comissao_produto || 0) > 0 && (
                    <p className="text-[9px] text-zinc-400 mt-0.5">incl. R$ {(f.comissao_produto||0).toFixed(2)} produtos</p>
                  )}
                </div>
                {(f.valor_repasse_pendente ?? f.valor_repasse ?? 0) > 0.009 ? (
                  <button onClick={() => { setPaying(f); setFormaPagto('Dinheiro'); setObsPayment(''); }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-black transition-colors whitespace-nowrap">
                    <Check size={15} /> Pagar
                  </button>
                ) : (f.valor_repasse || 0) > 0 ? (
                  <div className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-black">
                    <Check size={15} /> Em dia
                  </div>
                ) : null}
              </div>
              {totalProd > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                    <span>Participação no total</span>
                    <span>{((f.total_produzido||0)/totalProd*100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: ((f.total_produzido||0)/totalProd*100).toFixed(0)+'%' }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Histórico de pagamentos */}
      {historico.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-black text-zinc-900 mb-3">📋 Histórico de Pagamentos</p>
          <div className="space-y-2">
            {historico.map((h: any) => (
              <div key={h.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 flex items-center gap-3">
                <div className={['w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm', corMap[h.cor] || 'bg-zinc-500'].join(' ')}>{(h.funcionario_nome||'?')[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-zinc-900 text-sm">{h.funcionario_nome}</p>
                  <p className="text-xs text-zinc-400">{h.periodo_inicio} → {h.periodo_fim} · {h.qtd_atendimentos} atend. · {h.forma_pagamento}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-green-700">R$ {Number(h.valor_repasse).toFixed(2)}</p>
                  <p className="text-[10px] text-zinc-400">{new Date(h.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <button onClick={() => imprimirRecibo({ ...h, data_pagamento: new Date(h.created_at).toLocaleDateString('pt-BR') })}
                  className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors" title="Imprimir recibo">
                  <Printer size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Confirmar Pagamento */}
      <AnimatePresence>
        {paying && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className={['w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg', corMap[paying.cor] || 'bg-zinc-500'].join(' ')}>{paying.nome[0]}</div>
                <div>
                  <h3 className="text-xl font-black text-zinc-900">Pagar {paying.nome}</h3>
                  <p className="text-sm text-zinc-400">{paying.cargo} · {inicio} a {fim}</p>
                </div>
              </div>

              <div className="bg-zinc-50 rounded-2xl p-4 space-y-2 mb-6">
                {/* Serviços */}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Atendimentos</span>
                  <span className="font-bold">{paying.qtd_atendimentos}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total Serviços</span>
                  <span className="font-bold">R$ {Number(paying.total_produzido || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Repasse Serviços ({paying.percentual_repasse}%)</span>
                  <span className="font-bold text-zinc-700">R$ {Number(paying.valor_repasse || 0).toFixed(2)}</span>
                </div>

                {/* Produtos físicos */}
                {(paying.comissao_produto || 0) > 0 && <>
                  <div className="border-t border-dashed border-zinc-200 pt-2 flex justify-between text-sm">
                    <span className="text-zinc-500">Vendas Produtos ({paying.qtd_vendas_produto || 0}x)</span>
                    <span className="font-bold">R$ {Number(paying.total_vendas_produto || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Comissão Produtos</span>
                    <span className="font-bold text-zinc-700">R$ {Number(paying.comissao_produto || 0).toFixed(2)}</span>
                  </div>
                </>}

                {/* Subtotal e desconto do já pago */}
                {(paying.total_ja_pago || 0) > 0.009 && <>
                  <div className="border-t border-dashed border-zinc-200 pt-2 flex justify-between text-sm">
                    <span className="text-zinc-500">Subtotal bruto</span>
                    <span className="font-bold">R$ {Number((paying.valor_repasse || 0) + (paying.comissao_produto || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Já pago</span>
                    <span className="font-bold text-red-500">− R$ {Number(paying.total_ja_pago).toFixed(2)}</span>
                  </div>
                </>}

                <div className="border-t border-zinc-200 pt-2 flex justify-between items-center">
                  <span className="font-black text-zinc-900">Valor a pagar</span>
                  <span className="text-2xl font-black text-green-700">R$ {Number(paying.valor_repasse_pendente ?? 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Forma de Pagamento</label>
                  <select value={formaPagto} onChange={e => setFormaPagto(e.target.value)}
                    className="w-full mt-1.5 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none">
                    {['Dinheiro','Pix','Transferência','Boleto','Outro'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Observação (opcional)</label>
                  <input type="text" value={obsPayment} onChange={e => setObsPayment(e.target.value)} placeholder="Ex: referente à semana 09/03..."
                    className="w-full mt-1.5 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none" />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPaying(null)} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-50 transition-colors">Cancelar</button>
                <button onClick={confirmarPagamento} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black transition-colors">✅ Confirmar Pagamento</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Recibo gerado */}
      <AnimatePresence>
        {receipt && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }}
              className="rounded-3xl p-8 max-w-md w-full shadow-2xl" style={{ background: '#fff', color: '#18181b' }}>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#dcfce7' }}>
                  <Check size={32} style={{ color: '#16a34a' }} />
                </div>
                <h3 className="text-xl font-black" style={{ color: '#18181b' }}>Pagamento Registrado!</h3>
              </div>
              <div className="rounded-2xl p-5 font-mono text-sm space-y-1 mb-6 border" style={{ background: '#fff', borderColor: '#e4e4e7', color: '#18181b' }}>
                <p className="text-center font-black text-base mb-2">✂️ RECIBO DE PAGAMENTO</p>
                <p>Funcionário: <b>{receipt.funcionario_nome}</b></p>
                <p>Cargo: {receipt.cargo}</p>
                <p>Período: {receipt.periodo_inicio} → {receipt.periodo_fim}</p>
                <hr style={{ borderColor: '#d1d5db', borderStyle: 'dashed', margin: '8px 0' }} />
                <p className="font-bold text-xs uppercase" style={{ color: '#6b7280' }}>Serviços</p>
                <p>Atendimentos: <b>{receipt.qtd_atendimentos}</b></p>
                <p>Total Serviços: R$ {Number(receipt.total_produzido || 0).toFixed(2)}</p>
                <p>Repasse ({receipt.percentual_repasse}%): <b>R$ {Number(receipt.repasse_servicos || 0).toFixed(2)}</b></p>
                {(receipt.comissao_produto || 0) > 0 && <>
                  <hr style={{ borderColor: '#d1d5db', borderStyle: 'dashed', margin: '6px 0' }} />
                  <p className="font-bold text-xs uppercase" style={{ color: '#6b7280' }}>Produtos Físicos</p>
                  <p>Qtd. vendas: {receipt.qtd_vendas_produto || 0} produto(s)</p>
                  <p>Total Vendas: R$ {Number(receipt.total_vendas_produto || 0).toFixed(2)}</p>
                  <p>Comissão Produtos: <b>R$ {Number(receipt.comissao_produto).toFixed(2)}</b></p>
                </>}
                <hr style={{ borderColor: '#d1d5db', borderStyle: 'dashed', margin: '8px 0' }} />
                <p className="text-lg font-black">VALOR PAGO: R$ {Number(receipt.valor_repasse).toFixed(2)}</p>
                <p>Forma: {receipt.forma_pagamento}</p>
                {receipt.observacao && <p>Obs: {receipt.observacao}</p>}
                <p>Data: {receipt.data_pagamento}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setReceipt(null)} className="flex-1 py-3 rounded-xl font-bold transition-colors" style={{ border: '2px solid #e4e4e7', color: '#52525b', background: 'transparent' }}>Fechar</button>
                <button onClick={() => imprimirRecibo(receipt)} className="flex-1 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors" style={{ background: '#18181b', color: '#fff' }}>
                  <Printer size={16} /> Imprimir Recibo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}