// src/routes/products.ts
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { q1, qAll, qRun, qInsert } from '../db';
import { upload, uploadFotoFunc, checkMagicBytes } from '../middleware';
import { validateSecurityPassword } from '../utils/securityPassword';
import { normalizeBarcode } from '../utils/barcode';
import { generatePublicId } from '../utils/publicIds';
import { normalizeProductProductionInput } from '../utils/preparation';

export function createProductsRouter() {
  const router = Router();

  async function ensureBarcodeAvailable(
    tenantId: number,
    barcode: string | null,
    currentId?: number
  ) {
    if (!barcode) {
      return;
    }

    const existing = await q1<{ id: number }>(
      `SELECT id
       FROM produtos
       WHERE tenant_id=?
         AND id <> COALESCE(?, 0)
         AND codigo_barras IS NOT NULL
         AND UPPER(REGEXP_REPLACE(codigo_barras, '\\s+', '', 'g'))=?
       LIMIT 1`,
      [tenantId, currentId ?? null, barcode]
    );

    if (existing) {
      throw new Error('J\u00E1 existe um produto com este c\u00F3digo de barras.');
    }
  }

  router.get('/', async (req: Request, res) => {
    const { q, active, limit, offset } = req.query;
    try {
      if (q) {
        const term = `%${q}%`;
        const activeFilter = active !== undefined ? ' AND active=?' : '';
        const activeParam = active !== undefined ? [Number(active)] : [];
        return res.json(await qAll(
          `SELECT * FROM produtos WHERE tenant_id=? AND (name ILIKE ? OR codigo_barras ILIKE ? OR marca ILIKE ? OR descricao ILIKE ?) ${activeFilter} ORDER BY COALESCE(ordem,0) ASC, name ASC LIMIT 200`,
          [req.tenantId, term, term, term, term, ...activeParam]
        ));
      }
      const activeFilter = active !== undefined ? ' AND active=?' : '';
      const activeParam = active !== undefined ? [Number(active)] : [];
      if (limit) {
        const lim = Math.min(Number(limit) || 50, 500);
        const off = Number(offset) || 0;
        return res.json(await qAll(
          `SELECT * FROM produtos WHERE tenant_id=? ${activeFilter} ORDER BY COALESCE(ordem,0) ASC, name ASC LIMIT ? OFFSET ?`,
          [req.tenantId, ...activeParam, lim, off]
        ));
      }
      res.json(await qAll(
        `SELECT * FROM produtos WHERE tenant_id=? ${activeFilter} ORDER BY COALESCE(ordem,0) ASC, name ASC`,
        [req.tenantId, ...activeParam]
      ));
    } catch (e: any) { res.status(e.message?.includes('c\u00F3digo de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.get('/barcode/:code', async (req: Request, res) => {
    const barcode = normalizeBarcode(req.params.code);
    if (!barcode) return res.status(400).json({ found: false, message: 'C\u00F3digo de barras inv\u00E1lido' });
    const product = await q1(
      `SELECT *
       FROM produtos
       WHERE tenant_id=?
         AND active=1
         AND codigo_barras IS NOT NULL
         AND UPPER(REGEXP_REPLACE(codigo_barras, '\\s+', '', 'g'))=?
       LIMIT 1`,
      [req.tenantId, barcode]
    );
    if (!product) return res.status(404).json({ found: false });
    res.json({ found: true, product });
  });

  router.post('/suggestions', async (req: Request, res) => {
    try {
      const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
      const productIds = [...new Set(
        rawIds
          .map((id: any) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0)
      )];

      if (!productIds.length) return res.json([]);

      const sourcePlaceholders = productIds.map(() => '?').join(',');
      const excludePlaceholders = productIds.map(() => '?').join(',');
      const manualRows = await qAll(
        `SELECT
           p.id,
           p.name,
           p.price,
           p.category,
           p.photo_url,
           MAX(ps.prioridade) AS prioridade
         FROM produto_sugestoes ps
         JOIN produtos p
           ON p.id = ps.produto_sugerido_id
          AND p.tenant_id = ps.tenant_id
         WHERE ps.tenant_id = ?
           AND ps.ativo = 1
           AND p.active = 1
           AND ps.produto_id IN (${sourcePlaceholders})
           AND ps.produto_id <> ps.produto_sugerido_id
           AND ps.produto_sugerido_id NOT IN (${excludePlaceholders})
         GROUP BY p.id, p.name, p.price, p.category, p.photo_url
         ORDER BY MAX(ps.prioridade) DESC, p.name ASC
         LIMIT 3`,
        [req.tenantId, ...productIds, ...productIds]
      );

      const suggestions = [...manualRows];
      if (suggestions.length < 3) {
        const cartProfile = await qAll(
          `SELECT production_type, category
           FROM produtos
           WHERE tenant_id = ?
             AND id IN (${sourcePlaceholders})`,
          [req.tenantId, ...productIds]
        );

        const hasKitchen = cartProfile.some((p: any) => String(p.production_type || '').toLowerCase() === 'kitchen');
        const hasDrink = cartProfile.some((p: any) => {
          const productionType = String(p.production_type || '').toLowerCase();
          const category = String(p.category || '').toLowerCase();
          return productionType === 'bar' || category.includes('bebida');
        });

        if (hasKitchen || hasDrink) {
          const alreadySuggestedIds = suggestions.map((s: any) => Number(s.id)).filter((id: number) => Number.isInteger(id) && id > 0);
          const excludedIds = [...new Set([...productIds, ...alreadySuggestedIds])];
          const excludedPlaceholders = excludedIds.map(() => '?').join(',');
          const fallbackFilters: string[] = [];

          if (hasKitchen) {
            fallbackFilters.push(`(LOWER(COALESCE(p.production_type, '')) = 'bar' OR LOWER(COALESCE(p.category, '')) LIKE '%bebida%')`);
          }
          if (hasDrink) {
            fallbackFilters.push(`LOWER(COALESCE(p.production_type, '')) = 'kitchen'`);
          }

          if (fallbackFilters.length > 0) {
            const missing = 3 - suggestions.length;
            const fallbackRows = await qAll(
              `SELECT
                 p.id,
                 p.name,
                 p.price,
                 p.category,
                 p.photo_url,
                 0 AS prioridade
               FROM produtos p
               WHERE p.tenant_id = ?
                 AND p.active = 1
                 AND p.id NOT IN (${excludedPlaceholders})
                 AND (${fallbackFilters.join(' OR ')})
               ORDER BY p.name ASC
               LIMIT ?`,
              [req.tenantId, ...excludedIds, missing]
            );
            suggestions.push(...fallbackRows);
          }
        }
      }

      res.json(suggestions.slice(0, 3));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id/suggestions', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produto invalido' });
      }

      const rows = await qAll(
        `SELECT
           ps.produto_sugerido_id AS id,
           p.name,
           p.price,
           p.category,
           p.photo_url,
           ps.prioridade
         FROM produto_sugestoes ps
         JOIN produtos p
           ON p.id = ps.produto_sugerido_id
          AND p.tenant_id = ps.tenant_id
         WHERE ps.tenant_id = ?
           AND ps.produto_id = ?
           AND ps.ativo = 1
         ORDER BY ps.prioridade DESC, p.name ASC`,
        [req.tenantId, productId]
      );

      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/suggestions', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      const suggestedProductId = Number(req.body?.suggestedProductId);
      const priority = Number(req.body?.priority ?? 0);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produto invalido' });
      }
      if (!Number.isInteger(suggestedProductId) || suggestedProductId <= 0) {
        return res.status(400).json({ error: 'Produto sugerido invalido' });
      }
      if (productId === suggestedProductId) {
        return res.status(400).json({ error: 'Nao e permitido sugerir o proprio produto' });
      }

      const [origem, sugerido] = await Promise.all([
        q1('SELECT id FROM produtos WHERE id=? AND tenant_id=?', [productId, req.tenantId]),
        q1('SELECT id FROM produtos WHERE id=? AND tenant_id=?', [suggestedProductId, req.tenantId]),
      ]);
      if (!origem || !sugerido) {
        return res.status(404).json({ error: 'Produto nao encontrado' });
      }

      const existente = await q1(
        `SELECT id
         FROM produto_sugestoes
         WHERE tenant_id=?
           AND produto_id=?
           AND produto_sugerido_id=?
         LIMIT 1`,
        [req.tenantId, productId, suggestedProductId]
      );
      if (existente) {
        return res.status(400).json({ error: 'Sugestao ja cadastrada' });
      }

      await qRun(
        `INSERT INTO produto_sugestoes
          (tenant_id, produto_id, produto_sugerido_id, prioridade, ativo)
         VALUES (?, ?, ?, ?, 1)`,
        [req.tenantId, productId, suggestedProductId, Number.isFinite(priority) ? priority : 0]
      );

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id/variacoes-vendaveis', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produto invalido' });
      }

      const produto = await q1('SELECT id FROM produtos WHERE id=? AND tenant_id=?', [productId, req.tenantId]);
      if (!produto) return res.status(404).json({ error: 'Produto nao encontrado' });

      const includeInactive = String(req.query.includeInactive || '') === '1';
      const activeFilter = includeInactive ? '' : ' AND ativo=1';

      const rows = await qAll(
        `SELECT id, produto_id, nome, preco, codigo_barras, ativo, ordem, ingrediente_id
         FROM produto_variacoes_vendaveis
         WHERE tenant_id=?
           AND produto_id=?${activeFilter}
         ORDER BY ordem ASC, nome ASC`,
        [req.tenantId, productId]
      );

      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/variacoes-vendaveis', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produto invalido' });
      }

      const produto = await q1('SELECT id FROM produtos WHERE id=? AND tenant_id=?', [productId, req.tenantId]);
      if (!produto) return res.status(404).json({ error: 'Produto nao encontrado' });

      const nome = String(req.body?.nome || '').trim();
      if (!nome) {
        return res.status(400).json({ error: 'Nome obrigatorio' });
      }

      const preco = Number(req.body?.preco);
      if (!Number.isFinite(preco) || preco < 0) {
        return res.status(400).json({ error: 'Preco invalido' });
      }

      const ordem = Number(req.body?.ordem ?? 0);
      const ativo = req.body?.ativo === false || req.body?.ativo === 0 ? 0 : 1;
      const codigoBarras = normalizeBarcode(req.body?.codigo_barras);

      let ingredienteId: number | null = null;
      if (req.body?.ingrediente_id != null && req.body?.ingrediente_id !== '') {
        const iid = Number(req.body.ingrediente_id);
        if (!Number.isInteger(iid) || iid <= 0) {
          return res.status(400).json({ error: 'ingrediente_id invalido' });
        }
        const ing = await q1('SELECT id FROM ingredientes WHERE id=? AND tenant_id=?', [iid, req.tenantId]);
        if (!ing) {
          return res.status(400).json({ error: 'Ingrediente nao encontrado' });
        }
        ingredienteId = iid;
      }

      const dupNome = await q1(
        `SELECT id FROM produto_variacoes_vendaveis
         WHERE tenant_id=?
           AND produto_id=?
           AND LOWER(TRIM(nome)) = LOWER(?)
         LIMIT 1`,
        [req.tenantId, productId, nome]
      );
      if (dupNome) {
        return res.status(400).json({ error: 'Ja existe variacao com este nome neste produto' });
      }

      await qInsert(
        `INSERT INTO produto_variacoes_vendaveis
          (tenant_id, produto_id, nome, preco, codigo_barras, ativo, ordem, ingrediente_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.tenantId, productId, nome, preco, codigoBarras || null, ativo, Number.isFinite(ordem) ? ordem : 0, ingredienteId]
      );

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id/variacoes-vendaveis/:variationId', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      const variationId = Number(req.params.variationId);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(variationId) || variationId <= 0) {
        return res.status(400).json({ error: 'Parametros invalidos' });
      }

      await qRun(
        `DELETE FROM produto_variacoes_vendaveis
         WHERE id=?
           AND tenant_id=?
           AND produto_id=?`,
        [variationId, req.tenantId, productId]
      );

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:id/variacoes-vendaveis/:variationId', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      const variationId = Number(req.params.variationId);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(variationId) || variationId <= 0) {
        return res.status(400).json({ error: 'Parametros invalidos' });
      }

      const produto = await q1('SELECT id FROM produtos WHERE id=? AND tenant_id=?', [productId, req.tenantId]);
      if (!produto) return res.status(404).json({ error: 'Produto nao encontrado' });

      const variacao = await q1(
        'SELECT id FROM produto_variacoes_vendaveis WHERE id=? AND tenant_id=? AND produto_id=?',
        [variationId, req.tenantId, productId]
      );
      if (!variacao) return res.status(404).json({ error: 'Variacao nao encontrada' });

      const nome = String(req.body?.nome || '').trim();
      if (!nome) {
        return res.status(400).json({ error: 'Nome obrigatorio' });
      }

      const preco = Number(req.body?.preco);
      if (!Number.isFinite(preco) || preco < 0) {
        return res.status(400).json({ error: 'Preco invalido' });
      }

      const ordem = Number(req.body?.ordem ?? 0);
      const ativo = req.body?.ativo === false || req.body?.ativo === 0 ? 0 : 1;
      const codigoBarras = normalizeBarcode(req.body?.codigo_barras);

      let ingredienteId: number | null | undefined;
      if (Object.hasOwn(req.body || {}, 'ingrediente_id')) {
        ingredienteId = null;
        if (req.body?.ingrediente_id != null && req.body?.ingrediente_id !== '') {
          const iid = Number(req.body.ingrediente_id);
          if (!Number.isInteger(iid) || iid <= 0) {
            return res.status(400).json({ error: 'ingrediente_id invalido' });
          }
          const ing = await q1('SELECT id FROM ingredientes WHERE id=? AND tenant_id=?', [iid, req.tenantId]);
          if (!ing) {
            return res.status(400).json({ error: 'Ingrediente nao encontrado' });
          }
          ingredienteId = iid;
        }
      }

      const dupNome = await q1(
        `SELECT id FROM produto_variacoes_vendaveis
         WHERE tenant_id=?
           AND produto_id=?
           AND LOWER(TRIM(nome)) = LOWER(?)
           AND id <> ?
         LIMIT 1`,
        [req.tenantId, productId, nome, variationId]
      );
      if (dupNome) {
        return res.status(400).json({ error: 'Ja existe variacao com este nome neste produto' });
      }

      if (ingredienteId === undefined) {
        await qRun(
          `UPDATE produto_variacoes_vendaveis
           SET nome=?, preco=?, codigo_barras=?, ativo=?, ordem=?
           WHERE id=? AND tenant_id=? AND produto_id=?`,
          [nome, preco, codigoBarras || null, ativo, Number.isFinite(ordem) ? ordem : 0, variationId, req.tenantId, productId]
        );
      } else {
        await qRun(
          `UPDATE produto_variacoes_vendaveis
           SET nome=?, preco=?, codigo_barras=?, ativo=?, ordem=?, ingrediente_id=?
           WHERE id=? AND tenant_id=? AND produto_id=?`,
          [nome, preco, codigoBarras || null, ativo, Number.isFinite(ordem) ? ordem : 0, ingredienteId, variationId, req.tenantId, productId]
        );
      }

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id/suggestions/:suggestedId', async (req: Request, res) => {
    try {
      const productId = Number(req.params.id);
      const suggestedId = Number(req.params.suggestedId);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(suggestedId) || suggestedId <= 0) {
        return res.status(400).json({ error: 'Parametros invalidos' });
      }

      await qRun(
        `DELETE FROM produto_sugestoes
         WHERE tenant_id=?
           AND produto_id=?
           AND produto_sugerido_id=?`,
        [req.tenantId, productId, suggestedId]
      );

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req: Request, res) => {
    try {
      const {
        name,
        price,
        category,
        active,
        color,
        codigo_barras,
        marca,
        descricao,
        custo,
        destaque,
        disponivel_de,
        disponivel_ate,
        requires_preparation,
        production_type,
      } = req.body;
      const normalizedBarcode = normalizeBarcode(codigo_barras);
      const normalizedProduction = normalizeProductProductionInput(
        { production_type, requires_preparation },
        { name, category }
      );
      await ensureBarcodeAvailable(req.tenantId, normalizedBarcode);
      const maxOrdem = await q1('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM produtos WHERE tenant_id=?', [req.tenantId]);
      const id = await qInsert(
        'INSERT INTO produtos (public_id,name,price,category,active,color,codigo_barras,marca,descricao,custo,destaque,ordem,disponivel_de,disponivel_ate,requires_preparation,production_type,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [generatePublicId('prd'), name, price, category, active?1:0, color||'zinc', normalizedBarcode, marca||null, descricao||null, custo||0, destaque?1:0, maxOrdem?.next||0, disponivel_de||null, disponivel_ate||null, normalizedProduction.requiresPreparation, normalizedProduction.productionType, req.tenantId]
      );
      res.json({ id });
    } catch (e: any) { res.status(e.message?.includes('c\u00F3digo de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.put('/reorder', async (req: Request, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items deve ser array' });
      for (const item of items) await qRun('UPDATE produtos SET ordem=? WHERE id=? AND tenant_id=?', [item.ordem, item.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(e.message?.includes('c\u00F3digo de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.put('/:id', async (req: Request, res) => {
    try {
      const {
        name,
        price,
        category,
        active,
        color,
        codigo_barras,
        marca,
        descricao,
        custo,
        destaque,
        disponivel_de,
        disponivel_ate,
        requires_preparation,
        production_type,
      } = req.body;
      const current = await q1<{
        codigo_barras?: string | null;
        requires_preparation?: number | null;
        production_type?: string | null;
        name?: string | null;
        category?: string | null;
      }>(
        'SELECT codigo_barras, requires_preparation, production_type, name, category FROM produtos WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      const normalizedBarcode = normalizeBarcode(codigo_barras);
      const normalizedProduction = normalizeProductProductionInput(
        {
          production_type,
          requires_preparation,
        },
        { name: name ?? current?.name ?? null, category: category ?? current?.category ?? null },
        {
          production_type: current?.production_type,
          requires_preparation: current?.requires_preparation,
        },
      );
      if (normalizedBarcode !== normalizeBarcode(current?.codigo_barras)) {
        await ensureBarcodeAvailable(req.tenantId, normalizedBarcode, Number(req.params.id));
      }
      await qRun(
        'UPDATE produtos SET name=?,price=?,category=?,active=?,color=?,codigo_barras=?,marca=?,descricao=?,custo=?,destaque=?,disponivel_de=?,disponivel_ate=?,requires_preparation=?,production_type=? WHERE id=? AND tenant_id=?',
        [name, price, category, active?1:0, color||'zinc', normalizedBarcode, marca||null, descricao||null, custo||0, destaque?1:0, disponivel_de||null, disponivel_ate||null, normalizedProduction.requiresPreparation, normalizedProduction.productionType, req.params.id, req.tenantId]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/duplicar', async (req: Request, res) => {
    try {
      const p = await q1('SELECT * FROM produtos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!p) return res.status(404).json({ error: 'Produto n\u00E3o encontrado' });
      const maxOrdem = await q1('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM produtos WHERE tenant_id=?', [req.tenantId]);
      const id = await qInsert(
        'INSERT INTO produtos (name,price,category,active,color,codigo_barras,marca,descricao,custo,destaque,ordem,disponivel_de,disponivel_ate,requires_preparation,production_type,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [`${p.name} (c\u00F3pia)`, p.price, p.category, 0, p.color, null, p.marca, p.descricao, p.custo, 0, maxOrdem?.next||0, p.disponivel_de, p.disponivel_ate, p.requires_preparation ?? null, p.production_type ?? null, req.tenantId]
      );
      res.json({ id, success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await validateSecurityPassword({
        tenantId: req.tenantId,
        userId: req.user?.id,
        password: req.body?.senha,
        type: 'admin',
      });

      const produto = await q1('SELECT photo_url FROM produtos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (produto?.photo_url) { try { fs.unlinkSync(`.${produto.photo_url}`); } catch {} }
      const grupos = await qAll('SELECT id FROM produto_grupos_opcao WHERE produto_id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      for (const g of grupos) await qRun('DELETE FROM produto_opcao_itens WHERE grupo_id=? AND tenant_id=?', [g.id, req.tenantId]);
      await qRun('DELETE FROM produto_grupos_opcao WHERE produto_id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      await qRun('DELETE FROM produtos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) {
      if (e.code === '23503')
        return res.status(400).json({ success: false, message: 'Produto com vendas registradas. Desative-o ao inv\u00E9s de excluir.' });
      next(e);
    }
  });

  router.post('/:id/photo', upload.single('photo'), checkMagicBytes, async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
      const photoUrl = `/uploads/${req.file.filename}`;
      const old = await q1('SELECT photo_url FROM produtos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (old?.photo_url) { try { fs.unlinkSync(`.${old.photo_url}`); } catch {} }
      await qRun('UPDATE produtos SET photo_url=? WHERE id=? AND tenant_id=?', [photoUrl, req.params.id, req.tenantId]);
      res.json({ success: true, photo_url: photoUrl });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.delete('/:id/photo', async (req: Request, res) => {
    try {
      const p = await q1('SELECT photo_url FROM produtos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (p?.photo_url) { try { fs.unlinkSync(`.${p.photo_url}`); } catch {} }
      await qRun('UPDATE produtos SET photo_url=NULL WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/:id/opcoes', async (req: Request, res) => {
    try {
      const grupos = await qAll('SELECT * FROM produto_grupos_opcao WHERE produto_id=? AND tenant_id=? ORDER BY ordem ASC, id ASC', [req.params.id, req.tenantId]);
      const result = [];
      for (const g of grupos) {
        const itens = await qAll('SELECT * FROM produto_opcao_itens WHERE grupo_id=? AND tenant_id=? AND ativo=1 ORDER BY ordem ASC, id ASC', [g.id, req.tenantId]);
        result.push({ ...g, itens });
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/opcoes/grupos', async (req: Request, res) => {
    try {
      const { nome, tipo, min_selecoes, max_selecoes, obrigatorio, ordem, modo_preco } = req.body;
      if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigat\u00F3rio' });
      const maxOrdem = await q1('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM produto_grupos_opcao WHERE produto_id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      const id = await qInsert(
        'INSERT INTO produto_grupos_opcao (produto_id,tenant_id,nome,tipo,min_selecoes,max_selecoes,obrigatorio,ordem,modo_preco) VALUES (?,?,?,?,?,?,?,?,?)',
        [req.params.id, req.tenantId, nome.trim(), tipo||'radio', min_selecoes||0, max_selecoes||1, obrigatorio?1:0, ordem??maxOrdem?.next??0, modo_preco||'adicional']
      );
      res.json({ success: true, id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/opcoes/grupos/:grupoId', async (req: Request, res) => {
    try {
      const { nome, tipo, min_selecoes, max_selecoes, obrigatorio, ordem, ativo, modo_preco } = req.body;
      await qRun(
        'UPDATE produto_grupos_opcao SET nome=?,tipo=?,min_selecoes=?,max_selecoes=?,obrigatorio=?,ordem=?,ativo=?,modo_preco=? WHERE id=? AND tenant_id=?',
        [nome, tipo||'radio', min_selecoes||0, max_selecoes||1, obrigatorio?1:0, ordem||0, ativo!==false&&ativo!==0?1:0, modo_preco||'adicional', req.params.grupoId, req.tenantId]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/opcoes/grupos/:grupoId', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM produto_opcao_itens WHERE grupo_id=? AND tenant_id=?', [req.params.grupoId, req.tenantId]);
      await qRun('DELETE FROM produto_grupos_opcao WHERE id=? AND tenant_id=?', [req.params.grupoId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/opcoes/grupos/:grupoId/itens', async (req: Request, res) => {
    try {
      const { nome, preco_adicional, ordem } = req.body;
      if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigat\u00F3rio' });
      const maxOrdem = await q1('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM produto_opcao_itens WHERE grupo_id=? AND tenant_id=?', [req.params.grupoId, req.tenantId]);
      const id = await qInsert(
        'INSERT INTO produto_opcao_itens (grupo_id,tenant_id,nome,preco_adicional,ordem) VALUES (?,?,?,?,?)',
        [req.params.grupoId, req.tenantId, nome.trim(), parseFloat(preco_adicional)||0, ordem??maxOrdem?.next??0]
      );
      res.json({ success: true, id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/opcoes/itens/:itemId', async (req: Request, res) => {
    try {
      const { nome, preco_adicional, ordem, ativo } = req.body;
      if (ativo === undefined) {
        await qRun('UPDATE produto_opcao_itens SET nome=?,preco_adicional=?,ordem=? WHERE id=? AND tenant_id=?',
          [nome, parseFloat(preco_adicional)||0, ordem||0, req.params.itemId, req.tenantId]);
      } else {
        await qRun('UPDATE produto_opcao_itens SET nome=?,preco_adicional=?,ordem=?,ativo=? WHERE id=? AND tenant_id=?',
          [nome, parseFloat(preco_adicional)||0, ordem||0, ativo?1:0, req.params.itemId, req.tenantId]);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/opcoes/itens/:itemId', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM produto_opcao_itens WHERE id=? AND tenant_id=?', [req.params.itemId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
