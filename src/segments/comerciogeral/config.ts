// ── Comércio Geral — Configuração de Segmento ────────────────────────────────
// Valor salvo no DB: "Comércio Geral"
//
// Para quê serve: mercadinhos, mercearias, papelarias, lojas de roupa,
// pet shops, eletrônicos, farmácias, ferramentas — qualquer varejo que
// vende produto físico sem precisar de mesa, KDS ou agenda de serviços.
//
// Telas ativas:   PDV, Pedidos/Vendas, Produtos, Estoque, Dashboard, Financeiro, RH, Logs, Config
// Telas inativas: Mesas, KDS, Agendamentos, Clientes Barber

export const comercioGeralConfig = {
  segmentoValue: 'Comércio Geral',

  // ── Sidebar ────────────────────────────────────────────────────────────────
  labelSidebarPOS:      'Caixa / PDV',
  labelSidebarPedidos:  'Vendas',
  labelSidebarProdutos: 'Produtos',
  labelSidebarEstoque:  'Estoque',

  // ── EstoqueScreen ──────────────────────────────────────────────────────────
  estoqueTitulo:       'Controle de Estoque',
  estoqueSubtitulo:    'Gerencie produtos, entradas, saídas e relatórios de consumo',
  estoqueAba:          'Produtos',
  estoqueBotao:        'Novo Produto',
  estoqueModalEditar:  'Editar Produto',

  // ── Funcionalidades ────────────────────────────────────────────────────────
  temMesas:            false,   // sem comandas por mesa
  temAgendamentos:     false,   // sem agenda de serviços
  temClientesBarber:   false,   // sem ficha de clientes de salão
  temKDS:              false,   // sem tela de cozinha/preparo

  // ── Impressão ──────────────────────────────────────────────────────────────
  labelRecibo:         'Comércio',
};
