/**
 * Migration: whatsappIntegrations.ts
 * Cria:
 *   - `whatsapp_integrations`  — N8N, OpenAI/GPT e webhooks personalizados por tenant
 *   - `whatsapp_ai_logs`       — feed de eventos/logs do módulo WhatsApp IA
 *
 * config_json para cada tipo:
 *   n8n:            { webhook_url, token, events: string[] }
 *   openai:         { api_key_hash, model, temperature, max_tokens, custom_prompt }
 *   webhook_custom: { url, secret }
 *
 * ⚠️ SEGURANÇA: nunca salvar api_key em texto puro.
 * Usar placeholder '__FLOWPDV_REDACTED__' quando o valor não mudar,
 * e criptografar/hash antes de persistir em produção.
 */

import { query } from '../index';

let promise: Promise<void> | null = null;

export async function ensureWhatsAppIntegrationsTable(): Promise<void> {
  if (!promise) {
    promise = (async () => {
      // ── Integrações externas ─────────────────────────────────────────────
      await query(`
        CREATE TABLE IF NOT EXISTS whatsapp_integrations (
          id          SERIAL PRIMARY KEY,
          tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          type        VARCHAR(50) NOT NULL,
          config_json JSONB       NOT NULL DEFAULT '{}',
          enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, type)
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS whatsapp_integrations_tenant_idx
          ON whatsapp_integrations (tenant_id)
      `);

      // ── Logs de eventos ──────────────────────────────────────────────────
      await query(`
        CREATE TABLE IF NOT EXISTS whatsapp_ai_logs (
          id         SERIAL PRIMARY KEY,
          tenant_id  INTEGER     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          type       VARCHAR(50) NOT NULL DEFAULT 'message',
          summary    TEXT        NOT NULL,
          detail     TEXT,
          phone      VARCHAR(30),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS whatsapp_ai_logs_tenant_idx
          ON whatsapp_ai_logs (tenant_id, created_at DESC)
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS whatsapp_ai_logs_type_idx
          ON whatsapp_ai_logs (tenant_id, type, created_at DESC)
      `);
    })().catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}
