// ================================================================
// types.ts — Tipos globais do FlowPDV
// ================================================================

// ── Produto / Catálogo ───────────────────────────────────────────
export interface Product {
  id: number;
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
}

export interface Category {
  id: number;
  nome: string;
  tenant_id: number;
}

// ── Carrinho / Pedido ────────────────────────────────────────────
export type OrderType   = 'Mesa' | 'Balcão' | 'Delivery' | string;
export type PaymentMethod = 'Dinheiro' | 'PIX' | 'Débito' | 'Crédito' | string;

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
}

// ── Dashboard ────────────────────────────────────────────────────
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

// ── Financeiro ───────────────────────────────────────────────────
export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  created_at: string;
}

// ── Caixa ────────────────────────────────────────────────────────
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

// ── Estoque ──────────────────────────────────────────────────────
export interface Ingrediente {
  id: number;
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
  nome: string;
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

// ── Mesas (Bar / Restaurante) ────────────────────────────────────
export interface Mesa {
  id: number;
  numero: number;
  status: 'aberta' | 'fechada';
  tenant_id: number;
  opened_at: string | null;
  comanda_id: number | null;
  total_itens: number;
  total_valor: number;
}

export interface Comanda {
  id: number;
  mesa_id: number;
  status: 'aberta' | 'fechada';
  created_at: string;
  closed_at: string | null;
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

// ── Barbearia / Salão ────────────────────────────────────────────
export interface BarberCliente {
  id: number;
  nome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  data_nascimento?: string;
  observacoes?: string;
  created_at: string;
  tem_assinatura?: number;
  plano_nome?: string;
}

export interface Agendamento {
  id: number;
  cliente_id?: number;
  cliente_nome: string;
  servico_nome: string;
  barbeiro: string;
  data: string;
  hora: string;
  status: 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado';
  observacao?: string;
  valor: number;
  funcionario_id?: number | null;
}

export interface FidelidadeRegra {
  id: number;
  nome: string;
  meta: number;
  descricao?: string;
  ativo: number;
}

export interface FidelidadeCartao {
  id: number;
  regra_id: number;
  regra_nome: string;
  meta: number;
  contagem: number;
  total_ganhos: number;
}

export interface PlanoServico {
  id: number;
  plano_id: number;
  produto_id: number;
  produto_nome: string;
  quantidade: number;
}

export interface AssinaturaPlan {
  id: number;
  nome: string;
  descricao?: string;
  valor_mensal: number;
  ativo: number;
  tipo_plano: 'pacote' | 'ilimitado';
  servicos?: PlanoServico[];
}

export interface BarberFuncionario {
  id: number;
  nome: string;
  cargo: string;
  telefone?: string;
  percentual_repasse: number;
  ativo: number;
  cor: string;
}
