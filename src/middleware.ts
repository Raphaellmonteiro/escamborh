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
const loginWindowMs = 15 * 60 * 1000;
const loginMaxAttempts = process.env.NODE_ENV === 'production' ? 5 : 15;

export const loginRateLimiter = rateLimit({
  windowMs: loginWindowMs,
  max: loginMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Muitas tentativas de login falhas. Aguarde 15 minutos e tente novamente.',
  },
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

const deliveryCardapioDir = path.join(process.cwd(), 'uploads', 'delivery');

const deliveryCardapioLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(deliveryCardapioDir)) fs.mkdirSync(deliveryCardapioDir, { recursive: true });
    cb(null, deliveryCardapioDir);
  },
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `delivery_${req.tenantId}_cardapio_logo${ext}`);
  },
});

/** Logo exclusiva do cardápio online (delivery); arquivos em uploads/delivery/ */
export const uploadDeliveryCardapioLogo = multer({
  storage: deliveryCardapioLogoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Apenas JPEG, PNG ou WEBP'));
  },
});

const deliveryCardapioBannerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(deliveryCardapioDir)) fs.mkdirSync(deliveryCardapioDir, { recursive: true });
    cb(null, deliveryCardapioDir);
  },
  filename: (req: any, file, cb) => {
    const raw = parseInt(String(req.params?.index ?? ''), 10);
    const idx = Number.isFinite(raw) ? Math.min(3, Math.max(0, raw)) : 0;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `delivery_${req.tenantId}_banner_${idx}${ext}`);
  },
});

/** Banner do topo do cardápio; campo `banner`; rota deve incluir `:index` (0–3). */
export const uploadDeliveryCardapioBanner = multer({
  storage: deliveryCardapioBannerStorage,
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

// ── authenticateAdmin ─────────────────────────────────────────────────────────
function applyAuthenticatedSession(req: Request, session: Extract<AuthenticatedSession, { ok: true }>) {
  req.user = session.user;
  req.tenantId = session.tenantId;
  req.userCargo = session.userCargo;
  req.userPermissoes = session.userPermissoes;
  req.userName = session.userName;
}

/** Rotas /api/admin/* (exceto login): JWT de admin não passa em resolveAuthenticatedSession; este fallback mantém o painel com um único Bearer. */
function isProtectedPlatformAdminApiPath(reqPath: string): boolean {
  if (reqPath !== '/api/admin' && !reqPath.startsWith('/api/admin/')) return false;
  return reqPath !== '/api/admin/login';
}

function tryApplyPlatformAdminBearer(req: Request): boolean {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return false;
  try {
    const decoded: any = jwt.verify(token, ADMIN_SECRET);
    if (decoded.role !== 'admin') return false;
    req.user = { id: 0, username: 'platform_admin', role: 'platform_admin' };
    req.userCargo = 'dono';
    req.userPermissoes = null;
    req.userName = 'platform_admin';
    delete (req as any).tenantId;
    return true;
  } catch {
    return false;
  }
}

function normalizeCargo(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function isFullAccessSession(req: Request) {
  const cargo = normalizeCargo(req.userCargo);
  if (!cargo && (req.userPermissoes === undefined || req.userPermissoes === null)) return true;
  if (cargo === 'dono') return true;
  return false;
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
    const row = await q1<{
      token_version: number;
      ativo: number | null;
      cliente_id: number | null;
      cargo: string | null;
      permissoes: string | null;
      nome: string | null;
      owner_id: number | null;
      owner_status: string | null;
      owner_vencimento: string | Date | null;
      sub_status: string | null;
      sub_vencimento: string | Date | null;
    }>(
      `SELECT
         u.token_version,
         u.ativo,
         u.cliente_id,
         u.cargo,
         u.permissoes,
         u.nome,
         c_owner.id AS owner_id,
         c_owner.status AS owner_status,
         c_owner.vencimento AS owner_vencimento,
         c_sub.status AS sub_status,
         c_sub.vencimento AS sub_vencimento
       FROM usuarios u
       LEFT JOIN clientes c_owner ON c_owner.usuario = u.username
       LEFT JOIN clientes c_sub ON c_sub.id = u.cliente_id
       WHERE u.username = ?
       LIMIT 1`,
      [user.username]
    );

    if (!row) {
      return { ok: false, status: 401, body: { error: 'Sessão inválida. Por favor, faça login novamente.' } };
    }

    if (user.token_version !== row.token_version) {
      return { ok: false, status: 401, body: { error: 'Sessão expirada. Por favor, faça login novamente.' } };
    }

    if (Number(row.ativo) === 0) {
      return { ok: false, status: 403, body: { error: 'bloqueado' } };
    }

    if (row.owner_id != null) {
      if (row.owner_status === 'bloqueado') return { ok: false, status: 403, body: { error: 'bloqueado' } };
      if (row.owner_vencimento && new Date() > new Date(row.owner_vencimento)) {
        return { ok: false, status: 403, body: { error: 'trial_expirado' } };
      }

      void touchTenantLastAccess(Number(row.owner_id));

      return {
        ok: true,
        user,
        tenantId: row.owner_id,
      };
    }

    if (row.cliente_id) {
      if (row.sub_status === 'bloqueado') return { ok: false, status: 403, body: { error: 'bloqueado' } };
      if (row.sub_vencimento && new Date() > new Date(row.sub_vencimento)) {
        return { ok: false, status: 403, body: { error: 'trial_expirado' } };
      }

      return {
        ok: true,
        user,
        tenantId: row.cliente_id,
        userCargo: row.cargo || 'atendente',
        userPermissoes: row.permissoes ? JSON.parse(row.permissoes) : null,
        userName: row.nome || user.username,
      };
    }

    return { ok: false, status: 401, body: { error: 'Sessão inválida. Por favor, faça login novamente.' } };
  } catch (err) {
    return buildAuthenticationErrorResponse(err);
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const session = await resolveAuthenticatedSession(req);
  if (session.ok === true) {
    applyAuthenticatedSession(req, session);
    return next();
  }

  if (isProtectedPlatformAdminApiPath(req.path) && tryApplyPlatformAdminBearer(req)) {
    return next();
  }

  return res.status(session.status).json(session.body);
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

// ── Logging: nunca registrar credenciais / segredos em texto puro ─────────────
const FULL_REDACT_BODY_PATHS = new Set([
  '/api/login',
  '/api/auth/verify-admin',
  '/api/auth/verify-caixa',
  '/api/admin/login',
]);

const SENSITIVE_KEY_EXACT = new Set([
  'password',
  'pass',
  'pwd',
  'senha',
  'nova_senha',
  'senha_admin',
  'senha_caixa',
  'subsenha',
  'pin',
  'token',
  'authorization',
  'secret',
  'api_key',
  'apikey',
  'cvv',
  'cvc',
  'clientetoken',
]);

function isSensitiveLogKey(key: string): boolean {
  const k = key.toLowerCase().replace(/-/g, '_');
  if (SENSITIVE_KEY_EXACT.has(k)) return true;
  if (k.includes('password') || k.includes('senha')) return true;
  if (k.endsWith('_token')) return true;
  return false;
}

function redactBodyForLogs(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[Profundidade máxima]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactBodyForLogs(item, depth + 1));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return '[Objeto]';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveLogKey(k) ? '[REDACTED]' : redactBodyForLogs(v, depth + 1);
    }
    return out;
  }
  return value;
}

function shouldRedactEntireRequestBody(path: string): boolean {
  if (FULL_REDACT_BODY_PATHS.has(path)) return true;
  if (path.endsWith('/login-func')) return true;
  return false;
}

// ── Logging middleware ────────────────────────────────────────────────────────
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && req.method === 'GET') return next();
  const agente = req.headers['user-agent']?.substring(0, 35) || 'Desconhecido';
  console.log(`[${new Date().toISOString()}] IP: ${req.ip} | Agente: ${agente}... | ${req.method} ${req.url}`);
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const safe =
      shouldRedactEntireRequestBody(req.path) ? '[REDACTED]' : redactBodyForLogs(req.body);
    console.log('Body:', typeof safe === 'string' ? safe : JSON.stringify(safe));
  }
  next();
}
