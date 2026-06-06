/**
 * routes/whatsapp-ai.ts
 * Router expandido do módulo WhatsApp IA.
 *
 * Endpoints existentes mantidos:
 *   GET  /               — config do chatbot
 *   PUT  /               — salvar config do chatbot
 *
 * Novos endpoints (Fases 2–9):
 *   GET  /menu-context   — snapshot do cardápio para a IA
 *   GET  /orders         — pedidos criados pela IA
 *   POST /create-order   — criar pedido via IA
 *   GET  /campaigns      — listar campanhas
 *   POST /campaigns      — criar campanha
 *   POST /campaigns/:id/send  — disparar campanha
 *   DELETE /campaigns/:id     — cancelar campanha
 *   GET  /integrations   — listar integrações (N8N / GPT / Webhook)
 *   POST /integrations   — criar integração
 *   PUT  /integrations/:id    — atualizar integração
 *   POST /integrations/:id/test — disparar evento de teste
 *   GET  /logs           — histórico de eventos
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

      res.json({
        success: true,
        configured: Boolean(config),
        defaults: DEFAULT_TENANT_CHATBOT_CONFIG,
        config: safeConfig,
        runtime_context: runtimeContext,
        payment_methods: paymentMethods,
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

      // ⚠️ Segurança: mascara a chave PIX antes de retornar ao frontend
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

  router.get('/orders', async (req: Request, res) => {
    try {
      const tenantId = getRequestTenantId(req);
      const limit  = Math.min(Number(req.query.limit  ?? 50), 100);
      const offset = Number(req.query.offset ?? 0);

      // Busca pedidos com source = 'whatsapp_ai' + itens
      const ordersResult = await query<{
        id: number;
        customer_phone: string | null;
        status: string;
        payment_method: string | null;
        payment_confirmed: boolean;
        total: number;
        created_at: string;
      }>(
        `SELECT id, customer_phone, status, payment_method,
                COALESCE(payment_confirmed, false) AS payment_confirmed,
                total, created_at
           FROM orders
          WHERE tenant_id = $1
            AND source = 'whatsapp_ai'
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      );

      const orderIds = ordersResult.rows.map((r) => r.id);
      let itemsByOrder = new Map<number, unknown[]>();

      if (orderIds.length > 0) {
        const itemsResult = await query<{
          order_id: number;
          product_id: number;
          name: string;
          qty: number;
          unit_price: number;
        }>(
          `SELECT order_id, product_id, name, quantity AS qty, unit_price
             FROM order_items
            WHERE order_id = ANY($1::int[])
            ORDER BY order_id, id`,
          [orderIds],
        );
        for (const item of itemsResult.rows) {
          const list = itemsByOrder.get(item.order_id) ?? [];
          list.push({ product_id: item.product_id, name: item.name, qty: item.qty, unit_price: Number(item.unit_price) });
          itemsByOrder.set(item.order_id, list);
        }
      }

      const orders = ordersResult.rows.map((o) => ({
        ...o,
        total: Number(o.total),
        items: itemsByOrder.get(o.id) ?? [],
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
      const validatedItems: { product_id: number; name: string; qty: number; unit_price: number }[] = [];

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
        validatedItems.push({ product_id: product.id, name: product.name, qty, unit_price: product.price });
      }

      // Adiciona taxa de entrega se configurada
      const deliveryFee = menu.delivery_config?.delivery_fee ?? 0;
      total += deliveryFee;

      // Cria o pedido com source = 'whatsapp_ai'
      const orderResult = await query<{ id: number }>(
        `INSERT INTO orders
           (tenant_id, customer_phone, status, payment_method, total,
            delivery_address, source, created_at, updated_at)
         VALUES ($1, $2, 'pendente', $3, $4, $5, 'whatsapp_ai', NOW(), NOW())
         RETURNING id`,
        [tenantId, customer_phone ?? null, payment_method ?? null, total, delivery_address ?? null],
      );
      const orderId = orderResult.rows[0].id;

      // Insere os itens
      for (const item of validatedItems) {
        await query(
          `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.product_id, item.name, item.qty, item.unit_price],
        );
      }

      res.json({ success: true, order_id: orderId, total });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/whatsapp-ai:create-order', e);
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
           (tenant_id, name, message, target_type, status, scheduled_at, created_at)
         VALUES ($1, $2, $3, $4, 'draft', $5, NOW())
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
      const tenantId = getRequestTenantId(req);
      const campaignId = Number(req.params.id);

      const check = await query<{ status: string }>(
        `SELECT status FROM whatsapp_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [campaignId, tenantId],
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Campanha não encontrada.' });
      }
      if (check.rows[0].status === 'done' || check.rows[0].status === 'running') {
        return res.status(409).json({ success: false, error: 'Campanha já foi disparada ou está sendo executada.' });
      }

      // Marca como running — o worker de disparo processará em background
      await query(
        `UPDATE whatsapp_campaigns SET status = 'running', updated_at = NOW() WHERE id = $1`,
        [campaignId],
      );

      // TODO Fase 7 completa: enfileirar envios com rate-limit (evitar ban)
      // Por ora, responde imediatamente para a UI não ficar bloqueada.

      res.json({ success: true, message: 'Campanha marcada para disparo.' });
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

  // ── Fase 8 — Integrações (N8N / GPT / Webhook) ───────────────────────────

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

      const check = await query<{ type: string; config_json: Record<string, unknown>; enabled: boolean }>(
        `SELECT type, config_json, enabled FROM whatsapp_integrations WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
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
      // Para OpenAI, não testa a API key aqui — apenas confirma que está salva.

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

      const conditions: string[] = ['tenant_id = $1'];
      const params: unknown[]    = [tenantId];

      if (type && type !== 'all') {
        params.push(type);
        conditions.push(`type = $${params.length}`);
      }

      params.push(limit);
      params.push(offset);

      const where = conditions.join(' AND ');

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
          WHERE ${where}
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
