export interface TipoItem {
  type: string;
  label: string;
  emoji: string;
  cor: 'blue' | 'amber' | 'green' | 'purple';
  usaMesas?: boolean;
}

export interface SegmentOption {
  value: string;
  label: string;
  icon: string;
}

export const ACTIVE_SEGMENT_OPTIONS: SegmentOption[] = [
  { value: 'Restaurante', label: 'Restaurante', icon: '🍽️' },
  { value: 'Fast Food', label: 'Hamburgueria / Lanchonete', icon: '🍔' },
  { value: 'Bar', label: 'Bar & Pub', icon: '🍺' },
  { value: 'Adega', label: 'Adega de Bebidas', icon: '🍷' },
];

const SEGMENT_ALIASES: Record<string, string> = {
  Restaurante: 'Restaurante/Food',
  'Restaurante/Food': 'Restaurante/Food',
  'Fast Food': 'Fast Food',
  'Hamburgueria / Lanchonete': 'Fast Food',
  Bar: 'Bar/Pub',
  'Bar & Pub': 'Bar/Pub',
  'Bar/Pub': 'Bar/Pub',
  Adega: 'Adega',
  'Adega de Bebidas': 'Adega',
  'Padaria/Café': 'Fast Food',
  'Padaria/Cafe': 'Fast Food',
  'Buffet/Self-service': 'Restaurante/Food',
  'Buffet / Self-service': 'Restaurante/Food',
  'Food Truck': 'Fast Food',
};

const ACTIVE_SEGMENTS = new Set(['Restaurante/Food', 'Fast Food', 'Bar/Pub', 'Adega']);

const PREP_CATEGORIES = ['Prato', 'Lanche', 'Pizza', 'Comida', 'Refeição', 'Porção', 'Dose', 'Petisco', 'Entrada', 'Sobremesa', 'Sushi', 'Japonês'];

export function categoryNeedsPrep(category: string): boolean {
  return PREP_CATEGORIES.some((c) => category.toLowerCase().includes(c.toLowerCase()));
}

const TIPOS_RESTAURANTE: TipoItem[] = [
  { type: 'Mesa', label: 'Para Mesa', emoji: '🪑', cor: 'blue', usaMesas: true },
  { type: 'Viagem', label: 'Para Viagem', emoji: '🛍️', cor: 'amber' },
];

const TIPOS_BALCAO: TipoItem[] = [
  { type: 'Venda Direta', label: 'Venda Direta', emoji: '🛒', cor: 'blue' },
];

export interface SegCfg {
  labelSidebarPOS: string;
  labelSidebarPedidos: string;
  labelSidebarProdutos: string;
  labelSidebarEstoque: string;
  estoqueTitulo: string;
  estoqueSubtitulo: string;
  estoqueAba: string;
  estoqueBotao: string;
  estoqueModalEditar: string;
  temMesas: boolean;
  temKDS: boolean;
  labelRecibo: string;
  tituloPedidos: string;
  tituloAtivos: string;
  statusConcluido: string;
  usaTipoItem: boolean;
  tiposItem: TipoItem[];
  categoryEmojis: Record<string, string>;
  emojiDefault: string;
}

const DEFAULT: SegCfg = {
  labelSidebarPOS: 'Balcão / PDV',
  labelSidebarPedidos: 'Pedidos',
  labelSidebarProdutos: 'Cardápio',
  labelSidebarEstoque: 'Estoque',
  estoqueTitulo: 'Controle de Produtos & Insumos',
  estoqueSubtitulo: 'Controle de insumos e movimentações',
  estoqueAba: 'Ingredientes',
  estoqueBotao: 'Novo Ingrediente',
  estoqueModalEditar: 'Editar Ingrediente',
  temMesas: false,
  temKDS: false,
  labelRecibo: 'Estabelecimento',
  tituloPedidos: 'Pedidos',
  tituloAtivos: 'Pedidos Ativos',
  statusConcluido: 'Concluído',
  usaTipoItem: false,
  tiposItem: TIPOS_BALCAO,
  categoryEmojis: {},
  emojiDefault: '🛒',
};

const MAPA: Record<string, SegCfg> = {
  'Restaurante/Food': {
    ...DEFAULT,
    estoqueSubtitulo: 'Controle de insumos e movimentações do restaurante',
    temMesas: true,
    temKDS: true,
    labelRecibo: 'Restaurante',
    statusConcluido: 'Entregue',
    usaTipoItem: true,
    tiposItem: TIPOS_RESTAURANTE,
    categoryEmojis: { Bebida: '🥤', Sobremesa: '🍮', Entrada: '🥗', Prato: '🍽️', Porção: '🍗' },
    emojiDefault: '🍽️',
  },
  'Fast Food': {
    ...DEFAULT,
    labelSidebarPOS: 'Caixa / PDV',
    estoqueTitulo: 'Estoque de Insumos',
    estoqueSubtitulo: 'Controle de ingredientes e produtos do fast food',
    temKDS: true,
    labelRecibo: 'Fast Food',
    statusConcluido: 'Entregue',
    categoryEmojis: { Bebida: '🥤', Lanche: '🍔', Combo: '🍟' },
    emojiDefault: '🍔',
  },
  'Bar/Pub': {
    ...DEFAULT,
    estoqueTitulo: 'Estoque de Bebidas & Insumos',
    estoqueSubtitulo: 'Controle de bebidas, insumos e movimentações do bar',
    estoqueAba: 'Produtos & Bebidas',
    estoqueBotao: 'Novo Produto',
    estoqueModalEditar: 'Editar Produto',
    temMesas: true,
    labelRecibo: 'Bar & Pub',
    statusConcluido: 'Entregue',
    usaTipoItem: true,
    tiposItem: TIPOS_RESTAURANTE,
    categoryEmojis: { Bebida: '🍺', Dose: '🥃', Porção: '🍗', Petisco: '🧀' },
    emojiDefault: '🍺',
  },
  Adega: {
    ...DEFAULT,
    labelSidebarPOS: 'Caixa / PDV',
    labelSidebarPedidos: 'Vendas',
    labelSidebarProdutos: 'Produtos',
    estoqueTitulo: 'Estoque da Adega',
    estoqueSubtitulo: 'Controle de bebidas por unidade, caixa e fardo',
    estoqueAba: 'Bebidas & Produtos',
    estoqueBotao: 'Novo Produto',
    estoqueModalEditar: 'Editar Produto',
    labelRecibo: 'Adega',
    tituloPedidos: 'Vendas',
    tituloAtivos: 'Vendas Ativas',
    categoryEmojis: { Cerveja: '🍺', Vinho: '🍷', Destilado: '🥃', Refrigerante: '🥤' },
    emojiDefault: '🍷',
  },
};

MAPA.Restaurante = MAPA['Restaurante/Food'];
MAPA.Bar = MAPA['Bar/Pub'];

export function normalizeSegment(segmento: string): string {
  return SEGMENT_ALIASES[segmento] ?? segmento;
}

export function getSegCfg(segmento: string): SegCfg {
  return MAPA[getOperationalSegment(segmento)] ?? DEFAULT;
}

export function getOperationalSegment(segmento: string): string {
  const normalized = normalizeSegment(segmento);
  return ACTIVE_SEGMENTS.has(normalized) ? normalized : 'Restaurante/Food';
}

export function isBar(segmento: string): boolean {
  return segmento === 'Bar' || segmento === 'Bar/Pub';
}

export function isRestaurante(segmento: string): boolean {
  return segmento === 'Restaurante' || segmento === 'Restaurante/Food';
}

export function temMesas(segmento: string): boolean {
  return getSegCfg(segmento).temMesas;
}
