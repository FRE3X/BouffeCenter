<script lang="ts">
  import { untrack } from 'svelte';
  import type { PlaceDetail } from '../lib/types';
  import { date, price, rating, ratingColor } from '../lib/format';
  import { icon, iconBadge, triedBadge } from '../lib/icons';
  import { isMember, onMember } from '../lib/member';

  let member = $state(isMember());
  onMember(() => (member = true));
  import Lightbox from './Lightbox.svelte';

  let {
    slug,
    onclose,
    onfilter,
    ontried,
    tried,
  }: {
    slug: string;
    onclose: () => void;
    onfilter?: (category: string) => void;
    /** Present for members: marks the place as tried / not tried. */
    ontried?: (id: number, tried: boolean) => Promise<boolean>;
    /** "Tried" state owned by the map, so the panel and the marker can never disagree. */
    tried?: boolean;
  } = $props();

  const isTried = $derived(tried ?? place?.tried ?? false);

  let place = $state.raw<PlaceDetail | null>(null);
  let error = $state(false);
  let photoIndex = $state<number | null>(null);
  const cache = new Map<string, PlaceDetail>();

  $effect(() => {
    const current = slug;
    const cached = cache.get(current);
    untrack(() => {
      error = false;
      place = cached ?? null;
    });
    if (cached) return;
    fetch(`/api/places/${encodeURIComponent(current)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PlaceDetail) => {
        cache.set(current, data);
        if (slug === current) place = data;
      })
      .catch(() => (error = true));
  });

  async function toggleTried() {
    if (place && ontried) await ontried(place.id, !isTried);
  }

  const website = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
  const instagram = (handle: string) =>
    /^https?:\/\//.test(handle) ? handle : `https://instagram.com/${handle.replace(/^@/, '')}`;
  const directions = (p: PlaceDetail) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && photoIndex === null && onclose()} />

<aside class="panel" aria-label="Détail de l'adresse">
  <button class="close" aria-label="Fermer" onclick={onclose}>✕</button>
  {#if error}
    <p class="state">Impossible de charger cette adresse.</p>
  {:else if !place}
    <div class="skeleton"></div>
  {:else}
    {#if place.photos.length}
      <div class="photos">
        {#each place.photos as photo, i (photo.id)}
          <button class="photo" onclick={() => (photoIndex = i)}>
            <img src={photo.urls.sm} alt={photo.alt || place.name} width={photo.width} height={photo.height} loading={i < 2 ? 'eager' : 'lazy'} />
            {#if photo.author}<span class="credit inline-icon">{@html icon('camera', 13)}{photo.author}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="body">
      <header>
        <div class="title">
          <h2>{place.name}</h2>
          <p class="meta">
            {#if place.category}
              <button class="cat inline-icon" title="Voir toutes les adresses de cette catégorie" onclick={() => onfilter?.(place!.category!.slug)}>
                {@html iconBadge(place.category.icon, 20)}{place.category.name}
              </button>
            {/if}
            {#if place.city}<span>{place.city}</span>{/if}
            {#if place.price_level}<span class="price">{price(place.price_level)}</span>{/if}
          </p>
          {#if ontried}
            <button class="tried tried-toggle inline-icon" class:todo={!isTried} aria-pressed={isTried} onclick={toggleTried}>
              {@html triedBadge(isTried, 24)}{isTried ? 'Déjà testé' : 'Marquer comme testé'}
            </button>
          {:else}
            <p class="tried inline-icon" class:todo={!isTried}>
              {@html triedBadge(isTried, 20)}{isTried ? 'Déjà testé' : 'Pas encore testé'}
            </p>
          {/if}
        </div>
        {#if place.rating !== null}
          <div class="score rating" style:background={ratingColor(place.rating)}>
            {rating(place.rating)}<small>/10</small>
          </div>
        {/if}
      </header>

      {#if place.tags.length}
        <div class="tags">
          {#each place.tags as tag}<span class="tag">#{tag}</span>{/each}
        </div>
      {/if}

      {#if place.description}<p class="description">{place.description}</p>{/if}

      <div class="actions">
        <a class="action primary" href={directions(place)} target="_blank" rel="noopener">Itinéraire</a>
        {#if place.website}<a class="action" href={website(place.website)} target="_blank" rel="noopener">Site web</a>{/if}
        {#if place.instagram}<a class="action" href={instagram(place.instagram)} target="_blank" rel="noopener">Instagram</a>{/if}
        {#if place.phone}<a class="action" href={`tel:${place.phone.replace(/\s/g, '')}`}>Appeler</a>{/if}
        {#if member}
          <a class="action inline-icon" href={`/admin#/adresses/${place.id}`}>{@html icon('pencil', 14)}Modifier</a>
        {/if}
      </div>

      {#if place.address || place.hours}
        <dl class="infos">
          {#if place.address}<dt>Adresse</dt><dd>{place.address}</dd>{/if}
          {#if place.hours}<dt>Horaires</dt><dd class="pre">{place.hours}</dd>{/if}
        </dl>
      {/if}

      {#if place.recipes.length}
        <h3>Recettes inspirées</h3>
        <ul class="recipes">
          {#each place.recipes as r (r.id)}
            <li><a class="inline-icon" href={`/recettes/${r.slug}`}>{@html icon('book-open', 15)}{r.title}</a></li>
          {/each}
        </ul>
      {/if}

      <h3>Avis {place.review_count ? `(${place.review_count})` : ''}</h3>
      {#each place.reviews as review (review.id)}
        <article class="review">
          <header>
            <strong>{review.author}</strong>
            <span class="rating" style:background={ratingColor(review.rating)}>{rating(review.rating)}<small>/10</small></span>
          </header>
          {#if review.comment}<p class="pre">{review.comment}</p>{/if}
          <small>{date(review.updated_at)}</small>
        </article>
      {:else}
        <p class="state">Pas encore d'avis.</p>
      {/each}
    </div>
    <Lightbox photos={place.photos} bind:index={photoIndex} />
  {/if}
</aside>

<style>
  .panel {
    position: fixed;
    z-index: 40;
    top: calc(var(--header-h) + env(safe-area-inset-top) + 12px);
    left: 12px;
    bottom: 12px;
    width: 390px;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: var(--shadow);
    animation: slide-in 0.22s ease-out;
  }
  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateX(-12px);
    }
  }
  @media (max-width: 720px) {
    .photo {
      aspect-ratio: auto;
      height: 180px;
      width: 70%;
    }
    .panel {
      top: auto;
      left: 0;
      right: 0;
      bottom: var(--tabbar-h);
      width: auto;
      max-height: 62dvh;
      border-radius: 20px 20px 0 0;
      padding-bottom: max(0px, env(safe-area-inset-bottom) - var(--tabbar-h));
      animation-name: slide-up;
    }
    @keyframes slide-up {
      from {
        transform: translateY(40%);
        opacity: 0;
      }
    }
  }
  .close {
    position: sticky;
    top: 10px;
    float: right;
    margin: 10px 10px -44px 0;
    z-index: 2;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 0;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    box-shadow: var(--shadow);
    cursor: pointer;
  }
  .skeleton {
    height: 220px;
    margin: 12px;
    border-radius: 14px;
    background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2));
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  .photos {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .photo {
    position: relative;
    flex: none;
    width: 82%;
    aspect-ratio: 4 / 3;
    padding: 0;
    border: 0;
    scroll-snap-align: start;
    cursor: zoom-in;
    background: var(--surface-2);
  }
  .photos .photo:only-child {
    width: 100%;
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .credit {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
    font-size: 0.75rem;
  }
  .body {
    padding: 16px 18px 24px;
  }
  .body > header {
    /* Leave room for the floating close button when there is no photo strip above. */
    padding-right: 40px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.6rem;
  }
  h3 {
    margin: 22px 0 10px;
    font-size: 1.1rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .cat {
    padding: 0 8px 0 0;
    border: 0;
    border-radius: 999px;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .cat:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .price {
    color: var(--ink);
    font-weight: 600;
  }
  .score {
    font-size: 1.35rem;
  }
  .tried {
    margin: 8px 0 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--good);
  }
  .tried-toggle {
    padding: 3px 12px 3px 3px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .tried-toggle:hover {
    border-color: var(--good);
  }
  .tried.todo {
    color: var(--muted);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .description {
    margin: 14px 0 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .action {
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .action.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .infos {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin: 16px 0 0;
    font-size: 0.92rem;
  }
  .infos dt {
    color: var(--muted);
  }
  .infos dd {
    margin: 0;
  }
  .pre {
    white-space: pre-line;
  }
  .recipes {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .review {
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }
  .review header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .review p {
    margin: 6px 0 4px;
  }
  .review small,
  .state {
    color: var(--muted);
  }
</style>
