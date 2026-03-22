// src/routes/auth.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ACTIVE_SEGMENT_OPTIONS } from '../config/segmentos';
import { q1, qInsert } from '../db';
import { JWT_SECRET, loginRateLimiter, authenticateToken } from '../middleware';
import { isAppError } from '../utils/errors';
import { validateSecurityPassword } from '../utils/securityPassword';

const PUBLIC_SEGMENTS = new Set(ACTIVE_SEGMENT_OPTIONS.map((segment) => segment.value));

export function createAuthRouter() {
  const router = Router();

  // POST /api/login
  router.post('/login', loginRateLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });

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
    } catch (err: any) {
      console.error('[/api/login] erro:', err.message);
      res.status(500).json({ success: false, message: 'Erro interno no servidor' });
    }
  });

  // POST /api/auth/verify-admin
  router.post('/auth/verify-admin', loginRateLimiter, authenticateToken, async (req: any, res) => {
    try {
      await validateSecurityPassword({
        tenantId: req.tenantId,
        userId: req.user?.id,
        password: req.body?.senha,
        type: 'admin',
        invalidMessage: 'Senha incorreta',
        userNotFoundMessage: 'Sessão inválida',
      });
      return res.json({ success: true });
    } catch (e: any) {
      if (isAppError(e)) {
        if (e.statusCode === 400) return res.status(400).json({ success: false });
        if (e.code === 'AUTH_USER_NOT_FOUND') return res.status(401).json({ success: false, message: e.message });
        if (e.code === 'SECURITY_PASSWORD_INVALID') return res.status(403).json({ success: false, message: e.message });
      }
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/auth/verify-caixa
  router.post('/auth/verify-caixa', loginRateLimiter, authenticateToken, async (req: any, res) => {
    try {
      await validateSecurityPassword({
        tenantId: req.tenantId,
        userId: req.user?.id,
        password: req.body?.senha,
        type: 'caixa',
        invalidMessage: 'Senha incorreta',
        userNotFoundMessage: 'Sessão inválida',
      });
      return res.json({ success: true });
    } catch (e: any) {
      if (isAppError(e)) {
        if (e.statusCode === 400) return res.status(400).json({ success: false });
        if (e.code === 'AUTH_USER_NOT_FOUND') return res.status(401).json({ success: false, message: e.message });
        if (e.code === 'SECURITY_PASSWORD_INVALID') return res.status(403).json({ success: false, message: e.message });
      }
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/public/solicitar-acesso
  router.post('/public/solicitar-acesso', async (req, res) => {
    try {
      const { nome_estabelecimento, razao_social, documento_tipo, documento_numero,
              nome_responsavel, email, whatsapp, cidade, segmento } = req.body;
      if (!nome_estabelecimento || !documento_tipo || !documento_numero || !nome_responsavel || !email || !whatsapp || !cidade)
        return res.status(400).json({ success: false, message: 'Todos os campos obrigatórios devem ser preenchidos.' });

      if (segmento && !PUBLIC_SEGMENTS.has(segmento))
        return res.status(400).json({ success: false, message: 'Segmento indisponÃ­vel no momento.' });

      const id = await qInsert(
        'INSERT INTO solicitacoes (nome_estabelecimento,razao_social,documento_tipo,documento_numero,nome_responsavel,email,whatsapp,cidade,segmento) VALUES (?,?,?,?,?,?,?,?,?)',
        [nome_estabelecimento, razao_social||null, documento_tipo, documento_numero, nome_responsavel, email, whatsapp, cidade, segmento||'Restaurante/Food']
      );
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
  });

  return router;
}
