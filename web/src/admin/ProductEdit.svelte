<script lang="ts">
  import { onMount } from 'svelte';
  import type { Category, Photo, ProductDetail, User, WineType } from '../lib/types';
  import { api, navigate, notify } from './client.svelte';
  import { type Prefill, WINE_TYPE_LABELS, productHref } from '../lib/products';
  import PhotoManager from './PhotoManager.svelte';
  import TagInput from './TagInput.svelte';
  import ProductLookup from '../components/ProductLookup.svelte';
  import StockStepper from '../components/StockStepper.svelte';

  let { id, user, grapeminds = false }: { id: number; user: User; grapeminds?: boolean } = $props();

  let product = $state<ProductDetail | null>(null);
  let categories = $state<Category[]>([]);
  let photos = $state<Photo[]>([]);
  let quantity = $state(0);
  let form = $state({
    name: '',
    brand: '',
    description: '',
    category_id: null as number | null,
    tags: [] as string[],
    store: '',
    price: '',
    barcode: '',
    cover_image_id: null as string | null,
    wine_type: null as WineType | null,
    vintage: null as number | null,
    appellation: '',
    region: '',
    country: '',
    grape: '',
    abv: null as number | null,
    drink_from: null as number | null,
    drink_until: null as number | null,
    purchase_price: '',
    location: '',
    grapeminds_id: null as string | null,
  });
  /** Fields last filled by GrapeMinds, flagged in the form. */
  let imported = $state<string[]>([]);
  let saved = $state('');
  let saving = $state(false);
  let error = $state('');

  const wine = $derived(product?.kind === 'wine');
  const base = $derived(wine ? '/cave' : '/produits');
  const canEdit = $derived(product !== null && (user.role === 'admin' || product.author_id === user.id));
  const dirty = $derived(JSON.stringify(form) !== saved);

  const toEuros = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));
  function toCents(value: string) {
    const n = Number(value.replace(',', '.').replace(/[^\d.]/g, ''));
    return value.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  // An emptied number field binds to null or undefined depending on the browser.
  const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  function fill(p: ProductDetail) {
    product = p;
    quantity = p.quantity ?? 0;
    form = {
      name: p.name,
      brand: p.brand,
      description: p.description,
      category_id: p.category?.id ?? null,
      tags: p.tags,
      store: p.store,
      price: toEuros(p.price_cents),
      barcode: p.barcode ?? '',
      cover_image_id: p.cover && p.photos.some((ph) => ph.id === p.cover!.id) ? p.cover.id : null,
      wine_type: p.wine_type,
      vintage: p.vintage,
      appellation: p.appellation,
      region: p.region,
      country: p.country,
      grape: p.grape,
      abv: p.abv,
      drink_from: p.drink_from,
      drink_until: p.drink_until,
      purchase_price: toEuros(p.purchase_price_cents),
      location: p.location ?? '',
      grapeminds_id: p.grapeminds_id,
    };
    saved = JSON.stringify(form);
  }

  onMount(async () => {
    try {
      const [p, cats] = await Promise.all([api.get<ProductDetail>(`/products/${id}`), api.get<Category[]>('/categories')]);
      categories = cats;
      photos = p.photos;
      fill(p);
    } catch (e) {
      error = (e as Error).message;
    }
  });

  async function prefill(fields: Prefill) {
    const { image_url, ...rest } = fields;
    imported = rest.grapeminds_id ? Object.keys(rest).filter((k) => rest[k as keyof typeof rest]) : [];
    for (const [key, value] of Object.entries(rest)) {
      if (value === null || value === undefined || value === '' || !(key in form)) continue;
      (form as Record<string, unknown>)[key] = value;
    }
    if (image_url) {
      try {
        const p = await api.post<ProductDetail>(`/products/${id}/import-image`, { url: image_url });
        photos = p.photos;
        notify('Photo Open Food Facts ajoutée');
      } catch (e) {
        notify((e as Error).message, 'error');
      }
    }
  }

  async function save() {
    saving = true;
    try {
      const { price, purchase_price, barcode, ...rest } = form;
      fill(
        await api.patch<ProductDetail>(`/products/${id}`, {
          ...rest,
          vintage: num(rest.vintage),
          abv: num(rest.abv),
          drink_from: num(rest.drink_from),
          drink_until: num(rest.drink_until),
          barcode: barcode.trim() || null,
          price_cents: toCents(price),
          purchase_price_cents: toCents(purchase_price),
        }),
      );
      notify(wine ? 'Vin enregistré' : 'Produit enregistré');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!confirm(`Supprimer définitivement « ${form.name} » ?`)) return;
    await api.del(`/products/${id}`);
    notify('Supprimé');
    navigate(base);
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && canEdit) {
      e.preventDefault();
      if (dirty) save();
    }
  }
</script>

<svelte:window {onkeydown} onbeforeunload={(e) => dirty && e.preventDefault()} />

{#snippet gm(field: string)}
  {#if imported.includes(field)}<small class="gm">GrapeMinds</small>{/if}
{/snippet}

<a class="muted back" href={`#${base}`}>← {wine ? 'Cave' : 'Produits'}</a>

{#if error}
  <p class="error-text">{error}</p>
{:else if !product}
  <p class="muted">Chargement…</p>
{:else}
  <div class="edit-grid">
    <div>
      {#if canEdit}
        <section class="card">
          <h2>Préremplir</h2>
          <ProductLookup kind={product.kind} {grapeminds} onpick={prefill} />
        </section>
      {/if}

      <section class="card">
        {#if !canEdit}
          <h1>{product.name}</h1>
          <p>Ce {wine ? 'vin' : 'produit'} a été ajouté par <strong>{product.author}</strong> : tu peux ajuster le stock et ajouter des photos.</p>
        {:else}
          <label class="field"><span>Nom {@render gm('name')}</span><input bind:value={form.name} maxlength="160" required /></label>
          <label class="field">
            <span>{wine ? 'Producteur / domaine' : 'Marque'} {@render gm('brand')}</span>
            <input bind:value={form.brand} maxlength="160" />
          </label>
          <label class="field">
            <span>Pourquoi on le recommande</span>
            <textarea bind:value={form.description} rows="4" maxlength="5000"></textarea>
          </label>
          <div class="row">
            <label class="field"><span>Où l'acheter</span><input bind:value={form.store} maxlength="200" placeholder="Marché, Monoprix…" /></label>
            <label class="field"><span>Prix indicatif (€)</span><input bind:value={form.price} inputmode="decimal" placeholder="3,50" /></label>
            <label class="field"><span>Code-barres</span><input bind:value={form.barcode} inputmode="numeric" pattern={'\\d{6,14}'} /></label>
          </div>
        {/if}
      </section>

      {#if canEdit && wine}
        <section class="card">
          <h2>Le vin</h2>
          <div class="row">
            <label class="field">
              <span>Type {@render gm('wine_type')}</span>
              <select bind:value={form.wine_type}>
                <option value={null}>—</option>
                {#each Object.entries(WINE_TYPE_LABELS) as [value, label]}<option {value}>{label}</option>{/each}
              </select>
            </label>
            <label class="field"><span>Millésime</span><input type="number" min="1800" max="2200" bind:value={form.vintage} /></label>
            <label class="field"><span>Degré (%)</span><input type="number" min="0" max="100" step="0.1" bind:value={form.abv} /></label>
          </div>
          <div class="row">
            <label class="field"><span>Appellation</span><input bind:value={form.appellation} maxlength="160" /></label>
            <label class="field"><span>Région {@render gm('region')}</span><input bind:value={form.region} maxlength="160" /></label>
            <label class="field"><span>Pays {@render gm('country')}</span><input bind:value={form.country} maxlength="80" /></label>
          </div>
          <label class="field"><span>Cépages {@render gm('grape')}</span><input bind:value={form.grape} maxlength="200" placeholder="Syrah, Grenache" /></label>
          <div class="row">
            <label class="field"><span>À boire à partir de {@render gm('drink_from')}</span><input type="number" min="1800" max="2200" bind:value={form.drink_from} /></label>
            <label class="field"><span>Jusqu'en {@render gm('drink_until')}</span><input type="number" min="1800" max="2200" bind:value={form.drink_until} /></label>
          </div>
          <div class="row">
            <label class="field"><span>Prix d'achat (€, membres)</span><input bind:value={form.purchase_price} inputmode="decimal" /></label>
            <label class="field"><span>Emplacement (membres)</span><input bind:value={form.location} maxlength="160" placeholder="Casier B, 2e rangée" /></label>
          </div>
        </section>
      {/if}
    </div>

    <div>
      <section class="card stock">
        <span class="label">Stock de la maison</span>
        <StockStepper {id} name={product.name} bind:quantity />
      </section>
      {#if canEdit}
        <section class="card">
          <label class="field">
            <span>Catégorie</span>
            <select bind:value={form.category_id}>
              <option value={null}>—</option>
              {#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </select>
          </label>
          <div class="field"><span>Tags</span><TagInput kind={wine ? 'wine' : 'product'} bind:tags={form.tags} /></div>
        </section>
      {/if}
      <section class="card">
        <h2>Photos</h2>
        {#if canEdit}<p class="muted small">★ choisit la photo principale (sinon la première).</p>{/if}
        {#if canEdit}
          <PhotoManager kind="product" ownerId={id} {user} bind:photos bind:coverId={form.cover_image_id} />
        {:else}
          <PhotoManager kind="product" ownerId={id} {user} bind:photos />
        {/if}
      </section>
      {#if canEdit}<button class="btn danger" onclick={remove}>Supprimer</button>{/if}
    </div>
  </div>

  <div class="save-bar">
    <span class="status">{dirty ? 'Modifications non enregistrées · ⌘S' : 'Tout est enregistré'}</span>
    <a class="btn" href={productHref(product)} target="_blank">Voir</a>
    {#if canEdit}
      <button class="btn primary" onclick={save} disabled={saving || !dirty || !form.name.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
    {/if}
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
  .small {
    font-size: 0.85rem;
    margin: -6px 0 10px;
  }
  .stock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .gm {
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 700;
  }
</style>
