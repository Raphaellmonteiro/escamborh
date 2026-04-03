// src/routes/logs.ts
import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import { q1, qAll, qRun, qInsert } from '../db';
import { sendInternalError } from '../utils/internalServerError';

export function createLogsRouter() {
  const router = Router();

  router.post('/', async (req: Request, res) => {
    try {
      const tenantId = req.tenantId;
      if (tenantId == null || !Number.isFinite(Number(tenantId))) {
        return res.status(403).json({ error: 'Tenant não identificado' });
      }

      const acaoRaw = req.body?.acao;
      const acao = typeof acaoRaw === 'string' ? acaoRaw.trim() : '';
      if (!acao) {
        return res.status(400).json({ error: 'Ação (acao) é obrigatória' });
      }

      let detalhes: string | null = null;
      if (req.body?.detalhes != null && req.body.detalhes !== '') {
        detalhes = String(req.body.detalhes);
      }

      const usuarioNome =
        (req.userName && String(req.userName).trim()) ||
        (req.user?.username && String(req.user.username).trim()) ||
        'Usuário';
      const cargo =
        (req.userCargo && String(req.userCargo).trim()) ||
        (req.user?.role && String(req.user.role).trim()) ||
        'dono';

      await qRun(
        'INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
        [tenantId, usuarioNome, cargo, acao, detalhes]
      );
      res.json({ ok: true });
    } catch (e: any) { sendInternalError(res, 'routes/logs', e); }
  });

  router.get('/', async (req: Request, res) => {
    try {
      const limite = Math.min(Number(req.query.limite)||300, 1000);
      res.json(await qAll('SELECT * FROM system_logs WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?', [req.tenantId, limite]));
    } catch (e: any) { sendInternalError(res, 'routes/logs', e); }
  });

  return router;
}

export function createUsuariosRouter() {
  const router = Router();

  router.get('/funcionarios', async (req: Request, res) => {
    try {
      const lista = await qAll('SELECT id,username,nome,cargo,permissoes,ativo FROM usuarios WHERE cliente_id=? ORDER BY nome', [req.tenantId]);
      res.json(lista.map((u: any) => ({ ...u, permissoes: u.permissoes ? JSON.parse(u.permissoes) : null })));
    } catch (e: any) { sendInternalError(res, 'routes/logs', e); }
  });

  return router;
}

export function createAcessoFuncRouter() {
  const router = Router();

  router.post('/:id/criar-acesso', async (req: any, res) => {
    try {
      const { login, senha, cargo, permissoes } = req.body;
      if (!login) return res.status(400).json({ error: 'Login obrigatório' });
      const func = await q1('SELECT * FROM funcionarios WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
      const permsJson = Array.isArray(permissoes) ? JSON.stringify(permissoes) : null;
      const existente = await q1('SELECT id FROM usuarios WHERE username=?', [login]);
      if (existente) {
        if (senha) {
          const hash = await bcrypt.hash(senha, 10);
          await qRun('UPDATE usuarios SET password=?,cargo=?,permissoes=?,nome=?,cliente_id=?,ativo=1 WHERE username=?',
            [hash, cargo||'atendente', permsJson, func.nome, req.tenantId, login]);
        } else {
          await qRun('UPDATE usuarios SET cargo=?,permissoes=?,nome=?,cliente_id=?,ativo=1 WHERE username=?',
            [cargo||'atendente', permsJson, func.nome, req.tenantId, login]);
        }
      } else {
        if (!senha) return res.status(400).json({ error: 'Senha obrigatória para novo acesso' });
        const hash = await bcrypt.hash(senha, 10);
        await qRun('INSERT INTO usuarios (username,password,cargo,permissoes,nome,cliente_id,ativo,token_version) VALUES (?,?,?,?,?,?,1,1)',
          [login, hash, cargo||'atendente', permsJson, func.nome, req.tenantId]);
      }
      await qRun('INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
        [req.tenantId, func.nome, cargo||'atendente', 'ACESSO_CRIADO', `Login "${login}" criado/atualizado para ${func.nome}`]);
      res.json({ success: true });
    } catch (e: any) { sendInternalError(res, 'routes/logs', e); }
  });

  router.delete('/:id/remover-acesso', async (req: any, res) => {
    try {
      const func = await q1('SELECT * FROM funcionarios WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
      await qRun('UPDATE usuarios SET ativo=0 WHERE cliente_id=? AND nome=?', [req.tenantId, func.nome]);
      res.json({ success: true });
    } catch (e: any) { sendInternalError(res, 'routes/logs', e); }
  });

  return router;
}
