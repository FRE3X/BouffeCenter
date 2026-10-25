import type { Product, ProductKind, WineType } from './types';

/** What a lookup can prefill. `image_url` is an Open Food Facts photo to import once the product exists. */
export type Prefill = {
  name?: string;
  brand?: string;
  barcode?: string | null;
  image_url?: string | null;
  wine_type?: WineType | null;
  region?: string;
  country?: string;
  grape?: string;
  drink_from?: number | null;
  drink_until?: number | null;
  grapeminds_id?: string | null;
};
/** A scanned or searched product that is already recorded. */
export type Existing = { id: number; slug: string; kind: ProductKind };

/** Public URL of a product: pantry products under /produits, wines under /cave. */
export const productHref = (p: { kind: ProductKind; slug: string }) => `${p.kind === 'wine' ? '/cave' : '/produits'}/${p.slug}`;

export const WINE_TYPE_LABELS: Record<WineType, string> = {
  red: 'Rouge',
  white: 'Blanc',
  rose: 'Rosé',
  sparkling: 'Effervescent',
  sweet: 'Liquoreux',
  spirit: 'Spiritueux',
  beer: 'Bière',
  other: 'Autre',
};

/** One-line summary under the name: brand, or for wines type · vintage · appellation/region. */
export function productSubtitle(p: Product) {
  if (p.kind !== 'wine') return p.brand;
  return [p.brand, p.wine_type ? WINE_TYPE_LABELS[p.wine_type] : '', p.vintage ?? '', p.appellation || p.region]
    .filter(Boolean)
    .join(' · ');
}

/** "À boire 2024 – 2030", "À boire dès 2026"… */
export function drinkWindow(p: Pick<Product, 'drink_from' | 'drink_until'>) {
  if (p.drink_from && p.drink_until) return `${p.drink_from} – ${p.drink_until}`;
  if (p.drink_from) return `dès ${p.drink_from}`;
  if (p.drink_until) return `jusqu'en ${p.drink_until}`;
  return '';
}

/**
 * Shared household stock: optimistic updates, rapid clicks merged into one request per product.
 * `onChange` receives the server's quantity; `onError` the unsaved delta, to roll the display back.
 */
const pending = new Map<number, { delta: number; timer: ReturnType<typeof setTimeout> }>();

export function changeStock(id: number, delta: number, onChange: (quantity: number) => void, onError?: (delta: number) => void) {
  const entry = pending.get(id) ?? { delta: 0, timer: undefined as unknown as ReturnType<typeof setTimeout> };
  clearTimeout(entry.timer);
  entry.delta += delta;
  entry.timer = setTimeout(async () => {
    pending.delete(id);
    try {
      const res = await fetch(`/api/products/${id}/stock`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delta: entry.delta }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Another burst of clicks may have started meanwhile: its own response will settle the value.
      if (!pending.has(id)) onChange((await res.json()).quantity);
    } catch {
      onError?.(entry.delta);
    }
  }, 400);
  pending.set(id, entry);
}
