import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.ts';

sharp.cache(false);
sharp.concurrency(1);

export const IMAGE_SIZES = { sm: 480, lg: 1600 } as const;

export function imageUrls(id: string) {
  return { sm: `/uploads/${id}-sm.webp`, lg: `/uploads/${id}-lg.webp` };
}

/** Auto-rotates, strips metadata and writes two WebP renditions. */
export async function processImage(input: Buffer) {
  const id = crypto.randomBytes(9).toString('base64url');
  const base = sharp(input, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('Image illisible');

  const lg = await base
    .clone()
    .resize({ width: IMAGE_SIZES.lg, height: IMAGE_SIZES.lg, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const sm = await base
    .clone()
    .resize({ width: IMAGE_SIZES.sm, height: IMAGE_SIZES.sm, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  await fs.writeFile(path.join(config.uploadDir, `${id}-lg.webp`), lg.data);
  await fs.writeFile(path.join(config.uploadDir, `${id}-sm.webp`), sm);
  return { id, width: lg.info.width, height: lg.info.height };
}

export async function removeImageFiles(id: string) {
  await Promise.all(
    Object.keys(IMAGE_SIZES).map((size) =>
      fs.rm(path.join(config.uploadDir, `${id}-${size}.webp`), { force: true }),
    ),
  );
}
