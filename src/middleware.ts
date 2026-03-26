// src/middleware.ts — middlewares, multer, rate limiters
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { isDatabaseConnectivityError, pool, q1 } from './db';
import { type PlanFeature } from './config/planFeatures';
import { getTenantFeatures } from './services/tenantPlan';

type AuthenticatedSession =
  | {
      ok: true;
      user: any;
      tenantId: number;
      userCargo?: string;
      userPermissoes?: string[] | null;
      userName?: string;
    }
  | {
      ok: false;
      status: number;
      body: { error: string };
    };

// ── Segredos ──────────────────────────────────────────────────────────────────
export const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET não definido no .env. Encerrando.');
    process.exit(1);
  }
  console.warn('⚠️  JWT_SECRET não definido — usando valor de desenvolvimento INSEGURO.');
  return 'dev-jwt-secret-MUDE-NO-DOT-ENV';
})();

export const ADMIN_SECRET = process.env.ADMIN_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: ADMIN_SECRET não definido no .env. Encerrando.');
    process.exit(1);
  }
  console.warn('⚠️  ADMIN_SECRET não definido — usando valor de desenvolvimento INSEGURO.');
  return 'dev-admin-secret-MUDE-NO-DOT-ENV';
})();

// ── Rate limiters ─────────────────────────────────────────────────────────────
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas tentativas de login. Aguarde 1 minuto e tente novamente.' },
  skipSuccessfulRequests: true,
});

export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
});

// ── Validação de magic bytes de imagem ────────────────────────────────────────
const IMAGE_SIGNATURES = [
  { sig: [0xFF, 0xD8, 0xFF],                                                         label: 'JPEG' },
  { sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],                          label: 'PNG'  },
  { sig: [0x47, 0x49, 0x46, 0x38],                                                    label: 'GIF'  },
  { sig: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    mask: [1,    1,    1,    1,    0, 0, 0, 0, 1,    1,    1,    1   ],              label: 'WEBP' },
];

function isValidImageBytes(filePath: string): boolean {
  try {
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return IMAGE_SIGNATURES.some(({ sig, mask }) =>
      sig.every((byte, i) => (mask && !mask[i]) || buf[i] === byte)
    );
  } catch { return false; }
}

export function checkMagicBytes(req: any, res: any, next: any) {
  const file = req.file;
  if (!file) return next();
  if (!isValidImageBytes(file.path)) {
    fs.unlink(file.path, () => {});
    return res.status(400).json({ success: false, message: 'Arquivo rejeitado: conteúdo não é uma imagem válida.' });
  }
  next();
}

// ── Multer — fotos de produto ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => cb(null, `produto-${Date.now()}${path.extname(file.originalname)}`),
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Apenas imagens são permitidas'));
  },
});

// ── Multer — logo do tenant ───────────────────────────────────────────────────
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(process.cwd(), 'uploads', 'logo')),
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo_${req.tenantId || 'admin'}${ext}`);
  },
});

export const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Apenas JPEG, PNG ou WEBP'));
  },
});

// ── Multer — foto de funcionário ──────────────────────────────────────────────
const fotoFuncStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = 'uploads/funcionarios';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `func-${Date.now()}${path.extname(file.originalname)}`),
});

export const uploadFotoFunc = multer({
  storage: fotoFuncStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Apenas imagens'));
  },
});

// ── authenticateToken (async — usa PostgreSQL) ────────────────────────────────
const legacyAuthenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  if (req.path.startsWith('/admin')) return next();

  let user: any;
  try {
    user = jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }

  try {
    req.user = user;

    const userRecord = await q1('SELECT id, status, vencimento FROM clientes WHERE usuario=?', [user.username]);
    const usuarioRecord = await q1('SELECT token_version FROM usuarios WHERE username=?', [user.username]);

    if (usuarioRecord && user.token_version !== usuarioRecord.token_version)
      return res.status(401).json({ error: 'Sessão expirada. Por favor, faça login novamente.' });

    if (userRecord) {
      req.tenantId = userRecord.id;
      if (userRecord.status === 'bloqueado') return res.status(403).json({ error: 'bloqueado' });
      if (userRecord.vencimento && new Date() > new Date(userRecord.vencimento))
        return res.status(403).json({ error: 'trial_expirado' });
      await pool.query('UPDATE clientes SET ultimo_acesso=NOW() WHERE id=$1', [userRecord.id]);
    } else {
      const subUser = await q1(
        'SELECT cliente_id, cargo, permissoes, nome FROM usuarios WHERE username=? AND cliente_id IS NOT NULL',
        [user.username]
      );

      if (subUser) {
        req.tenantId = subUser.cliente_id;
        (req as any).userCargo      = subUser.cargo || 'atendente';
        (req as any).userPermissoes = subUser.permissoes ? JSON.parse(subUser.permissoes) : null;
        (req as any).userName       = subUser.nome || user.username;
        const tc = await q1('SELECT status, vencimento FROM clientes WHERE id=?', [subUser.cliente_id]);
        if (tc?.status === 'bloqueado') return res.status(403).json({ error: 'bloqueado' });
        if (tc?.vencimento && new Date() > new Date(tc.vencimento))
          return res.status(403).json({ error: 'trial_expirado' });
      } else {
        return res.status(401).json({ error: 'Sessão inválida. Por favor, faça login novamente.' });
      }
    }
    next();
  } catch (err: any) {
    console.error('[authenticateToken] erro:', err.message);
    res.status(500).json({ error: 'Erro de autenticação' });
  }
};

// ── authenticateAdmin ─────────────────────────────────────────────────────────
function applyAuthenticatedSession(req: Request, session: Extract<AuthenticatedSession, { ok: true }>) {
  req.user = session.user;
  req.tenantId = session.tenantId;
  req.userCargo = session.userCargo;
  req.userPermissoes = session.userPermissoes;
  req.userName = session.userName;
}

function normalizeCargo(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function isFullAccessSession(req: Request) {
  const cargo = normalizeCargo(req.userCargo);
  if (!cargo && (req.userPermissoes === undefined || req.userPermissoes === null)) return true;
  if (cargo === 'dono') return true;
  return req.userPermissoes === null;
}

export function hasModulePermission(req: Request, permission: string) {
  if (!permission) return true;
  if (isFullAccessSession(req)) return true;
  if (!Array.isArray(req.userPermissoes)) return false;
  return req.userPermissoes.includes(permission);
}

export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (permissions.length === 0 || permissions.some((permission) => hasModulePermission(req, permission))) {
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado',
      required_permissions: permissions,
    });
  };
}

export function requirePlanFeature(feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant não identificado' });
      }

      const features = await getTenantFeatures(req.tenantId);
      if (features.includes(feature)) {
        return next();
      }

      return res.status(403).json({
        error: 'Plano não inclui este recurso',
        feature,
      });
    } catch (err: any) {
      console.error('[requirePlanFeature] erro:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao validar plano do tenant' });
    }
  };
}

function buildAuthenticationErrorResponse(err: unknown): Extract<AuthenticatedSession, { ok: false }> {
  const message = err instanceof Error ? err.message : String(err ?? 'Erro desconhecido');
  const isDbUnavailable = isDatabaseConnectivityError(err);

  console.error('[resolveAuthenticatedSession] erro:', {
    message,
    code:
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : undefined,
  });

  return {
    ok: false,
    status: isDbUnavailable ? 503 : 500,
    body: {
      error: isDbUnavailable ? 'Serviço de autenticação temporariamente indisponível' : 'Erro de autenticação',
    },
  };
}

async function touchTenantLastAccess(tenantId: number) {
  try {
    await pool.query('UPDATE clientes SET ultimo_acesso=NOW() WHERE id=$1', [tenantId]);
  } catch (err) {
    console.warn('[resolveAuthenticatedSession] falha ao atualizar ultimo_acesso:', {
      tenantId,
      message: err instanceof Error ? err.message : String(err ?? 'Erro desconhecido'),
    });
  }
}

export async function resolveAuthenticatedSession(req: Request, tokenOverride?: string): Promise<AuthenticatedSession> {
  const authHeader = req.headers['authorization'];
  const token = tokenOverride || (authHeader && authHeader.split(' ')[1]);

  if (!token) {
    return { ok: false, status: 401, body: { error: 'Token não fornecido' } };
  }

  let user: any;
  try {
    user = jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return { ok: false, status: 403, body: { error: 'Token inválido ou expirado' } };
  }

  try {
    const [userRecord, usuarioRecord] = await Promise.all([
      q1('SELECT id, status, vencimento FROM clientes WHERE usuario=?', [user.username]),
      q1(
        'SELECT token_version, ativo, cliente_id, cargo, permissoes, nome FROM usuarios WHERE username=?',
        [user.username]
      ),
    ]);

    if (!usuarioRecord) {
      return { ok: false, status: 401, body: { error: 'Sessão inválida. Por favor, faça login novamente.' } };
    }

    if (user.token_version !== usuarioRecord.token_version) {
      return { ok: false, status: 401, body: { error: 'Sessão expirada. Por favor, faça login novamente.' } };
    }

    if (Number(usuarioRecord.ativo) === 0) {
      return { ok: false, status: 403, body: { error: 'bloqueado' } };
    }

    if (userRecord) {
      if (userRecord.status === 'bloqueado') return { ok: false, status: 403, body: { error: 'bloqueado' } };
      if (userRecord.vencimento && new Date() > new Date(userRecord.vencimento)) {
        return { ok: false, status: 403, body: { error: 'trial_expirado' } };
      }

      void touchTenantLastAccess(Number(userRecord.id));

      return {
        ok: true,
        user,
        tenantId: userRecord.id,
      };
    }

    if (usuarioRecord.cliente_id) {
      const tenantClient = await q1('SELECT status, vencimento FROM clientes WHERE id=?', [usuarioRecord.cliente_id]);

      if (tenantClient?.status === 'bloqueado') return { ok: false, status: 403, body: { error: 'bloqueado' } };
      if (tenantClient?.vencimento && new Date() > new Date(tenantClient.vencimento)) {
        return { ok: false, status: 403, body: { error: 'trial_expirado' } };
      }

      return {
        ok: true,
        user,
        tenantId: usuarioRecord.cliente_id,
        userCargo: usuarioRecord.cargo || 'atendente',
        userPermissoes: usuarioRecord.permissoes ? JSON.parse(usuarioRecord.permissoes) : null,
        userName: usuarioRecord.nome || user.username,
      };
    }

    return { ok: false, status: 401, body: { error: 'Sessão inválida. Por favor, faça login novamente.' } };
  } catch (err) {
    return buildAuthenticationErrorResponse(err);
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/admin')) return next();

  const session = await resolveAuthenticatedSession(req);
  if (session.ok === false) {
    return res.status(session.status).json(session.body);
  }

  applyAuthenticatedSession(req, session);
  next();
};

export const authenticateAdmin = (req: any, res: any, next: any) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const decoded: any = jwt.verify(token, ADMIN_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    next();
  } catch {
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// ── authDeliveryCliente ───────────────────────────────────────────────────────
export const authDeliveryCliente = (req: any, res: any, next: any) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token de cliente necessário' });
  try {
    const dec: any = jwt.verify(token, JWT_SECRET);
    if (dec.tipo !== 'delivery_cliente') return res.status(403).json({ error: 'Token inválido' });
    req.clienteId = dec.clienteId;
    req.tenantId  = dec.tenantId;
    next();
  } catch { return res.status(403).json({ error: 'Token de cliente inválido' }); }
};

// ── Logging middleware ────────────────────────────────────────────────────────
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && req.method === 'GET') return next();
  const agente = req.headers['user-agent']?.substring(0, 35) || 'Desconhecido';
  console.log(`[${new Date().toISOString()}] IP: ${req.ip} | Agente: ${agente}... | ${req.method} ${req.url}`);
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) console.log('Body:', JSON.stringify(req.body));
  next();
}
