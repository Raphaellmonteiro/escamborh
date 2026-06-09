// ── Adega de Bebidas — Configuração de Segmento ──────────────────────────────
// Valor salvo no DB: "Adega"
// Diferencial: venda no balcão, controle de estoque por unidade/caixa/fardo

export const adegaConfig = {
  segmentoValue: 'Adega',

  labelSidebarPOS:      'Caixa / PDV',
  labelSidebarPedidos:  'Vendas',
  labelSidebarProdutos: 'Produtos',
  labelSidebarEstoque:  'Estoque',

  estoqueTitulo:       'Estoque da Adega',
  estoqueSubtitulo:    'Controle de bebidas por unidade, caixa e fardo',
  estoqueAba:          'Bebidas & Produtos',
  estoqueBotao:        'Novo Produto',
  estoqueModalEditar:  'Editar Produto',

  temMesas:            false,   // venda direta no balcão
  temAgendamentos:     false,
  temClientesBarber:   false,
  temKDS:              false,

  labelRecibo:         'Adega',
};