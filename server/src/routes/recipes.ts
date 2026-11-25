import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q, tx } from '../db.ts';
import { type AuthEnv, type User, assertCanEdit, requireUser } from '../lib/auth.ts';
import { listImages, now, uniqueSlug } from '../lib/content.ts';
import { fail, idOrSlug, parseId } from '../lib/http.ts';
import { imageUrls, removeImageFiles } from '../lib/images.ts';
import { assertSectionVisible, isLocked, isPrivate } from '../lib/settings.ts';
import { PRODUCT_SELECT, type ProductRow, sectionOf, serializeProductCard } from './products.ts';
import { cleanTags, normalize, parseJsonArray, searchClause } from '../lib/text.ts';
import { generateRecipeDraft } from '../lib/ollama.ts';

export type RecipeRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category_id: number | null;
  place_id: number | null;
  tags: string;
  ingredients: string;
  body: string;
  cover_image_id: string | null;
  published: number;
  author_id: number | null;
  created_at: number;
  updated_at: number;
  author: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_icon: string | null;
  color: string | null;
  place_slug: string | null;
  place_name: string | null;
  first_image_id: string | null;
};

export const SELECT = `
  SELECT r.*, u.pseudo AS author,
    c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.color,
    p.slug AS place_slug, p.name AS place_name,
    (SELECT i.id FROM images i WHERE i.kind = 'recipe' AND i.owner_id = r.id AND i.in_gallery = 1
     ORDER BY i.position, i.created_at LIMIT 1) AS first_image_id
  FROM recipes r
  LEFT JOIN users u ON u.id = r.author_id
  LEFT JOIN categories c ON c.id = r.category_id
  LEFT JOIN places p ON p.id = r.place_id`;

export type Ingredient = { qty: string; name: string };

export function serializeCard(row: RecipeRow) {
  const coverId = row.cover_image_id ?? row.first_image_id;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    tags: parseJsonArray(row.tags),
    category: row.category_id
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name, icon: row.category_icon, color: row.color }
      : null,
    cover: coverId ? { id: coverId, ...imageUrls(coverId) } : null,
    published: Boolean(row.published),
    author_id: row.author_id,
    author: row.author,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeFull(row: RecipeRow) {
  let ingredients: Ingredient[] = [];
  try {
    ingredients = JSON.parse(row.ingredients);
  } catch {}
  return {
    ...serializeCard(row),
    ingredients,
    body: row.body,
    place: row.place_id ? { id: row.place_id, slug: row.place_slug, name: row.place_name } : null,
    photos: listImages('recipe', row.id),
  };
}

const listQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  drafts: z.stringbool().optional(),
  mine: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

const recipeInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
  category_id: z.number().int().nullable().optional(),
  place_id: z.number().int().nullable().optional(),
  tags: z.array(z.string().max(40)).optional(),
  ingredients: z.array(z.object({ qty: z.string().max(60).default(''), name: z.string().max(200) })).max(200).optional(),
  body: z.string().max(200_000).optional(),
  cover_image_id: z.string().nullable().optional(),
  published: z.boolean().optional(),
});

function buildSearch(r: { title: string; description: string; tags: string[]; ingredients: Ingredient[]; category_id: number | null }) {
  const category = r.category_id ? q.get<{ name: string }>('SELECT name FROM categories WHERE id = ?', [r.category_id])?.name : '';
  return normalize([r.title, r.description, category, r.tags.join(' '), r.ingredients.map((i) => i.name).join(' ')].join(' '));
}

/**
 * Recommended products and wine pairings of a recipe, in their saved order.
 * Each kind follows its own section's visibility; members also get the stock.
 */
export function linkedProducts(recipeId: number, user: User | null) {
  return q
    .all<ProductRow>(
      `${PRODUCT_SELECT} JOIN recipe_products rp ON rp.product_id = p.id WHERE rp.recipe_id = ? ORDER BY rp.position`,
      [recipeId],
    )
    .filter((row) => !isLocked(user, sectionOf(row.kind)))
    .map((row) => serializeProductCard(row, Boolean(user)));
}

function getRow(id: number) {
  const row = q.get<RecipeRow>(`${SELECT} WHERE r.id = ?`, [id]);
  if (!row) fail(404, 'Recette introuvable');
  return row;
}

export const recipes = new Hono<AuthEnv>()
  .get('/', validate('query', listQuery), (c) => {
    const f = c.req.valid('query');
    const user = c.get('user');
    assertSectionVisible(user, 'recipes');
    if ((f.drafts || f.mine) && !user) fail(401, 'Authentification requise');
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (!f.drafts) where.push('r.published = 1');
    if (f.mine) {
      where.push('r.author_id = ?');
      params.push(user!.id);
    }
    if (f.category) {
      where.push('c.slug = ?');
      params.push(f.category);
    }
    // Several tags separated by commas: a recipe must carry all of them.
    const tags = (f.tag ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
    for (const t of tags) {
      where.push('EXISTS (SELECT 1 FROM json_each(r.tags) WHERE value = ?)');
      params.push(t);
    }
    const search = searchClause(f.q, 'r.search');
    if (search.sql) {
      where.push(search.sql);
      params.push(...search.params);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = q.get<{ n: number }>(
      `SELECT count(*) AS n FROM recipes r LEFT JOIN categories c ON c.id = r.category_id ${whereSql}`,
      params,
    )!.n;
    const rows = q.all<RecipeRow>(`${SELECT} ${whereSql} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      f.limit,
      f.offset,
    ]);
    if (!user && !isPrivate('recipes')) c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=600');
    return c.json({ items: rows.map(serializeCard), total, limit: f.limit, offset: f.offset });
  })

  .get('/:idOrSlug', (c) => {
    const user = c.get('user');
    assertSectionVisible(user, 'recipes');
    const key = idOrSlug(c.req.param('idOrSlug'));
    const row = q.get<RecipeRow>(`${SELECT} WHERE r.${key.column} = ?`, [key.value]);
    if (!row || (!row.published && !user)) fail(404, 'Recette introuvable');
    const recipe = { ...serializeFull(row), products: linkedProducts(row.id, user) };
    // The linked place belongs to the map: hide it when the map is private.
    return c.json(isLocked(user, 'map') ? { ...recipe, place: null } : recipe);
  })

  /** Drafts a recipe from a prompt with the configured Ollama model. Nothing is saved: the editor gets prefilled. */
  .post('/generate', validate('json', z.object({ prompt: z.string().trim().min(3, 'Décrivez la recette en quelques mots').max(2000) })), async (c) => {
    requireUser(c);
    return c.json(await generateRecipeDraft(c.req.valid('json').prompt));
  })

  .post('/', validate('json', recipeInput), (c) => {
    const user = requireUser(c);
    const body = c.req.valid('json');
    const data = {
      title: body.title,
      description: body.description ?? '',
      tags: cleanTags(body.tags ?? []),
      ingredients: body.ingredients ?? [],
      category_id: body.category_id ?? null,
    };
    const id = q.insert(
      `INSERT INTO recipes (slug, title, description, category_id, place_id, tags, ingredients, body, published, search, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uniqueSlug('recipes', body.title),
        body.title,
        data.description,
        data.category_id,
        body.place_id ?? null,
        JSON.stringify(data.tags),
        JSON.stringify(data.ingredients),
        body.body ?? '',
        body.published ? 1 : 0,
        buildSearch(data),
        user.id,
      ],
    );
    return c.json(serializeFull(getRow(id)), 201);
  })

  .patch('/:id', validate('json', recipeInput.partial()), (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const body = c.req.valid('json');
    const currentFull = serializeFull(current);
    const next = {
      title: body.title ?? current.title,
      description: body.description ?? current.description,
      category_id: body.category_id === undefined ? current.category_id : body.category_id,
      place_id: body.place_id === undefined ? current.place_id : body.place_id,
      tags: body.tags ? cleanTags(body.tags) : currentFull.tags,
      ingredients: body.ingredients ?? currentFull.ingredients,
      body: body.body ?? current.body,
      cover_image_id: body.cover_image_id === undefined ? current.cover_image_id : body.cover_image_id,
      published: body.published === undefined ? Boolean(current.published) : body.published,
    };
    const slug = current.slug.startsWith('nouvelle-recette') && next.title !== 'Nouvelle recette'
      ? uniqueSlug('recipes', next.title, current.id)
      : current.slug;
    q.run(
      `UPDATE recipes SET slug = ?, title = ?, description = ?, category_id = ?, place_id = ?, tags = ?, ingredients = ?, body = ?,
         cover_image_id = ?, published = ?, search = ?, updated_at = ?
       WHERE id = ?`,
      [
        slug,
        next.title,
        next.description,
        next.category_id,
        next.place_id,
        JSON.stringify(next.tags),
        JSON.stringify(next.ingredients),
        next.body,
        next.cover_image_id,
        next.published ? 1 : 0,
        buildSearch(next),
        now(),
        current.id,
      ],
    );
    return c.json(serializeFull(getRow(current.id)));
  })

  /** Replaces the recipe's recommended products and wine pairings (ordered). */
  .put('/:id/products', validate('json', z.object({ product_ids: z.array(z.number().int().positive()).max(40) })), (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const ids = [...new Set(c.req.valid('json').product_ids)];
    if (ids.length) {
      const found = q.get<{ n: number }>(`SELECT count(*) AS n FROM products WHERE id IN (${ids.map(() => '?').join(',')})`, ids)!.n;
      if (found !== ids.length) fail(400, 'Produit introuvable');
    }
    tx(() => {
      q.run('DELETE FROM recipe_products WHERE recipe_id = ?', [current.id]);
      ids.forEach((id, position) =>
        q.run('INSERT INTO recipe_products (recipe_id, product_id, position) VALUES (?, ?, ?)', [current.id, id, position]),
      );
    });
    return c.json({ products: linkedProducts(current.id, user) });
  })

  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const imageIds = q.all<{ id: string }>("SELECT id FROM images WHERE kind = 'recipe' AND owner_id = ?", [current.id]);
    tx(() => {
      q.run("DELETE FROM images WHERE kind = 'recipe' AND owner_id = ?", [current.id]);
      q.run('DELETE FROM recipes WHERE id = ?', [current.id]);
    });
    await Promise.all(imageIds.map((i) => removeImageFiles(i.id)));
    return c.json({ ok: true });
  });
