import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import sharp from 'sharp';

/** Limite único para todos os uploads de imagem (Multer + mensagens ao cliente). */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp';

/** ~32MP — reduz risco de decompression bomb. */
const SHARP_INPUT_PIXEL_LIMIT = 32_000_000;

export const CANONICAL_MIME: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const STATIC_IMAGE_ALLOWED_CLIENT_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PRODUCT_IMAGE_ALLOWED_CLIENT_MIMES = [
  ...STATIC_IMAGE_ALLOWED_CLIENT_MIMES,
  'image/gif',
] as const;

const STATIC_MIME_SET = new Set<string>(STATIC_IMAGE_ALLOWED_CLIENT_MIMES);
const PRODUCT_MIME_SET = new Set<string>(PRODUCT_IMAGE_ALLOWED_CLIENT_MIMES);

export function normalizeClientMime(mimetype: string): string {
  const m = String(mimetype || '')
    .trim()
    .toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/pjpeg') return 'image/jpeg';
  if (m === 'image/x-png') return 'image/png';
  return m;
}

export function detectImageKindFromBuffer(buf: Buffer): ImageKind | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'gif';
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

const EXT_TO_KIND: Record<string, ImageKind> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.gif': 'gif',
  '.webp': 'webp',
};

export function extensionToKind(extWithDot: string): ImageKind | null {
  return EXT_TO_KIND[extWithDot.toLowerCase()] ?? null;
}

export function mimeToKind(mime: string): ImageKind | null {
  const m = normalizeClientMime(mime);
  if (m === 'image/jpeg') return 'jpeg';
  if (m === 'image/png') return 'png';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  return null;
}

export function assertSafeImageBasename(originalname: string): { ok: true; base: string } | { ok: false } {
  if (!originalname || typeof originalname !== 'string') return { ok: false };
  if (originalname.length > 240) return { ok: false };
  if (originalname.includes('\0')) return { ok: false };
  const norm = originalname.replace(/\\/g, '/');
  const segments = norm.split('/').filter(Boolean);
  if (segments.some((s) => s === '..')) return { ok: false };
  const base = path.basename(norm);
  if (!base || base === '.' || base === '..') return { ok: false };
  return { ok: true, base };
}

export type HardenImageResult = { ok: true } | { ok: false; message: string };

export async function hardenMulterImageFile(
  file: Express.Multer.File,
  opts: { allowGif: boolean }
): Promise<HardenImageResult> {
  const nameCheck = assertSafeImageBasename(file.originalname);
  if (!nameCheck.ok) {
    return { ok: false, message: 'Nome de arquivo inválido.' };
  }
  const extRaw = path.extname(nameCheck.base);
  if (!extRaw) {
    return { ok: false, message: 'Extensão obrigatória (ex.: .jpg, .png, .webp).' };
  }
  const extKind = extensionToKind(extRaw);
  if (!extKind) {
    return {
      ok: false,
      message: 'Extensão não permitida. Use .jpg, .jpeg, .png, .webp' + (opts.allowGif ? ' ou .gif.' : '.'),
    };
  }
  if (extKind === 'gif' && !opts.allowGif) {
    return { ok: false, message: 'GIF não é permitido neste upload.' };
  }

  const normalizedMime = normalizeClientMime(file.mimetype);
  const mimeSet = opts.allowGif ? PRODUCT_MIME_SET : STATIC_MIME_SET;
  if (!mimeSet.has(normalizedMime)) {
    return { ok: false, message: 'Tipo MIME não permitido para este upload.' };
  }
  const declaredKind = mimeToKind(normalizedMime);
  if (!declaredKind) {
    return { ok: false, message: 'Tipo MIME inválido.' };
  }

  let buffer: Buffer;
  try {
    if (file.buffer && file.buffer.length) {
      buffer = file.buffer;
    } else if (file.path) {
      buffer = fs.readFileSync(file.path);
    } else {
      return { ok: false, message: 'Arquivo vazio ou não recebido.' };
    }
  } catch {
    return { ok: false, message: 'Falha ao ler o arquivo enviado.' };
  }

  if (!buffer.length) {
    return { ok: false, message: 'Arquivo vazio ou não recebido.' };
  }

  const detected = detectImageKindFromBuffer(buffer);
  if (!detected) {
    return { ok: false, message: 'Arquivo rejeitado: conteúdo não é uma imagem válida.' };
  }
  if (detected === 'gif' && !opts.allowGif) {
    return { ok: false, message: 'GIF não é permitido neste upload.' };
  }
  if (detected !== extKind) {
    return { ok: false, message: 'A extensão não corresponde ao conteúdo real da imagem.' };
  }
  if (detected !== declaredKind) {
    return { ok: false, message: 'O tipo declarado (MIME) não corresponde ao conteúdo da imagem.' };
  }

  let out: Buffer;
  try {
    if (detected === 'gif') {
      out = buffer;
    } else {
      const pipeline = sharp(buffer, {
        limitInputPixels: SHARP_INPUT_PIXEL_LIMIT,
        animated: false,
      }).rotate();

      if (detected === 'jpeg') {
        out = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      } else if (detected === 'png') {
        out = await pipeline.png({ compressionLevel: 9, effort: 7 }).toBuffer();
      } else {
        out = await pipeline.webp({ quality: 85 }).toBuffer();
      }
    }
  } catch {
    return {
      ok: false,
      message: 'Imagem inválida ou corrompida (não foi possível processar com segurança).',
    };
  }

  if (!out.length) {
    return { ok: false, message: 'Processamento da imagem resultou em arquivo vazio.' };
  }

  file.buffer = out;
  file.size = out.length;
  file.mimetype = CANONICAL_MIME[detected];

  if (file.path) {
    try {
      fs.writeFileSync(file.path, out);
    } catch {
      return { ok: false, message: 'Falha ao gravar arquivo processado.' };
    }
  }

  return { ok: true };
}

export function cleanupMulterImageFile(file: Express.Multer.File | undefined): void {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }
}
