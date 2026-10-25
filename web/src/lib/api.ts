/**
 * Server-side API access for Astro pages. In production the Hono app runs in the same
 * process and exposes its fetch handler globally, so pages skip the network entirely.
 */
import type { AstroGlobal } from 'astro';
import type { Section, Settings } from './types';

type FetchHandler = (req: Request) => Response | Promise<Response>;

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`API ${path} → ${status}`);
  }
}

/** `cookie` forwards the visitor's session: only for private sections, whose pages are never cached publicly. */
export async function serverApi<T>(path: string, opts: { cookie?: string | null } = {}): Promise<T | null> {
  const inProcess = (globalThis as { __bouffeCenterFetch?: FetchHandler }).__bouffeCenterFetch;
  const url = `${API_URL}/api${path}`;
  const init: RequestInit = opts.cookie ? { headers: { cookie: opts.cookie } } : {};
  const res = inProcess ? await inProcess(new Request(url, init)) : await fetch(url, init);
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}

/** Site settings, fetched once per request (pages and the layout share them). */
export function siteSettings(Astro: AstroGlobal): Promise<Settings | null> {
  const locals = Astro.locals as { settings?: Promise<Settings | null> };
  return (locals.settings ??= serverApi<Settings>('/settings').catch(() => null));
}

/**
 * Access to a section for this request. A private section forwards the visitor's cookie and is never cached
 * publicly; `locked()` tells whether an API error means "members only".
 */
export async function sectionAccess(Astro: AstroGlobal, section: Section) {
  const settings = await siteSettings(Astro);
  const isPrivate = settings?.[`${section}_private`] ?? false;
  if (isPrivate) Astro.response.headers.set('Cache-Control', 'private, no-store');
  return {
    isPrivate,
    cookie: isPrivate ? Astro.request.headers.get('cookie') : null,
    locked: (e: unknown) => e instanceof ApiError && e.status === 401,
  };
}

/** Sets the public cache header, unless the section is private. */
export function publicCache(Astro: AstroGlobal, isPrivate: boolean, value: string) {
  if (!isPrivate) Astro.response.headers.set('Cache-Control', value);
}
