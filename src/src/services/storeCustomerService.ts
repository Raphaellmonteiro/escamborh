/**
 * Clientes da loja (consumidores) — cadastro unificado na tabela `delivery_clientes`
 * (único por tenant + telefone). Pedidos referenciam via `pedidos.cliente_id` e,
 * no delivery legado, também `pedidos.delivery_cliente_id`.
 */
import { q1, qAll, qInsert, qRun } from '../db';
import { buildValidOrderSqlClause } from './orderValiditySql';

export function normalizeStoreCustomerPhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export type StoreCustomerRow = {
  id: number;
  tenant_id: number;
  nome: string;
  telefone: string;
  email?: string | null;
  cpf?: string | null;
  observacoes?: string | null;
  ativo?: number | null;
  origem_cadastro?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export async function findOrCreateStoreCustomerByPhone(input: {
  tenantId: number;
  nome?: unknown;
  telefone?: unknown;
  origemCadastro: string;
}): Promise<number | null> {
  const telefone = normalizeStoreCustomerPhone(input.telefone);
  const nome = String(input.nome || '').trim();

  if (!telefone) return null;

  const existing = await q1<{ id: number; nome: string | null; origem_cadastro: string | null }>(
    'SELECT id, nome, origem_cadastro FROM delivery_clientes WHERE tenant_id=? AND telefone=?',
    [input.tenantId, telefone]
  );

  if (existing) {
    if ((!existing.nome || !String(existing.nome).trim()) && nome) {
      await qRun('UPDATE delivery_clientes SET nome=?, updated_at=NOW() WHERE id=? AND tenant_id=?', [
        nome,
        existing.id,
        input.tenantId,
      ]);
    }

    if (!existing.origem_cadastro || !String(existing.origem_cadastro).trim()) {
      await qRun('UPDATE delivery_clientes SET origem_cadastro=?, updated_at=NOW() WHERE id=? AND tenant_id=?', [
        input.origemCadastro,
        existing.id,
        input.tenantId,
      ]);
    }

    return Number(existing.id);
  }

  if (!nome) return null;

  const createdId = await qInsert(
    `INSERT INTO delivery_clientes
      (tenant_id, nome, telefone, origem_cadastro, primeira_compra_at, ultima_compra_at, ativo)
     VALUES (?, ?, ?, ?, NOW(), NOW(), 1)`,
    [input.tenantId, nome, telefone, input.origemCadastro]
  );

  return Number(createdId);
}

export async function touchStoreCustomerPurchase(params: {
  clienteId: number;
  tenantId: number;
  origemCadastro?: string | null;
}) {
  await qRun(
    `UPDATE delivery_clientes
     SET primeira_compra_at = COALESCE(primeira_compra_at, NOW()),
         ultima_compra_at = NOW(),
         updated_at = NOW(),
         origem_cadastro = CASE
           WHEN (origem_cadastro IS NULL OR BTRIM(origem_cadastro) = '')
             AND COALESCE(?, '') <> ''
           THEN ?
           ELSE COALESCE(origem_cadastro, 'delivery_online')
         END
     WHERE id=? AND tenant_id=?`,
    [params.origemCadastro || null, params.origemCadastro || null, params.clienteId, params.tenantId]
  );
}

export async function getStoreCustomerById(tenantId: number, id: number): Promise<StoreCustomerRow | null> {
  const row = await q1<StoreCustomerRow>(
    `SELECT id, tenant_id, nome, telefone, email, cpf, observacoes, ativo, origem_cadastro, created_at, updated_at
     FROM delivery_clientes WHERE id=? AND tenant_id=? AND COALESCE(ativo,1) = 1`,
    [id, tenantId]
  );
  return row;
}

export async function searchStoreCustomers(tenantId: number, searchRaw: string, limit = 40): Promise<StoreCustomerRow[]> {
  const q = String(searchRaw || '').trim();
  if (!q) return [];
  const term = `%${q}%`;
  return qAll<StoreCustomerRow>(
    `SELECT id, tenant_id, nome, telefone, email, cpf, observacoes, ativo, origem_cadastro, created_at, updated_at
     FROM delivery_clientes
     WHERE tenant_id=? AND COALESCE(ativo,1)=1
       AND (nome ILIKE ? OR telefone ILIKE ? OR COALESCE(email,'') ILIKE ?)
     ORDER BY nome ASC NULLS LAST
     LIMIT ?`,
    [tenantId, term, term, term, limit]
  );
}

export async function lookupStoreCustomerByPhone(tenantId: number, telefoneRaw: string): Promise<StoreCustomerRow | null> {
  const telefone = normalizeStoreCustomerPhone(telefoneRaw);
  if (!telefone) return null;
  return q1<StoreCustomerRow>(
    `SELECT id, tenant_id, nome, telefone, email, cpf, observacoes, ativo, origem_cadastro, created_at, updated_at
     FROM delivery_clientes WHERE tenant_id=? AND telefone=? AND COALESCE(ativo,1)=1`,
    [tenantId, telefone]
  );
}

/** Ticket médio (2 casas), sempre number, sem divisão por zero nem NaN. */
export function computeStoreCustomerTicketMedio(totalGasto: number, totalPedidos: number): number {
  const tp = Math.max(0, Math.floor(Number(totalPedidos)));
  if (tp <= 0) return 0;
  const tg = Number(totalGasto);
  const gasto = Number.isFinite(tg) ? tg : 0;
  const raw = gasto / tp;
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 100) / 100;
}

export type StoreCustomerMetrics = {
  total_pedidos: number;
  total_gasto: number;
  ticket_medio: number;
  ultimo_pedido_em: string | null;
  primeira_compra_em: string | null;
  canais_usados: string[];
};

export async function getStoreCustomerMetrics(tenantId: number, customerId: number): Promise<StoreCustomerMetrics> {
  const valid = buildValidOrderSqlClause('p');
  const row = await q1<{
    total_pedidos: string | number;
    total_gasto: string | number | null;
    ultimo_pedido_em: string | null;
    primeira_compra_em: string | null;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE ${valid})::int AS total_pedidos,
       COALESCE(SUM(CASE WHEN ${valid} THEN COALESCE(p.total_amount, 0) ELSE 0 END), 0) AS total_gasto,
       MAX(p.created_at) FILTER (WHERE ${valid}) AS ultimo_pedido_em,
       MIN(p.created_at) FILTER (WHERE ${valid}) AS primeira_compra_em
     FROM pedidos p
     WHERE p.tenant_id = ?
       AND (p.cliente_id = ? OR p.delivery_cliente_id = ?)`,
    [tenantId, customerId, customerId]
  );

  const canalRows = await qAll<{ canal: string }>(
    `SELECT DISTINCT COALESCE(NULLIF(TRIM(p.canal), ''), 'sem_canal') AS canal
     FROM pedidos p
     WHERE p.tenant_id = ?
       AND (p.cliente_id = ? OR p.delivery_cliente_id = ?)
       AND (${valid})
     ORDER BY canal ASC`,
    [tenantId, customerId, customerId]
  );

  const canais = canalRows.map((r) => r.canal).filter(Boolean);
  const totalPedidos = Number(row?.total_pedidos || 0);
  const totalGasto = Number(row?.total_gasto || 0);
  const ticketMedio = computeStoreCustomerTicketMedio(totalGasto, totalPedidos);

  return {
    total_pedidos: totalPedidos,
    total_gasto: totalGasto,
    ticket_medio: ticketMedio,
    ultimo_pedido_em: row?.ultimo_pedido_em || null,
    primeira_compra_em: row?.primeira_compra_em || null,
    canais_usados: canais,
  };
}

export async function getStoreCustomerOrdersList(tenantId: number, customerId: number, limit = 80) {
  return qAll(
    `SELECT p.*,
      (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ')
       FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) AS resumo_itens
     FROM pedidos p
     WHERE p.tenant_id=?
       AND (p.cliente_id=? OR p.delivery_cliente_id=?)
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [tenantId, customerId, customerId, limit]
  );
}
