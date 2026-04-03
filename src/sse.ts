import type { Request, Response } from 'express';

const SSE_PING_MS = 30000;
const DEFAULT_SSE_MAX_PER_TENANT = 48;
const MAX_SSE_CONNECTIONS_PER_TENANT = 500;
const SSE_LIMIT_RETRY_AFTER_SECONDS = 10;
const SSE_LOG_CONNECTIONS = process.env.SSE_LOG_CONNECTIONS === '1';
const SSE_STORAGE_MODE = 'memory-local';

function resolveSseInstanceId(): string {
  const candidates = [
    process.env.SSE_INSTANCE_ID,
    process.env.RAILWAY_REPLICA_ID,
    process.env.HOSTNAME,
    process.env.NODE_APP_INSTANCE,
  ];

  for (const value of candidates) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }

  return `pid-${process.pid}`;
}

const SSE_INSTANCE_ID = resolveSseInstanceId();

function logSse(level: 'info' | 'warn', message: string, meta: Record<string, unknown> = {}): void {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    context: 'sse',
    message,
    meta: {
      instanceId: SSE_INSTANCE_ID,
      storageMode: SSE_STORAGE_MODE,
      ...meta,
    },
  };

  if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

/** Per-process limit only. This mitigates local reconnect storms, but does not coordinate replicas. */
function maxSseConnectionsPerTenant(): number {
  const raw = process.env.SSE_MAX_PER_TENANT?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) {
      return Math.min(Math.floor(n), MAX_SSE_CONNECTIONS_PER_TENANT);
    }
  }
  return DEFAULT_SSE_MAX_PER_TENANT;
}

function getTenantClientCount(tenantId: number): number {
  return sseClients.get(tenantId)?.size ?? 0;
}

function applySseDiagnosticHeaders(
  res: Response,
  activeConnections: number,
  limit: number
): void {
  res.setHeader('X-FlowPDV-SSE-Instance', SSE_INSTANCE_ID);
  res.setHeader('X-FlowPDV-SSE-Storage', SSE_STORAGE_MODE);
  res.setHeader('X-FlowPDV-SSE-Active', String(activeConnections));
  res.setHeader('X-FlowPDV-SSE-Limit', String(limit));
}

/** Active SSE clients per tenant for this Node process only. */
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
  const currentCount = getTenantClientCount(tid);

  if (currentCount >= limit) {
    applySseDiagnosticHeaders(res, currentCount, limit);
    res.setHeader('Retry-After', String(SSE_LIMIT_RETRY_AFTER_SECONDS));
    logSse('warn', 'Tenant SSE limit reached on this instance', {
      tenantId: tid,
      activeConnections: currentCount,
      limit,
      path: req.originalUrl,
      method: req.method,
    });
    res.status(503).json({
      success: false,
      error:
        'Limite local de conexoes SSE atingido nesta instancia. Feche abas ou telas antigas do painel/KDS e tente novamente.',
      code: 'SSE_LIMIT_PER_INSTANCE',
      details: {
        instanceId: SSE_INSTANCE_ID,
        storageMode: SSE_STORAGE_MODE,
        activeConnections: currentCount,
        limit,
        retryAfterSeconds: SSE_LIMIT_RETRY_AFTER_SECONDS,
      },
    });
    return;
  }

  applySseDiagnosticHeaders(res, currentCount + 1, limit);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');

  registerSseClient(tid, res);

  if (SSE_LOG_CONNECTIONS) {
    logSse('info', 'SSE stream registered', {
      tenantId: tid,
      activeConnections: getTenantClientCount(tid),
      limit,
      path: req.originalUrl,
      method: req.method,
    });
  }

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
    if (SSE_LOG_CONNECTIONS) {
      logSse('info', 'SSE stream cleaned up', {
        tenantId: tid,
        activeConnections: getTenantClientCount(tid),
        limit,
        path: req.originalUrl,
        method: req.method,
      });
    }
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
