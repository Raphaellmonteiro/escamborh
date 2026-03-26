// src/routes/print.ts - geracao de cupom + impressao termica
import { Router, Request } from 'express';
import net from 'net';
import { q1, qAll } from '../db';
import { requireAnyPermission } from '../middleware';
import { buildMesaFinanceSnapshot, buildMesaReceiptTotals } from '../utils/mesaFinance';
import { getProfilePaperColumns, getProfilePaperWidthMm } from '../utils/printProfiles';
import { resolveRequiresPreparation } from '../utils/preparation';
import { gerarCupomHtml } from '../utils/printTemplates';

function isCanceledOrder(order?: { status?: string | null; cancelado_at?: string | null } | null) {
  return Boolean(order?.cancelado_at) || String(order?.status || '').trim().toLowerCase() === 'cancelado';
}

function getOrderChannel(order: { canal?: string | null; tipo_retirada?: string | null; observation?: string | null }) {
  const canal = String(order.canal || '').trim().toLowerCase();
  const tipoRetirada = String(order.tipo_retirada || '').trim().toLowerCase();
  const observation = String(order.observation || '');

  if (canal === 'delivery') return 'delivery' as const;
  if (canal === 'mesa') return 'mesa' as const;
  if (canal === 'retirada' || tipoRetirada === 'levar') return 'retirada' as const;
  if (tipoRetirada === 'mesa' || /mesa\s+\d+/i.test(observation)) return 'mesa' as const;
  if (canal === 'balcao') return 'balcao' as const;

  return 'generic' as const;
}

function buildKitchenMetadata(order: { canal?: string | null; cliente_nome?: string | null; observation?: string | null }) {
  const metadata: { label: string; value: string }[] = [];
  const channel = getOrderChannel(order);

  if (channel === 'delivery' && order.cliente_nome) {
    metadata.push({ label: 'Cliente', value: order.cliente_nome });
  }

  if (channel === 'retirada') {
    metadata.push({ label: 'Operacao', value: 'Retirada no local' });
  }

  if (channel === 'mesa' || /mesa\s+\d+/i.test(String(order.observation || ''))) {
    const mesaMatch = String(order.observation || '').match(/mesa\s+(\d+)/i);
    if (mesaMatch) metadata.push({ label: 'Mesa', value: mesaMatch[1] });
  }

  return metadata;
}

async function getKitchenItems(orderId: string | number, tenantId: number) {
  const items = await qAll(
    `SELECT p.name, p.category, p.requires_preparation, p.production_type, ip.quantity, ip.observation
       FROM itens_pedido ip
       JOIN produtos p ON p.id=ip.product_id
       WHERE ip.order_id=? AND ip.tenant_id=?`,
    [orderId, tenantId]
  );

  return items.filter((item: any) =>
    resolveRequiresPreparation({
        name: item.name,
        category: item.category,
        requires_preparation: item.requires_preparation,
        production_type: item.production_type,
      })
    );
  }

function formatPrintDateTime(value?: string | null) {
  const rawValue = String(value || '').trim();
  const date = rawValue ? new Date(rawValue) : new Date();

  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ProofOrderEvent = {
  tipo?: string | null;
  valor?: number | string | null;
  motivo?: string | null;
  estoque_reposto?: number | boolean | null;
  created_at?: string | null;
  payload?: string | Record<string, unknown> | null;
};

function parseEventPayload(payload: ProofOrderEvent['payload']) {
  if (!payload) return null;
  if (typeof payload === 'object') return payload as Record<string, unknown>;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function buildProofHtml(input: {
  order: any;
  items: any[];
  payments: any[];
  clientName?: string | null;
  proofType: 'cancelamento' | 'reembolso';
  event?: ProofOrderEvent | null;
  paperWidthMm: 58 | 80;
}) {
  const { order, items, payments, clientName, proofType, event, paperWidthMm } = input;
  const eventPayload = parseEventPayload(event?.payload);
  const refundStatus = String(
    (eventPayload && eventPayload.reembolso_status) || order.reembolso_status || ''
  )
    .trim()
    .toLowerCase();
  const refundedValue =
    proofType === 'reembolso'
      ? Number(event?.valor ?? order.valor_reembolsado ?? 0)
      : 0;
  const proofDate = formatPrintDateTime(event?.created_at || order.updated_at || order.created_at);
  const title =
    proofType === 'cancelamento'
      ? 'Comprovante de cancelamento'
      : 'Comprovante de reembolso';
  const metadata =
    proofType === 'cancelamento'
      ? [
          { label: 'Operacao', value: 'Cancelamento' },
          { label: 'Status', value: 'Cancelado' },
          {
            label: 'Estoque',
            value: Number(event?.estoque_reposto || order.estoque_reposto || 0) ? 'Reposto' : 'Sem reposicao',
          },
        ]
      : [
          { label: 'Operacao', value: 'Reembolso' },
          {
            label: 'Status',
            value: refundStatus === 'total' ? 'Reembolso total' : 'Reembolso parcial',
          },
          { label: 'Financeiro', value: refundedValue > 0 ? `R$ ${refundedValue.toFixed(2)}` : 'Sem valor' },
        ];
  const totals =
    proofType === 'cancelamento'
      ? [{ label: 'Total original', valor: Number(order.total_amount || 0), destaque: true }]
      : [
          { label: 'Total original', valor: Number(order.total_amount || 0) },
          {
            label: refundStatus === 'total' ? 'Total reembolsado' : 'Valor deste reembolso',
            valor: refundedValue,
            destaque: true,
          },
        ];

  return gerarCupomHtml({
    titulo: title,
    estabelecimento: clientName || undefined,
    orderNumber: order.order_number,
    data: proofDate,
    variant: 'proof',
    canal: getOrderChannel(order),
    metadata,
    paperWidthMm,
    itens: items.map((item: any) => ({
      qtd: Number(item.quantity || 0),
      nome: item.name,
      valor: Number(item.price_at_time || 0) * Number(item.quantity || 0),
    })),
    totais: totals,
    pagamentos: payments.length
      ? payments.map((payment: any) => ({
          metodo: payment.method,
          valor: Number(payment.amount_paid || 0),
          troco: Number(payment.change_given || 0) > 0 ? Number(payment.change_given || 0) : undefined,
        }))
      : undefined,
    observacao:
      String(event?.motivo || '').trim() ||
      (proofType === 'cancelamento'
        ? String(order.cancelamento_motivo || '').trim()
        : String(order.reembolso_motivo || '').trim()) ||
      undefined,
  });
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

      const cliente = await q1('SELECT nome_estabelecimento, printer_config FROM clientes WHERE id=?', [req.tenantId]);
      const itens = await qAll(
        `SELECT p.name, ip.quantity, ip.price_at_time, ip.observation
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
      const mesaSnapshot = isMesa
        ? buildMesaFinanceSnapshot(
            pedido,
            Number(
              pedido.subtotal ||
                itens.reduce(
                  (acc: number, item: any) =>
                    acc + Number(item.price_at_time || 0) * Number(item.quantity || 0),
                  0
                )
            ),
            {
              valor_taxa_servico: pedido.valor_taxa_servico,
              valor_couvert: pedido.valor_couvert,
              total_extras: pedido.total_extras,
              total_amount: pedido.total_amount,
            }
          )
        : null;

      const html = gerarCupomHtml({
        titulo: isDelivery ? 'Pedido delivery' : isMesa ? 'Fechamento de mesa' : 'Recibo',
        estabelecimento: cliente?.nome_estabelecimento,
        orderNumber: pedido.order_number,
        data: now,
        variant: 'receipt',
        canal: getOrderChannel(pedido),
        paperWidthMm: getProfilePaperWidthMm(cliente?.printer_config, 'caixa'),
        metadata: [
          { label: 'Status', value: String(pedido.status || 'Concluido') },
          ...(isMesa ? [{ label: 'Operacao', value: 'Atendimento em mesa' }] : []),
        ],
        itens: itens.map((item: any) => ({
          qtd: item.quantity,
          nome: item.name,
          valor: item.price_at_time * item.quantity,
          obs: String(item.observation || '').trim() || undefined,
        })),
        totais: isMesa
          ? buildMesaReceiptTotals(mesaSnapshot!)
          : [{ label: 'Total', valor: pedido.total_amount, destaque: true }],
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

  router.get('/comprovante-html/:pedidoId', async (req: Request, res) => {
    try {
      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).send('<h1>Pedido nao encontrado</h1>');

      const requestedType = String(req.query.tipo || '').trim().toLowerCase();
      const proofType =
        requestedType === 'cancelamento' || requestedType === 'reembolso'
          ? (requestedType as 'cancelamento' | 'reembolso')
          : isCanceledOrder(pedido)
            ? 'cancelamento'
            : String(pedido.reembolso_status || '').trim().toLowerCase() === 'parcial' ||
                String(pedido.reembolso_status || '').trim().toLowerCase() === 'total'
              ? 'reembolso'
              : null;

      if (!proofType) {
        return res.status(404).send('<h1>Nenhum comprovante disponivel</h1>');
      }

      const cliente = await q1('SELECT nome_estabelecimento, printer_config FROM clientes WHERE id=?', [req.tenantId]);
      const itens = await qAll(
        `SELECT p.name, ip.quantity, ip.price_at_time, ip.observation
         FROM itens_pedido ip
         JOIN produtos p ON p.id=ip.product_id
         WHERE ip.order_id=? AND ip.tenant_id=?`,
        [req.params.pedidoId, req.tenantId]
      );
      const pagamentos = await qAll('SELECT * FROM pagamentos WHERE order_id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      const eventType = proofType === 'cancelamento' ? 'CANCELAMENTO' : 'REEMBOLSO';
      const latestEvent = await q1(
        `SELECT tipo, valor, motivo, estoque_reposto, payload, created_at
         FROM pedido_eventos
         WHERE pedido_id=? AND tenant_id=? AND tipo=?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [req.params.pedidoId, req.tenantId, eventType]
      );

      res.send(
        buildProofHtml({
          order: pedido,
          items: itens,
          payments: pagamentos,
          clientName: cliente?.nome_estabelecimento,
          proofType,
          event: latestEvent,
          paperWidthMm: getProfilePaperWidthMm(cliente?.printer_config, 'caixa'),
        })
      );
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  router.post('/recibo/:pedidoId', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora nao configurada' });

      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido nao encontrado' });

      const texto = pedido.receipt_text || `Pedido #${pedido.order_number}\nTotal: R$ ${pedido.total_amount.toFixed(2)}`;
      const cfg = JSON.parse(row.printer_config);
      const dados = buildEscPos(texto, getProfilePaperColumns(cfg, 'caixa'));
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
      const cliente = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);

      const itens = await getKitchenItems(req.params.pedidoId, req.tenantId);
      if (itens.length === 0) return res.send('<h1>Nenhum item de preparo neste pedido.</h1>');
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
          paperWidthMm: getProfilePaperWidthMm(cliente?.printer_config, 'cozinha'),
          metadata: buildKitchenMetadata(pedido),
          itens: itens.map((item: any) => ({
            qtd: item.quantity,
            nome: item.name,
            obs: String(item.observation || '').trim() || undefined,
          })),
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

      const pedido = await q1('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, req.tenantId]);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido nao encontrado' });
      if (isCanceledOrder(pedido)) return res.status(409).json({ success: false, message: 'Pedido cancelado nao pode gerar comanda' });

      const itens = await getKitchenItems(req.params.pedidoId, req.tenantId);
      if (itens.length === 0) {
        return res.json({ success: false, message: 'Pedido sem itens de preparo para a cozinha' });
      }
      const texto =
        `COMANDA #${pedido.order_number}\n` +
        itens
          .map((item: any) => {
            const linha = `${item.quantity}x ${item.name}`;
            const obsItem = String(item.observation || '').trim();
            return obsItem ? `${linha}\n   ${obsItem}` : linha;
          })
          .join('\n') +
        (pedido.observation ? `\nObs: ${pedido.observation}` : '');
      const cfg = JSON.parse(row.printer_config);
      const dados = buildEscPos(texto, getProfilePaperColumns(cfg, 'cozinha'));
      await enviarParaImpressora(dados, cfg.ip, cfg.porta);

      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, message: e.message });
    }
  });

  router.post('/teste', requireAnyPermission('configuracoes'), async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      if (!row?.printer_config) return res.json({ success: false, message: 'Impressora nao configurada' });

      const cfg = JSON.parse(row.printer_config);
      if (!cfg.ip) return res.json({ success: false, message: 'IP nao configurado' });

      const dados = buildEscPos(
        `TESTE DE IMPRESSAO\nFlowPDV funcionando!\n${new Date().toLocaleString('pt-BR')}`,
        getProfilePaperColumns(cfg, 'caixa')
      );
      await enviarParaImpressora(dados, cfg.ip, cfg.porta || 9100);

      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, message: e.message });
    }
  });

  return router;
}
