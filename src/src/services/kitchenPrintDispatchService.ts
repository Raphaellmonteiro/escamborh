/**
 * Disparo térmico da comanda de produção — mesma base que `routes/print.ts` POST /comanda.
 */
import net from 'net';
import { q1, qAll } from '../db';
import { getProfilePaperColumns } from '../utils/printProfiles';
import {
  buildKitchenEscPosPlainText,
  filterKitchenPreparationItems,
  type KitchenPrintItemInput,
  type KitchenPrintOrderInput,
} from './kitchenPrintService';

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

function classifySocketFailureMessage(message: string): 'timeout' | 'socket' | 'unknown' {
  const m = message.toLowerCase();
  if (m.includes('timeout')) return 'timeout';
  if (
    m.includes('econnrefused') ||
    m.includes('econnreset') ||
    m.includes('etimedout') ||
    m.includes('enotfound') ||
    m.includes('socket') ||
    m.includes('network')
  ) {
    return 'socket';
  }
  return 'unknown';
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

function isCanceledOrder(order?: { status?: string | null; cancelado_at?: string | null } | null) {
  return Boolean(order?.cancelado_at) || String(order?.status || '').trim().toLowerCase() === 'cancelado';
}

export async function loadKitchenItemRowsForOrder(orderId: string | number, tenantId: number) {
  return qAll(
    `SELECT p.name, p.category, p.requires_preparation, p.production_type, ip.quantity, ip.observation
     FROM itens_pedido ip
     JOIN produtos p ON p.id=ip.product_id
     WHERE ip.order_id=? AND ip.tenant_id=?`,
    [orderId, tenantId]
  );
}

function mapRowsToKitchenItems(rows: { quantity: unknown; name: unknown; observation: unknown; category: unknown; requires_preparation: unknown; production_type: unknown }[]): KitchenPrintItemInput[] {
  return rows.map((row) => ({
    quantity: Number(row.quantity),
    name: String(row.name),
    observation: row.observation as string | null,
    category: row.category as string | null,
    requires_preparation: row.requires_preparation as number | null,
    production_type: row.production_type as string | null,
  }));
}

export type KitchenDispatchFailure = {
  ok: false;
  reason: 'no_printer' | 'no_items' | 'canceled' | 'not_found' | 'error' | 'kds_suppressed' | 'duplicate_skipped';
  message?: string;
  printer_ip?: string | null;
  printer_port?: number | null;
  failure_kind?: 'timeout' | 'socket' | 'config' | 'unknown';
};

export type KitchenDispatchResult = { ok: true } | KitchenDispatchFailure;

export function isKitchenDispatchFailure(r: KitchenDispatchResult): r is KitchenDispatchFailure {
  return r.ok === false;
}

/**
 * Envia comanda de produção para a impressora térmica da cozinha (perfil `cozinha` em `printer_config`).
 */
function printerContextFromCfg(cfg: { ip?: string; porta?: number } | null): {
  printer_ip: string | null;
  printer_port: number | null;
} {
  if (!cfg) return { printer_ip: null, printer_port: null };
  const p = cfg.porta != null ? Number(cfg.porta) : NaN;
  return {
    printer_ip: cfg.ip ? String(cfg.ip) : null,
    printer_port: Number.isFinite(p) ? p : null,
  };
}

export async function dispatchKitchenProductionForOrder(tenantId: number, orderId: number | string): Promise<KitchenDispatchResult> {
  try {
    const row = await q1<{ printer_config?: string | null }>('SELECT printer_config FROM clientes WHERE id=?', [tenantId]);
    if (!row?.printer_config) {
      return {
        ok: false,
        reason: 'no_printer',
        message: 'Impressora nao configurada',
        failure_kind: 'config',
        printer_ip: null,
        printer_port: null,
      };
    }

    const pedido = await q1<{
      order_number: unknown;
      canal: string | null;
      tipo_retirada: string | null;
      observation: string | null;
      cliente_nome: string | null;
      cliente_tel: string | null;
      created_at: string | null;
      status: string | null;
      cancelado_at: string | null;
    }>('SELECT * FROM pedidos WHERE id=? AND tenant_id=?', [orderId, tenantId]);

    if (!pedido) return { ok: false, reason: 'not_found', failure_kind: 'unknown', printer_ip: null, printer_port: null };
    if (isCanceledOrder(pedido)) {
      return { ok: false, reason: 'canceled', failure_kind: 'unknown', printer_ip: null, printer_port: null };
    }

    const rawRows = await loadKitchenItemRowsForOrder(orderId, tenantId);
    const kitchenItems = mapRowsToKitchenItems(rawRows);
    if (filterKitchenPreparationItems(kitchenItems).length === 0) {
      return { ok: false, reason: 'no_items', message: 'Pedido sem itens de preparo para a cozinha', failure_kind: 'unknown', printer_ip: null, printer_port: null };
    }

    const orderInput: KitchenPrintOrderInput = {
      order_number: String(pedido.order_number),
      canal: pedido.canal,
      tipo_retirada: pedido.tipo_retirada,
      observation: pedido.observation,
      cliente_nome: pedido.cliente_nome,
      cliente_tel: pedido.cliente_tel,
      created_at: pedido.created_at,
    };

    const texto = buildKitchenEscPosPlainText(orderInput, kitchenItems);
    const cfg = JSON.parse(row.printer_config) as { ip?: string; porta?: number };
    const pc = printerContextFromCfg(cfg);
    if (!cfg.ip) {
      return {
        ok: false,
        reason: 'no_printer',
        message: 'IP da impressora nao configurado',
        failure_kind: 'config',
        printer_ip: pc.printer_ip,
        printer_port: pc.printer_port,
      };
    }

    const dados = buildEscPos(texto, getProfilePaperColumns(cfg, 'cozinha'));
    const porta = cfg.porta || 9100;
    await enviarParaImpressora(dados, cfg.ip, porta);
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    let printer_ip: string | null = null;
    let printer_port: number | null = null;
    try {
      const row = await q1<{ printer_config?: string | null }>('SELECT printer_config FROM clientes WHERE id=?', [tenantId]);
      if (row?.printer_config) {
        const cfg = JSON.parse(row.printer_config) as { ip?: string; porta?: number };
        const pc = printerContextFromCfg(cfg);
        printer_ip = pc.printer_ip;
        printer_port = pc.printer_port;
      }
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason: 'error',
      message,
      printer_ip,
      printer_port,
      failure_kind: classifySocketFailureMessage(message),
    };
  }
}

export type MesaKitchenPayload = {
  order: KitchenPrintOrderInput;
  items: KitchenPrintItemInput[];
  /** True quando a impressão usaria o pedido KDS vinculado à mesa. */
  usesKdsOrder: boolean;
  /** Pedido KDS usado na cozinha, quando houver; null quando só comanda (sem linha em `pedidos`). */
  resolvedPedidoId: number | null;
};

function buildOperationalKdsOrderClause(alias?: string) {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}cancelado_at IS NULL AND LOWER(COALESCE(${prefix}status,'')) <> 'entregue' AND LOWER(COALESCE(${prefix}status,'')) <> 'cancelado' AND LOWER(COALESCE(${prefix}status,'')) NOT LIKE 'conclu%'`;
}

/**
 * Resolve dados para comanda de cozinha da mesa (mesma lógica da rota GET .../producao-html).
 */
export async function resolveMesaKitchenPrintPayload(tenantId: number, mesaId: number): Promise<MesaKitchenPayload | null> {
  const mesa = await q1<{ id: number; numero: unknown }>('SELECT id, numero FROM mesas WHERE id=? AND tenant_id=?', [mesaId, tenantId]);
  if (!mesa) return null;

  const comanda = await q1(
    "SELECT * FROM comandas WHERE mesa_id=? AND status='aberta' AND tenant_id=? ORDER BY created_at DESC LIMIT 1",
    [mesaId, tenantId]
  );
  if (!comanda) return null;

  const mesaLabel = `Mesa ${mesa.numero}`;
  const kdsOrder = await q1<{ id: number; order_number: unknown; canal: string | null; tipo_retirada: string | null; created_at: string | null; status: string | null; cancelado_at: string | null }>(
    `SELECT * FROM pedidos WHERE tenant_id=? AND observation=? AND ${buildOperationalKdsOrderClause()} ORDER BY id DESC LIMIT 1`,
    [tenantId, mesaLabel]
  );

  if (kdsOrder) {
    if (kdsOrder.cancelado_at || String(kdsOrder.status || '').trim().toLowerCase() === 'cancelado') return null;
    const rows = await qAll(
      `SELECT p.name, p.category, p.requires_preparation, p.production_type, ip.quantity, ip.observation
       FROM itens_pedido ip
       JOIN produtos p ON p.id=ip.product_id
       WHERE ip.order_id=? AND ip.tenant_id=?`,
      [kdsOrder.id, tenantId]
    );
    const kitchenItems = mapRowsToKitchenItems(rows);
    if (filterKitchenPreparationItems(kitchenItems).length === 0) return null;
    return {
      usesKdsOrder: true,
      resolvedPedidoId: kdsOrder.id,
      order: {
        order_number: String(kdsOrder.order_number),
        canal: kdsOrder.canal,
        tipo_retirada: kdsOrder.tipo_retirada,
        observation: mesaLabel,
        created_at: kdsOrder.created_at,
      },
      items: kitchenItems,
    };
  }

  const rows = await qAll(
    `SELECT ic.quantity, ic.observation, ic.product_name, p.name AS pname, p.category, p.requires_preparation, p.production_type
     FROM itens_comanda ic
     JOIN produtos p ON p.id=ic.product_id AND p.tenant_id=ic.tenant_id
     WHERE ic.comanda_id=? AND ic.tenant_id=?
     ORDER BY ic.created_at ASC`,
    [comanda.id, tenantId]
  );
  const kitchenItems = rows.map((row: any) => ({
    quantity: Number(row.quantity),
    name: row.pname || row.product_name || 'Produto',
    observation: row.observation,
    category: row.category,
    requires_preparation: row.requires_preparation,
    production_type: row.production_type,
  }));
  if (filterKitchenPreparationItems(kitchenItems).length === 0) return null;

  return {
    usesKdsOrder: false,
    resolvedPedidoId: null,
    order: {
      order_number: `Mesa-${mesa.numero}`,
      canal: 'mesa',
      tipo_retirada: 'mesa',
      observation: mesaLabel,
      created_at: comanda.created_at as string,
    },
    items: kitchenItems,
  };
}

export async function dispatchKitchenProductionForMesa(
  tenantId: number,
  mesaId: number,
  options: { printEvenWithKds: boolean }
): Promise<KitchenDispatchResult> {
  try {
    const payload = await resolveMesaKitchenPrintPayload(tenantId, mesaId);
    if (!payload) {
      return {
        ok: false,
        reason: 'no_items',
        message: 'Nenhum item de preparo nesta comanda',
        failure_kind: 'unknown',
        printer_ip: null,
        printer_port: null,
      };
    }

    if (payload.usesKdsOrder && !options.printEvenWithKds) {
      return {
        ok: false,
        reason: 'kds_suppressed',
        message: 'KDS ativo: impressao automatica desligada',
        failure_kind: 'config',
        printer_ip: null,
        printer_port: null,
      };
    }

    const row = await q1<{ printer_config?: string | null }>('SELECT printer_config FROM clientes WHERE id=?', [tenantId]);
    if (!row?.printer_config) {
      return { ok: false, reason: 'no_printer', failure_kind: 'config', printer_ip: null, printer_port: null };
    }

    const texto = buildKitchenEscPosPlainText(payload.order, payload.items);
    const cfg = JSON.parse(row.printer_config) as { ip?: string; porta?: number };
    const pc = printerContextFromCfg(cfg);
    if (!cfg.ip) {
      return {
        ok: false,
        reason: 'no_printer',
        message: 'IP da impressora nao configurado',
        failure_kind: 'config',
        printer_ip: pc.printer_ip,
        printer_port: pc.printer_port,
      };
    }

    const dados = buildEscPos(texto, getProfilePaperColumns(cfg, 'cozinha'));
    const porta = cfg.porta || 9100;
    await enviarParaImpressora(dados, cfg.ip, porta);
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    let printer_ip: string | null = null;
    let printer_port: number | null = null;
    try {
      const row = await q1<{ printer_config?: string | null }>('SELECT printer_config FROM clientes WHERE id=?', [tenantId]);
      if (row?.printer_config) {
        const cfg = JSON.parse(row.printer_config) as { ip?: string; porta?: number };
        const pc = printerContextFromCfg(cfg);
        printer_ip = pc.printer_ip;
        printer_port = pc.printer_port;
      }
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason: 'error',
      message,
      printer_ip,
      printer_port,
      failure_kind: classifySocketFailureMessage(message),
    };
  }
}
