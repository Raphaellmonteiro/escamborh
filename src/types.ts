// ================================================================
// types.ts â€” Tipos globais do FlowPDV
// ================================================================

// â”€â”€ Produto / CatÃ¡logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Product {
  id: number;
  public_id?: string | null;
  name: string;
  price: number;
  category: string;
  active: number;
  photo_url?: string | null;
  color?: string | null;
  codigo_barras?: string | null;
  marca?: string | null;
  descricao?: string | null;
  custo?: number;
  destaque?: number;
  ordem?: number;
  disponivel_de?: string | null;
  disponivel_ate?: string | null;
  requires_preparation?: number | boolean | null;
}

export interface Category {
  id: number;
  nome: string;
  tenant_id: number;
}

// â”€â”€ Carrinho / Pedido â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type OrderType   = 'Mesa' | 'BalcÃ£o' | 'Delivery' | string;
export type PaymentMethod = 'Dinheiro' | 'PIX' | 'DÃ©bito' | 'CrÃ©dito' | string;

export interface OrderItem {
  id?: number;
  product_id: number;
  name: string;
  price_at_time: number;
  quantity: number;
  type?: OrderType;
  observation?: string;
  funcionario_id?: number | null;
  funcionario_nome?: string | null;
  cliente_nome?: string | null;
}

export interface Order {
  id: number;
  order_number: string;
  status: string;
  canal?: string | null;
  total_amount: number;
  observation?: string;
  receipt_text?: string;
  created_at: string;
  items: OrderItem[];
  tipo_retirada?: string;
  senha_pedido?: string;
  cancelado_at?: string | null;
  cancelamento_motivo?: string | null;
  estoque_reposto?: boolean;
  estoque_reposto_at?: string | null;
  mesa_id?: number | null;
  comanda_id?: number | null;
  subtotal?: number;
  taxa_servico_ativa?: number;
  taxa_servico_percentual?: number;
  valor_taxa_servico?: number;
  couvert_ativo?: number;
  couvert_valor_unitario?: number;
  couvert_quantidade_pessoas?: number;
  valor_couvert?: number;
  total_extras?: number;
}

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface DashboardStats {
  today: number;
  week: number;
  month: number;
  filteredTotal: number;
  totalExpenses: number;
  totalRepassesPagos: number;
  pendentes: number;
  productSales: { name: string; quantity: number }[];
}

export interface CashReport {
  cash: number;
  pix: number;
  debit: number;
  credit: number;
  total: number;
}

// â”€â”€ Financeiro â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  created_at: string;
}

// â”€â”€ Caixa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Caixa {
  id: number;
  data: string;
  fundo_inicial: number;
  valor_contado?: number;
  status: 'aberto' | 'fechado';
  observacao?: string;
  created_at: string;
  closed_at?: string | null;
}

// â”€â”€ Estoque â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Ingrediente {
  id: number;
  public_id?: string | null;
  nome: string;
  unidade: string;
  estoque_atual: number;
  estoque_minimo: number;
  custo_unitario?: number;
  fornecedor?: string;
  codigo_barras?: string;
  unidade_compra?: string;
  // campos calculados pela API
  status?: 'ok' | 'baixo' | 'esgotado';
  usado_hoje?: number;
  recebido_hoje?: number;
  created_at: string;
}

export interface MovimentacaoEstoque {
  id: number;
  ingrediente_id?: number;
  ingrediente_nome: string;
  tipo: 'entrada' | 'saida' | 'ajuste';
  quantidade: number;
  motivo: string;
  unidade: string;
  created_at: string;
}

export interface FichaTecnicaItem {
  id: number;
  product_id: number;
  ingrediente_id: number;
  nome?: string | null;
  ingrediente_nome?: string | null;
  unidade: string;
  quantidade_usada: number;
  estoque_atual: number;
  custo_unitario?: number;
}

export interface RelatorioConsumoItem {
  id: number;
  nome: string;
  unidade: string;
  custo_unitario: number;
  fornecedor?: string;
  total_saida: number;
  total_entrada: number;
  custo_total: number;
  qtd_saidas: number;
}

export interface RelatorioConsumo {
  consumo: RelatorioConsumoItem[];
  custo_total_periodo: number;
  periodo: { inicio: string; fim: string };
}

// â”€â”€ Mesas (Bar / Restaurante) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type PendingInventoryClassification =
  | 'safe_barcode_alignment'
  | 'safe_recipe_explicit'
  | 'ambiguous_exact_name'
  | 'unmatched_manual_review';

export type PendingInventorySafeAction =
  | 'align_product_barcode'
  | 'create_explicit_recipe';

export type PendingInventoryManualAction =
  | 'create_missing_ingredient_recipe';

export type ProductInventoryResolutionMode =
  | 'recipe'
  | 'barcode_exact'
  | 'unresolved';

export interface PendingInventoryIngredientCandidate {
  ingredientId: number;
  ingredientPublicId?: string | null;
  ingredientName: string;
  ingredientBarcode?: string | null;
  ingredientUnit?: string | null;
  ingredientStock: number;
  ingredientBarcodeUnique: boolean;
}

export interface LegacyFallbackPendingProduct {
  resolutionMode: ProductInventoryResolutionMode;
  usesLegacyNameFallback: boolean;
  productId: number;
  productPublicId?: string | null;
  productName: string;
  productActive: boolean;
  productCategory?: string | null;
  productBarcode?: string | null;
  totalOrderUsages: number;
  lastOrderAt?: string | null;
  exactNameMatchCount: number;
  ambiguousNameMatch: boolean;
  ingredientId?: number | null;
  ingredientPublicId?: string | null;
  ingredientName?: string | null;
  ingredientBarcode?: string | null;
  ingredientUnit?: string | null;
  ingredientStock: number;
  candidateIngredients: PendingInventoryIngredientCandidate[];
  classification: PendingInventoryClassification;
  isPreparedProduct: boolean;
  safeFixAction?: PendingInventorySafeAction | null;
  safeFixLabel?: string | null;
  safeFixReason?: string | null;
  manualFixAction?: PendingInventoryManualAction | null;
  manualFixLabel?: string | null;
  manualFixReason?: string | null;
  suggestedFix: string;
}

export interface LegacyFallbackAuditReport {
  generatedAt: string;
  summary: {
    totalPendingProducts: number;
    activePendingProducts: number;
    inactivePendingProducts: number;
    legacyFallbackProducts: number;
    ambiguousPendingProducts: number;
    singleMatchPendingProducts: number;
    unmatchedPendingProducts: number;
    safeBarcodeCandidates: number;
    safeRecipeCandidates: number;
    safeFixCandidates: number;
    manualPhaseOneCandidates: number;
  };
  items: LegacyFallbackPendingProduct[];
}

export interface Mesa {
  id: number;
  numero: number;
  status: 'aberta' | 'fechada';
  tenant_id: number;
  opened_at: string | null;
  comanda_id: number | null;
  total_itens: number;
  subtotal_valor?: number;
  total_valor: number;
  valor_taxa_servico?: number;
  valor_couvert?: number;
  total_extras?: number;
}

export interface Comanda {
  id: number;
  mesa_id: number;
  status: 'aberta' | 'fechada';
  created_at: string;
  closed_at: string | null;
  taxa_servico_ativa?: number;
  taxa_servico_percentual?: number;
  couvert_ativo?: number;
  couvert_valor_unitario?: number;
  couvert_quantidade_pessoas?: number;
  subtotal?: number;
  valor_taxa_servico?: number;
  valor_couvert?: number;
  total_extras?: number;
  total_com_extras?: number;
  itens: ItemComanda[];
}

export interface ItemComanda {
  id: number;
  comanda_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price_at_time: number;
  created_at: string;
  tenant_id: number;
}
