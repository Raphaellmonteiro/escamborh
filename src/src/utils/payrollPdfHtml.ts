/** HTML simples para impressão / PDF (sem dependências; usado no RH e reexportado pelo payrollService). */

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function fmtMoneyHtml(n: number): string {
  return roundMoney(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generatePayrollPdf(params: {
  employeeName: string;
  periodLabel: string;
  /** Linhas de provento (ex.: salário base + horas extras), já ordenadas */
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  net: number;
}): string {
  const earnRows = params.earnings
    .map(
      (e) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#166534">${escapeHtml(e.label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#22c55e">${fmtMoneyHtml(e.amount)}</td></tr>`
    )
    .join('');
  const dedRows = params.deductions
    .map(
      (d) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#991b1b">${escapeHtml(d.label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#f87171">${fmtMoneyHtml(d.amount)}</td></tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Folha — ${escapeHtml(params.employeeName)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#111;font-size:14px;max-width:640px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:20px}
.section{font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px}
.summary{margin-top:20px;padding:16px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
.summary span:first-child{font-weight:800;color:#374151}.net{font-size:22px;font-weight:900;color:#22c55e}
table{width:100%;border-collapse:collapse}</style></head><body>
<h1>Folha de pagamento</h1>
<p class="sub">${escapeHtml(params.periodLabel)} · ${escapeHtml(params.employeeName)}</p>
<div class="section">Proventos</div>
<table><tbody>${earnRows}</tbody></table>
<div class="section">Descontos</div>
<table><tbody>${dedRows}</tbody></table>
<div class="summary"><span>Salário líquido</span><span class="net">${fmtMoneyHtml(params.net)}</span></div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

const TIPO_RECIBO_LABEL: Record<string, string> = {
  advance: 'Adiantamento',
  partial_payment: 'Pagamento parcial',
  final_payment: 'Pagamento final',
};

export function generatePayrollReceiptHtml(params: {
  employeeName: string;
  periodLabel: string;
  reciboNumero: string;
  tipo: string;
  valor: number;
  paidAtLabel: string;
  observacao?: string | null;
  netLiquid?: number;
  totalPaidAfter?: number;
  balanceAfter?: number;
}): string {
  const tipoLabel = TIPO_RECIBO_LABEL[params.tipo] || params.tipo;
  const obs =
    params.observacao && String(params.observacao).trim()
      ? `<p style="margin:12px 0 0;font-size:13px;color:#4b5563"><strong>Obs.:</strong> ${escapeHtml(String(params.observacao).trim())}</p>`
      : '';
  const ctx =
    params.netLiquid != null &&
    params.totalPaidAfter != null &&
    params.balanceAfter != null
      ? `<div style="margin-top:20px;padding:12px 14px;background:#f9fafb;border-radius:8px;font-size:12px;color:#374151">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Líquido da folha</span><strong>${fmtMoneyHtml(params.netLiquid)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Total pago (após este)</span><strong>${fmtMoneyHtml(params.totalPaidAfter)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Saldo pendente</span><strong>${fmtMoneyHtml(params.balanceAfter)}</strong></div>
      </div>`
      : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${escapeHtml(params.reciboNumero)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#111;font-size:14px;max-width:560px;margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.sub{color:#6b7280;font-size:13px;margin-bottom:24px}
.box{margin-top:16px;padding:16px;border:1px solid #e5e7eb;border-radius:10px}
.valor{font-size:26px;font-weight:900;color:#16a34a;margin-top:8px}</style></head><body>
<h1>Recibo de pagamento</h1>
<p class="sub">${escapeHtml(params.periodLabel)} · ${escapeHtml(params.employeeName)}</p>
<p style="font-size:12px;color:#9ca3af;margin:0">Documento nº <strong style="color:#111">${escapeHtml(params.reciboNumero)}</strong></p>
<div class="box">
<p style="margin:0;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(tipoLabel)}</p>
<p class="valor">${fmtMoneyHtml(params.valor)}</p>
<p style="margin:8px 0 0;font-size:12px;color:#6b7280">Data do registro: ${escapeHtml(params.paidAtLabel)}</p>
${obs}
</div>
${ctx}
<p style="margin-top:40px;font-size:11px;color:#9ca3af">Assinatura do recebedor: _________________________________</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

export function generateFeriasReceiptHtml(params: {
  employeeName: string;
  periodoAquisitivoLabel: string;
  dataInicioGozo: string;
  dataFimGozo: string;
  dias: number;
  valorPago: number;
  dataDocumentoLabel: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo férias — ${escapeHtml(params.employeeName)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#111;font-size:14px;max-width:560px;margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.sub{color:#6b7280;font-size:13px;margin-bottom:20px}
.box{margin-top:16px;padding:16px;border:1px solid #e5e7eb;border-radius:10px}
.valor{font-size:24px;font-weight:900;color:#0d9488;margin-top:8px}</style></head><body>
<h1>Recibo de férias (controle gerencial)</h1>
<p class="sub">${escapeHtml(params.employeeName)}</p>
<div class="box">
<p style="margin:0;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">Período aquisitivo</p>
<p style="margin:4px 0 0;font-size:14px">${escapeHtml(params.periodoAquisitivoLabel)}</p>
<p style="margin:16px 0 0;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">Gozo</p>
<p style="margin:4px 0 0">${escapeHtml(params.dataInicioGozo)} a ${escapeHtml(params.dataFimGozo)} · <strong>${params.dias} dia(s)</strong></p>
<p style="margin:16px 0 0;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">Valor pago registrado</p>
<p class="valor">${fmtMoneyHtml(params.valorPago)}</p>
<p style="margin:12px 0 0;font-size:12px;color:#6b7280">Emitido em: ${escapeHtml(params.dataDocumentoLabel)}</p>
</div>
<p style="margin-top:36px;font-size:11px;color:#9ca3af">Documento meramente gerencial — sem validade jurídica automática.</p>
<p style="margin-top:28px;font-size:11px;color:#9ca3af">Assinatura: _________________________________</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

export function generateDecimoReceiptHtml(params: {
  employeeName: string;
  ano: number;
  parcelaLabel: string;
  valor: number;
  dataDocumentoLabel: string;
  /** Se true, abre o diálogo de impressão ao carregar (fluxo legado). */
  autoPrint?: boolean;
}): string {
  const autoPrint = params.autoPrint === true;
  const printScript = autoPrint ? `<script>window.onload=function(){window.print();}</script>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo 13º — ${escapeHtml(params.employeeName)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;padding:32px;color:#111;font-size:14px;max-width:560px;margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.sub{color:#6b7280;font-size:13px;margin-bottom:20px}
.box{margin-top:16px;padding:16px;border:1px solid #e5e7eb;border-radius:10px}
.valor{font-size:24px;font-weight:900;color:#7c3aed;margin-top:8px}</style></head><body>
<h1>Recibo 13º salário (controle gerencial)</h1>
<p class="sub">${escapeHtml(params.employeeName)} · Exercício ${params.ano}</p>
<div class="box">
<p style="margin:0;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(params.parcelaLabel)}</p>
<p class="valor">${fmtMoneyHtml(params.valor)}</p>
<p style="margin:12px 0 0;font-size:12px;color:#6b7280">Registrado em: ${escapeHtml(params.dataDocumentoLabel)}</p>
</div>
${autoPrint ? '' : '<p style="margin-top:16px;font-size:12px;color:#4b5563">Revise os dados e use <strong>Ctrl+P</strong> (ou Cmd+P) para imprimir ou salvar em PDF.</p>'}
<p style="margin-top:36px;font-size:11px;color:#9ca3af">Controle interno — proporcional ao ano, sem cálculo CLT completo.</p>
<p style="margin-top:28px;font-size:11px;color:#9ca3af">Assinatura: _________________________________</p>
${printScript}
</body></html>`;
}
