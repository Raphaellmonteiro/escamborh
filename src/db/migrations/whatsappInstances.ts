import { query } from '../index';

let ensureWhatsAppInstancesTablePromise: Promise<void> | null = null;

export async function ensureWhatsAppInstancesTable() {
  if (!ensureWhatsAppInstancesTablePromise) {
    ensureWhatsAppInstancesTablePromise = (async () => {
      await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

      await query(`
        CREATE TABLE IF NOT EXISTS whatsapp_instances (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id INTEGER NOT NULL,
          instance_name TEXT NOT NULL UNIQUE,
          status TEXT,
          connected BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS whatsapp_instances_tenant_id_idx
        ON whatsapp_instances (tenant_id, created_at DESC)
      `);
    })().catch((error) => {
      ensureWhatsAppInstancesTablePromise = null;
      throw error;
    });
  }

  return ensureWhatsAppInstancesTablePromise;
}
