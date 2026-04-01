import 'dotenv/config';

// server.ts — orquestrador principal
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

// ── Banco e migrações ─────────────────────────────────────────────────────────
import { runMigrations } from './src/db';
import { UPLOADS_ROOT } from './src/uploadsRoot';
import { isS3ObjectStorageEnabled } from './src/services/uploadPersistence';

// ── Middlewares ───────────────────────────────────────────────────────────────
import { requestLogger } from './src/middleware';
import { errorHandler } from './src/middlewares/errorHandler';

// ── Rotas ─────────────────────────────────────────────────────────────────────
import { createDeliveryPublicRouter } from './src/routes/delivery-public';
import { createKioskRouter } from './src/routes/kiosk';
import { createApiRouter } from './src/routes';

// ─────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Proxy reverso (Railway, etc.): habilita X-Forwarded-For em req.ip e satisfaz express-rate-limit (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// ── Startup ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_ROOT, 'logo'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_ROOT, 'funcionarios'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_ROOT, 'delivery'), { recursive: true });

const uploadsViaVolume = Boolean(process.env.FLOWPDV_UPLOADS_DIR?.trim());
console.log(
  `[uploads] UPLOADS_ROOT=${UPLOADS_ROOT} volume_env=${uploadsViaVolume} s3=${isS3ObjectStorageEnabled()}`
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001'
)
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origem não permitida — ${origin}`));
    },
    credentials: true,
  })
);

app.use(
  compression({
    filter: (req, res) => {
      const contentType = res.getHeader('Content-Type');
      if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_ROOT));
const logMissingUpload =
  process.env.LOG_UPLOADS_MISSING === '1' || process.env.NODE_ENV !== 'production';
app.use('/uploads', (req, res, next) => {
  if (res.headersSent) return next();
  if (logMissingUpload) {
    console.warn('[uploads] arquivo não encontrado no disco:', req.method, req.originalUrl);
  }
  res.status(404).end();
});
app.use(requestLogger);

// ── Rotas públicas ────────────────────────────────────────────────────────────
app.use('/api', createApiRouter());
app.use('/public/delivery', createDeliveryPublicRouter());
app.use('/', createKioskRouter());

// ── Rotas SPA ─────────────────────────────────────────────────────────────────
app.get('/delivery/:slug/pedido/:id', (_req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  next();
});

app.get('/delivery/:slug', (_req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  next();
});

// ── Erro Multer ───────────────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Arquivo muito grande. Máximo permitido: 10MB.',
      });
    }

    return res.status(400).json({
      success: false,
      message: `Erro de upload: ${err.message}`,
    });
  }

  next(err);
});

// ── Controle de migrations ────────────────────────────────────────────────────
function shouldRunMigrationsOnBoot(): boolean {
  const v = String(process.env.RUN_MIGRATIONS_ON_BOOT ?? '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

// 🔥 NOVO: retry resiliente
async function runMigrationsWithRetry(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Rodando migrations (tentativa ${i + 1})...`);
      await runMigrations();
      console.log('✅ Migrations executadas com sucesso');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Tentativa ${i + 1} falhou:`, msg);
      if (err instanceof Error && err.stack) console.error(err.stack);

      if (i === retries - 1) {
        console.error(
          '❌ Falha definitiva nas migrations — o servidor não será iniciado (banco inconsistente).'
        );
        process.exit(1);
      }

      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function startServer() {
  if (shouldRunMigrationsOnBoot()) {
    await runMigrationsWithRetry();
  } else {
    console.warn(
      '⚠️  RUN_MIGRATIONS_ON_BOOT desligado — o servidor sobe sem migrar.'
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();