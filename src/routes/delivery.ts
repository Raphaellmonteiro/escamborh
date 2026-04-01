// src/routes/delivery.ts — rotas autenticadas do painel delivery
import { Router, Request } from 'express';
import fs from 'fs';
import path from 'path';
import {
  buildPublicOrderItemFromPersisted,
  confirmOrderPayment,
  serializeOrderItemSelecoes,
} from '../services/ordersService';
import { q1, qAll, qRun, qInsert, withTx, txQ1, txQAll, txRun, txInsert } from '../db';
import { sendInternalError } from '../utils/internalServerError';
import {
  requireAnyPermission,
  uploadDeliveryCardapioLogo,
  uploadDeliveryCardapioBanner,
  checkMagicBytes,
} from '../middleware';
import { parseAutomationFromDeliveryConfigJson } from '../services/automationConfig';
import { validateDeliveryItems } from '../services/deliveryItemValidation';
import { isKitchenDispatchFailure } from '../services/kitchenPrintDispatchService';
import { runAutomatedKitchenPrintForOrder } from '../services/operationalAutomationService';
import { isAppError } from '../utils/errors';
import { getCustomerLoyaltyTier } from '../services/customerLoyaltyTier';
import { buildValidOrderSqlClause } from '../services/orderValiditySql';
import {
  findOrCreateStoreCustomerByPhone,
  touchStoreCustomerPurchase,
} from '../services/storeCustomerService';
import { notifyTenantOrderStreams } from '../sse';
import { normalizeCardapioOnlineBannerSlots } from '../utils/deliveryCardapioBannerSlots';
import {
  applyNormalizedBannerSlots,
  coerceDeliveryConfigRow,
  mergeDeliveryConfigClientPut,
} from '../utils/deliveryConfigPersist';
import { UPLOADS_ROOT } from '../uploadsRoot';
import { deleteStoredUpload, finalizeLocalUploadToPersistentStorage } from '../services/uploadPersistence';
import {
  isCloudinaryProductUploadEnabled,
  uploadDeliveryBannerToCloudinary,
  uploadDeliveryCardapioLogoToCloudinary,
} from '../services/cloudinaryProduct';

const TZ = 'America/Sao_Paulo';
const MANUAL_DELIVERY_TOTAL_TOLERANCE = 0.01;
const MANUAL_ORDER_NUMBER_RETRY_MAX = 5;

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
const ACTIVE_CUSTOMER_DAYS = 30;
const INACTIVE_CUSTOMER_DAYS = 60;

function isCanceledOrder(order?: { status?: string | null; cancelado_at?: string | null } | null) {
  return Boolean(order?.cancelado_at) || String(order?.status || '').trim().toLowerCase() === 'cancelado';
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function pedidoVinculoCliente(aliasP = 'p', aliasC = 'c') {
  return `${aliasP}.tenant_id = ${aliasC}.tenant_id AND (${aliasP}.cliente_id = ${aliasC}.id OR ${aliasP}.delivery_cliente_id = ${aliasC}.id)`;
}

function classifyCustomerActivity(totalValidOrders: number, daysWithoutPurchase: number | null) {
  if (totalValidOrders <= 0 || daysWithoutPurchase === null) return 'sem_compra';
  if (daysWithoutPurchase <= ACTIVE_CUSTOMER_DAYS) return 'ativo';
  if (daysWithoutPurchase <= INACTIVE_CUSTOMER_DAYS) return 'em_risco';
  return 'inativo';
}

const DELIVERY_UPLOAD_URL_PREFIX = '/uploads/delivery/';
const DELIVERY_UPLOAD_DIR = path.join(UPLOADS_ROOT, 'delivery');

function bannerSlotsFromCfg(cfg: Record<string, any>): string[] {
  return [...normalizeCardapioOnlineBannerSlots(cfg.cardapio_online_banner_urls)];
}

async function mergeDeliveryConfigJson(tenantId: number, patch: (c: Record<string, any>) => void) {
  const row = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [tenantId]);
  const cfg = coerceDeliveryConfigRow(row?.delivery_config ?? null);
  patch(cfg);
  applyNormalizedBannerSlots(cfg);
  await qRun('UPDATE clientes SET delivery_config=? WHERE id=?', [JSON.stringify(cfg), tenantId]);
  return cfg;
}

function deliveryUploadBasename(url: string): string {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) {
    try {
      return path.basename(new URL(u).pathname) || '';
    } catch {
      return '';
    }
  }
  return path.basename(u.split('?')[0]) || '';
}

async function unlinkDeliveryUploadIfOwned(url: string, tenantId: number) {
  const u = String(url || '').trim();
  if (!u) return;
  if (/^https?:\/\//i.test(u) && /res\.cloudinary\.com\//i.test(u)) {
    await deleteStoredUpload(u);
    return;
  }
  const pathOk =
    u.startsWith(DELIVERY_UPLOAD_URL_PREFIX) ||
    (/^https?:\/\//i.test(u) &&
      (() => {
        try {
          return new URL(u).pathname.replace(/\/+/g, '/').includes('/uploads/delivery/');
        } catch {
          return false;
        }
      })());
  if (!pathOk) return;
  const base = deliveryUploadBasename(u);
  const match = /^delivery_(\d+)_/.exec(base);
  if (!match || Number(match[1]) !== Number(tenantId)) return;
  await deleteStoredUpload(u);
}

function removeOtherDeliveryLogoVariants(tenantId: number, keepFilename: string) {
  const dir = DELIVERY_UPLOAD_DIR;
  if (!fs.existsSync(dir)) return;
  const prefix = `delivery_${tenantId}_cardapio_logo`;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && f !== keepFilename) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}

function removeAllDeliveryCardapioLogoFiles(tenantId: number) {
  const dir = DELIVERY_UPLOAD_DIR;
  if (!fs.existsSync(dir)) return;
  const prefix = `delivery_${tenantId}_cardapio_logo`;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix)) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}

function removeOtherDeliveryBannerVariants(tenantId: number, index: number, keepFilename: string) {
  const dir = DELIVERY_UPLOAD_DIR;
  if (!fs.existsSync(dir)) return;
  const prefix = `delivery_${tenantId}_banner_${index}.`;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && f !== keepFilename) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}

function removeAllDeliveryBannerFilesForSlot(tenantId: number, index: number) {
  const dir = DELIVERY_UPLOAD_DIR;
  if (!fs.existsSync(dir)) return;
  const prefix = `delivery_${tenantId}_banner_${index}.`;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix)) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}

export function createDeliveryRouter() {
  const router = Router();

  router.use((req, res, next) => {
    if (req.method === 'GET' && req.path === '/motoboys') {
      return requireAnyPermission('delivery', 'orders')(req, res, next);
    }

    return requireAnyPermission('delivery')(req, res, next);
  });

  router.get('/config', async (req: Request, res) => {
    try {
      const row = await q1('SELECT delivery_ativo, delivery_config FROM clientes WHERE id=?', [req.tenantId]);
      const base = coerceDeliveryConfigRow(row?.delivery_config ?? null);
      applyNormalizedBannerSlots(base);
      res.json({ ativo: !!row?.delivery_ativo, ...base });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.put('/config', async (req: Request, res) => {
    try {
      const { ativo, ...rest } = req.body;
      const row = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [req.tenantId]);
      const existing = coerceDeliveryConfigRow(row?.delivery_config ?? null);
      const merged = mergeDeliveryConfigClientPut(existing, rest && typeof rest === 'object' && !Array.isArray(rest) ? rest : {});
      await qRun('UPDATE clientes SET delivery_ativo=?, delivery_config=? WHERE id=?', [ativo?1:0, JSON.stringify(merged), req.tenantId]);
      res.json({ success: true });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.post(
    '/cardapio-visual/logo',
    uploadDeliveryCardapioLogo.single('logo'),
    checkMagicBytes,
    async (req: any, res) => {
      try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
        const tenantId = req.tenantId as number;
        const row = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [tenantId]);
        const prev = coerceDeliveryConfigRow(row?.delivery_config ?? null);
        const oldUrl = String(prev.cardapio_online_logo_url || '').trim();
        const newName = req.file.filename;
        const useCloud = isCloudinaryProductUploadEnabled();
        if (oldUrl && (useCloud || deliveryUploadBasename(oldUrl) !== newName)) {
          await unlinkDeliveryUploadIfOwned(oldUrl, tenantId);
        }
        let publicUrl: string;
        if (useCloud) {
          const buf = req.file.buffer as Buffer | undefined;
          if (!buf?.length) {
            return res.status(400).json({ success: false, message: 'Arquivo vazio ou não recebido' });
          }
          publicUrl = await uploadDeliveryCardapioLogoToCloudinary({ buffer: buf, tenantId });
        } else {
          removeOtherDeliveryLogoVariants(tenantId, newName);
          const publicPath = `${DELIVERY_UPLOAD_URL_PREFIX}${req.file.filename}`;
          publicUrl = await finalizeLocalUploadToPersistentStorage({
            absolutePath: req.file.path,
            publicPath,
            contentType: req.file.mimetype,
          });
        }
        await mergeDeliveryConfigJson(tenantId, (c) => {
          c.cardapio_online_logo_url = publicUrl;
        });
        res.json({ success: true, url: publicUrl });
      } catch (e: any) {
        sendInternalError(res, 'routes/delivery', e);
      }
    }
  );

  router.delete('/cardapio-visual/logo', async (req: any, res) => {
    try {
      const tenantId = req.tenantId as number;
      const row = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [tenantId]);
      const prev = coerceDeliveryConfigRow(row?.delivery_config ?? null);
      const oldUrl = String(prev.cardapio_online_logo_url || '').trim();
      if (oldUrl) await unlinkDeliveryUploadIfOwned(oldUrl, tenantId);
      removeAllDeliveryCardapioLogoFiles(tenantId);
      await mergeDeliveryConfigJson(tenantId, (c) => {
        delete c.cardapio_online_logo_url;
      });
      res.json({ success: true });
    } catch (e: any) {
      sendInternalError(res, 'routes/delivery', e);
    }
  });

  router.post(
    '/cardapio-visual/banner/:index',
    uploadDeliveryCardapioBanner.single('banner'),
    checkMagicBytes,
    async (req: any, res) => {
      try {
        const idx = parseInt(String(req.params.index), 10);
        if (!Number.isFinite(idx) || idx < 0 || idx > 3) {
          return res.status(400).json({ success: false, message: 'Use índice 0 a 3' });
        }
        if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
        const tenantId = req.tenantId as number;
        const row = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [tenantId]);
        const cfg = coerceDeliveryConfigRow(row?.delivery_config ?? null);
        const slots = bannerSlotsFromCfg(cfg);
        const oldUrl = slots[idx];
        const newName = req.file.filename;
        const useCloud = isCloudinaryProductUploadEnabled();
        if (oldUrl && (useCloud || deliveryUploadBasename(oldUrl) !== newName)) {
          await unlinkDeliveryUploadIfOwned(oldUrl, tenantId);
        }
        let publicUrl: string;
        if (useCloud) {
          const buf = req.file.buffer as Buffer | undefined;
          if (!buf?.length) {
            return res.status(400).json({ success: false, message: 'Arquivo vazio ou não recebido' });
          }
          publicUrl = await uploadDeliveryBannerToCloudinary({ buffer: buf, tenantId, bannerIndex: idx });
        } else {
          removeOtherDeliveryBannerVariants(tenantId, idx, newName);
          const publicPath = `${DELIVERY_UPLOAD_URL_PREFIX}${req.file.filename}`;
          publicUrl = await finalizeLocalUploadToPersistentStorage({
            absolutePath: req.file.path,
            publicPath,
            contentType: req.file.mimetype,
          });
        }
        slots[idx] = publicUrl;
        await mergeDeliveryConfigJson(tenantId, (c) => {
          c.cardapio_online_banner_urls = slots;
        });
        res.json({ success: true, url: publicUrl, index: idx });
      } catch (e: any) {
        sendInternalError(res, 'routes/delivery', e);
      }
    }
  );

  router.delete('/cardapio-visual/banner/:index', async (req: any, res) => {
    try {
      const idx = parseInt(String(req.params.index), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx > 3) {
        return res.status(400).json({ success: false, message: 'Índice inválido' });
      }
      const tenantId = req.tenantId as number;
      const row = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [tenantId]);
      const cfg = coerceDeliveryConfigRow(row?.delivery_config ?? null);
      const slots = bannerSlotsFromCfg(cfg);
      const oldUrl = slots[idx];
      if (oldUrl) await unlinkDeliveryUploadIfOwned(oldUrl, tenantId);
      removeAllDeliveryBannerFilesForSlot(tenantId, idx);
      slots[idx] = '';
      await mergeDeliveryConfigJson(tenantId, (c) => {
        c.cardapio_online_banner_urls = slots;
      });
      res.json({ success: true });
    } catch (e: any) {
      sendInternalError(res, 'routes/delivery', e);
    }
  });

router.get('/pedidos', async (req: Request, res) => {
    try {
      const { status, limit = 100 } = req.query;
      let q = `SELECT p.*, dc.nome as motoboy_nome,
        (SELECT STRING_AGG(pr.name || ' x' || ip.quantity::text, ', ')
         FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id AND pr.tenant_id=ip.tenant_id WHERE ip.order_id=p.id AND ip.tenant_id=p.tenant_id) as resumo_itens,
        (SELECT COALESCE(
          JSON_AGG(
            json_build_object(
              'product_id', ip.product_id,
              'product_name', pr.name,
              'quantity', ip.quantity,
              'price_at_time', ip.price_at_time,
              'observation', ip.observation,
              'obs_opcoes', ip.observation,
              'selecoes_json', ip.selecoes_json
            ) ORDER BY ip.id ASC
          ),
          '[]'::json
        )
        FROM itens_pedido ip
        INNER JOIN produtos pr ON pr.id=ip.product_id AND pr.tenant_id=ip.tenant_id
        WHERE ip.order_id=p.id AND ip.tenant_id=p.tenant_id) as itens,
        EXISTS (
          SELECT 1 FROM pedido_eventos pe
          WHERE pe.pedido_id = p.id AND pe.tenant_id = p.tenant_id
            AND pe.tipo = 'AUTOMATION_DELIVERY_ACEITE_AUTO'
        ) AS automation_auto_delivery_accept,
        EXISTS (
          SELECT 1 FROM pedido_eventos pe
          WHERE pe.pedido_id = p.id AND pe.tenant_id = p.tenant_id
            AND pe.tipo = 'AUTOMATION_COZINHA_FALHA'
        ) AS automation_kitchen_failed,
        EXISTS (
          SELECT 1 FROM pedido_eventos pe
          WHERE pe.pedido_id = p.id AND pe.tenant_id = p.tenant_id
            AND pe.tipo = 'AUTOMATION_COZINHA_OK'
        ) AS automation_kitchen_ok
        FROM pedidos p LEFT JOIN delivery_motoboys dc ON dc.id=p.motoboy_id AND dc.tenant_id=p.tenant_id
        WHERE p.tenant_id=? AND p.canal='delivery'`;
      const params: any[] = [req.tenantId];

      if (status) {
        const statusList = String(status).split(',');
        const mapped: string[] = [];
        
        // Mapeia os status que a tela pede para os status reais do Banco de Dados
        for (const s of statusList) {
          const tr = s.trim();
          mapped.push(tr);
          if (tr === 'Recebido') mapped.push('Criado', 'Pedido Recebido');
          if (tr === 'Pronto') mapped.push('Pronto para Entrega');
          if (tr === 'Em Rota') mapped.push('Saiu para Entrega');
        }
        
        const uniqueStatus = [...new Set(mapped)];
        const placeholders = uniqueStatus.map(() => '?').join(',');
        q += ` AND p.status IN (${placeholders})`;
        params.push(...uniqueStatus);
      }
      q += ' ORDER BY p.created_at DESC LIMIT ?'; params.push(Number(limit));

      const rows = await qAll(q, params);
      res.json(
        rows.map((p: any) => {
          let itens = p.itens;
          if (typeof itens === 'string') {
            try {
              itens = JSON.parse(itens || '[]');
            } catch {
              itens = [];
            }
          }
          if (!Array.isArray(itens)) itens = [];
          const itensPublic = itens.map((it: Record<string, unknown>) =>
            buildPublicOrderItemFromPersisted({
              order_id: Number(p.id),
              product_id: Number(it.product_id),
              quantity: Number(it.quantity),
              type: 'Delivery',
              price_at_time: Number(it.price_at_time || 0),
              variation_id: it.variation_id != null ? Number(it.variation_id) : null,
              observation: (it.observation as string | null) ?? null,
              selecoes_json: (it.selecoes_json as string | null) ?? null,
              product_name: (it.product_name as string | null) ?? null,
              product_category: null,
              production_type: null,
              requires_preparation: null,
            })
          );
          return {
            ...p,
            itens: itensPublic,
            total_amount: Number(p.total_amount || 0),
            taxa_entrega: Number(p.taxa_entrega || 0),
            automation_auto_delivery_accept: Boolean(p.automation_auto_delivery_accept),
            automation_kitchen_failed: Boolean(p.automation_kitchen_failed),
            automation_kitchen_ok: Boolean(p.automation_kitchen_ok),
          };
        })
      );
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.patch('/pedidos/:id/status', async (req: Request, res) => {
    try {
      const order = await q1('SELECT status, cancelado_at, canal FROM pedidos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (isCanceledOrder(order)) return res.status(400).json({ error: 'Pedido cancelado nao pode voltar ao fluxo operacional' });
      if (String(order.canal || '').trim().toLowerCase() !== 'delivery') {
        return res.status(400).json({ error: 'Este fluxo aceita apenas pedidos de delivery' });
      }

      const previousStatus = String(order.status || '').trim();
      const { status, motoboy_id } = req.body;
      const normalizedMotoboyId = motoboy_id == null || motoboy_id === ''
        ? null
        : Number(motoboy_id);

      if (status === 'Saiu para Entrega' && (!Number.isInteger(normalizedMotoboyId) || normalizedMotoboyId <= 0)) {
        return res.status(400).json({ error: 'Motoboy é obrigatório para enviar o pedido para entrega' });
      }

      const updates: string[] = ['status=?'];
      const params: any[] = [status];
      if (Number.isInteger(normalizedMotoboyId) && normalizedMotoboyId > 0) {
        updates.push('motoboy_id=?');
        params.push(normalizedMotoboyId);
      }
      if (status === 'Saiu para Entrega') { updates.push('saiu_entrega_at=NOW()'); }
      if (status === 'Entregue')          { updates.push('entregue_at=NOW()'); }
      params.push(req.params.id, req.tenantId);
      await qRun(`UPDATE pedidos SET ${updates.join(',')} WHERE id=? AND tenant_id=?`, params);
      notifyTenantOrderStreams(Number(req.tenantId), 'status', { orderId: Number(req.params.id) });

      const nextStatus = String(status || '').trim();
      let kitchenPrintAutomation: { ok: boolean; message?: string; reason?: string } | undefined;
      if (previousStatus === 'Criado' && nextStatus === 'Pedido Recebido') {
        const cfgRow = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [req.tenantId]);
        const parsed = coerceDeliveryConfigRow(cfgRow?.delivery_config ?? null);
        const automation = parseAutomationFromDeliveryConfigJson(parsed);
        if (automation.delivery_auto_print_production) {
          const pr = await runAutomatedKitchenPrintForOrder(Number(req.tenantId), Number(req.params.id), {
            trigger: 'delivery_manual_accept',
          });
          if (pr.ok) {
            kitchenPrintAutomation = { ok: true };
          } else if (isKitchenDispatchFailure(pr)) {
            kitchenPrintAutomation = { ok: false, message: pr.message || pr.reason, reason: pr.reason };
          }
        }
      }

      res.json({ success: true, automation: kitchenPrintAutomation ? { kitchen_print: kitchenPrintAutomation } : undefined });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.patch('/pedidos/:id/pagamento', async (req: Request, res) => {
    try {
      const order = await q1('SELECT status, cancelado_at FROM pedidos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (isCanceledOrder(order)) return res.status(400).json({ error: 'Pedido cancelado nao pode ter pagamento alterado aqui' });

      const ps = String(req.body?.pagamento_status || '').trim().toLowerCase();
      if (ps === 'pago') {
        const userId = (req as Request & { user?: { id?: number } }).user?.id;
        await confirmOrderPayment({ orderId: req.params.id, tenantId: req.tenantId, userId });
        return res.json({ success: true });
      }

      await qRun('UPDATE pedidos SET pagamento_status=? WHERE id=? AND tenant_id=?', [req.body.pagamento_status, req.params.id, req.tenantId]);
      notifyTenantOrderStreams(Number(req.tenantId), 'status', { orderId: Number(req.params.id) });
      res.json({ success: true });
    } catch (e: unknown) {
      if (isAppError(e)) return res.status(e.statusCode).json({ error: e.message });
      sendInternalError(res, 'routes/delivery', e);
    }
  });

  router.get('/motoboys', async (req: Request, res) => {
    try {
      const funcMotoboys = await qAll("SELECT id,nome,telefone FROM funcionarios WHERE tenant_id=? AND status='ativo' AND LOWER(cargo) LIKE '%motoboy%'", [req.tenantId]);
      if (funcMotoboys.length > 0) {
        for (const f of funcMotoboys) {
          await qRun(
            `INSERT INTO delivery_motoboys (tenant_id, nome, telefone, ativo) VALUES (?,?,?,1) ON CONFLICT(tenant_id, nome) DO UPDATE SET ativo=1, telefone=EXCLUDED.telefone`,
            [req.tenantId, f.nome, f.telefone||null]
          );
        }
      }
      res.json(await qAll('SELECT * FROM delivery_motoboys WHERE tenant_id=? AND ativo=1 ORDER BY nome', [req.tenantId]));
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.get('/motoboys/relatorio', async (req: Request, res) => {
    try {
      const { month, year, inicio, fim } = req.query;
      let dataInicio: string, dataFim: string;
      if (month && year) {
        const m = String(month).padStart(2, '0'), y = String(year);
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        dataInicio = `${y}-${m}-01`; dataFim = `${y}-${m}-${String(lastDay).padStart(2,'0')}`;
      } else {
        dataInicio = String(inicio || '1900-01-01'); dataFim = String(fim || '2100-12-31');
      }
      const cfgRow = await q1('SELECT delivery_config FROM clientes WHERE id=?', [req.tenantId]);
      const cfg = coerceDeliveryConfigRow(cfgRow?.delivery_config ?? null);
      const valorPorEntrega = Number(cfg.valor_por_entrega) || 0;
      const rows = await qAll(
        `SELECT m.id, m.nome, COUNT(p.id) as total_entregas,
          COALESCE(AVG(CASE WHEN p.saiu_entrega_at IS NOT NULL AND p.entregue_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (p.entregue_at - p.saiu_entrega_at))/60 END),0) as tempo_medio_min
         FROM delivery_motoboys m
         LEFT JOIN pedidos p ON p.motoboy_id=m.id AND p.tenant_id=m.tenant_id
           AND p.status='Entregue' AND (p.entregue_at AT TIME ZONE '${TZ}')::date BETWEEN ? AND ?
         WHERE m.tenant_id=? GROUP BY m.id ORDER BY total_entregas DESC`,
        [dataInicio, dataFim, req.tenantId]
      );
      res.json(rows.map((r: any) => ({ ...r, valor_por_entrega: valorPorEntrega, total_a_pagar: r.total_entregas * valorPorEntrega })));
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

router.get('/dashboard', async (req: Request, res) => {
    try {
      // Usamos a data do banco (Postgres) para evitar diferença de fuso horário com o Node.js
      const notCanceledOrderClause = buildValidOrderSqlClause();
      const [pedidosHoje, emPreparo, emRota, ticketMedio, topMotoboy] = await Promise.all([
        q1(`SELECT COUNT(*) as n, COALESCE(SUM(total_amount),0) as fat FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`, [req.tenantId]),
        q1(`SELECT COUNT(*) as n FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND status IN ('Criado','Pedido Recebido','Em Preparo')`, [req.tenantId]),
        q1(`SELECT COUNT(*) as n FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND status='Saiu para Entrega'`, [req.tenantId]),
        q1(`SELECT COALESCE(AVG(total_amount),0) as v FROM pedidos WHERE tenant_id=? AND canal='delivery' AND ${notCanceledOrderClause} AND (created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`, [req.tenantId]),
        q1(`SELECT m.nome, COUNT(p.id) as entregas FROM delivery_motoboys m JOIN pedidos p ON p.motoboy_id=m.id AND p.tenant_id=m.tenant_id WHERE m.tenant_id=? AND p.cancelado_at IS NULL AND LOWER(COALESCE(p.status,'')) <> 'cancelado' AND (p.entregue_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date GROUP BY m.id ORDER BY entregas DESC LIMIT 1`, [req.tenantId]),
      ]);

      // Conversão obrigatória para Number porque o Postgres retorna SUM/COUNT como String
      res.json({
        pedidos_hoje: Number(pedidosHoje?.n || 0),
        faturamento_hoje: Number(pedidosHoje?.fat || 0),
        em_preparo: Number(emPreparo?.n || 0),
        em_rota: Number(emRota?.n || 0),
        ticket_medio: Number(ticketMedio?.v || 0),
        top_motoboy: topMotoboy || null
      });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

router.get('/clientes', async (req: Request, res) => {
    try {
      const { search } = req.query;
      const notCanceledOrderClauseSummary = buildValidOrderSqlClause('p');
      let summaryQuery = `
        SELECT c.*,
          metrics.total_pedidos,
          metrics.total_pedidos_validos,
          metrics.total_gasto,
          COALESCE(c.primeira_compra_at, metrics.primeira_compra_at) as primeira_compra_at_calc,
          COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) as ultima_compra_at_calc,
          CASE
            WHEN COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) IS NULL THEN NULL
            ELSE FLOOR(
              EXTRACT(
                EPOCH FROM (
                  (NOW() AT TIME ZONE '${TZ}')
                  - (COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) AT TIME ZONE '${TZ}')
                )
              ) / 86400
            )::int
          END as dias_sem_comprar
        FROM delivery_clientes c
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE ${notCanceledOrderClauseSummary}) as total_pedidos_validos,
            COALESCE(SUM(CASE WHEN ${notCanceledOrderClauseSummary} THEN total_amount ELSE 0 END), 0) as total_gasto,
            MIN(created_at) FILTER (WHERE ${notCanceledOrderClauseSummary}) as primeira_compra_at,
            MAX(created_at) FILTER (WHERE ${notCanceledOrderClauseSummary}) as ultima_compra_at
          FROM pedidos p
          WHERE ${pedidoVinculoCliente('p', 'c')}
        ) metrics ON TRUE
        WHERE c.tenant_id=?
      `;
      const summaryParams: any[] = [req.tenantId];
      if (search) {
        summaryQuery += ' AND (c.nome ILIKE ? OR c.telefone ILIKE ? OR COALESCE(c.email, \'\') ILIKE ? OR COALESCE(c.observacoes, \'\') ILIKE ?)';
        const term = `%${search}%`;
        summaryParams.push(term, term, term, term);
      }
      summaryQuery += ' ORDER BY COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) DESC NULLS LAST, c.nome ASC LIMIT 200';
      const summaryRows = await qAll(summaryQuery, summaryParams);
      return res.json(summaryRows.map((row: any) => {
        const totalPedidos = Number(row.total_pedidos || 0);
        const totalPedidosValidos = Number(row.total_pedidos_validos || 0);
        const diasSemComprar = row.dias_sem_comprar === null || row.dias_sem_comprar === undefined
          ? null
          : Number(row.dias_sem_comprar);
        const ultimaCompraAt = row.ultima_compra_at_calc || null;

        const fidelizacao = getCustomerLoyaltyTier(totalPedidosValidos);
        return {
          ...row,
          total_pedidos: totalPedidos,
          total_pedidos_validos: totalPedidosValidos,
          total_gasto: Number(row.total_gasto || 0),
          primeira_compra_at: row.primeira_compra_at_calc || null,
          ultima_compra_at: ultimaCompraAt,
          ultimo_pedido: ultimaCompraAt,
          dias_sem_comprar: diasSemComprar,
          cliente_recorrente: totalPedidosValidos >= 3,
          fidelizacao,
          status_atividade: classifyCustomerActivity(totalPedidosValidos, diasSemComprar),
          sem_historico: totalPedidos <= 0,
        };
      }));
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.get('/clientes/resumo', async (req: Request, res) => {
    try {
      const { search } = req.query;
      const notCanceledOrderClause = buildValidOrderSqlClause('p');
      let q = `
        SELECT c.*,
          metrics.total_pedidos,
          metrics.total_pedidos_validos,
          metrics.total_gasto,
          COALESCE(c.primeira_compra_at, metrics.primeira_compra_at) as primeira_compra_at_calc,
          COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) as ultima_compra_at_calc,
          CASE
            WHEN COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) IS NULL THEN NULL
            ELSE FLOOR(
              EXTRACT(
                EPOCH FROM (
                  (NOW() AT TIME ZONE '${TZ}')
                  - (COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) AT TIME ZONE '${TZ}')
                )
              ) / 86400
            )::int
          END as dias_sem_comprar
        FROM delivery_clientes c
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE ${notCanceledOrderClause}) as total_pedidos_validos,
            COALESCE(SUM(CASE WHEN ${notCanceledOrderClause} THEN total_amount ELSE 0 END), 0) as total_gasto,
            MIN(created_at) FILTER (WHERE ${notCanceledOrderClause}) as primeira_compra_at,
            MAX(created_at) FILTER (WHERE ${notCanceledOrderClause}) as ultima_compra_at
          FROM pedidos p
          WHERE ${pedidoVinculoCliente('p', 'c')}
        ) metrics ON TRUE
        WHERE c.tenant_id=?
      `;
      const params: any[] = [req.tenantId];
      if (search) {
        q += ' AND (c.nome ILIKE ? OR c.telefone ILIKE ? OR COALESCE(c.email, \'\') ILIKE ? OR COALESCE(c.observacoes, \'\') ILIKE ?)';
        const t = `%${search}%`;
        params.push(t, t, t, t);
      }
      q += ' ORDER BY COALESCE(c.ultima_compra_at, metrics.ultima_compra_at) DESC NULLS LAST, c.nome ASC LIMIT 200';
      const rows = await qAll(q, params);

      res.json(rows.map((r: any) => {
        const totalPedidos = Number(r.total_pedidos || 0);
        const totalPedidosValidos = Number(r.total_pedidos_validos || 0);
        const diasSemComprar = r.dias_sem_comprar === null || r.dias_sem_comprar === undefined
          ? null
          : Number(r.dias_sem_comprar);
        const ultimaCompraAt = r.ultima_compra_at_calc || null;

        const fidelizacao = getCustomerLoyaltyTier(totalPedidosValidos);
        return {
          ...r,
          total_pedidos: totalPedidos,
          total_pedidos_validos: totalPedidosValidos,
          total_gasto: Number(r.total_gasto || 0),
          primeira_compra_at: r.primeira_compra_at_calc || null,
          ultima_compra_at: ultimaCompraAt,
          ultimo_pedido: ultimaCompraAt,
          dias_sem_comprar: diasSemComprar,
          cliente_recorrente: totalPedidosValidos >= 3,
          fidelizacao,
          status_atividade: classifyCustomerActivity(totalPedidosValidos, diasSemComprar),
          sem_historico: totalPedidos <= 0,
        };
      }));
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.patch('/clientes/:id/resumo', async (req: Request, res) => {
    try {
      const current = await q1(
        'SELECT id, nome, email, origem_cadastro, observacoes FROM delivery_clientes WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      if (!current) return res.status(404).json({ error: 'Cliente nao encontrado' });

      const nome = typeof req.body.nome === 'string' && req.body.nome.trim()
        ? req.body.nome.trim()
        : current.nome;
      const email = req.body.email === undefined
        ? current.email
        : (String(req.body.email || '').trim() || null);
      const origemCadastroInput = req.body.origem_cadastro === undefined
        ? current.origem_cadastro
        : String(req.body.origem_cadastro || '').trim();
      const origemCadastro = origemCadastroInput || current.origem_cadastro || 'delivery_online';
      const observacoes = req.body.observacoes === undefined
        ? current.observacoes
        : (String(req.body.observacoes || '').trim() || null);

      await qRun(
        `UPDATE delivery_clientes
         SET nome=?, email=?, origem_cadastro=?, observacoes=?, updated_at=NOW()
         WHERE id=? AND tenant_id=?`,
        [nome, email, origemCadastro, observacoes, req.params.id, req.tenantId]
      );

      res.json({ success: true });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.get('/clientes/:id/pedidos', async (req: Request, res) => {
    try {
      res.json(await qAll(
        `SELECT p.*, (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ') FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
         FROM pedidos p WHERE p.tenant_id=? AND (p.cliente_id=? OR p.delivery_cliente_id=?) ORDER BY p.created_at DESC LIMIT 50`,
        [req.tenantId, req.params.id, req.params.id]
      ));
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.post('/pedidos', async (req: Request, res) => {
    try {
      const { items, cliente_nome, cliente_tel, endereco, pagamento_tipo, total_amount, taxa_entrega, observation } = req.body;
      const tenantId = Number(req.tenantId);

      let subtotal: number;
      let itensValidados: any[];
      try {
        const v = await validateDeliveryItems(tenantId, items || []);
        subtotal = v.subtotal;
        itensValidados = v.itensValidados;
      } catch (e) {
        if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
        throw e;
      }

      const taxa = Number(taxa_entrega) || 0;
      const serverTotal = subtotal + taxa;
      const clientTotal = Number(total_amount);
      if (!Number.isFinite(clientTotal) || Math.abs(serverTotal - clientTotal) > MANUAL_DELIVERY_TOTAL_TOLERANCE) {
        return res.status(400).json({
          success: false,
          error: 'Total do pedido diverge do calculo no servidor',
        });
      }

      const clienteTelNormalizado = normalizePhone(cliente_tel);
      const deliveryClienteId = await findOrCreateStoreCustomerByPhone({
        tenantId,
        nome: cliente_nome,
        telefone: clienteTelNormalizado,
        origemCadastro: 'pedido_manual',
      });

      const dateObj = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const y = String(dateObj.getFullYear()).slice(-2);
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const prefix = `D${y}${m}${d}`;

      let orderId = 0;
      let on = '';
      let inserted = false;
      for (let attempt = 0; attempt < MANUAL_ORDER_NUMBER_RETRY_MAX; attempt++) {
        try {
          const r = await withTx(async (client) => {
            const todayCount = await txQ1<{ c: number }>(
              client,
              `SELECT COUNT(*)::int as c FROM pedidos WHERE tenant_id=? AND order_number LIKE ?`,
              [tenantId, `${prefix}-%`]
            );
            const n = Number(todayCount?.c || 0) + 1;
            const ordNum = `${prefix}-${String(n).padStart(3, '0')}`;
            const oid = await txInsert(
              client,
              `INSERT INTO pedidos (order_number,total_amount,taxa_entrega,observation,tenant_id,canal,cliente_nome,cliente_tel,endereco,pagamento_tipo,pagamento_status,status,delivery_cliente_id,cliente_id) VALUES (?,?,?,?,?,'delivery',?,?,?,?,?,?,?,?)`,
              [
                ordNum,
                serverTotal,
                taxa,
                observation || null,
                tenantId,
                cliente_nome || null,
                clienteTelNormalizado || null,
                endereco || null,
                pagamento_tipo || 'dinheiro',
                pagamento_tipo === 'pix' ? 'aguardando_confirmacao' : 'pendente',
                'Pedido Recebido',
                deliveryClienteId,
                deliveryClienteId,
              ]
            );
            for (const item of itensValidados) {
              const lineObsRaw = item?.obs_opcoes ?? item?.observation;
              const lineObs =
                lineObsRaw === undefined || lineObsRaw === null
                  ? null
                  : (() => {
                      const s = String(lineObsRaw).trim();
                      if (!s) return null;
                      return s.length > 4000 ? s.slice(0, 4000) : s;
                    })();
              const selecoesJson = serializeOrderItemSelecoes(item?.selecoes);
              const vidRaw = item?.variation_id;
              const vidNum = vidRaw != null ? Number(vidRaw) : null;
              const variationIdForDb = Number.isInteger(vidNum) && vidNum! > 0 ? vidNum : null;
              await txRun(
                client,
                'INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id,variation_id,observation,selecoes_json) VALUES (?,?,?,?,?,?,?,?,?)',
                [oid, item.product_id, item.quantity, 'Delivery', item.price_at_time, tenantId, variationIdForDb, lineObs, selecoesJson]
              );
            }
            return { orderId: Number(oid), orderNumber: ordNum };
          });
          orderId = r.orderId;
          on = r.orderNumber;
          inserted = true;
          break;
        } catch (e) {
          if (isPgUniqueViolation(e) && attempt < MANUAL_ORDER_NUMBER_RETRY_MAX - 1) continue;
          throw e;
        }
      }
      if (!inserted) {
        sendInternalError(
          res,
          'routes/delivery:manualOrderNumber',
          new Error('Nao foi possivel gerar numero do pedido')
        );
        return;
      }

      if (deliveryClienteId) {
        await touchStoreCustomerPurchase({
          clienteId: Number(deliveryClienteId),
          tenantId,
          origemCadastro: 'pedido_manual',
        });
      }

      const cfgRow = await q1<{ delivery_config: string | null }>('SELECT delivery_config FROM clientes WHERE id=?', [req.tenantId]);
      const parsed = coerceDeliveryConfigRow(cfgRow?.delivery_config ?? null);
      const automation = parseAutomationFromDeliveryConfigJson(parsed);
      let kitchenPrintAutomation: { ok: boolean; message?: string; reason?: string } | undefined;
      if (automation.delivery_auto_print_production) {
        const pr = await runAutomatedKitchenPrintForOrder(Number(req.tenantId), Number(orderId), {
          trigger: 'delivery_manual_post',
        });
        if (pr.ok) {
          kitchenPrintAutomation = { ok: true };
        } else if (isKitchenDispatchFailure(pr)) {
          kitchenPrintAutomation = { ok: false, message: pr.message || pr.reason, reason: pr.reason };
        }
      }

      notifyTenantOrderStreams(tenantId, 'new', { orderId });

      res.json({
        success: true,
        orderId,
        orderNumber: on,
        automation: kitchenPrintAutomation ? { kitchen_print: kitchenPrintAutomation } : undefined,
      });
    } catch (e: any) {
      if (isAppError(e)) return res.status(e.statusCode).json({ success: false, error: e.message });
      sendInternalError(res, 'routes/delivery', e);
    }
  });

  router.get('/cupons', async (req: Request, res) => {
    try { res.json(await qAll('SELECT * FROM delivery_cupons WHERE tenant_id=? ORDER BY created_at DESC', [req.tenantId])); }
    catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.post('/cupons', async (req: Request, res) => {
    try {
      const { codigo, tipo, valor, min_pedido, limite_uso, validade } = req.body;
      if (!codigo?.trim() || !tipo) return res.status(400).json({ error: 'codigo e tipo obrigatórios' });
      const id = await qInsert('INSERT INTO delivery_cupons (tenant_id,codigo,tipo,valor,min_pedido,limite_uso,validade) VALUES (?,?,?,?,?,?,?)',
        [req.tenantId, String(codigo).toUpperCase().trim(), tipo, valor||0, min_pedido||0, limite_uso||null, validade||null]);
      res.json({ success: true, id });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.patch('/cupons/:id', async (req: Request, res) => {
    try {
      await qRun('UPDATE delivery_cupons SET ativo=? WHERE id=? AND tenant_id=?', [req.body.ativo?1:0, req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });

  router.delete('/cupons/:id', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM delivery_cupons WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: unknown) { sendInternalError(res, 'routes/delivery', e); }
  });
  // ── Relatório ───────────────────────────────────────────────
// ── Relatório ─────────────────────────────────────────────────────────────
  router.get('/relatorio', async (req: Request, res) => {
    try {
      const { periodo = 'hoje' } = req.query;
      
      // Limpa a string para evitar erros se o Front mandar "7 dias" ou "7_dias"
      let pKey = String(periodo).toLowerCase().replace(/ /g, '').replace('_', '');
      if (pKey === '7dias') pKey = '7d';
      if (pKey === '30dias') pKey = '30d';
      if (pKey === 'estemes') pKey = 'mes';

      const periodoMap: Record<string, string> = {
        hoje: `(created_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date`,
        '7d': `(created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days'`,
        '30d': `(created_at AT TIME ZONE '${TZ}')::date >= (NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '29 days'`,
        mes: `DATE_TRUNC('month', created_at AT TIME ZONE '${TZ}') = DATE_TRUNC('month', NOW() AT TIME ZONE '${TZ}')`,
      };
      const dateCond = periodoMap[pKey] || periodoMap.hoje;
      const dateCondP = dateCond.replace(/created_at/g, 'p.created_at');

      const baseFilter = `tenant_id=? AND canal='delivery' AND ${dateCond}`;
      const baseFilterP = `p.tenant_id=? AND p.canal='delivery' AND ${dateCondP}`;
      const notCanceledCondition = buildValidOrderSqlClause();
      const operationalFilter = `${baseFilter} AND ${notCanceledCondition}`;
      const operationalFilterP = `${baseFilterP} AND ${buildValidOrderSqlClause('p')}`;
      const canceledCondition = `LOWER(COALESCE(status,'')) = 'cancelado' OR cancelado_at IS NOT NULL`;
      const deliveredOperationalCondition = `status='Entregue' AND ${notCanceledCondition}`;

      const [stats, porDia, porHora, topProdutos, porPagamento] = await Promise.all([
        q1(
          `SELECT SUM(CASE WHEN ${notCanceledCondition} THEN 1 ELSE 0 END) as total_pedidos,
                  COALESCE(SUM(CASE WHEN ${notCanceledCondition} THEN total_amount ELSE 0 END),0) as faturamento_total,
                  COALESCE(AVG(CASE WHEN ${notCanceledCondition} THEN total_amount END),0) as ticket_medio,
                  COUNT(DISTINCT CASE WHEN ${notCanceledCondition} THEN COALESCE(cliente_id, delivery_cliente_id) END) as clientes_unicos,
                  SUM(CASE WHEN ${deliveredOperationalCondition} THEN 1 ELSE 0 END) as entregues,
                  SUM(CASE WHEN ${canceledCondition} THEN 1 ELSE 0 END) as cancelados
           FROM pedidos WHERE ${baseFilter}`,
          [req.tenantId]
        ),
        qAll(
          `SELECT TO_CHAR((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') as dia,
                  COUNT(*) as pedidos, COALESCE(SUM(total_amount),0) as faturamento
           FROM pedidos WHERE ${operationalFilter} GROUP BY 1 ORDER BY 1 ASC`,
          [req.tenantId]
        ),
        qAll(
          `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}') as hora, COUNT(*) as pedidos
           FROM pedidos WHERE ${operationalFilter} GROUP BY 1 ORDER BY 1 ASC`,
          [req.tenantId]
        ),
        qAll(
          `SELECT pr.name, SUM(ip.quantity) as qtd, SUM(ip.quantity*ip.price_at_time) as receita
           FROM itens_pedido ip
           JOIN produtos pr ON pr.id=ip.product_id
           JOIN pedidos p ON p.id=ip.order_id
           WHERE ${operationalFilterP}
           GROUP BY pr.id, pr.name ORDER BY qtd DESC LIMIT 10`,
          [req.tenantId]
        ),
        qAll(
          `SELECT pagamento_tipo, COUNT(*) as qtd, COALESCE(SUM(total_amount),0) as total
           FROM pedidos WHERE ${operationalFilter} AND pagamento_tipo IS NOT NULL
           GROUP BY 1`,
          [req.tenantId]
        ),
      ]);

      // Envia a estrutura exata que o DeliveryScreen.tsx espera!
      res.json({ 
        resumo: {
          total_pedidos: Number(stats?.total_pedidos || 0),
          faturamento_total: Number(stats?.faturamento_total || 0),
          ticket_medio: Number(stats?.ticket_medio || 0),
          clientes_unicos: Number(stats?.clientes_unicos || 0),
          entregues: Number(stats?.entregues || 0),
          cancelados: Number(stats?.cancelados || 0),
        },
        porDia: porDia.map((d:any) => ({ ...d, pedidos: Number(d.pedidos), faturamento: Number(d.faturamento) })), 
        porHora: porHora.map((h:any) => ({ ...h, hora: Number(h.hora), pedidos: Number(h.pedidos) })), 
        topProdutos: topProdutos.map((p:any) => ({ ...p, qtd: Number(p.qtd), receita: Number(p.receita) })), 
        porPagamento: porPagamento.map((p:any) => ({ ...p, qtd: Number(p.qtd), total: Number(p.total) })) 
      });
    } catch (e: any) { 
      console.error('Erro no relatorio:', e);
      sendInternalError(res, 'routes/delivery', e); 
    }
  });

  return router;
}
