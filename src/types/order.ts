export type OrderStatus =
  | 'Criado'
  | 'Em Preparo'
  | 'Pronto'
  | 'Entregue'
  | 'Concluído'
  | 'Cancelado'
  | 'cancelado'
  | 'Pedido Recebido'
  | 'Pronto para Entrega'
  | 'Saiu para Entrega'
  | string;

export interface OrderItemInput {
  product_id: number;
  quantity: number;
  type?: string;
  price_at_time?: number;
  unitPrice?: number;
  variation_id?: number | null;
  /** Observação / resumo de opções e adicionais do item (cardápio envia como `obs_opcoes`). */
  observation?: string;
  obs_opcoes?: string;
  /** Mapa grupoId → { opcaoId: quantidade } — persistido como JSON em `selecoes_json`. */
  selecoes?: Record<number, Record<number, number>> | null;
}

export interface PaymentInput {
  method: string;
  amount_paid: number;
  amount?: number;
  change_given?: number;
}

export interface CreateOrderInput {
  items: OrderItemInput[];
  payments: PaymentInput[];
  observation?: string;
  total_amount?: number;
  total?: number;
  taxa_total?: number;
  tipo_retirada?: string;
  status?: OrderStatus;
  /** ID em `delivery_clientes` (cliente da loja); opcional. */
  cliente_id?: number | string | null;
}

export interface DeleteOrderInput {
  orderId: number | string;
  subsenha: string;
  userId?: number;
  tenantId: number | string;
}

export interface CancelOrderInput {
  orderId: number | string;
  subsenha: string;
  motivo: string;
  estoque_reposto?: boolean;
  userId?: number;
  tenantId: number | string;
}

export interface RefundOrderInput {
  orderId: number | string;
  subsenha: string;
  motivo: string;
  valor: number | string;
  userId?: number;
  tenantId: number | string;
}

export interface UpdateOrderStatusInput {
  orderId: number | string;
  status: OrderStatus;
  userId?: number;
  tenantId: number | string;
}

export interface GetOrdersFilters {
  tenantId: number | string;
  status?: string;
  canal?: string;
  excludeCanal?: string;
  activeOnly?: boolean;
  from?: string;
  to?: string;
  day?: string;
  month?: string;
  year?: string;
  limit?: number | string;
}

export interface GetOrderHistoryInput {
  orderId: number | string;
  tenantId: number | string;
}

export interface OrderHistoryEvent {
  id: number | string;
  tipo: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  valor?: number | null;
  motivo?: string | null;
  estoque_reposto?: boolean;
  payload?: Record<string, unknown> | null;
  usuario_id?: number | null;
  created_at: string;
  synthetic?: boolean;
}
