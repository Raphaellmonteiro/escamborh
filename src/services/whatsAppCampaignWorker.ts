/**
 * whatsAppCampaignWorker.ts — Fase 7b
 *
 * Worker que processa campanhas marcadas como 'running'.
 * Busca contatos, envia com delay entre envios (evita ban),
 * atualiza sent_count e muda status para 'done' ao finalizar.
 *
 * Disparo: chamado manualmente via POST /campaigns/:id/send
 *          ou pelo scheduler (setInterval) no boot do servidor.
 */

import { query } from '../db';
import { logError, logInfo } from '../utils/logger';
import { getTenantWhatsAppConnectionConfig } from './tenantWhatsAppConfigService';
import { sendWhatsAppMessage } from './whatsAppSenderService';
import { insertAILog } from './whatsAppAiLogService';

// Delay entre envios para evitar ban (1.5–3s aleatório)
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 3000;

function randomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type CampaignRow = {
  id: number;
  tenant_id: number;
  name: string;
  message: string;
  target_type: string;
};

type ContactRow = {
  phone: string;
};

/**
 * Busca contatos para o segmento da campanha.
 * target_type: 'all' | 'inactive_30d' | 'inactive_60d' | 'custom_list'
 */
async function resolveTargetContacts(
  tenantId: number,
  targetType: string
): Promise<string[]> {
  let sql: string;
  const params: unknown[] = [tenantId];

  if (targetType === 'inactive_30d') {
    sql = `
      SELECT DISTINCT cliente_tel AS phone
        FROM pedidos
       WHERE tenant_id = $1
         AND cliente_tel IS NOT NULL
         AND BTRIM(cliente_tel) <> ''
         AND cliente_tel NOT IN (
           SELECT COALESCE(cliente_tel, '')
             FROM pedidos
            WHERE tenant_id = $1
              AND created_at >= NOW() - INTERVAL '30 days'
         )
       LIMIT 2000`;
  } else if (targetType === 'inactive_60d') {
    sql = `
      SELECT DISTINCT cliente_tel AS phone
        FROM pedidos
       WHERE tenant_id = $1
         AND cliente_tel IS NOT NULL
         AND BTRIM(cliente_tel) <> ''
         AND cliente_tel NOT IN (
           SELECT COALESCE(cliente_tel, '')
             FROM pedidos
            WHERE tenant_id = $1
              AND created_at >= NOW() - INTERVAL '60 days'
         )
       LIMIT 2000`;
  } else {
    // 'all' — todos os contatos conhecidos com pedido
    sql = `
      SELECT DISTINCT cliente_tel AS phone
        FROM pedidos
       WHERE tenant_id = $1
         AND cliente_tel IS NOT NULL
         AND BTRIM(cliente_tel) <> ''
       LIMIT 2000`;
  }

  const result = await query<ContactRow>(sql, params);
  return result.rows
    .map((r) => String(r.phone || '').trim())
    .filter((p) => p.length >= 8);
}

/**
 * Executa o disparo de uma campanha específica.
 * Fire-and-forget: não bloqueia a rota HTTP.
 */
export async function runCampaign(campaignId: number): Promise<void> {
  // Busca a campanha
  const campResult = await query<CampaignRow>(
    `SELECT id, tenant_id, name, message, target_type
       FROM whatsapp_campaigns
      WHERE id = $1 AND status = 'running'
      LIMIT 1`,
    [campaignId],
  );

  if (campResult.rows.length === 0) {
    logInfo('whatsAppCampaignWorker.skip', { campaignId, reason: 'not_found_or_not_running' });
    return;
  }

  const campaign = campResult.rows[0];
  const { tenant_id: tenantId, message, target_type: targetType } = campaign;

  // Busca configuração do WhatsApp do tenant
  const waConfig = await getTenantWhatsAppConnectionConfig(tenantId);
  if (!waConfig) {
    logError('whatsAppCampaignWorker.noWaConfig', new Error('Sem config WhatsApp'), { tenantId, campaignId });
    await query(
      `UPDATE whatsapp_campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [campaignId],
    );
    return;
  }

  // Busca contatos do segmento
  let contacts: string[];
  try {
    contacts = await resolveTargetContacts(tenantId, targetType);
  } catch (err) {
    logError('whatsAppCampaignWorker.resolveContacts', err, { tenantId, campaignId });
    await query(
      `UPDATE whatsapp_campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [campaignId],
    );
    return;
  }

  logInfo('whatsAppCampaignWorker.start', {
    campaignId,
    tenantId,
    contacts: contacts.length,
    targetType,
  });

  let sentCount = 0;

  for (const phone of contacts) {
    // Verifica se a campanha ainda está 'running' (pode ter sido cancelada)
    const checkResult = await query<{ status: string }>(
      `SELECT status FROM whatsapp_campaigns WHERE id = $1 LIMIT 1`,
      [campaignId],
    );
    if (checkResult.rows[0]?.status !== 'running') {
      logInfo('whatsAppCampaignWorker.aborted', { campaignId, sentCount });
      break;
    }

    try {
      await sendWhatsAppMessage({
        provider: waConfig.provider,
        providerConfigJson: waConfig.providerConfigJson,
        to: phone,
        message,
      });
      sentCount++;

      // Atualiza sent_count a cada envio
      await query(
        `UPDATE whatsapp_campaigns SET sent_count = $1, updated_at = NOW() WHERE id = $2`,
        [sentCount, campaignId],
      );

      // Grava log (fire-and-forget, não bloqueia)
      insertAILog({
        tenantId,
        type: 'campaign',
        summary: `Campanha "${campaign.name}" — enviado para ${phone}`,
        phone,
      }).catch(() => {/* ignora falha de log */});

    } catch (sendErr) {
      logError('whatsAppCampaignWorker.sendFailed', sendErr, { tenantId, phone, campaignId });
      // Continua — não aborta a campanha por falha num envio
    }

    // Delay entre envios
    await sleep(randomDelay());
  }

  // Finaliza a campanha
  await query(
    `UPDATE whatsapp_campaigns
        SET status = 'done',
            sent_count = $1,
            updated_at = NOW()
      WHERE id = $2`,
    [sentCount, campaignId],
  );

  logInfo('whatsAppCampaignWorker.done', { campaignId, tenantId, sentCount });
}
