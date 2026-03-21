import type { PoolClient } from 'pg';
import {
  q1,
  qAll,
  withTx,
  txQ1,
  txQAll,
  txRun,
  txInsert,
} from '../db';
import { gerarCupomHtml } from '../utils/printTemplates';
import type {
  CancelOrderInput,
  CreateOrderInput,
  DeleteOrderInput,
  GetOrderHistoryInput,
  GetOrdersFilters,
  OrderHistoryEvent,
  OrderItemInput,
  PaymentInput,
  RefundOrderInput,
  UpdateOrderStatusInput,
} from '../types/order';
import { AppError } from '../utils/errors';
import { logError } from '../utils/logger';
import { getProfilePaperWidthMm } from '../utils/printProfiles';
import { resolveRequiresPreparation } from '../utils/preparation';
import { validateSecurityPassword } from '../utils/securityPassword';
import { requireProductInventoryTargets } from './stockIdentification';

const TZ = 'America/Sao_Paulo';

const ALLOWED_ORDER_STATUSES = new Set([
  'Criado',
  'Aguardando confirmação',
  'Em Preparo',
  'Pronto',
  'Entregue',
  'Concluído',
  'Cancelado',
  'cancelado',
  'Pedido Recebido',
  'Pronto para Entrega',
  'Saiu para Entrega',
]);

const ALLOWED_PAYMENT_METHODS = new Set([
  'Dinheiro',
  'PIX',
  'Débito',
  'Debito',
  'Crédito',
  'Credito',
  'dinheiro',
  'pix',
  'debito',
  'credito',
  'crédito',
  'cartao',
  'cartão',
]);

type TenantId = number | string;

type NormalizedOrderItem = {
  product_id: number;
  quantity: number;
  type?: string;
  price_at_time: number;
};

type NormalizedPayment = {
  method: string;
  amount_paid: number;
  change_given: number;
};

type NormalizedCreateOrderInput = {
  items: NormalizedOrderItem[];
  payments: NormalizedPayment[];
  observation?: string;
  total_amount: number;
  tipo_retirada: string;
  canal: string;
  status: string;
};

type OrderRow = {
  id: number;
  order_number: string;
  status: string;
  canal?: string | null;
  total_amount: number;
  observation?: string | null;
  receipt_text?: string | null;
  created_at: string;
  tipo_retirada?: string | null;
  senha_pedido?: number | null;
  cancelado_at?: string | null;
  cancelamento_motivo?: string | null;
  cancelado_por?: number | null;
  estoque_reposto?: number | boolean | null;
  estoque_reposto_at?: string | null;
  reembolso_status?: string | null;
  valor_reembolsado?: number | null;
  reembolsado_at?: string | null;
  reembolso_motivo?: string | null;
  reembolsado_por?: number | null;
};

type OrderItemRow = {
  order_id: number;
  product_id: number;
  quantity: number;
  type?: string | null;
  price_at_time: number;
  product_name?: string | null;
  product_category?: string | null;
  production_type?: string | null;
  requires_preparation?: number | null;
};

type ProductRow = {
  id: number;
  name: string;
  category?: string | null;
  production_type?: string | null;
  requires_preparation?: number | null;
  codigo_barras?: string | null;
};

type IngredientStockRow = {
  estoque_atual: number | string | null;
};

type StockMovementSummaryRow = {
  ingrediente_id: number;
  quantity: number | string;
};

type PaymentRow = {
  amount_paid: number | string | null;
  change_given: number | string | null;
};

type OrderHistoryEventRow = {
  id: number;
  tipo: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  valor?: number | string | null;
  motivo?: string | null;
  estoque_reposto?: number | boolean | null;
  payload?: string | Record<string, unknown> | null;
  usuario_id?: number | null;
  created_at: string;
};

const MONEY_TOLERANCE_CENTS = 1;

function isCanceledStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase() === 'cancelado';
}

function ensureTenantId(tenantId: TenantId) {
  if (tenantId === null || tenantId === undefined || tenantId === '') {
    throw new AppError('Tenant inválido', 400);
  }
}

function parseOrderId(orderId: number | string) {
  const parsed = Number(orderId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('Pedido inválido', 400);
  }

  return parsed;
}

function normalizeOrderItem(item: OrderItemInput, index: number): NormalizedOrderItem {
  const productId = Number(item.product_id);
  const quantity = Number(item.quantity);
  const priceAtTime = Number(item.price_at_time ?? item.unitPrice);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new AppError(`Item ${index + 1} com produto inválido`, 400);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError(`Item ${index + 1} com quantidade inválida`, 400);
  }

  if (!Number.isFinite(priceAtTime) || priceAtTime < 0) {
    throw new AppError(`Item ${index + 1} com preço inválido`, 400);
  }

  return {
    product_id: productId,
    quantity,
    type: item.type?.trim() || undefined,
    price_at_time: priceAtTime,
  };
}

function normalizePayment(payment: PaymentInput, index: number): NormalizedPayment {
  const method = String(payment.method || '').trim();
  const amountPaid = Number(payment.amount_paid ?? payment.amount);
  const changeGiven = Number(payment.change_given || 0);

  if (!method) {
    throw new AppError(`Pagamento ${index + 1} sem método`, 400);
  }

  if (!ALLOWED_PAYMENT_METHODS.has(method)) {
    throw new AppError(`Método de pagamento inválido: ${method}`, 400);
  }

  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    throw new AppError(`Pagamento ${index + 1} com valor inválido`, 400);
  }

  if (!Number.isFinite(changeGiven) || changeGiven < 0) {
    throw new AppError(`Pagamento ${index + 1} com troco inválido`, 400);
  }

  if (changeGiven > amountPaid) {
    throw new AppError(`Pagamento ${index + 1} com troco maior que o valor pago`, 400);
  }

  return {
    method,
    amount_paid: amountPaid,
    change_given: changeGiven,
  };
}

function deriveOrderChannel(tipoRetirada?: string | null, currentCanal?: string | null) {
  const canal = String(currentCanal || '').trim().toLowerCase();
  if (canal === 'delivery' || canal === 'mesa' || canal === 'retirada' || canal === 'balcao') {
    return canal;
  }

  return String(tipoRetirada || '').trim().toLowerCase() === 'levar' ? 'retirada' : 'balcao';
}

function toMoneyCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

function centsToMoney(cents: number) {
  return cents / 100;
}

function ensureFinancialConsistency(input: {
  items: NormalizedOrderItem[];
  payments: NormalizedPayment[];
  total_amount: number;
}) {
  const itemsTotalCents = input.items.reduce(
    (sum, item) => sum + toMoneyCents(Number(item.quantity) * Number(item.price_at_time)),
    0
  );
  const paymentsTotalCents = input.payments.reduce(
    (sum, payment) => sum + toMoneyCents(Number(payment.amount_paid) - Number(payment.change_given)),
    0
  );
  const orderTotalCents = toMoneyCents(input.total_amount);

  if (Math.abs(itemsTotalCents - orderTotalCents) > MONEY_TOLERANCE_CENTS) {
    throw new AppError('Total do pedido divergente da soma dos itens', 400);
  }

  if (Math.abs(paymentsTotalCents - orderTotalCents) > MONEY_TOLERANCE_CENTS) {
    throw new AppError('Total do pedido divergente da soma dos pagamentos', 400);
  }
}

function normalizeCreateOrderInput(data: CreateOrderInput): NormalizedCreateOrderInput {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new AppError('Pedido precisa ter pelo menos 1 item', 400);
  }

  if (!Array.isArray(data.payments) || data.payments.length === 0) {
    throw new AppError('Pedido precisa ter pelo menos 1 pagamento', 400);
  }

  const totalAmount = Number(data.total_amount ?? data.total);

  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new AppError('Valor total inválido', 400);
  }

  const status = data.status?.trim() || 'Criado';

  if (!ALLOWED_ORDER_STATUSES.has(status)) {
    throw new AppError('Status inválido', 400);
  }

  const normalizedInput = {
    items: data.items.map(normalizeOrderItem),
    payments: data.payments.map(normalizePayment),
    observation: data.observation?.trim() || undefined,
    total_amount: totalAmount,
    tipo_retirada: data.tipo_retirada?.trim() || 'local',
    canal: deriveOrderChannel(data.tipo_retirada),
    status,
  };

  ensureFinancialConsistency(normalizedInput);

  return normalizedInput;
}

function getCurrentOrderDateParts() {
  const dateObj = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const fullYear = String(dateObj.getFullYear());
  const y = fullYear.slice(-2);
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');

  return {
    dailyKey: `${fullYear}${m}${d}`,
    orderDate: `${y}${m}${d}`,
  };
}

async function generateOrderNumber(client: PoolClient, tenantId: TenantId) {
  const { dailyKey, orderDate } = getCurrentOrderDateParts();

  await txQ1(
    client,
    'SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))',
    [String(tenantId), dailyKey]
  );

  const todayRow = await txQ1<{ last_number: string | number | null }>(
    client,
    `SELECT COALESCE(MAX(senha_pedido), COUNT(*), 0) as last_number
     FROM pedidos
     WHERE (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date
       AND tenant_id=?`,
    [tenantId]
  );

  const nextNumber = Number(todayRow?.last_number || 0) + 1;

  return {
    nextNumber,
    orderNumber: `${orderDate}-${tenantId}-${nextNumber.toString().padStart(3, '0')}`,
  };
}

async function ensureProductsExist(items: NormalizedOrderItem[], tenantId: TenantId) {
  const productIds = [...new Set(items.map((item) => item.product_id))];

  if (productIds.length === 0) {
    throw new AppError('Pedido sem produtos', 400);
  }

  const rows = await qAll<{ id: number }>(
    `SELECT id
     FROM produtos
     WHERE tenant_id=?
       AND id IN (${productIds.map(() => '?').join(',')})`,
    [tenantId, ...productIds]
  );

  const foundIds = new Set(rows.map((row) => Number(row.id)));
  const missingId = productIds.find((id) => !foundIds.has(id));

  if (missingId) {
    throw new AppError(`Produto ${missingId} não encontrado`, 404);
  }
}

async function orderHasPreparationItems(client: PoolClient, orderId: number, tenantId: TenantId) {
  const items = await txQAll<{
    product_name?: string | null;
    product_category?: string | null;
    production_type?: string | null;
    requires_preparation?: number | null;
  }>(
    client,
    `SELECT p.name AS product_name, p.category AS product_category, p.requires_preparation, p.production_type
     FROM itens_pedido ip
     JOIN produtos p ON p.id=ip.product_id
     WHERE ip.order_id=? AND ip.tenant_id=?`,
    [orderId, tenantId]
  );

  return items.some((item) =>
    resolveRequiresPreparation({
      name: item.product_name,
      category: item.product_category,
      requires_preparation: item.requires_preparation,
      production_type: item.production_type,
    })
  );
}

async function insertOrderItems(
  client: PoolClient,
  orderId: number,
  items: NormalizedOrderItem[],
  tenantId: TenantId
) {
  for (const item of items) {
    await txRun(
      client,
      'INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,?,?,?)',
      [orderId, item.product_id, item.quantity, item.type, item.price_at_time, tenantId]
    );
  }
}

async function savePayments(
  client: PoolClient,
  orderId: number,
  payments: NormalizedPayment[],
  tenantId: TenantId
) {
  for (const payment of payments) {
    await txRun(
      client,
      'INSERT INTO pagamentos (order_id,method,amount_paid,change_given,tenant_id) VALUES (?,?,?,?,?)',
      [orderId, payment.method, payment.amount_paid, payment.change_given, tenantId]
    );
  }
}

function buildStockMovementReason(direction: 'saida' | 'entrada', orderId?: number) {
  const baseReason = direction === 'saida' ? 'Venda automática' : 'Exclusão de pedido';

  return orderId ? `${baseReason} | pedido:${orderId}` : baseReason;
}

async function applyIngredientStockChange(
  client: PoolClient,
  ingredientId: number,
  tenantId: TenantId,
  requestedQuantity: number,
  direction: 'saida' | 'entrada'
) {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return 0;
  }

  const ingredientStock = await txQ1<IngredientStockRow>(
    client,
    `SELECT COALESCE(estoque_atual, 0) AS estoque_atual
     FROM ingredientes
     WHERE id=? AND tenant_id=?
     FOR UPDATE`,
    [ingredientId, tenantId]
  );

  if (!ingredientStock) {
    return 0;
  }

  const currentStock = Math.max(Number(ingredientStock.estoque_atual || 0), 0);

  if (direction === 'saida') {
    const deductedQuantity = Math.min(currentStock, requestedQuantity);

    if (deductedQuantity > 0) {
      await txRun(
        client,
        'UPDATE ingredientes SET estoque_atual=? WHERE id=? AND tenant_id=?',
        [currentStock - deductedQuantity, ingredientId, tenantId]
      );
    }

    return deductedQuantity;
  }

  await txRun(
    client,
    'UPDATE ingredientes SET estoque_atual=? WHERE id=? AND tenant_id=?',
    [currentStock + requestedQuantity, ingredientId, tenantId]
  );

  return requestedQuantity;
}

async function adjustStockForItem(
  client: PoolClient,
  item: NormalizedOrderItem,
  tenantId: TenantId,
  direction: 'saida' | 'entrada',
  failOnMissingProduct = true,
  orderId?: number
) {
  const product = await txQ1<ProductRow>(
    client,
    'SELECT id, name, codigo_barras FROM produtos WHERE id=? AND tenant_id=?',
    [item.product_id, tenantId]
  );

  if (!product) {
    if (failOnMissingProduct) {
      throw new AppError(`Produto ${item.product_id} não encontrado`, 404);
    }

    return;
  }

  const movementLabel = buildStockMovementReason(direction, orderId);

  const resolution = await requireProductInventoryTargets({
    client,
    tenantId,
    productId: item.product_id,
    context: 'ordersService.adjustStockForItem',
    orderId,
    direction,
  });

  for (const target of resolution?.targets || []) {
    const requestedQuantity = Number(target.quantityMultiplier) * Number(item.quantity);
    const movedQuantity = await applyIngredientStockChange(
      client,
      Number(target.ingredientId),
      tenantId,
      requestedQuantity,
      direction
    );

    if (movedQuantity > 0) {
      await txRun(
        client,
        `INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id)
         VALUES (?,?,?,?,?)`,
        [target.ingredientId, direction, movedQuantity, movementLabel, tenantId]
      );
    }
  }
}

async function processStockDeduction(
  client: PoolClient,
  items: NormalizedOrderItem[],
  tenantId: TenantId,
  orderId: number
) {
  for (const item of items) {
    await adjustStockForItem(client, item, tenantId, 'saida', true, orderId);
  }
}

async function restoreStockFromRecordedMovements(
  client: PoolClient,
  orderId: number,
  tenantId: TenantId,
  entryContext: 'delete' | 'cancel' = 'delete'
) {
  const outgoingReason = buildStockMovementReason('saida', orderId);
  const incomingReason =
    entryContext === 'cancel'
      ? `Cancelamento de pedido | pedido:${orderId}`
      : buildStockMovementReason('entrada', orderId);

  const movementTotals = await txQAll<StockMovementSummaryRow>(
    client,
    `SELECT ingrediente_id, SUM(quantidade) AS quantity
     FROM estoque_movimentacoes
     WHERE tenant_id=?
       AND tipo='saida'
       AND motivo=?
     GROUP BY ingrediente_id`,
    [tenantId, outgoingReason]
  );

  if (movementTotals.length === 0) {
    return false;
  }

  for (const movement of movementTotals) {
    const quantity = Number(movement.quantity || 0);

    if (quantity <= 0) {
      continue;
    }

    await applyIngredientStockChange(
      client,
      Number(movement.ingrediente_id),
      tenantId,
      quantity,
      'entrada'
    );

    await txRun(
      client,
      `INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id)
       VALUES (?,?,?,?,?)`,
      [movement.ingrediente_id, 'entrada', quantity, incomingReason, tenantId]
    );
  }

  return true;
}

async function restoreStockForOrder(
  client: PoolClient,
  orderId: number,
  tenantId: TenantId,
  entryContext: 'delete' | 'cancel' = 'delete'
) {
  const restoredFromMovements = await restoreStockFromRecordedMovements(
    client,
    orderId,
    tenantId,
    entryContext
  );

  if (restoredFromMovements) {
    return;
  }

  const items = await txQAll<OrderItemRow>(
    client,
    `SELECT order_id, product_id, quantity, type, price_at_time
     FROM itens_pedido
     WHERE order_id=?`,
    [orderId]
  );

  for (const item of items) {
    await adjustStockForItem(
      client,
      {
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        type: item.type || undefined,
        price_at_time: Number(item.price_at_time || 0),
      },
      tenantId,
      'entrada',
      false,
      orderId
    );
  }
}

async function createOrderEvent(
  client: PoolClient,
  input: {
    pedidoId: number;
    tenantId: TenantId;
    tipo: string;
    statusAnterior?: string | null;
    statusNovo?: string | null;
    valor?: number;
    motivo?: string | null;
    estoqueReposto?: boolean;
    payload?: Record<string, unknown>;
    usuarioId?: number;
  }
) {
  await txRun(
    client,
    `INSERT INTO pedido_eventos
      (pedido_id,tenant_id,tipo,status_anterior,status_novo,valor,motivo,estoque_reposto,payload,usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      input.pedidoId,
      input.tenantId,
      input.tipo,
      input.statusAnterior || null,
      input.statusNovo || null,
      Number(input.valor || 0),
      input.motivo || null,
      input.estoqueReposto ? 1 : 0,
      input.payload ? JSON.stringify(input.payload) : null,
      input.usuarioId || null,
    ]
  );
}

function parseEventPayload(
  payload: OrderHistoryEventRow['payload']
): Record<string, unknown> | null {
  if (!payload) return null;
  if (typeof payload === 'object') return payload;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function mapOrderHistoryEvent(row: OrderHistoryEventRow): OrderHistoryEvent {
  return {
    id: row.id,
    tipo: row.tipo,
    status_anterior: row.status_anterior || null,
    status_novo: row.status_novo || null,
    valor: row.valor === null || row.valor === undefined ? null : Number(row.valor),
    motivo: row.motivo || null,
    estoque_reposto: Boolean(Number(row.estoque_reposto || 0)),
    payload: parseEventPayload(row.payload),
    usuario_id: row.usuario_id || null,
    created_at: row.created_at,
    synthetic: false,
  };
}

async function generateReceipt(
  client: PoolClient,
  {
    items,
    payments,
    observation,
    total_amount,
    orderNumber,
    orderId,
    tenantId,
    canal,
    tipoRetirada,
  }: {
    items: NormalizedOrderItem[];
    payments: NormalizedPayment[];
    observation?: string;
    total_amount: number;
    orderNumber: string;
    orderId: number;
    tenantId: TenantId;
    canal: string;
    tipoRetirada: string;
  }
) {
  const now = new Date().toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const clientRow = await txQ1<{ nome_estabelecimento: string; printer_config?: string | null }>(
    client,
    'SELECT nome_estabelecimento, printer_config FROM clientes WHERE id=?',
    [tenantId]
  );

  const productIds = items.map((item) => item.product_id);
  const productMap: Record<number, string> = {};

  if (productIds.length > 0) {
    const productRows = await txQAll<ProductRow>(
      client,
      `SELECT id, name, category, requires_preparation, production_type
       FROM produtos
       WHERE id IN (${productIds.map(() => '?').join(',')})
         AND tenant_id=?`,
      [...productIds, tenantId]
    );

    for (const product of productRows) {
      productMap[product.id] = product.name;
    }
  }

  const receiptHtml = gerarCupomHtml({
    titulo: 'RECIBO',
    estabelecimento: clientRow?.nome_estabelecimento || 'FlowPDV',
    orderNumber,
    data: now,
    variant: 'receipt',
    canal: canal === 'retirada' ? 'retirada' : 'balcao',
    paperWidthMm: getProfilePaperWidthMm(clientRow?.printer_config, 'caixa'),
    metadata: [{
      label: 'Operacao',
      value: tipoRetirada === 'levar' ? 'Retirada no local' : 'Venda de balcao',
    }],
    itens: items.map((item) => ({
      qtd: item.quantity,
      nome: productMap[item.product_id] || 'Produto',
      valor: Number(item.price_at_time) * Number(item.quantity),
    })),
    totais: [{ label: 'TOTAL', valor: total_amount, destaque: true }],
    pagamentos: payments.map((payment) => ({
      metodo: payment.method,
      valor: payment.amount_paid,
      troco: payment.change_given > 0 ? payment.change_given : undefined,
    })),
    observacao: observation || undefined,
  });

  await txRun(
    client,
    'UPDATE pedidos SET receipt_text=? WHERE id=? AND tenant_id=?',
    [receiptHtml, orderId, tenantId]
  );

  return receiptHtml;
}

function buildOrderFilters(filters: GetOrdersFilters) {
  const clauses = ['tenant_id=?'];
  const params: unknown[] = [filters.tenantId];

  if (filters.status) {
    clauses.push('status=?');
    params.push(filters.status);
  }

  if (filters.canal) {
    clauses.push('canal=?');
    params.push(filters.canal);
  }

  if (filters.excludeCanal) {
    clauses.push("COALESCE(canal, '')<>?");
    params.push(filters.excludeCanal);
  }

  if (filters.from) {
    clauses.push(`(created_at AT TIME ZONE '${TZ}')::date >= ?`);
    params.push(filters.from);
  }

  if (filters.to) {
    clauses.push(`(created_at AT TIME ZONE '${TZ}')::date <= ?`);
    params.push(filters.to);
  }

  if (filters.day) {
    clauses.push(`TO_CHAR(created_at AT TIME ZONE '${TZ}', 'DD')=?`);
    params.push(String(filters.day).padStart(2, '0'));
  }

  if (filters.month) {
    clauses.push(`TO_CHAR(created_at AT TIME ZONE '${TZ}', 'MM')=?`);
    params.push(String(filters.month).padStart(2, '0'));
  }

  if (filters.year) {
    clauses.push(`TO_CHAR(created_at AT TIME ZONE '${TZ}', 'YYYY')=?`);
    params.push(String(filters.year));
  }

  return { clauses, params };
}

export async function createOrder(data: CreateOrderInput, tenantId: TenantId) {
  ensureTenantId(tenantId);

  try {
    const input = normalizeCreateOrderInput(data);

    await ensureProductsExist(input.items, tenantId);

    return await withTx(async (client) => {
      const { nextNumber, orderNumber } = await generateOrderNumber(client, tenantId);
      const senhaPedido = nextNumber;

      const orderId = Number(
        await txInsert(
          client,
          `INSERT INTO pedidos
            (order_number,status,total_amount,observation,tenant_id,senha_pedido,tipo_retirada,canal)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            orderNumber,
            input.status,
            input.total_amount,
            input.observation || null,
            tenantId,
            senhaPedido,
            input.tipo_retirada,
            input.canal,
          ]
        )
      );

      await insertOrderItems(client, orderId, input.items, tenantId);
      await processStockDeduction(client, input.items, tenantId, orderId);
      await savePayments(client, orderId, input.payments, tenantId);
      await createOrderEvent(client, {
        pedidoId: orderId,
        tenantId,
        tipo: 'CRIACAO',
        statusNovo: input.status,
        valor: input.total_amount,
        payload: {
          origem: 'ordersService.createOrder',
          itens: input.items.length,
          pagamentos: input.payments.length,
          tipo_retirada: input.tipo_retirada,
          canal: input.canal,
        },
      });

      const receipt = await generateReceipt(client, {
        items: input.items,
        payments: input.payments,
        observation: input.observation,
        total_amount: input.total_amount,
        orderNumber,
        orderId,
        tenantId,
        canal: input.canal,
        tipoRetirada: input.tipo_retirada,
      });

      return {
        orderId,
        orderNumber,
        receipt,
        senhaPedido,
      };
    });
  } catch (error) {
    logError('ordersService.createOrder', error, { tenantId });
    throw error;
  }
}

export async function cancelOrder(input: CancelOrderInput) {
  ensureTenantId(input.tenantId);

  const orderId = parseOrderId(input.orderId);
  const subsenha = String(input.subsenha || '').trim();
  const motivo = String(input.motivo || '').trim();
  const shouldRestoreStock = Boolean(input.estoque_reposto);

  if (motivo.length < 3) {
    throw new AppError('Motivo do cancelamento Ã© obrigatÃ³rio', 400);
  }

  try {
    await validateSecurityPassword({
      tenantId: input.tenantId,
      userId: input.userId,
      password: subsenha,
      type: 'admin',
      requiredMessage: 'Subsenha obrigatÃ³ria',
      invalidMessage: 'Subsenha invÃ¡lida',
    });

    return await withTx(async (client) => {
      const order = await txQ1<OrderRow>(
        client,
        `SELECT *
         FROM pedidos
         WHERE id=? AND tenant_id=?
         FOR UPDATE`,
        [orderId, input.tenantId]
      );

      if (!order) {
        throw new AppError('Pedido nÃ£o encontrado', 404);
      }

      if (isCanceledStatus(order.status)) {
        throw new AppError('Pedido cancelado não pode ser alterado', 400);
      } 

      if (shouldRestoreStock) {
        await restoreStockForOrder(client, orderId, input.tenantId, 'cancel');
      }

      await txRun(
        client,
        `UPDATE pedidos
         SET status='Cancelado',
             cancelado_at=NOW(),
             cancelamento_motivo=?,
             cancelado_por=?,
             estoque_reposto=?,
             estoque_reposto_at=CASE WHEN ?=1 THEN NOW() ELSE NULL END
         WHERE id=? AND tenant_id=?`,
        [
          motivo,
          input.userId || null,
          shouldRestoreStock ? 1 : 0,
          shouldRestoreStock ? 1 : 0,
          orderId,
          input.tenantId,
        ]
      );

      await createOrderEvent(client, {
        pedidoId: orderId,
        tenantId: input.tenantId,
        tipo: 'CANCELAMENTO',
        statusAnterior: order.status,
        statusNovo: 'Cancelado',
        motivo,
        estoqueReposto: shouldRestoreStock,
        payload: {
          origem: 'ordersService.cancelOrder',
        },
        usuarioId: input.userId,
      });

      const updatedOrder = await txQ1<OrderRow>(
        client,
        'SELECT * FROM pedidos WHERE id=? AND tenant_id=?',
        [orderId, input.tenantId]
      );

      return updatedOrder;
    });
  } catch (error) {
    logError('ordersService.cancelOrder', error, {
      orderId,
      userId: input.userId,
      tenantId: input.tenantId,
      estoque_reposto: shouldRestoreStock,
    });
    throw error;
  }
}

export async function deleteOrder(input: DeleteOrderInput) {
  ensureTenantId(input.tenantId);

  const orderId = parseOrderId(input.orderId);
  const subsenha = String(input.subsenha || '').trim();

  try {
    await validateSecurityPassword({
      tenantId: input.tenantId,
      userId: input.userId,
      password: subsenha,
      type: 'admin',
      requiredMessage: 'Subsenha obrigatória',
      invalidMessage: 'Subsenha inválida',
    });

    return await withTx(async (client) => {
      const order = await txQ1<{ id: number }>(
        client,
        'SELECT id FROM pedidos WHERE id=? AND tenant_id=?',
        [orderId, input.tenantId]
      );

      if (!order) {
        throw new AppError('Pedido não encontrado', 404);
      }

      await restoreStockForOrder(client, orderId, input.tenantId);

      await txRun(client, 'DELETE FROM pagamentos WHERE order_id=?', [orderId]);
      await txRun(client, 'DELETE FROM itens_pedido WHERE order_id=?', [orderId]);
      await txRun(client, 'DELETE FROM pedidos WHERE id=? AND tenant_id=?', [orderId, input.tenantId]);

      return { success: true };
    });
  } catch (error) {
    logError('ordersService.deleteOrder', error, {
      orderId,
      userId: input.userId,
      tenantId: input.tenantId,
    });
    throw error;
  }
}

export async function refundOrder(input: RefundOrderInput) {
  ensureTenantId(input.tenantId);

  const orderId = parseOrderId(input.orderId);
  const subsenha = String(input.subsenha || '').trim();
  const motivo = String(input.motivo || '').trim();
  const refundValue = Number(input.valor);

  if (motivo.length < 3) {
    throw new AppError('Motivo do reembolso e obrigatorio', 400);
  }

  if (!Number.isFinite(refundValue) || refundValue <= 0) {
    throw new AppError('Valor do reembolso invalido', 400);
  }

  try {
    await validateSecurityPassword({
      tenantId: input.tenantId,
      userId: input.userId,
      password: subsenha,
      type: 'admin',
      requiredMessage: 'Subsenha obrigatoria',
      invalidMessage: 'Subsenha invalida',
    });

    return await withTx(async (client) => {
      const order = await txQ1<OrderRow>(
        client,
        `SELECT *
         FROM pedidos
         WHERE id=? AND tenant_id=?
         FOR UPDATE`,
        [orderId, input.tenantId]
      );

      if (!order) {
        throw new AppError('Pedido nao encontrado', 404);
      }

      const payments = await txQAll<PaymentRow>(
        client,
        `SELECT amount_paid, change_given
         FROM pagamentos
         WHERE order_id=? AND tenant_id=?
         FOR UPDATE`,
        [orderId, input.tenantId]
      );

      if (payments.length === 0) {
        throw new AppError('Pedido sem pagamentos para reembolso', 400);
      }

      const totalPaidCents = payments.reduce(
        (sum, payment) =>
          sum +
          toMoneyCents(Number(payment.amount_paid || 0) - Number(payment.change_given || 0)),
        0
      );

      if (totalPaidCents <= 0) {
        throw new AppError('Pedido sem valor pago disponivel para reembolso', 400);
      }

      const alreadyRefundedCents = toMoneyCents(Number(order.valor_reembolsado || 0));
      const refundValueCents = toMoneyCents(refundValue);
      const availableRefundCents = Math.max(totalPaidCents - alreadyRefundedCents, 0);

      if (availableRefundCents <= 0) {
        throw new AppError('Pedido ja foi totalmente reembolsado', 400);
      }

      if (refundValueCents - availableRefundCents > MONEY_TOLERANCE_CENTS) {
        throw new AppError('Reembolso nao pode exceder o valor pago', 400);
      }

      const nextRefundedCents = alreadyRefundedCents + refundValueCents;
      const isTotalRefund = totalPaidCents - nextRefundedCents <= MONEY_TOLERANCE_CENTS;
      const persistedRefundedCents = isTotalRefund ? totalPaidCents : nextRefundedCents;
      const refundStatus = isTotalRefund ? 'total' : 'parcial';

      await txRun(
        client,
        `UPDATE pedidos
         SET reembolso_status=?,
             valor_reembolsado=?,
             reembolsado_at=NOW(),
             reembolso_motivo=?,
             reembolsado_por=?
         WHERE id=? AND tenant_id=?`,
        [
          refundStatus,
          centsToMoney(persistedRefundedCents),
          motivo,
          input.userId || null,
          orderId,
          input.tenantId,
        ]
      );

      await createOrderEvent(client, {
        pedidoId: orderId,
        tenantId: input.tenantId,
        tipo: 'REEMBOLSO',
        statusAnterior: order.status,
        statusNovo: order.status,
        valor: centsToMoney(refundValueCents),
        motivo,
        payload: {
          origem: 'ordersService.refundOrder',
          reembolso_status: refundStatus,
          valor_pago: centsToMoney(totalPaidCents),
          valor_reembolsado_anterior: centsToMoney(alreadyRefundedCents),
          valor_reembolsado_atual: centsToMoney(persistedRefundedCents),
        },
        usuarioId: input.userId,
      });

      const updatedOrder = await txQ1<OrderRow>(
        client,
        'SELECT * FROM pedidos WHERE id=? AND tenant_id=?',
        [orderId, input.tenantId]
      );

      return updatedOrder;
    });
  } catch (error) {
    logError('ordersService.refundOrder', error, {
      orderId,
      userId: input.userId,
      tenantId: input.tenantId,
      valor: refundValue,
    });
    throw error;
  }
}

export async function updateOrderStatus(input: UpdateOrderStatusInput) {
  ensureTenantId(input.tenantId);
  
  const orderId = parseOrderId(input.orderId);
  const status = String(input.status || '').trim();

  if (!status) {
    throw new AppError('Status é obrigatório', 400);
  }

  if (!ALLOWED_ORDER_STATUSES.has(status)) {
    throw new AppError('Status inválido', 400);
  }

  if (isCanceledStatus(status)) {
    throw new AppError('Use o fluxo de cancelamento para cancelar pedidos', 400);
  }

  try {
    return await withTx(async (client) => {
      const order = await txQ1<OrderRow>(
        client,
        `SELECT *
         FROM pedidos
         WHERE id=? AND tenant_id=?
         FOR UPDATE`,
        [orderId, input.tenantId]
      );

      if (!order) {
        throw new AppError('Pedido não encontrado', 404);
      }
      
      if (order.status === 'Aguardando confirmação') {
        throw new AppError('Pedido via QR Code precisa ser confirmado antes de alterar o status', 400);
      }

      if (isCanceledStatus(order.status) || order.cancelado_at) {
        throw new AppError('Pedido cancelado nao pode ter status alterado', 400);
      }

      if (order.status === status) {
        return order;
      }

      if (String(order.canal || '').trim().toLowerCase() === 'delivery') {
        throw new AppError(
          'Pedido de delivery nao pode ser avancado por aqui. Use a aba Delivery para continuar o fluxo e definir o motoboy.',
          400
        );
      }

      const effectiveStatus =
        status === 'Em Preparo' && !(await orderHasPreparationItems(client, orderId, input.tenantId))
          ? 'Pronto'
          : status;

      await txRun(
        client,
        'UPDATE pedidos SET status=? WHERE id=? AND tenant_id=?',
        [effectiveStatus, orderId, input.tenantId]
      );

      await createOrderEvent(client, {
        pedidoId: orderId,
        tenantId: input.tenantId,
        tipo: 'STATUS',
        statusAnterior: order.status,
        statusNovo: effectiveStatus,
        payload: {
          origem: 'ordersService.updateOrderStatus',
          requested_status: status,
        },
        usuarioId: input.userId,
      });

      const updatedOrder = await txQ1<OrderRow>(
        client,
        'SELECT * FROM pedidos WHERE id=? AND tenant_id=?',
        [orderId, input.tenantId]
      );

      return updatedOrder;
    });
  } catch (error) {
    logError('ordersService.updateOrderStatus', error, {
      orderId,
      status,
      tenantId: input.tenantId,
    });
    throw error;
  }
}

export async function getOrderHistory(input: GetOrderHistoryInput) {
  ensureTenantId(input.tenantId);

  const orderId = parseOrderId(input.orderId);

  try {
    const order = await q1<Pick<OrderRow, 'id' | 'created_at' | 'status' | 'total_amount'>>(
      `SELECT id, created_at, status, total_amount
       FROM pedidos
       WHERE id=? AND tenant_id=?`,
      [orderId, input.tenantId]
    );

    if (!order) {
      throw new AppError('Pedido não encontrado', 404);
    }

    const rows = await qAll<OrderHistoryEventRow>(
      `SELECT id, tipo, status_anterior, status_novo, valor, motivo, estoque_reposto, payload, usuario_id, created_at
       FROM pedido_eventos
       WHERE pedido_id=? AND tenant_id=?
       ORDER BY created_at ASC, id ASC`,
      [orderId, input.tenantId]
    );

    const events = rows.map(mapOrderHistoryEvent);

    if (!events.some((event) => event.tipo === 'CRIACAO')) {
      events.unshift({
        id: `synthetic-created-${orderId}`,
        tipo: 'CRIACAO',
        status_anterior: null,
        status_novo: null,
        valor: Number(order.total_amount || 0),
        motivo: null,
        estoque_reposto: false,
        payload: {
          origem: 'ordersService.getOrderHistory',
        },
        usuario_id: null,
        created_at: order.created_at,
        synthetic: true,
      });
    }

    return events;
  } catch (error) {
    logError('ordersService.getOrderHistory', error, {
      orderId,
      tenantId: input.tenantId,
    });
    throw error;
  }
}

export async function getOrders(filters: GetOrdersFilters) {
  ensureTenantId(filters.tenantId);

  try {
    const { clauses, params } = buildOrderFilters(filters);
    let sql = `
      SELECT *
      FROM pedidos
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC, id DESC
    `;

    if (filters.limit !== undefined && filters.limit !== '') {
      const parsedLimit = Number(filters.limit);
      const safeLimit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 100)
        : 20;

      sql += ` LIMIT ${safeLimit}`;
    }

    const orders = await qAll<OrderRow>(sql, params);

    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const items = await qAll<OrderItemRow>(
      `SELECT ip.order_id, ip.product_id, ip.quantity, ip.type, ip.price_at_time,
              p.name AS product_name, p.category AS product_category,
              p.production_type, p.requires_preparation
       FROM itens_pedido ip
       LEFT JOIN produtos p ON p.id=ip.product_id
       WHERE ip.order_id IN (${orderIds.map(() => '?').join(',')})
       ORDER BY ip.id ASC`,
      orderIds
    );

    const itemsByOrder = new Map<number, OrderItemRow[]>();

    for (const item of items) {
      const bucket = itemsByOrder.get(Number(item.order_id)) || [];
      bucket.push(item);
      itemsByOrder.set(Number(item.order_id), bucket);
    }

    return orders.map((order) => ({
      ...order,
      estoque_reposto: Boolean(Number(order.estoque_reposto || 0)),
      items: (itemsByOrder.get(Number(order.id)) || []).map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        type: item.type || undefined,
        price_at_time: Number(item.price_at_time || 0),
        product_name: item.product_name || 'Produto',
        product_category: item.product_category || null,
        production_type: item.production_type || null,
        requires_preparation: item.requires_preparation ?? null,
        name: item.product_name || 'Produto',
      })),
    }));
  } catch (error) {
    logError('ordersService.getOrders', error, {
      tenantId: filters.tenantId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
    });
    throw error;
  }

}

export async function confirmQrOrder(input: { orderId: number | string; tenantId: TenantId; userId?: number }) {
  ensureTenantId(input.tenantId);
  const orderId = parseOrderId(input.orderId);

  try {
    return await withTx(async (client) => {
      // 1. Busca o pedido travando a linha (FOR UPDATE)
      const order = await txQ1<OrderRow>(
        client,
        `SELECT * FROM pedidos WHERE id=? AND tenant_id=? FOR UPDATE`,
        [orderId, input.tenantId]
      );

      if (!order) {
        throw new AppError('Pedido não encontrado', 404);
      }

      if (order.status !== 'Aguardando confirmação') {
        throw new AppError('Pedido não está aguardando confirmação', 400);
      }

      // 2. Verifica se algum item precisa de preparo na cozinha
      const requiresPrep = await orderHasPreparationItems(client, orderId, input.tenantId);
      const novoStatus = requiresPrep ? 'Em Preparo' : 'Pronto';

      // 3. Atualiza o status
      await txRun(
        client,
        'UPDATE pedidos SET status=? WHERE id=? AND tenant_id=?',
        [novoStatus, orderId, input.tenantId]
      );

      // 4. Registra no histórico do pedido
      await createOrderEvent(client, {
        pedidoId: orderId,
        tenantId: input.tenantId,
        tipo: 'STATUS',
        statusAnterior: order.status,
        statusNovo: novoStatus,
        payload: { origem: 'ordersService.confirmQrOrder' },
        usuarioId: input.userId,
      });

      return novoStatus;
    });
  } catch (error) {
    logError('ordersService.confirmQrOrder', error, { orderId, tenantId: input.tenantId });
    throw error;
  }
}