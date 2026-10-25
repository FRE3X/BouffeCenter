<!-- Loaded on demand (members only): its styles travel with the JS, not with the page CSS. -->
<svelte:options css="injected" />

<script lang="ts">
  import type { Category, ProductKind } from '../lib/types';
  import { icon, iconBadge } from '../lib/icons';
  import { type Existing, type Prefill, changeStock, productHref } from '../lib/products';
  import ProductLookup from './ProductLookup.svelte';

  /** Members' "+" on the Produits and Cave pages: lookup or scan, name, category, stock. The rest is done in the admin. */
  let { kind, grapeminds = false, onadded }: { kind: ProductKind; grapeminds?: boolean; onadded: () => void } = $props();

  const label = $derived(kind === 'wine' ? 'un vin' : 'un produit');
  let open = $state(false);
  let categories = $state<Category[]>([]);
  let prefill = $state<Prefill>({});
  let name = $state('');
  let brand = $state('');
  let categoryId = $state<number | null>(null);
  let quantity = $state(1);
  let existing = $state<Existing | null>(null);
  let busy = $state(false);
  let error = $state('');

  /** Also called by the page's "Ajouter" button (bind:this). */
  export async function show() {
    prefill = {};
    name = '';
    brand = '';
    categoryId = null;
    quantity = 1;
    existing = null;
    error = '';
    open = true;
    if (!categories.length) categories = await fetch('/api/categories').then((r) => (r.ok ? r.json() : []));
  }

  function pick(fields: Prefill) {
    prefill = { ...prefill, ...fields };
    if (fields.name) name = fields.name;
    if (fields.brand) brand = fields.brand;
    existing = null;
  }

  // "N" (outside text fields) or ⌥N / Alt+N anywhere opens the form; Escape closes it.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) return (open = false);
    if (open || e.code !== 'KeyN' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (e.altKey || !typing) {
      e.preventDefault();
      show();
    }
  }

  async function addToExisting() {
    if (!existing) return;
    busy = true;
    changeStock(existing.id, quantity, () => {
      open = false;
      busy = false;
      onadded();
    }, () => {
      busy = false;
      error = 'Impossible de mettre à jour le stock.';
    });
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const { image_url, ...fields } = prefill;
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...fields, kind, name: name.trim(), brand: brand.trim(), category_id: categoryId, quantity }),
      });
      const product = await res.json();
      if (!res.ok) throw new Error(product.error ?? 'Impossible d’ajouter le produit');
      // The photo is a bonus: a failed import never blocks the creation.
      if (image_url) {
        await fetch(`/api/products/${product.id}/import-image`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: image_url }),
        }).catch(() => {});
      }
      open = false;
      onadded();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window {onkeydown} />

{#if !open}
  <button class="fab" onclick={show} aria-label={`Ajouter ${label}`} aria-keyshortcuts="N Alt+N" title={`Ajouter ${label} (N)`}>
    {@html icon('plus', 22, 2.75)}
  </button>
{:else}
  <form class="sheet" onsubmit={submit} aria-label={`Ajouter ${label}`}>
    <header>
      <h2>{kind === 'wine' ? 'Nouveau vin' : 'Nouveau produit'}</h2>
      <button type="button" class="close" aria-label="Fermer" onclick={() => (open = false)}>{@html icon('x', 16)}</button>
    </header>

    <ProductLookup {kind} {grapeminds} onpick={pick} onexisting={(p) => (existing = p)} />

    {#if existing}
      <div class="existing">
        <p>Ce produit est déjà enregistré. <a href={productHref(existing)}>Voir sa fiche</a></p>
        <div class="row">
          <label class="qty">Ajouter <input type="number" min="1" max="99" bind:value={quantity} /></label>
          <button type="button" class="submit" onclick={addToExisting} disabled={busy}>Ajouter au stock</button>
        </div>
      </div>
    {:else}
      {#if prefill.image_url}
        <img class="preview" src={prefill.image_url} alt="" />
      {/if}
      <label class="field">
        <span>Nom</span>
        <input bind:value={name} required maxlength="160" placeholder={kind === 'wine' ? 'Château…' : 'Yaourt nature'} />
      </label>
      <label class="field">
        <span>{kind === 'wine' ? 'Producteur / domaine' : 'Marque'}</span>
        <input bind:value={brand} maxlength="160" placeholder={kind === 'wine' ? 'Domaine…' : 'Danone'} />
      </label>

      {#if categories.length}
        <div class="field">
          <span>Catégorie</span>
          <div class="cats">
            {#each categories as c (c.id)}
              <button type="button" class="cat" aria-pressed={categoryId === c.id} title={c.name} onclick={() => (categoryId = categoryId === c.id ? null : c.id)}>
                {@html iconBadge(c.icon, 30)}<small>{c.name}</small>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="field">
        <span>En stock</span>
        <div class="stepper">
          <button type="button" onclick={() => (quantity = Math.max(0, quantity - 1))} aria-label="Moins">{@html icon('minus', 16, 2.5)}</button>
          <output>{quantity}</output>
          <button type="button" onclick={() => (quantity += 1)} aria-label="Plus">{@html icon('plus', 16, 2.5)}</button>
        </div>
      </div>

      {#if error}<p class="error">{error}</p>{/if}
      <button type="submit" class="submit" disabled={busy || !name.trim()}>{busy ? 'Ajout…' : 'Ajouter'}</button>
      <p class="hint">Photos, prix, magasin{kind === 'wine' ? ', millésime et emplacement' : ''} se complètent ensuite dans l'admin.</p>
    {/if}
  </form>
{/if}

<style>
  .fab {
    position: fixed;
    z-index: 20;
    left: max(14px, env(safe-area-inset-left));
    bottom: calc(24px + env(safe-area-inset-bottom));
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    box-shadow: 0 4px 14px rgb(209 56 47 / 0.35);
    cursor: pointer;
  }
  .fab:hover {
    filter: brightness(1.08);
  }
  .sheet {
    position: fixed;
    z-index: 45;
    left: 12px;
    bottom: 12px;
    width: min(420px, calc(100vw - 24px));
    max-height: calc(100dvh - var(--header-h) - 36px);
    overflow-y: auto;
    padding: 16px 18px 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: var(--shadow);
    animation: rise 0.2s ease-out;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @media (max-width: 640px) {
    .sheet {
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      border-radius: 20px 20px 0 0;
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 1.3rem;
  }
  .close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: var(--surface-2);
    cursor: pointer;
  }
  .preview {
    width: 72px;
    height: 72px;
    margin-bottom: 10px;
    border-radius: 10px;
    object-fit: contain;
    background: #fff;
    border: 1px solid var(--line);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .field > span {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 64px;
    padding: 6px 2px;
    border: 2px solid transparent;
    border-radius: 12px;
    background: none;
    cursor: pointer;
  }
  .cat small {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.68rem;
    color: var(--muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cat[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .stepper button {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
  .stepper output {
    min-width: 3ch;
    text-align: center;
    font-weight: 700;
  }
  .existing p {
    margin: 0 0 10px;
  }
  .existing a {
    color: var(--accent);
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .qty {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .qty input {
    width: 64px;
  }
  .error {
    color: var(--accent);
    font-size: 0.85rem;
  }
  .submit {
    width: 100%;
    padding: 12px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
  }
  .submit:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .hint {
    margin: 10px 0 0;
    font-size: 0.78rem;
    color: var(--muted);
    text-align: center;
  }
</style>
