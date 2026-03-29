import type { Request, Response } from 'express';

const SSE_PING_MS = 30000;

/** Limite de streams SSE simultâneos por tenant (reconexão agressiva / bugs no cliente). Sobrescreva com SSE_MAX_PER_TENANT. */
function maxSseConnectionsPerTenant(): number {
  const raw = process.env.SSE_MAX_PER_TENANT?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 500);
  }
  return 48;
}

/** Clientes SSE ativos por tenant (painel autenticado + KDS público compartilham o mesmo mapa). */
export const sseClients = new Map<number, Set<Response>>();

export function registerSseClient(tenantId: number, res: Response): void {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  let set = sseClients.get(tid);
  if (!set) {
    set = new Set();
    sseClients.set(tid, set);
  }
  set.add(res);
}

export function unregisterSseClient(tenantId: number, res: Response): void {
  const tid = Number(tenantId);
  const set = sseClients.get(tid);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(tid);
}

/**
 * Headers iniciais + registro no mapa + ping + cleanup em todos os caminhos comuns
 * (fim do request, abort, erro e socket da response fechado) para evitar cliente fantasma.
 */
export function setupSseStream(tenantId: number, req: Request, res: Response): void {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;

  const limit = maxSseConnectionsPerTenant();
  const current = sseClients.get(tid);
  if (current && current.size >= limit) {
    res.status(503).json({
      success: false,
      error:
        'Limite de conexões em tempo real atingido. Feche abas ou telas antigas do painel/KDS e tente de novo.',
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');

  registerSseClient(tid, res);

  let ping: ReturnType<typeof setInterval> | undefined;
  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    if (ping !== undefined) {
      clearInterval(ping);
      ping = undefined;
    }
    unregisterSseClient(tid, res);
  };

  ping = setInterval(() => {
    try {
      if (res.writableEnded) {
        cleanup();
        return;
      }
      res.write('event: ping\ndata: {}\n\n');
    } catch {
      cleanup();
    }
  }, SSE_PING_MS);

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

export function broadcastSSE(tenantId: number, event: string, data: unknown): void {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  const clients = sseClients.get(tid);
  if (!clients || clients.size === 0) return;

  let payload: string;
  try {
    payload = `event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`;
  } catch {
    payload = `event: ${event}\ndata: {}\n\n`;
  }

  const dead: Response[] = [];
  for (const res of clients) {
    try {
      if (res.writableEnded) {
        dead.push(res);
        continue;
      }
      res.write(payload);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) {
    clients.delete(res);
  }
  if (clients.size === 0) {
    sseClients.delete(tid);
  }
}

/**
 * Emite os nomes de evento usados pelo painel (`novo_pedido` / `status_pedido`)
 * e pelo KDS público (`new_order` / `status_change`).
 */
export function notifyTenantOrderStreams(
  tenantId: number,
  kind: 'new' | 'status',
  data: Record<string, unknown> = {}
): void {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  if (kind === 'new') {
    broadcastSSE(tid, 'novo_pedido', data);
    broadcastSSE(tid, 'new_order', data);
  } else {
    broadcastSSE(tid, 'status_pedido', data);
    broadcastSSE(tid, 'status_change', data);
  }
}
