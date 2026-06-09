// src/shared/FiscalScreen.tsx
// Tela de Gestão Fiscal — Extrato de receitas e custos por período
// com download em PDF ou Excel, e acesso ao emissor de NFC-e da Receita Federal.

import React, { useState, useCallback } from 'react';
import {
  FileText, Download, ExternalLink, Calendar,
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  AlertCircle, Loader2, Receipt,
} from 'lucide-react';
import { adminScreenPagePaddingClass } from '../components/ui/screenChrome';

interface FiscalScreenProps {
  token: string;
}

interface ResumoFiscal {
  periodo: { inicio: string; fim: string };
  receita_bruta: number;
  total_pedidos: number;
  ticket_medio: number;
  total_reembolsos: number;
  receita_liquida: number;
  custo_insumos: number;
  resultado_operacional: number;
  pedidos_por_dia: { data: string; pedidos: number; faturamento: number }[];
  top_produtos: { name: string; quantity: number; total: number }[];
}

const TZ_OFFSET = -3; // America/Sao_Paulo (sem horário de verão)

function hoje(): string {
  const d = new Date();
  d.setHours(d.getHours() + TZ_OFFSET - (d.getTimezoneOffset() / 60 + TZ_OFFSET));
  return d.toISOString().split('T')[0];
}

function primeiroDiaMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function ultimoDiaMes(ano: number, mes: number): string {
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

function fmt(v: number): string {
  return `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function nomeMes(m: number): string {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][m - 1];
}

// ─── Gerador de Excel (XLSX simplificado via CSV com BOM UTF-8) ────────────────
function gerarCSV(resumo: ResumoFiscal, mesLabel: string): string {
  const lin: string[] = [];
  const sep = ';';

  lin.push(`EXTRATO FISCAL — ${mesLabel.toUpperCase()}`);
  lin.push('');
  lin.push('RESUMO GERAL');
  lin.push(`Período${sep}${fmtDate(resumo.periodo.inicio)} a ${fmtDate(resumo.periodo.fim)}`);
  lin.push(`Receita Bruta${sep}${resumo.receita_bruta.toFixed(2).replace('.', ',')}`);
  lin.push(`Total de Pedidos${sep}${resumo.total_pedidos}`);
  lin.push(`Ticket Médio${sep}${resumo.ticket_medio.toFixed(2).replace('.', ',')}`);
  lin.push(`Reembolsos${sep}${resumo.total_reembolsos.toFixed(2).replace('.', ',')}`);
  lin.push(`Receita Líquida${sep}${resumo.receita_liquida.toFixed(2).replace('.', ',')}`);
  lin.push(`Custo de Insumos (Estoque)${sep}${resumo.custo_insumos.toFixed(2).replace('.', ',')}`);
  lin.push(`Resultado Operacional${sep}${resumo.resultado_operacional.toFixed(2).replace('.', ',')}`);
  lin.push('');

  if (resumo.pedidos_por_dia.length > 0) {
    lin.push('FATURAMENTO DIÁRIO');
    lin.push(`Data${sep}Pedidos${sep}Faturamento (R$)`);
    resumo.pedidos_por_dia.forEach(d => {
      lin.push(`${fmtDate(d.data)}${sep}${d.pedidos}${sep}${d.faturamento.toFixed(2).replace('.', ',')}`);
    });
    lin.push('');
  }

  if (resumo.top_produtos.length > 0) {
    lin.push('PRODUTOS MAIS VENDIDOS');
    lin.push(`Produto${sep}Quantidade${sep}Total Vendido (R$)`);
    resumo.top_produtos.forEach(p => {
      lin.push(`${p.name}${sep}${p.quantity}${sep}${p.total.toFixed(2).replace('.', ',')}`);
    });
  }

  return '\uFEFF' + lin.join('\r\n');
}

// ─── Gerador de PDF via HTML → impressão ──────────────────────────────────────
function gerarHTMLParaPDF(resumo: ResumoFiscal, mesLabel: string): string {
  const corPositivo = resumo.resultado_operacional >= 0 ? '#15803d' : '#dc2626';
  const linhasDiario = resumo.pedidos_por_dia.map(d => `
    <tr>
      <td>${fmtDate(d.data)}</td>
      <td style="text-align:center">${d.pedidos}</td>
      <td style="text-align:right">${fmt(d.faturamento)}</td>
    </tr>`).join('');

  const linhasProdutos = resumo.top_produtos.slice(0, 10).map((p, i) => `
    <tr>
      <td>${i + 1}. ${p.name}</td>
      <td style="text-align:center">${p.quantity}</td>
      <td style="text-align:right">${fmt(p.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Extrato Fiscal — ${mesLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
  h1 { font-size: 22px; color: #1e3a5f; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #64748b; margin-bottom: 28px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
  .card-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .card-value { font-size: 18px; font-weight: 700; color: #1e3a5f; }
  .card-value.destaque { color: ${corPositivo}; }
  .card-value.negativo { color: #dc2626; }
  .section-title { font-size: 14px; font-weight: 700; color: #1e3a5f; margin-bottom: 10px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 11px; }
  th { background: #1e3a5f; color: white; padding: 8px 10px; text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .aviso { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin-top: 28px; font-size: 11px; color: #1e40af; }
  .footer { margin-top: 28px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<h1>📊 Extrato Fiscal</h1>
<div class="sub">${mesLabel} · Período: ${fmtDate(resumo.periodo.inicio)} a ${fmtDate(resumo.periodo.fim)}</div>

<div class="cards">
  <div class="card">
    <div class="card-label">Receita Bruta</div>
    <div class="card-value">${fmt(resumo.receita_bruta)}</div>
  </div>
  <div class="card">
    <div class="card-label">Total de Pedidos</div>
    <div class="card-value">${resumo.total_pedidos}</div>
  </div>
  <div class="card">
    <div class="card-label">Ticket Médio</div>
    <div class="card-value">${fmt(resumo.ticket_medio)}</div>
  </div>
  <div class="card">
    <div class="card-label">Reembolsos</div>
    <div class="card-value negativo">− ${fmt(resumo.total_reembolsos)}</div>
  </div>
  <div class="card">
    <div class="card-label">Custo de Insumos</div>
    <div class="card-value negativo">− ${fmt(resumo.custo_insumos)}</div>
  </div>
  <div class="card">
    <div class="card-label">Resultado Operacional</div>
    <div class="card-value destaque">${fmt(resumo.resultado_operacional)}</div>
  </div>
</div>

${resumo.pedidos_por_dia.length > 0 ? `
<div class="section-title">Faturamento Diário</div>
<table>
  <thead><tr><th>Data</th><th style="text-align:center">Pedidos</th><th style="text-align:right">Faturamento</th></tr></thead>
  <tbody>${linhasDiario}</tbody>
</table>` : ''}

${resumo.top_produtos.length > 0 ? `
<div class="section-title">Produtos Mais Vendidos</div>
<table>
  <thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${linhasProdutos}</tbody>
</table>` : ''}

<div class="aviso">
  <strong>ℹ️ Nota:</strong> Este extrato é gerado a partir dos pedidos registrados no sistema e das movimentações de estoque. 
  Apresente ao seu contador junto com as notas de compra dos fornecedores para fins contábeis e declaração de impostos.
  O custo de insumos só aparece se o módulo de Estoque estiver sendo utilizado.
</div>

<div class="footer">Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Sistema FlowPDV</div>

<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function FiscalScreen({ token }: FiscalScreenProps) {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;

  const [anoSel, setAnoSel] = useState(anoAtual);
  const [mesSel, setMesSel] = useState(mesAtual);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoFiscal | null>(null);

  const hdrs = { Authorization: `Bearer ${token}` };

  const buscarResumo = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setResumo(null);

    const inicio = primeiroDiaMes(anoSel, mesSel);
    const fim = ultimoDiaMes(anoSel, mesSel);

    try {
      // 1. Stats de vendas do período
      const [statsRes, estoqueRes, diarioRes, produtosRes] = await Promise.all([
        fetch(`/api/dashboard/stats?month=${mesSel}&year=${anoSel}`, { headers: hdrs }),
        fetch(`/api/estoque/relatorio/consumo?inicio=${inicio}&fim=${fim}`, { headers: hdrs }),
        fetch(`/api/orders?from=${inicio}&to=${fim}&limit=500`, { headers: hdrs }),
        fetch(`/api/dashboard/stats?month=${mesSel}&year=${anoSel}`, { headers: hdrs }),
      ]);

      const stats = statsRes.ok ? await statsRes.json() : {};
      const estoqueData = estoqueRes.ok ? await estoqueRes.json() : { custo_total_periodo: 0, consumo: [] };
      const pedidosBrutos: any[] = diarioRes.ok ? await diarioRes.json() : [];

      const receitaBruta = Number(stats.filteredTotal || stats.totalFiltrado?.faturamento || 0);
      const totalPedidos = Number(stats.totalPedidos || stats.totalFiltrado?.pedidos || 0);
      const totalReembolsos = Number(stats.totalRefunded || 0);
      const receitaLiquida = receitaBruta - totalReembolsos;
      const custoInsumos = Number(estoqueData.custo_total_periodo || 0);
      const resultadoOperacional = receitaLiquida - custoInsumos;
      const ticketMedio = totalPedidos > 0 ? receitaBruta / totalPedidos : 0;

      // Agrupa pedidos por dia
      const porDia: Record<string, { pedidos: number; faturamento: number }> = {};
      (Array.isArray(pedidosBrutos) ? pedidosBrutos : [])
        .filter((p: any) => p.status !== 'Cancelado' && !p.cancelado_at)
        .forEach((p: any) => {
          const data = String(p.created_at || '').split('T')[0].split(' ')[0];
          if (!data) return;
          if (!porDia[data]) porDia[data] = { pedidos: 0, faturamento: 0 };
          porDia[data].pedidos += 1;
          porDia[data].faturamento += Number(p.total_amount || 0);
        });

      const pedidosPorDia = Object.entries(porDia)
        .map(([data, v]) => ({ data, ...v }))
        .sort((a, b) => a.data.localeCompare(b.data));

      const topProdutos: { name: string; quantity: number; total: number }[] =
        (stats.productSales || []).slice(0, 10);

      setResumo({
        periodo: { inicio, fim },
        receita_bruta: receitaBruta,
        total_pedidos: totalPedidos,
        ticket_medio: ticketMedio,
        total_reembolsos: totalReembolsos,
        receita_liquida: receitaLiquida,
        custo_insumos: custoInsumos,
        resultado_operacional: resultadoOperacional,
        pedidos_por_dia: pedidosPorDia,
        top_produtos: topProdutos,
      });
    } catch {
      setErro('Não foi possível carregar os dados. Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [anoSel, mesSel, token]);

  function baixarExcel() {
    if (!resumo) return;
    const mesLabel = `${nomeMes(mesSel)} ${anoSel}`;
    const csv = gerarCSV(resumo, mesLabel);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-fiscal-${anoSel}-${String(mesSel).padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function baixarPDF() {
    if (!resumo) return;
    const mesLabel = `${nomeMes(mesSel)} ${anoSel}`;
    const html = gerarHTMLParaPDF(resumo, mesLabel);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const janela = window.open(url, '_blank');
    if (janela) {
      janela.onload = () => URL.revokeObjectURL(url);
    }
  }

  const anos = Array.from({ length: 4 }, (_, i) => anoAtual - i);
  const meses = Array.from({ length: 12 }, (_, i) => ({ num: i + 1, nome: nomeMes(i + 1) }));
  const mesLabel = `${nomeMes(mesSel)} de ${anoSel}`;

  const corResultado = resumo && resumo.resultado_operacional >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className={`mx-auto max-w-5xl min-w-0 space-y-4 sm:space-y-5 ${adminScreenPagePaddingClass}`}>

      {/* Cabeçalho */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-fptext-primary sm:text-2xl">Gestão Fiscal</h1>
          <p className="text-sm text-fptext-muted">Extrato de receitas e custos para fins contábeis</p>
        </div>
        <a
          href="https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-fp-border bg-fp-card px-4 py-2.5 text-sm font-medium text-fptext-secondary transition hover:border-fp-border hover:bg-fp-hover hover:text-fptext-primary"
        >
          <ExternalLink size={15} />
          Emissor NFC-e · Receita Federal
        </a>
      </div>

      {/* Card de aviso informativo */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-blue-500" />
        <p>
          Este extrato reúne as vendas registradas no sistema e os custos de insumos do estoque.
          Use-o como base para o seu contador ao realizar declarações fiscais.
          {' '}<strong>O custo de insumos só é calculado se o módulo Estoque estiver em uso.</strong>
        </p>
      </div>

      {/* Seletor de período */}
      <div className="rounded-2xl border border-fp-border bg-fp-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-fptext-muted" />
          <span className="text-sm font-semibold text-fptext-primary">Selecionar período</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-fptext-muted uppercase tracking-wide">Mês</label>
            <select
              value={mesSel}
              onChange={e => setMesSel(Number(e.target.value))}
              className="rounded-xl border border-fp-border bg-fp-secondary px-3 py-2 text-sm text-fptext-primary focus:border-blue-400 focus:outline-none"
            >
              {meses.map(m => (
                <option key={m.num} value={m.num}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-fptext-muted uppercase tracking-wide">Ano</label>
            <select
              value={anoSel}
              onChange={e => setAnoSel(Number(e.target.value))}
              className="rounded-xl border border-fp-border bg-fp-secondary px-3 py-2 text-sm text-fptext-primary focus:border-blue-400 focus:outline-none"
            >
              {anos.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <button
            onClick={buscarResumo}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
            {loading ? 'Carregando…' : 'Gerar Extrato'}
          </button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          {erro}
        </div>
      )}

      {/* Resultado */}
      {resumo && (
        <div className="space-y-4">

          {/* Cabeçalho do extrato + botões de download */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-fptext-primary">Extrato — {mesLabel}</h2>
              <p className="text-xs text-fptext-muted">
                {fmtDate(resumo.periodo.inicio)} até {fmtDate(resumo.periodo.fim)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={baixarExcel}
                className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                <Download size={14} />
                Baixar Excel (CSV)
              </button>
              <button
                onClick={baixarPDF}
                className="flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
              >
                <FileText size={14} />
                Baixar PDF
              </button>
            </div>
          </div>

          {/* Cards de resumo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-fp-border bg-fp-card p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fptext-muted">
                <TrendingUp size={12} /> Receita Bruta
              </div>
              <div className="text-xl font-bold text-fptext-primary">{fmt(resumo.receita_bruta)}</div>
            </div>
            <div className="rounded-2xl border border-fp-border bg-fp-card p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fptext-muted">
                <ShoppingCart size={12} /> Total de Pedidos
              </div>
              <div className="text-xl font-bold text-fptext-primary">{resumo.total_pedidos}</div>
            </div>
            <div className="rounded-2xl border border-fp-border bg-fp-card p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fptext-muted">
                <DollarSign size={12} /> Ticket Médio
              </div>
              <div className="text-xl font-bold text-fptext-primary">{fmt(resumo.ticket_medio)}</div>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-red-500">
                <TrendingDown size={12} /> Reembolsos
              </div>
              <div className="text-xl font-bold text-red-600">− {fmt(resumo.total_reembolsos)}</div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600">
                <TrendingDown size={12} /> Custo de Insumos
              </div>
              <div className="text-xl font-bold text-amber-700">
                {resumo.custo_insumos > 0 ? `− ${fmt(resumo.custo_insumos)}` : '— (estoque não usado)'}
              </div>
            </div>
            <div className={`rounded-2xl border p-4 shadow-sm ${resumo.resultado_operacional >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <div className={`mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${resumo.resultado_operacional >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                <DollarSign size={12} /> Resultado Operacional
              </div>
              <div className={`text-xl font-bold ${corResultado}`}>{fmt(resumo.resultado_operacional)}</div>
            </div>
          </div>

          {/* Tabela diária */}
          {resumo.pedidos_por_dia.length > 0 && (
            <div className="rounded-2xl border border-fp-border bg-fp-card shadow-sm">
              <div className="border-b border-fp-border px-5 py-3">
                <h3 className="text-sm font-semibold text-fptext-primary">Faturamento por Dia</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-fp-border bg-fp-secondary text-xs font-semibold uppercase tracking-wide text-fptext-muted">
                      <th className="px-5 py-3 text-left">Data</th>
                      <th className="px-5 py-3 text-center">Pedidos</th>
                      <th className="px-5 py-3 text-right">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.pedidos_por_dia.map((d, i) => (
                      <tr key={d.data} className={i % 2 === 0 ? '' : 'bg-fp-secondary/40'}>
                        <td className="px-5 py-2.5 font-medium text-fptext-primary">{fmtDate(d.data)}</td>
                        <td className="px-5 py-2.5 text-center text-fptext-secondary">{d.pedidos}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-fptext-primary">{fmt(d.faturamento)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-fp-border bg-fp-secondary">
                      <td className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-fptext-muted">Total</td>
                      <td className="px-5 py-3 text-center text-sm font-bold text-fptext-primary">{resumo.total_pedidos}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-fptext-primary">{fmt(resumo.receita_bruta)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Top produtos */}
          {resumo.top_produtos.length > 0 && (
            <div className="rounded-2xl border border-fp-border bg-fp-card shadow-sm">
              <div className="border-b border-fp-border px-5 py-3">
                <h3 className="text-sm font-semibold text-fptext-primary">Produtos Mais Vendidos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-fp-border bg-fp-secondary text-xs font-semibold uppercase tracking-wide text-fptext-muted">
                      <th className="px-5 py-3 text-left">Produto</th>
                      <th className="px-5 py-3 text-center">Quantidade</th>
                      <th className="px-5 py-3 text-right">Total Vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.top_produtos.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-fp-secondary/40'}>
                        <td className="px-5 py-2.5 font-medium text-fptext-primary">{p.name}</td>
                        <td className="px-5 py-2.5 text-center text-fptext-secondary">{p.quantity}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-fptext-primary">{fmt(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rodapé informativo */}
          <div className="rounded-xl border border-fp-border bg-fp-secondary p-4 text-xs text-fptext-muted">
            <strong className="text-fptext-secondary">Sobre este extrato:</strong> os valores são calculados com base nos pedidos registrados no sistema (não cancelados) e nas movimentações de estoque do período.
            Para fins de declaração de imposto de renda, apresente este extrato ao seu contador junto com os comprovantes de compra de fornecedores.
          </div>
        </div>
      )}

      {/* Estado vazio (antes de buscar) */}
      {!resumo && !loading && !erro && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-fp-border bg-fp-secondary/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fp-card text-3xl shadow-sm">
            📊
          </div>
          <div>
            <p className="font-semibold text-fptext-primary">Selecione o período e clique em Gerar Extrato</p>
            <p className="mt-1 text-sm text-fptext-muted">O extrato reúne receitas e custos do mês selecionado</p>
          </div>
        </div>
      )}

    </div>
  );
}