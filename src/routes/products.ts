// src/routes/products.ts
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { q1, qAll, qRun, qInsert } from '../db';
import { upload, uploadFotoFunc, checkMagicBytes } from '../middleware';
import { validateSecurityPassword } from '../utils/securityPassword';
import { normalizeBarcode } from '../utils/barcode';
import { generatePublicId } from '../utils/publicIds';
import { normalizeRequiresPreparationInput } from '../utils/preparation';

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
      throw new Error('Já existe um produto com este código de barras.');
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
    } catch (e: any) { res.status(e.message?.includes('código de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.get('/barcode/:code', async (req: Request, res) => {
    const barcode = normalizeBarcode(req.params.code);
    if (!barcode) return res.status(400).json({ found: false, message: 'Código de barras inválido' });
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

  router.post('/', async (req: Request, res) => {
    try {
      const { name, price, category, active, color, codigo_barras, marca, descricao, custo, destaque, disponivel_de, disponivel_ate, requires_preparation } = req.body;
      const normalizedBarcode = normalizeBarcode(codigo_barras);
      const normalizedRequiresPreparation = normalizeRequiresPreparationInput(requires_preparation, { name, category });
      await ensureBarcodeAvailable(req.tenantId, normalizedBarcode);
      const maxOrdem = await q1('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM produtos WHERE tenant_id=?', [req.tenantId]);
      const id = await qInsert(
        'INSERT INTO produtos (public_id,name,price,category,active,color,codigo_barras,marca,descricao,custo,destaque,ordem,disponivel_de,disponivel_ate,requires_preparation,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [generatePublicId('prd'), name, price, category, active?1:0, color||'zinc', normalizedBarcode, marca||null, descricao||null, custo||0, destaque?1:0, maxOrdem?.next||0, disponivel_de||null, disponivel_ate||null, normalizedRequiresPreparation, req.tenantId]
      );
      res.json({ id });
    } catch (e: any) { res.status(e.message?.includes('código de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.put('/reorder', async (req: Request, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items deve ser array' });
      for (const item of items) await qRun('UPDATE produtos SET ordem=? WHERE id=? AND tenant_id=?', [item.ordem, item.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(e.message?.includes('código de barras') ? 400 : 500).json({ error: e.message }); }
  });

  router.put('/:id', async (req: Request, res) => {
    try {
      const { name, price, category, active, color, codigo_barras, marca, descricao, custo, destaque, disponivel_de, disponivel_ate, requires_preparation } = req.body;
      const current = await q1<{ codigo_barras?: string | null; requires_preparation?: number | null; name?: string | null; category?: string | null }>(
        'SELECT codigo_barras, requires_preparation, name, category FROM produtos WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      const normalizedBarcode = normalizeBarcode(codigo_barras);
      const normalizedRequiresPreparation = normalizeRequiresPreparationInput(
        requires_preparation ?? current?.requires_preparation,
        { name: name ?? current?.name ?? null, category: category ?? current?.category ?? null }
      );
      if (normalizedBarcode !== normalizeBarcode(current?.codigo_barras)) {
        await ensureBarcodeAvailable(req.tenantId, normalizedBarcode, Number(req.params.id));
      }
      await qRun(
        'UPDATE produtos SET name=?,price=?,category=?,active=?,color=?,codigo_barras=?,marca=?,descricao=?,custo=?,destaque=?,disponivel_de=?,disponivel_ate=?,requires_preparation=? WHERE id=? AND tenant_id=?',
        [name, price, category, active?1:0, color||'zinc', normalizedBarcode, marca||null, descricao||null, custo||0, destaque?1:0, disponivel_de||null, disponivel_ate||null, normalizedRequiresPreparation, req.params.id, req.tenantId]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/duplicar', async (req: Request, res) => {
    try {
      const p = await q1('SELECT * FROM produtos WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
      const maxOrdem = await q1('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM produtos WHERE tenant_id=?', [req.tenantId]);
      const id = await qInsert(
        'INSERT INTO produtos (name,price,category,active,color,codigo_barras,marca,descricao,custo,destaque,ordem,disponivel_de,disponivel_ate,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?)',
        [`${p.name} (cópia)`, p.price, p.category, 0, p.color, null, p.marca, p.descricao, p.custo, maxOrdem?.next||0, p.disponivel_de, p.disponivel_ate, req.tenantId]
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
      if (e.code === '23503') // PostgreSQL foreign key violation
        return res.status(400).json({ success: false, message: 'Produto com vendas registradas. Desative-o ao invés de excluir.' });
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

  // ── Opções de produto ──────────────────────────────────────────────────────
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
      if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
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
      if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
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
