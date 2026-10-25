<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import type { ProductKind, ProductList } from '../lib/types';
  import { icon } from '../lib/icons';
  import { productHref } from '../lib/products';
  import { isMember, onMember } from '../lib/member';
  import ProductItem from './ProductItem.svelte';

  /**
   * Products or wines. Visitors see every recommendation (server-rendered, no stock).
   * Members reload with the stock: only what is in stock by default, everything with "Afficher tout" or a search.
   */
  let {
    kind,
    initial,
    tags,
    initialTag = null,
    grapeminds = false,
  }: { kind: ProductKind; initial: ProductList; tags: { tag: string; count: number }[]; initialTag?: string | null; grapeminds?: boolean } =
    $props();

  const LIMIT = 60;
  const VIEW_KEY = 'bc_products_view';
  let list = $state(initial);
  let query = $state('');
  let tag = $state<string | null>(initialTag);
  let loading = $state(false);
  let member = $state(false);
  let showAll = $state(false);
  let view = $state<'card' | 'list'>('card');
  let activeIndex = $state(-1);
  let QuickAdd = $state<Component<{ kind: ProductKind; grapeminds?: boolean; onadded: () => void }, { show: () => void }>>();
  let quickAdd = $state<{ show: () => void }>();
  let requestId = 0;

  const inStockOnly = $derived(member && !showAll && !query.trim());
  const noun = $derived(kind === 'wine' ? { one: 'vin', many: 'vins' } : { one: 'produit', many: 'produits' });

  async function load(append = false) {
    const id = ++requestId;
    loading = true;
    const params = new URLSearchParams({ kind, limit: String(LIMIT), offset: append ? String(list.items.length) : '0' });
    if (query.trim()) params.set('q', query.trim());
    if (tag) params.set('tag', tag);
    if (inStockOnly) params.set('in_stock', '1');
    try {
      const res = await fetch(`/api/products?${params}`);
      const data: ProductList = await res.json();
      if (id !== requestId) return;
      list = append ? { ...data, items: [...list.items, ...data.items] } : data;
    } finally {
      if (id === requestId) loading = false;
    }
    const url = new URL(location.href);
    query.trim() ? url.searchParams.set('q', query.trim()) : url.searchParams.delete('q');
    tag ? url.searchParams.set('tag', tag) : url.searchParams.delete('tag');
    history.replaceState(null, '', url);
  }

  function toggleTag(t: string | null) {
    tag = tag === t ? null : t;
    load();
  }

  function toggleAll() {
    showAll = !showAll;
    load();
  }

  function setView(v: 'card' | 'list') {
    view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  onMount(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'list') view = 'list';
    } catch {}
    const input = document.getElementById('site-search') as HTMLInputElement | null;
    query = input?.value ?? '';
    onMember(async () => {
      member = true;
      load();
      QuickAdd = (await import('./QuickAddProduct.svelte')).default;
    });
    if (!isMember() && query) load();

    let timer: ReturnType<typeof setTimeout>;
    const onInput = () => {
      clearTimeout(timer);
      activeIndex = -1;
      timer = setTimeout(() => {
        query = input!.value;
        load();
      }, 180);
    };
    const onKey = (e: KeyboardEvent) => {
      const count = list.items.length;
      if (!count) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = e.key === 'ArrowDown' ? (activeIndex + 1) % count : (activeIndex - 1 + count) % count;
        document.querySelectorAll('.products .wrap')[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'Enter') {
        const target = list.items[Math.max(activeIndex, 0)];
        if (target) location.href = productHref(target);
      }
    };
    input?.addEventListener('input', onInput);
    input?.addEventListener('keydown', onKey);
    return () => {
      input?.removeEventListener('input', onInput);
      input?.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="toolbar">
  <div class="chip-row" role="toolbar" aria-label="Filtrer">
    {#if member}
      <button class="chip" aria-pressed={showAll} onclick={toggleAll} title="Inclure ce qui n'est plus en stock">Afficher tout</button>
    {/if}
    {#if tags.length}
      {#each tags as t (t.tag)}
        <button class="chip" aria-pressed={tag === t.tag} onclick={() => toggleTag(t.tag)}>#{t.tag}</button>
      {/each}
    {/if}
  </div>
  {#if QuickAdd}
    <button class="add" onclick={() => quickAdd?.show()} aria-keyshortcuts="N Alt+N" title={`Ajouter un ${noun.one} (N)`}>
      {@html icon('plus', 16, 2.75)}<span>Ajouter un {noun.one}</span>
    </button>
  {/if}
  <div class="views" role="group" aria-label="Affichage">
    <button aria-pressed={view === 'card'} onclick={() => setView('card')} title="Cartes" aria-label="Afficher en cartes">{@html icon('grid', 17)}</button>
    <button aria-pressed={view === 'list'} onclick={() => setView('list')} title="Liste" aria-label="Afficher en liste">{@html icon('list', 17)}</button>
  </div>
</div>

{#if inStockOnly && list.total > 0}
  <p class="summary">{list.total} {list.total > 1 ? noun.many : noun.one} en stock</p>
{/if}

<div class="products {view}" class:loading aria-busy={loading}>
  {#each list.items as product, i (product.id)}
    <ProductItem bind:product={list.items[i]} {view} {member} eager={i < 4} active={i === activeIndex} />
  {:else}
    <div class="empty">
      {#if query || tag}
        <p>Aucun {noun.one} ne correspond.</p>
      {:else if inStockOnly}
        <p>Rien en stock pour le moment.</p>
        <button class="chip" onclick={toggleAll}>Afficher tous les {noun.many}</button>
      {:else}
        <p>Aucun {noun.one} pour le moment.</p>
      {/if}
      {#if QuickAdd && !query && !tag}
        <button class="chip" onclick={() => quickAdd?.show()}>Ajouter un {noun.one}</button>
      {/if}
    </div>
  {/each}
</div>

{#if list.items.length < list.total}
  <div class="more">
    <button onclick={() => load(true)} disabled={loading}>Voir plus</button>
  </div>
{/if}

{#if QuickAdd}
  <QuickAdd bind:this={quickAdd} {kind} {grapeminds} onadded={() => load()} />
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .chip-row {
    flex: 1;
    min-width: 0;
  }
  .chip-row .chip {
    box-shadow: none;
  }
  .add {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 16px 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    box-shadow: 0 4px 14px rgb(209 56 47 / 0.25);
  }
  .add:hover {
    filter: brightness(1.08);
  }
  /* Phones: a round "+" next to the view switch (the floating one stays bottom-left). */
  @media (max-width: 640px) {
    .add {
      width: 38px;
      padding: 0;
      justify-content: center;
    }
    .add span {
      display: none;
    }
  }
  .views {
    display: inline-flex;
    flex: none;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .views button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 30px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .views button[aria-pressed='true'] {
    background: var(--accent);
    color: #fff;
  }
  .summary {
    margin: -8px 0 14px;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .products {
    display: grid;
    gap: 20px;
    transition: opacity 0.15s;
  }
  .products.card {
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  }
  .products.list {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
    gap: 8px 16px;
  }
  .products.loading {
    opacity: 0.6;
  }
  .empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 0;
    color: var(--muted);
  }
  .empty p {
    margin: 0;
  }
  .more {
    display: flex;
    justify-content: center;
    margin-top: 28px;
  }
  .more button {
    padding: 10px 20px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    cursor: pointer;
  }
</style>
