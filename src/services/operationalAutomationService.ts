/**
 * Auditoria e disparo seguro da automação operacional (cozinha / aceite delivery).
 * Centraliza logs em `pedido_eventos` e, quando não há pedido (mesa só comanda), em `system_logs`.
 */
import { q1, qRun } from '../db';
import { logError } from '../utils/logger';
import {
  dispatchKitchenProductionForOrder,
  dispatchKitchenProductionForMesa,
  isKitchenDispatchFailure,
  resolveMesaKitchenPrintPayload,
  type KitchenDispatchResult,
} from './kitchenPrintDispatchService';

export const AUTOMATION_EVENT = {
  DELIVERY_ACEITE_AUTO: 'AUTOMATION_DELIVERY_ACEITE_AUTO',
  COZINHA_OK: 'AUTOMATION_COZINHA_OK',
  COZINHA_FALHA: 'AUTOMATION_COZINHA_FALHA',
  COZINHA_SUPRIMIDA_KDS: 'AUTOMATION_COZINHA_SUPRIMIDA_KDS',
  COZINHA_DUPLICIDADE: 'AUTOMATION_COZINHA_DUPLICIDADE_IGNORADA',
} as const;

export type KitchenAutomationOrderTrigger =
  | 'delivery_public_create'
  | 'delivery_manual_accept'
  | 'delivery_manual_post'
  | 'retirada_public_create'
  | 'balcao_order_create';

const DEDUPE_TRIGGERS = new Set<KitchenAutomationOrderTrigger>([
  'delivery_public_create',
  'delivery_manual_accept',
  'delivery_manual_post',
  'retirada_public_create',
  'balcao_order_create',
]);

async function insertPedidoEvento(
  tenantId: number,
  pedidoId: number,
  tipo: string,
  payload: Record<string, unknown>
): Promise<void> {
  await qRun(
    `INSERT INTO pedido_eventos
      (pedido_id,tenant_id,tipo,status_anterior,status_novo,valor,motivo,estoque_reposto,payload,usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [pedidoId, tenantId, tipo, null, null, 0, null, 0, JSON.stringify(payload), null]
  );
}

async function insertSystemAutomationLog(tenantId: number, acao: string, detalhes: Record<string, unknown>): Promise<void> {
  await qRun(
    'INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
    [tenantId, 'Sistema', 'automacao', acao, JSON.stringify(detalhes)]
  );
}

async function hasAutomationKitchenOkForTrigger(tenantId: number, pedidoId: number, trigger: string): Promise<boolean> {
  const row = await q1<{ id: number }>(
    `SELECT id FROM pedido_eventos
     WHERE pedido_id=? AND tenant_id=? AND tipo=?
       AND payload IS NOT NULL
       AND (payload::jsonb->>'trigger') = ?
     LIMIT 1`,
    [pedidoId, tenantId, AUTOMATION_EVENT.COZINHA_OK, trigger]
  );
  return Boolean(row);
}

function logKitchenDispatchToLogger(tenantId: number, orderId: number, trigger: string, r: KitchenDispatchResult) {
  if (!isKitchenDispatchFailure(r)) return;
  const msg = r.message || r.reason;
  logError('operationalAutomation.kitchenPrint', new Error(msg), {
    tenantId,
    orderId,
    trigger,
    dispatch_reason: r.reason,
    failure_kind: r.failure_kind,
    printer_ip: r.printer_ip,
    printer_port: r.printer_port,
  });
}

/** Registra aceite automático do delivery na criação (cardápio online). */
export async function recordDeliveryAutoAcceptOnline(tenantId: number, pedidoId: number): Promise<void> {
  try {
    await insertPedidoEvento(tenantId, pedidoId, AUTOMATION_EVENT.DELIVERY_ACEITE_AUTO, {
      source: 'automation',
      origem: 'delivery_public',
      momento: new Date().toISOString(),
    });
  } catch (e) {
    logError('operationalAutomation.recordDeliveryAutoAcceptOnline', e, { tenantId, pedidoId });
  }
}

/**
 * Impressão automática de produção com auditoria, deduplicação por (pedido + trigger) e log de falhas.
 */
export async function runAutomatedKitchenPrintForOrder(
  tenantId: number,
  orderId: number,
  opts: { trigger: KitchenAutomationOrderTrigger }
): Promise<KitchenDispatchResult> {
  const { trigger } = opts;

  if (DEDUPE_TRIGGERS.has(trigger)) {
    try {
      if (await hasAutomationKitchenOkForTrigger(tenantId, orderId, trigger)) {
        await insertPedidoEvento(tenantId, orderId, AUTOMATION_EVENT.COZINHA_DUPLICIDADE, {
          source: 'automation',
          trigger,
          momento: new Date().toISOString(),
        });
        return { ok: false, reason: 'duplicate_skipped', message: 'Impressao automatica ja registrada para este disparo' };
      }
    } catch (e) {
      logError('operationalAutomation.dedupeCheck', e, { tenantId, orderId, trigger });
    }
  }

  const r = await dispatchKitchenProductionForOrder(tenantId, orderId);

  try {
    if (r.ok) {
      await insertPedidoEvento(tenantId, orderId, AUTOMATION_EVENT.COZINHA_OK, {
        source: 'automation',
        trigger,
        momento: new Date().toISOString(),
        kds_context: false,
      });
    } else if (isKitchenDispatchFailure(r)) {
      if (r.reason === 'duplicate_skipped') {
        /* já registrado antes do dispatch */
      } else {
        await insertPedidoEvento(tenantId, orderId, AUTOMATION_EVENT.COZINHA_FALHA, {
          source: 'automation',
          trigger,
          dispatch_reason: r.reason,
          message: r.message || null,
          failure_kind: r.failure_kind ?? null,
          printer_ip: r.printer_ip ?? null,
          printer_port: r.printer_port ?? null,
          momento: new Date().toISOString(),
        });
        logKitchenDispatchToLogger(tenantId, orderId, trigger, r);
      }
    }
  } catch (e) {
    logError('operationalAutomation.persistKitchenEvent', e, { tenantId, orderId, trigger, ok: r.ok });
  }

  return r;
}

export type MesaKitchenAutomationTrigger = 'mesa_comanda_item';

/**
 * Impressão automática mesa com registro em `pedido_eventos` (KDS) ou `system_logs` (só comanda).
 */
export async function runAutomatedKitchenPrintForMesa(
  tenantId: number,
  mesaId: number,
  opts: { trigger: MesaKitchenAutomationTrigger; printEvenWithKds: boolean }
): Promise<KitchenDispatchResult> {
  const { trigger, printEvenWithKds } = opts;
  let payload: Awaited<ReturnType<typeof resolveMesaKitchenPrintPayload>> = null;

  try {
    payload = await resolveMesaKitchenPrintPayload(tenantId, mesaId);
  } catch (e) {
    logError('operationalAutomation.mesaResolve', e, { tenantId, mesaId });
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  if (!payload) {
    return { ok: false, reason: 'no_items', message: 'Nenhum item de preparo nesta comanda' };
  }

  const pedidoAlvo = payload.resolvedPedidoId;
  const basePayload = {
    source: 'automation' as const,
    trigger,
    mesa_id: mesaId,
    uses_kds: payload.usesKdsOrder,
    print_production_even_with_kds: printEvenWithKds,
    momento: new Date().toISOString(),
  };

  if (payload.usesKdsOrder && !printEvenWithKds) {
    try {
      if (pedidoAlvo != null) {
        await insertPedidoEvento(tenantId, pedidoAlvo, AUTOMATION_EVENT.COZINHA_SUPRIMIDA_KDS, {
          ...basePayload,
          motivo: 'KDS ativo e print_production_even_with_kds=false',
        });
      } else {
        await insertSystemAutomationLog(tenantId, AUTOMATION_EVENT.COZINHA_SUPRIMIDA_KDS, {
          ...basePayload,
          motivo: 'KDS ativo e print_production_even_with_kds=false',
        });
      }
    } catch (e) {
      logError('operationalAutomation.persistKdsSuppressed', e, { tenantId, mesaId });
    }
    return { ok: false, reason: 'kds_suppressed', message: 'KDS ativo: impressao automatica desligada' };
  }

  const r = await dispatchKitchenProductionForMesa(tenantId, mesaId, { printEvenWithKds });

  try {
    if (r.ok) {
      if (pedidoAlvo != null) {
        await insertPedidoEvento(tenantId, pedidoAlvo, AUTOMATION_EVENT.COZINHA_OK, {
          ...basePayload,
          impressao_com_kds: payload.usesKdsOrder && printEvenWithKds,
        });
      } else {
        await insertSystemAutomationLog(tenantId, AUTOMATION_EVENT.COZINHA_OK, {
          ...basePayload,
          impressao_com_kds: false,
        });
      }
    } else if (isKitchenDispatchFailure(r)) {
      if (r.reason === 'kds_suppressed') {
        if (pedidoAlvo != null) {
          await insertPedidoEvento(tenantId, pedidoAlvo, AUTOMATION_EVENT.COZINHA_SUPRIMIDA_KDS, basePayload);
        }
      } else if (r.reason !== 'duplicate_skipped') {
        if (pedidoAlvo != null) {
          await insertPedidoEvento(tenantId, pedidoAlvo, AUTOMATION_EVENT.COZINHA_FALHA, {
            ...basePayload,
            dispatch_reason: r.reason,
            message: r.message || null,
            failure_kind: r.failure_kind ?? null,
            printer_ip: r.printer_ip ?? null,
            printer_port: r.printer_port ?? null,
          });
        } else {
          await insertSystemAutomationLog(tenantId, AUTOMATION_EVENT.COZINHA_FALHA, {
            ...basePayload,
            dispatch_reason: r.reason,
            message: r.message || null,
            failure_kind: r.failure_kind ?? null,
            printer_ip: r.printer_ip ?? null,
            printer_port: r.printer_port ?? null,
          });
        }
        if (pedidoAlvo != null) {
          logKitchenDispatchToLogger(tenantId, pedidoAlvo, trigger, r);
        } else {
          logError('operationalAutomation.mesaKitchenPrint', new Error(r.message || r.reason), {
            tenantId,
            mesaId,
            trigger,
            dispatch_reason: r.reason,
            failure_kind: r.failure_kind,
            printer_ip: r.printer_ip,
            printer_port: r.printer_port,
          });
        }
      }
    }
  } catch (e) {
    logError('operationalAutomation.persistMesaKitchenEvent', e, { tenantId, mesaId, ok: r.ok });
  }

  return r;
}
