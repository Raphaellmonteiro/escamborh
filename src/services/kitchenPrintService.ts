/**
 * Impressão de produção / cozinha — HTML e texto térmico.
 * Usa apenas dados persistidos (observation → mesmo critério de item_display_details no cliente).
 */
import { gerarCupomHtml, type PrintChannel } from '../utils/printTemplates';
import { splitOrderItemDetailLines } from '../utils/orderItemDisplay';
import { resolveRequiresPreparation } from '../utils/preparation';

const TZ = 'America/Sao_Paulo';

/** Legado: automações reais vêm de `delivery_config.automation` (ver `automationConfig.ts`). */
export const KITCHEN_PRINT_FEATURE_FLAGS = {
  autoPrintBalcao: false,
  autoPrintDelivery: false,
  autoPrintMesa: false,
  printEvenWithKds: false,
} as const;

export type KitchenPrintOrderInput = {
  order_number: string;
  canal?: string | null;
  tipo_retirada?: string | null;
  observation?: string | null;
  cliente_nome?: string | null;
  cliente_tel?: string | null;
  created_at?: string | null;
};

export type KitchenPrintItemInput = {
  quantity: number;
  name: string;
  observation?: string | null;
  category?: string | null;
  requires_preparation?: number | null;
  production_type?: string | null;
};

function formatKitchenTicketDate(value?: string | null) {
  const rawValue = String(value || '').trim();
  const date = rawValue ? new Date(rawValue) : new Date();
  return date.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Canal exibido na cozinha (inclui consumo local explícito). */
export function resolveKitchenChannelUi(order: KitchenPrintOrderInput): PrintChannel {
  const canal = String(order.canal || '').trim().toLowerCase();
  const tipo = String(order.tipo_retirada || '').trim().toLowerCase();

  if (canal === 'delivery') return 'delivery';
  if (canal === 'mesa') return 'mesa';
  if (canal === 'retirada' || tipo === 'levar') return 'retirada';
  if (canal === 'balcao' && tipo === 'local') return 'consumo_local';
  if (canal === 'balcao') return 'balcao';
  if (tipo === 'mesa') return 'mesa';
  return 'generic';
}

function channelPlainLabel(channel: PrintChannel): string {
  switch (channel) {
    case 'delivery':
      return 'Delivery';
    case 'mesa':
      return 'Mesa';
    case 'retirada':
      return 'Retirada';
    case 'consumo_local':
      return 'Consumo local';
    case 'balcao':
      return 'Balcao';
    default:
      return 'Operacional';
  }
}

function buildKitchenMetadata(order: KitchenPrintOrderInput): { label: string; value: string }[] {
  const meta: { label: string; value: string }[] = [];
  const ch = resolveKitchenChannelUi(order);

  if (ch === 'delivery') {
    if (order.cliente_nome) meta.push({ label: 'Cliente', value: order.cliente_nome });
    if (order.cliente_tel) meta.push({ label: 'Telefone', value: order.cliente_tel });
  }

  if (ch === 'mesa' || String(order.canal || '').trim().toLowerCase() === 'mesa') {
    const mesaMatch = String(order.observation || '').match(/mesa\s+(\d+)/i);
    if (mesaMatch) meta.push({ label: 'Mesa', value: mesaMatch[1] });
  }

  return meta;
}

function orderLevelKitchenObservation(order: KitchenPrintOrderInput): string | undefined {
  const o = String(order.observation || '').trim();
  if (!o) return undefined;
  if (/^mesa\s+\d+$/i.test(o) && resolveKitchenChannelUi(order) === 'mesa') return undefined;
  return o;
}

export function filterKitchenPreparationItems(items: KitchenPrintItemInput[]): KitchenPrintItemInput[] {
  return items.filter((item) =>
    resolveRequiresPreparation({
      name: item.name,
      category: item.category,
      requires_preparation: item.requires_preparation,
      production_type: item.production_type,
    })
  );
}

export function buildKitchenReceiptHtml(opts: {
  order: KitchenPrintOrderInput;
  items: KitchenPrintItemInput[];
  estabelecimento?: string | null;
  paperWidthMm?: 58 | 80;
}): string {
  const filtered = filterKitchenPreparationItems(opts.items);
  const when = formatKitchenTicketDate(opts.order.created_at);
  const canal = resolveKitchenChannelUi(opts.order);

  const printItems = filtered.map((item) => {
    const detalhes = splitOrderItemDetailLines(String(item.observation || '').trim());
    return {
      qtd: Number(item.quantity),
      nome: item.name,
      detalhes: detalhes.length > 0 ? detalhes : undefined,
    };
  });

  return gerarCupomHtml({
    titulo: 'COMANDA DE PRODUÇÃO',
    estabelecimento: opts.estabelecimento || undefined,
    orderNumber: opts.order.order_number,
    data: when,
    variant: 'kitchen-ticket',
    canal,
    paperWidthMm: opts.paperWidthMm,
    metadata: buildKitchenMetadata(opts.order),
    itens: printItems,
    observacao: orderLevelKitchenObservation(opts.order),
  });
}

/** Texto simples para impressora térmica ESC/POS (sem HTML). */
export function buildKitchenEscPosPlainText(order: KitchenPrintOrderInput, items: KitchenPrintItemInput[]): string {
  const filtered = filterKitchenPreparationItems(items);
  const ch = resolveKitchenChannelUi(order);
  const lines: string[] = [
    'COMANDA DE PRODUCAO',
    `PEDIDO #${order.order_number}`,
    channelPlainLabel(ch),
    formatKitchenTicketDate(order.created_at),
    '',
  ];

  if (order.cliente_nome && ch === 'delivery') {
    lines.push(`Cliente: ${order.cliente_nome}`);
    if (order.cliente_tel) lines.push(`Tel: ${order.cliente_tel}`);
    lines.push('');
  }

  const mesaMatch = String(order.observation || '').match(/mesa\s+(\d+)/i);
  if (mesaMatch && (ch === 'mesa' || String(order.canal || '').toLowerCase() === 'mesa')) {
    lines.push(`Mesa: ${mesaMatch[1]}`, '');
  }

  for (const item of filtered) {
    lines.push(`${item.quantity}x ${item.name}`);
    const detalhes = splitOrderItemDetailLines(String(item.observation || '').trim());
    for (const d of detalhes) {
      lines.push(`  - ${d}`);
    }
  }

  const obs = orderLevelKitchenObservation(order);
  if (obs) {
    lines.push('', `OBS: ${obs}`);
  }

  return lines.join('\n');
}
