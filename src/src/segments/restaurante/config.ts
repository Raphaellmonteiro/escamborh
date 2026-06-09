// ── Restaurante — Configuração de Segmento ───────────────────────────────────
// Valor salvo no DB: "Restaurante"
// Telas ativas: POS, Mesas/Comandas, Cardápio, Estoque, Dashboard, Financeiro, RH, Logs, Config
// Telas inativas: Agendamentos, Clientes Barber

export const restauranteConfig = {
  // Identificador salvo no banco
  segmentoValue: 'Restaurante',

  // Labels da sidebar
  labelSidebarPOS:      'Balcão / PDV',
  labelSidebarPedidos:  'Pedidos',
  labelSidebarProdutos: 'Cardápio',
  labelSidebarEstoque:  'Estoque',

  // Textos do EstoqueScreen
  estoquetitulo:       'Controle de Produtos & Insumos',
  estoqueSubtitulo:    'Controle de insumos e movimentações do restaurante',
  estoqueAba:          'Ingredientes',
  estoqueBotao:        'Novo Ingrediente',
  estoqueModalEditar:  'Editar Ingrediente',

  // Funcionalidades ativas
  temMesas:            true,
  temAgendamentos:     false,
  temClientesBarber:   false,
  temKDS:              true,

  // Etiqueta de impressão
  labelRecibo:         'Restaurante',
};
