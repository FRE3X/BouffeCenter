import { z } from 'zod';

const LIGATURES: Record<string, string> = { œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae', ß: 'ss' };

export function normalize(input: string): string {
  return input
    .replace(/[œŒæÆß]/g, (c) => LIGATURES[c])
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(input: string): string {
  return (
    normalize(input)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

/** Builds `WHERE` fragments matching every word of `query` against a `search` column. */
export function searchClause(query: string | undefined, column = 'search') {
  const words = normalize(query ?? '').split(' ').filter(Boolean).slice(0, 8);
  return {
    sql: words.map(() => `${column} LIKE ? ESCAPE '\\'`).join(' AND '),
    params: words.map((w) => `%${w.replace(/[\\%_]/g, '\\$&')}%`),
  };
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

/** Lucide icon name, e.g. "utensils" or "cake-slice". */
export const iconName = z.string().regex(/^[a-z0-9-]{2,40}$/, 'Icône invalide');
