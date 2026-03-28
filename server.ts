import 'dotenv/config';

// server.ts — orquestrador principal
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

// ── Banco e migrações ─────────────────────────────────────────────────────────
import { backupDatabase, runMigrations } from './src/db';

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

// ── Startup ───────────────────────────────────────────────────────────────────
backupDatabase();

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('uploads/logo')) fs.mkdirSync('uploads/logo', { recursive: true });
if (!fs.existsSync('uploads/funcionarios')) fs.mkdirSync('uploads/funcionarios', { recursive: true });

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

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
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

// ── Erro Multer (deve vir ANTES do erro global) ───────────────────────────────
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

// ── Erro global ───────────────────────────────────────────────────────────────

// ── Start ─────────────────────────────────────────────────────────────────────
function shouldRunMigrationsOnBoot(): boolean {
  const v = String(process.env.RUN_MIGRATIONS_ON_BOOT ?? '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

async function startServer() {
  if (shouldRunMigrationsOnBoot()) {
    try {
      await runMigrations();
    } catch (err) {
      console.error('❌ Falha nas migrações:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MaxClientsInSessionMode')) {
        console.error(
          '   → Use DATABASE_MIGRATION_URL (URI direta db.*:5432) ou RUN_MIGRATIONS_ON_BOOT=false e `npm run migrate`.'
        );
      }
      process.exit(1);
    }
  } else {
    console.warn(
      '⚠️  RUN_MIGRATIONS_ON_BOOT desligado — o servidor sobe sem migrar. Rode `npm run migrate` quando precisar.'
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
