import { q1, qAll } from '../db';
import { getInstanceByName } from '../repositories/whatsappRepository';
import { sendText } from './evolutionClient';
import { logError, logInfo } from '../utils/logger';

type JsonRecord = Record<string, unknown>;

type IncomingMessage = {
  tenantId: number | null;
  instance: string;
  number: string;
  message: string;
  type: string;
};

export type HandleIncomingMessageResult = {
  tenantId: number | null;
  type: string;
  processedCount: number;
  ignoredCount: number;
};

const AUTO_REPLY_TEXT = 'Olá! 👋 Bem-vindo ao nosso atendimento.\nDigite 1 para ver o cardápio.';
const PRODUCT_MENU_LIMIT = 10;

type TenantMenuProductRow = {
  id: number | string;
  name?: string | null;
};

type TenantCardapioUrlRow = {
  id: number | string;
  usuario?: string | null;
  delivery_ativo?: boolean | number | string | null;
};

type CachedMenuItem = {
  productId: number;
  name: string;
};

type CachedMenuState = {
  tenantId: number | null;
  items: CachedMenuItem[];
  updatedAt: number;
};

type CustomerSelectionState = {
  step: 'confirm_product';
  productId: number;
  productName: string;
  tenantId: number | null;
  updatedAt: number;
};

const menuCache: Record<string, CachedMenuState> = Object.create(null);
export const userState: Record<string, CustomerSelectionState> = Object.create(null);

function getRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeEventType(payload: unknown) {
  const root = getRecord(payload);
  return normalizeOptionalText(root?.event ?? root?.type ?? root?.webhookType) || 'messages.upsert';
}

function normalizeIncomingChoice(value: string) {
  return value.trim();
}

function normalizeWhatsAppPhone(rawValue: unknown) {
  const base = normalizeOptionalText(rawValue);
  if (!base) return null;

  const withoutJid = base.split('@')[0];
  const digits = withoutJid.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length < 10) return null;
  return digits;
}

function maskPhone(rawPhone: string | null) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits || null;
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

function extractTextFromMessageNode(value: unknown): string | null {
  const message = getRecord(value);
  if (!message) return null;

  return (
    normalizeOptionalText(message.conversation) ||
    normalizeOptionalText(getRecord(message.text)?.body) ||
    normalizeOptionalText(message.text) ||
    normalizeOptionalText(getRecord(message.extendedTextMessage)?.text) ||
    normalizeOptionalText(getRecord(message.imageMessage)?.caption) ||
    normalizeOptionalText(getRecord(message.videoMessage)?.caption) ||
    normalizeOptionalText(getRecord(message.documentMessage)?.caption) ||
    normalizeOptionalText(getRecord(message.buttonsResponseMessage)?.selectedDisplayText) ||
    normalizeOptionalText(getRecord(message.listResponseMessage)?.title)
  );
}

function resolveTenantIdFromInstanceName(instanceName: string) {
  const match = /^tenant_(\d+)_/i.exec(instanceName);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isIgnoredJid(value: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.endsWith('@g.us') || normalized.endsWith('status@broadcast');
}

function resolvePublicBaseUrl() {
  const explicit =
    normalizeOptionalText(process.env.FLOWPDV_WHATSAPP_CARDAPIO_URL) ||
    normalizeOptionalText(process.env.FLOWPDV_PUBLIC_URL) ||
    normalizeOptionalText(process.env.APP_URL) ||
    normalizeOptionalText(process.env.RAILWAY_PUBLIC_DOMAIN);

  if (explicit) {
    const withProtocol = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
    return withProtocol.replace(/\/+$/, '');
  }

  const fromAllowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOptionalText(item))
    .find((item) => item);

  if (fromAllowedOrigins) {
    return fromAllowedOrigins.replace(/\/+$/, '');
  }

  return `http://localhost:${normalizeOptionalText(process.env.PORT) || '3001'}`;
}

async function loadTenantCardapioUrl(tenantId: number | null) {
  const fallbackUrl =
    normalizeOptionalText(process.env.FLOWPDV_WHATSAPP_CARDAPIO_URL) ||
    normalizeOptionalText(process.env.FLOWPDV_PUBLIC_URL) ||
    normalizeOptionalText(process.env.APP_URL) ||
    null;

  if (!tenantId) {
    return fallbackUrl;
  }

  const row = await q1<TenantCardapioUrlRow>(
    `SELECT id, usuario, delivery_ativo
     FROM clientes
     WHERE id=?
     LIMIT 1`,
    [tenantId]
  );

  const slug = normalizeOptionalText(row?.usuario);
  const deliveryEnabled = toBool(row?.delivery_ativo, false);

  if (slug && deliveryEnabled) {
    return `${resolvePublicBaseUrl()}/delivery/${encodeURIComponent(slug)}`;
  }

  return fallbackUrl;
}

async function loadTenantMenuProducts(tenantId: number) {
  const rows = await qAll<TenantMenuProductRow>(
    `SELECT id, name
     FROM produtos
     WHERE tenant_id=?
       AND active=1
     ORDER BY COALESCE(ordem,0) ASC, name ASC
     LIMIT ?`,
    [tenantId, PRODUCT_MENU_LIMIT]
  );

  return rows
    .map((row) => {
      const productId = Number(row.id);
      const name = normalizeOptionalText(row.name);

      if (!Number.isInteger(productId) || productId <= 0 || !name) {
        return null;
      }

      return {
        productId,
        name,
      } satisfies CachedMenuItem;
    })
    .filter((item): item is CachedMenuItem => item !== null);
}

function buildCatalogReply(products: CachedMenuItem[]) {
  if (products.length === 0) {
    return '🍔 Cardápio:\n\nNenhum produto disponível no momento.';
  }

  const lines = products.map((product, index) => `${index + 1} - ${product.name}`);
  return `🍔 Cardápio:\n\n${lines.join('\n')}\n\nDigite o número do produto.`;
}

function appendCardapioUrl(messageText: string, cardapioUrl: string | null) {
  if (!cardapioUrl) {
    return messageText;
  }

  return `${messageText}\n\nPara fazer seu pedido completo com adicionais e entrega:\n\n👉 Acesse:\n${cardapioUrl}`;
}

function buildMenuCacheKey(message: IncomingMessage) {
  return message.number;
}

function getCachedMenu(message: IncomingMessage) {
  const cached = menuCache[buildMenuCacheKey(message)];
  if (!cached) {
    return null;
  }

  if (
    cached.tenantId !== null &&
    message.tenantId !== null &&
    cached.tenantId !== message.tenantId
  ) {
    return null;
  }

  return cached;
}

function cacheTenantMenu(message: IncomingMessage, items: CachedMenuItem[]) {
  menuCache[buildMenuCacheKey(message)] = {
    tenantId: message.tenantId,
    items,
    updatedAt: Date.now(),
  };
}

function saveSelectedProductState(message: IncomingMessage, item: CachedMenuItem) {
  userState[buildMenuCacheKey(message)] = {
    step: 'confirm_product',
    productId: item.productId,
    productName: item.name,
    tenantId: message.tenantId,
    updatedAt: Date.now(),
  };
}

function buildSelectedProductReply(item: CachedMenuItem) {
  return `Você escolheu: ${item.name}\n\nPara finalizar seu pedido:\n\n👉 Clique aqui:`;
}

function buildConfirmInstructionReply(item: CustomerSelectionState) {
  return `Você escolheu: ${item.productName}\n\nPara finalizar seu pedido:\n\n👉 Clique aqui:`;
}

function isNumericChoice(value: string) {
  return /^\d+$/.test(value);
}

async function getOrLoadMenuItems(message: IncomingMessage) {
  const cachedMenu = getCachedMenu(message);
  if (cachedMenu) {
    return cachedMenu.items;
  }

  if (!message.tenantId) {
    return null;
  }

  const products = await loadTenantMenuProducts(message.tenantId);
  cacheTenantMenu(message, products);
  return products;
}

async function resendCatalogReply(message: IncomingMessage) {
  const items = await getOrLoadMenuItems(message);
  if (!items) {
    return 'Digite 1 para ver o cardápio.';
  }

  const cardapioUrl = await loadTenantCardapioUrl(message.tenantId);
  return appendCardapioUrl(buildCatalogReply(items), cardapioUrl);
}

async function resolveConfirmProductReply(message: IncomingMessage, state: CustomerSelectionState) {
  const normalizedChoice = normalizeIncomingChoice(message.message);
  const cardapioUrl = await loadTenantCardapioUrl(state.tenantId);

  if (normalizedChoice === '1') {
    delete userState[buildMenuCacheKey(message)];
    const redirectText = buildConfirmInstructionReply(state);
    return cardapioUrl ? `${redirectText}\n${cardapioUrl}` : redirectText;
  }

  if (normalizedChoice === '2') {
    delete userState[buildMenuCacheKey(message)];
    return resendCatalogReply(message);
  }

  const redirectText = buildConfirmInstructionReply(state);
  return cardapioUrl ? `${redirectText}\n${cardapioUrl}` : redirectText;
}

async function resolveReplyText(message: IncomingMessage) {
  const normalizedChoice = normalizeIncomingChoice(message.message);
  const currentState = userState[buildMenuCacheKey(message)];

  if (currentState?.step === 'confirm_product') {
    return resolveConfirmProductReply(message, currentState);
  }

  if (!isNumericChoice(normalizedChoice)) {
    return AUTO_REPLY_TEXT;
  }

  const cachedMenu = getCachedMenu(message);
  if (!cachedMenu) {
    if (normalizedChoice !== '1' || !message.tenantId) {
      return 'Digite 1 para ver o cardápio.';
    }

    const products = await loadTenantMenuProducts(message.tenantId);
    cacheTenantMenu(message, products);
    const cardapioUrl = await loadTenantCardapioUrl(message.tenantId);
    return appendCardapioUrl(buildCatalogReply(products), cardapioUrl);
  }

  const selectedIndex = Number(normalizedChoice) - 1;
  if (cachedMenu.items.length === 0) {
    return buildCatalogReply(cachedMenu.items);
  }

  const selectedProduct = cachedMenu.items[selectedIndex];

  if (!selectedProduct) {
    return 'Digite 1 para ver o cardápio.';
  }

  saveSelectedProductState(message, selectedProduct);
  const cardapioUrl = await loadTenantCardapioUrl(message.tenantId);
  const redirectText = buildSelectedProductReply(selectedProduct);
  return cardapioUrl ? `${redirectText}\n${cardapioUrl}` : redirectText;
}

function extractIncomingMessages(payload: unknown, instance: string, tenantId: number | null): IncomingMessage[] {
  const root = getRecord(payload);
  const type = normalizeEventType(payload);
  const dataCandidates = getArray(root?.data);
  const candidates =
    dataCandidates.length > 0
      ? dataCandidates.map((item) => getRecord(item)).filter(Boolean)
      : [getRecord(root?.data) || root].filter(Boolean);

  return candidates
    .map((candidate) => {
      const item = candidate as JsonRecord;
      const key = getRecord(item.key);
      const fromMe = toBool(item.fromMe ?? key?.fromMe, false);
      const rawJid = normalizeOptionalText(
        key?.remoteJid ?? item.remoteJid ?? item.sender ?? item.from ?? item.participant
      );

      if (fromMe || isIgnoredJid(rawJid)) {
        return null;
      }

      const number = normalizeWhatsAppPhone(rawJid);
      const message =
        extractTextFromMessageNode(item.message) ||
        normalizeOptionalText(item.body) ||
        normalizeOptionalText(item.text);

      if (!number || !message) {
        return null;
      }

      return {
        tenantId,
        instance,
        number,
        message,
        type,
      } satisfies IncomingMessage;
    })
    .filter((item): item is IncomingMessage => item !== null);
}

export async function handleIncomingMessage(payload: unknown): Promise<HandleIncomingMessageResult> {
  const root = getRecord(payload);
  const instance = normalizeOptionalText(root?.instance);
  const type = normalizeEventType(payload);

  if (!instance) {
    return {
      tenantId: null,
      type,
      processedCount: 0,
      ignoredCount: 0,
    };
  }

  const instanceRecord = await getInstanceByName(instance).catch(() => null);
  const tenantId = instanceRecord?.tenantId ?? resolveTenantIdFromInstanceName(instance);
  const messages = extractIncomingMessages(payload, instance, tenantId);
  const dataItems = getArray(root?.data);
  const totalCandidates = dataItems.length > 0 ? dataItems.length : 1;
  let processedCount = 0;

  for (const message of messages) {
    logInfo('whatsappMessageHandler.received', {
      tenantId: message.tenantId,
      phone: maskPhone(message.number),
      type: message.type,
    });

    try {
      const replyText = await resolveReplyText(message);
      await sendText(message.instance, message.number, replyText);
      processedCount += 1;
    } catch (error) {
      logError('whatsappMessageHandler.reply', error, {
        tenantId: message.tenantId,
        phone: maskPhone(message.number),
        type: message.type,
      });
    }
  }

  return {
    tenantId,
    type,
    processedCount,
    ignoredCount: Math.max(totalCandidates - messages.length, 0),
  };
}
