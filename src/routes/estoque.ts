// src/routes/estoque.ts
import { Router, Request, Response, NextFunction } from 'express';
import { pool, q1, qAll, qRun, qInsert, withTx } from '../db';
import {
  auditLegacyNameFallbackProducts,
  applyManualPendingInventoryFixes,
  applySafePendingInventoryFixes,
} from '../services/stockIdentification';
import { validateSecurityPassword } from '../utils/securityPassword';
import { normalizeBarcode } from '../utils/barcode';
import { generatePublicId } from '../utils/publicIds';

const TZ = 'America/Sao_Paulo';

export function createEstoqueRouter() {
  const router = Router();

  async function ensureBarcodeAvailable(
    tenantId: number,
    barcode: string | null,
    currentId?: number
  ) {
    if (!barcode) return;

    const existing = await q1<{ id: number }>(
      `SELECT id
       FROM ingredientes
       WHERE tenant_id=?
         AND id <> COALESCE(?, 0)
         AND codigo_barras IS NOT NULL
         AND UPPER(REGEXP_REPLACE(codigo_barras, '\\s+', '', 'g'))=?
       LIMIT 1`,
      [tenantId, currentId ?? null, barcode]
    );

    if (existing) {
      throw new Error('Já existe um item de estoque com este código de barras.');
    }
  }

router.get('/', async (req: Request, res) => {
    try {
      const rows = await qAll(
        `SELECT i.*,
          COALESCE((SELECT SUM(quantidade) FROM estoque_movimentacoes WHERE ingrediente_id=i.id AND tipo='entrada' AND tenant_id=i.tenant_id),0) as total_entrada,
          COALESCE((SELECT SUM(quantidade) FROM estoque_movimentacoes WHERE ingrediente_id=i.id AND tipo='saida'   AND tenant_id=i.tenant_id),0) as total_saida
         FROM ingredientes i WHERE i.tenant_id=? ORDER BY i.nome ASC`,
        [req.tenantId]
      );
      
      res.json(rows.map((r: any) => ({
        ...r,
        total_entrada: Number(r.total_entrada || 0),
        total_saida: Number(r.total_saida || 0),
        estoque_atual: Number(r.estoque_atual || 0),
        estoque_minimo: Number(r.estoque_minimo || 0),
        custo_unitario: Number(r.custo_unitario || 0)
      })));
    } catch (e: any) { res.status(e.message?.includes('código de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.get('/padronizacao/produtos-pendentes', async (req: Request, res) => {
    try {
      const onlyActive = String(req.query.active || '').trim() === '1';
      const report = await auditLegacyNameFallbackProducts({
        client: pool,
        tenantId: req.tenantId,
        onlyActive,
      });

      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/padronizacao/corrigir-seguros', async (req: Request, res) => {
    try {
      const onlyActive = req.body?.only_active !== false;
      const productIds = Array.isArray(req.body?.product_ids)
        ? req.body.product_ids.map((value: unknown) => Number(value))
        : undefined;

      const result = await withTx((client) =>
        applySafePendingInventoryFixes({
          client,
          tenantId: req.tenantId,
          onlyActive,
          productIds,
        })
      );

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/padronizacao/corrigir-manuais-fase-1', async (req: Request, res) => {
    try {
      const onlyActive = req.body?.only_active !== false;
      const productIds = Array.isArray(req.body?.product_ids)
        ? req.body.product_ids.map((value: unknown) => Number(value))
        : undefined;

      const result = await withTx((client) =>
        applyManualPendingInventoryFixes({
          client,
          tenantId: req.tenantId,
          onlyActive,
          productIds,
        })
      );

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', async (req: Request, res) => {
    try {
      const { nome, unidade, estoque_atual, estoque_minimo, custo_unitario, fornecedor, codigo_barras } = req.body;
      if (!nome?.trim() || !unidade?.trim()) return res.status(400).json({ error: 'Nome e unidade obrigatórios' });
      const normalizedBarcode = normalizeBarcode(codigo_barras);
      await ensureBarcodeAvailable(req.tenantId, normalizedBarcode);
      const id = await qInsert(
        'INSERT INTO ingredientes (public_id,nome,unidade,estoque_atual,estoque_minimo,custo_unitario,fornecedor,codigo_barras,tenant_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [generatePublicId('ing'), nome.trim(), unidade.trim(), estoque_atual||0, estoque_minimo||0, custo_unitario||0, fornecedor||null, normalizedBarcode, req.tenantId]
      );
      res.json({ id, success: true });
    } catch (e: any) { res.status(e.message?.includes('código de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.put('/:id', async (req: Request, res) => {
    try {
      const { nome, unidade, estoque_minimo, custo_unitario, fornecedor, codigo_barras } = req.body;
      const current = await q1<{ codigo_barras?: string | null }>(
        'SELECT codigo_barras FROM ingredientes WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      const normalizedBarcode = normalizeBarcode(codigo_barras);
      if (normalizedBarcode !== normalizeBarcode(current?.codigo_barras)) {
        await ensureBarcodeAvailable(req.tenantId, normalizedBarcode, Number(req.params.id));
      }
      await qRun('UPDATE ingredientes SET nome=?,unidade=?,estoque_minimo=?,custo_unitario=?,fornecedor=?,codigo_barras=? WHERE id=? AND tenant_id=?',
        [nome, unidade, estoque_minimo||0, custo_unitario||0, fornecedor||null, normalizedBarcode, req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(e.message?.includes('código de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await validateSecurityPassword({
        tenantId: req.tenantId,
        userId: req.user?.id,
        password: req.body?.senha,
        type: 'admin',
      });

      await qRun('DELETE FROM estoque_movimentacoes WHERE ingrediente_id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      await qRun('DELETE FROM ingredientes WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (error) { next(error); }
  });

  router.post('/:id/movimentacao', async (req: Request, res) => {
    try {
      const { tipo, quantidade, motivo } = req.body;
      if (!tipo || !quantidade) return res.status(400).json({ error: 'tipo e quantidade obrigatórios' });
      const ing = await q1('SELECT * FROM ingredientes WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!ing) return res.status(404).json({ error: 'Ingrediente não encontrado' });
      const novoEstoque = tipo === 'entrada'
        ? ing.estoque_atual + Number(quantidade)
        : Math.max(0, ing.estoque_atual - Number(quantidade));
      await qRun('UPDATE ingredientes SET estoque_atual=? WHERE id=? AND tenant_id=?', [novoEstoque, req.params.id, req.tenantId]);
      await qRun('INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id) VALUES (?,?,?,?,?)',
        [req.params.id, tipo, quantidade, motivo||null, req.tenantId]);
      res.json({ success: true, estoque_atual: novoEstoque });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/movimentacoes/hoje', async (req: Request, res) => {
    try {
      res.json(await qAll(
        `SELECT m.*, i.nome as ingrediente_nome, i.unidade
         FROM estoque_movimentacoes m JOIN ingredientes i ON m.ingrediente_id=i.id
         WHERE m.tenant_id=? AND (m.created_at AT TIME ZONE '${TZ}')::date = CURRENT_DATE
         ORDER BY m.created_at DESC`,
        [req.tenantId]
      ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/movimentacoes/periodo', async (req: Request, res) => {
    try {
      const { inicio, fim } = req.query;
      res.json(await qAll(
        `SELECT m.*, i.nome as ingrediente_nome, i.unidade
         FROM estoque_movimentacoes m JOIN ingredientes i ON m.ingrediente_id=i.id
         WHERE m.tenant_id=? AND (m.created_at AT TIME ZONE '${TZ}')::date BETWEEN ? AND ?
         ORDER BY m.created_at DESC`,
        [req.tenantId, inicio, fim]
      ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id/historico', async (req: Request, res) => {
    try {
      res.json(await qAll('SELECT * FROM estoque_movimentacoes WHERE ingrediente_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 50', [req.params.id, req.tenantId]));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/relatorio/consumo', async (req: Request, res) => {
    try {
      const { inicio, fim } = req.query;
      const inicioPeriodo = String(inicio || '1900-01-01');
      const fimPeriodo = String(fim || '2100-12-31');
      const rows = await qAll(
        `SELECT i.id, i.nome, i.unidade, i.custo_unitario, i.fornecedor,
           COALESCE(SUM(CASE WHEN m.tipo='saida' THEN m.quantidade ELSE 0 END),0) as total_saida,
           COALESCE(SUM(CASE WHEN m.tipo='entrada' THEN m.quantidade ELSE 0 END),0) as total_entrada,
           COALESCE(SUM(CASE WHEN m.tipo='saida' THEN 1 ELSE 0 END),0) as qtd_saidas
         FROM ingredientes i
         LEFT JOIN estoque_movimentacoes m ON m.ingrediente_id=i.id AND m.tenant_id=i.tenant_id
           AND (m.created_at AT TIME ZONE '${TZ}')::date BETWEEN ? AND ?
         WHERE i.tenant_id=?
         GROUP BY i.id, i.nome, i.unidade, i.custo_unitario, i.fornecedor
         ORDER BY total_saida DESC`,
        [inicioPeriodo, fimPeriodo, req.tenantId]
      );

      const consumo = rows.map((row: any) => {
        const custoUnitario = Number(row.custo_unitario || 0);
        const totalSaida = Number(row.total_saida || 0);
        return {
          id: Number(row.id || 0),
          nome: row.nome || '',
          unidade: row.unidade || 'unidade',
          custo_unitario: custoUnitario,
          fornecedor: row.fornecedor || undefined,
          total_saida: totalSaida,
          total_entrada: Number(row.total_entrada || 0),
          custo_total: custoUnitario * totalSaida,
          qtd_saidas: Number(row.qtd_saidas || 0),
        };
      });

      res.json({
        consumo,
        custo_total_periodo: consumo.reduce((total, item) => total + item.custo_total, 0),
        periodo: { inicio: inicioPeriodo, fim: fimPeriodo },
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/ficha-tecnica/:product_id', async (req: Request, res) => {
    try {
      const rows = await qAll(
        `SELECT pi.*, i.nome as ingrediente_nome, i.unidade, i.estoque_atual, i.custo_unitario
         FROM produto_ingrediente pi JOIN ingredientes i ON i.id=pi.ingrediente_id
         WHERE pi.product_id=? AND pi.tenant_id=?`,
        [req.params.product_id, req.tenantId]
      );

      res.json(rows.map((row: any) => ({
        ...row,
        quantidade_usada: Number(row.quantidade_usada || 0),
        estoque_atual: Number(row.estoque_atual || 0),
        custo_unitario: row.custo_unitario == null ? null : Number(row.custo_unitario),
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/ficha-tecnica/:product_id', async (req: Request, res) => {
    try {
      const { ingrediente_id, quantidade_usada, unidade } = req.body;
      const existing = await q1('SELECT id FROM produto_ingrediente WHERE product_id=? AND ingrediente_id=? AND tenant_id=?',
        [req.params.product_id, ingrediente_id, req.tenantId]);
      if (existing) {
        await qRun('UPDATE produto_ingrediente SET quantidade_usada=?,unidade=? WHERE product_id=? AND ingrediente_id=? AND tenant_id=?',
          [quantidade_usada, unidade||'unidade', req.params.product_id, ingrediente_id, req.tenantId]);
      } else {
        await qRun('INSERT INTO produto_ingrediente (product_id,ingrediente_id,quantidade_usada,unidade,tenant_id) VALUES (?,?,?,?,?)',
          [req.params.product_id, ingrediente_id, quantidade_usada, unidade||'unidade', req.tenantId]);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/ficha-tecnica/:product_id/:ingrediente_id', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM produto_ingrediente WHERE product_id=? AND ingrediente_id=? AND tenant_id=?',
        [req.params.product_id, req.params.ingrediente_id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
