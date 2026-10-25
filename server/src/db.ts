import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './config.ts';

fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

type Params = Record<string, SQLInputValue> | SQLInputValue[];

const cache = new Map<string, ReturnType<DatabaseSync['prepare']>>();
function stmt(sql: string) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

function run(sql: string, params: Params = []) {
  return Array.isArray(params) ? stmt(sql).run(...params) : stmt(sql).run(params);
}

export const q = {
  all<T>(sql: string, params: Params = []): T[] {
    return (Array.isArray(params) ? stmt(sql).all(...params) : stmt(sql).all(params)) as T[];
  },
  get<T>(sql: string, params: Params = []): T | undefined {
    return (Array.isArray(params) ? stmt(sql).get(...params) : stmt(sql).get(params)) as T | undefined;
  },
  run,
  insert(sql: string, params: Params = []): number {
    return Number(run(sql, params).lastInsertRowid);
  },
};

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const migrations: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    password_hash TEXT,
    invite_token_hash TEXT,
    invite_expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '📍',
    color TEXT NOT NULL DEFAULT '#e4572e',
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    lat REAL NOT NULL DEFAULT 0,
    lng REAL NOT NULL DEFAULT 0,
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    price_level INTEGER CHECK (price_level BETWEEN 1 AND 4),
    tags TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    instagram TEXT NOT NULL DEFAULT '',
    hours TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    search TEXT NOT NULL DEFAULT '',
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX places_published ON places(published);

  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating REAL NOT NULL CHECK (rating BETWEEN 0 AND 10),
    comment TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (place_id, user_id)
  );

  CREATE TABLE recipes (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    ingredients TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL DEFAULT '',
    cover_image_id TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    search TEXT NOT NULL DEFAULT '',
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX recipes_published ON recipes(published, created_at DESC);

  CREATE TABLE images (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('place', 'recipe')),
    owner_id INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    in_gallery INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX images_owner ON images(kind, owner_id, position);

  INSERT INTO categories (slug, name, emoji, color, sort) VALUES
    ('restaurant', 'Restaurant', '🍽️', '#e4572e', 1),
    ('bistrot', 'Bistrot', '🍷', '#a23b72', 2),
    ('street-food', 'Street food', '🌯', '#f18f01', 3),
    ('boulangerie', 'Boulangerie', '🥐', '#c99a4b', 4),
    ('cafe', 'Café', '☕', '#6b4f3a', 5),
    ('bar', 'Bar', '🍸', '#2e86ab', 6),
    ('dessert', 'Dessert', '🍰', '#e86a92', 7),
    ('epicerie', 'Épicerie', '🧺', '#3b8b5a', 8);
  `,
  // Monochrome icons instead of emoji, a 12-colour palette, and a per-place marker icon.
  `
  ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'utensils';
  UPDATE categories SET
    icon = CASE slug
      WHEN 'bistrot' THEN 'wine' WHEN 'street-food' THEN 'sandwich' WHEN 'boulangerie' THEN 'croissant'
      WHEN 'cafe' THEN 'coffee' WHEN 'bar' THEN 'martini' WHEN 'dessert' THEN 'cake-slice'
      WHEN 'epicerie' THEN 'shopping-basket' ELSE 'utensils' END,
    color = CASE slug
      WHEN 'restaurant' THEN '#D1382F' WHEN 'bistrot' THEN '#B5487A' WHEN 'street-food' THEN '#E07A2E'
      WHEN 'boulangerie' THEN '#D9A21B' WHEN 'cafe' THEN '#8B5A3C' WHEN 'bar' THEN '#2F6FA8'
      WHEN 'dessert' THEN '#7A4AA0' WHEN 'epicerie' THEN '#3E8E5A' ELSE color END;
  ALTER TABLE categories DROP COLUMN emoji;
  ALTER TABLE places ADD COLUMN icon TEXT;
  `,
  // Categories can be hidden from the public map rail.
  `ALTER TABLE categories ADD COLUMN published INTEGER NOT NULL DEFAULT 1;`,
  // "Already tried" flag on places, and a free-text credit for photos not taken by a member.
  `
  ALTER TABLE places ADD COLUMN tried INTEGER NOT NULL DEFAULT 0;
  UPDATE places SET tried = 1 WHERE id IN (SELECT place_id FROM reviews);
  ALTER TABLE images ADD COLUMN credit TEXT;
  `,
  // Bistrots get the beer icon (only if still on the original default).
  `UPDATE categories SET icon = 'beer' WHERE slug = 'bistrot' AND icon = 'wine';`,
  // App settings (key/value) and the weekly meal plan: one row per recipe in a (date, meal) slot.
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO settings (key, value) VALUES ('planning_enabled', 'true');
  CREATE TABLE meal_plan (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','dinner')),
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX meal_plan_date ON meal_plan(date, meal, position);
  `,
  // The setting only hides the public side of the planning: members always keep it in the back-office.
  `UPDATE settings SET key = 'planning_public' WHERE key = 'planning_enabled';`,
  // Personal API keys for scripts, the mobile app and the MCP server (Bearer), with an optional expiry.
  `
  CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    expires_at INTEGER,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX api_keys_user ON api_keys(user_id);
  `,
  // Each section (map, recipes, planning) can be reserved to signed-in members; a hidden planning becomes private.
  `
  INSERT INTO settings (key, value)
    SELECT 'planning_private', CASE value WHEN 'false' THEN 'true' ELSE 'false' END FROM settings WHERE key = 'planning_public';
  DELETE FROM settings WHERE key = 'planning_public';
  `,
  // Recommended products (pantry) and the wine cellar share one table with a household stock;
  // recipes link to products (recommended products, food and wine pairings); images accept products;
  // secrets holds integration keys, never exported nor exposed by GET /api/settings.
  `
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('pantry', 'wine')),
    name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    store TEXT NOT NULL DEFAULT '',
    price_cents INTEGER,
    barcode TEXT,
    cover_image_id TEXT,
    wine_type TEXT,
    vintage INTEGER,
    appellation TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    grape TEXT NOT NULL DEFAULT '',
    abv REAL,
    drink_from INTEGER,
    drink_until INTEGER,
    purchase_price_cents INTEGER,
    location TEXT NOT NULL DEFAULT '',
    grapeminds_id TEXT,
    search TEXT NOT NULL DEFAULT '',
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX products_kind ON products(kind, quantity);
  CREATE INDEX products_barcode ON products(barcode);

  CREATE TABLE recipe_products (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_id, product_id)
  );
  CREATE INDEX recipe_products_product ON recipe_products(product_id);

  CREATE TABLE images_next (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('place', 'recipe', 'product')),
    owner_id INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    in_gallery INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    credit TEXT
  );
  INSERT INTO images_next (id, kind, owner_id, user_id, width, height, alt, position, in_gallery, created_at, credit)
    SELECT id, kind, owner_id, user_id, width, height, alt, position, in_gallery, created_at, credit FROM images;
  DROP TABLE images;
  ALTER TABLE images_next RENAME TO images;
  CREATE INDEX images_owner ON images(kind, owner_id, position);

  CREATE TABLE secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
];

export const SCHEMA_VERSION = migrations.length;

export function schemaVersion(target: DatabaseSync): number {
  const table = target.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations'`).get();
  if (!table) return 0;
  return Number((target.prepare('SELECT max(version) AS v FROM _migrations').get() as { v: number | null }).v ?? 0);
}

/** Brings any database up to date: the live one at startup, or a backup being restored. */
export function migrate(target: DatabaseSync = db) {
  target.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)');
  for (let i = schemaVersion(target); i < migrations.length; i++) {
    target.exec('BEGIN');
    try {
      target.exec(migrations[i]);
      target.prepare('INSERT INTO _migrations (version) VALUES (?)').run(i + 1);
      target.exec('COMMIT');
    } catch (err) {
      target.exec('ROLLBACK');
      throw err;
    }
  }
}

migrate();
