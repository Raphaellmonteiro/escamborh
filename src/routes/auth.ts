// src/routes/auth.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q1, qInsert } from '../db';
import { JWT_SECRET, loginRateLimiter, authenticateToken, publicRateLimit } from '../middleware';
import { isAppError } from '../utils/errors';
import { sendInternalError } from '../utils/internalServerError';
import { validateSecurityPassword } from '../utils/securityPassword';
import { parseBodyOrReply, replyZod400Api } from '../validation/zodHttp';
import {
  loginBodySchema,
  securitySenhaBodySchema,
  solicitarAcessoBodySchema,
} from '../validation/schemas/publicForms';

export function createAuthRouter() {
  const router = Router();

  // POST /api/login
  router.post('/login', loginRateLimiter, async (req, res) => {
    try {
      const body = parseBodyOrReply(res, loginBodySchema, req.body, replyZod400Api);
      if (!body) return;
      const { username, password } = body;

      const user = await q1('SELECT * FROM usuarios WHERE username=?', [username]);
      let senhaOk = false;
      if (user?.password?.startsWith('$2')) {
        try { senhaOk = bcrypt.compareSync(password, user.password); } catch {}
      }
      if (!senhaOk)
        return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos' });
      if (user.ativo === 0)
        return res.status(403).json({ success: false, message: 'Acesso bloqueado', status: 'bloqueado' });

      const clienteRecord = await q1('SELECT status, vencimento FROM clientes WHERE usuario=?', [username]);
      if (clienteRecord) {
        if (clienteRecord.status === 'bloqueado')
          return res.status(403).json({ success: false, message: 'Acesso bloqueado', status: 'bloqueado' });
        if (clienteRecord.vencimento && new Date() > new Date(clienteRecord.vencimento))
          return res.status(403).json({ success: false, message: 'Trial expirado', status: 'trial_expirado' });
      }
      if (!clienteRecord && user.cliente_id) {
        const tc = await q1('SELECT status, vencimento FROM clientes WHERE id=?', [user.cliente_id]);
        if (tc?.status === 'bloqueado')
          return res.status(403).json({ success: false, message: 'Acesso bloqueado', status: 'bloqueado' });
        if (tc?.vencimento && new Date() > new Date(tc.vencimento))
          return res.status(403).json({ success: false, message: 'Trial expirado', status: 'trial_expirado' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, token_version: user.token_version || 1 },
        JWT_SECRET, { expiresIn: '1d' }
      );
      res.json({ success: true, token, user: {
        id: user.id, username: user.username,
        cargo:      user.cargo || 'dono',
        permissoes: user.permissoes ? JSON.parse(user.permissoes) : null,
        nome:       user.nome || user.username,
      }});
    } catch (err: unknown) {
      sendInternalError(res, 'POST /api/login', err);
    }
  });

  // POST /api/auth/verify-admin
  router.post('/auth/verify-admin', loginRateLimiter, authenticateToken, async (req: any, res) => {
    try {
      const body = parseBodyOrReply(res, securitySenhaBodySchema, req.body, replyZod400Api);
      if (!body) return;
      await validateSecurityPassword({
        tenantId: req.tenantId,
        userId: req.user?.id,
        password: body.senha,
        type: 'admin',
        invalidMessage: 'Senha incorreta',
        userNotFoundMessage: 'Sessão inválida',
      });
      return res.json({ success: true });
    } catch (e: any) {
      if (isAppError(e)) {
        if (e.statusCode === 400) {
          if (e.code === 'SECURITY_PASSWORD_REQUIRED' || e.code === 'SECURITY_PASSWORD_NOT_CONFIGURED') {
            return res.status(400).json({ success: false, message: e.message, code: e.code });
          }
          return res.status(400).json({ success: false });
        }
        if (e.code === 'AUTH_USER_NOT_FOUND') return res.status(401).json({ success: false, message: e.message });
        if (e.code === 'SECURITY_PASSWORD_INVALID') return res.status(403).json({ success: false, message: e.message });
      }
      sendInternalError(res, 'POST /api/auth/verify-admin', e);
      return;
    }
  });

  // POST /api/auth/verify-caixa
  router.post('/auth/verify-caixa', loginRateLimiter, authenticateToken, async (req: any, res) => {
    try {
      const body = parseBodyOrReply(res, securitySenhaBodySchema, req.body, replyZod400Api);
      if (!body) return;
      await validateSecurityPassword({
        tenantId: req.tenantId,
        userId: req.user?.id,
        password: body.senha,
        type: 'caixa',
        invalidMessage: 'Senha incorreta',
        userNotFoundMessage: 'Sessão inválida',
      });
      return res.json({ success: true });
    } catch (e: any) {
      if (isAppError(e)) {
        if (e.statusCode === 400) {
          if (e.code === 'SECURITY_PASSWORD_REQUIRED' || e.code === 'SECURITY_PASSWORD_NOT_CONFIGURED') {
            return res.status(400).json({ success: false, message: e.message, code: e.code });
          }
          return res.status(400).json({ success: false });
        }
        if (e.code === 'AUTH_USER_NOT_FOUND') return res.status(401).json({ success: false, message: e.message });
        if (e.code === 'SECURITY_PASSWORD_INVALID') return res.status(403).json({ success: false, message: e.message });
      }
      sendInternalError(res, 'POST /api/auth/verify-caixa', e);
      return;
    }
  });

  // POST /api/public/solicitar-acesso
  router.post('/public/solicitar-acesso', publicRateLimit, async (req, res) => {
    try {
      const body = parseBodyOrReply(res, solicitarAcessoBodySchema, req.body, replyZod400Api);
      if (!body) return;

      const segmento = body.segmento ?? 'Restaurante/Food';

      const razao = body.razao_social?.trim() || null;
      const id = await qInsert(
        'INSERT INTO solicitacoes (nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,segmento) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          body.nome_estabelecimento,
          razao,
          body.documento_tipo,
          body.documento_numero,
          body.nome_responsavel,
          body.email,
          body.whatsapp,
          body.cidade,
          segmento,
        ]
      );
      res.json({ success: true, id });
    } catch (err: unknown) {
      sendInternalError(res, 'POST /api/public/solicitar-acesso', err);
    }
  });

  return router;
}
