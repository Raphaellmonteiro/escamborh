// src/routes/settings.ts
import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { pool, q1, qAll, qRun } from '../db';
import { uploadLogo, checkMagicBytes } from '../middleware';
import { getTenantPlanContext } from '../services/tenantPlan';

function resolveTenantLogoUrl(tenantId: number | string | undefined): string | null {
  try {
    const logoDir = path.join(process.cwd(), 'uploads', 'logo');
    const files = fs.existsSync(logoDir) ? fs.readdirSync(logoDir) : [];
    const file = files.find((f) => f.startsWith(`logo_${tenantId}.`));
    return file ? `/uploads/logo/${file}` : null;
  } catch {
    return null;
  }
}

export function createSettingsRouter() {
  const router = Router();

  const profileHandler = async (req: Request, res: any) => {
    try {
      const cliente = await q1('SELECT nome_estabelecimento, senha_admin, senha_caixa, segmento, taxa_debito, taxa_credito, taxa_pix, vencimento FROM clientes WHERE id=?', [req.tenantId]);
      const usuario = await q1('SELECT cargo, permissoes, nome FROM usuarios WHERE username=?', [(req as any).user?.username || '']);
      const planContext = await getTenantPlanContext(req.tenantId || 0);
      const cargo      = (req as any).userCargo      || usuario?.cargo      || 'dono';
      const permissoes = (req as any).userPermissoes || (usuario?.permissoes ? JSON.parse(usuario.permissoes) : null);
      const nomeUsuario= (req as any).userName       || usuario?.nome       || '';
      const senhaPadrao = (cliente?.senha_admin === '123321') || (cliente?.senha_caixa === '123321');
      const logo_url = resolveTenantLogoUrl(req.tenantId);
      res.json({
        nome_estabelecimento: cliente?.nome_estabelecimento || 'FlowPDV',
        logo_url,
        senha_padrao: senhaPadrao,
        segmento:     cliente?.segmento    || 'Restaurante/Food',
        taxa_debito:  cliente?.taxa_debito  || 0,
        taxa_credito: cliente?.taxa_credito || 0,
        taxa_pix:     cliente?.taxa_pix     || 0,
        plano: planContext.plan,
        plan_features: planContext.features,
        trial_ativo: planContext.isTrialActive,
        trial_fim: planContext.trialFim,
        vencimento: cliente?.vencimento || null,
        cargo, permissoes, nome_usuario: nomeUsuario,
      });
    } catch (err: any) {
      console.error('[settings.profile] erro ao carregar perfil:', err?.message || err);
      res.status(500).json({ error: 'Erro ao carregar perfil do tenant' });
    }
  };

  router.get('/profile', profileHandler);
  router.get('/perfil',  profileHandler);

  router.put('/perfil', async (req: any, res) => {
    try {
      const { nome_estabelecimento, senha_admin, senha_caixa } = req.body;
      const updates: string[] = [];
      const params: any[] = [];

      if (nome_estabelecimento?.trim()) { updates.push('nome_estabelecimento=?'); params.push(nome_estabelecimento.trim()); }
      if (senha_admin?.trim()) {
        updates.push('senha_admin=?'); params.push(senha_admin.trim());
        await qRun('UPDATE usuarios SET token_version=token_version+1 WHERE username=?', [req.user?.username || '']);
      }
      if (senha_caixa?.trim()) { updates.push('senha_caixa=?'); params.push(senha_caixa.trim()); }
      if (updates.length === 0) return res.json({ success: true });
      params.push(req.tenantId);
      await qRun(`UPDATE clientes SET ${updates.join(',')} WHERE id=?`, params);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/taxas', async (req: Request, res) => {
    try {
      const { taxa_debito, taxa_credito, taxa_pix } = req.body;
      await qRun('UPDATE clientes SET taxa_debito=?,taxa_credito=?,taxa_pix=? WHERE id=?',
        [taxa_debito||0, taxa_credito||0, taxa_pix||0, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/printer', async (req: Request, res) => {
    try {
      const row = await q1('SELECT printer_config FROM clientes WHERE id=?', [req.tenantId]);
      res.json({ success: true, config: row?.printer_config ? JSON.parse(row.printer_config) : null });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.put('/printer', async (req: Request, res) => {
    try {
      const { tipo, ip, porta, largura_papel } = req.body;
      if (!tipo) return res.status(400).json({ success: false, message: 'tipo obrigatório' });
      await qRun('UPDATE clientes SET printer_config=? WHERE id=?',
        [JSON.stringify({ tipo, ip: ip||'', porta: porta||9100, largura_papel: largura_papel||48 }), req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/logo', (req: Request, res) => {
    res.json({ logo_url: resolveTenantLogoUrl(req.tenantId) });
  });

  router.post('/logo', uploadLogo.single('logo'), checkMagicBytes, (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
      res.json({ success: true, logo_url: `/uploads/logo/${req.file.filename}` });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.delete('/logo', (req: Request, res) => {
    try {
      const logoDir = path.join(process.cwd(), 'uploads', 'logo');
      if (fs.existsSync(logoDir)) {
        fs.readdirSync(logoDir).filter(f => f.startsWith(`logo_${req.tenantId}.`))
          .forEach(f => { try { fs.unlinkSync(path.join(logoDir, f)); } catch {} });
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/watermark', async (req: Request, res) => {
    try {
      const row = await q1('SELECT nome_estabelecimento FROM clientes WHERE id=?', [req.tenantId]);
      res.json({ watermark: row?.nome_estabelecimento || 'FlowPDV' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/watermark', async (req: Request, res) => {
    try {
      await qRun('UPDATE clientes SET nome_estabelecimento=? WHERE id=?', [req.body.watermark, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

export function createCategoriesRouter() {
  const router = Router();

  router.get('/', async (req: Request, res) => {
    try {
      const cats = await qAll('SELECT * FROM categorias WHERE tenant_id=? ORDER BY nome ASC', [req.tenantId]);
      if (cats.length === 0) {
        const defaultCats = ['Lanche','Bebida','Sobremesa','Prato','Entrada','Porção','Outro'];
        for (const cat of defaultCats) await qRun('INSERT INTO categorias (nome, tenant_id) VALUES (?,?)', [cat, req.tenantId]);
        return res.json(await qAll('SELECT * FROM categorias WHERE tenant_id=? ORDER BY nome', [req.tenantId]));
      }
      res.json(cats);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req: Request, res) => {
    try {
      const { nome } = req.body;
      if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
      const { rows } = await pool.query('INSERT INTO categorias (nome, tenant_id) VALUES ($1,$2) RETURNING id', [nome.trim(), req.tenantId]);
      res.json({ id: rows[0].id, nome: nome.trim() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req: Request, res) => {
    try {
      await qRun('DELETE FROM categorias WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
