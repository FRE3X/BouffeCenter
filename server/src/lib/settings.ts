import { q } from '../db.ts';
import type { User } from './auth.ts';
import { fail } from './http.ts';

export type Settings = {
  map_private: boolean;
  recipes_private: boolean;
  planning_private: boolean;
  products_private: boolean;
  cellar_private: boolean;
  products_enabled: boolean;
  cellar_enabled: boolean;
};
export type Section = 'map' | 'recipes' | 'planning' | 'products' | 'cellar';

const DEFAULTS: Settings = {
  map_private: false,
  recipes_private: false,
  planning_private: false,
  products_private: false,
  cellar_private: false,
  products_enabled: true,
  cellar_enabled: true,
};

/** Settings are stored as JSON strings in a key/value table; unknown keys are ignored. */
export function getSettings(): Settings {
  const settings = { ...DEFAULTS };
  for (const row of q.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    if (!(row.key in settings)) continue;
    try {
      (settings as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {}
  }
  return settings;
}

export function setSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      JSON.stringify(value),
    ]);
  }
}

export function isPrivate(section: Section): boolean {
  return getSettings()[`${section}_private`];
}

/** Optional sections (products, cellar) can be switched off; the others always exist. */
export function isEnabled(section: Section): boolean {
  const settings = getSettings();
  return section === 'products' || section === 'cellar' ? settings[`${section}_enabled`] : true;
}

/** A private or disabled section is closed to anonymous visitors (sessions and API keys both count as members). */
export function isLocked(user: User | null, section: Section): boolean {
  return !user && (isPrivate(section) || !isEnabled(section));
}

export function assertSectionVisible(user: User | null, section: Section) {
  if (user) return;
  if (!isEnabled(section)) fail(404, 'Section désactivée');
  if (isPrivate(section)) fail(401, 'Section réservée aux membres');
}
