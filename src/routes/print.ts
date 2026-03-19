// src/routes/print.ts — geração de cupom + impressão térmica
import { Router, Request } from 'express';
import net from 'net';
import { q1, qAll } from '../db';

// ── Gerador de cupom HTML padrão 80mm ─────────────────────────────────────────
export function gerarCupomHtml(opts: {
  titulo: string; estabelecimento?: string; orderNumber: string; data: string;
  itens: { qtd: number; nome: string; obs?: string; valor?: number }[];
  totais?: { label: string; valor: number; destaque?: boolean }[];
  pagamentos?: { metodo: string; valor: number; troco?: number }[];
  rodape?: string;
  // Campos delivery
  cliente_nome?: string; cliente_tel?: string; endereco?: string;
  pagamento_status?: string; taxa_entrega?: number; motoboy_nome?: string;
}): string {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.',',')}`;
  const H = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const clienteHtml = (opts.cliente_nome || opts.cliente_tel || opts.endereco) ? `
    <div class="sep"></div>
    <div class="secao">CLIENTE</div>
    ${opts.cliente_nome ? `<div class="row-info"><span>👤</span><span>${H(opts.cliente_nome)}</span></div>` : ''}
    ${opts.cliente_tel  ? `<div class="row-info"><span>📱</span><span>${H(opts.cliente_tel)}</span></div>`  : ''}
    ${opts.endereco     ? `<div class="row-info endereco"><span>📍</span><span>${H(opts.endereco)}</span></div>` : ''}
    ${opts.motoboy_nome ? `<div class="row-info"><span>🛵</span><span>${H(opts.motoboy_nome)}</span></div>` : ''}
  ` : '';

  const pgStatus = opts.pagamento_status;
  const pgBadge = pgStatus ? `
    <div style="margin:4px 0;padding:4px 6px;border-radius:5px;text-align:center;font-weight:bold;font-size:12px;
      background:${pgStatus==='pago'?'#dcfce7':pgStatus==='pendente'?'#fef9c3':'#fee2e2'};
      color:${pgStatus==='pago'?'#166534':pgStatus==='pendente'?'#854d0e':'#991b1b'};
      border:1px solid ${pgStatus==='pago'?'#86efac':pgStatus==='pendente'?'#fde047':'#fca5a5'}">
      ${pgStatus==='pago'?'✅ PAGO':pgStatus==='pendente'?'⏳ PAGAMENTO PENDENTE':'❌ '+pgStatus.toUpperCase()}
    </div>` : '';

  const itensHtml = opts.itens.map(it => `
    <div class="item-row">
      <span class="item-nome">${it.qtd}x ${H(it.nome)}${it.obs?`<br><small>  ${H(it.obs)}</small>`:''}</span>
      ${it.valor!==undefined?`<span class="item-val">${fmt(it.valor)}</span>`:''}
    </div>`).join('');
  const totaisHtml = (opts.totais||[]).map(t =>
    `<div class="row${t.destaque?' destaque':''}"><span>${H(t.label)}</span><span>${fmt(t.valor)}</span></div>`
  ).join('');
  const taxaHtml = opts.taxa_entrega && opts.taxa_entrega > 0
    ? `<div class="row"><span>Taxa de entrega</span><span>${fmt(opts.taxa_entrega)}</span></div>` : '';
  const pagHtml = (opts.pagamentos||[]).map(p => `
    <div class="row"><span>${H(p.metodo)}</span><span>${fmt(p.valor)}</span></div>
    ${p.troco&&p.troco>0?`
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:6px;padding:5px 7px;margin:3px 0">
      <div style="color:#c2410c;font-weight:bold">💰 LEVAR TROCO</div>
      <div class="row destaque"><span>Troco a dar:</span><span>${fmt(p.troco)}</span></div>
    </div>`:''}
  `).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${H(opts.titulo)}</title>
<style>
  @page{margin:3mm;size:80mm auto;}*{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.5;width:72mm;padding:2mm;color:#000;}
  .center{text-align:center;}.bold{font-weight:bold;}.sep{border-top:1px dashed #000;margin:4px 0;}
  .row{display:flex;justify-content:space-between;padding:1px 0;}
  .destaque{font-size:14px;font-weight:bold;margin-top:2px;}.titulo{font-size:15px;font-weight:bold;}
  .item-row{display:flex;justify-content:space-between;}.item-nome{flex:1;word-break:break-word;padding-right:4px;}
  .item-val{white-space:nowrap;}.secao{font-weight:bold;font-size:11px;color:#555;letter-spacing:.5px;margin-top:4px;}
  .rodape{text-align:center;font-size:10px;color:#777;margin-top:4px;}
  .row-info{display:flex;gap:5px;padding:1px 0;word-break:break-word;}
  .endereco span:last-child{flex:1;}
</style></head><body>
<div class="center">
  ${opts.estabelecimento?`<div style="font-size:13px;font-weight:bold">${H(opts.estabelecimento.toUpperCase())}</div>`:''}
  <div class="titulo">${H(opts.titulo)}</div>
  <div style="font-size:11px;color:#555">#${H(opts.orderNumber)} &nbsp;|&nbsp; ${H(opts.data)}</div>
</div>
${pgBadge}
${clienteHtml}
<div class="sep"></div>
<div class="secao">ITENS</div>
${itensHtml}
${(opts.totais?.length || opts.taxa_entrega)?`<div class="sep"></div>${taxaHtml}${totaisHtml}`:''}
${opts.pagamentos?.length?`<div class="sep"></div><div class="secao">PAGAMENTO</div>${pagHtml}`:''}
<div class="sep"></div>
<div class="rodape">${opts.rodape?H(opts.rodape):'Obrigado pela preferência!'}</div>
<div class="rodape">FlowPDV &bull; ${H(opts.data)}</div>
</body></html>`;
}

// ── ESC/POS builder ───────────────────────────────────────────────────────────
function buildEscPos(dados: string, largura = 48): Buffer {
  const ESC = 0x1B; const GS = 0x1D;
  const INIT    = Buffer.from([ESC, 0x40]);
  const CENTER  = Buffer.from([ESC, 0x61, 0x01]);
  const LEFT    = Buffer.from([ESC, 0x61, 0x00]);
  const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
  const BOLD_OFF= Buffer.from([ESC, 0x45, 0x00]);
  const CUT     = Buffer.from([GS,  0x56, 0x41, 0x10]);
  const parts: Buffer[] = [INIT, CENTER, BOLD_ON, Buffer.from('FlowPDV\n'), BOLD_OFF, LEFT];
  const linhas = dados.split('\n');
  for (const l of linhas) parts.push(Buffer.from(l.slice(0, largura) + '\n', 'latin1'));
  parts.push(Buffer.from('\n\n\n'), CUT);
  return Buffer.concat(parts);
}

// ── Envio TCP ─────────────────────────────────────────────────────────────────
function enviarParaImpressora(dados: Buffer, ip: string, porta: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error(`Timeout: ${ip}:${porta}`)); }, 5000);
    socket.connect(porta||9100, ip, () => {
      socket.write(dados, (err) => { clearTimeout(timeout); if (err) reject(err); else { socket.end(); resolve(); } });
    });
    socket.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

// ── Rotas de impressão ────────────────────────────────────────────────────────
export function createPrintRouter() {
  const router = Router();

  // GET cupom HTML para browser print
  router.get('/cupom-html/:pedidoId', async (req: Request, res) => {
    try {
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).send('<h1>Pedido não encontrado</h1>');
      if (pedido.receipt_text && pedido.canal !== 'delivery') return res.send(pedido.receipt_text);
      const cliente = await q1('SELECT nome_estabelecimento FROM clientes WHERE id=?', [req.tenantId]);
      const itens = await qAll(
        `SELECT p.name, ip.quantity, ip.price_at_time FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const pagamentos = await qAll('SELECT * FROM pagamentos WHERE order_id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      const motoboy = pedido.motoboy_id
        ? await q1('SELECT nome FROM delivery_motoboys WHERE id=?', [pedido.motoboy_id])
        : null;
      const now = new Date(pedido.created_at).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
      const isDelivery = pedido.canal === 'delivery';
      const html = gerarCupomHtml({
        titulo: isDelivery ? 'PEDIDO DELIVERY' : 'RECIBO',
        estabelecimento: cliente?.nome_estabelecimento,
        orderNumber: pedido.order_number, data: now,
        itens: itens.map((i: any) => ({ qtd: i.quantity, nome: i.name, valor: i.price_at_time * i.quantity })),
        totais: [{ label: 'TOTAL', valor: pedido.total_amount, destaque: true }],
        pagamentos: pagamentos.length > 0
          ? pagamentos.map((p: any) => ({ metodo: p.method, valor: p.amount_paid, troco: p.change_given > 0 ? p.change_given : undefined }))
          : isDelivery && pedido.pagamento_tipo
            ? [{ metodo: pedido.pagamento_tipo, valor: pedido.total_amount }]
            : undefined,
        rodape: pedido.observation?.trim() ? `Obs: ${pedido.observation.trim()}` : undefined,
        ...(isDelivery ? {
          cliente_nome: pedido.cliente_nome || undefined,
          cliente_tel:  pedido.cliente_tel  || undefined,
          endereco:     pedido.endereco     || undefined,
          pagamento_status: pedido.pagamento_status || (pedido.pagamento_tipo === 'pix' || pedido.pagamento_tipo === 'cartao' ? 'pendente' : undefined),
          taxa_entrega: pedido.taxa_entrega  || undefined,
          motoboy_nome: motoboy?.nome        || undefined,
        } : {}),
      });
      res.send(html);
    } catch (e: any) { res.status(500).send(e.message); }
  });

  // POST imprimir recibo na térmica
  router.post('/recibo/:pedidoId', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora não configurada' });
      const cfg = JSON.parse(row.printer_config);
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      const texto = pedido.receipt_text || `Pedido #${pedido.order_number}\nTotal: R$ ${pedido.total_amount.toFixed(2)}`;
      const dados = buildEscPos(texto, cfg.largura_papel || 48);
      await enviarParaImpressora(dados, cfg.ip, cfg.porta);
      res.json({ success: true });
    } catch (e: any) { res.json({ success: false, message: e.message }); }
  });

  // GET comanda HTML para browser
  router.get('/comanda-html/:pedidoId', async (req: Request, res) => {
    try {
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).send('');
      const itens = await qAll(
        `SELECT p.name, ip.quantity FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const now = new Date().toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
      res.send(gerarCupomHtml({
        titulo: 'COMANDA — COZINHA', orderNumber: pedido.order_number, data: now,
        itens: itens.map((i: any) => ({ qtd: i.quantity, nome: i.name })),
        rodape: pedido.observation ? `Obs: ${pedido.observation}` : undefined,
      }));
    } catch (e: any) { res.status(500).send(e.message); }
  });

  // POST imprimir comanda na térmica
  router.post('/comanda/:pedidoId', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora não configurada' });
      const cfg = JSON.parse(row.printer_config);
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      const itens = await qAll(
        `SELECT p.name, ip.quantity FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const texto = `COMANDA #${pedido.order_number}\n` + itens.map((i:any) => `  ${i.quantity}x ${i.name}`).join('\n') + (pedido.observation ? `\nObs: ${pedido.observation}` : '');
      const dados = buildEscPos(texto, cfg.largura_papel || 48);
      await enviarParaImpressora(dados, cfg.ip, cfg.porta);
      res.json({ success: true });
    } catch (e: any) { res.json({ success: false, message: e.message }); }
  });

  // POST teste de impressora
  router.post('/teste', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora não configurada' });
      const cfg = JSON.parse(row.printer_config);
      if (!cfg.ip) return res.json({ success: false, message: 'IP não configurado' });
      const dados = buildEscPos('TESTE DE IMPRESSÃO\nFlowPDV funcionando!\n' + new Date().toLocaleString('pt-BR'), cfg.largura_papel||48);
      await enviarParaImpressora(dados, cfg.ip, cfg.porta||9100);
      res.json({ success: true });
    } catch (e: any) { res.json({ success: false, message: e.message }); }
  });

  return router;
}