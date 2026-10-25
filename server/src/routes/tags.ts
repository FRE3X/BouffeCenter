import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q } from '../db.ts';
import type { AuthEnv } from '../lib/auth.ts';
import { type Section, assertSectionVisible, isLocked } from '../lib/settings.ts';

const KINDS = ['place', 'recipe', 'product', 'wine'] as const;
type Kind = (typeof KINDS)[number];

const SOURCES: Record<Kind, { section: Section; sql: string }> = {
  place: { section: 'map', sql: 'SELECT value FROM places, json_each(places.tags) WHERE places.published = 1' },
  recipe: { section: 'recipes', sql: 'SELECT value FROM recipes, json_each(recipes.tags) WHERE recipes.published = 1' },
  product: { section: 'products', sql: "SELECT value FROM products, json_each(products.tags) WHERE products.kind = 'pantry'" },
  wine: { section: 'cellar', sql: "SELECT value FROM products, json_each(products.tags) WHERE products.kind = 'wine'" },
};

export const tags = new Hono<AuthEnv>().get('/', validate('query', z.object({ kind: z.enum(KINDS).optional() })), (c) => {
  const { kind } = c.req.valid('query');
  const user = c.get('user');
  if (kind) assertSectionVisible(user, SOURCES[kind].section);
  // Without a kind, tags from a private section are simply left out for visitors.
  const sources = (kind ? [kind] : KINDS)
    .filter((k) => !isLocked(user, SOURCES[k].section))
    .map((k) => SOURCES[k].sql);
  if (!sources.length) return c.json([]);
  const rows = q.all<{ tag: string; count: number }>(
    `SELECT value AS tag, count(*) AS count FROM (${sources.join(' UNION ALL ')}) GROUP BY value ORDER BY count DESC, value`,
  );
  return c.json(rows);
});
