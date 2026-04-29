import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (process.env.CLOUDINARY_URL?.trim()) {
    cloudinary.config(true);
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
      secure: true,
    });
  }
  cloudinary.config({ secure: true });
  configured = true;
}

/** Uploads de imagem vão ao Cloudinary (sem depender de /uploads no servidor). */
export function isCloudinaryProductUploadEnabled(): boolean {
  if (process.env.CLOUDINARY_URL?.trim()) return true;
  const n = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const k = process.env.CLOUDINARY_API_KEY?.trim();
  const s = process.env.CLOUDINARY_API_SECRET?.trim();
  return Boolean(n && k && s);
}

/** Alias semântico — mesmo critério de env que produtos/delivery/logo/RH. */
export const isCloudinaryUploadEnabled = isCloudinaryProductUploadEnabled;

function ourCloudName(): string | null {
  const url = process.env.CLOUDINARY_URL?.trim();
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'cloudinary:') return u.hostname || null;
    } catch {
      /* ignore */
    }
  }
  return process.env.CLOUDINARY_CLOUD_NAME?.trim() || null;
}

/** `public_id` completo (com pastas, sem extensão) a partir de `secure_url` típica de upload. */
export function cloudinaryPublicIdFromSecureUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/^res\.cloudinary\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const cloud = ourCloudName();
    if (cloud && parts[0] && parts[0] !== cloud) return null;
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx < 0) return null;
    let i = uploadIdx + 1;
    if (i < parts.length && /^v\d+$/i.test(parts[i])) i++;
    while (i < parts.length && parts[i].includes(',')) i++;
    if (i >= parts.length) return null;
    const rest = parts.slice(i).join('/');
    return rest.replace(/\.[^.]+$/, '');
  } catch {
    return null;
  }
}

export async function uploadBufferedImageToCloudinary(options: {
  buffer: Buffer;
  folder: string;
  publicId: string;
}): Promise<string> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
        fetch_format: 'auto',
        quality: 'auto',
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        const url = result?.secure_url;
        if (!url) {
          reject(new Error('Cloudinary: resposta sem secure_url'));
          return;
        }
        resolve(url);
      }
    );
    stream.end(options.buffer);
  });
}

export async function uploadProductImageToCloudinary(options: {
  buffer: Buffer;
  tenantId: number;
  productId: number;
}): Promise<string> {
  return uploadBufferedImageToCloudinary({
    buffer: options.buffer,
    folder: `flowpdv/products/t${options.tenantId}`,
    publicId: `p${options.productId}_${Date.now()}`,
  });
}

export async function uploadTenantLogoToCloudinary(options: { buffer: Buffer; tenantId: number }): Promise<string> {
  return uploadBufferedImageToCloudinary({
    buffer: options.buffer,
    folder: `flowpdv/tenants/t${options.tenantId}`,
    publicId: `logo_${Date.now()}`,
  });
}

export async function uploadDeliveryCardapioLogoToCloudinary(options: { buffer: Buffer; tenantId: number }): Promise<string> {
  return uploadBufferedImageToCloudinary({
    buffer: options.buffer,
    folder: `flowpdv/delivery/t${options.tenantId}`,
    publicId: `cardapio_logo_${Date.now()}`,
  });
}

export async function uploadDeliveryBannerToCloudinary(options: {
  buffer: Buffer;
  tenantId: number;
  bannerIndex: number;
}): Promise<string> {
  return uploadBufferedImageToCloudinary({
    buffer: options.buffer,
    folder: `flowpdv/delivery/t${options.tenantId}`,
    publicId: `banner_${options.bannerIndex}_${Date.now()}`,
  });
}

export async function uploadDeliveryReactivationMediaToCloudinary(options: {
  buffer: Buffer;
  tenantId: number;
}): Promise<string> {
  return uploadBufferedImageToCloudinary({
    buffer: options.buffer,
    folder: `flowpdv/delivery/t${options.tenantId}`,
    publicId: `reativacao_cardapio_${Date.now()}`,
  });
}

export async function uploadEmployeePhotoToCloudinary(options: {
  buffer: Buffer;
  tenantId: number;
  employeeId: number;
}): Promise<string> {
  return uploadBufferedImageToCloudinary({
    buffer: options.buffer,
    folder: `flowpdv/rh/t${options.tenantId}`,
    publicId: `emp_${options.employeeId}_${Date.now()}`,
  });
}

export async function deleteCloudinaryImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url || !isCloudinaryUploadEnabled()) return;
  const s = String(url).trim();
  if (!s) return;
  const publicId = cloudinaryPublicIdFromSecureUrl(s);
  if (!publicId) return;
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: 'image' });
  } catch (e) {
    console.warn('[cloudinary] falha ao remover imagem:', publicId, e);
  }
}
