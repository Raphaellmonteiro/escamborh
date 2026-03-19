// ── Fast Food — Configuração de Segmento ─────────────────────────────────────
// Valor salvo no DB: "Fast Food"
// Diferencial: foco em atendimento rápido, sem mesas, pedidos por número/senha

export const fastFoodConfig = {
  segmentoValue: 'Fast Food',

  labelSidebarPOS:      'Caixa / PDV',
  labelSidebarPedidos:  'Pedidos',
  labelSidebarProdutos: 'Cardápio',
  labelSidebarEstoque:  'Estoque',

  estoqueTitulo:       'Estoque de Insumos',
  estoqueSubtitulo:    'Controle de ingredientes e produtos do fast food',
  estoqueAba:          'Ingredientes',
  estoqueBotao:        'Novo Ingrediente',
  estoqueModalEditar:  'Editar Ingrediente',

  temMesas:            false,   // sem mesas — pedidos vão direto para o balcão
  temAgendamentos:     false,
  temClientesBarber:   false,
  temKDS:              true,    // KDS ativo para cozinha

  labelRecibo:         'Fast Food',
};