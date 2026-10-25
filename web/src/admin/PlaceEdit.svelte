<script lang="ts">
  import { onMount } from 'svelte';
  import type { Category, Photo, PlaceDetail, Review, User } from '../lib/types';
  import { date, rating, ratingColor } from '../lib/format';
  import { triedBadge } from '../lib/icons';
  import { api, navigate, notify } from './client.svelte';
  import IconPicker from './IconPicker.svelte';
  import LocationPicker from './LocationPicker.svelte';
  import PhotoManager from './PhotoManager.svelte';
  import TagInput from './TagInput.svelte';

  let { id, user }: { id: number; user: User } = $props();

  let place = $state<PlaceDetail | null>(null);
  let categories = $state<Category[]>([]);
  let form = $state({
    name: '',
    category_id: null as number | null,
    lat: 0,
    lng: 0,
    address: '',
    city: '',
    price_level: null as number | null,
    tags: [] as string[],
    description: '',
    website: '',
    phone: '',
    instagram: '',
    hours: '',
    icon: null as string | null,
    tried: false,
    published: false,
  });
  let photos = $state<Photo[]>([]);
  let reviews = $state<Review[]>([]);
  let myRating = $state(7);
  let myComment = $state('');
  let hasMyReview = $state(false);
  let saved = $state('');
  let saving = $state(false);
  let error = $state('');

  const canEdit = $derived(place !== null && (user.role === 'admin' || place.author_id === user.id));
  const dirty = $derived(JSON.stringify(form) !== saved);

  function fill(p: PlaceDetail) {
    place = p;
    form = {
      name: p.name,
      category_id: p.category?.id ?? null,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      city: p.city,
      price_level: p.price_level,
      tags: p.tags,
      description: p.description,
      website: p.website,
      phone: p.phone,
      instagram: p.instagram,
      hours: p.hours,
      icon: p.icon,
      tried: p.tried,
      published: p.published,
    };
    saved = JSON.stringify(form);
  }

  onMount(async () => {
    try {
      const [p, cats] = await Promise.all([api.get<PlaceDetail>(`/places/${id}`), api.get<Category[]>('/categories')]);
      categories = cats;
      fill(p);
      photos = p.photos;
      reviews = p.reviews;
      const mine = p.reviews.find((r) => r.user_id === user.id);
      if (mine) {
        hasMyReview = true;
        myRating = mine.rating;
        myComment = mine.comment;
      }
    } catch (e) {
      error = (e as Error).message;
    }
  });

  async function save() {
    saving = true;
    try {
      const updated = await api.patch<PlaceDetail>(`/places/${id}`, form);
      fill({ ...place!, ...updated });
      notify('Adresse enregistrée');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      saving = false;
    }
  }

  async function saveReview() {
    try {
      await api.put(`/places/${id}/review`, { rating: myRating, comment: myComment });
      const p = await api.get<PlaceDetail>(`/places/${id}`);
      reviews = p.reviews;
      place!.rating = p.rating;
      hasMyReview = true;
      // The API marks a reviewed place as tried; mirror it without flagging the form as dirty.
      if (!form.tried) {
        const wasClean = !dirty;
        form.tried = true;
        if (wasClean) saved = JSON.stringify(form);
      }
      notify('Avis enregistré');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function deleteReview(review: Review) {
    if (!confirm(`Supprimer l'avis de ${review.author} ?`)) return;
    await api.del(`/places/${id}/review${review.user_id !== user.id ? `?user_id=${review.user_id}` : ''}`);
    reviews = reviews.filter((r) => r.id !== review.id);
    if (review.user_id === user.id) {
      hasMyReview = false;
      myComment = '';
    }
  }

  async function remove() {
    if (!confirm(`Supprimer définitivement « ${form.name} » et ses photos ?`)) return;
    await api.del(`/places/${id}`);
    notify('Adresse supprimée');
    navigate('/adresses');
  }

  function onpick(r: { name: string }) {
    if (r.name && (!form.name || form.name === 'Nouvelle adresse')) form.name = r.name;
  }
</script>

<svelte:window onbeforeunload={(e) => dirty && e.preventDefault()} />

<a class="muted back" href="#/adresses">← Adresses</a>

{#if error}
  <p class="error-text">{error}</p>
{:else if !place}
  <p class="muted">Chargement…</p>
{:else}
  <h1>{form.name || 'Sans nom'}</h1>
  {#if !canEdit}
    <p class="card notice">Cette adresse a été créée par <strong>{place.author}</strong> : tu peux y ajouter ton avis et tes photos.</p>
  {/if}

  <div class="edit-grid">
    <div>
      {#if canEdit}
        <section class="card">
          <label class="field"><span>Nom</span><input bind:value={form.name} required /></label>
          <div class="field">
            <span>Emplacement</span>
            <LocationPicker bind:lat={form.lat} bind:lng={form.lng} bind:address={form.address} bind:city={form.city} {onpick} />
          </div>
          <div class="row">
            <label class="field"><span>Adresse</span><input bind:value={form.address} /></label>
            <label class="field"><span>Ville</span><input bind:value={form.city} /></label>
          </div>
          <label class="field"><span>Description</span><textarea bind:value={form.description} rows="3"></textarea></label>
        </section>
      {/if}

      <section class="card">
        <h2>Photos</h2>
        <PhotoManager kind="place" ownerId={id} {user} bind:photos />
      </section>

      <section class="card">
        <h2>Mon avis</h2>
        <div class="my-rating" role="radiogroup" aria-label="Ma note sur 10">
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n}
            <button
              type="button"
              role="radio"
              class="rating-pick"
              aria-checked={Math.round(myRating) === n}
              aria-label={`${n} sur 10`}
              class:filled={n <= myRating}
              onclick={() => (myRating = n)}
            >
              {n}
            </button>
          {/each}
          <span class="pick-label">{rating(myRating)}<small>/10</small></span>
        </div>
        <label class="field"><span>Commentaire</span><textarea bind:value={myComment} rows="3" placeholder="Ce que tu as pris, ce que tu as aimé…"></textarea></label>
        <button class="btn primary" onclick={saveReview}>{hasMyReview ? 'Mettre à jour mon avis' : 'Publier mon avis'}</button>

        {#if reviews.some((r) => r.user_id !== user.id)}
          <h3>Avis des autres membres</h3>
          {#each reviews.filter((r) => r.user_id !== user.id) as r (r.id)}
            <div class="review">
              <span class="rating" style:background={ratingColor(r.rating)}>{rating(r.rating)}<small>/10</small></span>
              <div class="grow">
                <strong>{r.author}</strong> <small class="muted">{date(r.updated_at)}</small>
                {#if r.comment}<p>{r.comment}</p>{/if}
              </div>
              {#if user.role === 'admin'}<button class="btn small danger" onclick={() => deleteReview(r)}>Suppr.</button>{/if}
            </div>
          {/each}
        {/if}
      </section>
    </div>

    {#if canEdit}
      <div>
        <section class="card">
          <label class="switch"><input type="checkbox" bind:checked={form.published} /> Publiée sur la carte</label>
          <label class="tried" class:on={form.tried}>
            <input type="checkbox" class="visually-hidden" bind:checked={form.tried} />
            {@html triedBadge(form.tried, 24)}
            <span>{form.tried ? 'Déjà testé' : 'Pas encore testé'}</span>
          </label>
          <p class="muted small">Note moyenne : <strong>{rating(place.rating)}/10</strong> ({reviews.length} avis)</p>
        </section>
        <section class="card">
          <label class="field">
            <span>Catégorie</span>
            <select bind:value={form.category_id}>
              <option value={null}>—</option>
              {#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </select>
          </label>
          <div class="field">
            <span>Icône sur la carte</span>
            <IconPicker bind:value={form.icon} inherited={categories.find((c) => c.id === form.category_id)?.icon ?? 'utensils'} />
          </div>
          <div class="field">
            <span>Gamme de prix</span>
            <div class="prices">
              {#each [1, 2, 3, 4] as level}
                <button type="button" class="btn small" class:primary={form.price_level === level} onclick={() => (form.price_level = form.price_level === level ? null : level)}>
                  {'€'.repeat(level)}
                </button>
              {/each}
            </div>
          </div>
          <div class="field"><span>Tags</span><TagInput kind="place" bind:tags={form.tags} /></div>
        </section>
        <section class="card">
          <label class="field"><span>Site web</span><input bind:value={form.website} placeholder="https://…" /></label>
          <label class="field"><span>Téléphone</span><input bind:value={form.phone} type="tel" /></label>
          <label class="field"><span>Instagram</span><input bind:value={form.instagram} placeholder="@compte" /></label>
          <label class="field"><span>Horaires</span><textarea bind:value={form.hours} rows="3" placeholder="Mar–Sam 12h–14h30, 19h–22h30"></textarea></label>
        </section>
        <button class="btn danger" onclick={remove}>Supprimer l'adresse</button>
      </div>
    {/if}
  </div>

  {#if canEdit}
    <div class="save-bar">
      <span class="status">{dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'}</span>
      {#if form.published}<a class="btn" href={`/?lieu=${place.slug}`} target="_blank">Voir</a>{/if}
      <button class="btn primary" onclick={save} disabled={saving || !dirty}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
    </div>
  {/if}
{/if}

<style>
  .back {
    display: inline-block;
    margin-bottom: 10px;
    text-decoration: none;
  }
  h2 {
    margin: 0 0 14px;
    font-size: 1.2rem;
  }
  h3 {
    margin: 24px 0 8px;
    font-size: 1rem;
  }
  .notice {
    margin-bottom: 20px;
  }
  .small {
    font-size: 0.85rem;
    margin: 10px 0 0;
  }
  .my-rating {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 14px;
  }
  .rating-pick {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.1s,
      background 0.15s;
  }
  .rating-pick:hover {
    transform: scale(1.1);
    border-color: var(--accent);
  }
  /* Like every selection, the circles up to the chosen score are filled with the brand red. */
  .rating-pick.filled {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .rating-pick[aria-checked='true'] {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  .pick-label {
    margin-left: 8px;
    font-size: 1.4rem;
    font-weight: 700;
  }
  .pick-label small {
    font-size: 0.7em;
    color: var(--muted);
  }
  .tried {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    cursor: pointer;
    font-weight: 600;
    color: var(--muted);
  }
  .tried:focus-within {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 25%, transparent);
  }
  .tried.on {
    border-color: var(--good);
    color: var(--good);
  }
  .prices {
    display: flex;
    gap: 6px;
  }
  .review {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .review .grow {
    flex: 1;
  }
  .review p {
    margin: 4px 0 0;
  }
</style>
