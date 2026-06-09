import path from 'path';

/**
 * Diretório único de arquivos servidos em `/uploads/*`.
 * Multer, express.static, exclusões em disco e scripts devem usar o mesmo valor.
 *
 * Padrão: `process.cwd()/uploads`.
 *
 * Em PaaS (ex.: Railway) o filesystem do container é efêmero: após deploy/restart os arquivos
 * somem salvo volume persistente ou storage externo (S3/R2).
 *
 * Defina `FLOWPDV_UPLOADS_DIR` com caminho absoluto do volume (ex.: `/data/uploads` no Railway).
 */
const raw = process.env.FLOWPDV_UPLOADS_DIR?.trim();
export const UPLOADS_ROOT = raw
  ? path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.resolve(process.cwd(), raw)
  : path.join(process.cwd(), 'uploads');
