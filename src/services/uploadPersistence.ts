import fs from 'fs';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveProductUploadDiskPath } from '../utils/productPhotoFs';

let s3Client: S3Client | null = null;

function accessKeyId(): string | undefined {
  return process.env.S3_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
}

function secretAccessKey(): string | undefined {
  return process.env.S3_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim();
}

/** Uploads vão para bucket S3-compatível (AWS S3, Cloudflare R2, MinIO, etc.) e a URL pública absoluta é gravada no banco. */
export function isS3ObjectStorageEnabled(): boolean {
  const bucket = process.env.S3_BUCKET?.trim();
  const pub = process.env.S3_PUBLIC_BASE_URL?.trim();
  return Boolean(bucket && pub && accessKeyId() && secretAccessKey());
}

function publicBaseNormalized(): string {
  return process.env.S3_PUBLIC_BASE_URL!.trim().replace(/\/$/, '');
}

function bucketName(): string {
  return process.env.S3_BUCKET!.trim();
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const region = process.env.S3_REGION?.trim() || 'auto';
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === '1' ||
    process.env.S3_FORCE_PATH_STYLE === 'true' ||
    process.env.S3_FORCE_PATH_STYLE === 'yes';
  s3Client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: {
      accessKeyId: accessKeyId()!,
      secretAccessKey: secretAccessKey()!,
    },
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
  });
  return s3Client;
}

function isOurPublicUrl(url: string): boolean {
  if (!isS3ObjectStorageEnabled()) return false;
  const base = publicBaseNormalized();
  return url === base || url.startsWith(`${base}/`);
}

function objectKeyFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const k = u.pathname.replace(/^\/+/, '');
    return k || null;
  } catch {
    return null;
  }
}

/**
 * Após o Multer gravar em disco: se S3 estiver ativo, envia o objeto, apaga o arquivo local e devolve URL pública.
 * Caso contrário mantém o arquivo em `UPLOADS_ROOT` e devolve `publicPath` (/uploads/...).
 *
 * `publicPath` deve ser exatamente o path público (ex.: `/uploads/produto-1.jpg`).
 */
export async function finalizeLocalUploadToPersistentStorage(options: {
  absolutePath: string;
  publicPath: string;
  contentType?: string;
}): Promise<string> {
  const { absolutePath, publicPath, contentType } = options;
  if (!publicPath.startsWith('/uploads/')) {
    throw new Error('publicPath must start with /uploads/');
  }
  if (!isS3ObjectStorageEnabled()) {
    return publicPath;
  }
  const key = publicPath.replace(/^\/+/, '');
  const body = fs.readFileSync(absolutePath);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  try {
    fs.unlinkSync(absolutePath);
  } catch {
    /* ignore */
  }
  return `${publicBaseNormalized()}/${key}`;
}

/** Remove arquivo local em UPLOADS_* ou objeto no bucket se a URL for a base pública configurada. */
export async function deleteStoredUpload(url: string | null | undefined): Promise<void> {
  if (url == null) return;
  const s = String(url).trim();
  if (!s) return;

  const norm = s.replace(/\\/g, '/');
  if (norm === '/uploads' || norm.startsWith('/uploads/')) {
    const disk = resolveProductUploadDiskPath(norm);
    if (disk && fs.existsSync(disk)) {
      try {
        fs.unlinkSync(disk);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (/^https?:\/\//i.test(norm) && isOurPublicUrl(norm)) {
    const key = objectKeyFromPublicUrl(norm);
    if (!key) return;
    try {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
    } catch (e) {
      console.warn('[uploads] falha ao remover objeto remoto:', key, e);
    }
  }
}
