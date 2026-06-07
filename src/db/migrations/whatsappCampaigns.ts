/**
 * Migration: whatsappCampaigns.ts
 * Cria a tabela `whatsapp_campaigns` para armazenar campanhas de disparo em massa.
 *
 * Status possíveis:
 *   draft      — rascunho, ainda não disparado
 *   scheduled  — agendado para disparo futuro
 *   running    — em processo de envio
 *   done       — concluído
 *   cancelled  — cancelado
 *
 * target_type:
 *   all           — todos os clientes com WhatsApp cadastrado
 *   inactive_30d  — clientes sem pedido nos últimos 30 dias
 *   inactive_60d  — clientes sem pedido nos últimos 60 dias
 *   custom_list   — lista personalizada (phones em campo extra)
 */

import { query } from '../index';

let promise: Promise<void> | null = null;

export async function ensureWhatsAppCampaignsTable(): Promise<void> {
  if (!promise) {
    promise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
          id           SERIAL PRIMARY KEY,
          tenant_id    INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
          name         VARCHAR(255) NOT NULL,
          message      TEXT NOT NULL,
          target_type  VARCHAR(50)  NOT NULL DEFAULT 'all',
          status       VARCHAR(50)  NOT NULL DEFAULT 'draft',
          scheduled_at TIMESTAMPTZ,
          sent_count   INTEGER      NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS whatsapp_campaigns_tenant_idx
          ON whatsapp_campaigns (tenant_id, created_at DESC)
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS whatsapp_campaigns_status_idx
          ON whatsapp_campaigns (tenant_id, status)
      `);
    })().catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}
