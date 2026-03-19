// ── Bar & Pub — Configuração de Segmento ─────────────────────────────────────
// Valor salvo no DB: "Bar"
// Diferencial: foco em comandas por mesa, consumo por cliente, produtos de bebidas

export const barConfig = {
  segmentoValue: 'Bar',

  labelSidebarPOS:      'Balcão / PDV',
  labelSidebarPedidos:  'Pedidos',
  labelSidebarProdutos: 'Cardápio',
  labelSidebarEstoque:  'Estoque',

  estoqueTitulo:       'Estoque de Bebidas & Insumos',
  estoqueSubtitulo:    'Controle de bebidas, insumos e movimentações do bar',
  estoqueAba:          'Produtos & Bebidas',
  estoqueBotao:        'Novo Produto',
  estoqueModalEditar:  'Editar Produto',

  temMesas:            true,    // comandas por mesa são essenciais no bar
  temAgendamentos:     false,
  temClientesBarber:   false,
  temKDS:              false,   // bar geralmente não usa KDS

  labelRecibo:         'Bar & Pub',
};