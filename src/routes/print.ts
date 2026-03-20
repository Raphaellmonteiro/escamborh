// src/routes/print.ts - geracao de cupom + impressao termica
import { Router, Request } from 'express';
import net from 'net';
import { q1, qAll } from '../db';
import { gerarCupomHtml } from '../utils/printTemplates';

function isCanceledOrder(order?: { status?: string | null; cancelado_at?: string | null } | null) {
  return Boolean(order?.cancelado_at) || String(order?.status || '').trim().toLowerCase() === 'cancelado';
}

function getOrderChannel(order: { canal?: string | null }) {
  const canal = String(order.canal || '').trim().toLowerCase();

  if (canal === 'delivery') return 'delivery' as const;
  if (canal === 'mesa') return 'mesa' as const;
  if (canal === 'balcao') return 'balcao' as const;

  return 'generic' as const;
}

function buildKitchenMetadata(order: { canal?: string | null; cliente_nome?: string | null; observation?: string | null }) {
  const metadata: { label: string; value: string }[] = [];
  const channel = getOrderChannel(order);

  if (channel === 'delivery' && order.cliente_nome) {
    metadata.push({ label: 'Cliente', value: order.cliente_nome });
  }

  if (channel === 'mesa') {
    const mesaMatch = String(order.observation || '').match(/mesa\s+(\d+)/i);
    if (mesaMatch) metadata.push({ label: 'Mesa', value: mesaMatch[1] });
  }

  return metadata;
}

function buildEscPos(dados: string, largura = 48): Buffer {
  const ESC = 0x1b;
  const GS = 0x1d;
  const INIT = Buffer.from([ESC, 0x40]);
  const CENTER = Buffer.from([ESC, 0x61, 0x01]);
  const LEFT = Buffer.from([ESC, 0x61, 0x00]);
  const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
  const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
  const CUT = Buffer.from([GS, 0x56, 0x41, 0x10]);
  const parts: Buffer[] = [INIT, CENTER, BOLD_ON, Buffer.from('FlowPDV\n'), BOLD_OFF, LEFT];
  const linhas = dados.split('\n');

  for (const linha of linhas) {
    parts.push(Buffer.from(linha.slice(0, largura) + '\n', 'latin1'));
  }

  parts.push(Buffer.from('\n\n\n'), CUT);
  return Buffer.concat(parts);
}

function enviarParaImpressora(dados: Buffer, ip: string, porta: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout: ${ip}:${porta}`));
    }, 5000);

    socket.connect(porta || 9100, ip, () => {
      socket.write(dados, (err) => {
        clearTimeout(timeout);
        if (err) reject(err);
        else {
          socket.end();
          resolve();
        }
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export function createPrintRouter() {
  const router = Router();

  router.get('/cupom-html/:pedidoId', async (req: Request, res) => {
    try {
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).send('<h1>Pedido nao encontrado</h1>');

      if (pedido.receipt_text && pedido.canal !== 'delivery') {
        return res.send(pedido.receipt_text);
      }

      const cliente = await q1('SELECT nome_estabelecimento FROM clientes WHERE id=?', [req.tenantId]);
      const itens = await qAll(
        `SELECT p.name, ip.quantity, ip.price_at_time
         FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id
         WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const pagamentos = await qAll('SELECT * FROM pagamentos WHERE order_id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      const motoboy = pedido.motoboy_id
        ? await q1('SELECT nome FROM delivery_motoboys WHERE id=?', [pedido.motoboy_id])
        : null;
      const now = new Date(pedido.created_at).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const isDelivery = pedido.canal === 'delivery';
      const isMesa = pedido.canal === 'mesa' || /^\[Fechado\]\s*Mesa\s+\d+/i.test(String(pedido.observation || ''));

      const html = gerarCupomHtml({
        titulo: isDelivery ? 'Pedido delivery' : isMesa ? 'Fechamento de mesa' : 'Recibo',
        estabelecimento: cliente?.nome_estabelecimento,
        orderNumber: pedido.order_number,
        data: now,
        variant: 'receipt',
        canal: isDelivery ? 'delivery' : isMesa ? 'mesa' : 'balcao',
        metadata: [
          { label: 'Status', value: String(pedido.status || 'Concluido') },
          ...(isMesa ? [{ label: 'Operacao', value: 'Atendimento em mesa' }] : []),
        ],
        itens: itens.map((item: any) => ({
          qtd: item.quantity,
          nome: item.name,
          valor: item.price_at_time * item.quantity,
        })),
        totais: [{ label: 'Total', valor: pedido.total_amount, destaque: true }],
        pagamentos: pagamentos.length > 0
          ? pagamentos.map((payment: any) => ({
              metodo: payment.method,
              valor: payment.amount_paid,
              troco: payment.change_given > 0 ? payment.change_given : undefined,
            }))
          : isDelivery && pedido.pagamento_tipo
            ? [{ metodo: pedido.pagamento_tipo, valor: pedido.total_amount }]
            : undefined,
        observacao: pedido.observation?.trim() || undefined,
        ...(isDelivery
          ? {
              cliente_nome: pedido.cliente_nome || undefined,
              cliente_tel: pedido.cliente_tel || undefined,
              endereco: pedido.endereco || undefined,
              pagamento_status:
                pedido.pagamento_status || (pedido.pagamento_tipo === 'pix' || pedido.pagamento_tipo === 'cartao' ? 'pendente' : undefined),
              taxa_entrega: pedido.taxa_entrega || undefined,
              motoboy_nome: motoboy?.nome || undefined,
            }
          : {}),
      });

      res.send(html);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  router.post('/recibo/:pedidoId', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora nao configurada' });

      const cfg = JSON.parse(row.printer_config);
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido nao encontrado' });

      const texto = pedido.receipt_text || `Pedido #${pedido.order_number}\nTotal: R$ ${pedido.total_amount.toFixed(2)}`;
      const dados = buildEscPos(texto, cfg.largura_papel || 48);
      await enviarParaImpressora(dados, cfg.ip, cfg.porta);

      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, message: e.message });
    }
  });

  router.get('/comanda-html/:pedidoId', async (req: Request, res) => {
    try {
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).send('');
      if (isCanceledOrder(pedido)) return res.status(409).send('<h1>Pedido cancelado</h1>');

      const itens = await qAll(
        `SELECT p.name, ip.quantity
         FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id
         WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const now = new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      res.send(
        gerarCupomHtml({
          titulo: 'Comanda de cozinha',
          orderNumber: pedido.order_number,
          data: now,
          variant: 'kitchen-ticket',
          canal: getOrderChannel(pedido),
          metadata: buildKitchenMetadata(pedido),
          itens: itens.map((item: any) => ({ qtd: item.quantity, nome: item.name })),
          observacao: pedido.observation || undefined,
        })
      );
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  router.post('/comanda/:pedidoId', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora nao configurada' });

      const cfg = JSON.parse(row.printer_config);
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido nao encontrado' });
      if (isCanceledOrder(pedido)) return res.status(409).json({ success: false, message: 'Pedido cancelado nao pode gerar comanda' });

      const itens = await qAll(
        `SELECT p.name, ip.quantity
         FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id
         WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const texto =
        `COMANDA #${pedido.order_number}\n` +
        itens.map((item: any) => `${item.quantity}x ${item.name}`).join('\n') +
        (pedido.observation ? `\nObs: ${pedido.observation}` : '');
      const dados = buildEscPos(texto, cfg.largura_papel || 48);
      await enviarParaImpressora(dados, cfg.ip, cfg.porta);

      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, message: e.message });
    }
  });

  router.post('/teste', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora nao configurada' });

      const cfg = JSON.parse(row.printer_config);
      if (!cfg.ip) return res.json({ success: false, message: 'IP nao configurado' });

      const dados = buildEscPos(`TESTE DE IMPRESSAO\nFlowPDV funcionando!\n${new Date().toLocaleString('pt-BR')}`, cfg.largura_papel || 48);
      await enviarParaImpressora(dados, cfg.ip, cfg.porta || 9100);

      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, message: e.message });
    }
  });

  return router;
}
