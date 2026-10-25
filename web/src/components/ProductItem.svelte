<script lang="ts">
  import type { Product } from '../lib/types';
  import { icon, iconBadge } from '../lib/icons';
  import { euros } from '../lib/format';
  import { productHref, productSubtitle } from '../lib/products';
  import StockStepper from './StockStepper.svelte';

  /** A product as a card (with photo) or as a compact row; members get the stock stepper. */
  let {
    product = $bindable(),
    view = 'card',
    member = false,
    eager = false,
    active = false,
  }: { product: Product; view?: 'card' | 'list'; member?: boolean; eager?: boolean; active?: boolean } = $props();

  const fallbackIcon = $derived(product.category?.icon ?? (product.kind === 'wine' ? 'wine' : 'package'));
  const subtitle = $derived(productSubtitle(product));
  const out = $derived(member && product.quantity === 0);
</script>

<article class="wrap {view}" class:out>
  <a class="item" class:active href={productHref(product)}>
    <div class="cover">
      {#if product.cover}
        <img src={product.cover.sm} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />
      {:else}
        <span class="placeholder">{@html iconBadge(fallbackIcon, view === 'card' ? 56 : 30)}</span>
      {/if}
      {#if view === 'card' && product.category}
        <span class="category inline-icon">{@html iconBadge(product.category.icon, 20)}{product.category.name}</span>
      {/if}
    </div>
    <div class="content">
      <h2>{product.name}</h2>
      {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
      {#if view === 'card'}
        {#if product.description}<p class="description">{product.description}</p>{/if}
        {#if product.store || product.price_cents !== null}
          <p class="store">{[product.store, euros(product.price_cents)].filter(Boolean).join(' · ')}</p>
        {/if}
        {#if product.tags.length}
          <div class="tags">{#each product.tags.slice(0, 4) as tag}<span class="tag">#{tag}</span>{/each}</div>
        {/if}
      {/if}
    </div>
  </a>
  {#if member && product.quantity !== undefined}
    <div class="stock">
      <StockStepper id={product.id} name={product.name} bind:quantity={product.quantity} size={view === 'list' ? 'sm' : 'md'} />
    </div>
    <a
      class="edit"
      href={`/admin#/${product.kind === 'wine' ? 'cave' : 'produits'}/${product.id}`}
      title="Modifier"
      aria-label={`Modifier ${product.name}`}
      data-astro-prefetch="false">{@html icon('pencil', 14)}</a
    >
  {/if}
</article>

<style>
  .wrap {
    position: relative;
    display: flex;
    min-width: 0;
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line);
    text-decoration: none;
    transition:
      transform 0.18s,
      box-shadow 0.18s,
      opacity 0.18s;
  }
  .item:hover {
    box-shadow: var(--shadow);
  }
  .item.active {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  /* Out of stock (members only): still listed when showing everything, but greyed. */
  .out .item {
    opacity: 0.55;
    filter: grayscale(0.7);
  }
  .cover {
    position: relative;
    flex: none;
    background: var(--surface-2);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    display: grid;
    place-items: center;
    height: 100%;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .subtitle {
    font-weight: 600;
  }
  .description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .category {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 3px 10px 3px 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .edit {
    position: absolute;
    display: none;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    box-shadow: var(--shadow);
  }
  :global(html.member) .edit {
    display: grid;
  }

  /* Card: photo on top, stepper floating at the bottom of the photo. */
  .card .item {
    flex-direction: column;
    border-radius: var(--radius);
  }
  .card .item:hover {
    transform: translateY(-3px);
  }
  .card .cover {
    aspect-ratio: 4 / 3;
  }
  .card .content {
    padding: 12px 14px 14px;
    flex: 1;
  }
  /* Members: stepper at the bottom right of the card, edit button over the photo. */
  .card .stock {
    position: absolute;
    right: 12px;
    bottom: 12px;
  }
  .card:has(.stock) .content {
    padding-bottom: 60px;
  }
  .card .edit {
    top: 10px;
    right: 10px;
  }

  /* List: thumbnail, name, stepper on the right. */
  .list .item {
    align-items: center;
    gap: 12px;
    padding: 8px 140px 8px 8px;
    border-radius: 12px;
  }
  .list .cover {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    overflow: hidden;
  }
  .list h2 {
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .list .subtitle {
    font-size: 0.82rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .list .stock {
    position: absolute;
    right: 46px;
    top: 50%;
    transform: translateY(-50%);
  }
  .list .edit {
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
  }
  .list:not(:has(.stock)) .item {
    padding-right: 12px;
  }
</style>
