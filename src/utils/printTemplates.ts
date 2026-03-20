export type PrintVariant = 'receipt' | 'kitchen-ticket' | 'table-slip' | 'proof';
export type PrintChannel = 'balcao' | 'mesa' | 'delivery' | 'generic';

type PrintItem = {
  qtd: number;
  nome: string;
  obs?: string;
  valor?: number;
};

type PrintTotal = {
  label: string;
  valor: number;
  destaque?: boolean;
};

type PrintPayment = {
  metodo: string;
  valor: number;
  troco?: number;
};

type PrintMeta = {
  label: string;
  value: string;
};

export type PrintDocumentOptions = {
  titulo: string;
  estabelecimento?: string;
  orderNumber: string;
  data: string;
  itens: PrintItem[];
  totais?: PrintTotal[];
  pagamentos?: PrintPayment[];
  rodape?: string;
  observacao?: string;
  variant?: PrintVariant;
  canal?: PrintChannel;
  metadata?: PrintMeta[];
  cliente_nome?: string;
  cliente_tel?: string;
  endereco?: string;
  pagamento_status?: string;
  taxa_entrega?: number;
  motoboy_nome?: string;
};

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMoney(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function buildVariantLabel(variant: PrintVariant) {
  switch (variant) {
    case 'kitchen-ticket':
      return 'Comanda de cozinha';
    case 'table-slip':
      return 'Comanda de mesa';
    case 'proof':
      return 'Comprovante';
    default:
      return 'Cupom / recibo';
  }
}

function buildChannelLabel(channel: PrintChannel) {
  switch (channel) {
    case 'delivery':
      return 'Delivery';
    case 'mesa':
      return 'Mesa';
    case 'balcao':
      return 'Balcao';
    default:
      return 'Operacional';
  }
}

function buildStatusLabel(status?: string) {
  const normalized = String(status || '').trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === 'pago') return 'Pagamento pago';
  if (normalized === 'pendente') return 'Pagamento pendente';

  return `Pagamento: ${status}`;
}

function buildCustomerBlock(opts: PrintDocumentOptions) {
  const rows = [
    opts.cliente_nome ? { label: 'Cliente', value: opts.cliente_nome } : null,
    opts.cliente_tel ? { label: 'Telefone', value: opts.cliente_tel } : null,
    opts.endereco ? { label: 'Endereco', value: opts.endereco } : null,
    opts.motoboy_nome ? { label: 'Motoboy', value: opts.motoboy_nome } : null,
  ].filter(Boolean) as PrintMeta[];

  if (!rows.length) return '';

  return `
    <section class="block">
      <div class="section-label">Atendimento</div>
      <div class="stack">
        ${rows
          .map(
            (row) => `
              <div class="meta-line">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(row.value)}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

export function gerarCupomHtml(opts: PrintDocumentOptions): string {
  const variant = opts.variant || 'receipt';
  const channel = opts.canal || 'generic';
  const metadata: PrintMeta[] = [
    { label: 'Documento', value: buildVariantLabel(variant) },
    { label: 'Canal', value: buildChannelLabel(channel) },
    { label: 'Referencia', value: opts.orderNumber },
    { label: 'Emitido', value: opts.data },
    ...(opts.metadata || []),
  ];

  const statusLabel = buildStatusLabel(opts.pagamento_status);
  if (statusLabel) {
    metadata.push({ label: 'Financeiro', value: statusLabel });
  }

  const shouldShowTotals = Boolean((opts.totais && opts.totais.length) || (opts.taxa_entrega && opts.taxa_entrega > 0));
  const shouldShowPayments = Boolean(opts.pagamentos && opts.pagamentos.length);
  const noteText = (opts.observacao || opts.rodape || '').trim();
  const footerText =
    variant === 'kitchen-ticket'
      ? 'Separar por ordem de preparo.'
      : variant === 'table-slip'
        ? 'Uso interno da operacao.'
        : 'FlowPDV';

  const itemsHtml = opts.itens
    .map(
      (item) => `
        <div class="item-row">
          <div class="item-main">
            <div class="item-name">${item.qtd}x ${escapeHtml(item.nome)}</div>
            ${item.obs ? `<div class="item-note">${escapeHtml(item.obs)}</div>` : ''}
          </div>
          ${item.valor !== undefined ? `<div class="item-value">${formatMoney(item.valor)}</div>` : ''}
        </div>
      `
    )
    .join('');

  const totalsHtml = [
    opts.taxa_entrega && opts.taxa_entrega > 0
      ? `<div class="value-row"><span>Taxa de entrega</span><strong>${formatMoney(opts.taxa_entrega)}</strong></div>`
      : '',
    ...(opts.totais || []).map(
      (total) => `
        <div class="value-row${total.destaque ? ' strong' : ''}">
          <span>${escapeHtml(total.label)}</span>
          <strong>${formatMoney(total.valor)}</strong>
        </div>
      `
    ),
  ].join('');

  const paymentsHtml = (opts.pagamentos || [])
    .map(
      (payment) => `
        <div class="value-row">
          <span>${escapeHtml(payment.metodo)}</span>
          <strong>${formatMoney(payment.valor)}</strong>
        </div>
        ${payment.troco && payment.troco > 0
          ? `
            <div class="callout">
              <div class="callout-title">Levar troco</div>
              <div class="value-row strong">
                <span>Troco</span>
                <strong>${formatMoney(payment.troco)}</strong>
              </div>
            </div>
          `
          : ''}
      `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.titulo)}</title>
  <style>
    @page { margin: 4mm; size: 80mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 72mm;
      padding: 1.5mm;
      color: #111827;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      background: #fff;
    }
    .sheet {
      border: 1px solid #111827;
      border-radius: 10px;
      padding: 10px;
    }
    .header {
      text-align: center;
      border-bottom: 1px dashed #111827;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .brand {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .title {
      font-size: 18px;
      font-weight: 900;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .subtitle {
      margin-top: 4px;
      font-size: 10px;
      color: #4b5563;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: center;
      margin-top: 8px;
    }
    .chip {
      border: 1px solid #111827;
      border-radius: 999px;
      padding: 3px 7px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .block {
      border-bottom: 1px dashed #d1d5db;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .block:last-of-type {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .section-label {
      margin-bottom: 6px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #6b7280;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meta-line,
    .value-row,
    .item-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .meta-line span,
    .value-row span {
      color: #4b5563;
    }
    .meta-line strong,
    .value-row strong {
      text-align: right;
      font-weight: 700;
      color: #111827;
    }
    .item-main {
      flex: 1;
      min-width: 0;
    }
    .item-name {
      font-weight: 700;
      word-break: break-word;
    }
    .item-note {
      margin-top: 2px;
      color: #6b7280;
      font-size: 10px;
      word-break: break-word;
    }
    .item-value {
      white-space: nowrap;
      font-weight: 800;
    }
    .strong {
      font-size: 12px;
    }
    .callout {
      border: 1px solid #111827;
      border-radius: 8px;
      padding: 6px 7px;
      margin-top: 4px;
    }
    .callout-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 4px;
    }
    .note {
      border: 1px solid #111827;
      border-radius: 8px;
      padding: 7px;
      font-size: 10px;
      line-height: 1.4;
      word-break: break-word;
    }
    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed #111827;
      text-align: center;
      font-size: 9px;
      color: #4b5563;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header">
      ${opts.estabelecimento ? `<div class="brand">${escapeHtml(opts.estabelecimento)}</div>` : ''}
      <div class="title">${escapeHtml(opts.titulo)}</div>
      <div class="subtitle">Ref. ${escapeHtml(opts.orderNumber)} | ${escapeHtml(opts.data)}</div>
      <div class="chips">
        <span class="chip">${escapeHtml(buildVariantLabel(variant))}</span>
        <span class="chip">${escapeHtml(buildChannelLabel(channel))}</span>
      </div>
    </header>

    <section class="block">
      <div class="section-label">Leitura operacional</div>
      <div class="stack">
        ${metadata
          .map(
            (meta) => `
              <div class="meta-line">
                <span>${escapeHtml(meta.label)}</span>
                <strong>${escapeHtml(meta.value)}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    </section>

    ${buildCustomerBlock(opts)}

    <section class="block">
      <div class="section-label">${variant === 'kitchen-ticket' ? 'Producao' : 'Itens'}</div>
      <div class="stack">${itemsHtml}</div>
    </section>

    ${shouldShowTotals
      ? `
        <section class="block">
          <div class="section-label">Totais</div>
          <div class="stack">${totalsHtml}</div>
        </section>
      `
      : ''}

    ${shouldShowPayments
      ? `
        <section class="block">
          <div class="section-label">Pagamento</div>
          <div class="stack">${paymentsHtml}</div>
        </section>
      `
      : ''}

    ${noteText
      ? `
        <section class="block">
          <div class="section-label">Observacao</div>
          <div class="note">${escapeHtml(noteText)}</div>
        </section>
      `
      : ''}

    <footer class="footer">${escapeHtml(footerText)}</footer>
  </main>
</body>
</html>`;
}
