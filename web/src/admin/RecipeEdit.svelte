<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Category, Ingredient, Photo, Place, Product, Recipe, User } from '../lib/types';
  import { api, navigate, notify } from './client.svelte';
  import BlockEditor from './BlockEditor.svelte';
  import IngredientsEditor from './IngredientsEditor.svelte';
  import PhotoManager from './PhotoManager.svelte';
  import TagInput from './TagInput.svelte';
  import ProductPicker from './ProductPicker.svelte';
  import { icon, iconBadge } from '../lib/icons';
  import { productSubtitle } from '../lib/products';

  let { id, user, ollama = false }: { id: number; user: User; ollama?: boolean } = $props();

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
  let titleInput = $state<HTMLInputElement>();
  // Category, tags, place: folded away on phones so the recipe itself comes first.
  let detailsOpen = $state(true);
  const recipeCategories = $derived(categories.filter((c) => c.applies_to !== 'places' || c.id === form.category_id));
  const detailsSummary = $derived(
    [categories.find((c) => c.id === form.category_id)?.name, ...form.tags.map((t) => `#${t}`)].filter(Boolean).join(' · '),
  );

  // ---- Draft with Ollama (optional): prefills the form, nothing is saved until "Enregistrer".
  type Draft = Pick<typeof form, 'title' | 'description' | 'ingredients' | 'body' | 'tags' | 'category_id'>;
  let prompt = $state('');
  let generating = $state(false);
  let elapsed = $state(0);
  let showAi = $state(false);
  // The block editor reads its content once: a new key rebuilds it with the generated steps.
  let editorKey = $state(0);
  const isEmpty = $derived(!form.body.trim() && form.ingredients.length === 0);

  async function generate() {
    if (!isEmpty && !confirm('Remplacer le titre, la description, les ingrédients, la préparation et les tags par la proposition de l\'IA ?')) return;
    generating = true;
    elapsed = 0;
    const timer = setInterval(() => elapsed++, 1000);
    try {
      const draft = await api.post<Draft>('/recipes/generate', { prompt });
      form = { ...form, ...draft, category_id: draft.category_id ?? form.category_id };
      editorKey++;
      showAi = false;
      notify('Recette proposée : relisez-la, puis enregistrez');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      clearInterval(timer);
      generating = false;
    }
  }

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
      detailsOpen = !matchMedia('(max-width: 900px)').matches;
      // A new recipe: start typing its name right away.
      if (!r.title) {
        await tick();
        titleInput?.focus();
      }
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

  /** Brouillon / Publiée lives next to the save button: picking one saves it. */
  async function setPublished(value: boolean) {
    if (value && !form.title.trim()) {
      notify('Donnez un titre à la recette avant de la publier', 'error');
      titleInput?.focus();
      return;
    }
    form.published = value;
    await save();
  }

  // Leaving a new recipe that was never filled in: delete it instead of leaving an empty draft behind.
  const untouched = () =>
    recipe !== null &&
    canEdit &&
    !recipe.published &&
    !dirty &&
    !form.title.trim() &&
    !form.description.trim() &&
    !form.body.trim() &&
    form.ingredients.length === 0 &&
    photos.length === 0 &&
    linked.length === 0;
  function dropIfUntouched() {
    if (untouched()) fetch(`/api/recipes/${id}`, { method: 'DELETE', keepalive: true, credentials: 'same-origin' }).catch(() => {});
  }
  onMount(() => {
    addEventListener('pagehide', dropIfUntouched);
    return () => {
      removeEventListener('pagehide', dropIfUntouched);
      dropIfUntouched();
    };
  });

  async function remove() {
    if (!confirm(`Supprimer définitivement « ${form.title || 'cette recette'} » ?`)) return;
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
<!-- "⋯" menus close on a tap outside or on Escape. -->
<svelte:document
  onpointerdown={(e) => document.querySelectorAll<HTMLDetailsElement>('details.more[open]').forEach((d) => !d.contains(e.target as Node) && (d.open = false))}
  onkeydown={(e) => e.key === 'Escape' && document.querySelectorAll<HTMLDetailsElement>('details.more[open]').forEach((d) => (d.open = false))}
/>


<div class="topline">
  <a class="muted back" href="#/recettes">{@html icon('chevron-left', 16)} Recettes</a>
  {#if recipe && canEdit}
    <details class="more">
      <summary aria-label="Plus d'actions">{@html icon('more', 20)}</summary>
      <div class="menu">
        {#if recipe.published}<a href={`/recettes/${recipe.slug}`} target="_blank">Voir la recette sur le site</a>{/if}
        {#if ollama && !isEmpty && !showAi}
          <button type="button" onclick={(e) => ((e.currentTarget.closest('details')!.open = false), (showAi = true))}>Proposer avec l'IA</button>
        {/if}
        <button type="button" class="danger" onclick={remove}>{@html icon('trash', 16)} Supprimer la recette</button>
      </div>
    </details>
  {/if}
</div>

{#if error}
  <p class="error-text">{error}</p>
{:else if !recipe}
  <p class="muted">Chargement…</p>
{:else if !canEdit}
  <h1>{recipe.title}</h1>
  <p class="card">Cette recette appartient à <strong>{recipe.author}</strong>. Tu peux y ajouter des photos.</p>
  <section class="card" style="margin-top:20px"><PhotoManager kind="recipe" ownerId={id} {user} bind:photos /></section>
{:else}
  <!-- Desktop: two columns. Phones: one column in cooking order (see .s-* orders below). -->
  <div class="edit-grid recipe-grid">
    <div>
      {#if ollama && (isEmpty || showAi)}
        <section class="card ai s-ai">
          <h2>{@html icon('chef-hat', 18)} Proposer une recette</h2>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <textarea
              bind:value={prompt}
              rows="3"
              placeholder="Ex. : un bœuf bourguignon pour 6, sans champignons, à préparer la veille"
              aria-label="Décrivez la recette"
              disabled={generating}
              onkeydown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim().length >= 3 && !generating && generate()}
            ></textarea>
            <div class="ai-actions">
              <span class="muted small-hint">
                {generating ? `Ollama rédige la recette… ${elapsed} s` : 'Titre, ingrédients, étapes et tags seront préremplis. Rien n\'est enregistré avant votre relecture.'}
              </span>
              {#if showAi && !isEmpty}<button type="button" class="btn small" disabled={generating} onclick={() => (showAi = false)}>Annuler</button>{/if}
              <button class="btn primary" disabled={generating || prompt.trim().length < 3}>{generating ? 'Génération…' : 'Générer'}</button>
            </div>
          </form>
        </section>
      {/if}
      <section class="card s-title">
        <input class="title" bind:this={titleInput} bind:value={form.title} placeholder="Titre de la recette" aria-label="Titre de la recette" enterkeyhint="next" />
        <textarea class="lead" bind:value={form.description} rows="2" placeholder="Une courte description pour la carte de la recette…" aria-label="Description"></textarea>
      </section>

      <section class="card ingredients s-ingredients">
        <h2>Ingrédients</h2>
        <IngredientsEditor bind:items={form.ingredients} />
      </section>

      <section class="card preparation s-prep" class:focus>
        <header>
          <h2>Préparation</h2>
          <span class="muted hint">Les boutons ci-dessous insèrent étapes, titres, photos et astuces ; « / » en propose d'autres.</span>
          <button
            type="button"
            class="icon-btn"
            aria-label={focus ? 'Quitter le plein écran' : 'Écrire en plein écran'}
            title={focus ? 'Quitter le plein écran' : 'Écrire en plein écran'}
            onclick={() => (focus = !focus)}
          >{@html icon(focus ? 'minimize' : 'maximize', 18)}</button>
        </header>
        <div class="page">
          {#key editorKey}<BlockEditor bind:value={form.body} ownerId={id} startWithSteps={!form.body.trim()} />{/key}
        </div>
      </section>

      <section class="card s-products">
        <h2>Produits conseillés et accords</h2>
        <p class="muted small">Les produits recommandés pour cette recette, et les vins qui l'accompagnent. Enregistré aussitôt.</p>
        {#if linked.length}
          <ul class="linked">
            {#each linked as p, i (p.id)}
              <li>
                {#if p.cover}<img src={p.cover.sm} alt="" />{:else}<span class="ph">{@html iconBadge(p.category?.icon ?? (p.kind === 'wine' ? 'wine' : 'package'), 26)}</span>{/if}
                <span class="grow"><strong>{p.name}</strong>{#if productSubtitle(p)}<small> · {productSubtitle(p)}</small>{/if}</span>
                <span class="badge">{p.kind === 'wine' ? 'Accord' : 'Produit'}</span>
                <button type="button" class="icon-btn" disabled={i === 0} aria-label={`Monter ${p.name}`} onclick={() => saveLinked(linked.toSpliced(i - 1, 2, linked[i], linked[i - 1]))}>{@html icon('arrow-up', 16)}</button>
                <button type="button" class="icon-btn" aria-label={`Retirer ${p.name}`} onclick={() => saveLinked(linked.filter((x) => x.id !== p.id))}>{@html icon('x', 16)}</button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if picking}
          <ProductPicker exclude={linked.map((p) => p.id)} onpick={(p) => ((picking = false), saveLinked([...linked, p]))} onclose={() => (picking = false)} />
        {:else}
          <button type="button" class="btn tall" onclick={() => (picking = true)}>{@html icon('plus', 16)} Ajouter un produit ou un vin</button>
        {/if}
      </section>
    </div>

    <div>
      <section class="card s-photos">
        <h2>Photos</h2>
        <p class="muted small">L'étoile choisit la photo de couverture (sinon la première).</p>
        <PhotoManager kind="recipe" ownerId={id} {user} bind:photos bind:coverId={form.cover_image_id} />
      </section>
      <details class="card details s-details" bind:open={detailsOpen}>
        <summary>
          <h2>Détails</h2>
          <span class="muted">{detailsSummary || 'Catégorie, tags, adresse'}</span>
        </summary>
        <label class="field">
          <span>Catégorie</span>
          <select bind:value={form.category_id}>
            <option value={null}>—</option>
            {#each recipeCategories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </label>
        <div class="field"><span id="tags-label">Tags</span><TagInput kind="recipe" bind:tags={form.tags} /></div>
        <label class="field">
          <span>Inspirée d'une adresse</span>
          <select bind:value={form.place_id}>
            <option value={null}>—</option>
            {#each places as p (p.id)}<option value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>{/each}
          </select>
        </label>
      </details>
    </div>
  </div>

  <div class="save-bar" class:above={focus}>
    <span class="status">{dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'}<span class="kbd"> · ⌘S</span></span>
    <div class="publish" role="radiogroup" aria-label="Visibilité de la recette">
      <button type="button" role="radio" aria-checked={!form.published} disabled={saving} onclick={() => form.published && setPublished(false)}>Brouillon</button>
      <button type="button" role="radio" aria-checked={form.published} disabled={saving} onclick={() => !form.published && setPublished(true)}>Publiée</button>
    </div>
    <button class="btn primary" onclick={save} disabled={saving || !dirty}>{saving ? 'Enregistrement…' : dirty ? 'Enregistrer' : 'Enregistré'}</button>
  </div>
{/if}

<style>
  .ai {
    border: 1.5px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  }
  .ai h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ai h2 :global(svg) {
    color: var(--accent);
  }
  .ai textarea {
    width: 100%;
    resize: vertical;
  }
  .ai-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .small-hint {
    flex: 1;
    font-size: 0.85rem;
  }
  .topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding-right: 12px;
    text-decoration: none;
  }
  .more {
    position: relative;
  }
  .more summary {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    list-style: none;
    cursor: pointer;
  }
  .more summary::-webkit-details-marker {
    display: none;
  }
  .more[open] summary,
  .more summary:hover {
    background: var(--surface-2);
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 40;
    display: flex;
    flex-direction: column;
    min-width: 240px;
    padding: 6px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
  }
  .menu a,
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .menu a:hover,
  .menu button:hover {
    background: var(--surface-2);
  }
  .menu .danger {
    color: var(--meh);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .tall {
    min-height: 44px;
  }
  /* Collapsible details: open by default on desktop (set in onMount). */
  .details summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: -4px 0;
    padding: 4px 0;
    list-style: none;
    cursor: pointer;
  }
  .details summary::-webkit-details-marker {
    display: none;
  }
  .details summary h2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
  }
  .details summary h2::after {
    content: '';
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted);
    transform: rotate(45deg);
    transition: transform 0.2s;
  }
  .details[open] summary h2::after {
    transform: rotate(-135deg);
  }
  .details summary span {
    font-size: 0.85rem;
  }
  .details[open] summary {
    margin-bottom: 14px;
  }
  /* Phones: one column, in cooking order. */
  @media (max-width: 900px) {
    .recipe-grid > div {
      display: contents;
    }
    .recipe-grid {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
    }
    /* Flex items default to their content width: let wide rows (block buttons) scroll instead of widening the page. */
    .recipe-grid section,
    .recipe-grid details {
      min-width: 0;
    }
    .s-ai { order: 0; }
    .s-title { order: 1; }
    .s-photos { order: 2; }
    .s-ingredients { order: 3; }
    .s-prep { order: 4; }
    .s-details { order: 5; }
    .s-products { order: 6; }
  }
  /* Save bar: Brouillon / Publiée next to the save button. */
  .publish {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .publish button {
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .publish button[aria-checked='true'] {
    background: var(--ink);
    color: var(--bg);
  }
  .publish button[aria-checked='true']:last-child {
    background: var(--good);
    color: #fff;
  }
  .save-bar.above {
    z-index: 80;
  }
  /* Nothing to save: a quiet state, not a faded red button that looks broken. */
  .save-bar .btn.primary:disabled {
    background: transparent;
    border-color: var(--line);
    color: var(--muted);
    opacity: 1;
  }
  @media (pointer: coarse) {
    .kbd {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .save-bar .status {
      display: none;
    }
    .save-bar {
      justify-content: space-between;
    }
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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 10px 12px 10px 20px;
    border-bottom: 1px solid var(--line);
  }
  .preparation h2 {
    margin: 0;
  }
  .preparation h2 {
    flex: 1;
  }
  .preparation .hint {
    order: 3;
    flex-basis: 100%;
    font-size: 0.85rem;
  }
  /* Phones: the block buttons speak for themselves. */
  @media (max-width: 640px) {
    .preparation .hint {
      display: none;
    }
  }
  /* A wide, tall writing surface, like a Notion page. */
  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 20px 40px;
    font-size: 1.05rem;
  }
  .page :global(.block-editor) {
    min-height: 320px;
  }
  .page :global(.blocks) {
    margin-bottom: 12px;
    padding-left: 0;
    padding-right: 0;
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
    position: sticky;
    top: 0;
    z-index: 7;
    background: var(--surface);
    padding-top: calc(10px + env(safe-area-inset-top));
  }
  .preparation.focus {
    --editor-toolbar-top: calc(65px + env(safe-area-inset-top));
  }
  .preparation.focus .page {
    padding: 0 24px 120px;
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
