import { query } from '../index';

let ensureSolicitacoesTablePromise: Promise<void> | null = null;

export async function ensureSolicitacoesTable() {
  if (!ensureSolicitacoesTablePromise) {
    ensureSolicitacoesTablePromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS solicitacoes (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          empresa TEXT,
          cnpj TEXT,
          whatsapp TEXT NOT NULL,
          email TEXT,
          cidade TEXT,
          segmento TEXT,
          plano TEXT,
          origem TEXT DEFAULT 'landing_planos',
          status TEXT NOT NULL DEFAULT 'novo',
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS solicitacoes_status_idx
        ON solicitacoes (status, criado_em DESC)
      `);
    })().catch((error) => {
      ensureSolicitacoesTablePromise = null;
      throw error;
    });
  }

  return ensureSolicitacoesTablePromise;
}