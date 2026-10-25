<script lang="ts">
  import { onMount } from 'svelte';
  import type { Category, Ingredient, Photo, Place, Product, Recipe, User } from '../lib/types';
  import { api, navigate, notify } from './client.svelte';
  import BlockEditor from './BlockEditor.svelte';
  import IngredientsEditor from './IngredientsEditor.svelte';
  import PhotoManager from './PhotoManager.svelte';
  import TagInput from './TagInput.svelte';
  import ProductPicker from './ProductPicker.svelte';
  import { icon, iconBadge } from '../lib/icons';
  import { productSubtitle } from '../lib/products';

  let { id, user }: { id: number; user: User } = $props();

  let recipe = $state<Recipe | null>(null);
  let categories = $state<Category[]>([]);
  let places = $state<Place[]>([]);
  let form = $state({
    title: '',
    description: '',
    category_id: null as number | null,
    place_id: null as number | null,
    tags: [] as string[],
    ingredients: [] as Ingredient[],
    body: '',
    cover_image_id: null as string | null,
    published: false,
  });
  let photos = $state<Photo[]>([]);
  /** Recommended products and wine pairings: saved on their own, as soon as they change. */
  let linked = $state<Product[]>([]);
  let picking = $state(false);
  let saved = $state('');
  let saving = $state(false);
  let error = $state('');
  let focus = $state(false);

  const canEdit = $derived(recipe !== null && (user.role === 'admin' || recipe.author_id === user.id));
  const dirty = $derived(JSON.stringify(form) !== saved);

  function fill(r: Recipe) {
    recipe = r;
    form = {
      title: r.title,
      description: r.description,
      category_id: r.category?.id ?? null,
      place_id: r.place?.id ?? null,
      tags: r.tags,
      ingredients: r.ingredients,
      body: r.body,
      cover_image_id: r.cover && r.photos.some((p) => p.id === r.cover!.id) ? r.cover.id : null,
      published: r.published,
    };
    saved = JSON.stringify(form);
  }

  onMount(async () => {
    try {
      const [r, cats, pl] = await Promise.all([
        api.get<Recipe>(`/recipes/${id}`),
        api.get<Category[]>('/categories'),
        api.get<Place[]>('/places'),
      ]);
      categories = cats;
      places = pl.sort((a, b) => a.name.localeCompare(b.name));
      photos = r.photos;
      linked = r.products;
      fill(r);
    } catch (e) {
      error = (e as Error).message;
    }
  });

  async function save() {
    saving = true;
    try {
      fill(await api.patch<Recipe>(`/recipes/${id}`, form));
      notify('Recette enregistrée');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      saving = false;
    }
  }

  async function saveLinked(next: Product[]) {
    const previous = linked;
    linked = next;
    try {
      linked = (await api.put<{ products: Product[] }>(`/recipes/${id}/products`, { product_ids: next.map((p) => p.id) })).products;
    } catch (e) {
      linked = previous;
      notify((e as Error).message, 'error');
    }
  }

  async function remove() {
    if (!confirm(`Supprimer définitivement « ${form.title} » ?`)) return;
    await api.del(`/recipes/${id}`);
    notify('Recette supprimée');
    navigate('/recettes');
  }

  // Ctrl/Cmd+S saves.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && focus) focus = false;
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && canEdit) {
      e.preventDefault();
      if (dirty) save();
    }
  }
</script>

<svelte:window {onkeydown} onbeforeunload={(e) => dirty && e.preventDefault()} />

<a class="muted back" href="#/recettes">← Recettes</a>

{#if error}
  <p class="error-text">{error}</p>
{:else if !recipe}
  <p class="muted">Chargement…</p>
{:else if !canEdit}
  <h1>{recipe.title}</h1>
  <p class="card">Cette recette appartient à <strong>{recipe.author}</strong>. Tu peux y ajouter des photos.</p>
  <section class="card" style="margin-top:20px"><PhotoManager kind="recipe" ownerId={id} {user} bind:photos /></section>
{:else}
  <div class="edit-grid">
    <div>
      <section class="card">
        <input class="title" bind:value={form.title} placeholder="Titre de la recette" aria-label="Titre" />
        <textarea class="lead" bind:value={form.description} rows="2" placeholder="Une courte description pour la carte de la recette…" aria-label="Description"></textarea>
      </section>

      <section class="card preparation" class:focus>
        <header>
          <h2>Préparation</h2>
          <span class="muted hint">Tape « / » pour insérer un titre, des étapes, une photo…</span>
          <button type="button" class="btn small" onclick={() => (focus = !focus)}>{focus ? 'Quitter le plein écran' : 'Plein écran'}</button>
        </header>
        <div class="page">
          <BlockEditor bind:value={form.body} ownerId={id} />
        </div>
      </section>

      <section class="card ingredients">
        <h2>Ingrédients</h2>
        <IngredientsEditor bind:items={form.ingredients} />
      </section>

      <section class="card">
        <h2>Produits conseillés et accords</h2>
        <p class="muted small">Les produits recommandés pour cette recette, et les vins qui l'accompagnent. Enregistré aussitôt.</p>
        {#if linked.length}
          <ul class="linked">
            {#each linked as p, i (p.id)}
              <li>
                {#if p.cover}<img src={p.cover.sm} alt="" />{:else}<span class="ph">{@html iconBadge(p.category?.icon ?? (p.kind === 'wine' ? 'wine' : 'package'), 26)}</span>{/if}
                <span class="grow"><strong>{p.name}</strong>{#if productSubtitle(p)}<small> · {productSubtitle(p)}</small>{/if}</span>
                <span class="badge">{p.kind === 'wine' ? 'Accord' : 'Produit'}</span>
                <button type="button" class="btn small" disabled={i === 0} aria-label="Monter" onclick={() => saveLinked(linked.toSpliced(i - 1, 2, linked[i], linked[i - 1]))}>↑</button>
                <button type="button" class="btn small" aria-label={`Retirer ${p.name}`} onclick={() => saveLinked(linked.filter((x) => x.id !== p.id))}>{@html icon('x', 14)}</button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if picking}
          <ProductPicker exclude={linked.map((p) => p.id)} onpick={(p) => ((picking = false), saveLinked([...linked, p]))} onclose={() => (picking = false)} />
        {:else}
          <button type="button" class="btn small" onclick={() => (picking = true)}>+ Ajouter un produit ou un vin</button>
        {/if}
      </section>
    </div>

    <div>
      <section class="card">
        <label class="switch"><input type="checkbox" bind:checked={form.published} /> Publiée</label>
      </section>
      <section class="card">
        <label class="field">
          <span>Catégorie</span>
          <select bind:value={form.category_id}>
            <option value={null}>—</option>
            {#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </label>
        <div class="field"><span>Tags</span><TagInput kind="recipe" bind:tags={form.tags} /></div>
        <label class="field">
          <span>Inspirée d'une adresse</span>
          <select bind:value={form.place_id}>
            <option value={null}>—</option>
            {#each places as p (p.id)}<option value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>{/each}
          </select>
        </label>
      </section>
      <section class="card">
        <h2>Photos</h2>
        <p class="muted small">★ choisit la photo de couverture (sinon la première).</p>
        <PhotoManager kind="recipe" ownerId={id} {user} bind:photos bind:coverId={form.cover_image_id} />
      </section>
      <button class="btn danger" onclick={remove}>Supprimer la recette</button>
    </div>
  </div>

  <div class="save-bar">
    <span class="status">{dirty ? 'Modifications non enregistrées · ⌘S' : 'Tout est enregistré'}</span>
    {#if recipe.published}<a class="btn" href={`/recettes/${recipe.slug}`} target="_blank">Voir</a>{/if}
    <button class="btn primary" onclick={save} disabled={saving || !dirty}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
  </div>
{/if}

<style>
  .back {
    display: inline-block;
    margin-bottom: 10px;
    text-decoration: none;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.2rem;
  }
  .title {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
    font-family: var(--font-display);
    font-size: clamp(1.6rem, 4vw, 2.3rem);
    font-weight: 700;
  }
  .lead {
    margin-top: 8px;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
    min-height: 0 !important;
    color: var(--muted);
    font-size: 1.05rem;
  }
  .small {
    font-size: 0.85rem;
    margin: -6px 0 10px;
  }
  .linked {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }
  .linked li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .linked img,
  .linked .ph {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--surface-2);
  }
  .linked .grow {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .linked small {
    color: var(--muted);
  }
  .preparation {
    padding: 0;
  }
  .preparation header {
    position: sticky;
    top: calc(var(--header-h) + env(safe-area-inset-top));
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .preparation h2 {
    margin: 0;
  }
  .preparation .hint {
    flex: 1;
    font-size: 0.85rem;
  }
  /* A wide, tall writing surface, like a Notion page. */
  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 20px 20px 40px;
    font-size: 1.05rem;
  }
  .page :global(.block-editor) {
    min-height: 320px;
  }
  .page :global(.block-editor h2) {
    font-size: 1.5rem;
  }
  .page :global(.block-editor h3) {
    font-size: 1.2rem;
  }
  .preparation.focus {
    position: fixed;
    inset: 0;
    z-index: 70;
    margin: 0;
    border-radius: 0;
    overflow-y: auto;
  }
  .preparation.focus header {
    top: 0;
    border-radius: 0;
  }
  .preparation.focus .page {
    padding: 28px 24px 120px;
    font-size: 1.125rem;
  }
  .preparation.focus .page :global(.block-editor) {
    min-height: 70vh;
  }
  @media (max-width: 640px) {
    .page {
      padding: 16px 8px 40px;
      font-size: 1.05rem;
    }
  }
</style>
