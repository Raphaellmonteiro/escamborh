// ── TipoItem — usado no POSScreen para modal de tipo de pedido ───────────────
export interface TipoItem {
  type:     string;
  label:    string;
  emoji:    string;
  cor:      'blue' | 'amber' | 'green' | 'purple';
  usaMesas?: boolean;
}

export interface SegmentOption {
  value: string;
  label: string;
  icon: string;
}

export const ACTIVE_SEGMENT_OPTIONS: SegmentOption[] = [
  { value: 'Restaurante', label: 'Restaurante', icon: '🍽️' },
  { value: 'Fast Food', label: 'Fast Food', icon: '🍔' },
  { value: 'Bar', label: 'Bar & Pub', icon: '🍺' },
  { value: 'Adega', label: 'Adega de Bebidas', icon: '🍷' },
];

const SEGMENT_ALIASES: Record<string, string> = {
  Restaurante: 'Restaurante/Food',
  'Restaurante/Food': 'Restaurante/Food',
  'Fast Food': 'Fast Food',
  Bar: 'Bar/Pub',
  'Bar/Pub': 'Bar/Pub',
  Adega: 'Adega',
  Barbearia: 'Barbearia/Salão',
  'Barbearia/Salão': 'Barbearia/Salão',
  Comercio: 'Comércio Geral',
  'Comercio Geral': 'Comércio Geral',
  'Comércio Geral': 'Comércio Geral',
};

const DISABLED_SEGMENTS = new Set(['Barbearia/Salão', 'Comércio Geral']);
const ACTIVE_SEGMENTS = new Set(['Restaurante/Food', 'Fast Food', 'Bar/Pub', 'Adega']);

// Categorias que precisam de preparo (vão para KDS/cozinha)
const PREP_CATEGORIES = ['Prato', 'Lanche', 'Pizza', 'Comida', 'Refeição', 'Porção', 'Dose', 'Petisco', 'Entrada', 'Sobremesa', 'Sushi', 'Japonês'];
export function categoryNeedsPrep(category: string): boolean {
  return PREP_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()));
}

// Tipos de item padrão por segmento
const TIPOS_RESTAURANTE: TipoItem[] = [
  { type: 'Mesa',         label: 'Para Mesa',    emoji: '🪑', cor: 'blue',  usaMesas: true  },
  { type: 'Viagem',       label: 'Para Viagem',  emoji: '🛍️', cor: 'amber'  },
];
const TIPOS_BALCAO: TipoItem[] = [
  { type: 'Venda Direta', label: 'Venda Direta', emoji: '🛒', cor: 'blue'   },
];
const TIPOS_BARBEARIA: TipoItem[] = [
  { type: 'Serviço',      label: 'Serviço',      emoji: '✂️', cor: 'purple' },
  { type: 'Produto',      label: 'Produto',      emoji: '🧴', cor: 'green'  },
];

// Comércio geral: venda direta de balcão, sem tipos extras
const TIPOS_COMERCIO: TipoItem[] = [
  { type: 'Venda', label: 'Venda', emoji: '🛒', cor: 'blue' },
];

// ── src/config/segmentos.ts ───────────────────────────────────────────────────
// Mapa central de configurações por segmento.
// Cada segmento tem seu arquivo em src/segments/<nome>/config.ts
// Este arquivo centraliza o getSegCfg() usado em App.tsx e telas compartilhadas.

export interface SegCfg {
  // Sidebar
  labelSidebarPOS:      string;
  labelSidebarPedidos:  string;
  labelSidebarProdutos: string;
  labelSidebarEstoque:  string;
  // Estoque
  estoqueTitulo:        string;
  estoqueSubtitulo:     string;
  estoqueAba:           string;
  estoqueBotao:         string;
  estoqueModalEditar:   string;
  // Funcionalidades
  temMesas:             boolean;
  temAgendamentos:      boolean;
  temClientesBarber:    boolean;
  temKDS:               boolean;
  // Recibo
  labelRecibo:          string;
  // Pedidos / OrdersScreen
  tituloPedidos:        string;
  tituloAtivos:         string;
  statusConcluido:      string;
  // POSScreen
  usaTipoItem:          boolean;
  tiposItem:            TipoItem[];
  categoryEmojis:       Record<string, string>;
  emojiDefault:         string;
}

// ── Defaults (fallback) ───────────────────────────────────────────────────────
const DEFAULT: SegCfg = {
  labelSidebarPOS:      'Balcão / PDV',
  labelSidebarPedidos:  'Pedidos',
  labelSidebarProdutos: 'Cardápio',
  labelSidebarEstoque:  'Estoque',
  estoqueTitulo:        'Controle de Produtos & Insumos',
  estoqueSubtitulo:     'Controle de insumos e movimentações',
  estoqueAba:           'Ingredientes',
  estoqueBotao:         'Novo Ingrediente',
  estoqueModalEditar:   'Editar Ingrediente',
  temMesas:             false,
  temAgendamentos:      false,
  temClientesBarber:    false,
  temKDS:               false,
  labelRecibo:          'Estabelecimento',
  tituloPedidos:        'Pedidos',
  tituloAtivos:         'Pedidos Ativos',
  statusConcluido:      'Concluído',
  usaTipoItem:          false,
  tiposItem:            TIPOS_BALCAO,
  categoryEmojis:       {},
  emojiDefault:         '🛒',
};

// ── Mapa de segmentos ─────────────────────────────────────────────────────────
const MAPA: Record<string, SegCfg> = {

  // ── Restaurante ────────────────────────────────────────────────────────────
  'Restaurante/Food': {
    ...DEFAULT,
    labelSidebarPOS:      'Balcão / PDV',
    labelSidebarPedidos:  'Pedidos',
    labelSidebarProdutos: 'Cardápio',
    estoqueTitulo:        'Controle de Produtos & Insumos',
    estoqueSubtitulo:     'Controle de insumos e movimentações do restaurante',
    estoqueAba:           'Ingredientes',
    estoqueBotao:         'Novo Ingrediente',
    estoqueModalEditar:   'Editar Ingrediente',
    temMesas:             true,
    temKDS:               true,
    labelRecibo:          'Restaurante',
    tituloPedidos:        'Pedidos',
    tituloAtivos:         'Pedidos Ativos',
    statusConcluido:      'Entregue',
    usaTipoItem:          true,
    tiposItem:            TIPOS_RESTAURANTE,
    categoryEmojis:       { 'Bebida':'🥤','Sobremesa':'🍮','Entrada':'🥗','Prato':'🍽️','Porção':'🍗' },
    emojiDefault:         '🍽️',
  },

  // ── Fast Food ──────────────────────────────────────────────────────────────
  'Fast Food': {
    ...DEFAULT,
    labelSidebarPOS:      'Caixa / PDV',
    labelSidebarPedidos:  'Pedidos',
    labelSidebarProdutos: 'Cardápio',
    estoqueTitulo:        'Estoque de Insumos',
    estoqueSubtitulo:     'Controle de ingredientes e produtos do fast food',
    estoqueAba:           'Ingredientes',
    estoqueBotao:         'Novo Ingrediente',
    estoqueModalEditar:   'Editar Ingrediente',
    temMesas:             false,
    temKDS:               true,
    labelRecibo:          'Fast Food',
    tituloPedidos:        'Pedidos',
    tituloAtivos:         'Pedidos Ativos',
    statusConcluido:      'Entregue',
    usaTipoItem:          false,
    tiposItem:            TIPOS_BALCAO,
    categoryEmojis:       { 'Bebida':'🥤','Lanche':'🍔','Combo':'🍟' },
    emojiDefault:         '🍔',
  },

  // ── Bar & Pub ──────────────────────────────────────────────────────────────
  'Bar/Pub': {
    ...DEFAULT,
    labelSidebarPOS:      'Balcão / PDV',
    labelSidebarPedidos:  'Pedidos',
    labelSidebarProdutos: 'Cardápio',
    estoqueTitulo:        'Estoque de Bebidas & Insumos',
    estoqueSubtitulo:     'Controle de bebidas, insumos e movimentações do bar',
    estoqueAba:           'Produtos & Bebidas',
    estoqueBotao:         'Novo Produto',
    estoqueModalEditar:   'Editar Produto',
    temMesas:             true,
    temKDS:               false,
    labelRecibo:          'Bar & Pub',
    tituloPedidos:        'Pedidos',
    tituloAtivos:         'Pedidos Ativos',
    statusConcluido:      'Entregue',
    usaTipoItem:          true,
    tiposItem:            TIPOS_RESTAURANTE,
    categoryEmojis:       { 'Bebida':'🍺','Dose':'🥃','Porção':'🍗','Petisco':'🧀' },
    emojiDefault:         '🍺',
  },

  // ── Adega ──────────────────────────────────────────────────────────────────
  'Adega': {
    ...DEFAULT,
    labelSidebarPOS:      'Caixa / PDV',
    labelSidebarPedidos:  'Vendas',
    labelSidebarProdutos: 'Produtos',
    estoqueTitulo:        'Estoque da Adega',
    estoqueSubtitulo:     'Controle de bebidas por unidade, caixa e fardo',
    estoqueAba:           'Bebidas & Produtos',
    estoqueBotao:         'Novo Produto',
    estoqueModalEditar:   'Editar Produto',
    temMesas:             false,
    temKDS:               false,
    labelRecibo:          'Adega',
    tituloPedidos:        'Vendas',
    tituloAtivos:         'Vendas Ativas',
    statusConcluido:      'Concluído',
    usaTipoItem:          false,
    tiposItem:            TIPOS_BALCAO,
    categoryEmojis:       { 'Cerveja':'🍺','Vinho':'🍷','Destilado':'🥃','Refrigerante':'🥤' },
    emojiDefault:         '🍷',
  },

  // ── Barbearia ──────────────────────────────────────────────────────────────
  'Barbearia/Salão': {
    ...DEFAULT,
    labelSidebarPOS:      'Caixa / PDV',
    labelSidebarPedidos:  'Atendimentos',
    labelSidebarProdutos: 'Serviços & Produtos',
    estoqueTitulo:        'Estoque da Barbearia',
    estoqueSubtitulo:     'Controle de produtos e insumos da barbearia',
    estoqueAba:           'Insumos & Produtos',
    estoqueBotao:         'Novo Insumo',
    estoqueModalEditar:   'Editar Insumo',
    temMesas:             false,
    temAgendamentos:      true,
    temClientesBarber:    true,
    temKDS:               false,
    labelRecibo:          'Barbearia',
    tituloPedidos:        'Atendimentos',
    tituloAtivos:         'Em Atendimento',
    statusConcluido:      'Concluído',
    usaTipoItem:          true,
    tiposItem:            TIPOS_BARBEARIA,
    categoryEmojis:       { 'Serviço':'✂️','Produto':'🧴' },
    emojiDefault:         '✂️',
  },

  // ── Comércio Geral ─────────────────────────────────────────────────────────
  // Varejo genérico: mercadinhos, papelarias, lojas de roupa, pet shops,
  // eletrônicos, farmácias, ferramentas — qualquer loja sem mesa ou agenda.
  'Comércio Geral': {
    ...DEFAULT,
    labelSidebarPOS:      'Caixa / PDV',
    labelSidebarPedidos:  'Vendas',
    labelSidebarProdutos: 'Produtos',
    labelSidebarEstoque:  'Estoque',
    estoqueTitulo:        'Controle de Estoque',
    estoqueSubtitulo:     'Gerencie produtos, entradas, saídas e relatórios',
    estoqueAba:           'Produtos',
    estoqueBotao:         'Novo Produto',
    estoqueModalEditar:   'Editar Produto',
    temMesas:             false,
    temAgendamentos:      false,
    temClientesBarber:    false,
    temKDS:               false,
    labelRecibo:          'Comércio',
    tituloPedidos:        'Vendas',
    tituloAtivos:         'Vendas Ativas',
    statusConcluido:      'Concluído',
    usaTipoItem:          false,
    tiposItem:            TIPOS_COMERCIO,
    categoryEmojis:       {
      'Alimentos':    '🛒',
      'Bebidas':      '🥤',
      'Limpeza':      '🧹',
      'Higiene':      '🧼',
      'Roupas':       '👕',
      'Calçados':     '👟',
      'Eletrônicos':  '📱',
      'Papelaria':    '📝',
      'Brinquedos':   '🧸',
      'Pet':          '🐾',
      'Ferramentas':  '🔧',
      'Outros':       '📦',
    },
    emojiDefault:         '📦',
  },
};

// ── Aliases para novos valores de segmento ───────────────────────────────────
// Garante retrocompatibilidade com registros antigos no banco
MAPA['Restaurante'] = MAPA['Restaurante/Food'];
MAPA['Bar']         = MAPA['Bar/Pub'];
MAPA['Barbearia']   = MAPA['Barbearia/Salão'];
MAPA['Comercio']         = MAPA['Comércio Geral']; // alias sem acento
MAPA['Comercio Geral']   = MAPA['Comércio Geral']; // alias sem acento + espaço (registros legados)

// ── getSegCfg ─────────────────────────────────────────────────────────────────
// Retorna a config do segmento ou DEFAULT se não encontrado.
export function getSegCfg(segmento: string): SegCfg {
  return MAPA[getOperationalSegment(segmento)] ?? DEFAULT;
}

// ── helpers ───────────────────────────────────────────────────────────────────
export function normalizeSegment(segmento: string): string {
  return SEGMENT_ALIASES[segmento] ?? segmento;
}

export function isDisabledSegment(segmento: string): boolean {
  return DISABLED_SEGMENTS.has(normalizeSegment(segmento));
}

export function isActiveSegment(segmento: string): boolean {
  return ACTIVE_SEGMENTS.has(normalizeSegment(segmento));
}

export function getOperationalSegment(segmento: string): string {
  const normalized = normalizeSegment(segmento);
  return ACTIVE_SEGMENTS.has(normalized) ? normalized : 'Restaurante/Food';
}

export function isBarber(segmento: string): boolean {
  return segmento === 'Barbearia' || segmento === 'Barbearia/Salão';
}
export function isBar(segmento: string): boolean {
  return segmento === 'Bar' || segmento === 'Bar/Pub';
}
export function isRestaurante(segmento: string): boolean {
  return segmento === 'Restaurante' || segmento === 'Restaurante/Food';
}
export function isComercioGeral(segmento: string): boolean {
  return segmento === 'Comércio Geral' || segmento === 'Comercio';
}
export function temMesas(segmento: string): boolean {
  return getSegCfg(segmento).temMesas;
}
