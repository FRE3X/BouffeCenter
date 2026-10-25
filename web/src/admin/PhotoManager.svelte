<script lang="ts">
  import type { Photo, User } from '../lib/types';
  import { icon } from '../lib/icons';
  import { api, notify } from './client.svelte';
  import { prepareImage } from './resize';

  let {
    kind,
    ownerId,
    user,
    photos = $bindable([]),
    coverId = $bindable(undefined),
  }: { kind: 'place' | 'recipe' | 'product'; ownerId: number; user: User; photos: Photo[]; coverId?: string | null } = $props();

  let uploading = $state(0);
  let dragging = $state(false);

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    uploading += list.length;
    for (const file of list) {
      try {
        const photo = await api.upload(await prepareImage(file), kind, ownerId);
        photos = [...photos, photo];
      } catch (e) {
        notify(`${file.name} : ${(e as Error).message}`, 'error');
      } finally {
        uploading--;
      }
    }
  }

  const canEdit = (p: Photo) => user.role === 'admin' || p.user_id === user.id;

  async function remove(photo: Photo) {
    if (!confirm('Supprimer cette photo ?')) return;
    await api.del(`/images/${photo.id}`);
    photos = photos.filter((p) => p.id !== photo.id);
    if (coverId === photo.id) coverId = null;
  }

  async function move(index: number, delta: number) {
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    photos = next;
    await api.post('/images/reorder', { ids: next.map((p) => p.id) });
  }

  async function saveAlt(photo: Photo, alt: string) {
    if (alt === photo.alt) return;
    await api.patch(`/images/${photo.id}`, { alt });
    photo.alt = alt;
  }
</script>

<div
  class="drop"
  class:dragging
  role="region"
  aria-label="Photos"
  ondragover={(e) => (e.preventDefault(), (dragging = true))}
  ondragleave={() => (dragging = false)}
  ondrop={(e) => {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files) upload(e.dataTransfer.files);
  }}
>
  <label class="btn">
    {@html icon('camera', 16)} Ajouter des photos
    <input type="file" accept="image/*" multiple hidden onchange={(e) => upload(e.currentTarget.files ?? [])} />
  </label>
  <span class="muted">ou glisse-les ici · créditées à <strong>{user.pseudo}</strong></span>
  {#if uploading}<span class="muted">⏳ {uploading} en cours…</span>{/if}
</div>

{#if photos.length}
  <ul class="photos">
    {#each photos as photo, i (photo.id)}
      <li class:cover={coverId === photo.id}>
        <img src={photo.urls.sm} alt={photo.alt} loading="lazy" />
        <div class="meta">
          <small class="inline-icon">{@html icon('camera', 12)}{photo.author ?? '?'}</small>
          {#if canEdit(photo)}
            <input placeholder="Légende" value={photo.alt} onchange={(e) => saveAlt(photo, e.currentTarget.value)} />
          {:else if photo.alt}
            <small>{photo.alt}</small>
          {/if}
          <div class="actions">
            <button type="button" class="btn small" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Avancer">←</button>
            <button type="button" class="btn small" disabled={i === photos.length - 1} onclick={() => move(i, 1)} aria-label="Reculer">→</button>
            {#if coverId !== undefined}
              <button type="button" class="btn small" onclick={() => (coverId = coverId === photo.id ? null : photo.id)}>
                {coverId === photo.id ? '★ Couverture' : '☆'}
              </button>
            {/if}
            {#if canEdit(photo)}<button type="button" class="btn small danger" onclick={() => remove(photo)}>Suppr.</button>{/if}
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .drop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 14px;
    border: 2px dashed var(--line);
    border-radius: 12px;
    font-size: 0.9rem;
  }
  .drop.dragging {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .photos {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  li {
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg);
  }
  li.cover {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
  }
  .meta input {
    padding: 5px 8px !important;
    font-size: 0.82rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .actions .btn {
    padding: 3px 9px;
  }
</style>
