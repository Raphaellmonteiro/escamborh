import path from 'path';

/**
 * Diretório único de arquivos servidos em `/uploads/*`.
 * Multer, express.static, exclusões em disco e scripts devem usar o mesmo valor (`process.cwd()/uploads`).
 *
 * Em PaaS (ex.: Railway) o filesystem do container é efêmero: após deploy/restart os arquivos
 * somem salvo volume persistente ou storage externo (S3/R2).
 */
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
