import type { Photo } from '../lib/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body instanceof FormData || body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, typeof data.error === 'string' ? data.error : `Erreur ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = { ok: true }>(path: string) => request<T>('DELETE', path),
  upload(file: File, kind: 'place' | 'recipe' | 'product', ownerId: number, inGallery = true) {
    const form = new FormData();
    form.set('file', file);
    form.set('kind', kind);
    form.set('owner_id', String(ownerId));
    form.set('in_gallery', String(inGallery));
    return request<Photo>('POST', '/images', form);
  },
};

export function navigate(path: string) {
  location.hash = `#${path}`;
}

/** Tiny toast helper shared across admin views. */
export const toast = $state({ message: '', kind: 'ok' as 'ok' | 'error', at: 0 });
export function notify(message: string, kind: 'ok' | 'error' = 'ok') {
  toast.message = message;
  toast.kind = kind;
  toast.at = Date.now();
}
