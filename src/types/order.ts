import type { ComboPedidoPorGrupo } from './comboOrder';

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
  /**
   * JSON em `selecoes_json`: mapa grupo de adicionais → { opcaoId: quantidade }.
   * Combos: chave `combo` com grupoId → instâncias
   * Por instância: `produto_id`, `instancia_id`, opcionalmente `selecoes` ou `opcoes` ou `adicionais` (mesmo mapa), `observacao`, `extras`; ou formato legado `grupoId` → `{ productId: qtd }`.
   * Mapa por instância = mesmo formato de adicionais do produto componente (`produto_grupos_opcao` / `produto_opcao_itens`).
   */
  selecoes?:
    | (Record<number, Record<number, number>> & {
        combo?: ComboPedidoPorGrupo | Record<number, Record<number, number>>;
      })
    | null;
}

export interface PaymentInput {
  method: string;
  amount_paid: number;
  amount?: number;
  change_given?: number;
}

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | string;

export type PaymentMethod =
  | 'cash'
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'voucher'
  | 'bank_transfer'
  | 'other'
  | string;

export type PaymentProvider = 'internal' | 'manual' | 'generic' | string;

export interface OrderPaymentRecord {
  id: number;
  tenant_id: number;
  order_id: number;
  method: PaymentMethod;
  provider?: PaymentProvider | null;
  status: PaymentStatus;
  amount: number;
  external_id?: string | null;
  external_reference?: string | null;
  qr_code_text?: string | null;
  qr_code_image_base64?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderPaymentInput {
  tenant_id: number | string;
  order_id: number | string;
  method: PaymentMethod;
  provider?: PaymentProvider | null;
  status?: PaymentStatus;
  amount: number;
  external_id?: string | null;
  external_reference?: string | null;
  qr_code_text?: string | null;
  qr_code_image_base64?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
  metadata_json?: string | null;
}

export interface UpdateOrderPaymentStatusInput {
  id: number | string;
  tenant_id: number | string;
  status: PaymentStatus;
  paid_at?: string | null;
  expires_at?: string | null;
  external_id?: string | null;
  external_reference?: string | null;
  qr_code_text?: string | null;
  qr_code_image_base64?: string | null;
  metadata_json?: string | null;
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

export interface ConfirmOrderPaymentInput {
  orderId: number | string;
  tenantId: number | string;
  userId?: number;
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
