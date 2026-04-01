import type { Express } from 'express';
import { isCloudinaryProductUploadEnabled } from './cloudinaryProduct';
import { finalizeLocalUploadToPersistentStorage } from './uploadPersistence';

/**
 * Escape hatch: volume persistente + uploads só em disco (sem Cloudinary).
 * Não use em PaaS sem volume — imagens somem a cada deploy.
 */
export function isLocalUploadsEscapeHatchEnabled(): boolean {
  const v = process.env.FLOWPDV_ALLOW_LOCAL_UPLOADS?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Em produção, sem escape hatch, Cloudinary é obrigatório para qualquer upload de imagem
 * que deva sobreviver ao deploy.
 */
export function assertProductionImageStorageConfigured(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (isLocalUploadsEscapeHatchEnabled()) {
    console.warn(
      '[uploads] FLOWPDV_ALLOW_LOCAL_UPLOADS: uploads locais permitidos em produção. Garanta volume em UPLOADS_ROOT ou as imagens somem no redeploy.'
    );
    return;
  }
  if (!isCloudinaryProductUploadEnabled()) {
    console.error(
      '❌ FATAL: Em produção é obrigatório configurar Cloudinary (CLOUDINARY_URL ou CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET). ' +
        'Sem isso, novos uploads vão para /uploads no disco efêmero e viram 404 após deploy. ' +
        'Exceção: volume persistente + FLOWPDV_ALLOW_LOCAL_UPLOADS=true.'
    );
    process.exit(1);
  }
}

/** Multer em memória quando o pipeline grava via Cloudinary (buffer). */
export function useMulterMemoryForImageUploads(): boolean {
  return isCloudinaryProductUploadEnabled();
}

/**
 * Legado: se `logo_url` no banco está vazio, inferir arquivo em disco.
 * Em produção com Cloudinary obrigatório, não fazer isso — evita devolver `/uploads/...` que não existe no próximo deploy.
 */
export function shouldResolveTenantLogoFromDiskFallback(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (isLocalUploadsEscapeHatchEnabled()) return true;
  return !isCloudinaryProductUploadEnabled();
}

/** APIs que não devem aceitar novos valores apontando para armazenamento local legado. */
export function forbidClientSuppliedLocalUploadImageUrls(): boolean {
  return process.env.NODE_ENV === 'production' && !isLocalUploadsEscapeHatchEnabled();
}

/**
 * Detecta referências a `/uploads` (relativas ou dentro de URL absoluta do próprio app).
 * Não confunde com paths do Cloudinary (`/.../image/upload/...`).
 */
export function isClientSuppliedLocalUploadImageUrl(url: unknown): boolean {
  if (url == null) return false;
  let s = String(url).trim();
  if (!s) return false;
  s = s.replace(/\\/g, '/');
  if (s.startsWith('/uploads') || /^uploads\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) {
    try {
      let pathPart = new URL(s).pathname || '/';
      pathPart = pathPart.replace(/\/+/g, '/');
      if (pathPart === '/uploads' || pathPart.startsWith('/uploads/')) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Após Multer + checkMagicBytes: grava no Cloudinary (se configurado) ou em disco/S3 (só desenvolvimento ou escape hatch).
 */
export async function persistMulterImageFile(options: {
  file: Express.Multer.File;
  uploadToCloudinary: () => Promise<string>;
  localPublicPath: string;
}): Promise<string> {
  if (isCloudinaryProductUploadEnabled()) {
    const buf = options.file.buffer as Buffer | undefined;
    if (!buf?.length) {
      throw new Error('EMPTY_IMAGE_BUFFER');
    }
    return options.uploadToCloudinary();
  }
  if (process.env.NODE_ENV === 'production' && !isLocalUploadsEscapeHatchEnabled()) {
    throw new Error('PRODUCTION_REQUIRES_CLOUDINARY_OR_ESCAPE_HATCH');
  }
  const abs = options.file.path;
  if (!abs) {
    throw new Error('MISSING_DISK_PATH_FOR_LOCAL_UPLOAD');
  }
  return finalizeLocalUploadToPersistentStorage({
    absolutePath: abs,
    publicPath: options.localPublicPath,
    contentType: options.file.mimetype,
  });
}
