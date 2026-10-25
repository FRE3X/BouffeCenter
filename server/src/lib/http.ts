import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message });
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) fail(404, 'Introuvable');
  return id;
}

/** Accepts either a numeric id or a slug. */
export function idOrSlug(value: string): { column: 'id' | 'slug'; value: string | number } {
  return /^\d+$/.test(value) ? { column: 'id', value: Number(value) } : { column: 'slug', value };
}
