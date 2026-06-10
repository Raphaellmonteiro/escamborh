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
import { runMigrations, query } from './src/db';
import { UPLOADS_ROOT } from './src/uploadsRoot';
import { isS3ObjectStorageEnabled } from './src/services/uploadPersistence';
import { isCloudinaryProductUploadEnabled } from './src/services/cloudinaryProduct';
import { assertProductionImageStorageConfigured } from './src/services/imageUploadPolicy';

// ── Middlewares ───────────────────────────────────────────────────────────────
import { ALLOWED_BROWSER_ORIGINS, requestLogger } from './src/middleware';
import { errorHandler } from './src/middlewares/errorHandler';

// ── Rotas ─────────────────────────────────────────────────────────────────────
import { createDeliveryPublicRouter } from './src/routes/delivery-public';
import { createKioskRouter } from './src/routes/kiosk';
import { createApiRouter } from './src/routes';
import { MAX_IMAGE_UPLOAD_BYTES } from './src/utils/imageUploadSecurity';

// ─────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Proxy reverso (Railway, etc.): habilita X-Forwarded-For em req.ip e satisfaz express-rate-limit (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        // Inclui ws:/wss: além do pedido inicial — HMR do Vite (middlewareMode) e alguns browsers não tratam WebSocket como 'self' junto de http.
        connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "https:", "data:"],
      },
    },
  })
);

// ── Startup ───────────────────────────────────────────────────────────────────
assertProductionImageStorageConfigured();

if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_ROOT, 'logo'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_ROOT, 'funcionarios'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_ROOT, 'delivery'), { recursive: true });

const uploadsViaVolume = Boolean(process.env.FLOWPDV_UPLOADS_DIR?.trim());
console.log(
  `[uploads] UPLOADS_ROOT=${UPLOADS_ROOT} volume_env=${uploadsViaVolume} s3=${isS3ObjectStorageEnabled()} cloudinary_products=${isCloudinaryProductUploadEnabled()}`
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ALLOWED_BROWSER_ORIGINS;

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

// ── Health (sem autenticação; leve) ───────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.sendStatus(500);
  }
});

// ── API: legado `/api` + versão explícita `/api/v1` (mesmo router, sem duplicar lógica)
const apiRouter = createApiRouter();
app.use('/api', apiRouter);
app.use('/api/v1', apiRouter);
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
      const mb = Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024));
      return res.status(400).json({
        success: false,
        message: `Arquivo muito grande. Máximo permitido: ${mb}MB.`,
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
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

// 🔥 NOVO: retry resiliente
async function runMigrationsWithRetry(retries = 5): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Rodando migrations (tentativa ${i + 1})...`);
      await runMigrations();
      console.log('✅ Migrations executadas com sucesso');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Tentativa ${i + 1} falhou:`, msg);
      if (err instanceof Error && err.stack) console.error(err.stack);

      if (i === retries - 1) {
        console.error('❌ Falha definitiva nas migrations.');
        return false;
      }

      await new Promise((res) => setTimeout(res, 3000));
    }
  }

  return false;
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function startServer() {
  if (shouldRunMigrationsOnBoot()) {
    const migrationsOk = await runMigrationsWithRetry();
    if (!migrationsOk) {
      if (process.env.NODE_ENV === 'production') {
        console.error(
          '⚠️  Produção: servidor seguirá sem aplicar migrations no boot. Rode `npm run migrate` após corrigir o banco.'
        );
      } else {
        throw new Error('Falha nas migrations de boot.');
      }
    }
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
    // Assets com hash no nome (JS/CSS) — cache longo
    app.use(express.static(path.join(__dirname, 'dist'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (filePath.match(/\.(js|css)$/) && filePath.includes('-')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
