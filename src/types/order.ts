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
  tipo_retirada?: string;
  status?: OrderStatus;
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

export interface UpdateOrderStatusInput {
  orderId: number | string;
  status: OrderStatus;
  tenantId: number | string;
}

export interface GetOrdersFilters {
  tenantId: number | string;
  status?: string;
  from?: string;
  to?: string;
  day?: string;
  month?: string;
  year?: string;
  limit?: number | string;
}
