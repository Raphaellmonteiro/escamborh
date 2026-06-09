/**
 * routes/whatsapp-ai.ts — CORRIGIDO
 *
 * Correções aplicadas vs versão anterior:
 *   - "orders"      → "pedidos"       (nome real da tabela)
 *   - "order_items" → "itens_pedido"  (nome real da tabela)
 *   - colunas de pedidos corrigidas: customer_phone→cliente_tel, total→total_amount,
 *     payment_method→pagamento_tipo, payment_confirmed→pagamento_confirmado_at
 *   - itens_pedido: name→product_name inexistente → usamos product_id + price_at_time
 *   - INSERT em pedidos usa colunas reais do schema
 *   - Migrations das novas tabelas chamadas dentro de runMigrations (via db.ts)
 */

import { Router, Request } from 'express';
import {
  DEFAULT_TENANT_CHATBOT_CONFIG,
  getTenantChatbotConfig,
  loadTenantChatbotPaymentMethods,
  loadTenantChatbotRuntimeContext,
  sanitizeTenantChatbotConfigForClient,
  upsertTenantChatbotConfig,
} from '../services/chatbotService';
import { loadMenuContextForAI } from '../services/whatsAppMenuContextService';
import { notifyTenantOrderStreams } from '../sse';
import { logAIOrderCreated } from '../services/whatsAppAiLogService';
import { runCampaign } from '../services/whatsAppCampaignWorker';
import { dispatchToN8NIfConfigured } from '../services/whatsAppN8NDispatcher';
import { logError } from '../utils/logger';
import { AppError, isAppError } from '../utils/errors';
import { sendInternalError } from '../utils/internalServerError';
import { query } from '../db';

// ─── Helper ───────────────────────────────────────────────────────────────────

function getRequestTenantId(req: Request): number {
  const tenantId = Number(req.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new AppError('Tenant invalido', 400);
  }
  return tenantId;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createWhatsAppAiRouter() {
  const router = Router();

  // ── Chatbot config (existente) ────────────────────────────────────────────

  router.get('/', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const [config, runtimeContext] = await Promise.all([
        getTenantChatbotConfig(tenantId),
        loadTenantChatbotRuntimeContext(tenantId),
      ]);
      const paymentMethods = runtimeContext
        ? await loadTenantChatbotPaymentMethods(tenantId, runtimeContext)
        : [];
      const safeConfig = sanitizeTenantChatbotConfigForClient(config);

      // Uso da IA
      const usageRow = await query(
        `SELECT ai_messages_used, ai_messages_limit, ai_usage_reset_at
         FROM tenant_whatsapp_chatbot_config WHERE tenant_id = $1`,
        [tenantId]
      ).then(r => r.rows[0]).catch(() => null);

      const usage = usageRow ? {
        used: Number(usageRow.ai_messages_used ?? 0),
        limit: Number(usageRow.ai_messages_limit ?? 2000),
        reset_date: usageRow.ai_usage_reset_at,
      } : null;

      res.json({
        success: true,
        configured: Boolean(config),
        defaults: DEFAULT_TENANT_CHATBOT_CONFIG,
        config: safeConfig,
        runtime_context: runtimeContext,
        payment_methods: paymentMethods,
        usage,
      });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
      sendInternalError(res, 'routes/whatsapp-ai:get', e);
    }
  });

  router.put('/', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const { chatbot_enabled, provider, model, system_prompt, provider_config_json } = req.body ?? {};

      const config = await upsertTenantChatbotConfig({
        tenant_id: tenantId,
        chatbot_enabled,
        provider,
        model,
        system_prompt,
        provider_config_json,
      });

      const runtimeContext = await loadTenantChatbotRuntimeContext(tenantId);
      const paymentMethods = runtimeContext
        ? await loadTenantChatbotPaymentMethods(tenantId, runtimeContext)
        : [];
      const safeConfig = sanitizeTenantChatbotConfigForClient(config);

      res.json({
        success: true,
        configured: true,
        defaults: DEFAULT_TENANT_CHATBOT_CONFIG,
        config: safeConfig,
        runtime_context: runtimeContext,
        payment_methods: paymentMethods,
      });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
      sendInternalError(res, 'routes/whatsapp-ai:put', e);
    }
  });

  // ── Fase 2 — Cardápio para IA ─────────────────────────────────────────────

  router.get('/menu-context', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const menu = await loadMenuContextForAI(tenantId);

      // Segurança: mascara a chave PIX antes de retornar ao frontend
      if (menu.pix?.key) {
        const key = menu.pix.key;
        menu.pix.key = key.length > 8
          ? `${key.slice(0, 4)}···${key.slice(-4)}`
          : '****';
      }

      res.json({ success: true, menu });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:menu-context', e);
    }
  });

  // ── Fase 3 — Pedidos via IA ───────────────────────────────────────────────
  // Tabelas reais: pedidos, itens_pedido

  router.get('/orders', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const limit  = Math.min(Number(req.query.limit  ?? 50), 100);
      const offset = Number(req.query.offset ?? 0);

      // pedidos: canal='whatsapp_ai' identifica pedidos criados pela IA
      // Colunas reais: id, cliente_tel, status, pagamento_tipo, total_amount, created_at
      // payment_confirmed: usamos pagamento_confirmado_at IS NOT NULL
      const ordersResult = await query<{
        id: number;
        cliente_tel: string | null;
        status: string;
        pagamento_tipo: string | null;
        payment_confirmed: boolean;
        total_amount: number;
        created_at: string;
      }>(
        `SELECT id,
                cliente_tel,
                status,
                pagamento_tipo,
                (pagamento_confirmado_at IS NOT NULL) AS payment_confirmed,
                total_amount,
                created_at
           FROM pedidos
          WHERE tenant_id = $1
            AND canal = 'whatsapp_ai'
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      );

      const orderIds = ordersResult.rows.map((r) => r.id);
      const itemsByOrder = new Map<number, unknown[]>();

      if (orderIds.length > 0) {
        // itens_pedido: colunas reais = order_id, product_id, quantity, price_at_time
        // não tem coluna "name" — buscamos name do produto junto
        const itemsResult = await query<{
          order_id: number;
          product_id: number;
          name: string | null;
          quantity: number;
          price_at_time: number;
        }>(
          `SELECT ip.order_id,
                  ip.product_id,
                  p.name,
                  ip.quantity,
                  ip.price_at_time
             FROM itens_pedido ip
             LEFT JOIN produtos p ON p.id = ip.product_id
            WHERE ip.order_id = ANY($1::int[])
            ORDER BY ip.order_id, ip.id`,
          [orderIds],
        );
        for (const item of itemsResult.rows) {
          const list = itemsByOrder.get(item.order_id) ?? [];
          list.push({
            product_id: item.product_id,
            name:       item.name ?? `Produto #${item.product_id}`,
            qty:        item.quantity,
            unit_price: Number(item.price_at_time),
          });
          itemsByOrder.set(item.order_id, list);
        }
      }

      const orders = ordersResult.rows.map((o) => ({
        id:               o.id,
        customer_phone:   o.cliente_tel ?? '',
        status:           o.status,
        payment_method:   o.pagamento_tipo,
        payment_confirmed: Boolean(o.payment_confirmed),
        total:            Number(o.total_amount),
        created_at:       o.created_at,
        items:            itemsByOrder.get(o.id) ?? [],
      }));

      res.json({ success: true, orders });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:orders-get', e);
    }
  });

  router.post('/create-order', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const { customer_phone, items, delivery_address, payment_method } = req.body ?? {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Itens são obrigatórios.' });
      }

      // Valida produtos contra o cardápio atual
      const menu = await loadMenuContextForAI(tenantId);
      const productMap = new Map(menu.products.map((p) => [p.id, p]));

      let total = 0;
      const validatedItems: { product_id: number; qty: number; price: number }[] = [];

      for (const item of items) {
        const product = productMap.get(Number(item.product_id));
        if (!product) {
          return res.status(400).json({ success: false, error: `Produto ${item.product_id} não encontrado ou indisponível.` });
        }
        const qty = Number(item.qty ?? 1);
        if (!Number.isFinite(qty) || qty < 1) {
          return res.status(400).json({ success: false, error: `Quantidade inválida para o produto ${product.name}.` });
        }
        total += product.price * qty;
        validatedItems.push({ product_id: product.id, qty, price: product.price });
      }

      const deliveryFee = menu.delivery_config?.delivery_fee ?? 0;
      total += deliveryFee;

      // Inserir em pedidos com colunas reais do schema
      // canal='whatsapp_ai' identifica a origem
      const orderResult = await query<{ id: number }>(
        `INSERT INTO pedidos
           (tenant_id, cliente_tel, endereco, pagamento_tipo,
            total_amount, taxa_entrega, canal, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'whatsapp_ai', 'Criado', NOW())
         RETURNING id`,
        [
          tenantId,
          customer_phone ?? null,
          delivery_address ?? null,
          payment_method ?? null,
          total,
          deliveryFee,
        ],
      );
      const orderId = orderResult.rows[0].id;

      // Inserir itens em itens_pedido com colunas reais
      for (const item of validatedItems) {
        await query(
          `INSERT INTO itens_pedido (order_id, product_id, quantity, price_at_time, tenant_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.product_id, item.qty, item.price, tenantId],
        );
      }

      // Fase 3b — dispara SSE para o Balcão PDV ver o pedido em tempo real
      // Mesmo mecanismo usado pelo delivery online
      notifyTenantOrderStreams(tenantId, 'new', { orderId });

      // Fase 9b — grava log do pedido criado via IA
      logAIOrderCreated({
        tenantId,
        phone: customer_phone ?? null,
        orderId,
        total,
      });

      dispatchToN8NIfConfigured({ tenantId, event: 'order_created', payload: { order_id: orderId, total, phone: customer_phone ?? null, items_count: items.length } });
      res.json({ success: true, order_id: orderId, total });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:create-order', e);
    }
  });

  // ── Fase 5 — PIX: confirmar pagamento de pedido WhatsApp ─────────────────

  router.patch('/orders/:id/confirm-payment', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const orderId  = Number(req.params.id);

      const result = await query<{ id: number; total_amount: number }>(
        `UPDATE pedidos
            SET pagamento_confirmado_at = NOW(),
                pagamento_tipo = COALESCE(pagamento_tipo, 'Pix'),
                updated_at     = NOW()
          WHERE id = $1
            AND tenant_id = $2
            AND canal = 'whatsapp_ai'
            AND pagamento_confirmado_at IS NULL
          RETURNING id, total_amount`,
        [orderId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Pedido não encontrado, não pertence a este tenant, ou pagamento já confirmado.',
        });
      }

      res.json({ success: true, order_id: orderId, total: Number(result.rows[0].total_amount) });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:confirm-payment', e);
    }
  });

  // ── Fase 6 — Consulta de pedidos por telefone (todos os canais) ──────────

  router.get('/online-orders', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const phone    = String(req.query.phone ?? '').trim();

      if (!phone) {
        return res.status(400).json({ success: false, error: 'Parâmetro phone é obrigatório.' });
      }

      const digits = phone.replace(/\D/g, '');
      const candidates: string[] = Array.from(new Set([
        digits.slice(-11),
        digits.slice(-10),
      ])).filter((p) => p.length >= 8);

      const result = await query<{
        id: number;
        order_number: string | null;
        status: string;
        canal: string | null;
        total_amount: number;
        pagamento_tipo: string | null;
        created_at: string;
      }>(
        `SELECT id, order_number, status, canal, total_amount, pagamento_tipo, created_at
           FROM pedidos
          WHERE tenant_id = $1
            AND RIGHT(REGEXP_REPLACE(COALESCE(cliente_tel,''), '[^0-9]', '', 'g'), 11) = ANY($2::text[])
          ORDER BY created_at DESC
          LIMIT 10`,
        [tenantId, candidates],
      );

      res.json({
        success: true,
        orders: result.rows.map((o) => ({
          id:             o.id,
          order_number:   o.order_number,
          status:         o.status,
          canal:          o.canal,
          total:          Number(o.total_amount),
          payment_method: o.pagamento_tipo,
          created_at:     o.created_at,
        })),
      });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:online-orders', e);
    }
  });

    // ── Fase 7 — Campanhas ────────────────────────────────────────────────────

  router.get('/campaigns', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const result = await query<{
        id: number;
        name: string;
        message: string;
        target_type: string;
        status: string;
        scheduled_at: string | null;
        sent_count: number;
        created_at: string;
      }>(
        `SELECT id, name, message, target_type, status, scheduled_at, sent_count, created_at
           FROM whatsapp_campaigns
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT 100`,
        [tenantId],
      );
      res.json({ success: true, campaigns: result.rows });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:campaigns-get', e);
    }
  });

  router.post('/campaigns', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const { name, message, target_type, scheduled_at } = req.body ?? {};

      if (!name?.trim())    return res.status(400).json({ success: false, error: 'Nome é obrigatório.' });
      if (!message?.trim()) return res.status(400).json({ success: false, error: 'Mensagem é obrigatória.' });

      const validTargets = ['all', 'inactive_30d', 'inactive_60d', 'custom_list'];
      if (!validTargets.includes(target_type)) {
        return res.status(400).json({ success: false, error: 'Segmento inválido.' });
      }

      const result = await query<{ id: number }>(
        `INSERT INTO whatsapp_campaigns
           (tenant_id, name, message, target_type, status, scheduled_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'draft', $5, NOW(), NOW())
         RETURNING id`,
        [tenantId, name.trim(), message.trim(), target_type, scheduled_at ?? null],
      );

      res.json({ success: true, id: result.rows[0].id });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:campaigns-post', e);
    }
  });

  router.post('/campaigns/:id/send', async (req: Request, res) => {
    try {
      const tenantId  = getRequestTenantId(req);
      const campaignId = Number(req.params.id);

      const check = await query<{ status: string }>(
        `SELECT status FROM whatsapp_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [campaignId, tenantId],
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Campanha não encontrada.' });
      }
      if (['done', 'running'].includes(check.rows[0].status)) {
        return res.status(409).json({ success: false, error: 'Campanha já foi disparada ou está em execução.' });
      }

      await query(
        `UPDATE whatsapp_campaigns SET status = 'running', updated_at = NOW() WHERE id = $1`,
        [campaignId],
      );

      // Fase 7b — dispara o worker de envio em background (fire-and-forget)
      runCampaign(campaignId).catch((err) => {
        logError('routes/whatsapp-ai:campaigns-send.worker', err, { campaignId });
      });

      res.json({ success: true, message: 'Campanha iniciada. Envios acontecem em background.' });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:campaigns-send', e);
    }
  });

  router.delete('/campaigns/:id', async (req: Request, res) => {
    try {
      const tenantId  = getRequestTenantId(req);
      const campaignId = Number(req.params.id);

      await query(
        `DELETE FROM whatsapp_campaigns WHERE id = $1 AND tenant_id = $2`,
        [campaignId, tenantId],
      );
      res.json({ success: true });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:campaigns-delete', e);
    }
  });

  // ── Fase 8 — Integrações ─────────────────────────────────────────────────

  router.get('/integrations', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const result = await query<{
        id: number;
        type: string;
        config_json: Record<string, unknown>;
        enabled: boolean;
      }>(
        `SELECT id, type, config_json, enabled
           FROM whatsapp_integrations
          WHERE tenant_id = $1
          ORDER BY id ASC`,
        [tenantId],
      );
      res.json({ success: true, integrations: result.rows });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:integrations-get', e);
    }
  });

  router.post('/integrations', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const { type, config_json, enabled } = req.body ?? {};

      const validTypes = ['n8n', 'openai', 'webhook_custom'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, error: 'Tipo de integração inválido.' });
      }

      const result = await query<{ id: number }>(
        `INSERT INTO whatsapp_integrations
           (tenant_id, type, config_json, enabled, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
         RETURNING id`,
        [tenantId, type, JSON.stringify(config_json ?? {}), Boolean(enabled)],
      );
      res.json({ success: true, id: result.rows[0].id });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:integrations-post', e);
    }
  });

  router.put('/integrations/:id', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const integId  = Number(req.params.id);
      const { config_json, enabled } = req.body ?? {};

      await query(
        `UPDATE whatsapp_integrations
            SET config_json = $1::jsonb,
                enabled     = $2,
                updated_at  = NOW()
          WHERE id = $3 AND tenant_id = $4`,
        [JSON.stringify(config_json ?? {}), Boolean(enabled), integId, tenantId],
      );
      res.json({ success: true });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:integrations-put', e);
    }
  });

  router.post('/integrations/:id/test', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const integId  = Number(req.params.id);

      const check = await query<{ type: string; config_json: Record<string, unknown> }>(
        `SELECT type, config_json FROM whatsapp_integrations WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [integId, tenantId],
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Integração não encontrada.' });
      }

      const { type, config_json } = check.rows[0];
      const testPayload = { event: 'test', timestamp: new Date().toISOString(), tenant_id: tenantId };

      if (type === 'n8n' || type === 'webhook_custom') {
        const url = String((config_json as any).webhook_url ?? (config_json as any).url ?? '');
        if (!url) return res.status(400).json({ success: false, error: 'URL do webhook não configurada.' });

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = String((config_json as any).token ?? (config_json as any).secret ?? '');
        if (token && token !== '__FLOWPDV_REDACTED__') headers['Authorization'] = `Bearer ${token}`;

        const fetchRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(testPayload) });
        if (!fetchRes.ok) {
          return res.status(502).json({ success: false, error: `Webhook respondeu com status ${fetchRes.status}.` });
        }
      }

      res.json({ success: true, message: 'Evento de teste enviado.' });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:integrations-test', e);
    }
  });

  // ── Fase 9 — Logs ─────────────────────────────────────────────────────────

  router.get('/logs', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const page   = Math.max(1, Number(req.query.page  ?? 1));
      const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
      const type   = req.query.type as string | undefined;
      const offset = (page - 1) * limit;

      const params: unknown[] = [tenantId];
      let typeClause = '';

      if (type && type !== 'all') {
        params.push(type);
        typeClause = `AND type = $${params.length}`;
      }

      params.push(limit, offset);

      const result = await query<{
        id: number;
        type: string;
        summary: string;
        detail: string | null;
        phone: string | null;
        created_at: string;
      }>(
        `SELECT id, type, summary, detail, phone, created_at
           FROM whatsapp_ai_logs
          WHERE tenant_id = $1 ${typeClause}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      res.json({ success: true, logs: result.rows });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:logs', e);
    }
  });

  return router;
}
