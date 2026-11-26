// Default content (recipes, places, photos credited to their Wikimedia Commons authors).
// Idempotent: existing recipes are skipped and existing places are only completed, never overwritten.
// Usage: npm run seed -w server   (also runs automatically on first boot when the database has no content)
import fs from 'node:fs/promises';
import path from 'node:path';
import { q } from './db.ts';
import { uniqueSlug } from './lib/content.ts';
import { processImage } from './lib/images.ts';
import { normalize } from './lib/text.ts';

type SeedImage = { file: string; alt: string; credit: string };
type SeedPlace = {
  match: string;
  name: string;
  category: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  price_level: number;
  tags: string[];
  description: string;
  website: string;
  images: SeedImage[];
};
type SeedRecipe = {
  title: string;
  description: string;
  category: string | null;
  tags: string[];
  ingredients: { qty: string; name: string }[];
  body: string;
};
type SeedData = {
  categories: { slug: string; name: string; icon: string; color: string }[];
  places: SeedPlace[];
  recipes: SeedRecipe[];
  recipeImages: Record<string, SeedImage[]>;
};

const seedDir = path.join(import.meta.dirname, '../seed');

async function addImages(kind: 'place' | 'recipe', ownerId: number, userId: number, images: SeedImage[]) {
  const ids: string[] = [];
  for (const image of images) {
    const exists = q.get<{ id: string }>('SELECT id FROM images WHERE kind = ? AND owner_id = ? AND credit = ?', [kind, ownerId, image.credit]);
    if (exists) {
      ids.push(exists.id);
      continue;
    }
    const processed = await processImage(await fs.readFile(path.join(seedDir, 'images', image.file)));
    const position = q.get<{ p: number }>('SELECT coalesce(max(position), -1) + 1 AS p FROM images WHERE kind = ? AND owner_id = ?', [kind, ownerId])!.p;
    q.run(
      'INSERT INTO images (id, kind, owner_id, user_id, width, height, alt, position, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [processed.id, kind, ownerId, userId, processed.width, processed.height, image.alt, position, image.credit],
    );
    ids.push(processed.id);
  }
  return ids;
}

const categoryId = (slug: string | null) =>
  slug ? (q.get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [slug])?.id ?? null) : null;

export async function seed(log = console.log) {
  const admin = q.get<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (!admin) {
    log('[seed] no admin account yet, skipping');
    return;
  }
  const data: SeedData = JSON.parse(await fs.readFile(path.join(seedDir, 'data.json'), 'utf8'));

  for (const c of data.categories) {
    if (!q.get('SELECT 1 FROM categories WHERE slug = ?', [c.slug])) {
      const sort = q.get<{ s: number }>('SELECT coalesce(max(sort), 0) + 1 AS s FROM categories')!.s;
      // Venue types only make sense for places (see the applies_to migration).
      const appliesTo = ['restaurant', 'bistrot', 'street-food', 'cafe', 'bar'].includes(c.slug) ? 'places' : 'all';
      q.run('INSERT INTO categories (slug, name, icon, color, sort, applies_to) VALUES (?, ?, ?, ?, ?, ?)', [c.slug, c.name, c.icon, c.color, sort, appliesTo]);
      log(`[seed] category ${c.name}`);
    }
  }

  for (const p of data.places) {
    const existing = q.get<{
      id: number;
      name: string;
      category_id: number | null;
      address: string;
      description: string;
      website: string;
      price_level: number | null;
      tags: string;
      lat: number;
    }>('SELECT id, name, category_id, address, description, website, price_level, tags, lat FROM places WHERE search LIKE ?', [`%${p.match}%`]);
    let id: number;
    if (existing) {
      // Complete what is missing, keep whatever a member already wrote.
      const merged = {
        name: normalize(existing.name) === p.match ? p.name : existing.name,
        category_id: existing.category_id ?? categoryId(p.category),
        address: existing.address || p.address,
        description: existing.description.trim() || p.description,
        website: existing.website || p.website,
        price_level: existing.price_level ?? p.price_level,
        tags: existing.tags === '[]' ? JSON.stringify(p.tags) : existing.tags,
      };
      q.run(
        `UPDATE places SET name = ?, category_id = ?, address = ?, description = ?, website = ?, price_level = ?, tags = ?,
           lat = CASE WHEN lat = 0 THEN ? ELSE lat END, lng = CASE WHEN lng = 0 THEN ? ELSE lng END WHERE id = ?`,
        [merged.name, merged.category_id, merged.address, merged.description, merged.website, merged.price_level, merged.tags, p.lat, p.lng, existing.id],
      );
      if (existing.name !== merged.name && q.get("SELECT 1 FROM places WHERE id = ? AND slug LIKE 'nouvelle-adresse%'", [existing.id])) {
        q.run('UPDATE places SET slug = ? WHERE id = ?', [uniqueSlug('places', `${merged.name} ${p.city}`, existing.id), existing.id]);
      }
      id = existing.id;
      log(`[seed] completed place ${merged.name}`);
    } else {
      id = q.insert(
        `INSERT INTO places (slug, name, category_id, lat, lng, address, city, price_level, tags, description, website, published, author_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [uniqueSlug('places', `${p.name} ${p.city}`), p.name, categoryId(p.category), p.lat, p.lng, p.address, p.city, p.price_level, JSON.stringify(p.tags), p.description, p.website, admin.id],
      );
      log(`[seed] place ${p.name}`);
    }
    const row = q.get<{ name: string; city: string; address: string; description: string; tags: string; category: string | null }>(
      'SELECT p.name, p.city, p.address, p.description, p.tags, c.name AS category FROM places p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?',
      [id],
    )!;
    q.run('UPDATE places SET search = ? WHERE id = ?', [
      normalize([row.name, row.city, row.address, row.category ?? '', JSON.parse(row.tags).join(' '), row.description].join(' ')),
      id,
    ]);
    await addImages('place', id, admin.id, p.images);
  }

  for (const r of data.recipes) {
    if (q.get('SELECT 1 FROM recipes WHERE title = ?', [r.title])) continue;
    const category = categoryId(r.category);
    const categoryName = category ? q.get<{ name: string }>('SELECT name FROM categories WHERE id = ?', [category])!.name : '';
    const id = q.insert(
      `INSERT INTO recipes (slug, title, description, category_id, tags, ingredients, body, published, search, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        uniqueSlug('recipes', r.title),
        r.title,
        r.description,
        category,
        JSON.stringify(r.tags),
        JSON.stringify(r.ingredients),
        r.body,
        normalize([r.title, r.description, categoryName, r.tags.join(' '), r.ingredients.map((i) => i.name).join(' ')].join(' ')),
        admin.id,
      ],
    );
    const [cover] = await addImages('recipe', id, admin.id, data.recipeImages[r.title] ?? []);
    if (cover) q.run('UPDATE recipes SET cover_image_id = ? WHERE id = ?', [cover, id]);
    log(`[seed] recipe ${r.title}`);
  }
}

/** Seeds a brand-new instance so the map and recipes are not empty on first visit. */
export async function seedIfEmpty() {
  if (process.env.SEED_ON_EMPTY === 'false') return;
  const empty = q.get<{ n: number }>('SELECT (SELECT count(*) FROM places) + (SELECT count(*) FROM recipes) AS n')!.n === 0;
  if (empty) await seed();
}

if (import.meta.main) await seed();
