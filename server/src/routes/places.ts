import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q, tx } from '../db.ts';
import { type AuthEnv, assertCanEdit, requireUser } from '../lib/auth.ts';
import { listImages, now, uniqueSlug } from '../lib/content.ts';
import { fail, idOrSlug, parseId } from '../lib/http.ts';
import { imageUrls, removeImageFiles } from '../lib/images.ts';
import { assertSectionVisible, isLocked, isPrivate } from '../lib/settings.ts';
import { cleanTags, iconName, normalize, parseJsonArray, searchClause } from '../lib/text.ts';

type PlaceRow = {
  id: number;
  slug: string;
  name: string;
  category_id: number | null;
  lat: number;
  lng: number;
  address: string;
  city: string;
  price_level: number | null;
  tags: string;
  description: string;
  website: string;
  phone: string;
  instagram: string;
  hours: string;
  icon: string | null;
  tried: number;
  published: number;
  author_id: number | null;
  created_at: number;
  updated_at: number;
  author: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_icon: string | null;
  color: string | null;
  rating: number | null;
  review_count: number;
  cover_id: string | null;
};

const SELECT = `
  SELECT p.*, u.pseudo AS author,
    c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.color,
    round(r.rating, 1) AS rating, coalesce(r.n, 0) AS review_count,
    (SELECT i.id FROM images i WHERE i.kind = 'place' AND i.owner_id = p.id AND i.in_gallery = 1
     ORDER BY i.position, i.created_at LIMIT 1) AS cover_id
  FROM places p
  LEFT JOIN users u ON u.id = p.author_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN (SELECT place_id, avg(rating) AS rating, count(*) AS n FROM reviews GROUP BY place_id) r ON r.place_id = p.id`;

function serialize(row: PlaceRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    city: row.city,
    price_level: row.price_level,
    tags: parseJsonArray(row.tags),
    description: row.description,
    website: row.website,
    phone: row.phone,
    instagram: row.instagram,
    hours: row.hours,
    icon: row.icon,
    marker_icon: row.icon ?? row.category_icon ?? 'utensils',
    tried: Boolean(row.tried),
    published: Boolean(row.published),
    category: row.category_id
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name, icon: row.category_icon, color: row.color }
      : null,
    rating: row.rating,
    review_count: row.review_count,
    cover: row.cover_id ? imageUrls(row.cover_id) : null,
    author_id: row.author_id,
    author: row.author,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

type Filters = { q?: string; category?: string; tag?: string; drafts?: boolean; mine?: number };

function findPlaces(f: Filters) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!f.drafts) where.push('p.published = 1');
  if (f.mine) {
    where.push('p.author_id = ?');
    params.push(f.mine);
  }
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
  return q.all<PlaceRow>(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.updated_at DESC`, params);
}

const listQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  drafts: z.stringbool().optional(),
  mine: z.stringbool().optional(),
});

const placeInput = z.object({
  name: z.string().trim().min(1).max(120),
  category_id: z.number().int().nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  price_level: z.number().int().min(1).max(4).nullable().optional(),
  tags: z.array(z.string().max(40)).optional(),
  description: z.string().max(5000).optional(),
  website: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  instagram: z.string().trim().max(100).optional(),
  hours: z.string().max(1000).optional(),
  icon: iconName.nullable().optional(),
  tried: z.boolean().optional(),
  published: z.boolean().optional(),
});

function buildSearch(p: { name: string; city: string; address: string; description: string; tags: string[]; category_id: number | null }) {
  const category = p.category_id ? q.get<{ name: string }>('SELECT name FROM categories WHERE id = ?', [p.category_id])?.name : '';
  return normalize([p.name, p.city, p.address, category, p.tags.join(' '), p.description].join(' '));
}

function getRow(id: number) {
  const row = q.get<PlaceRow>(`${SELECT} WHERE p.id = ?`, [id]);
  if (!row) fail(404, 'Adresse introuvable');
  return row;
}

export const places = new Hono<AuthEnv>()
  /** Compact GeoJSON for the public map: one request, cached by the browser. */
  .get('/geojson', (c) => {
    assertSectionVisible(c.get('user'), 'map');
    const features = findPlaces({}).map((p) => ({
      type: 'Feature' as const,
      id: p.id,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        city: p.city,
        category: p.category_slug,
        icon: p.icon ?? p.category_icon ?? 'utensils',
        color: p.color ?? '#D1382F',
        rating: p.rating,
        reviews: p.review_count,
        tried: Boolean(p.tried),
        price: p.price_level,
        tags: parseJsonArray(p.tags),
        thumb: p.cover_id ? imageUrls(p.cover_id).sm : null,
        search: normalize(`${p.name} ${p.city} ${p.category_name ?? ''} ${parseJsonArray(p.tags).join(' ')}`),
      },
    }));
    c.header('Cache-Control', isPrivate('map') ? 'private, no-cache' : 'public, max-age=30, stale-while-revalidate=600');
    return c.json({ type: 'FeatureCollection', features });
  })

  .get('/', validate('query', listQuery), (c) => {
    const f = c.req.valid('query');
    const user = c.get('user');
    assertSectionVisible(user, 'map');
    if ((f.drafts || f.mine) && !user) fail(401, 'Authentification requise');
    return c.json(findPlaces({ ...f, mine: f.mine ? user!.id : undefined }).map(serialize));
  })

  .get('/:idOrSlug', (c) => {
    const user = c.get('user');
    assertSectionVisible(user, 'map');
    const key = idOrSlug(c.req.param('idOrSlug'));
    const row = q.get<PlaceRow>(`${SELECT} WHERE p.${key.column} = ?`, [key.value]);
    if (!row || (!row.published && !user)) fail(404, 'Adresse introuvable');
    const reviews = q.all(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at, r.user_id, u.pseudo AS author
       FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.place_id = ? ORDER BY r.updated_at DESC`,
      [row.id],
    );
    const recipes = isLocked(user, 'recipes')
      ? []
      : q.all(
          `SELECT id, slug, title, cover_image_id FROM recipes WHERE place_id = ? AND published = 1 ORDER BY created_at DESC`,
          [row.id],
        );
    return c.json({ ...serialize(row), reviews, photos: listImages('place', row.id), recipes });
  })

  .post('/', validate('json', placeInput), (c) => {
    const user = requireUser(c);
    const body = c.req.valid('json');
    const tags = cleanTags(body.tags ?? []);
    const data = {
      name: body.name,
      city: body.city ?? '',
      address: body.address ?? '',
      description: body.description ?? '',
      tags,
      category_id: body.category_id ?? null,
    };
    const id = q.insert(
      `INSERT INTO places (slug, name, category_id, lat, lng, address, city, price_level, tags, description,
         website, phone, instagram, hours, icon, tried, published, search, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uniqueSlug('places', `${body.name} ${data.city}`),
        body.name,
        data.category_id,
        body.lat ?? 0,
        body.lng ?? 0,
        data.address,
        data.city,
        body.price_level ?? null,
        JSON.stringify(tags),
        data.description,
        body.website ?? '',
        body.phone ?? '',
        body.instagram ?? '',
        body.hours ?? '',
        body.icon ?? null,
        body.tried ? 1 : 0,
        body.published ? 1 : 0,
        buildSearch(data),
        user.id,
      ],
    );
    return c.json(serialize(getRow(id)), 201);
  })

  .patch('/:id', validate('json', placeInput.partial()), (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const body = c.req.valid('json');
    const next = {
      ...current,
      ...body,
      tags: body.tags ? cleanTags(body.tags) : parseJsonArray(current.tags),
      published: body.published === undefined ? Boolean(current.published) : body.published,
    };
    if (next.published && next.lat === 0 && next.lng === 0) fail(400, 'Placez l’adresse sur la carte avant de la publier');
    // Drafts start as "Nouvelle adresse": give them a real slug once they are named.
    const slug = current.slug.startsWith('nouvelle-adresse') && next.name !== 'Nouvelle adresse'
      ? uniqueSlug('places', `${next.name} ${next.city}`, current.id)
      : current.slug;
    q.run(
      `UPDATE places SET slug = ?, name = ?, category_id = ?, lat = ?, lng = ?, address = ?, city = ?, price_level = ?, tags = ?,
         description = ?, website = ?, phone = ?, instagram = ?, hours = ?, icon = ?, tried = ?, published = ?, search = ?, updated_at = ?
       WHERE id = ?`,
      [
        slug,
        next.name,
        next.category_id ?? null,
        next.lat,
        next.lng,
        next.address,
        next.city,
        next.price_level ?? null,
        JSON.stringify(next.tags),
        next.description,
        next.website,
        next.phone,
        next.instagram,
        next.hours,
        next.icon ?? null,
        next.tried ? 1 : 0,
        next.published ? 1 : 0,
        buildSearch({ ...next, category_id: next.category_id ?? null }),
        now(),
        current.id,
      ],
    );
    return c.json(serialize(getRow(current.id)));
  })

  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const current = getRow(parseId(c.req.param('id')));
    assertCanEdit(user, current.author_id);
    const imageIds = q.all<{ id: string }>("SELECT id FROM images WHERE kind = 'place' AND owner_id = ?", [current.id]);
    tx(() => {
      q.run("DELETE FROM images WHERE kind = 'place' AND owner_id = ?", [current.id]);
      q.run('DELETE FROM places WHERE id = ?', [current.id]);
    });
    await Promise.all(imageIds.map((i) => removeImageFiles(i.id)));
    return c.json({ ok: true });
  })

  /** Any member can mark a place as tried (or not), even if someone else created it. */
  .put('/:id/tried', validate('json', z.object({ tried: z.boolean() })), (c) => {
    requireUser(c);
    const place = getRow(parseId(c.req.param('id')));
    q.run('UPDATE places SET tried = ?, updated_at = ? WHERE id = ?', [c.req.valid('json').tried ? 1 : 0, now(), place.id]);
    return c.json(serialize(getRow(place.id)));
  })

  /** Each member has at most one review per place; PUT creates or replaces it. */
  .put(
    '/:id/review',
    validate(
      'json',
      z.object({
        rating: z.number().min(1).max(10).multipleOf(0.5),
        comment: z.string().max(5000).default(''),
      }),
    ),
    (c) => {
      const user = requireUser(c);
      const place = getRow(parseId(c.req.param('id')));
      const { rating, comment } = c.req.valid('json');
      q.run(
        `INSERT INTO reviews (place_id, user_id, rating, comment) VALUES (?, ?, ?, ?)
         ON CONFLICT (place_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = unixepoch()`,
        [place.id, user.id, rating, comment],
      );
      // Reviewing a place means someone has been there.
      q.run('UPDATE places SET tried = 1, updated_at = ? WHERE id = ?', [now(), place.id]);
      return c.json(serialize(getRow(place.id)));
    },
  )

  .delete('/:id/review', (c) => {
    const user = requireUser(c);
    const placeId = parseId(c.req.param('id'));
    const userId = user.role === 'admin' && c.req.query('user_id') ? Number(c.req.query('user_id')) : user.id;
    q.run('DELETE FROM reviews WHERE place_id = ? AND user_id = ?', [placeId, userId]);
    return c.json({ ok: true });
  });
