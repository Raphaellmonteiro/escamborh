/**
 * Migration: ordersSource.ts
 * Adiciona a coluna `source` à tabela `orders` para rastrear a origem do pedido,
 * e `payment_confirmed` para sinalizar confirmação de pagamento PIX via IA.
 *
 * Valores esperados de source:
 *   'manual'         — pedido criado pelo operador no PDV
 *   'delivery_online'— pedido via cardápio online
 *   'whatsapp_ai'    — pedido criado pela IA durante conversa no WhatsApp
 *   'kiosk'          — pedido via totem de autoatendimento
 */

import { query } from '../index';

let promise: Promise<void> | null = null;

export async function ensureOrdersSourceColumns(): Promise<void> {
  if (!promise) {
    promise = (async () => {
      // Coluna source
      await query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'manual'
      `);

      // Índice para filtrar pedidos por origem (ex.: WhatsApp IA dashboard)
      await query(`
        CREATE INDEX IF NOT EXISTS orders_source_tenant_idx
          ON orders (tenant_id, source, created_at DESC)
      `);

      // Coluna payment_confirmed (PIX confirmado pelo cliente via IA)
      await query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE
      `);
    })().catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}
