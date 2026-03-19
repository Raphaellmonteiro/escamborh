// ── Barbearia — Configuração de Segmento ─────────────────────────────────────
// Valor salvo no DB: "Barbearia"
// Diferencial: agendamentos, ficha de cliente, sem mesas, sem KDS

export const barbeariaConfig = {
  segmentoValue: 'Barbearia',

  labelSidebarPOS:      'Caixa / PDV',
  labelSidebarPedidos:  'Atendimentos',
  labelSidebarProdutos: 'Serviços & Produtos',
  labelSidebarEstoque:  'Estoque',

  estoqueTitulo:       'Estoque da Barbearia',
  estoqueSubtitulo:    'Controle de produtos e insumos da barbearia',
  estoqueAba:          'Insumos & Produtos',
  estoqueBotao:        'Novo Insumo',
  estoqueModalEditar:  'Editar Insumo',

  temMesas:            false,
  temAgendamentos:     true,   // agenda de horários por barbeiro
  temClientesBarber:   true,   // ficha completa do cliente (histórico de cortes)
  temKDS:              false,

  labelRecibo:         'Barbearia',
};