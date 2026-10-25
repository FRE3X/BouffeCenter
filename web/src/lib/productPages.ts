import type { AstroGlobal } from 'astro';
import { publicCache, sectionAccess, serverApi, siteSettings } from './api';
import type { ProductDetail, ProductKind, ProductList } from './types';

export const sectionOf = (kind: ProductKind) => (kind === 'wine' ? 'cellar' : 'products');

/**
 * Data of /produits and /cave. `null` means the section is switched off (404);
 * `{ locked: true }` means it is private and the visitor is not signed in.
 */
export async function loadProductList(Astro: AstroGlobal, kind: ProductKind) {
  const tag = Astro.url.searchParams.get('tag');
  const q = Astro.url.searchParams.get('q') ?? '';
  const params = new URLSearchParams({ kind, limit: '60' });
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  const settings = await siteSettings(Astro);
  const access = await sectionAccess(Astro, sectionOf(kind));
  const data = await Promise.all([
    serverApi<ProductList>(`/products?${params}`, access),
    serverApi<{ tag: string; count: number }[]>(`/tags?kind=${kind === 'wine' ? 'wine' : 'product'}`, access),
  ]).catch((e) => {
    if (access.locked(e)) return null;
    throw e;
  });
  if (data && !data[0]) return null;
  publicCache(Astro, access.isPrivate, 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  return {
    locked: !data,
    list: data?.[0] ?? null,
    tags: data?.[1] ?? [],
    tag,
    grapeminds: kind === 'wine' && Boolean(settings?.grapeminds_enabled),
  };
}

/** Data of a product or wine page; `null` means not found (or wrong section, or section switched off). */
export async function loadProduct(Astro: AstroGlobal, kind: ProductKind, slug: string) {
  const access = await sectionAccess(Astro, sectionOf(kind));
  let locked = false;
  const product = await serverApi<ProductDetail>(`/products/${encodeURIComponent(slug)}`, access).catch((e) => {
    if (!access.locked(e)) throw e;
    locked = true;
    return null;
  });
  if (!locked && (!product || product.kind !== kind)) return null;
  publicCache(Astro, access.isPrivate, 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
  return { locked, product };
}
