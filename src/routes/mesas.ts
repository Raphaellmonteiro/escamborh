// src/routes/mesas.ts â€” mesas, comandas e sincronizaÃ§Ã£o KDS
import { Router, Request } from 'express';
import { q1, qAll, qRun, qInsert, withTx, txQ1, txQAll, txRun, txInsert } from '../db';
import { pool } from '../db/pool';
import { requireProductInventoryTargets } from '../services/stockIdentification';
import { isAppError } from '../utils/errors';
import { logError } from '../utils/logger';
import {
  buildMesaComandaPayload as buildMesaComandaPayloadShared,
  buildMesaFinanceSnapshot as buildMesaFinanceSnapshotShared,
  buildMesaReceiptTotals as buildMesaReceiptTotalsShared,
  normalizeComandaExtras as normalizeComandaExtrasShared,
} from '../utils/mesaFinance';
import { getProfilePaperWidthMm } from '../utils/printProfiles';
import { gerarCupomHtml } from '../utils/printTemplates';

const TZ = 'America/Sao_Paulo';

type ComandaExtrasInput = import('../utils/mesaFinance').ComandaExtrasInput;
type MesaFinanceSnapshot = import('../utils/mesaFinance').MesaFinanceSnapshot;
type ComandaTotals = Omit<MesaFinanceSnapshot, 'subtotal'>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'nÃ£o', 'no', 'off'].includes(normalized)) return false;

  return fallback;
}

function formatPercentLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

function normalizeComandaExtras(input: ComandaExtrasInput = {}) {
  return {
    taxa_servico_ativa: toFlag(input.taxa_servico_ativa, true) ? 1 : 0,
    taxa_servico_percentual: Math.max(0, toNumber(input.taxa_servico_percentual, 10)),
    couvert_ativo: toFlag(input.couvert_ativo, false) ? 1 : 0,
    couvert_valor_unitario: Math.max(0, toNumber(input.couvert_valor_unitario, 15)),
    couvert_quantidade_pessoas: Math.max(1, Math.round(toNumber(input.couvert_quantidade_pessoas, 1))),
  };
}

function buildComandaTotals(comanda: ComandaExtrasInput | null | undefined, subtotal: number): ComandaTotals {
  const extrasConfig = normalizeComandaExtras(comanda || {});
  const percentualLabel = formatPercentLabel(extrasConfig.taxa_servico_percentual);
  const valorTaxaServico = extrasConfig.taxa_servico_ativa
    ? subtotal * (extrasConfig.taxa_servico_percentual / 100)
    : 0;
  const valorCouvert = extrasConfig.couvert_ativo
    ? extrasConfig.couvert_valor_unitario * extrasConfig.couvert_quantidade_pessoas
    : 0;
  const extras = [];

  if (valorTaxaServico > 0) {
    extras.push({
      name: `Taxa de ServiÃ§o (${percentualLabel}%)`,
      value: valorTaxaServico,
    });
  }

  if (valorCouvert > 0) {
    extras.push({
      name: `Couvert ArtÃ­stico (${extrasConfig.couvert_quantidade_pessoas} pessoa${extrasConfig.couvert_quantidade_pessoas > 1 ? 's' : ''})`,
      value: valorCouvert,
    });
  }

  return {
    taxaServicoAtiva: extrasConfig.taxa_servico_ativa === 1,
    taxaServicoPercentual: extrasConfig.taxa_servico_percentual,
    couvertAtivo: extrasConfig.couvert_ativo === 1,
    couvertValorUnitario: extrasConfig.couvert_valor_unitario,
    couvertQuantidadePessoas: extrasConfig.couvert_quantidade_pessoas,
    valorTaxaServico,
    valorCouvert,
    totalExtras: valorTaxaServico + valorCouvert,
    total: subtotal + valorTaxaServico + valorCouvert,
    extras,
  };
}

function buildMesaFinanceSnapshot(
  comanda: ComandaExtrasInput | null | undefined,
  subtotal: number
): MesaFinanceSnapshot {
  return {
    subtotal,
    ...buildComandaTotals(comanda, subtotal),
  };
}

function buildMesaReceiptTotals(snapshot: MesaFinanceSnapshot) {
  return [
    ...(snapshot.total !== snapshot.subtotal ? [{ label: 'Subtotal', valor: snapshot.subtotal }] : []),
    ...snapshot.extras.map((extra) => ({ label: extra.name, valor: extra.value })),
    { label: 'Total', valor: snapshot.total, destaque: true },
  ];
}

function buildMesaComandaPayload(comanda: any, itens: any[]) {
  const normalizedItems = itens.map((item: any) => ({
    ...item,
    quantity: Number(item.quantity || 0),
    price_at_time: Number(item.price_at_time || 0),
  }));
  const subtotal = normalizedItems.reduce(
    (acc: number, item: any) => acc + Number(item.quantity) * Number(item.price_at_time),
    0
  );
  const totals = buildMesaFinanceSnapshot(comanda, subtotal);

  return {
    ...comanda,
    taxa_servico_ativa: totals.taxaServicoAtiva ? 1 : 0,
    taxa_servico_percentual: totals.taxaServicoPercentual,
    couvert_ativo: totals.couvertAtivo ? 1 : 0,
    couvert_valor_unitario: totals.couvertValorUnitario,
    couvert_quantidade_pessoas: totals.couvertQuantidadePessoas,
    subtotal,
    valor_taxa_servico: totals.valorTaxaServico,
    valor_couvert: totals.valorCouvert,
    total_extras: totals.totalExtras,
    total_com_extras: totals.total,
    itens: normalizedItems,
  };
}

function buildActiveKdsOrderClause(alias?: string) {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}cancelado_at IS NULL AND COALESCE(${prefix}status,'') NOT IN ('Entregue','cancelado','Cancelado','ConcluÃƒÂ­do','Concluido','concluido')`;
}

// â”€â”€ Helper: baixa/estorno de estoque por produto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildOperationalKdsOrderClause(alias?: string) {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}cancelado_at IS NULL AND LOWER(COALESCE(${prefix}status,'')) <> 'entregue' AND LOWER(COALESCE(${prefix}status,'')) <> 'cancelado' AND LOWER(COALESCE(${prefix}status,'')) NOT LIKE 'conclu%'`;
}

function handleMesasRouteError(res: any, error: unknown, context: string, meta: Record<string, unknown> = {}) {
  logError(context, error, meta);

  if (isAppError(error)) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }

  const message = error instanceof Error ? error.message : 'Erro interno no servidor';
  return res.status(500).json({ success: false, error: message });
}

async function ajustarEstoque(tenantId: number, productId: number, qtd: number, motivo: string) {
  const prod = await q1('SELECT * FROM produtos WHERE id=? AND tenant_id=?', [productId, tenantId]);
  if (!prod) return;
  const tipo = qtd > 0 ? 'saida' : 'entrada';
  const abs  = Math.abs(qtd);
  const resolution = await requireProductInventoryTargets({
    client: pool,
    tenantId,
    productId,
    context: 'mesas.ajustarEstoque',
    direction: tipo,
  });
  for (const target of resolution.targets) {
    const total = Number(target.quantityMultiplier) * abs;
    if (tipo === 'saida') await qRun('UPDATE ingredientes SET estoque_atual=GREATEST(0,estoque_atual-?) WHERE id=? AND tenant_id=?', [total, target.ingredientId, tenantId]);
    else await qRun('UPDATE ingredientes SET estoque_atual=estoque_atual+? WHERE id=? AND tenant_id=?', [total, target.ingredientId, tenantId]);
    await qRun('INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id) VALUES (?,?,?,?,?)', [target.ingredientId, tipo, total, motivo, tenantId]);
  }
}

// â”€â”€ Sincroniza item entre comanda e pedido KDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function syncKdsItem(tenantId: number, mesaId: string|number, productId: number, diffQtd: number, priceAtTime: number, mode: 'add'|'remove') {
  try {
    const NO_PREP = ['bebida','refrigerante','suco','cerveja','chopp','Ã¡gua','agua','energetico','drink','vinho','licor','whisky','dose','balde','ice'];
    const produto = await q1('SELECT * FROM produtos WHERE id=? AND tenant_id=?', [productId, tenantId]);
    const cat = (produto?.category||'').toLowerCase();
    const needsPrep = cat==='' ? true : !NO_PREP.some((kw: string) => cat.includes(kw));
    if (!needsPrep) return;
    const mesa = await q1('SELECT numero FROM mesas WHERE id=? AND tenant_id=?', [mesaId, tenantId]);
    if (!mesa) return;
    const mesaLabel = `Mesa ${mesa.numero}`;
    let kdsOrder = await q1(`SELECT * FROM pedidos WHERE tenant_id=? AND observation=? AND ${buildOperationalKdsOrderClause()} ORDER BY id DESC LIMIT 1`, [tenantId, mesaLabel]);
    if (!kdsOrder && mode==='remove') return;
    if (!kdsOrder) {
      // CORREÃ‡ÃƒO: Data baseada no fuso de SP para o order_number do KDS
      const dateObj = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const y = String(dateObj.getFullYear()).slice(-2);
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${y}${m}${d}`;
      
      const maxOrd = await q1('SELECT MAX(id) as maxId FROM pedidos WHERE tenant_id=?', [tenantId]);
      const on = `${dateStr}-${tenantId}-KDS-${((maxOrd?.maxId||0)+1).toString().padStart(4,'0')}-${Date.now()}`;
      const newId = await qInsert("INSERT INTO pedidos (order_number,total_amount,observation,tenant_id,senha_pedido,tipo_retirada,canal,status) VALUES (?,?,?,?,?,'mesa','mesa','Criado')", [on, priceAtTime*Math.abs(diffQtd), mesaLabel, tenantId, mesa.numero]);
      await qRun("INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,'Mesa',?,?)", [newId, productId, Math.abs(diffQtd), priceAtTime, tenantId]);
      return;
    }
    const existing = await q1('SELECT * FROM itens_pedido WHERE order_id=? AND product_id=? AND tenant_id=?', [kdsOrder.id, productId, tenantId]);
    if (existing) {
      const nq = Number(existing.quantity)+diffQtd;
      if (nq<=0) {
        await qRun('DELETE FROM itens_pedido WHERE id=? AND tenant_id=?', [existing.id, tenantId]);
        const rem = await q1('SELECT COUNT(*) as c FROM itens_pedido WHERE order_id=? AND tenant_id=?', [kdsOrder.id, tenantId]);
        if (Number(rem?.c||0)===0) await qRun("UPDATE pedidos SET status='Entregue' WHERE id=? AND tenant_id=?", [kdsOrder.id, tenantId]);
      } else {
        await qRun('UPDATE itens_pedido SET quantity=? WHERE id=? AND tenant_id=?', [nq, existing.id, tenantId]);
      }
    } else if (diffQtd>0) {
      await qRun("INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,'Mesa',?,?)", [kdsOrder.id, productId, diffQtd, priceAtTime, tenantId]);
    }
    await qRun('UPDATE pedidos SET total_amount=total_amount+? WHERE id=? AND tenant_id=?', [priceAtTime*diffQtd, kdsOrder.id, tenantId]);
  } catch (e: any) { console.error('[KDS] syncKdsItem error:', e.message); }
}

export function createMesasRouter() {
  const router = Router();

  router.get('/', async (req: Request, res) => {
    try {
      const rows = await qAll(`
        SELECT m.*,
          (SELECT id FROM comandas WHERE mesa_id=m.id AND status='aberta' AND tenant_id=m.tenant_id LIMIT 1) as comanda_id,
          COALESCE((SELECT COUNT(*) FROM itens_comanda ic JOIN comandas c ON ic.comanda_id=c.id WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id),0) as total_itens,
          COALESCE((SELECT SUM(ic.quantity*ic.price_at_time) FROM itens_comanda ic JOIN comandas c ON ic.comanda_id=c.id WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id),0) as subtotal_valor,
          COALESCE((SELECT c.taxa_servico_ativa FROM comandas c WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id ORDER BY c.created_at DESC LIMIT 1),1) as taxa_servico_ativa,
          COALESCE((SELECT c.taxa_servico_percentual FROM comandas c WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id ORDER BY c.created_at DESC LIMIT 1),10) as taxa_servico_percentual,
          COALESCE((SELECT c.couvert_ativo FROM comandas c WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id ORDER BY c.created_at DESC LIMIT 1),0) as couvert_ativo,
          COALESCE((SELECT c.couvert_valor_unitario FROM comandas c WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id ORDER BY c.created_at DESC LIMIT 1),15) as couvert_valor_unitario,
          COALESCE((SELECT c.couvert_quantidade_pessoas FROM comandas c WHERE c.mesa_id=m.id AND c.status='aberta' AND c.tenant_id=m.tenant_id ORDER BY c.created_at DESC LIMIT 1),1) as couvert_quantidade_pessoas
        FROM mesas m WHERE m.tenant_id=? ORDER BY m.numero ASC
      `, [req.tenantId]);
      
      // CORREÃ‡ÃƒO: Converte valores de COUNT e SUM para Number
      res.json(rows.map((m: any) => {
        const subtotal = Number(m.subtotal_valor || 0);
        const totals = buildMesaFinanceSnapshotShared(m, subtotal);

        return {
          ...m,
          total_itens: Number(m.total_itens || 0),
          subtotal_valor: subtotal,
          valor_taxa_servico: totals.valorTaxaServico,
          valor_couvert: totals.valorCouvert,
          total_extras: totals.totalExtras,
          total_valor: totals.total
        };
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/configurar', async (req: Request, res) => {
    try {
      const { quantidade } = req.body;
      if (!quantidade||quantidade<1||quantidade>200) return res.status(400).json({ success:false, message:'Quantidade deve ser entre 1 e 200' });
      const existing = await qAll('SELECT numero FROM mesas WHERE tenant_id=? ORDER BY numero ASC', [req.tenantId]);
      const currentMax = existing.length>0 ? Math.max(...existing.map((m:any)=>m.numero)) : 0;
      if (quantidade>currentMax) {
        for (let i=currentMax+1; i<=quantidade; i++) {
          await qRun("INSERT INTO mesas (numero,tenant_id,status) VALUES (?,?,'fechada') ON CONFLICT(numero,tenant_id) DO NOTHING", [i, req.tenantId]);
        }
      } else {
        for (let i=currentMax; i>quantidade; i--) {
          const m = await q1("SELECT * FROM mesas WHERE numero=? AND tenant_id=? AND status='fechada'", [i, req.tenantId]);
          if (m) await qRun('DELETE FROM mesas WHERE id=? AND tenant_id=?', [m.id, req.tenantId]);
        }
      }
      res.json({ success:true, total:quantidade });
    } catch (e: any) { res.status(500).json({ success:false, error:e.message }); }
  });

  router.delete('/comanda/item/:itemId', async (req: Request, res) => {
    try {
      const item = await q1('SELECT ic.*, c.mesa_id FROM itens_comanda ic JOIN comandas c ON c.id=ic.comanda_id WHERE ic.id=? AND ic.tenant_id=?', [req.params.itemId, req.tenantId]);
      await qRun('DELETE FROM itens_comanda WHERE id=? AND tenant_id=?', [req.params.itemId, req.tenantId]);
      if (item) {
        await ajustarEstoque(req.tenantId, item.product_id, -Number(item.quantity), 'Estorno Mesa');
        await syncKdsItem(req.tenantId, String(item.mesa_id), item.product_id, -(Number(item.quantity)), item.price_at_time, 'remove');
      }
      res.json({ success:true });
    } catch (e: any) {
      return handleMesasRouteError(res, e, 'mesas.deleteComandaItem', {
        tenantId: req.tenantId,
        itemId: req.params.itemId,
      });
    }
  });

  router.put('/comanda/item/:itemId', async (req: Request, res) => {
    try {
      const { quantity } = req.body;
      const novaQtd = Number(quantity)||0;
      const itemAtual = await q1('SELECT * FROM itens_comanda WHERE id=? AND tenant_id=?', [req.params.itemId, req.tenantId]);
      if (!itemAtual) return res.status(404).json({ success:false, message:'Item nÃ£o encontrado' });
      const qtdAnt = Number(itemAtual.quantity)||0;
      const diff = novaQtd-qtdAnt;
      const cmd = await q1('SELECT c.mesa_id FROM comandas c JOIN itens_comanda ic ON ic.comanda_id=c.id WHERE ic.id=? AND ic.tenant_id=?', [req.params.itemId, req.tenantId]);
      if (novaQtd<=0) {
        await qRun('DELETE FROM itens_comanda WHERE id=? AND tenant_id=?', [req.params.itemId, req.tenantId]);
        await ajustarEstoque(req.tenantId, itemAtual.product_id, -qtdAnt, 'Estorno Mesa');
        if (cmd) await syncKdsItem(req.tenantId, String(cmd.mesa_id), itemAtual.product_id, -qtdAnt, itemAtual.price_at_time, 'remove');
      } else {
        await qRun('UPDATE itens_comanda SET quantity=? WHERE id=? AND tenant_id=?', [novaQtd, req.params.itemId, req.tenantId]);
        if (diff !== 0) await ajustarEstoque(req.tenantId, itemAtual.product_id, diff, diff > 0 ? 'Venda Mesa' : 'Estorno Mesa');
        if (cmd&&diff!==0) await syncKdsItem(req.tenantId, String(cmd.mesa_id), itemAtual.product_id, diff, itemAtual.price_at_time, diff>0?'add':'remove');
      }
      res.json({ success:true });
    } catch (e: any) {
      return handleMesasRouteError(res, e, 'mesas.updateComandaItem', {
        tenantId: req.tenantId,
        itemId: req.params.itemId,
      });
    }
  });

  router.put('/:id/abrir', async (req: Request, res) => {
    try {
      const mesa = await q1('SELECT * FROM mesas WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!mesa) return res.status(404).json({ success:false, message:'Mesa nÃ£o encontrada' });
      if (mesa.status==='aberta') return res.json({ success:true, message:'Mesa jÃ¡ estava aberta' });
      await withTx(async (client) => {
        await txRun(client, "UPDATE mesas SET status='aberta', opened_at=NOW() WHERE id=? AND tenant_id=?", [req.params.id, req.tenantId]);
        await txRun(client, "INSERT INTO comandas (mesa_id,tenant_id,status) VALUES (?,?,'aberta')", [req.params.id, req.tenantId]);
      });
      res.json({ success:true });
    } catch (e: any) { res.status(500).json({ success:false, error:e.message }); }
  });

  router.put('/:id/fechar', async (req: Request, res) => {
    try {
      await withTx(async (client) => {
        await txRun(client, "UPDATE comandas SET status='fechada', closed_at=NOW() WHERE mesa_id=? AND status='aberta' AND tenant_id=?", [req.params.id, req.tenantId]);
        await txRun(client, "UPDATE mesas SET status='fechada', opened_at=NULL WHERE id=? AND tenant_id=?", [req.params.id, req.tenantId]);
      });
      res.json({ success:true });
    } catch (e: any) { res.status(500).json({ success:false, error:e.message }); }
  });

  router.get('/:id/comanda', async (req: Request, res) => {
    try {
      const comanda = await q1("SELECT * FROM comandas WHERE mesa_id=? AND status='aberta' AND tenant_id=? ORDER BY created_at DESC LIMIT 1", [req.params.id, req.tenantId]);
      if (!comanda) return res.json({ comanda:null, itens:[] });
      const itens = await qAll('SELECT ic.* FROM itens_comanda ic WHERE ic.comanda_id=? AND ic.tenant_id=? ORDER BY ic.created_at ASC', [comanda.id, req.tenantId]);
      
      // CORREÃ‡ÃƒO: Converte quantidades e preÃ§os de cada item para Number
      const payload = buildMesaComandaPayloadShared(comanda, itens);

      res.json({
        comanda: { ...payload, itens: undefined },
        itens: payload.itens
      });
    } catch (e: any) { res.status(500).json({ error:e.message }); }
  });

  router.put('/:id/comanda/extras', async (req: Request, res) => {
    try {
      const comanda = await q1(
        "SELECT * FROM comandas WHERE mesa_id=? AND status='aberta' AND tenant_id=? ORDER BY created_at DESC LIMIT 1",
        [req.params.id, req.tenantId]
      );
      if (!comanda) return res.status(404).json({ success:false, message:'Nenhuma comanda aberta para esta mesa' });

      const extras = normalizeComandaExtrasShared(req.body || {});
      await qRun(
        `UPDATE comandas
         SET taxa_servico_ativa=?,
             taxa_servico_percentual=?,
             couvert_ativo=?,
             couvert_valor_unitario=?,
             couvert_quantidade_pessoas=?
         WHERE id=? AND tenant_id=?`,
        [
          extras.taxa_servico_ativa,
          extras.taxa_servico_percentual,
          extras.couvert_ativo,
          extras.couvert_valor_unitario,
          extras.couvert_quantidade_pessoas,
          comanda.id,
          req.tenantId
        ]
      );

      const itens = await qAll(
        'SELECT ic.* FROM itens_comanda ic WHERE ic.comanda_id=? AND ic.tenant_id=? ORDER BY ic.created_at ASC',
        [comanda.id, req.tenantId]
      );
      const payload = buildMesaComandaPayloadShared({ ...comanda, ...extras }, itens);

      res.json({
        success:true,
        comanda: { ...payload, itens: undefined },
        itens: payload.itens
      });
    } catch (e: any) { res.status(500).json({ success:false, error:e.message }); }
  });

  router.get('/:id/comanda-html', async (req: Request, res) => {
    try {
      const mesa = await q1('SELECT id, numero, status FROM mesas WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!mesa) return res.status(404).send('<h1>Mesa nao encontrada</h1>');

      const comanda = await q1(
        "SELECT * FROM comandas WHERE mesa_id=? AND status='aberta' AND tenant_id=? ORDER BY created_at DESC LIMIT 1",
        [req.params.id, req.tenantId]
      );
      if (!comanda) return res.status(404).send('<h1>Nenhuma comanda aberta</h1>');

      const itens = await qAll(
        'SELECT ic.* FROM itens_comanda ic WHERE ic.comanda_id=? AND ic.tenant_id=? ORDER BY ic.created_at ASC',
        [comanda.id, req.tenantId]
      );
      if (!itens.length) return res.status(404).send('<h1>Comanda vazia</h1>');

      const subtotal = itens.reduce((acc:number, item:any) => acc + Number(item.quantity) * Number(item.price_at_time), 0);
      const totals = buildMesaFinanceSnapshotShared(comanda, subtotal);
      const rawCreatedAt = String(comanda.created_at || '');
      const createdAt = new Date(rawCreatedAt.includes('Z') ? rawCreatedAt : `${rawCreatedAt}-03:00`);
      const openedAt = createdAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TZ,
      });
      const now = new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TZ,
      });
      const cliente = await q1('SELECT nome_estabelecimento, printer_config FROM clientes WHERE id=?', [req.tenantId]);

      res.send(gerarCupomHtml({
        titulo:`Mesa ${mesa.numero}`,
        estabelecimento:cliente?.nome_estabelecimento || undefined,
        orderNumber:`Mesa-${mesa.numero}`,
        data:now,
        variant:'table-slip',
        canal:'mesa',
        metadata:[
          { label:'Mesa', value:String(mesa.numero) },
          { label:'Abertura', value:openedAt },
          { label:'Status', value:String(mesa.status || 'aberta') },
        ],
        paperWidthMm:getProfilePaperWidthMm(cliente?.printer_config, 'mesa'),
        itens:itens.map((item:any)=>({
          qtd:Number(item.quantity),
          nome:item.product_name,
          valor:Number(item.quantity) * Number(item.price_at_time),
        })),
        totais:[
          ...buildMesaReceiptTotalsShared(totals).map((total) => ({
            ...total,
            label: total.destaque ? 'Total da mesa' : total.label,
          }))
        ],
      }));
    } catch (e: any) { res.status(500).send(e.message); }
  });

  router.post('/:id/comanda/adicionar', async (req: Request, res) => {
    try {
      const { product_id, product_name, quantity, price_at_time } = req.body;
      if (!product_id||!product_name||!price_at_time) return res.status(400).json({ success:false, message:'Campos obrigatÃ³rios faltando' });
      let comanda = await q1("SELECT * FROM comandas WHERE mesa_id=? AND status='aberta' AND tenant_id=? LIMIT 1", [req.params.id, req.tenantId]);
      if (!comanda) {
        await qRun("UPDATE mesas SET status='aberta', opened_at=NOW() WHERE id=? AND tenant_id=?", [req.params.id, req.tenantId]);
        const cid = await qInsert("INSERT INTO comandas (mesa_id,tenant_id,status) VALUES (?,?,'aberta')", [req.params.id, req.tenantId]);
        comanda = await q1('SELECT * FROM comandas WHERE id=?', [cid]);
      }
      const qtd = Number(quantity)||1;
      const ex = await q1('SELECT * FROM itens_comanda WHERE comanda_id=? AND product_id=? AND tenant_id=?', [comanda.id, product_id, req.tenantId]);
      if (ex) await qRun('UPDATE itens_comanda SET quantity=quantity+? WHERE id=? AND tenant_id=?', [qtd, ex.id, req.tenantId]);
      else await qInsert('INSERT INTO itens_comanda (comanda_id,product_id,product_name,quantity,price_at_time,tenant_id) VALUES (?,?,?,?,?,?)', [comanda.id, product_id, product_name, qtd, price_at_time, req.tenantId]);
      await ajustarEstoque(req.tenantId, Number(product_id), qtd, 'Venda Mesa');
      await syncKdsItem(req.tenantId, req.params.id, product_id, qtd, price_at_time, 'add');
      res.json({ success:true, comanda_id:comanda.id });
    } catch (e: any) {
      return handleMesasRouteError(res, e, 'mesas.addComandaItem', {
        tenantId: req.tenantId,
        mesaId: req.params.id,
        productId: req.body?.product_id,
      });
    }
  });

  router.post('/:id/comanda/finalizar', async (req: Request, res) => {
    try {
      const payments = Array.isArray(req.body?.payments) ? req.body.payments : [];
      const observation = String(req.body?.observation || '').trim();
      const requestedExtras = req.body?.extras ? normalizeComandaExtrasShared(req.body.extras) : null;
      const cli = await q1('SELECT nome_estabelecimento, printer_config FROM clientes WHERE id=?', [req.tenantId]);

      const result = await withTx(async (client) => {
        const mesa = await txQ1(
          client,
          'SELECT id, numero FROM mesas WHERE id=? AND tenant_id=? FOR UPDATE',
          [req.params.id, req.tenantId]
        );
        if (!mesa) return { status: 404, body: { success:false, message:'Mesa não encontrada' } };

        const openComanda = await txQ1(
          client,
          "SELECT * FROM comandas WHERE mesa_id=? AND status='aberta' AND tenant_id=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
          [req.params.id, req.tenantId]
        );
        if (!openComanda) {
          return { status: 404, body: { success:false, message:'Nenhuma comanda aberta para esta mesa' } };
        }

        const itens = await txQAll(
          client,
          'SELECT * FROM itens_comanda WHERE comanda_id=? AND tenant_id=? ORDER BY created_at ASC',
          [openComanda.id, req.tenantId]
        );
        if (!itens.length) return { status: 400, body: { success:false, message:'Comanda vazia' } };

        const effectiveComanda = requestedExtras ? { ...openComanda, ...requestedExtras } : openComanda;
        const subtotal = itens.reduce(
          (acc:number, item:any) => acc + Number(item.quantity) * Number(item.price_at_time),
          0
        );
        const snapshot = buildMesaFinanceSnapshotShared(effectiveComanda, subtotal);
        const normalizedPayments = payments
          .map((payment: any) => ({
            method: String(payment?.method || '').trim() || 'Dinheiro',
            amount_paid: Number(payment?.amount_paid || 0),
          }))
          .filter((payment) => payment.amount_paid > 0);

        if (!normalizedPayments.length) {
          return { status: 400, body: { success:false, message:'Informe ao menos um pagamento' } };
        }

        const totalPago = normalizedPayments.reduce((acc:number, payment) => acc + payment.amount_paid, 0);
        if (totalPago < snapshot.total - 0.01) {
          return { status: 400, body: { success:false, message:'Pagamento insuficiente' } };
        }

        const troco = Math.max(0, totalPago - snapshot.total);
        const orderNumber = `M${mesa.numero}-${Date.now()}`;
        const now = new Date().toLocaleString('pt-BR', {
          day:'2-digit',
          month:'2-digit',
          year:'2-digit',
          hour:'2-digit',
          minute:'2-digit'
        });
        const receiptHtml = gerarCupomHtml({
          titulo:`Mesa ${mesa.numero}`,
          estabelecimento:cli?.nome_estabelecimento,
          orderNumber,
          data:now,
          variant:'receipt',
          canal:'mesa',
          metadata:[
            { label:'Mesa', value:String(mesa.numero) },
            { label:'Operacao', value:'Fechamento de comanda' }
          ],
          paperWidthMm:getProfilePaperWidthMm(cli?.printer_config, 'caixa'),
          itens:itens.map((item:any)=>({
            qtd:Number(item.quantity),
            nome:item.product_name,
            valor:Number(item.quantity) * Number(item.price_at_time)
          })),
          totais:buildMesaReceiptTotalsShared(snapshot),
          pagamentos:normalizedPayments.map((payment, index)=>({
            metodo:payment.method,
            valor:payment.amount_paid,
            troco:index===normalizedPayments.length-1 && troco>0 ? troco : undefined
          })),
          observacao:observation || undefined,
        });
        const finalObservation = observation || `[Fechado] Mesa ${mesa.numero} - ${orderNumber}`;

        const pedidoId = await txInsert(
          client,
          `INSERT INTO pedidos (
             order_number,status,total_amount,observation,receipt_text,tenant_id,canal,tipo_retirada,
             mesa_id,comanda_id,subtotal,taxa_servico_ativa,taxa_servico_percentual,valor_taxa_servico,
             couvert_ativo,couvert_valor_unitario,couvert_quantidade_pessoas,valor_couvert,total_extras
           ) VALUES (
             ?,'Concluido',?,?,?,?,?,?,?,
             ?,?,?,?,?,?,?,?,?,?,?
           )`,
          [
            orderNumber,
            snapshot.total,
            finalObservation,
            receiptHtml,
            req.tenantId,
            'mesa',
            'mesa',
            mesa.id,
            openComanda.id,
            snapshot.subtotal,
            snapshot.taxaServicoAtiva ? 1 : 0,
            snapshot.taxaServicoPercentual,
            snapshot.valorTaxaServico,
            snapshot.couvertAtivo ? 1 : 0,
            snapshot.couvertValorUnitario,
            snapshot.couvertQuantidadePessoas,
            snapshot.valorCouvert,
            snapshot.totalExtras,
          ]
        );

        for (const item of itens) {
          await txRun(
            client,
            "INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,'Mesa',?,?)",
            [pedidoId, item.product_id, item.quantity, item.price_at_time, req.tenantId]
          );
        }

        for (let index = 0; index < normalizedPayments.length; index++) {
          await txRun(
            client,
            "INSERT INTO pagamentos (order_id,method,amount_paid,change_given,tenant_id) VALUES (?,?,?,?,?)",
            [
              pedidoId,
              normalizedPayments[index].method,
              normalizedPayments[index].amount_paid,
              index === normalizedPayments.length - 1 ? troco : 0,
              req.tenantId
            ]
          );
        }

        await txRun(
          client,
          `UPDATE comandas
           SET status='fechada',
               closed_at=NOW(),
               taxa_servico_ativa=?,
               taxa_servico_percentual=?,
               couvert_ativo=?,
               couvert_valor_unitario=?,
               couvert_quantidade_pessoas=?
           WHERE id=? AND tenant_id=?`,
          [
            snapshot.taxaServicoAtiva ? 1 : 0,
            snapshot.taxaServicoPercentual,
            snapshot.couvertAtivo ? 1 : 0,
            snapshot.couvertValorUnitario,
            snapshot.couvertQuantidadePessoas,
            openComanda.id,
            req.tenantId
          ]
        );
        await txRun(client, "UPDATE mesas SET status='fechada', opened_at=NULL WHERE id=? AND tenant_id=?", [req.params.id, req.tenantId]);
        await txRun(
          client,
          `UPDATE pedidos SET status='Entregue' WHERE tenant_id=? AND observation=? AND ${buildOperationalKdsOrderClause()}`,
          [req.tenantId, `Mesa ${mesa.numero}`]
        );

        return {
          status: 200,
          body: { success:true, orderNumber, change:troco, receipt:receiptHtml }
        };
      });

      return res.status(result.status).json(result.body);
    } catch (e: any) { res.status(500).json({ success:false, error:e.message }); }
  });

  return router;
}



