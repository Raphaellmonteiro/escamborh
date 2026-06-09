export const PUBLIC_SEGMENT_VALUES = [
  'Restaurante',
  'Fast Food',
  'Bar',
  'Adega',
  'Padaria/Café',
  'Buffet/Self-service',
  'Food Truck',
] as const;

export type PublicSegmentValue = (typeof PUBLIC_SEGMENT_VALUES)[number];

export interface PublicSegmentOption {
  value: PublicSegmentValue;
  label: string;
  icon: string;
  description: string;
}

export const PUBLIC_SEGMENT_OPTIONS: ReadonlyArray<PublicSegmentOption> = [
  {
    value: 'Restaurante',
    label: 'Restaurante',
    icon: '🍽️',
    description: 'Mesa, balcão, retirada e delivery com cozinha integrada.',
  },
  {
    value: 'Fast Food',
    label: 'Hamburgueria / Lanchonete',
    icon: '🍔',
    description: 'Atendimento rápido, combos, retirada e delivery.',
  },
  {
    value: 'Bar',
    label: 'Bar',
    icon: '🍺',
    description: 'Mesas, comandas, pedidos simultâneos e produção de bebidas.',
  },
  {
    value: 'Adega',
    label: 'Adega',
    icon: '🍷',
    description: 'Venda rápida e controle de bebidas por unidade, caixa e fardo.',
  },
  {
    value: 'Padaria/Café',
    label: 'Padaria / Café',
    icon: '🥐',
    description: 'Balcão, vitrine, retirada e itens prontos ou de preparo rápido.',
  },
  {
    value: 'Buffet/Self-service',
    label: 'Buffet / Self-service',
    icon: '🍛',
    description: 'Operação por prato, marmita ou comanda, sem balança integrada.',
  },
  {
    value: 'Food Truck',
    label: 'Food Truck',
    icon: '🚚',
    description: 'Operação enxuta de fila, balcão, retirada e delivery.',
  },
];

export const PUBLIC_SEGMENT_NOTE =
  'Buffet/self-service: o fluxo atual atende operação por prato, marmita ou comanda. Pesagem com balança integrada não faz parte do produto hoje.';
