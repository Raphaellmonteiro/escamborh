ALTER TABLE delivery_clientes
  ADD COLUMN IF NOT EXISTS whatsapp_reativacao_last_sent_at TIMESTAMPTZ;

ALTER TABLE delivery_clientes
  ADD COLUMN IF NOT EXISTS whatsapp_reativacao_last_status TEXT;

ALTER TABLE delivery_clientes
  ADD COLUMN IF NOT EXISTS whatsapp_reativacao_last_operator_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_delivery_clientes_wa_reativacao
  ON delivery_clientes (tenant_id, whatsapp_reativacao_last_sent_at DESC);
