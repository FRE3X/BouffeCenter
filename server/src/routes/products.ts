import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q, tx } from '../db.ts';
import { type AuthEnv, type User, assertCanEdit, requireUser } from '../lib/auth.ts';
import { listImages, now, uniqueSlug } from '../lib/content.ts';
import { WINE_TYPES, searchWines, wineDetail } from '../lib/grapeminds.ts';
import { fail, idOrSlug, parseId } from '../lib/http.ts';
import { imageUrls, processImage, removeImageFiles } from '../lib/images.ts';
import { OFF_CREDIT, offByBarcode, offImage, offSearch } from '../lib/openfoodfacts.ts';
import { type Section, assertSectionVisible, isLocked, isPrivate } from '../lib/settings.ts';
import { cleanTags, normalize, parseJsonArray, searchClause } from '../lib/text.ts';

export const PRODUCT_KINDS = ['pantry', 'wine'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** Pantry products live in the "Produits" section, wines in the "Cave" section. */
export const sectionOf = (kind: ProductKind): Section => (kind === 'wine' ? 'cellar' : 'products');

export type ProductRow = {
  id: number;
  slug: string;
  kind: ProductKind;
  name: string;
  brand: string;
  description: string;
  category_id: number | null;
  tags: string;
  quantity: number;
  store: string;
  price_cents: number | null;
  barcode: string | null;
  cover_image_id: string | null;
  wine_type: string | null;
  vintage: number | null;
  appellation: string;
  region: string;
  country: string;
  grape: string;
  abv: number | null;
  drink_from: number | null;
  drink_until: number | null;
  purchase_price_cents: number | null;
  location: string;
  grapeminds_id: string | null;
  author_id: number | null;
  created_at: number;
  updated_at: number;
  author: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_icon: string | null;
  color: string | null;
  first_image_id: string | null;
};

export const PRODUCT_SELECT = `
  SELECT p.*, u.pseudo AS author,
    c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.color,
    (SELECT i.id FROM images i WHERE i.kind = 'product' AND i.owner_id = p.id AND i.in_gallery = 1
     ORDER BY i.position, i.created_at LIMIT 1) AS first_image_id
  FROM products p
  LEFT JOIN users u ON u.id = p.author_id
  LEFT JOIN categories c ON c.id = p.category_id`;

/** The stock is a members-only detail: visitors get the recommendation without quantities. */
export function serializeProductCard(row: ProductRow, member: boolean) {
  const coverId = row.cover_image_id ?? row.first_image_id;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    brand: row.brand,
    description: row.description,
    tags: parseJsonArray(row.tags),
    category: row.category_id
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name, icon: row.category_icon, color: row.color }
      : null,
    cover: coverId ? { id: coverId, ...imageUrls(coverId) } : null,
    ...(member ? { quantity: row.quantity } : {}),
    store: row.store,
    price_cents: row.price_cents,
    barcode: row.barcode,
    wine_type: row.wine_type,
    vintage: row.vintage,
    appellation: row.appellation,
    region: row.region,
    country: row.country,
    grape: row.grape,
    abv: row.abv,
    drink_from: row.drink_from,
    drink_until: row.drink_until,
    ...(member ? { purchase_price_cents: row.purchase_price_cents, location: row.location } : {}),
    grapeminds_id: row.grapeminds_id,
    author_id: row.author_id,
    author: row.author,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeFull(row: ProductRow, user: User | null) {
  // "Used in" recipes belong to the recipes section: hidden when it is private.
  const recipes = isLocked(user, 'recipes')
    ? []
    : q.all<{ id: number; slug: string; title: string }>(
        `SELECT r.id, r.slug, r.title FROM recipe_products rp JOIN recipes r ON r.id = rp.recipe_id
         WHERE rp.product_id = ? ${user ? '' : 'AND r.published = 1'} ORDER BY r.title COLLATE NOCASE`,
        [row.id],
      );
  return { ...serializeProductCard(row, Boolean(user)), photos: listImages('product', row.id), recipes };
}

const text = (max: number) => z.string().trim().max(max);
const year = z.number().int().min(1800).max(2200).nullable();
const cents = z.number().int().min(0).max(100_000_000).nullable();

const productInput = z.object({
  kind: z.enum(PRODUCT_KINDS),
  name: text(160).min(1),
  brand: text(160),
  description: text(5000),
  category_id: z.number().int().nullable(),
  tags: z.array(z.string().max(40)),
  quantity: z.number().int().min(0).max(9999),
  store: text(200),
  price_cents: cents,
  barcode: z.string().regex(/^\d{6,14}$/, 'Code-barres invalide').nullable(),
  cover_image_id: z.string().nullable(),
  wine_type: z.enum(WINE_TYPES).nullable(),
  vintage: year,
  appellation: text(160),
  region: text(160),
  country: text(80),
  grape: text(200),
  abv: z.number().min(0).max(100).nullable(),
  drink_from: year,
  drink_until: year,
  purchase_price_cents: cents,
  location: text(160),
  grapeminds_id: z.string().max(64).nullable(),
});
type ProductInput = z.infer<typeof productInput>;

/** Columns written from the input, with the value stored when a field is left out at creation. */
const DEFAULTS: Omit<ProductInput, 'kind' | 'name'> = {
  brand: '',
  description: '',
  category_id: null,
  tags: [],
  quantity: 0,
  store: '',
  price_cents: null,
  barcode: null,
  cover_image_id: null,
  wine_type: null,
  vintage: null,
  appellation: '',
  region: '',
  country: '',
  grape: '',
  abv: null,
  drink_from: null,
  drink_until: null,
  purchase_price_cents: null,
  location: '',
  grapeminds_id: null,
};
const COLUMNS = ['kind', 'name', ...Object.keys(DEFAULTS)] as (keyof ProductInput)[];

function buildSearch(p: ProductInput) {
  const category = p.category_id ? q.get<{ name: string }>('SELECT name FROM categories WHERE id = ?', [p.category_id])?.name : '';
  return normalize(
    [p.name, p.brand, category, p.tags.join(' '), p.appellation, p.region, p.country, p.grape, p.vintage ?? '', p.store].join(' '),
  );
}

function toRow(p: ProductInput) {
  return COLUMNS.map((col) => (col === 'tags' ? JSON.stringify(p.tags) : (p[col] as string | number | null)));
}

function getRow(id: number) {
  const row = q.get<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  if (!row) fail(404, 'Produit introuvable');
  return row;
}

const listQuery = z.object({
  kind: z.enum(PRODUCT_KINDS).optional(),
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  in_stock: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

const lookupQuery = z
  .object({ barcode: z.string().regex(/^\d{6,14}$/, 'Code-barres invalide').optional(), q: z.string().trim().min(2).max(120).optional() })
  .refine((v) => v.barcode || v.q, 'barcode ou q est requis');

const stockInput = z
  .object({ quantity: z.number().int().min(0).max(9999).optional(), delta: z.number().int().min(-9999).max(9999).optional() })
  .refine((v) => (v.quantity === undefined) !== (v.delta === undefined), 'quantity ou delta est requis (un seul des deux)');

export const products = new Hono<AuthEnv>()
  .get('/', validate('query', listQuery), (c) => {
    const f = c.req.valid('query');
    const user = c.get('user');
    // Without a kind (cross-section search), sections closed to this visitor are simply left out.
    if (f.kind) assertSectionVisible(user, sectionOf(f.kind));
    const kinds = f.kind ? [f.kind] : PRODUCT_KINDS.filter((k) => !isLocked(user, sectionOf(k)));
    if (!kinds.length) return c.json({ items: [], total: 0, limit: f.limit, offset: f.offset });
    const where = [`p.kind IN (${kinds.map(() => '?').join(',')})`];
    const params: (string | number)[] = [...kinds];
    // Only members know the stock: visitors always see every recommendation.
    if (f.in_stock && user) where.push('p.quantity > 0');
    if (f.category) {
      where.push('c.slug = ?');
      params.push(f.category);
    }
    if (f.tag) {
      where.push('EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = ?)');
      params.push(f.tag.toLowerCase());
    }
    const search = searchClause(f.q, 'p.search');
    if (search.sql) {
      where.push(search.sql);
      params.push(...search.params);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = q.get<{ n: number }>(
      `SELECT count(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id ${whereSql}`,
      params,
    )!.n;
    const order = user ? '(p.quantity > 0) DESC, p.name COLLATE NOCASE' : 'p.name COLLATE NOCASE';
    const rows = q.all<ProductRow>(`${PRODUCT_SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
    if (!user && kinds.every((k) => !isPrivate(sectionOf(k)))) c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=600');
    return c.json({ items: rows.map((r) => serializeProductCard(r, Boolean(user))), total, limit: f.limit, offset: f.offset });
  })

  /** Open Food Facts lookup to prefill a product: by barcode (scan) or by name. */
  .get('/lookup', validate('query', lookupQuery), async (c) => {
    requireUser(c);
    const f = c.req.valid('query');
    const items = f.barcode ? await offByBarcode(f.barcode) : await offSearch(f.q!);
    const known = items.length
      ? q.all<{ id: number; slug: string; kind: ProductKind; barcode: string }>(
          `SELECT id, slug, kind, barcode FROM products WHERE barcode IN (${items.map(() => '?').join(',')})`,
          items.map((i) => i.barcode ?? ''),
        )
      : [];
    // A scanned product that is already recorded is flagged, so the client can jump to its stock.
    return c.json({ items: items.map((i) => ({ ...i, existing: known.find((k) => k.barcode === i.barcode) ?? null })) });
  })

  /** GrapeMinds wine lookup (optional, needs an API key in the settings): search by name, then a sheet. */
  .get('/wine-lookup', validate('query', z.object({ q: z.string().trim().min(3).max(255) })), async (c) => {
    requireUser(c);
    return c.json({ items: await searchWines(c.req.valid('query').q) });
  })

  .get('/wine-lookup/:id', async (c) => {
    requireUser(c);
    const id = c.req.param('id');
    if (!/^[\w-]{1,64}$/.test(id)) fail(404, 'Vin introuvable sur GrapeMinds');
    return c.json(await wineDetail(id));
  })

  .get('/:idOrSlug', (c) => {
    const user = c.get('user');
    const key = idOrSlug(c.req.param('idOrSlug'));
    const row = q.get<ProductRow>(`${PRODUCT_SELECT} WHERE p.${key.column} = ?`, [key.value]);
    if (!row) fail(404, 'Produit introuvable');
    assertSectionVisible(user, sectionOf(row.kind));
    return c.json(serializeFull(row, user));
  })

  .post('/', validate('json', productInput.partial().required({ kind: true, name: true })), (c) => {
    const user = requireUser(c);
    const body = c.req.valid('json');
    const data: ProductInput = { ...DEFAULTS, ...body, tags: cleanTags(body.tags ?? []) };
    const id = q.insert(
      `INSERT INTO products (slug, ${COLUMNS.join(', ')}, search, author_id)
       VALUES (?, ${COLUMNS.map(() => '?').join(', ')}, ?, ?)`,
      [uniqueSlug('products', data.name), ...toRow(data), buildSearch(data), user.id],
    );
    return c.json(serializeFull(getRow(id), user), 201);
  })

  .patch('/:id', validate('json', productInput.partial()), (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const body = c.req.valid('json');
    const previous = Object.fromEntries(COLUMNS.map((col) => [col, col === 'tags' ? parseJsonArray(current.tags) : current[col]]));
    const next = { ...previous, ...body, tags: body.tags ? cleanTags(body.tags) : previous.tags } as ProductInput;
    q.run(
      `UPDATE products SET ${COLUMNS.map((col) => `${col} = ?`).join(', ')}, search = ?, updated_at = ? WHERE id = ?`,
      [...toRow(next), buildSearch(next), now(), current.id],
    );
    return c.json(serializeFull(getRow(current.id), user));
  })

  /** Any member updates the shared household stock: an absolute quantity, or a delta (never below 0). */
  .put('/:id/stock', validate('json', stockInput), (c) => {
    requireUser(c);
    const product = getRow(parseId(c.req.param('id')));
    const { quantity, delta } = c.req.valid('json');
    const row = q.get<{ quantity: number }>(
      `UPDATE products SET quantity = max(0, min(9999, ${quantity === undefined ? 'quantity + ?' : '?'})), updated_at = ?
       WHERE id = ? RETURNING quantity`,
      [quantity ?? delta!, now(), product.id],
    )!;
    return c.json({ id: product.id, quantity: row.quantity });
  })

  /** Imports an Open Food Facts photo through the usual image pipeline, credited to Open Food Facts. */
  .post('/:id/import-image', validate('json', z.object({ url: z.string().url().max(500) })), async (c) => {
    const user = requireUser(c);
    const product = getRow(parseId(c.req.param('id')));
    const buffer = await offImage(c.req.valid('json').url);
    let processed;
    try {
      processed = await processImage(buffer);
    } catch {
      fail(400, 'Format d’image non supporté');
    }
    const position = q.get<{ p: number }>(
      "SELECT coalesce(max(position), -1) + 1 AS p FROM images WHERE kind = 'product' AND owner_id = ?",
      [product.id],
    )!.p;
    q.run(
      `INSERT INTO images (id, kind, owner_id, user_id, width, height, alt, position, in_gallery, credit)
       VALUES (?, 'product', ?, ?, ?, ?, ?, ?, 1, ?)`,
      [processed.id, product.id, user.id, processed.width, processed.height, product.name, position, OFF_CREDIT],
    );
    return c.json(serializeFull(getRow(product.id), user), 201);
  })

  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const imageIds = q.all<{ id: string }>("SELECT id FROM images WHERE kind = 'product' AND owner_id = ?", [current.id]);
    tx(() => {
      q.run("DELETE FROM images WHERE kind = 'product' AND owner_id = ?", [current.id]);
      q.run('DELETE FROM products WHERE id = ?', [current.id]);
    });
    await Promise.all(imageIds.map((i) => removeImageFiles(i.id)));
    return c.json({ ok: true });
  });
