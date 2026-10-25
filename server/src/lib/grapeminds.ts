import { fail } from './http.ts';
import { deleteSecret, getSecret, setSecret } from './secrets.ts';

/**
 * Optional GrapeMinds wine database (https://grapeminds.eu/fr/developpeur/points-acces).
 * Used only to prefill a cellar entry: data is copied once, never fetched when pages are displayed.
 */
const BASE = 'https://api.grapeminds.eu/public/v1';
const KEY = 'grapeminds_api_key';
const USAGE = 'grapeminds_usage';
/** Monthly quota of the free plan, shown next to the counter. */
export const GRAPEMINDS_FREE_QUOTA = 250;

export const WINE_TYPES = ['red', 'white', 'rose', 'sparkling', 'sweet', 'spirit', 'beer', 'other'] as const;
export type WineType = (typeof WINE_TYPES)[number];

export function grapemindsConfigured(): boolean {
  return Boolean(getSecret(KEY));
}

export function setGrapemindsKey(key: string | null) {
  if (key) setSecret(KEY, key);
  else deleteSecret(KEY);
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function grapemindsUsage() {
  let usage = { month: currentMonth(), count: 0 };
  try {
    const stored = JSON.parse(getSecret(USAGE) ?? 'null') as typeof usage | null;
    if (stored?.month === usage.month) usage = stored;
  } catch {}
  return { ...usage, limit: GRAPEMINDS_FREE_QUOTA };
}

function countCall() {
  const { month, count } = grapemindsUsage();
  setSecret(USAGE, JSON.stringify({ month, count: count + 1 }));
}

async function call<T>(path: string, apiKey = getSecret(KEY)): Promise<T> {
  if (!apiKey) fail(404, 'Connexion GrapeMinds non configurée');
  countCall();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Accept-Language': 'fr' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    fail(502, 'GrapeMinds ne répond pas, réessayez plus tard');
  }
  if (res.status === 401 || res.status === 403) fail(502, 'Clé GrapeMinds refusée : vérifiez-la dans les paramètres');
  if (res.status === 429) fail(429, 'Quota GrapeMinds atteint pour ce mois-ci');
  if (res.status === 404) fail(404, 'Vin introuvable sur GrapeMinds');
  if (!res.ok) fail(502, `GrapeMinds a répondu une erreur (${res.status})`);
  return (await res.json()) as T;
}

/** Checks a key (the one given, or the stored one) with the free /ping endpoint. */
export async function pingGrapeminds(apiKey?: string) {
  await call('/ping', apiKey);
}

type Named = { name?: string; title?: string; display_name?: string };
type SearchHit = Named & { id: string | number; color?: string; producer_name?: string; producer_display_name?: string };
type WineDetail = Named & {
  id: string | number;
  color?: string;
  type?: string;
  sub_type?: string;
  producer?: Named;
  region?: { name?: string; country?: string };
  grapes?: { name?: string }[];
};

const label = (n?: Named) => n?.display_name || n?.title || n?.name || '';

function countryName(code?: string) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function wineType(w: { color?: string; type?: string; sub_type?: string }): WineType | null {
  const text = [w.type, w.sub_type, w.color].filter(Boolean).join(' ').toLowerCase();
  if (/sparkling|mousseux|champagne|cr[eé]mant|schaum|sekt/.test(text)) return 'sparkling';
  if (/sweet|dessert|liquoreux|moelleux|fortified/.test(text)) return 'sweet';
  if (/spirit|spiritueux/.test(text)) return 'spirit';
  if (/red|rouge|rot/.test(text)) return 'red';
  if (/white|blanc|weiss/.test(text)) return 'white';
  if (/ros[eé]/.test(text)) return 'rose';
  return text ? 'other' : null;
}

/** "Producer, Wine" display names become "Wine" once the producer goes to the brand field. */
function wineName(displayName: string, producer: string) {
  return producer && displayName.startsWith(`${producer}, `) ? displayName.slice(producer.length + 2) : displayName;
}

export async function searchWines(query: string) {
  const res = await call<{ data?: SearchHit[] }>(`/wines/search?q=${encodeURIComponent(query)}&limit=10`);
  return (res.data ?? []).map((w) => {
    const producer = w.producer_display_name || w.producer_name || '';
    return {
      grapeminds_id: String(w.id),
      name: wineName(label(w), producer),
      producer,
      wine_type: wineType(w),
    };
  });
}

/** Years found in a drinking-period response, whatever its exact shape. */
function drinkingWindow(value: unknown): { drink_from: number | null; drink_until: number | null } {
  const years: { key: string; year: number }[] = [];
  const walk = (v: unknown, key = '') => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === 'number' || (typeof v === 'string' && /^\d{4}$/.test(v))) {
      const year = Number(v);
      if (year >= 1900 && year <= 2200) years.push({ key: key.toLowerCase(), year });
    }
  };
  walk(value);
  const from = years.find((y) => /from|start|begin|min/.test(y.key))?.year ?? null;
  const until = years.find((y) => /until|to$|end|max/.test(y.key))?.year ?? null;
  return { drink_from: from, drink_until: until };
}

/** Factual fields only (no description text), ready to prefill the cellar form. */
export async function wineDetail(id: string) {
  const res = await call<{ data?: WineDetail } & WineDetail>(`/wines/${encodeURIComponent(id)}`);
  const w = res.data ?? res;
  const producer = label(w.producer);
  let window: ReturnType<typeof drinkingWindow> = { drink_from: null, drink_until: null };
  try {
    window = drinkingWindow(await call(`/drinking-periods/${encodeURIComponent(id)}?lang=fr`));
  } catch {
    // The drinking period is optional: the rest of the sheet is still useful.
  }
  return {
    grapeminds_id: String(w.id ?? id),
    name: wineName(label(w), producer),
    brand: producer,
    wine_type: wineType(w),
    region: w.region?.name ?? '',
    country: countryName(w.region?.country),
    grape: (w.grapes ?? []).map((g) => g.name).filter(Boolean).join(', '),
    ...window,
  };
}
