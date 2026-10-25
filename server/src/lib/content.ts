import { q } from '../db.ts';
import { imageUrls } from './images.ts';
import { slugify } from './text.ts';

export function uniqueSlug(table: 'places' | 'recipes' | 'products', source: string, excludeId?: number): string {
  const base = slugify(source);
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = q.get(`SELECT 1 FROM ${table} WHERE slug = ? AND id IS NOT ?`, [slug, excludeId ?? null]);
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

type ImageRow = {
  id: string;
  width: number;
  height: number;
  alt: string;
  position: number;
  in_gallery: number;
  user_id: number | null;
  pseudo: string | null;
  credit: string | null;
  created_at: number;
};

export function serializeImage(row: ImageRow) {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    alt: row.alt,
    position: row.position,
    in_gallery: Boolean(row.in_gallery),
    user_id: row.user_id,
    author: row.credit ?? row.pseudo,
    created_at: row.created_at,
    urls: imageUrls(row.id),
  };
}

export function listImages(kind: 'place' | 'recipe' | 'product', ownerId: number, galleryOnly = true) {
  const rows = q.all<ImageRow>(
    `SELECT i.*, u.pseudo FROM images i LEFT JOIN users u ON u.id = i.user_id
     WHERE i.kind = ? AND i.owner_id = ? ${galleryOnly ? 'AND i.in_gallery = 1' : ''}
     ORDER BY i.position, i.created_at`,
    [kind, ownerId],
  );
  return rows.map(serializeImage);
}

export const now = () => Math.floor(Date.now() / 1000);
