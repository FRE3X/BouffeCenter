<script lang="ts">
  import { onMount } from 'svelte';
  import type { Product, ProductKind, ProductList } from '../lib/types';
  import { api, navigate, notify } from './client.svelte';
  import { iconBadge } from '../lib/icons';
  import { productSubtitle } from '../lib/products';
  import StockStepper from '../components/StockStepper.svelte';

  let { kind }: { kind: ProductKind } = $props();
  const wine = $derived(kind === 'wine');
  const base = $derived(wine ? '/cave' : '/produits');

  let products = $state<Product[] | null>(null);
  let q = $state('');
  let inStock = $state(false);
  let creating = $state(false);

  async function load() {
    const params = new URLSearchParams({ kind, limit: '200' });
    if (q.trim()) params.set('q', q.trim());
    if (inStock) params.set('in_stock', '1');
    products = (await api.get<ProductList>(`/products?${params}`)).items;
  }

  onMount(load);

  let timer: ReturnType<typeof setTimeout>;
  function onFilter() {
    clearTimeout(timer);
    timer = setTimeout(load, 200);
  }

  async function create() {
    creating = true;
    try {
      const product = await api.post<Product>('/products', { kind, name: wine ? 'Nouveau vin' : 'Nouveau produit' });
      navigate(`${base}/${product.id}`);
    } catch (e) {
      notify((e as Error).message, 'error');
      creating = false;
    }
  }
</script>

<div class="toolbar">
  <h1 style="margin:0">{wine ? 'Cave' : 'Produits'}</h1>
  <span class="spacer"></span>
  <button class="btn primary" onclick={create} disabled={creating}>+ {wine ? 'Nouveau vin' : 'Nouveau produit'}</button>
</div>
<div class="toolbar">
  <input type="search" placeholder="Rechercher…" bind:value={q} oninput={onFilter} style="max-width:320px" />
  <label class="switch"><input type="checkbox" bind:checked={inStock} onchange={load} /> En stock uniquement</label>
</div>

{#if !products}
  <p class="muted">Chargement…</p>
{:else}
  <div class="list">
    {#each products as p, i (p.id)}
      <div class="row-item">
        <a class="list-item" href={`#${base}/${p.id}`}>
          {#if p.cover}<img class="thumb" src={p.cover.sm} alt="" loading="lazy" />{:else}<span class="thumb">{@html iconBadge(p.category?.icon ?? (wine ? 'wine' : 'package'), 36)}</span>{/if}
          <span class="grow">
            <strong>{p.name}</strong>
            <small>{[productSubtitle(p), p.category?.name, p.tags.map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · ')}</small>
          </span>
        </a>
        <StockStepper id={p.id} name={p.name} bind:quantity={products[i].quantity} size="sm" />
      </div>
    {:else}
      <p class="muted">{wine ? 'Aucun vin.' : 'Aucun produit.'}</p>
    {/each}
  </div>
{/if}

<style>
  .row-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .row-item .list-item {
    flex: 1;
    min-width: 0;
  }
</style>
