import { config } from '../config.ts';
import { fail } from './http.ts';

/** Open Food Facts (open database, ODbL; images CC BY-SA): lookup by barcode or name to prefill a product. */
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,brands,image_front_url,quantity';
const HEADERS = { 'User-Agent': 'bouffe-center/1.0 (self-hosted)', Accept: 'application/json' };
/** Product photos may only be imported from these hosts. */
const IMAGE_HOSTS = new Set(['images.openfoodfacts.org', 'static.openfoodfacts.org']);
export const OFF_CREDIT = 'Open Food Facts (CC BY-SA)';

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string | string[];
  image_front_url?: string;
  quantity?: string;
};

function serialize(p: OffProduct) {
  return {
    barcode: p.code ?? null,
    name: (p.product_name_fr || p.product_name || '').trim(),
    brand: (Array.isArray(p.brands) ? p.brands[0] ?? '' : (p.brands ?? '').split(',')[0]).trim(),
    size: (p.quantity ?? '').trim(),
    image_url: p.image_front_url ?? null,
  };
}

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  } catch {
    fail(502, 'Open Food Facts ne répond pas, réessayez plus tard');
  }
  if (res.status === 404) return {} as T;
  if (!res.ok) fail(502, `Open Food Facts a répondu une erreur (${res.status})`);
  return (await res.json()) as T;
}

export async function offByBarcode(barcode: string) {
  const res = await get<{ status?: number; product?: OffProduct }>(`${BASE}/api/v2/product/${barcode}.json?fields=${FIELDS}`);
  return res.status === 1 && res.product ? [serialize({ code: barcode, ...res.product })] : [];
}

/** Search-a-licious is the fast search engine; the legacy search (often overloaded) is the fallback. */
export async function offSearch(query: string) {
  try {
    const params = new URLSearchParams({ q: query, page_size: '12', langs: 'fr', fields: FIELDS });
    const res = await get<{ hits?: OffProduct[] }>(`https://search.openfoodfacts.org/search?${params}`);
    const items = (res.hits ?? []).map(serialize).filter((p) => p.name);
    if (items.length) return items;
  } catch {}
  return offLegacySearch(query);
}

async function offLegacySearch(query: string) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '12',
    lc: 'fr',
    fields: FIELDS,
  });
  const res = await get<{ products?: OffProduct[] }>(`${BASE}/cgi/search.pl?${params}`);
  return (res.products ?? []).map(serialize).filter((p) => p.name);
}

/** Downloads an Open Food Facts product photo (allowed hosts only, size-capped). */
export async function offImage(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(400, 'Adresse d’image invalide');
  }
  if (parsed.protocol !== 'https:' || !IMAGE_HOSTS.has(parsed.hostname)) fail(400, 'Seules les images Open Food Facts sont acceptées');
  let res: Response;
  try {
    res = await fetch(parsed, { headers: HEADERS, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  } catch {
    fail(502, 'Image Open Food Facts indisponible');
  }
  if (!res.ok) fail(502, 'Image Open Food Facts indisponible');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > config.maxUploadBytes) fail(413, 'Image trop lourde');
  return buffer;
}
