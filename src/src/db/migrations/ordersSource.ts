/**
 * Migration: ordersSource.ts — CORRIGIDO
 *
 * CORREÇÃO: a tabela real é "pedidos", não "orders".
 * Adicionamos:
 *   - coluna canal VARCHAR(50): identifica a origem (whatsapp_ai, delivery_online, etc.)
 *     NOTA: "canal" já existe em pedidos! Verificamos antes de adicionar.
 *   - coluna payment_confirmed: usamos pagamento_confirmado_at já existente.
 *     Esta migration apenas garante que o índice de busca por canal exista.
 *
 * "canal" já é criado na migration principal com DEFAULT 'balcao'.
 * Pedidos via IA usam canal = 'whatsapp_ai' sem alterar o schema existente.
 */

import { query } from '../index';

let promise: Promise<void> | null = null;

export async function ensureOrdersSourceColumns(): Promise<void> {
  if (!promise) {
    promise = (async () => {
      // Garante que a coluna canal exista (já deve existir pela migration principal,
      // mas ADD COLUMN IF NOT EXISTS é idempotente)
      await query(`
        ALTER TABLE pedidos
          ADD COLUMN IF NOT EXISTS canal VARCHAR(50) DEFAULT 'balcao'
      `);

      // Índice para filtrar pedidos por canal (ex.: buscar só os do whatsapp_ai)
      await query(`
        CREATE INDEX IF NOT EXISTS pedidos_canal_tenant_idx
          ON pedidos (tenant_id, canal, created_at DESC)
      `);

      // pagamento_confirmado_at já existe no schema principal.
      // Apenas garantimos que esteja presente.
      await query(`
        ALTER TABLE pedidos
          ADD COLUMN IF NOT EXISTS pagamento_confirmado_at TIMESTAMPTZ
      `);
    })().catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}
